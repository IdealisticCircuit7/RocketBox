import { invoke, isTauri } from '@tauri-apps/api/core';
import { listOllamaModels, ollamaFetch, localEndpoint } from './ollamaClient.ts';
import type { LlmClientConfig } from './llmClient.ts';
import { nautiaConfig } from '../../ai/Nautia_llm/runtime/foundation.ts';

export function selectAvailableNautiaModel(models: readonly string[], configured: string): string {
  if(models.includes(configured))return configured;
  if(configured && configured!==nautiaConfig.modelName)return ''; // don't silently replace an explicit user choice
  return [nautiaConfig.modelName,nautiaConfig.baseModel].find(model=>models.includes(model))??'';
}
export async function connectNautia(config:LlmClientConfig, signal:AbortSignal, options:{fetchImpl?:typeof fetch;ensureService?:(base:string)=>Promise<unknown>}={}) {
  localEndpoint(config.endpoint);
  const fetchImpl=options.fetchImpl??ollamaFetch;
  let models:string[];
  try { models=await listOllamaModels(config.endpoint,fetchImpl,signal); }
  catch(error) {
    if(signal.aborted)throw error;
    const ensure=options.ensureService??(isTauri()&&nautiaConfig.autoStartLocalService?(base:string)=>invoke('ollama_ensure_service',{base}):undefined);
    if(!ensure)throw error;
    await ensure(config.endpoint); signal.throwIfAborted(); models=await listOllamaModels(config.endpoint,fetchImpl,signal);
  }
  const model=selectAvailableNautiaModel(models,config.model);
  if(!model)throw new Error(models.length?'Modelo configurado ausente. Prepare nautia:0.1 ou selecione um modelo instalado.':'Ollama disponível sem modelos locais. Prepare nautia:0.1; nenhum download foi iniciado.');
  return {models,model,verifiedAt:Date.now(),usingBase:model===nautiaConfig.baseModel};
}
