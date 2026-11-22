import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nautiaTemporalContext} from '../src/services/nautiaTemporalContext.ts';
import {converseWithOllama} from '../src/services/ollamaConversation.ts';
import {NAUTIA_OPENING_INSTRUCTIONS,nautiaLanguageContext} from '../src/services/nautiaLanguageContext.ts';
import {createWorkspaceStore} from '../src/workspace-store.js';
import {createLibraryOperationsService} from '../src/services/libraryOperationsService.ts';

const entities=Object.fromEntries(['query','assetName','folderName','project','format','software','dateHint','tag'].map(k=>[k,null]));
const chat={intent:'general_chat',entities,referencesPrior:false,requiresClarification:false,proposedTool:null};
const fixed=new Date('2026-11-18T15:45:00Z');

test('Cumprimentos e papo comum não recebem data/hora só porque o relógio existe',()=>{
 for(const prompt of ['Oi','Bom dia!','Olá NautIA','Tudo bem?','Obg'])assert.equal(nautiaTemporalContext(prompt,chat,true,fixed),'');
 for(const prompt of ['Quero ideias para organizar meu projeto.','O que podemos fazer hoje?','Vamos conversar um pouco?','Tenho uma dúvida sobre materiais.'])assert.equal(nautiaTemporalContext(prompt,chat,false,fixed),'');
});

test('Perguntas sobre datas preservam referência real; relógio só entra quando perguntado',()=>{
 const date=new Intl.DateTimeFormat('sv-SE').format(fixed);
 for(const prompt of ['Qual é a data de hoje?','Que dia é hoje?','Qual dia será amanhã?','Informe a data atual.','What is the date today?']){
  const result=nautiaTemporalContext(prompt,chat,false,fixed);assert.ok(result.includes(date),prompt);assert.ok(!result.includes('Horário local:'),prompt);
 }
 const time=nautiaTemporalContext('Que horas são?',chat,false,fixed);
 assert.match(time,/Horário local: \d{2}:\d{2}/);assert.ok(time.includes(new Intl.DateTimeFormat().resolvedOptions().timeZone));
});

test('Filtros relativos e planejamento conservam a data anteriormente disponível para operações',()=>{
 const search={...chat,intent:'search_assets',proposedTool:'searchAssets',entities:{...entities,dateHint:'ontem'}};
 assert.match(nautiaTemporalContext('Mostre os assets registrados ontem.',search,false,fixed),/Data local:/);
 assert.match(nautiaTemporalContext('Mova Lucy para Personagens.',{...chat,intent:'organize_assets'},false,fixed),/Data local:/);
 assert.match(nautiaTemporalContext('Mostre os assets registrados ontem.',search,false,fixed),/somente se necessária/);
});

test('Abertura permanece protegida, com instrução explícita de três linhas sem data extra',()=>{
 assert.equal(nautiaLanguageContext([],true),NAUTIA_OPENING_INSTRUCTIONS);
 const persona=readFileSync(new URL('../ai/Nautia_llm/prompts/persona.md',import.meta.url),'utf8');
 assert.match(persona,/três linhas/);assert.match(persona,/sugestões proativas/);assert.match(persona,/Não acrescente uma linha sobre a data/);assert.match(persona,/Ter uma informação no contexto não significa/);
});

for(const [prompt,social,expectsDate,expectsTime] of [
 ['Oi',true,false,false],['Bom dia!',true,false,false],['Tudo bem?',true,false,false],['Obg',true,false,false],
 ['Vamos conversar um pouco?',false,false,false],['O que podemos fazer hoje?',false,false,false],
 ['Qual é a data de hoje?',false,true,false],['Que horas são?',false,true,true],
])test(`Contexto enviado ao modelo: ${prompt}`,async()=>{
 const map=new Map(),store=createWorkspaceStore({storage:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}}),operations=createLibraryOperationsService(store);
 const requests=[],chunks=[],reply='Texto de teste preservado, com **Markdown** e `date` no código.';
 const result=await converseWithOllama({prompt,history:[],config:{provider:'ollama',endpoint:'http://127.0.0.1:11434',model:'test'},operations,context:{folderId:null,selectedAssetIds:[],project:null,filters:{}},signal:AbortSignal.timeout(2000),onText(){},onGeneratedText:text=>chunks.push(text),fetchImpl:async(url,init)=>{
  if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'test'}]});
  const body=JSON.parse(init.body);requests.push(body);
  return new Response(JSON.stringify({message:{content:body.format?JSON.stringify(chat):reply},done:true})+'\n');
 }});
 const generations=requests.filter(r=>!r.format);assert.equal(generations.length,1);
 const system=generations[0].messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
 assert.equal(system.includes('Data local:'),expectsDate);assert.equal(system.includes('Horário local:'),expectsTime);
 if(expectsDate){
  assert.ok(!generations[0].messages[0].content.includes('Data local:'),'Sem repetir a referência temporal em vários prompts');
  assert.match(generations[0].messages.at(-1).content,/Data local:/);
  assert.match(generations[0].messages.at(-1).content,/Não acrescente ofertas de organizar assets/);
 }
 assert.equal(requests.length,social?1:2,'Sem nova etapa de revisão ou inferência para decidir sobre datas');
 assert.equal(result.message,reply);assert.equal(chunks.at(-1),reply,'Streaming sem filtro/reescrita de texto');
});
