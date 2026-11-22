import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceStore} from '../src/workspace-store.js';
import {createLibraryOperationsService} from '../src/services/libraryOperationsService.ts';
import {createNautiaToolSystem} from '../src/services/nautiaToolSystem.ts';
import {lookupNamedAsset} from '../src/services/nautiaNamedLookup.ts';
import {converseWithOllama,initialConversationRead} from '../src/services/ollamaConversation.ts';

function setup(){
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const store=createWorkspaceStore({storage});
 store.transact(d=>{d.folders=[{id:'elite',name:'Elite Maid Survival',parent:null},{id:'characters',name:'Personagens',parent:'elite'},{id:'other',name:'DOW',parent:null}];d.assets=[{id:'hanako',nome:'HANAKO',caminho:'C:/ISOLATED/HANAKO.blend',formato:'.blend',categoria:'Projeto Blender',folder:'characters',tags:[]}];});
 const operations=createLibraryOperationsService(store);
 const context={folderId:'other',selectedAssetIds:[],project:null,filters:{format:'.fbx',nameQuery:'Outro'},collection:'Biblioteca'};
 return {store,operations,context};
}

test('Localização nominal percorre biblioteca inteira, ignora filtros do painel e mostra hierarquia real',async()=>{
 const s=setup(),before=s.store.snapshot();
 for(const prompt of ['localize a hanako','localiza Hanako','procure o asset HANAKO','onde está a Hanako?','onde está localizada a hanako?','Você consegue localizar a Hanako?','por favor, encontre "Hanako"','busque HANAKO.blend']){
  const result=await lookupNamedAsset(prompt,s.operations,s.context);
  assert.ok(result,prompt);assert.equal(result.sourceMode,'deterministic');assert.deepEqual(result.matchedAssets.map(a=>a.id),['hanako']);
  assert.match(result.message,/Convés \/ Elite Maid Survival \/ Personagens/);assert.match(result.message,/registro/);
 }
 assert.deepEqual(s.store.snapshot(),before);
});

test('Pedido simples retorna imediatamente sem consultar modelos, classificar ou gerar texto',async()=>{
 const s=setup();let calls=0;
 const result=await converseWithOllama({config:{provider:'ollama',endpoint:'http://127.0.0.1:11434',model:'not-needed'},prompt:'localize a hanako',history:[],operations:s.operations,context:s.context,identity:{requestId:'r',conversationId:'c',userMessageId:'u',assistantMessageId:'n'},signal:AbortSignal.timeout(1000),onText(){},fetchImpl:async()=>{calls++;throw new Error('Modelo indisponível');}});
 assert.equal(calls,0);assert.equal(result.sourceMode,'deterministic');assert.equal(result.toolData[0].requestId,'r');assert.match(result.message,/Elite Maid Survival/);
});

test('Pesquisa de ferramenta é global por padrão; escopo current continua restrito e explícito',async()=>{
 const s=setup(),tools=createNautiaToolSystem(s.operations,()=>s.context);
 assert.equal((await tools.call('searchAssets',{query:'hanako'})).data.assets.length,1);
 assert.equal((await tools.call('searchAssets',{query:'hanako',scope:'current'})).data.assets.length,0);
});

test('Homônimos mostram todos os locais, sem presumir seleção ou escolher um registro',async()=>{
 const s=setup();s.store.transact(d=>d.assets.push({...d.assets[0],id:'second',folder:'other',caminho:'C:/ISOLATED/Other/HANAKO.blend'}));
 const result=await lookupNamedAsset('localize Hanako',s.operations,s.context);
 assert.equal(result.matchedAssets.length,2);assert.match(result.message,/Qual deles/);assert.match(result.message,/DOW/);assert.match(result.message,/Elite Maid Survival/);
});

test('Busca literal não intercepta comandos compostos, perguntas explicativas, referências ou nomes ausentes',async()=>{
 const s=setup();
 for(const prompt of ['Localize Hanako e mova para DOW','Como localizar Hanako?','Onde está ela?','Encontre todos os arquivos FBX','Procure Desconhecido'])assert.equal(await lookupNamedAsset(prompt,s.operations,s.context),null,prompt);
 const c=new AbortController();c.abort();
 await assert.rejects(converseWithOllama({config:{provider:'ollama',endpoint:'http://127.0.0.1:11434',model:'none'},prompt:'localize Hanako',operations:s.operations,context:s.context,history:[],signal:c.signal,onText(){}}),/abort/i);
});

test('Busca tipada por nome pula planejamento de ferramentas e define escopo global',()=>{
 const entities=Object.fromEntries(['query','assetName','folderName','project','format','software','dateHint','tag'].map(k=>[k,null]));
 const intent={intent:'search_assets',entities:{...entities,assetName:'HANAKO'},requiresClarification:false,referencesPrior:false,proposedTool:'searchAssets'};
 assert.deepEqual(initialConversationRead(intent),{name:'searchAssets',args:{query:'HANAKO',scope:'library'}});
 assert.equal(initialConversationRead({...intent,entities:{...intent.entities,dateHint:'ontem'}}),null);
});
