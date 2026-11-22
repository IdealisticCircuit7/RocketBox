import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceStore } from '../src/workspace-store.js';
import { createLibraryOperationsService } from '../src/services/libraryOperationsService.ts';
import { validateRelink } from '../src/services/assetVaultService.ts';
class Storage {
  map = new Map(); fail = false;
  getItem(k) {return this.map.get(k) ?? null;}
  setItem(k,v) {if(this.fail) throw new Error('quota fixture'); this.map.set(k,v);}
}
function env() {
  const storage = new Storage(); const store = createWorkspaceStore({storage});
  store.transact(d => {d.assets = [{id:'fixture-asset',nome:'Modelo',caminho:'C:/fixture/old.glb',sourcePath:'C:/fixture/old.glb',formato:'.glb',kind:'asset',categoria:'Objeto',folder:null,tags:['tag'],analysisReport:{fixture:true},lastAnalyzedAt:'old',createdAt:'created'}];});
  return {storage,store,ops:createLibraryOperationsService(store)};
}
const inspected = {path:'C:/fixture/new.glb',isDirectory:false,size:123,signature:'GLB',structureMarkers:[],warnings:[]};
test('ETAPA13 relink validates before atomic persistence and invalidates old technical evidence',async () => {
 const {storage,store,ops}=env();const before=store.snapshot().assets[0];const result=await ops.relinkAsset(before.id,inspected.path,async()=>inspected);
 assert.equal(result.ok,true);const after=store.snapshot().assets[0];assert.equal(after.id,before.id);assert.equal(after.caminho,inspected.path);assert.equal(after.sourcePath,inspected.path);assert.deepEqual(after.tags,before.tags);assert.equal(after.createdAt,'created');assert.equal(after.analysisReport,undefined);assert.equal(after.lastAnalyzedAt,undefined);assert.equal(createWorkspaceStore({storage}).snapshot().assets[0].caminho,inspected.path);
});
test('ETAPA13 missing, incompatible signature, duplicate, denied and quota failures preserve references',async () => {
 const {storage,store,ops}=env();const before=store.snapshot();
 assert.equal((await ops.relinkAsset('fixture-asset','bad',async()=>{throw new Error('missing fixture');})).ok,false);
 assert.equal((await ops.relinkAsset('fixture-asset','bad',async()=>({...inspected,signature:'PNG'}))).ok,false);
 assert.deepEqual(store.snapshot(),before);
 storage.fail=true;assert.equal((await ops.relinkAsset('fixture-asset',inspected.path,async()=>inspected)).ok,false);assert.deepEqual(store.snapshot(),before);storage.fail=false;
 store.transact(d=>d.assets.push({...d.assets[0],id:'other',nome:'Outro',caminho:inspected.path}));const duplicateSnapshot=store.snapshot();
 assert.equal((await ops.relinkAsset('fixture-asset',inspected.path,async()=>inspected)).ok,false);assert.deepEqual(store.snapshot(),duplicateSnapshot);
 assert.equal((await ops.relinkAsset('fixture-asset',inspected.path,async()=>inspected,{actor:'nautia-assistant',allowMutations:false})).ok,false);
});
test('ETAPA13 relink refuses concurrent changes while native validation awaits',async()=>{
 const {store,ops}=env();const result=await ops.relinkAsset('fixture-asset',inspected.path,async()=>{store.transact(d=>{d.assets[0].caminho='C:/fixture/concurrent.glb';});return inspected;});assert.equal(result.ok,false);assert.equal(store.snapshot().assets[0].caminho,'C:/fixture/concurrent.glb');
});
test('ETAPA13 Unity requires validated structure; formats cannot silently convert',()=>{
 const project={kind:'project',projectType:'unity',caminho:'C:/fixture/Unity'};
 assert.throws(()=>validateRelink(project,{...inspected,isDirectory:true,structureMarkers:['Assets']}));
 assert.doesNotThrow(()=>validateRelink(project,{...inspected,isDirectory:true,structureMarkers:['Assets','Packages','ProjectSettings']}));
 assert.throws(()=>validateRelink({caminho:'C:/fixture/a.glb'}, {...inspected,path:'C:/fixture/a.fbx',signature:'FBX_BIN'}));
});
