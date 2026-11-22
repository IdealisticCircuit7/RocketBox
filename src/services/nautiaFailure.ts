export type NautiaFailureCause='user'|'conversation-change'|'unmount'|'timeout'|'stream-interrupted'|'tool-failure'|'connection-or-generation';
export function nautiaFailureCause(error:unknown,signal?:AbortSignal):NautiaFailureCause {
  const reason=signal?.reason;
  if(reason&&['user','conversation-change','unmount'].includes(reason.cause))return reason.cause;
  const name=error instanceof Error?error.name:'';
  if(name==='TimeoutError'||/timed?\s*out|timeout|tempo.*esgotad/i.test(String(error)))return 'timeout';
  if(name==='AbortError'||/AbortError/i.test(String(error)))return 'stream-interrupted';
  return 'connection-or-generation';
}
export function nautiaFailureMessage(cause:NautiaFailureCause):string {
  if(cause==='timeout')return 'A solicitação atingiu o tempo limite. Nenhum plano de alteração foi executado. Você pode tentar novamente.';
  if(cause==='stream-interrupted')return 'A comunicação com o modelo local foi interrompida antes de concluir. Nenhum plano de alteração foi executado.';
  return 'Não consegui concluir a resposta local. Verifique a conexão e o modelo nas configurações. Nenhum plano de alteração foi executado.';
}
