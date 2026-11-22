import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceStore, filterAssets, trashEntries, WORKSPACE_KEY } from '../src/workspace-store.js';

class MemoryStorage {
  constructor(data) { this.raw = data == null ? null : JSON.stringify(data); this.failure = null; }
  getItem() { return this.raw; }
  setItem(key, value) {
    if (this.failure === 'before') throw new Error('Quota excedida');
    this.raw = value;
    if (this.failure === 'after') throw new Error('Processo interrompido após escrita');
  }
}
const folder = (id, parent = null, name = id) => ({ id, parent, name });
const asset = (id, parent = null, extra = {}) => ({ id, folder: parent, nome: id, caminho: 'D:/externo/shared.fbx', formato: '.fbx', categoria: 'Personagem', tags: ['rigged'], ...extra });
const ref = (id, type = 'asset') => ({ id, type });
function setup(data = { folders: [], assets: [] }, storage = new MemoryStorage(data)) {
  let id = 0;
  const options = { storage, uuid: () => `uuid-${++id}`, now: () => '2026-11-14T18:00:00.000Z' };
  return { storage, options, store: createWorkspaceStore(options) };
}
test('migra IDs legados sem duplicar registros ou perder preferências', () => {
  const { store, storage, options } = setup({ folders: [folder('p')], assets: [{ nome: 'Legado', caminho: 'C:/x' }], layout: 'layout-top', custom: 42 });
  const id = store.snapshot().assets[0].id;
  store.transact(s => { s.effectsEnabled = false; });
  const reopened = createWorkspaceStore({ ...options, storage }).snapshot();
  assert.equal(reopened.assets.length, 1); assert.equal(reopened.assets[0].id, id);
  assert.equal(reopened.layout, 'layout-top'); assert.equal(reopened.custom, 42);
});
test('lixeira de um asset persiste entre instâncias; outro registro do mesmo caminho permanece ativo', () => {
  const { store, storage, options } = setup({ folders: [], assets: [asset('a'), asset('b')] });
  store.moveToTrash([ref('a')]);
  const reopened = createWorkspaceStore({ ...options, storage });
  assert.deepEqual(filterAssets(reopened.snapshot()).map(a => a.id), ['b']);
  assert.equal(reopened.snapshot().assets[0].deleted.originalLocation, 'Convés');
  reopened.restore([ref('a')]); assert.equal(filterAssets(reopened.snapshot()).length, 2);
  assert.equal(reopened.snapshot().assets[1].caminho, 'D:/externo/shared.fbx');
});
test('pasta aninhada é excluída e restaurada em um único lote preservando IDs e vínculos', () => {
  const { store } = setup({ folders: [folder('p'), folder('c', 'p'), folder('n', 'c')], assets: [asset('a', 'n'), asset('b')] });
  store.moveToTrash([ref('p', 'folder')]);
  let s = store.snapshot(); assert.equal(s.folders.filter(f => f.deleted).length, 3);
  assert.equal(s.assets.filter(a => a.deleted).length, 1); assert.equal(trashEntries(s).length, 1);
  store.restore([ref('p', 'folder')]); s = store.snapshot();
  assert.equal(s.folders[2].parent, 'c'); assert.equal(s.assets[0].folder, 'n');
  assert.ok(s.folders.every(f => !f.deleted));
});
test('restaurar pasta não revive asset excluído em um lote anterior', () => {
  const { store } = setup({ folders: [folder('p')], assets: [asset('a', 'p'), asset('b', 'p')] });
  store.moveToTrash([ref('a')]); store.moveToTrash([ref('p', 'folder')]);
  assert.equal(trashEntries(store.snapshot()).length, 2);
  store.restore([ref('p', 'folder')]);
  assert.ok(store.snapshot().assets[0].deleted); assert.ok(!store.snapshot().assets[1].deleted);
});
test('restauração múltipla resolve nomes sem sobrescrever e não duplica itens selecionados em conjunto', () => {
  const { store } = setup({ folders: [folder('p', null, 'Projeto')], assets: [asset('a', 'p')] });
  store.moveToTrash([ref('p', 'folder')]);
  store.transact(s => s.folders.push(folder('other', null, 'Projeto')));
  const result = store.restore([ref('p', 'folder'), ref('a')]);
  const s = store.snapshot(); assert.equal(result.renamed.length, 1);
  assert.equal(s.folders[0].name, 'Projeto (restaurado 1)');
  assert.equal(s.assets.length, 1); assert.equal(s.assets[0].folder, 'p'); assert.equal(s.folders[1].name, 'Projeto');
});
test('asset restaurado com destino ausente volta para a raiz', () => {
  const a = asset('a', 'missing');
  a.deleted = { id: 'a', type: 'asset', at: '2026-11-14T18:00:00.000Z', batchId: 'batch', originalParent: 'missing', originalLocation: 'Convés / Antiga' };
  const { store } = setup({ folders: [], assets: [a] });
  const result = store.restore([ref('a')]);
  assert.equal(store.snapshot().assets[0].folder, null); assert.deepEqual(result.relocated, ['a']);
});
test('restauração independente de asset dentro de pasta ainda na lixeira usa destino seguro', () => {
  const { store } = setup({ folders: [folder('p')], assets: [asset('a', 'p')] });
  store.moveToTrash([ref('p', 'folder')]); store.restore([ref('a')]);
  assert.equal(store.snapshot().assets[0].folder, null); assert.ok(store.snapshot().folders[0].deleted);
  store.purge([ref('p', 'folder')]); assert.equal(store.snapshot().assets.length, 1);
});
test('exclusão permanente só aceita lixeira e remove descendentes inclusive lotes anteriores', () => {
  const { store } = setup({ folders: [folder('p'), folder('c', 'p')], assets: [asset('a', 'c'), asset('shared')] });
  assert.throws(() => store.purge([ref('shared')]), /ativo/);
  store.moveToTrash([ref('a')]); store.moveToTrash([ref('p', 'folder')]);
  assert.equal(store.purge([ref('p', 'folder')]), 3);
  const s = store.snapshot(); assert.equal(s.folders.length, 0); assert.equal(s.assets.length, 1);
  assert.equal(s.assets[0].id, 'shared'); assert.equal(s.assets[0].caminho, 'D:/externo/shared.fbx');
});
test('planejamento e cancelamento antes da confirmação não alteram a persistência', () => {
  const { store, storage } = setup({ folders: [folder('p')], assets: [asset('a', 'p')] });
  const before = storage.raw;
  assert.equal(store.plan([ref('p', 'folder')]).length, 2);
  assert.equal(storage.raw, before); assert.ok(!store.snapshot().assets[0].deleted);
});
test('falha de gravação mantém exatamente o estado anterior, inclusive a hierarquia', () => {
  const { store, storage } = setup({ folders: [folder('p'), folder('c', 'p')], assets: [asset('a', 'c')] });
  const before = store.snapshot(), raw = storage.raw; storage.failure = 'before';
  assert.throws(() => store.moveToTrash([ref('p', 'folder')]), /Quota/);
  assert.deepEqual(store.snapshot(), before); assert.equal(storage.raw, raw);
  assert.throws(() => store.transact(s => s.assets.push(asset('b'))), /Quota/);
  assert.deepEqual(store.snapshot(), before);
});
test('interrupção após escrita atômica é recuperada integralmente na próxima sessão', () => {
  const { store, storage, options } = setup({ folders: [folder('p')], assets: [asset('a', 'p')] });
  storage.failure = 'after'; assert.throws(() => store.moveToTrash([ref('p', 'folder')]));
  storage.failure = null;
  const recovered = createWorkspaceStore(options).snapshot();
  assert.ok(recovered.folders[0].deleted); assert.ok(recovered.assets[0].deleted);
  assert.throws(() => store.transact(s => { s.layout = 'layout-top'; }), /outra janela/);
});
test('dados corrompidos ou IDs duplicados bloqueiam gravação sem sobrescrever o original', () => {
  for (const raw of ['{quebrado', JSON.stringify({ folders: [folder('p'), folder('p')], assets: [] })]) {
    const storage = new MemoryStorage(); storage.raw = raw;
    const store = createWorkspaceStore({ storage }); assert.ok(store.readError);
    assert.throws(() => store.transact(s => { s.assets = []; }), /bloqueada/);
    assert.equal(storage.raw, raw);
  }
});
test('mudanças concorrentes de outra janela não são sobrescritas', () => {
  const { store, storage } = setup(); storage.raw = JSON.stringify({ folders: [], assets: [asset('externo')] });
  assert.throws(() => store.transact(s => s.assets.push(asset('local'))), /outra janela/);
  assert.equal(JSON.parse(storage.raw).assets[0].id, 'externo');
});
test('filtros e ordenação da biblioteca global consultam só os registros ativos', () => {
  const { store } = setup({ folders: [folder('p')], assets: [asset('a', 'p', { nome: 'Zeta', tags: ['modular'] }), asset('b', null, { nome: 'Alpha', formato: '.png', categoria: 'Textura' }), asset('c')] });
  store.moveToTrash([ref('c')]); const s = store.snapshot();
  assert.deepEqual(filterAssets(s).map(a => a.id), ['b', 'a']);
  assert.deepEqual(filterAssets(s, { category: 'Personagem', extension: '.fbx', tag: 'modular', folder: 'p', query: 'zeta' }).map(a => a.id), ['a']);
  assert.deepEqual(filterAssets(s, { folder: '__root__' }).map(a => a.id), ['b']);
  assert.equal(filterAssets(s, { sort: 'name-desc' })[0].id, 'a');
});
test('validar um lote não permite transação com ciclo ou colisão de IDs', () => {
  const { store, storage } = setup({ folders: [folder('p'), folder('c', 'p')], assets: [] });
  const raw = storage.raw;
  assert.throws(() => store.transact(s => { s.folders[0].parent = 'c'; }), /ciclo/);
  assert.throws(() => store.transact(s => s.assets.push(asset('a'), asset('a'))), /IDs/);
  assert.equal(storage.raw, raw);
});
test('falhas ao restaurar e excluir permanentemente mantêm os registros na lixeira', () => {
  const { store, storage } = setup({ folders: [folder('p')], assets: [asset('a', 'p')] });
  store.moveToTrash([ref('p', 'folder')]);
  const before = store.snapshot(), raw = storage.raw; storage.failure = 'before';
  assert.throws(() => store.restore([ref('p', 'folder')]), /Quota/);
  assert.throws(() => store.purge([ref('p', 'folder')]), /Quota/);
  assert.deepEqual(store.snapshot(), before); assert.equal(storage.raw, raw);
});
test('esvaziar todos os lotes da lixeira conserva assets e pastas ativos', () => {
  const { store } = setup({ folders: [folder('p'), folder('ativa')], assets: [asset('a', 'p'), asset('b'), asset('ativo', 'ativa')] });
  store.moveToTrash([ref('p', 'folder')]); store.moveToTrash([ref('b')]);
  const all = trashEntries(store.snapshot()).map(i => ({ type: i.type, id: i.id }));
  assert.equal(store.purge(all), 3);
  assert.deepEqual(store.snapshot().folders.map(f => f.id), ['ativa']);
  assert.deepEqual(store.snapshot().assets.map(a => a.id), ['ativo']);
});
