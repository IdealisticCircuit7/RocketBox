import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreferencesService, DEFAULT_PREFERENCES, PREFERENCES_KEY, parsePreferences, serializePreferences, normalizeAssetPath } from '../src/preferences.ts';

function setup(initial = {}, legacy = {}) {
  const data = new Map(Object.entries(initial));
  const storage = { fail: false, getItem: key => data.get(key) ?? null,
    setItem(key, value) { if (this.fail) throw new Error('Quota'); data.set(key, value); },
  };
  return { data, storage, service: createPreferencesService({ storage, legacy }) };
}
test('migra layout e movimento sem copiar ou alterar os dados da biblioteca', () => {
  const library = JSON.stringify({ folders:[{id:'p',name:'Modelos'}], assets:[{id:'a',caminho:'privado'}],layout:'layout-top',effectsEnabled:false });
  const {data,service} = setup({library},JSON.parse(library));
  assert.equal(service.snapshot().layout,'layout-top'); assert.equal(service.snapshot().animations,false);
  service.set('density','compact');
  assert.equal(data.get('library'),library);
  const exported=service.export(); assert.ok(!exported.includes('privado')); assert.ok(!exported.includes('folders'));
});
test('gravação publica um snapshot validado e persiste após reabrir o serviço', () => {
  const {storage,service}=setup(); let emitted;
  service.subscribe((p,changed)=>{ emitted={p,changed}; });
  service.set('layout','layout-top');
  assert.deepEqual(emitted.changed,['layout']); assert.equal(emitted.p.layout,'layout-top');
  assert.equal(createPreferencesService({storage}).snapshot().layout,'layout-top');
  const copy=service.snapshot(); copy.layout='layout-left'; assert.equal(service.snapshot().layout,'layout-top');
});
test('falha de escrita não muda controles reativos nem estado persistido', () => {
  const {storage,service,data}=setup(); service.set('overlay',50); const raw=data.get(PREFERENCES_KEY),before=service.snapshot();
  let calls=0; service.subscribe(()=>calls++); storage.fail=true;
  assert.throws(()=>service.set('layout','layout-top'),/Quota/);
  assert.deepEqual(service.snapshot(),before); assert.equal(data.get(PREFERENCES_KEY),raw); assert.equal(calls,0);
});
test('validação rejeita valores inválidos e campos desconhecidos antes de gravar', () => {
  const {service,data}=setup();
  for (const patch of [{overlay:100},{glow:NaN},{animations:'sim'},{layout:'bottom'},{apiKey:'segredo'},{defaultFolder:'a\nb'}]) assert.throws(()=>service.update(patch),/inválid/);
  assert.equal(data.size,0);
});
test('troca de tema preserva navegação e ajustes manuais ativam Personalizado', () => {
  const {service}=setup(); service.set('layout','layout-top'); service.setTheme('performance');
  assert.equal(service.snapshot().performance,true); assert.equal(service.snapshot().animations,false); assert.equal(service.snapshot().layout,'layout-top');
  service.setTheme('cinematic'); service.set('overlay',48);
  assert.equal(service.snapshot().theme,'custom'); assert.equal(service.snapshot().parallax,true); assert.equal(service.snapshot().performance,false);
});
test('exportação e importação versionadas preservam apenas preferências permitidas', () => {
  const {service}=setup(); service.update({initialCategory:'Cenário',duplicateMode:'block',assetView:'list'});
  const raw=service.export(),parsed=parsePreferences(raw); const other=setup(); other.service.import(raw);
  assert.deepEqual(other.service.snapshot(),parsed); assert.equal(parsed.duplicateMode,'block');
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(),['exportedAt','format','preferences','schemaVersion']);
});
test('JSON malformado, credenciais, versões futuras e arquivos incompletos são recusados sem escrita', () => {
  const {service,data}=setup(); const raw=JSON.parse(service.export());
  for (const input of ['{', 'x'.repeat(100001), JSON.stringify({...raw,schemaVersion:99}), JSON.stringify({...raw,token:'segredo'}),JSON.stringify({...raw,preferences:{...raw.preferences,apiKey:'segredo'}}), JSON.stringify({...raw,preferences:{layout:'layout-top'}}),JSON.stringify({...raw,preferences:{...raw.preferences,parallax:null}})]) assert.throws(()=>service.import(input));
  assert.equal(data.size,0); assert.deepEqual(service.snapshot(),DEFAULT_PREFERENCES);
});
test('formato antigo migra explicitamente e não aceita novos campos arbitrários', () => {
  const envelope={format:'ocsis.rocketbox.preferences',schemaVersion:1,preferences:{layout:'layout-top',motion:false}};
  assert.equal(parsePreferences(JSON.stringify(envelope)).animations,false);
  assert.equal(parsePreferences(JSON.stringify(envelope)).layout,'layout-top');
  envelope.preferences.password='segredo'; assert.throws(()=>parsePreferences(JSON.stringify(envelope)));
});
test('preferências corrompidas usam padrões e preservam o original na recuperação', () => {
  const damaged='{conteudo original'; const {service,data}=setup({[PREFERENCES_KEY]:damaged});
  assert.ok(service.status.damaged); assert.deepEqual(service.snapshot(),DEFAULT_PREFERENCES);
  service.set('density','compact');
  assert.equal([...data.entries()].find(([k])=>k.startsWith(PREFERENCES_KEY+'.recovery.'))[1],damaged);
  assert.equal(parsePreferences(data.get(PREFERENCES_KEY)).density,'compact'); assert.equal(service.status.damaged,false);
});
test('falha na recuperação não sobrescreve as preferências corrompidas', () => {
  const {service,storage,data}=setup({[PREFERENCES_KEY]:'quebrado'}); storage.fail=true;
  assert.throws(()=>service.reset(),/Quota/); assert.equal(data.get(PREFERENCES_KEY),'quebrado'); assert.ok(service.status.damaged);
});
test('restaurar padrões conserva biblioteca, lixeira e outras chaves locais', () => {
  const library=JSON.stringify({assets:[{id:'a',deleted:{at:'2026-11-14'}}],folders:[{id:'p'}]});
  const {service,data}=setup({'ocsis.rocketbox.workspace.v1':library,unrelated:'valor'});
  service.set('assetView','list'); service.reset();
  assert.deepEqual(service.snapshot(),DEFAULT_PREFERENCES); assert.equal(data.get('ocsis.rocketbox.workspace.v1'),library); assert.equal(data.get('unrelated'),'valor');
});
test('outra janela não é sobrescrita; reload sincroniza as preferências', () => {
  const {service,storage}=setup(); const other=createPreferencesService({storage});
  other.set('assetView','list'); assert.throws(()=>service.set('density','compact'),/outra janela/);
  service.reload(); assert.equal(service.snapshot().assetView,'list'); service.set('density','compact');
  assert.equal(parsePreferences(storage.getItem(PREFERENCES_KEY)).assetView,'list');
});
test('comparação de duplicados normaliza caminhos sem ler ou modificar arquivos', () => {
  assert.equal(normalizeAssetPath(' C:\\Assets\\NAVE.FBX '),normalizeAssetPath('c:/assets/nave.fbx'));
  assert.notEqual(normalizeAssetPath('C:/Assets/a.fbx'),normalizeAssetPath('C:/Assets/b.fbx'));
  assert.throws(()=>serializePreferences({...DEFAULT_PREFERENCES,token:'segredo'}),/inválid/);
});
