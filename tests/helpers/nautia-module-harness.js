import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as conversationStore from '../../src/services/nautiaConversationStore.ts';
import * as requestSession from '../../src/services/nautiaRequestSession.ts';
import * as flow from '../../src/services/nautiaConversationFlow.ts';
import * as knowledge from '../../src/services/rocketBoxKnowledge.ts';
import * as avatarState from '../../src/services/nautiaAvatarState.ts';
import * as thoughts from '../../src/services/nautiaThoughts.ts';
import * as quickReplies from '../../src/services/nautiaQuickReplies.ts';
import * as nautiaPerf from '../../src/services/nautiaPerformance.ts';
import * as nautiaLanguage from '../../src/services/nautiaLanguageContext.ts';
import * as nautiaFailure from '../../src/services/nautiaFailure.ts';
export function createModuleHarness(initial,{context={folderId:null,selectedAssetIds:[],project:null,filters:{}},selectedAssets=[]}={}){
 let hook=0,root,scheduled=[],saved=initial,connectionChecks=0;const cells=[],calls=[],cleanups=[];
 const storage=new Map(),document={};
 const memo=(factory,deps)=>{const index=hook++,old=cells[index];if(!old||!deps||deps.some((d,i)=>d!==old.deps?.[i]))cells[index]={value:factory(),deps};return cells[index].value;};
 const react={Fragment:'fragment',useState:initial=>{const index=hook++;if(!cells[index])cells[index]={value:typeof initial==='function'?initial():initial};return [cells[index].value,value=>{cells[index].value=typeof value==='function'?value(cells[index].value):value;}];},useRef:initial=>memo(()=>({current:initial}),[]),useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useSyncExternalStore:(_subscribe,get)=>get(),useEffect:(effect,deps)=>{const index=hook++,old=cells[index];if(!old||!deps||deps.some((d,i)=>d!==old.deps?.[i])){cells[index]={deps};scheduled.push(()=>{old?.cleanup?.();cells[index].cleanup=effect();});}}};
 react.useLayoutEffect=react.useEffect;
 const fakeLlm={loadLocalLlmConfig:()=>({provider:'ollama',endpoint:'http://127.0.0.1:11434',model:'installed'}),converseWithOllama:params=>new Promise((resolve,reject)=>calls.push({params,resolve,reject}))};
 const knownModules={nautiaLanguageContext:nautiaLanguage,nautiaRequestSession:requestSession,nautiaConversationFlow:flow,rocketBoxKnowledge:knowledge,nautiaAvatarState:avatarState,nautiaThoughts:thoughts,nautiaQuickReplies:quickReplies,nautiaPerformance:nautiaPerf,ollamaConversation:fakeLlm,
  ollamaClient:{localEndpoint:value=>value},nautiaConnectionService:{connectNautia:async()=>{connectionChecks++;return {models:['installed'],model:'installed',verifiedAt:Date.now()};}},nautiaFoundation:{nautiaConfig:{version:'test'}},
  nautiaConversationStore:{...conversationStore,loadNautiaConversations:()=>initial,restoreActiveConversation:()=>initial[0],saveNautiaConversations:value=>{saved=value;}},
  llmClient:{DEFAULT_LLM_CONFIG:{provider:'none'}},nautiaOrchestratorService:{orchestrateNaturalLanguageRequest:async()=>({kind:'guidance',message:'Resposta determinística.'}),executeApprovedActionPlan:()=>{throw new Error('Unexpected mutation');}}};
 const source=fs.readFileSync(new URL('../../src/components/nautia/NautiaModuleView.tsx',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const exports={};
 vm.runInNewContext(compiled,{exports,structuredClone,AbortController,AbortSignal,DOMException,Date,Set,Map,console,document,performance,
  setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},window:{addEventListener(){},removeEventListener(){}},
  require:name=>{
   if(name==='react')return {...react,__esModule:true,default:react};
   if(name==='react/jsx-runtime')return {jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key}),Fragment:'fragment'};
   if(name.endsWith('/nautiaFailure'))return nautiaFailure;
   const base=name.split('/').pop();if(knownModules[base])return knownModules[base];
   return new Proxy({},{get:(_target,key)=>{const component=()=>null;Object.defineProperty(component,'name',{value:String(key)});return component;}});
  },
 });
 const props={context,currentFolder:'Raiz real',folders:[],selectedAssets,showAvatar:true,operations:{},history:{},historyEntries:[],onLibraryMutated(){},onNotify(){}};
 const scrollCalls=[],chatGeometry={scrollHeight:1000,scrollTop:0,clientHeight:300,scrollTo:({top})=>{chatGeometry.scrollTop=top;scrollCalls.push(top);}};
 const render=()=>{hook=0;scheduled=[];root=exports.NautiaModuleView(props);const log=nodes().find(n=>n.props?.role==='log');if(log)log.props.ref.current=chatGeometry;scheduled.forEach(fn=>fn());return root;};
 const nodes=()=>{const result=[];function visit(node){if(Array.isArray(node)){node.forEach(visit);return;}if(!node||typeof node!=='object')return;result.push(node);visit(node.props?.children);}visit(root);return result;};
 const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):node==null||node===false?'':String(node);
 const find=predicate=>nodes().find(predicate);
 const button=label=>find(node=>node.type==='button'&&(node.props?.['aria-label']??text(node))===label);
 const thread=()=>find(node=>node.type?.name==='NautiaChatThread')?.props;
 const prompt=async value=>{find(node=>node.type==='textarea').props.onChange({target:{value}});render();find(node=>node.type==='form').props.onSubmit({preventDefault(){}});await Promise.resolve();render();};
 render();
 return {render,nodes,find,text,button,thread,prompt,calls,chatGeometry,scrollCalls,get saved(){return saved;},get connectionChecks(){return connectionChecks;},async flush(){await Promise.resolve();await Promise.resolve();render();},dispose(){for(const cell of cells)cell?.cleanup?.();cleanups.forEach(fn=>fn());}};
}
