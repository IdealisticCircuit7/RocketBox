import { AnimationMixer, LoopOnce, LoopRepeat, Object3D, type AnimationClip, type AnimationAction } from 'three';
export function createViewerAnimation(root:Object3D, draw:()=>void, visible:()=>boolean) {
 const clips:AnimationClip[]=root.animations.filter(c=>Number.isFinite(c.duration)&&c.duration>0&&c.tracks.length>0);
 const mixer=new AnimationMixer(root);let action:AnimationAction|undefined, frame=0,last=0,playing=false,loop=true,speed=1,index=0,disposed=false;
 const tick=(now:number)=>{frame=0;if(disposed||!playing)return;if(!visible()){last=0;return;}mixer.update(last?Math.min((now-last)/1000,.1):0);last=now;draw();if(action&&action.time>=clips[index].duration&&!loop)playing=false;if(playing)frame=requestAnimationFrame(tick);};
 const schedule=()=>{if(!disposed&&playing&&!frame&&visible())frame=requestAnimationFrame(tick);};
 const visibility=()=>{last=0;schedule();};document.addEventListener('visibilitychange',visibility);
 const select=(i:number)=>{if(!clips[i])return;action?.stop();index=i;action=mixer.clipAction(clips[i]);action.setLoop(loop?LoopRepeat:LoopOnce,loop?Infinity:1);action.clampWhenFinished=true;action.play();action.paused=!playing;mixer.update(0);draw();};
 if(clips.length)select(0);
 return {clips,select,play(){playing=true;if(action){if(action.time>=clips[index].duration)action.reset();action.play();action.paused=false;}last=0;schedule();},pause(){playing=false;if(action)action.paused=true;cancelAnimationFrame(frame);frame=0;},seek(time:number){if(!action)return;action.time=Math.max(0,Math.min(clips[index].duration,time));mixer.update(0);draw();},speed(value:number){speed=Math.max(.1,Math.min(4,value));mixer.timeScale=speed;},loop(value:boolean){loop=value;action?.setLoop(loop?LoopRepeat:LoopOnce,loop?Infinity:1);},position:()=>action?.time??0,isPlaying:()=>playing,dispose(){disposed=true;playing=false;cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',visibility);mixer.stopAllAction();mixer.uncacheRoot(root);}};
}
