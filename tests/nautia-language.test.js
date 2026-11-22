import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NAUTIA_SYSTEM_PROMPT,NAUTIA_INTENT_PROMPT,renderModelfile} from '../ai/Nautia_llm/runtime/foundation.ts';
import {NAUTIA_OPENING_INSTRUCTIONS,hasNautiaConversationStarted,nautiaLanguageContext} from '../src/services/nautiaLanguageContext.ts';
import {matchNautiaQuickReply} from '../src/services/nautiaQuickReplies.ts';
import {converseWithOllama} from '../src/services/ollamaConversation.ts';
import {createWorkspaceStore} from '../src/workspace-store.js';
import {createLibraryOperationsService} from '../src/services/libraryOperationsService.ts';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const digest=text=>createHash('sha256').update(text).digest('hex');
const existing=[{role:'user',text:'Oi'},{role:'nautia',text:'Oi! Sou a NautIA da OCSIS. Como posso ajudar?'}];
const entities=Object.fromEntries(['query','assetName','folderName','project','format','software','dateHint','tag'].map(k=>[k,null]));
const frames=message=>new Response(JSON.stringify({message,done:true})+'\n');

test('Saudações existentes e tela de boas-vindas permanecem intactas; primeira apresentação conserva instrução original',()=>{
 const source=read('src/services/nautiaQuickReplies.ts').replace(/\r\n/g,'\n');
 assert.equal(digest(source.slice(source.indexOf('const GREETING_SPECIFIC'),source.indexOf('const FAREWELLS_EXACT'))),'2daa6a52587f11f2cfe74c967a9b32a5ebf561b553c5fb2a32592f2a187dd6bb');
 // Normalize line endings so the protection also works on other platforms.
 const welcome=read('src/components/nautia/NautiaWelcomeScreen.tsx').replace(/\r\n/g,'\n');
 assert.match(welcome,/Olá! Sou a NautIA\./);assert.match(welcome,/Sua copilota no RocketBox/);assert.match(welcome,/Por onde começamos\?/);
 assert.equal(nautiaLanguageContext([],true),NAUTIA_OPENING_INSTRUCTIONS);
 assert.ok(!nautiaLanguageContext(existing,true).includes(NAUTIA_OPENING_INSTRUCTIONS));
 assert.equal(hasNautiaConversationStarted([{role:'nautia',text:'Falha',status:'error'}]),false);
 assert.equal(hasNautiaConversationStarted(existing),true);
});

test('Persona tem uma fonte editável, não aumenta o classificador e mantém Modelfile/runtime consistentes',()=>{
 const persona=read('ai/Nautia_llm/prompts/persona.md').trim().replace(/\r\n/g,'\n');
 assert.equal(NAUTIA_SYSTEM_PROMPT.split(persona).length,2);
 assert.ok(!NAUTIA_INTENT_PROMPT.includes(persona));
 assert.match(persona,/português brasileiro/);assert.match(persona,/idioma solicitado/);assert.match(persona,/Não é obrigatório terminar toda mensagem/);
 assert.match(persona,/apresentação continua generativa/);assert.match(persona,/código e citações/);
 assert.equal(read('ai/Nautia_llm/Modelfile').replace(/\r\n/g,'\n'),renderModelfile(read('ai/Nautia_llm/prompts/identity.md'),read('ai/Nautia_llm/prompts/conversation.md')));
});

test('Agradecimentos variam sem menu obrigatório; cumprimento de retorno não repete apresentação; nenhuma confirmação é interceptada',()=>{
 const replies=new Set();for(let i=0;i<6;i++)replies.add(matchNautiaQuickReply('Obg').message);
 assert.equal(replies.size,3);assert.ok([...replies].some(t=>!t.endsWith('?')));
 for(const input of ['Olá NautIA','tudo bem?','oi'])assert.doesNotMatch(matchNautiaQuickReply(input,{conversationStarted:true}).message,/Sou a NautIA|OCSIS|RocketBox/);
 for(const input of ['sim','pode','oi, mova Lucy','obg, adicione uma etiqueta'])assert.equal(matchNautiaQuickReply(input,{conversationStarted:true}),null);
 assert.equal(matchNautiaQuickReply('oi',{hasPendingPlan:true,conversationStarted:true}),null);
 assert.match(nautiaLanguageContext(existing,false,'thanks'),/apenas um agradecimento/);
 assert.match(nautiaLanguageContext(existing,false,'farewell'),/sem iniciar outra tarefa/);
});

