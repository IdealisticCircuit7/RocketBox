import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('Hidden loading canvas starts via its visible container, pauses offscreen and releases resources on unmount',async()=>{
 const effects=[],refs=[],frames=new Set(),listeners=new Map(),root={},element={parentElement:root,getContext:()=>null};
 let observer,acquired=0,released=0,nextFrame=0;
 const source=fs.readFileSync(new URL('../src/components/nautia/NautiaAvatar.tsx',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const fakeReact={useRef:value=>{const ref={current:value};refs.push(ref);return ref;},useState:value=>[value,()=>{}],useEffect:fn=>effects.push(fn)};
 const manifest={viewBox:{width:1010,height:2050}};
 const document={hidden:false,documentElement:{classList:{contains:()=>false}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const exports={};
 vm.runInNewContext(compiled,{exports,performance,document,
  requestAnimationFrame:()=>{const id=++nextFrame;frames.add(id);return id;},cancelAnimationFrame:id=>frames.delete(id),
  matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),
  IntersectionObserver:class{constructor(callback){observer=this;this.callback=callback;}observe(target){this.target=target;}disconnect(){this.disconnected=true;}},
  MutationObserver:class{observe(){}disconnect(){}},
  require:name=>{
   if(name==='react')return fakeReact;
   if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
   if(name.endsWith('nautiaAvatarResources'))return {manifest,acquireNautiaImages:()=>{acquired++;return {ready:Promise.resolve(new Map()),release:()=>released++};}};
   if(name.endsWith('nautiaKritaRig'))return {createKritaRig:()=>({setState(){},setMotion(){}})};
   if(name.endsWith('nautiaThoughts'))return {nautiaThought:()=>''};
   return {};
  },
 });
 exports.NautiaAvatar({state:'thinking'});refs[0].current=element;
 const cleanups=effects.map(fn=>fn()).filter(Boolean);
 assert.equal(observer.target,root);assert.equal(acquired,0);
 observer.callback([{isIntersecting:true}]);await Promise.resolve();await Promise.resolve();
 assert.equal(acquired,1);assert.equal(frames.size,1);
 observer.callback([{isIntersecting:false}]);assert.equal(frames.size,0);
 observer.callback([{isIntersecting:true}]);assert.equal(acquired,1);assert.equal(frames.size,1);
 document.hidden=true;listeners.get('visibilitychange')();assert.equal(frames.size,0);
 cleanups.forEach(fn=>fn());assert.equal(released,1);assert.equal(frames.size,0);assert.equal(listeners.size,0);assert.ok(observer.disconnected);
});
