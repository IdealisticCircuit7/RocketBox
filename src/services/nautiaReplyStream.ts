/** Publish complete clauses once. A failed evidence check never starts another visible generation. */
export function createNautiaReplyStream(publish:(text:string)=>void,isUnverified:(text:string)=>boolean){
 let raw='',consumed=0,visible='',blocked=false;
 const append=(part:string)=>{if(!part)return;if(isUnverified(part)){blocked=true;return;}visible+=part;publish(visible);};
 return {
  write(text:string){
   if(!text.startsWith(raw))throw new Error('O streaming retornou conteúdo fora de sequência.');
   raw=text;if(blocked)return;
   const start=consumed,pending=raw.slice(start),ends=[...pending.matchAll(/[.!?](?=\s|$)|\n/g)];
   for(const end of ends){const until=start+(end.index??0)+1;const part=raw.slice(consumed,until);append(part);consumed=until;if(blocked)break;
   }
  },
  finish(){
   if(!blocked)append(raw.slice(consumed));
   if(blocked){visible+=(visible.trim()?'\n\n':'')+'Não consegui verificar essa afirmação nos serviços do RocketBox. Nenhuma alteração foi executada por esta resposta.';publish(visible);}
   return {text:visible,blocked};
  },
 };
}
