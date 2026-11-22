(async()=>{
 'use strict';
 const $=id=>document.getElementById(id),canvas=$('stage'),ctx=canvas.getContext('2d');
 const response=await fetch('krita-manifest.json',{cache:'no-store'});if(!response.ok)throw Error('Não foi possível ler o manifesto do Krita.');
 const model=await response.json(),images=new Map(),overrides=new Map();let playing=false,time=0,last=performance.now(),loaded=0;
 const layers=model.layers.filter(n=>n.src),eyeIds=new Set(Object.values(model.eyeModes)),mouthIds=new Set(Object.values(model.mouthModes));
 const interiorIds=new Set(model.mouthInterior.drawOrder),openMouthModes=new Set(model.mouthInterior.openModes);
 const load=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{images.set(src,im);loaded++;resolve(im)};im.onerror=()=>reject(Error('Imagem não encontrada: '+src));im.src=src;});
 await Promise.all([...new Set([...layers.map(n=>n.src),'krita-assets/referencia-atual.png'])].map(load));
 $('source').textContent=model.source.split(/[\\/]/).pop();
 let ready=true;
 const headIds=new Set(model.facial.headLayers),browIds=new Set(Object.values(model.facial.brows).filter(Array.isArray).flat());
 const head=n=>headIds.has(n.order);
 // Expressão de base e piscada são independentes. O retorno usa sempre a expressão escolhida.
 function selectedEyes(){
  const requested=$('eyes').value,base=requested==='auto'?'open':requested;
  if(!playing||!$('blink').checked||['original','closed','winkLeft','winkRight'].includes(base))return base;
  const phase=time%model.facial.blink.period,b=model.facial.blink;
  if(phase>b.closedStart&&phase<b.closedEnd)return base==='thoughtful'?'thinking_closed':'closed';
  if(phase>b.halfStart&&phase<b.halfEnd){
   if(base==='thoughtful')return model.facial.thinking.half===null?'thoughtful':'thinking_half';
   return 'half';
  }
  return base;
 }
 function selectedBrows(){
  const mode=$('brows').value;if(mode!=='auto')return Object.hasOwn(model.facial.brows,mode)?mode:'original';
  // Usar a expressão de base evita trocar sobrancelha durante a piscada.
  if($('mouth').value==='sleepy')return 'sleepy';
  if($('pose').value==='uncertain'||$('mouth').value==='uncertain')return 'uncertain';
  if($('eyes').value==='thoughtful'||$('pose').value==='thoughtful')return 'thinking';
  if($('eyes').value==='surprised')return 'surprised';
  return 'neutral';
 }
 function selectedMouth(){let mode=$('mouth').value;if(mode==='auto')mode=['closed','light','a','light','o','closed'][Math.floor(time*8)%6];return mode;}
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
 function changePose(pose){
  if(!Object.hasOwn(model.bodyPoses,pose))throw Error('Pose desconhecida: '+pose);
  const now=performance.now(),from=Object.fromEntries(layers.map(n=>[n.id,poseWeight(n,now)]));
  poseTransition={from,to:pose,start:now};$('pose').value=pose;overrides.clear();
 }
 let flow={phase:'idle',started:0,auto:false},chatText='';
 const demoText='A NautIA pode explicar uma informação com a palma esquerda voltada para cima, enquanto mantém a fala e as piscadas.';
 function animateFace(){playing=true;$('play').textContent='⏸ Pausar';$('brows').value='auto';}
 function processing(auto=false){flow={phase:'processing',started:performance.now(),auto};chatText='';$('chatPreview').textContent='Processando…';$('chatState').textContent='Processando';changePose('thoughtful');$('eyes').value='thoughtful';$('mouth').value='closed';animateFace();}
 function responseStarted(auto=false){flow={phase:'responding',started:performance.now(),auto};chatText='';$('chatState').textContent='Escrevendo resposta';$('chatPreview').textContent='';changePose('speaking');$('eyes').value='auto';$('mouth').value='auto';animateFace();}
 function responseFinished(){flow={phase:'idle',started:performance.now(),auto:false};$('chatState').textContent='Resposta concluída';changePose('original');$('mouth').value='closed';$('eyes').value='auto';animateFace();}
 function updateFlow(now){
  if(flow.phase==='processing'&&flow.auto&&now-flow.started>=900)responseStarted(true);
  if(flow.phase==='responding'&&flow.auto){const count=Math.min(demoText.length,Math.floor((now-flow.started)/32));chatText=demoText.slice(0,count);$('chatPreview').textContent=chatText;if(count===demoText.length)responseFinished();}
 }
 // Pontos de entrada do laboratório; nenhuma integração com RocketBox nesta etapa.
 window.NautIALab={processing:()=>processing(false),responseStarted:()=>responseStarted(false),responseFinished};
 $('speakingBtn').onclick=()=>responseStarted(false);
 $('processingBtn').onclick=()=>processing(false);
 $('finishResponseBtn').onclick=responseFinished;
 $('simulateChatBtn').onclick=()=>processing(true);
 function draw(){
  const face=$('view').value==='face',v=face?{x:1010,y:490,width:550,height:510}:model.viewBox;
  canvas.width=v.width;canvas.height=v.height;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(-v.x,-v.y);
  if($('view').value==='reference'){ctx.drawImage(images.get('krita-assets/referencia-atual.png'),0,0);ctx.restore();return;}
  const eye=selectedEyes(),mouth=selectedMouth();
  const bob=$('breathing').checked?Math.sin(time*1.8)*3:0;ctx.translate(0,bob);
  // Interior fixo atrás dos contornos originais; a pintura de pele destes faz a oclusão.
  const drawLayers=openMouthModes.has(mouth)?[...layers].sort((a,b)=>{const rank=n=>interiorIds.has(n.order)?30+model.mouthInterior.drawOrder.indexOf(n.order)/100:n.order;return rank(a)-rank(b)}):layers;
  for(const n of drawLayers){if(!visible(n,eye,mouth))continue;const weight=overrides.has(n.id)||(!neutralArmIds.has(n.order)&&!alternateArmIds.has(n.order))?1:poseWeight(n);if(weight<=0)continue;ctx.save();ctx.globalAlpha=n.opacity*weight;
   if(head(n)){const [x,y]=model.headPivot;ctx.translate(x,y);ctx.rotate(Number($('angle').value)*Math.PI/180);ctx.translate(-x,-y);}
   if(browIds.has(n.order)){const offset=model.facial.browOffsets?.[selectedBrows()];if(offset)ctx.translate(offset.x,offset.y);}
   if(eye.startsWith('wink')&&(n.order===45||n.order===47)){
    const closedLeft=eye==='winkLeft',left=(n.order===45?closedLeft:!closedLeft);ctx.beginPath();ctx.rect(left?0:1287,0,left?1287:model.width-1287,model.height);ctx.clip();
   }
   if(n.sourceRect){const r=n.sourceRect;ctx.drawImage(images.get(n.src),r.x,r.y,r.w,r.h,n.x,n.y,n.w,n.h);}else ctx.drawImage(images.get(n.src),n.x,n.y,n.w,n.h);ctx.restore();
  }ctx.restore();
 }
 function reset(){flow={phase:'idle',started:0,auto:false};poseTransition=null;settledPose='original';$('chatState').textContent='Pronta';$('chatPreview').textContent='';playing=false;time=0;overrides.clear();for(const id of ['eyes','mouth','pose'])$(id).value='original';$('brows').value='original';$('blink').checked=true;$('view').value='layers';$('angle').value='0';$('angleOut').textContent='0°';$('breathing').checked=false;$('play').textContent='▶ Animar';renderList();draw();}
 function renderList(){const list=$('layers');list.replaceChildren();for(const n of [...layers].reverse()){const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=overrides.has(n.id)?overrides.get(n.id):n.visible;box.onchange=()=>{overrides.set(n.id,box.checked);draw()};label.append(box,document.createTextNode(n.name));list.append(label);}}
 $('reset').onclick=reset;
 $('play').onclick=()=>{playing=!playing;if(playing){if($('eyes').value==='original')$('eyes').value='auto';if($('brows').value==='original')$('brows').value='auto';if($('mouth').value==='original')$('mouth').value='auto'}$('play').textContent=playing?'⏸ Pausar':'▶ Animar';};
 $('angle').oninput=()=>{$('angleOut').textContent=$('angle').value+'°';draw()};
 $('pose').onchange=()=>{flow={phase:'idle',started:0,auto:false};changePose($('pose').value);draw()};
 for(const id of ['eyes','mouth','view','breathing','brows','blink'])$(id).onchange=()=>{overrides.clear();draw()};
 function frame(now){updateFlow(now);if(poseTransition&&now-poseTransition.start>=model.poseRig.transitionMs){settledPose=poseTransition.to;poseTransition=null;}if(playing)time+=Math.min((now-last)/1000,.05);last=now;if(ready)draw();requestAnimationFrame(frame)}
 renderList();draw();$('status').textContent=`Avatar do Krita carregado · ${layers.length} camadas · alinhamento original`;requestAnimationFrame(frame);
})().catch(e=>{console.error(e);document.getElementById('status').textContent=e.message});
