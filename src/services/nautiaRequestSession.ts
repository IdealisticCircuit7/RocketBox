export interface NautiaRequestIdentity {requestId:string;conversationId:string;userMessageId:string;assistantMessageId:string;}
export interface NautiaRequest extends NautiaRequestIdentity {controller:AbortController;publishedText:string;}
/** Synchronous ownership: old callbacks/finalizers cannot affect a newer request. */
export function createNautiaRequestSession(){
  let current:NautiaRequest|null=null;
  return {
    get current(){return current;},
    begin(identity:NautiaRequestIdentity){if(current)return null;current={...identity,controller:new AbortController(),publishedText:''};return current;},
    owns(request:NautiaRequest){return current===request;},
    accepts(request:NautiaRequest){return current===request&&!request.controller.signal.aborted;},
    finish(request:NautiaRequest){if(current!==request)return false;current=null;return true;},
    cancel(cause:'user'|'conversation-change'|'unmount'='user'){const previous=current;current=null;previous?.controller.abort(Object.assign(new DOMException('Solicitação encerrada','AbortError'),{cause}));return previous;},
  };
}