const cases=[
 ['Oi','opening'],['Olá NautIA','return'],['Quem é você?'],['Quem criou o RocketBox?','known'],['O que você consegue fazer?'],
 ['Obg','thanks'],['Vlw','thanks'],['Tudo bem?','return'],['Você consegue me ajudar?'],['O que podemos fazer hoje?'],
 ['Como registro um asset?'],['Explique como funciona o Convés.'],['Me explique isso de forma simples.'],['Me dê uma explicação técnica detalhada.'],
 ['Coloque a etiqueta Personagem na Jade.','tag'],['Mova a Lucy para a pasta personagens.','move'],['Não encontrei meu asset.'],['Organize minha biblioteca.','ambiguous'],['Envie este registro para a lixeira.','trash'],
 ['Explique basicamente como funciona o RocketBox.'],['Responda usando português brasileiro.'],['Explique em inglês como registrar um asset.','english'],
];

for(const [prompt,kind] of cases)test(`Linguagem/contrato: ${prompt}`,async()=>{
 const storageMap=new Map(),storage={getItem:k=>storageMap.get(k)??null,setItem:(k,v)=>storageMap.set(k,v)};
 const store=createWorkspaceStore({storage});store.transact(d=>{d.folders=[{id:'f',name:'personagens',parent:null}];d.assets=['Jade','Lucy'].map((nome,i)=>({id:'a'+i,nome,caminho:`C:/ISOLATED/${nome}.obj`,formato:'.obj',folder:null,categoria:'Objeto',tags:[]}));});
 const operations=createLibraryOperationsService(store),before=store.snapshot(),requests=[];
 const history=kind==='opening'?[]:existing;
 let intent={intent:'general_chat',entities,proposedTool:null,referencesPrior:false,requiresClarification:false};
 if(kind==='tag')intent={...intent,intent:'manage_tags',proposedTool:'assignTags',entities:{...entities,assetName:'Jade',tag:'Personagem'}};
 if(kind==='move')intent={...intent,intent:'organize_assets',proposedTool:'moveAssetRecord',entities:{...entities,assetName:'Lucy',targetFolderName:'personagens'}};
 if(kind==='trash')intent={...intent,intent:'trash_records',proposedTool:'moveToTrash',entities:{...entities,assetName:'Jade'}};
 if(kind==='ambiguous')intent={...intent,intent:'clarification_needed',requiresClarification:true};
 const reply=kind==='english'?'Use Registrar Asset to select a file and review the registration.':'Resposta de teste com nomes e código preservados: `Actually`, `Basically` e **Workspace**.';
 const result=await converseWithOllama({prompt,history,config:{provider:'ollama',endpoint:'http://127.0.0.1:11434',model:'local'},operations,context:{folderId:null,selectedAssetIds:['a0'],project:null,filters:{}},signal:AbortSignal.timeout(2000),onText(){},fetchImpl:async(url,init)=>{
  if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'local'}]});
  const body=JSON.parse(init.body);requests.push(body);
  return body.format?frames({content:JSON.stringify(intent)}):frames({content:reply});
 }});
 assert.deepEqual(store.snapshot(),before,'Nunca gravar enquanto se testa linguagem ou se prepara plano');
 if(['tag','move','trash'].includes(kind)){assert.ok(result.plan);assert.equal(result.kind,'action-plan');assert.equal(requests.length,1);return;}
 if(kind==='known'){assert.match(result.message,/OCSIS/);assert.equal(requests.length,0);return;}
 assert.equal(result.message,reply,'Nenhuma correção global pode alterar palavras, código, Markdown ou idioma da resposta');
 const finals=requests.filter(body=>!body.format);assert.equal(finals.length,1,'Somente uma geração final, sem chamada revisora');
 const system=finals[0].messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
 assert.ok(system.includes('Linguagem e personalidade da NautIA'));
 assert.equal(finals[0].messages.some(m=>m.role==='user'&&m.content===prompt),true);
 if(kind==='opening')assert.ok(system.includes(NAUTIA_OPENING_INSTRUCTIONS));
 else assert.ok(!system.includes(NAUTIA_OPENING_INSTRUCTIONS));
 assert.equal(finals[0].tools,undefined,'Informação casual ou explicação não chama ferramenta de alteração');
});
