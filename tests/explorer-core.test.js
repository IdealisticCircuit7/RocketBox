import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceStore } from '../src/workspace-store.js';
import { createLibraryOperationsService } from '../src/services/libraryOperationsService.ts';

test('Explorer move validates cycles, destination and conflicts atomically; metadata persists independently of physical paths', () => {
  const data = new Map();
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const store = createWorkspaceStore({ storage });
  store.transact(d => {
    d.folders = [{ id: 'a', name: 'A', parent: null }, { id: 'b', name: 'B', parent: 'a' }, { id: 'c', name: 'C', parent: null }];
    d.assets = [{ id: 'x', nome: 'Original', caminho: 'C:/missing.fbx', categoria: 'Outro', formato: '.fbx', tags: [], folder: 'b' }];
  });
  const ops = createLibraryOperationsService(store);
  const before = store.snapshot();
  assert.equal(ops.moveFolder('a', 'b').ok, false);
  assert.deepEqual(store.snapshot(), before);
  assert.equal(ops.moveFolder('a', 'missing').ok, false);
  assert.equal(ops.moveFolder('b', 'c').ok, true);
  assert.equal(ops.updateAssetRecord('x', { nome: 'Renamed', projeto: 'Project' }).ok, true);
  assert.equal(ops.organizeRecords({ assetIds: ['x'], targetFolderId: 'c' }).ok, true);
  assert.equal(ops.updateAssetRecord('x', { nome: ' ' }).ok, false);
  assert.equal(ops.moveFolder('c', null, { actor: 'nautia-assistant', allowMutations: false }).ok, false);
  assert.throws(() => store.transact(d => { d.assets[0].folder = 'missing'; }), /destino/);
  const reopened = createWorkspaceStore({ storage }).snapshot();
  assert.equal(reopened.assets[0].nome, 'Renamed');
  assert.equal(reopened.assets[0].projeto, 'Project');
  assert.equal(reopened.assets[0].caminho, 'C:/missing.fbx');
  assert.equal(reopened.folders.find(f => f.id === 'b').parent, 'c');
});
