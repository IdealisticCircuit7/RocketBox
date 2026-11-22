import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import type { LlmClientConfig } from './llmClient.ts';
import { nautiaConfig } from '../../ai/Nautia_llm/runtime/foundation.ts';
import type { OllamaRawMetrics } from './nautiaPerformance.ts';

export function localEndpoint(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use um endpoint HTTP local, sem caminho ou credenciais.');
  return url.origin;
}
export const ollamaFetch: typeof fetch = async (input, init) => {
  if (!isTauri()) return fetch(input, init);
  const url = new URL(String(input)); const base = localEndpoint(url.origin);
  const id = crypto.randomUUID(); let finished = false;
  let dispose = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const abort = () => {
        if (!finished) {
          finished = true;
          const reason = init?.signal?.reason;
          const err = reason instanceof Error
            ? reason
            : new DOMException('Cancelado', 'AbortError');
          controller.error(err);
          dispose();
          void invoke('ollama_cancel', { id });
        }
      };
      init?.signal?.addEventListener('abort',abort,{once:true});
      dispose = () => init?.signal?.removeEventListener('abort',abort);
      const channel = new Channel<{bytes?: number[]; error?: string; done?: boolean}>();
      channel.onmessage = event => { if (finished) return; if (event.error) { finished = true; dispose(); controller.error(new Error(event.error)); } else if (event.done) { finished = true; dispose(); controller.close(); } else if (event.bytes) controller.enqueue(new Uint8Array(event.bytes)); };
      if (init?.signal?.aborted) { abort(); return; }
      void invoke('ollama_request', {id,base,route:url.pathname,body:init?.body ? JSON.parse(String(init.body)) : null,events:channel}).catch(error => { if (!finished) { finished=true;dispose();controller.error(new Error(String(error))); } });
    },
    cancel() { finished=true;dispose();void invoke('ollama_cancel',{id}); },
  });
  return new Response(stream);
};

export async function listOllamaModels(endpoint: string, fetchImpl = ollamaFetch, signal?: AbortSignal): Promise<string[]> {
  const deadline=AbortSignal.timeout(5000);
  const response = await fetchImpl(`${localEndpoint(endpoint)}/api/tags`, {signal: signal ? AbortSignal.any([signal,deadline]) : deadline, redirect:'error'});
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.models)) throw new Error('Resposta de modelos inválida.');
  return data.models.filter((m: {name?: unknown; remote_host?: unknown; remote_model?: unknown}) => typeof m.name === 'string' && !m.remote_host && !m.remote_model && !/cloud/i.test(m.name)).map((m: {name:string}) => m.name);
}

export interface OllamaMessage { role: 'system'|'user'|'assistant'|'tool'; content: string; tool_calls?: OllamaCall[]; tool_name?: string }
export interface OllamaCall { function: { name: string; arguments: unknown } }
export async function streamOllama(config: LlmClientConfig, messages: OllamaMessage[], tools: unknown[], signal: AbortSignal, onText: (text:string)=>void, fetchImpl = ollamaFetch, generation: {format?:unknown;numPredict?:number;temperature?:number;onMetrics?:(metrics:OllamaRawMetrics)=>void} = {}): Promise<OllamaMessage> {
  const startedAt = performance.now();
  // Match the native per-call deadline and retain a typed TimeoutError in the renderer.
  signal=AbortSignal.any([signal,AbortSignal.timeout(120000)]);
  let firstTokenMs: number | undefined;
  const response = await fetchImpl(`${localEndpoint(config.endpoint)}/api/chat`, {method:'POST', redirect:'error',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({model:config.model,messages,stream:true,think:false,format:generation.format,keep_alive:nautiaConfig.keepAlive,tools:tools.length ? tools : undefined,options:{temperature:generation.temperature??nautiaConfig.temperature,num_ctx:nautiaConfig.numCtx,num_predict:generation.numPredict??nautiaConfig.numPredict}})});
  if (!response.ok || !response.body) throw new Error(`Ollama HTTP ${response.status}`);
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer='', content='', total=0, done=false; const calls: OllamaCall[]=[];
  function consume(line:string) {
    if (!line.trim()) return;
    const frame = JSON.parse(line); if (frame.error) throw new Error(String(frame.error));
    if (typeof frame.message?.content === 'string') {
      if (firstTokenMs === undefined && frame.message.content.length > 0) firstTokenMs = Math.round(performance.now() - startedAt);
      content += frame.message.content; if (content.length > 32000) throw new Error('Resposta muito longa.'); onText(content);
    }
    if (frame.message?.tool_calls) { if (!Array.isArray(frame.message.tool_calls)) throw new Error('Chamadas de ferramenta inválidas.'); calls.push(...frame.message.tool_calls); if (calls.length > 8) throw new Error('Limite de ferramentas excedido.'); }
    if (frame.done) {
      done = true;
      generation.onMetrics?.({
        totalDurationNs: typeof frame.total_duration === 'number' ? frame.total_duration : undefined,
        loadDurationNs: typeof frame.load_duration === 'number' ? frame.load_duration : undefined,
        promptEvalDurationNs: typeof frame.prompt_eval_duration === 'number' ? frame.prompt_eval_duration : undefined,
        evalDurationNs: typeof frame.eval_duration === 'number' ? frame.eval_duration : undefined,
        promptEvalCount: typeof frame.prompt_eval_count === 'number' ? frame.prompt_eval_count : undefined,
        evalCount: typeof frame.eval_count === 'number' ? frame.eval_count : undefined,
        firstTokenMs,
      });
    }
  }
  try {
    while (true) { signal.throwIfAborted(); const {value,done:ended}=await reader.read(); if (ended) break; total+=value.length; if(total>2*1024*1024) throw new Error('Resposta muito grande.'); buffer+=decoder.decode(value,{stream:true}); let newline; while((newline=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,newline));buffer=buffer.slice(newline+1);} }
    buffer+=decoder.decode(); if(buffer.trim())consume(buffer); if(!done)throw new Error('Resposta Ollama interrompida.');
    return {role:'assistant',content,...(calls.length?{tool_calls:calls}:{})};
  } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
}
