import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createKritaRig} from '../src/services/nautiaKritaRig.js';
import {createNautiaAvatarState} from '../src/services/nautiaAvatarState.ts';
import {nautiaThought,thoughtCategoryForTool} from '../src/services/nautiaThoughts.ts';
const model=JSON.parse(fs.readFileSync(new URL('../src/assets/nautia-avatar/krita-manifest.json',import.meta.url)));
test('All 73 copied sprites retain their original manifest hashes and source rectangles',()=>{
 const layers=model.layers.filter(n=>n.src);assert.equal(layers.length,73);
 for(const layer of layers){const bytes=fs.readFileSync(new URL('../src/assets/nautia-avatar/'+layer.src,import.meta.url));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),layer.sha256);}
 assert.equal(model.layers.find(n=>n.order===49.5).sourceRect.w,2150);
});
test('Avatar request ownership, cancel, error, sleep and disposal do not leave timers or accept late chunks',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const state=createNautiaAvatarState(100,40);state.start();t.mock.timers.tick(100);assert.equal(state.getSnapshot(),'drowsy');t.mock.timers.tick(3000);assert.equal(state.getSnapshot(),'sleeping');state.activity();assert.equal(state.getSnapshot(),'idle');
 const first=state.begin();state.phase(first,'speaking');assert.equal(state.getSnapshot(),'speaking');t.mock.timers.tick(1000);assert.equal(state.getSnapshot(),'speaking');
 state.finish(first,'cancelled');const second=state.begin();state.phase(first,'speaking');state.finish(first,'error');assert.equal(state.getSnapshot(),'thinking');
 state.finish(second,'error');assert.equal(state.getSnapshot(),'uncertainty');t.mock.timers.tick(40);assert.equal(state.getSnapshot(),'idle');t.mock.timers.tick(100);assert.equal(state.getSnapshot(),'drowsy');t.mock.timers.tick(3000);assert.equal(state.getSnapshot(),'sleeping');
 state.dispose();state.phase(second,'speaking');t.mock.timers.tick(5000);assert.equal(state.getSnapshot(),'idle');
});
test('Rapid interrupted arm transitions stay bounded and speaking preserves the correct anatomical arms',()=>{
 const rig=createKritaRig(model);rig.setState('thinking',0);rig.setState('speaking',100);
 for(let now=100;now<=400;now+=10)assert.ok(rig.inspect(0,now).layers.every(n=>n.weight>=0&&n.weight<=1));
 const visible=rig.inspect(0,400).layers.filter(n=>n.weight===1).map(n=>n.order);
 for(const order of [8,10,11,63,64,65])assert.ok(visible.includes(order));
 for(const order of [6,7,9,66,67,68])assert.ok(!visible.includes(order));
 rig.setState('idle',500);assert.equal(rig.inspect(0,800).mouth,'closed');
 rig.setMotion(false);rig.setState('speaking',900);assert.equal(rig.inspect(1,900).mouth,'closed');
});
// Compare actual draw commands with the unmodified lab, not a rewritten expected renderer.
function recordingContext(){const commands=[];let alpha=1;const stack=[];const ctx={canvas:{width:1010,height:2050},commands,
 save(){stack.push(alpha);},restore(){alpha=stack.pop();},clearRect(){},translate(...a){commands.push(['translate',...a]);},rotate(...a){commands.push(['rotate',...a]);},
 drawImage(image,...a){commands.push(['image',image.src,alpha,...a]);},beginPath(){},rect(){},clip(){},
 get globalAlpha(){return alpha;},set globalAlpha(value){alpha=value;}};return ctx;}
