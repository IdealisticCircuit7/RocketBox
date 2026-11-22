// Explicit manual smoke: no downloads, no library data sent.
import { listOllamaModels, streamOllama } from '../src/services/ollamaClient.ts';
import { converseWithOllama } from '../src/services/ollamaConversation.ts';
import { createWorkspaceStore } from '../src/workspace-store.js';
import { createLibraryOperationsService } from '../src/services/libraryOperationsService.ts';
const endpoint='http://127.0.0.1:11434';
const models=await listOllamaModels(endpoint,fetch);
if(!models.length)throw new Error('Nenhum modelo local instalado.');
const config={provider:'ollama',endpoint,model:models[0]};
const result=await streamOllama(config,[{role:'user',content:'Responda apenas: conexão local funcionando.'}],[],AbortSignal.timeout(90000),()=>{},fetch);
if(!result.content.trim())throw new Error('Modelo sem resposta textual.');
console.log(JSON.stringify({model:config.model,response:result.content}));
const storage={getItem:()=>null,setItem:()=>{}};
const operations=createLibraryOperationsService(createWorkspaceStore({storage}));
const grounded=await converseWithOllama({config,prompt:'Use a ferramenta getCurrentContext para informar quantos assets estão selecionados agora. Não busque outros dados.',history:[],context:{folderId:null,selectedAssetIds:[],project:null,filters:{}},operations,signal:AbortSignal.timeout(90000),onText:()=>{},fetchImpl:fetch});
if(!grounded.toolData?.length)throw new Error('O modelo não chamou a ferramenta de contexto.');
console.log(JSON.stringify({groundedResponse:grounded.message,tools:grounded.toolData.map(r=>({tool:r.tool,ok:r.ok}))}));
