import {useEffect,useRef,useState} from 'react';
import portrait from '../../assets/branding/nautia-portrait.png';
import {manifest,acquireNautiaImages} from '../../services/nautiaAvatarResources';
import {createKritaRig} from '../../services/nautiaKritaRig';
import type {NautiaAvatarState} from '../../services/nautiaAvatarState';
import {nautiaThought,type NautiaThoughtCategory} from '../../services/nautiaThoughts';
import './nautiaAvatar.css';
const stateLabels:Record<NautiaAvatarState,string>={idle:'em repouso',thinking:'pensando',speaking:'respondendo',uncertainty:'em dúvida',drowsy:'sonolenta',sleeping:'standby'};
export function NautiaAvatar({state,thoughtCategory='generic'}:{state:NautiaAvatarState;thoughtCategory?:NautiaThoughtCategory}) {
  const canvas=useRef<HTMLCanvasElement>(null),currentState=useRef(state);
  const control=useRef<{state:(value:NautiaAvatarState)=>void}|null>(null);
  const [failure,setFailure]=useState(''),[ready,setReady]=useState(false);
  const [animate,setAnimate]=useState(false);
  const [thoughtIndex,setThoughtIndex]=useState(0);
  useEffect(()=>{currentState.current=state;control.current?.state(state);},[state]);
  useEffect(()=>{
    const element=canvas.current;if(!element)return;
    let disposed=false,images:Map<string,HTMLImageElement>|null=null,frame=0,time=0,last=0,drawn=0,key='',visible=false,thoughtSince=0,thoughtStep=0;
    const rig=createKritaRig(manifest),context=element.getContext('2d');
    let resources:ReturnType<typeof acquireNautiaImages>|null=null;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    element.width=manifest.viewBox.width;element.height=manifest.viewBox.height;
    const motion=()=>!reduced.matches&&!document.documentElement.classList.contains('no-animations')&&!document.documentElement.classList.contains('performance-mode');
    const draw=(now:number,force=false)=>{if(!images||!context)return;const signature=JSON.stringify(rig.inspect(time,now));if(force||signature!==key){key=signature;rig.draw(context,images,time,now);}};
    const tick=(now:number)=>{frame=0;if(disposed||!visible||document.hidden||!images)return;
      if(now-drawn>=1000/30){time+=Math.min((now-last)/1000,.05);last=now;drawn=now;draw(now);}
      if(currentState.current==='thinking'&&now-thoughtSince>=3000){thoughtSince=now;setThoughtIndex(++thoughtStep);}
      if(motion())frame=requestAnimationFrame(tick);
    };
    const sync=()=>{cancelAnimationFrame(frame);frame=0;setAnimate(visible&&!document.hidden&&motion());rig.setMotion(motion());last=performance.now();rig.setState(currentState.current,last);if(visible&&!document.hidden){
      if(!resources){resources=acquireNautiaImages();resources.ready.then(result=>{if(disposed)return;images=result;setReady(true);sync();}).catch(error=>{if(!disposed)setFailure(String(error));});}
      draw(last,true);if(motion()&&images)frame=requestAnimationFrame(tick);}};
    control.current={state(value){rig.setState(value);thoughtSince=performance.now();thoughtStep=0;setThoughtIndex(0);key='';sync();}};
    // The canvas is hidden until ready; observing it would prevent its own image loading forever.
    const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;sync();});observer.observe(element.parentElement!);
    const preferences=new MutationObserver(sync);preferences.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
    return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();preferences.disconnect();document.removeEventListener('visibilitychange',sync);reduced.removeEventListener('change',sync);control.current=null;images=null;resources?.release();};
  },[]);
  return <div className="nautia-animated-avatar" data-avatar-state={state} data-animate={animate} aria-label={`NautIA · ${stateLabels[state]}`} role="img">
    {!ready||failure?<img className="nautia-animated-avatar__fallback" src={portrait} alt=""/>:null}
    <canvas ref={canvas} className={ready&&!failure?'is-ready':''} aria-hidden="true"/>
    {state==='thinking'&&<div className="nautia-thought" aria-hidden="true"><span key={`${thoughtCategory}-${thoughtIndex}`}>{nautiaThought(thoughtCategory,thoughtIndex)}</span><i/><i/></div>}
    {state==='sleeping'&&<div className="nautia-sleep-zzz" aria-hidden="true"><span>Z</span><span>Z</span><span>Z</span></div>}
    {failure&&<span className="nautia-avatar-error" role="status">Avatar animado indisponível; retrato estático ativo.</span>}
  </div>;
}