async function originalLab(){
 const context=recordingContext(),elements=new Map();let now=0;
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'original',checked:true,textContent:'',replaceChildren(){},append(){}});return elements.get(id);};
 element('stage').getContext=()=>context;element('view').value='layers';element('angle').value='0';element('breathing').checked=false;
 const sandbox={console:{...console,error:error=>{throw error;}},performance:{now:()=>now},fetch:async()=>({ok:true,json:async()=>model}),Image:class{set src(value){this._src=value;queueMicrotask(()=>this.onload());}get src(){return this._src;}},requestAnimationFrame(){},window:{},document:{getElementById:element,createElement:()=>({append(){}}),createTextNode:text=>text},queueMicrotask};
 await vm.runInNewContext(fs.readFileSync(new URL('fixtures/nautia-lab-reference.js',import.meta.url),'utf8'),sandbox);
 return {context,element,window:sandbox.window,at:value=>{now=value;}};
}
for(const state of ['idle','thinking','speaking','uncertainty','drowsy','sleeping'])test(`Canvas commands match original lab for ${state}`,async()=>{
 const lab=await originalLab();lab.window.NautIALab.responseFinished();
 const poses={idle:['original','auto','closed'],thinking:['thoughtful','thoughtful','closed'],speaking:['speaking','auto','auto'],uncertainty:['uncertain','auto','uncertain'],drowsy:['original','half','closed'],sleeping:['standby','closed','closed']};
 const [pose,eyes,mouth]=poses[state];lab.element('pose').value=pose;lab.element('pose').onchange();lab.element('eyes').value=eyes;lab.element('mouth').value=mouth;lab.element('brows').value='auto';
 if(['drowsy','sleeping'].includes(state)){lab.element('brows').value='sleepy';lab.element('angle').value=state==='sleeping'?'3':'1';}
 lab.at(1000);lab.context.commands.length=0;lab.element('angle').oninput();
 const rig=createKritaRig(model);rig.setState(state,0);const actual=recordingContext();const images=new Map(model.layers.filter(n=>n.src).map(n=>[n.src,{src:n.src}]));rig.draw(actual,images,0,1000);
 assert.deepEqual(actual.commands,lab.context.commands);
});
test('Pensative blink uses the provided intermediate and restores its base expression',()=>{
 const rig=createKritaRig(model);rig.setState('thinking',0);
 assert.equal(rig.inspect(2.85,500).eyes,'thoughtful');assert.equal(rig.inspect(2.90,500).eyes,'thinking_half');
 assert.equal(rig.inspect(3,500).eyes,'thinking_closed');assert.equal(rig.inspect(3.12,500).eyes,'thinking_half');assert.equal(rig.inspect(3.18,500).eyes,'thoughtful');
});
test('Speaking uses the original six mouth frames; eyebrows follow pose rather than blink frame',()=>{
 const rig=createKritaRig(model);rig.setState('speaking',0);
 assert.deepEqual(Array.from({length:6},(_,i)=>rig.inspect(i/8,500).mouth),['closed','light','a','light','o','closed']);
 rig.setState('thinking',600);assert.equal(rig.inspect(3,1000).brows,'thinking');
 rig.setState('uncertainty',1100);assert.equal(rig.inspect(0,1500).brows,'uncertain');
 rig.setState('sleeping',1600);assert.equal(rig.inspect(0,2000).mouth,'closed');assert.equal(rig.inspect(0,2000).brows,'sleepy');
});

test('Only actual speech time counts toward the optional minimum; long streams have no deadline',t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
 const state=createNautiaAvatarState(60000,40,{minimumSpeakingMs:450});state.start();const id=state.begin();
 t.mock.timers.tick(90000);assert.equal(state.getSnapshot(),'thinking');
 state.phase(id,'speaking');t.mock.timers.tick(100);state.finish(id);assert.equal(state.getSnapshot(),'speaking');
 t.mock.timers.tick(349);assert.equal(state.getSnapshot(),'speaking');t.mock.timers.tick(1);assert.equal(state.getSnapshot(),'idle');
 const next=state.begin();state.phase(next,'speaking');t.mock.timers.tick(100000);assert.equal(state.getSnapshot(),'speaking');state.finish(next);assert.equal(state.getSnapshot(),'idle');state.dispose();
});

