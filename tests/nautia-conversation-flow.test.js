import test from 'node:test';
import assert from 'node:assert/strict';
import {createNautiaRequestSession} from '../src/services/nautiaRequestSession.ts';
import {appendNautiaReply,canReviewNautiaPlan} from '../src/services/nautiaConversationFlow.ts';
import {createNautiaReplyStream} from '../src/services/nautiaReplyStream.ts';
import {buildConversationMemory} from '../ai/Nautia_llm/runtime/foundation.ts';
import {converseWithOllama,minimizeToolData,allowedConversationTools,unverifiedOperationClaim} from '../src/services/ollamaConversation.ts';
import {createWorkspaceStore} from '../src/workspace-store.js';
import {createLibraryOperationsService} from '../src/services/libraryOperationsService.ts';
import {createModuleHarness} from './helpers/nautia-module-harness.js';
import {markdownInline,parseNautiaMarkdown} from '../src/services/nautiaMarkdown.ts';

const identity=(id,conversationId='a')=>({requestId:id,conversationId,userMessageId:`u-${id}`,assistantMessageId:`n-${id}`});
const user=id=>({id:`u-${id}`,requestId:id,role:'user',text:'Solicitação atual',createdAt:new Date().toISOString()});
const thread=(id='a',turns=[])=>({id,title:`Conversa ${id}`,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),turns});
const entities=Object.fromEntries(['query','assetName','folderName','project','format','software','dateHint','tag'].map(k=>[k,null]));
const intent={intent:'general_chat',entities,referencesPrior:false,requiresClarification:false,proposedTool:null};
const frames=message=>new Response(JSON.stringify({message,done:true})+'\n');
const config={provider:'ollama',endpoint:'http://127.0.0.1:11434',model:'local'};
function setup(){const data=new Map(),store=createWorkspaceStore({storage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}});return {store,operations:createLibraryOperationsService(store),context:{folderId:null,selectedAssetIds:[],project:null,filters:{}}};}

