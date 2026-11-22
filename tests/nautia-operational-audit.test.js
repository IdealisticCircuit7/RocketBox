import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceStore} from '../src/workspace-store.js';
import {createLibraryOperationsService} from '../src/services/libraryOperationsService.ts';
import {createOperationHistoryService} from '../src/services/operationHistoryService.ts';
import {createNautiaToolSystem} from '../src/services/nautiaToolSystem.ts';
import {resolveTagRequest} from '../src/services/nautiaTagResolution.ts';
import {resolveRecordRequest} from '../src/services/nautiaRecordResolution.ts';
import {executeApprovedActionPlan} from '../src/services/nautiaOrchestratorService.ts';
import {converseWithOllama,allowedConversationTools} from '../src/services/ollamaConversation.ts';
import {nautiaFailureCause,nautiaFailureMessage} from '../src/services/nautiaFailure.ts';
import {createNautiaRequestSession} from '../src/services/nautiaRequestSession.ts';
import {matchNautiaQuickReply} from '../src/services/nautiaQuickReplies.ts';
import {validateIntent} from '../ai/Nautia_llm/runtime/foundation.ts';

function setup(){
 const data=new Map();let deny=false;
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(deny)throw new Error('armazenamento indisponível');data.set(k,v);}};
 const store=createWorkspaceStore({storage});
 store.transact(d=>{d.folders=[{id:'f',name:'Personagens',parent:null},{id:'g',name:'Favoritos',parent:null}];d.assets=['Lucy','Jade'].map((nome,i)=>({id:'a'+i,nome,caminho:`C:/ISOLATED/${nome}.obj`,formato:'.obj',categoria:'Objeto',folder:'f',tags:['Original']}));d.assetTags=[];});
 const operations=createLibraryOperationsService(store),history=createOperationHistoryService({storage});
 const context={folderId:null,selectedAssetIds:[],project:null,filters:{},collection:'Biblioteca'};
 const tools=createNautiaToolSystem(operations,()=>context);
 return {storage,store,operations,history,context,tools,denyWrites(){deny=true;}};
}
const empty=Object.fromEntries(['query','assetName','folderName','project','format','software','dateHint','tag'].map(k=>[k,null]));
function intent(assetName='Lucy',tag='["Personagem","Favorito"]',proposedTool='assignTags'){
 return {intent:'manage_tags',entities:{...empty,assetName,tag},proposedTool,referencesPrior:false,requiresClarification:false};
}
async function tagPlan(s,i=intent()){
 const r=resolveTagRequest(i,s.context,s.operations,'Aplique as etiquetas em Lucy');assert.ok(r?.tool);return (await s.tools.call(r.tool,r.args)).plan;
}

test('Etiquetas: Lucy/Jade, múltiplas etiquetas, criação explícita, cancelamento, confirmação, recarga, remoção e idempotência',async()=>{
 const s=setup(),before=s.store.snapshot();
 const plan=await tagPlan(s,intent('Lucy e Jade'));
 assert.deepEqual(s.store.snapshot(),before); // cancelling here has no writes
 assert.match(plan.warnings.join(' '),/criar também.*Personagem.*Favorito/);
 assert.match(plan.steps[0].description,/Lucy, Jade.*Origem: Personagens/);
 assert.equal(executeApprovedActionPlan({plan,operations:s.operations,history:s.history}).ok,true);
 const reloaded=createWorkspaceStore({storage:s.storage});
 for(const a of reloaded.snapshot().assets)assert.deepEqual(a.tags,['Original','Personagem','Favorito']);
 assert.equal(s.operations.listTags().data.assetTags.filter(t=>t.label==='Favorito').length,1);
 assert.match(resolveTagRequest(intent(),s.context,s.operations,'Etiquete Lucy').message,/já possuem/);
 assert.equal(executeApprovedActionPlan({plan,operations:s.operations,history:s.history}).ok,false);
 const remove=await tagPlan(s,intent('Lucy','Personagem','removeTags'));
 assert.equal(executeApprovedActionPlan({plan:remove,operations:s.operations,history:s.history}).ok,true);
 assert.deepEqual(s.store.snapshot().assets.find(a=>a.nome==='Lucy').tags,['Original','Favorito']);
 assert.deepEqual(s.store.snapshot().assets.find(a=>a.nome==='Jade').tags,['Original','Personagem','Favorito']);
});

