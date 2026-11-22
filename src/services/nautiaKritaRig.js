/** Extracted from the approved Krita lab. Sprite selection, layering and pose interpolation are preserved. */
export function createKritaRig(model) {
 const layers=model.layers.filter(n=>n.src),eyeIds=new Set(Object.values(model.eyeModes)),mouthIds=new Set(Object.values(model.mouthModes));
 const interiorIds=new Set(model.mouthInterior.drawOrder),openMouthModes=new Set(model.mouthInterior.openModes);
 const headIds=new Set(model.facial.headLayers),browIds=new Set(Object.values(model.facial.brows).filter(Array.isArray).flat());
 const head=n=>headIds.has(n.order);
 const overrides=new Map();
 let playing=true,time=0,motion=true,frameNow=0,mouthStart=0,currentState='idle',wakeUntil=0;
 let tiltFrom=0,tiltTo=0,tiltStart=0;
 function headAngle(now){if(!motion)return 0;const f=Math.max(0,Math.min(1,(now-tiltStart)/900));return tiltFrom+(tiltTo-tiltFrom)*f*f*(3-2*f);}
 const settings={eyes:'auto',blink:true,brows:'auto',mouth:'closed',pose:'original',breathing:false,angle:0};
 function selectedEyes(){
  if(currentState==='idle'&&frameNow<wakeUntil)return 'half';
  const requested=settings.eyes,base=requested==='auto'?'open':requested;
  if(!playing||!settings.blink||['original','closed','winkLeft','winkRight'].includes(base))return base;
  const phase=time%model.facial.blink.period,b=model.facial.blink;
  if(phase>b.closedStart&&phase<b.closedEnd)return base==='thoughtful'?'thinking_closed':'closed';
  if(phase>b.halfStart&&phase<b.halfEnd){
   if(base==='thoughtful')return model.facial.thinking.half===null?'thoughtful':'thinking_half';
   return 'half';
  }
  return base;
 }
 function selectedBrows(){
  const mode=settings.brows;if(mode!=='auto')return Object.hasOwn(model.facial.brows,mode)?mode:'original';
  // Usar a expressão de base evita trocar sobrancelha durante a piscada.
  if(currentState==='sleeping'||currentState==='drowsy')return 'sleepy';
  if(settings.pose==='uncertain'||settings.mouth==='uncertain')return 'uncertain';
  if(settings.eyes==='thoughtful'||settings.pose==='thoughtful')return 'thinking';
  if(settings.eyes==='surprised')return 'surprised';
  return 'neutral';
 }
 function selectedMouth(){let mode=settings.mouth;if(mode==='auto')mode=!motion?'closed':['closed','light','a','light','o','closed'][Math.floor(Math.max(0,time-mouthStart)*8)%6];return mode;}
 function visible(n,eye,mouth){
  if(overrides.has(n.id))return overrides.get(n.id);
  if(browIds.has(n.order)&&selectedBrows()!=='original')return model.facial.brows[selectedBrows()].includes(n.order);
  if(eyeIds.has(n.order)&&eye!=='original'){const target=eye==='thinking_closed'?model.facial.thinking.closed:eye==='thinking_half'?model.facial.thinking.half:model.eyeModes[eye];return n.order===target||(eye.startsWith('wink')&&(n.order===45||n.order===47));}
  if(interiorIds.has(n.order)&&mouth!=='original')return openMouthModes.has(mouth);
  if(mouthIds.has(n.order)&&mouth!=='original')return n.order===model.mouthModes[mouth];
  if(neutralArmIds.has(n.order)||alternateArmIds.has(n.order))return true;
  return n.visible;
 }
 const neutralArmIds=new Set(model.poseRig.neutralArmIds),alternateArmIds=new Set(Object.values(model.bodyPoses).flat());
 function poseVisible(n,pose){
  if(neutralArmIds.has(n.order))return pose==='original'?n.visible:pose==='speaking'&&model.poseRig.speakingNeutralArmIds.includes(n.order);
  if(alternateArmIds.has(n.order))return (model.bodyPoses[pose]||[]).includes(n.order);
  return n.visible;
 }
 let poseTransition=null,settledPose='original';
 function poseWeight(n,now=performance.now()){
  if(!poseTransition)return poseVisible(n,settledPose)?1:0;
  const f=Math.max(0,Math.min(1,(now-poseTransition.start)/model.poseRig.transitionMs)),e=f*f*(3-2*f);
  return poseTransition.from[n.id]+((poseVisible(n,poseTransition.to)?1:0)-poseTransition.from[n.id])*e;
 }
 function changePose(pose,now=performance.now()){
  if(!Object.hasOwn(model.bodyPoses,pose))throw Error('Pose desconhecida: '+pose);
  const from=Object.fromEntries(layers.map(n=>[n.id,poseWeight(n,now)]));
  poseTransition={from,to:pose,start:now};settings.pose=pose;overrides.clear();
 }
 function renderLayers(ctx,images){
  const eye=selectedEyes(),mouth=selectedMouth();
  const bob=settings.breathing?Math.sin(time*1.8)*3:0;ctx.translate(0,bob);
  // Interior fixo atrás dos contornos originais; a pintura de pele destes faz a oclusão.
  const drawLayers=openMouthModes.has(mouth)?[...layers].sort((a,b)=>{const rank=n=>interiorIds.has(n.order)?30+model.mouthInterior.drawOrder.indexOf(n.order)/100:n.order;return rank(a)-rank(b)}):layers;
  for(const n of drawLayers){if(!visible(n,eye,mouth))continue;const weight=overrides.has(n.id)||(!neutralArmIds.has(n.order)&&!alternateArmIds.has(n.order))?1:poseWeight(n);if(weight<=0)continue;ctx.save();ctx.globalAlpha=n.opacity*weight;
   if(head(n)){const [x,y]=model.headPivot;ctx.translate(x,y);ctx.rotate(headAngle(frameNow)*Math.PI/180);ctx.translate(-x,-y);}
   if(browIds.has(n.order)){const offset=model.facial.browOffsets?.[selectedBrows()];if(offset)ctx.translate(offset.x,offset.y);}
   if(eye.startsWith('wink')&&(n.order===45||n.order===47)){
    const closedLeft=eye==='winkLeft',left=(n.order===45?closedLeft:!closedLeft);ctx.beginPath();ctx.rect(left?0:1287,0,left?1287:model.width-1287,model.height);ctx.clip();
   }
   if(n.sourceRect){const r=n.sourceRect;ctx.drawImage(images.get(n.src),r.x,r.y,r.w,r.h,n.x,n.y,n.w,n.h);}else ctx.drawImage(images.get(n.src),n.x,n.y,n.w,n.h);ctx.restore();
  }ctx.restore();
 }

 const poses={idle:['original','auto','closed'],thinking:['thoughtful','thoughtful','closed'],speaking:['speaking','auto','auto'],uncertainty:['uncertain','auto','uncertain'],drowsy:['original','half','closed'],sleeping:['standby','closed','closed']};
 return {
  setState(state,now=performance.now()){
   if(state!==currentState){
    if(state==='speaking')mouthStart=time;
    wakeUntil=state==='idle'&&['sleeping','drowsy'].includes(currentState)&&motion?now+180:0;
    tiltFrom=headAngle(now);tiltTo=state==='sleeping'?3:state==='drowsy'?1:0;tiltStart=now;
    // Wake, requests and errors restore the entire head/helmet group immediately.
    if(!['sleeping','drowsy'].includes(state)){tiltFrom=0;tiltTo=0;}
    currentState=state;
   }
   frameNow=now;const [pose,eyes,mouth]=poses[state]??poses.idle;if(settings.pose!==pose)changePose(pose,now);settings.eyes=eyes;settings.mouth=mouth;if(!motion){settledPose=pose;poseTransition=null;}
  },
  setMotion(enabled){motion=enabled;playing=enabled;if(!enabled){settledPose=settings.pose;poseTransition=null;}},
  draw(ctx,images,seconds,now=performance.now()) {time=seconds;frameNow=now;if(poseTransition&&now-poseTransition.start>=model.poseRig.transitionMs){settledPose=poseTransition.to;poseTransition=null;}const v=model.viewBox;ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.save();ctx.translate(-v.x,-v.y);
   renderLayers(ctx,images);
  },
  inspect(seconds,now){time=seconds;frameNow=now;return {angle:headAngle(now),eyes:selectedEyes(),mouth:selectedMouth(),brows:selectedBrows(),layers:layers.filter(n=>visible(n,selectedEyes(),selectedMouth())).map(n=>({order:n.order,weight:neutralArmIds.has(n.order)||alternateArmIds.has(n.order)?poseWeight(n,now):1}))};}
 };
}