test('Request ownership is synchronous: cancel A, start B, ignore all late A callbacks and finalizers',()=>{
 const session=createNautiaRequestSession(),a=session.begin(identity('a'));assert.ok(a);assert.equal(session.begin(identity('duplicate')),null);
 session.cancel();const b=session.begin(identity('b'));assert.ok(a.controller.signal.aborted);assert.equal(session.accepts(a),false);assert.equal(session.finish(a),false);assert.equal(session.current,b);assert.equal(session.accepts(b),true);session.finish(b);
});
test('A reply is idempotent and belongs to exactly one conversation and user message',()=>{
 const id=identity('one'),a=thread('a',[user('one')]),b=thread('b',[user('one')]);
 const reply={id:id.assistantMessageId,requestId:id.requestId,replyTo:id.userMessageId,role:'nautia',text:'Resposta',createdAt:new Date().toISOString()};
 assert.equal(appendNautiaReply(b,id,reply),b.turns);const turns=appendNautiaReply(a,id,reply);assert.equal(turns.length,2);assert.equal(appendNautiaReply({...a,turns},id,reply),turns);
 assert.equal(appendNautiaReply(a,id,{...reply,replyTo:'other'}),a.turns);
});
test('Old plans cannot be reviewed after a new question, confirmation, cancellation or thread switch',()=>{
 const id=identity('one'),plan={id:'p',origin:{...id},steps:[]},a=thread('a',[user('one'),{id:'n-one',role:'nautia',requestId:'one',replyTo:'u-one',text:'Plano',planResolution:'pending',outcome:{plan}}]);
 assert.ok(canReviewNautiaPlan(plan,a));assert.equal(canReviewNautiaPlan(plan,thread('b',a.turns)),false);
 assert.equal(canReviewNautiaPlan(plan,{...a,turns:[...a.turns,user('two')]}),false);
 for(const state of ['confirmed','cancelled'])assert.equal(canReviewNautiaPlan(plan,{...a,turns:[a.turns[0],{...a.turns[1],planResolution:state}]}),false);
});
test('Visible reply is append-only, blocks unverified clauses once, and rejects stream resets',()=>{
 const published=[],reply=createNautiaReplyStream(text=>published.push(text),text=>unverifiedOperationClaim(text,false));
 reply.write('Sugestão. Outra');reply.write('Sugestão. Outra ideia. Criei a pasta.');const result=reply.finish();
 assert.ok(!result.text.includes('Criei'));assert.ok(result.blocked);for(let i=1;i<published.length;i++)assert.ok(published[i].startsWith(published[i-1]));
 assert.throws(()=>reply.write('Resposta substituída.'),/sequência/);
 assert.ok(unverifiedOperationClaim('Vou executar uma busca para ver as pastas.',true));assert.equal(unverifiedOperationClaim('Posso ajudar a pesquisar se você quiser.',false),false);
});
test('Historical tool data stays separate from assistant prose; cancelled exchanges are excluded only from model memory',()=>{
 const turns=[user('one'),{id:'n-one',role:'nautia',text:'Resultado anterior',requestId:'one',replyTo:'u-one',outcome:{toolData:[{tool:'listFolders',data:[{id:'f',name:'Antiga',caminho:'private'}]}]}},user('cancel'),{role:'nautia',text:'Parcial cancelada',status:'cancelled'}];
 const memory=buildConversationMemory(turns,minimizeToolData);assert.equal(turns.length,4);assert.equal(memory.messages.length,2);assert.equal(memory.references[0].requestId,'one');assert.ok(!JSON.stringify(memory.messages).includes('Antiga'));assert.ok(!JSON.stringify(memory).includes('private'));assert.ok(!JSON.stringify(memory).includes('Parcial cancelada'));
});
test('Product authorship is verified locally even after an old delete conversation; no model or tool is invoked',async()=>{
 const {store,operations,context}=setup(),before=store.snapshot();let calls=0;
 const outcome=await converseWithOllama({config,prompt:'Quem criou a RocketBox?',history:[{role:'user',text:'Exclua a pasta Antiga'},{role:'nautia',text:'Preparei exclusão',planResolution:'confirmed',outcome:{toolData:[{tool:'moveToTrash'}],plan:{}}}],context,operations,signal:new AbortController().signal,onText:()=>{},fetchImpl:async()=>{calls++;throw new Error('Network should not be used');}});
 assert.match(outcome.message,/OCSIS/);assert.ok(!outcome.message.includes('Antiga'));assert.equal(calls,0);assert.equal(outcome.plan,undefined);assert.deepEqual(store.snapshot(),before);
});
test('Informational interpretation exposes no tools, even with old mutation intent in history',async()=>{
 const {store,operations,context}=setup(),before=store.snapshot();let finals=0;
 const result=await converseWithOllama({config,prompt:'Como funciona uma pasta virtual?',history:[{role:'user',text:'Apague uma pasta'},{role:'nautia',text:'Cancelado',status:'cancelled'}],context,operations,signal:AbortSignal.timeout(1000),onText:()=>{},fetchImpl:async(url,init)=>{
  if(url.endsWith('/api/tags'))return Response.json({models:[{name:'local'}]});
  const body=JSON.parse(init.body);if(body.format){assert.equal(body.messages.at(-1).content,'Como funciona uma pasta virtual?');return frames({content:JSON.stringify(intent)});}
  finals++;assert.equal(body.tools,undefined);assert.ok(!JSON.stringify(body.messages).includes('Apague uma pasta'));return frames({content:'Pastas virtuais organizam referências.'});
 }});
 assert.equal(finals,1);assert.match(result.message,/referências/);assert.deepEqual(store.snapshot(),before);
 assert.equal(allowedConversationTools(intent).size,0);assert.equal(allowedConversationTools({...intent,intent:'organize_assets',proposedTool:'moveAssetRecord'}).has('moveToTrash'),false);
});
test('React module: late chunks and resolution after cancellation cannot overwrite the new live reply',async t=>{
 const h=createModuleHarness([thread()]);t.after(()=>h.dispose());await h.flush();
 await h.prompt('Primeira pergunta');const a=h.calls[0];assert.ok(a);a.params.onGeneratedText('Primeira resposta.');h.render();assert.equal(h.thread().streamingText,'Primeira resposta.');
 h.button('Parar geração').props.onClick();h.render();assert.ok(a.params.signal.aborted);
 await h.prompt('Segunda pergunta');const b=h.calls[1];b.params.onGeneratedText('Segunda resposta.');a.params.onGeneratedText('Texto antigo atrasado.');h.render();assert.equal(h.thread().streamingText,'Segunda resposta.');
 a.resolve({kind:'guidance',message:'Resposta antiga tardia'});await h.flush();assert.equal(h.thread().isProcessing,true);assert.equal(h.thread().streamingText,'Segunda resposta.');
 b.resolve({kind:'guidance',message:'Segunda resposta.'});await h.flush();assert.equal(h.thread().isProcessing,false);assert.equal(h.thread().turns.at(-1).text,'Segunda resposta.');assert.ok(!h.thread().turns.some(t=>t.text==='Resposta antiga tardia'));
});
test('React module: switching thread cancels only its generation, persists its cancellation in origin, and leaves destination clean',async t=>{
 const h=createModuleHarness([thread('a'),thread('b',[{role:'user',id:'old',text:'Outro assunto',createdAt:new Date().toISOString()}])]);t.after(()=>h.dispose());await h.flush();
 await h.prompt('Pergunta em A');const a=h.calls[0];h.button('Histórico (2)').props.onClick();h.render();h.find(n=>n.type==='button'&&h.text(n).startsWith('Conversa b')).props.onClick();h.render();assert.ok(a.params.signal.aborted);
 a.params.onGeneratedText('Fantasma de A.');h.render();assert.ok(h.thread().turns.every(t=>!t.text.includes('Fantasma')));assert.equal(h.thread().streamingText,'');
 await h.prompt('Quem criou a RocketBox?');await h.flush();assert.equal(h.calls.length,1);assert.match(h.thread().turns.at(-1).text,/OCSIS/);assert.equal(h.saved.find(c=>c.id==='a').turns.at(-1).status,'cancelled');
 a.resolve({kind:'guidance',message:'Antiga'});await h.flush();assert.match(h.thread().turns.at(-1).text,/OCSIS/);
});
test('React module: tools/context show different real contents, switch directly and toggle closed',t=>{
 const h=createModuleHarness([thread()],{context:{folderId:'real',selectedAssetIds:['a'],project:'Aurora',filters:{format:'.obj'},collection:'Biblioteca'},selectedAssets:[{id:'a',nome:'Malha real',formato:'.obj',categoria:'Modelo',tags:['Azul']}]});t.after(()=>h.dispose());
 h.button('Ferramentas').props.onClick();h.render();assert.ok(h.find(n=>n.type==='h3'&&h.text(n)==='Ações Rápidas'));assert.ok(!h.find(n=>n.type==='h3'&&h.text(n)==='Contexto Atual'));
 h.button('Contexto').props.onClick();h.render();assert.ok(h.find(n=>n.type==='h3'&&h.text(n)==='Contexto Atual'));assert.ok(!h.find(n=>n.type==='h3'&&h.text(n)==='Ações Rápidas'));assert.ok(h.text(h.find(n=>n.type==='aside')).includes('Aurora'));assert.ok(h.text(h.find(n=>n.type==='aside')).includes('Malha real'));
 h.button('Contexto').props.onClick();h.render();assert.ok(!h.find(n=>n.props?.id==='nautia-context-panel'));
});
test('Markdown handles long text structure and escapes unsafe HTML, file URLs and scripts as plain text',()=>{
 const blocks=parseNautiaMarkdown('## Título\n\n**Texto** com `código`.\n\n- Um\n- Dois\n\n```js\n<script>alert(1)</script>\n```\n\n| Nome | Tipo |\n| --- | --- |\n| A | OBJ |');
 assert.deepEqual(blocks.map(b=>b.kind),['heading','paragraph','ul','code','table']);assert.equal(blocks[3].text,'<script>alert(1)</script>');
 const inline=markdownInline('[Seguro](https://example.com) [Malicioso](javascript:alert) [Local](file:///C:/secret) <img src=x onerror=alert(1)>');assert.equal(inline.filter(p=>p.kind==='link').length,1);assert.ok(inline.some(p=>p.text.includes('<img')));
});