test('Etiquetas: ambiguidades, nomes ausentes, seleção explícita e etiquetas com vírgulas não são presumidos',async()=>{
 const s=setup();s.store.transact(d=>{d.assets.push({...d.assets[0],id:'duplicate',folder:'g'});});
 const before=s.store.snapshot();
 assert.match(resolveTagRequest(intent(),s.context,s.operations,'Lucy').message,/Há 2/);
 assert.match(resolveTagRequest(intent('Inexistente'),s.context,s.operations,'Etiquete').message,/Não encontrei/);
 s.context.selectedAssetIds=['a0','a1'];
 assert.match(resolveTagRequest(intent(null),s.context,s.operations,'Etiquete').message,/Qual asset/);
 const r=resolveTagRequest(intent(null,'["Luz, cor e forma","Favorito"]'),s.context,s.operations,'Etiquete os selecionados');
 assert.deepEqual(r.args.assetIds,['a0','a1']);assert.deepEqual(r.args.labels,['Luz, cor e forma','Favorito']);
 assert.deepEqual(s.store.snapshot(),before);
});

test('Plano obsoleto, permissão negada e falha de persistência preservam os dados',async()=>{
 const s=setup(),plan=await tagPlan(s);
 s.operations.updateAssetRecord('a0',{nome:'Lucy revisada'});
 const current=s.store.snapshot();
 assert.equal(executeApprovedActionPlan({plan,operations:s.operations,history:s.history}).ok,false);
 assert.deepEqual(s.store.snapshot(),current);
 const denied=createNautiaToolSystem(s.operations,()=>s.context,{read:true,analyze:false,mutate:false});
 assert.equal((await denied.call('assignTags',{scope:'asset-tag',assetIds:['a0'],labels:['Nova']})).ok,false);
 const failing=setup(),p=await tagPlan(failing),before=failing.store.snapshot();failing.denyWrites();
 assert.equal(executeApprovedActionPlan({plan:p,operations:failing.operations,history:failing.history}).ok,false);
 assert.deepEqual(failing.store.snapshot(),before);
});

test('Ferramentas de edição usam serviços oficiais e nunca alteram caminhos; busca por etiquetas e lixeira/restauração reais',async()=>{
 const s=setup(),path=s.store.snapshot().assets[0].caminho;
 for(const [tool,args] of [['updateAssetRecord',{assetId:'a0',name:'Lucy nova',project:'Demo'}],['updateAssetCategory',{assetId:'a0',category:'Personagem'}],['renameFolder',{folderId:'f',name:'Elenco'}],['moveAssetRecord',{assetIds:['a0'],targetFolderId:'g'}]]){
  const r=await s.tools.call(tool,args);assert.ok(r.plan,r.summary);assert.equal(executeApprovedActionPlan({plan:r.plan,operations:s.operations,history:s.history}).ok,true);
 }
 assert.equal(s.store.snapshot().assets[0].caminho,path);
 s.operations.assignTags({scope:'asset-tag',assetIds:['a0'],labels:['Favorito']});
 const search=await s.tools.call('searchAssets',{labels:['Favorito'],scope:'library'});assert.deepEqual(search.data.assets.map(a=>a.id),['a0']);
 const trash=await s.tools.call('moveToTrash',{refs:[{type:'asset',id:'a0'}]});
 assert.equal((await s.tools.call('listTrash',{})).data.assets.length,0);
 assert.equal(executeApprovedActionPlan({plan:trash.plan,operations:s.operations,history:s.history}).ok,true);
 const deleted=await s.tools.call('listTrash',{});assert.equal(deleted.data.assets[0].id,'a0');
 const restore=await s.tools.call('restoreRecord',{refs:[{type:'asset',id:'a0'}]});assert.equal(executeApprovedActionPlan({plan:restore.plan,operations:s.operations,history:s.history}).ok,true);
 assert.equal((await s.tools.call('listTrash',{})).data.assets.length,0);
 assert.equal(s.store.snapshot().assets[0].caminho,path);
});

test('Conversa: interpretação estruturada prepara etiquetas sem depender de uma segunda chamada ao modelo',async()=>{
 const s=setup();let calls=0;
 const result=await converseWithOllama({config:{provider:'ollama',endpoint:'http://127.0.0.1:11434',model:'test'},prompt:'Coloque Personagem e Favorito na Lucy',history:[],operations:s.operations,context:s.context,signal:AbortSignal.timeout(2000),identity:{requestId:'r',conversationId:'c',userMessageId:'u',assistantMessageId:'n'},onText(){},fetchImpl:async(url,init)=>{
  if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'test'}]});
  calls++;assert.ok(JSON.parse(init.body).format);return new Response(JSON.stringify({message:{content:JSON.stringify(intent())},done:true})+'\n');
 }});
 assert.equal(calls,1);assert.equal(result.kind,'action-plan');assert.equal(result.plan.origin.requestId,'r');
 assert.deepEqual(s.store.snapshot().assets[0].tags,['Original']);
 for(const text of ['ok, coloque a etiqueta Personagem na Lucy','oi, mova Lucy para Favoritos','obrigado, restaure Jade'])assert.equal(matchNautiaQuickReply(text),null);
 assert.ok(allowedConversationTools({...intent(),intent:'edit_records',proposedTool:'searchAssets'}).has('updateAssetRecord'));
});