test('Wake, cancellation, new requests and disposal invalidate every previous deadline',t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:0});const state=createNautiaAvatarState(100,40);state.start();
 for(let i=0;i<20;i++){
  t.mock.timers.tick(100);assert.equal(state.getSnapshot(),'drowsy');state.activity();t.mock.timers.tick(2999);assert.equal(state.getSnapshot(),'drowsy');
  const id=state.begin();t.mock.timers.tick(10000);assert.equal(state.getSnapshot(),'thinking');state.phase(id,'speaking');state.cancel();assert.equal(state.getSnapshot(),'idle');state.phase(id,'speaking');assert.equal(state.getSnapshot(),'idle');
 }
 state.preview('sleeping');const id=state.begin();assert.equal(state.getSnapshot(),'thinking');state.phase(id,'speaking');state.finish(id);
 const newer=state.begin();t.mock.timers.tick(1000);assert.equal(state.getSnapshot(),'thinking');state.finish(newer,'error');state.dispose();t.mock.timers.tick(100000);assert.equal(state.getSnapshot(),'idle');
});

test('Speech mouth clock restarts after a long thinking period, without resetting natural blinks',()=>{
 const rig=createKritaRig(model);rig.setState('thinking',0);rig.inspect(20.375,20000);rig.setState('speaking',20001);
 assert.equal(rig.inspect(20.375,20001).mouth,'closed');assert.equal(rig.inspect(20.5,20126).mouth,'light');
 rig.setState('idle',20200);assert.equal(rig.inspect(20.6,20200).mouth,'closed');
});

test('Sleep closes eyes/mouth, tilts the whole helmet group and wakes without delaying requests',()=>{
 const rig=createKritaRig(model);rig.setState('drowsy',0);assert.equal(rig.inspect(0,1000).eyes,'half');assert.equal(rig.inspect(0,1000).angle,1);
 rig.setState('sleeping',3000);const asleep=rig.inspect(3,4000);assert.equal(asleep.eyes,'closed');assert.equal(asleep.mouth,'closed');assert.equal(asleep.angle,3);
 const images=new Map(model.layers.filter(n=>n.src).map(n=>[n.src,{src:n.src}])),ctx=recordingContext();rig.draw(ctx,images,3,4000);
 // Each visible head part gets the identical transform; neck/body are outside that group.
 const headIds=new Set(model.facial.headLayers);let rotation=0;
 for(const c of ctx.commands){if(c[0]==='rotate')rotation=c[1];if(c[0]==='image'){const n=model.layers.find(n=>n.src===c[1]);if(headIds.has(n.order))assert.equal(rotation,3*Math.PI/180);}}
 assert.ok([12,13,15,71].every(id=>headIds.has(id)));assert.ok(!headIds.has(14));
 rig.setState('idle',4100);assert.equal(rig.inspect(3,4100).angle,0);assert.equal(rig.inspect(3,4100).eyes,'half');assert.equal(rig.inspect(3.3,4300).eyes,'open');
 rig.setState('thinking',4110);assert.equal(rig.inspect(4,4110).eyes,'thoughtful');
 rig.setMotion(false);rig.setState('sleeping',4200);assert.equal(rig.inspect(4,5200).angle,0);assert.equal(rig.inspect(4,5200).mouth,'closed');
});

test('Thought phrases are private fixed hints, rotate without adjacent repeats and unknown tools stay generic',()=>{
 assert.equal(thoughtCategoryForTool('searchAssets'),'search');assert.equal(thoughtCategoryForTool('moveAssetRecord'),'organization');assert.equal(thoughtCategoryForTool('untrusted filename'),'generic');
 for(const category of ['generic','search','organization'])for(let i=0;i<20;i++){assert.notEqual(nautiaThought(category,i),nautiaThought(category,i+1));assert.ok(nautiaThought(category,i).length<40);}
});