test('React module: auto-scroll follows new content, respects manual reading, and resumes only at the user request',async t=>{
 const h=createModuleHarness([thread()]);t.after(()=>h.dispose());await h.flush();await h.prompt('Pergunta longa');const request=h.calls[0];
 request.params.onGeneratedText('Primeira frase.');h.chatGeometry.scrollHeight=1200;h.render();assert.equal(h.chatGeometry.scrollTop,1200);
 const log=h.find(n=>n.props?.role==='log');log.props.onWheel({deltaY:-100});h.chatGeometry.scrollTop=100;log.props.onScroll();h.render();
 request.params.onGeneratedText('Primeira frase. Segunda frase.');h.chatGeometry.scrollHeight=1500;h.render();assert.equal(h.chatGeometry.scrollTop,100);
 h.button('Voltar às mensagens recentes ↓').props.onClick();h.render();assert.equal(h.chatGeometry.scrollTop,1500);
 h.button('Parar geração').props.onClick();request.resolve({kind:'guidance',message:'Ignorada'});await h.flush();
});

test('A classified folder lookup uses official records directly, without waiting for another model to call the same read tool',async()=>{
 const {store,operations,context}=setup();store.transact(d=>{d.folders=[{id:'f',name:'Pasta real',parent:null}];});const before=store.snapshot();let calls=0;
 const result=await converseWithOllama({config,prompt:'Liste as pastas do Convés.',history:[],context,operations,signal:AbortSignal.timeout(1000),onText:()=>{},fetchImpl:async(url,init)=>{
  if(url.endsWith('/api/tags'))return Response.json({models:[{name:'local'}]});
  calls++;const body=JSON.parse(init.body);
  if(body.format)return frames({content:JSON.stringify({...intent,intent:'search_assets',proposedTool:'listFolders'})});
  const tool=body.messages.find(m=>m.role==='tool');assert.ok(tool);assert.equal(JSON.parse(tool.content).data[0].name,'Pasta real');return frames({content:'Encontrei a pasta Pasta real.'});
 }});
 assert.equal(calls,2);assert.equal(result.toolData.length,1);assert.equal(result.toolData[0].tool,'listFolders');assert.deepEqual(store.snapshot(),before);
});

test('React module: a malformed model response reports request error and triggers a real availability check',async t=>{
 const h=createModuleHarness([thread()]);t.after(()=>h.dispose());await h.flush();const before=h.connectionChecks;await h.prompt('Pergunta comum');h.calls[0].reject(new Error('Schema de intenção inválido.'));await h.flush();assert.ok(h.connectionChecks>before);
 assert.equal(h.thread().isProcessing,false);assert.equal(h.thread().turns.at(-1).status,'error');assert.match(h.thread().turns.at(-1).text,/conexão|modelo/);assert.doesNotMatch(h.thread().turns.at(-1).text,/Schema|AbortError/);
});