test('Interrupções preservam a causa, não expõem AbortError e não executam planos',()=>{
 for(const cause of ['user','conversation-change','unmount']){
  const session=createNautiaRequestSession(),r=session.begin({requestId:'r',conversationId:'c',userMessageId:'u',assistantMessageId:'n'});session.cancel(cause);
  assert.equal(nautiaFailureCause(r.controller.signal.reason,r.controller.signal),cause);assert.equal(session.accepts(r),false);
 }
 assert.equal(nautiaFailureCause(new DOMException('Cancelado','AbortError')),'stream-interrupted');
 assert.equal(nautiaFailureCause(new Error('operation timed out')),'timeout');
 assert.doesNotMatch(nautiaFailureMessage('stream-interrupted'),/AbortError|Cancelado/);
});

test('Destinos são pastas reais, mesmo quando existe etiqueta com o mesmo nome; nomes ambíguos e inexistentes bloqueiam plano',async()=>{
 const s=setup();s.operations.assignTags({scope:'asset-tag',assetIds:['a0'],labels:['Favoritos']});
 const request={...intent(),intent:'organize_assets',proposedTool:'moveAssetRecord',entities:{...empty,assetName:'Lucy',targetFolderName:'Favoritos'}};
 const resolved=resolveRecordRequest(request,s.operations);assert.equal(resolved.args.targetFolderId,'g');
 const plan=await s.tools.call(resolved.tool,resolved.args);assert.equal(plan.plan.steps[0].tool,'moveAssetRecord');
 assert.equal(s.store.snapshot().assets[0].folder,'f');
 assert.equal(executeApprovedActionPlan({plan:plan.plan,operations:s.operations,history:s.history}).ok,true);
 assert.equal(s.store.snapshot().assets[0].folder,'g');
 assert.match(resolveRecordRequest({...request,entities:{...request.entities,targetFolderName:'Ausente'}},s.operations).message,/Não encontrei a pasta/);
 s.store.transact(d=>{d.folders.push({id:'ambiguous',name:'Favoritos',parent:'f'});});
 assert.match(resolveRecordRequest(request,s.operations).message,/várias pastas/);
 const folderMove=resolveRecordRequest({...request,proposedTool:'moveFolder',entities:{...empty,sourceFolderName:'Personagens',targetFolderName:'raiz'}},s.operations);
 assert.deepEqual(folderMove.args,{folderId:'f',targetFolderId:null});
});

test('Execução parcial informa passos concluídos, não repete plano e conserva evidência no histórico',async()=>{
 const s=setup(),r=await s.tools.call('updateAssetRecord',{assetId:'a0',name:'Lucy revisada'});
 const wrapped={...s.operations,updateAssetCategory(){return {ok:false,summary:'Falha de teste na segunda operação'};}};
 const plan={...r.plan,steps:[...r.plan.steps,{stepId:'second',tool:'updateAssetCategory',description:'Categoria',params:{assetId:'a0',category:'Personagem'}}]};
 const result=executeApprovedActionPlan({plan,operations:wrapped,history:s.history});
 assert.equal(result.ok,false);assert.match(result.summary,/1 passo\(s\) concluído/);
 assert.equal(s.store.snapshot().assets[0].nome,'Lucy revisada');
 assert.equal(executeApprovedActionPlan({plan,operations:wrapped,history:s.history}).ok,false);
});

test('Conflitos de nomes em movimentações e renomeações bloqueiam a preparação sem tocar registros',async()=>{
 const s=setup();s.store.transact(d=>{d.assets.push({...d.assets[0],id:'other',folder:'g'});});const before=s.store.snapshot();
 for(const [tool,args] of [['moveAssetRecord',{assetIds:['a0'],targetFolderId:'g'}],['updateAssetRecord',{assetId:'a1',name:'Lucy'}],['renameFolder',{folderId:'f',name:'Favoritos'}]]){
  const r=await s.tools.call(tool,args);assert.equal(r.ok,false);assert.equal(r.plan,undefined);
 }
 assert.deepEqual(s.store.snapshot(),before);
});

test('Schema de entidades permanece compatível e rejeita campos extras, tipos inválidos e destinos presumidos',()=>{
 assert.equal(validateIntent(intent()).intent,'manage_tags');
 const i={...intent(),entities:{...intent().entities,targetFolderName:'Favoritos',sourceFolderName:null,newName:null,newCategory:null}};
 assert.equal(validateIntent(i).entities.targetFolderName,'Favoritos');
 assert.throws(()=>validateIntent({...i,entities:{...i.entities,arbitraryCommand:'cmd.exe'}}));
 assert.throws(()=>validateIntent({...i,entities:{...i.entities,targetFolderName:17}}));
});
