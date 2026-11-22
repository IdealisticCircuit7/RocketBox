export type NautiaAvatarState = 'idle'|'thinking'|'speaking'|'uncertainty'|'drowsy'|'sleeping';
/** Request ownership and behavior deadlines belong here, never to chat text length. */
export function createNautiaAvatarState(sleepMs=60000, uncertaintyMs=4000, options:{drowsyMs?:number;minimumSpeakingMs?:number}={}) {
  let state:NautiaAvatarState='idle',sequence=0,active:number|null=null;
  let running=false,timer:ReturnType<typeof setTimeout>|undefined,speakingSince:number|null=null;
  let minimumSpeakingMs=options.minimumSpeakingMs??450;
  const drowsyMs=options.drowsyMs??3000;
  const listeners=new Set<()=>void>();
  function set(next:NautiaAvatarState){if(next!==state){state=next;listeners.forEach(fn=>fn());}}
  function clear(){clearTimeout(timer);timer=undefined;}
  function arm(){clear();if(running&&active===null)timer=setTimeout(()=>{set('drowsy');timer=setTimeout(()=>{timer=undefined;set('sleeping');},drowsyMs);},sleepMs);}
  const api={
    getSnapshot:()=>state,
    subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
    start(){running=true;arm();},
    activity(){if(active!==null)return;if(state==='sleeping'||state==='drowsy')set('idle');if(state==='idle')arm();},
    begin(){clear();active=++sequence;speakingSince=null;set('thinking');return active;},
    phase(id:number,phase:'thinking'|'speaking'){if(active!==id)return;if(phase==='speaking'&&state!=='speaking')speakingSince=Date.now();if(phase==='thinking')speakingSince=null;set(phase);},
    finish(id:number,result:'ok'|'cancelled'|'error'='ok'){if(active!==id)return;active=null;clear();
      if(result==='error'){speakingSince=null;set('uncertainty');if(running)timer=setTimeout(()=>{set('idle');arm();},uncertaintyMs);}
      else {
        const remaining=result==='ok'&&state==='speaking'&&speakingSince!==null?Math.max(0,minimumSpeakingMs-(Date.now()-speakingSince)):0;
        speakingSince=null;
        if(remaining&&running)timer=setTimeout(()=>{set('idle');arm();},remaining);
        else {set('idle');arm();}
      }
    },
    uncertainty(){if(active!==null)return;const id=api.begin();api.finish(id,'error');},
    cancel(){if(active!==null)api.finish(active,'cancelled');},
    configureSleep(ms:number){if(Number.isFinite(ms)&&ms>=10000&&ms<=3600000){sleepMs=ms;if(state==='idle')arm();}},
    configureMinimumSpeaking(ms:number){if(Number.isFinite(ms)&&ms>=0&&ms<=1500)minimumSpeakingMs=ms;},
    /** Only the isolated diagnostic instance uses this; no chat operation is executed. */
    preview(next:NautiaAvatarState){clear();active=null;speakingSince=null;set(next);},
    dispose(){running=false;clear();active=null;speakingSince=null;set('idle');},
  };
  return api;
}
