import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceStore } from '../src/workspace-store.js';
import { createLibraryOperationsService } from '../src/services/libraryOperationsService.ts';
import { createOperationHistoryService } from '../src/services/operationHistoryService.ts';
import { createNautiaToolSystem, TOOL_DEFINITIONS } from '../src/services/nautiaToolSystem.ts';
import { executeApprovedActionPlan, orchestrateNaturalLanguageRequest } from '../src/services/nautiaOrchestratorService.ts';

function setup() {
  const data = new Map(); const storage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) };
  const store = createWorkspaceStore({ storage });
  store.transact(d => { d.assets = [{ id:'a', nome:'Cube', caminho:'C:/cube.obj', formato:'.obj', categoria:'Objeto', folder:null, tags:[] }]; d.folders = [{ id:'f', name:'Folder', parent:null }]; });
  const operations = createLibraryOperationsService(store), history = createOperationHistoryService({ storage });
  const context = { folderId:null, selectedAssetIds:['a'], project:null, filters:{}, collection:'Todos os Assets' };
  return { storage, store, operations, history, context, tools:createNautiaToolSystem(operations, () => context) };
}

for (const name of ['searchAssets','getAssetDetails','listFolders','listTags','getCurrentContext','getAnalysisResult','analyzeAsset']) {
  test(`Tool query ${name} uses real services`, async () => {
    const {tools} = setup();
    const args = name === 'searchAssets' ? {query:'Cube'} : name === 'analyzeAsset' ? {assetIds:['a']} : ['getAssetDetails','getAnalysisResult'].includes(name) ? {assetId:'a'} : {};
    const result = await tools.call(name,args); assert.equal(result.ok,true); assert.notEqual(result.data,undefined); assert.equal(result.plan,undefined);
  });
}

for (const [name,args] of [
  ['createFolder',{name:'New',parent:null,newTag:{label:'Production',icon:'folder',accent:'cyan'}}],
  ['assignTags',{scope:'asset-tag',assetIds:['a'],labels:['Hero']}],
  ['removeTags',{assetIds:['a'],labels:['Hero']}],
  ['moveAssetRecord',{assetIds:['a'],targetFolderId:'f'}],
  ['moveToTrash',{refs:[{type:'asset',id:'a'}]}],
  ['restoreRecord',{refs:[{type:'asset',id:'a'}]}],
]) {
  test(`Tool mutation ${name}: plan/cancel are read-only; approval persists`, async () => {
    const {store,storage,operations,history,tools} = setup();
    if(name === 'restoreRecord') operations.moveToTrash([{type:'asset',id:'a'}]);
    if(name === 'removeTags') operations.assignTags({scope:'asset-tag',assetIds:['a'],labels:['Hero']});
    const before = store.snapshot(); const prepared = await tools.call(name,args);
    assert.equal(prepared.ok,true); assert.ok(prepared.plan); assert.deepEqual(store.snapshot(),before); // cancel means no execution
    const denied = executeApprovedActionPlan({plan:prepared.plan,operations,history,permissions:{actor:'nautia-assistant',allowMutations:false}});
    assert.equal(denied.ok,false); assert.deepEqual(store.snapshot(),before);
    const approved = executeApprovedActionPlan({plan:prepared.plan,operations,history}); assert.equal(approved.ok,true,approved.summary);
    const saved = createWorkspaceStore({storage}).snapshot();
    if(name === 'createFolder') assert.ok(saved.folders.some(f=>f.name==='New'));
    if(name === 'assignTags') assert.deepEqual(saved.assets[0].tags,['Hero']);
    if(name === 'removeTags') assert.deepEqual(saved.assets[0].tags,[]);
    if(name === 'moveAssetRecord') assert.equal(saved.assets[0].folder,'f');
    if(name === 'moveToTrash') assert.ok(saved.assets[0].deleted);
    if(name === 'restoreRecord') assert.equal(saved.assets[0].deleted,undefined);
  });
}

test('All tools reject invalid parameters and denied permissions; stale and unknown plans cannot report success', async () => {
  const {tools,operations,history,context,store} = setup();
  const denied = createNautiaToolSystem(operations,()=>context,{read:false,analyze:false,mutate:false});
  for(const name of Object.keys(TOOL_DEFINITIONS)) { assert.equal((await tools.call(name,{arbitraryCommand:'rm'})).ok,false,name); assert.equal((await denied.call(name,{})).ok,false,name); }
  assert.equal((await tools.call('moveAssetRecord',{assetIds:['a'],targetFolderId:'missing'})).ok,false);
  assert.equal((await tools.call('createFolder',{name:'Folder',parent:null,newTag:{label:'tag'}})).ok,false);
  const p = (await tools.call('moveAssetRecord',{assetIds:['a'],targetFolderId:'f'})).plan;
  operations.moveToTrash([{type:'folder',id:'f'}]); const before=store.snapshot();
  assert.equal(executeApprovedActionPlan({plan:p,operations,history}).ok,false); assert.deepEqual(store.snapshot(),before);
  assert.equal(executeApprovedActionPlan({plan:{...p,steps:[{tool:'shell',params:{},stepId:'x',description:'bad'}]},operations,history}).ok,false);
});

test('Deterministic chat uses exact selection and current context, without guessing an asset', async () => {
  const {operations,context} = setup();
  const result = await orchestrateNaturalLanguageRequest({prompt:'contexto atual',selectedAssets:[],operations,context});
  assert.equal(result.toolData.collection,'Todos os Assets');
  const noSelection = await orchestrateNaturalLanguageRequest({prompt:'Analise os selecionados',selectedAssets:[],operations,context:{...context,selectedAssetIds:[]}});
  assert.equal(noSelection.kind,'guidance'); assert.equal(noSelection.inferenceReports,undefined);
});
