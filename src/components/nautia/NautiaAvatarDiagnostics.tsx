import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {createNautiaAvatarState,type NautiaAvatarState} from '../../services/nautiaAvatarState';

/** Isolated visual simulation: no prompts, tools, model calls or conversation writes. */
export function NautiaAvatarDiagnostics({onPreview}:{onPreview:(state:NautiaAvatarState|null)=>void}){
  const controller=useMemo(()=>createNautiaAvatarState(),[]);
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  const [active,setActive]=useState(false),[text,setText]=useState('');
  const interval=useRef<ReturnType<typeof setInterval>|undefined>(undefined);
  const stop=()=>{clearInterval(interval.current);interval.current=undefined;};
  useEffect(()=>{controller.start();return()=>{clearInterval(interval.current);controller.dispose();onPreview(null);};},[controller,onPreview]);
  useEffect(()=>{onPreview(active?state:null);},[active,state,onPreview]);
  const pose=(value:NautiaAvatarState)=>{stop();setActive(true);setText('');controller.preview(value);};
  const stream=()=>{
    stop();setActive(true);setText('');const id=controller.begin();let index=0;
    const chunks=['Esta',' é',' uma',' simulação',' visual',' de streaming.'];
    interval.current=setInterval(()=>{
      setText(chunks.slice(0,++index).join(''));controller.phase(id,'speaking');
      if(index===chunks.length){stop();controller.finish(id);}
    },500);
  };
  return <details className="nautia-avatar-diagnostics" onToggle={event=>{if(!event.currentTarget.open){stop();controller.preview('idle');setActive(false);}}}>
    <summary>Diagnóstico do avatar</summary>
    <p>Simulação visual · não executa ações.</p>
    <div className="nautia-avatar-diagnostic-actions">
      <button type="button" onClick={()=>pose('thinking')}>Pensar / balão</button>
      <button type="button" onClick={stream}>Simular streaming</button>
      <button type="button" onClick={()=>pose('speaking')}>Pose explicativa</button>
      <button type="button" onClick={()=>pose('drowsy')}>Sonolência</button>
      <button type="button" onClick={()=>pose('sleeping')}>Sono profundo</button>
      <button type="button" onClick={()=>pose('idle')}>Despertar</button>
      <button type="button" onClick={()=>pose('thinking')}>Interromper / nova mensagem</button>
      <button type="button" onClick={()=>{pose('idle');setActive(false);}}>Encerrar teste</button>
    </div>
    {active&&<output aria-live="polite">{state}{text?` · ${text}`:''}</output>}
  </details>;
}
