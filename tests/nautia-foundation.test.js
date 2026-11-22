import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nautiaConfig,renderModelfile,buildConversationMemory,validateIntent} from '../ai/Nautia_llm/runtime/foundation.ts';
import {loadLocalLlmConfig,minimizeToolData} from '../src/services/ollamaConversation.ts';
import {selectAvailableNautiaModel,connectNautia} from '../src/services/nautiaConnectionService.ts';
import {restoreActiveConversation,rememberActiveConversation,createEmptyConversation} from '../src/services/nautiaConversationStore.ts';
import {createWorkspaceStore} from '../src/workspace-store.js';
import {createLibraryOperationsService} from '../src/services/libraryOperationsService.ts';
import {createNautiaToolSystem} from '../src/services/nautiaToolSystem.ts';
const read=name=>readFileSync(new URL('../ai/Nautia_llm/'+name,import.meta.url),'utf8');
test('Versioned Modelfile and runtime bundle match the editable prompts',()=>{
  assert.equal(read('Modelfile').replace(/\r\n/g,'\n'),renderModelfile(read('prompts/identity.md'),read('prompts/conversation.md')));
  const bundle=JSON.parse(read('runtime/promptBundle.json'));
  for(const name of ['identity','conversation','intent'])assert.equal(bundle[name],read(`prompts/${name}.md`));
  assert.equal(nautiaConfig.numCtx,8192);assert.equal(nautiaConfig.temperature,.4);
});
test('Foundation activates once, persists explicit preferences and reconnects using only installed models',async()=>{
  assert.equal(loadLocalLlmConfig({getItem:()=>null}).provider,'ollama');
  assert.equal(loadLocalLlmConfig({getItem:()=>JSON.stringify({provider:'none',endpoint:nautiaConfig.endpoint,model:''})}).provider,'ollama');
  assert.equal(loadLocalLlmConfig({getItem:()=>JSON.stringify({foundationVersion:'0.1.0',provider:'none',endpoint:nautiaConfig.endpoint,model:''})}).provider,'none');
  assert.equal(selectAvailableNautiaModel(['qwen3.5:4b','nautia:0.1'],'nautia:0.1'),'nautia:0.1');
  assert.equal(selectAvailableNautiaModel(['qwen3.5:4b'],'missing-explicit-choice'),'');
  let requests=0,starts=0;
  const config={provider:'ollama',endpoint:nautiaConfig.endpoint,model:nautiaConfig.modelName};
  const result=await connectNautia(config,new AbortController().signal,{fetchImpl:async()=>{if(++requests===1)throw new Error('offline');return Response.json({models:[{name:'nautia:0.1'}]});},ensureService:async()=>{starts++;}});
  assert.equal(starts,1);assert.equal(result.model,'nautia:0.1');assert.ok(result.verifiedAt);
});
test('Reopening restores the last active thread; a deliberately new thread stays new',()=>{
  const data=new Map();const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  const thread={...createEmptyConversation(),turns:[{id:'u',role:'user',text:'Organizar por projeto Aurora',createdAt:new Date().toISOString()}]};
  rememberActiveConversation(thread,storage);
  assert.equal(restoreActiveConversation([thread],storage).id,thread.id);
  rememberActiveConversation(createEmptyConversation(),storage);assert.equal(restoreActiveConversation([thread],storage).turns.length,0);
});
test('Bounded memory carries literal preferences and real prior IDs without physical paths',()=>{
  const turns=Array.from({length:30},(_,i)=>({role:i%2?'nautia':'user',text:`Prefiro organização por projeto ${i}.`}));
  turns[29].outcome={toolData:[{tool:'searchAssets',data:{assets:[{id:'jade',nome:'Jade',caminho:'C:/private'}]}}]};
  const memory=buildConversationMemory(turns,minimizeToolData);
  assert.ok(memory.summary.includes('Usuário disse:'));assert.ok(memory.summary.length<=nautiaConfig.summaryCharBudget);
  assert.ok(memory.messages.reduce((n,m)=>n+m.content.length,0)<=nautiaConfig.historyCharBudget);
  assert.match(JSON.stringify(memory.references),/jade/);assert.ok(!JSON.stringify(memory).includes('C:/private'));
});
test('Interpretation is a proposal with strict fields, never an arbitrary executable tool',()=>{
  const entities=Object.fromEntries(['query','assetName','folderName','project','format','software','dateHint','tag'].map(k=>[k,null]));
  const value={intent:'general_chat',entities,referencesPrior:false,requiresClarification:false,proposedTool:null};
  assert.equal(validateIntent(value).intent,'general_chat');assert.throws(()=>validateIntent({...value,proposedTool:'shell'}));assert.throws(()=>validateIntent({...value,requiresClarification:true,proposedTool:'createFolder'}));
});
test('Folder discovery and filtered asset queries use persisted official records',async()=>{
  const map=new Map();const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};const store=createWorkspaceStore({storage});
  store.transact(d=>{d.folders=[{id:'p',name:'Aurora',parent:null},{id:'t',name:'Texturas',parent:'p'}];d.assets=[{id:'j',nome:'Jade',categoria:'Personagem',formato:'.fbx',caminho:'C:/jade.fbx',projeto:'Aurora',createdAt:'2026-11-14T12:00:00Z',folder:'p',tags:[]}];});
  const tools=createNautiaToolSystem(createLibraryOperationsService(store),()=>({folderId:null,selectedAssetIds:[],project:null,filters:{},collection:'Biblioteca'}));
  const folders=await tools.call('listFolders',{query:'textu'});assert.equal(folders.data[0].virtualPath,'Convés / Aurora / Texturas');
  const assets=await tools.call('searchAssets',{scope:'library',category:'Personagem',dateFrom:'2026-11-14',dateTo:'2026-11-14'});assert.equal(assets.data.assets[0].id,'j');
});
