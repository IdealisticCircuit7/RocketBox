import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {ObjectLoader} from 'three';
import {createViewerAnimation} from '../src/services/viewerAnimation.ts';
const bytes=name=>{const b=readFileSync(new URL('./fixtures/'+name,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
test('Real converted GLB carries skin and clips, supports seek, speed, pause and releases its loop',async()=>{
 const gltf=await new GLTFLoader().parseAsync(bytes('etapa15-animated.glb'),'');gltf.scene.animations=gltf.animations;assert.ok(gltf.animations.length>0);let skinned=false;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)skinned=true;});assert.ok(skinned);
 let tick,removed=0;globalThis.document={addEventListener(){},removeEventListener(){removed++;}};globalThis.requestAnimationFrame=f=>{tick=f;return 1;};globalThis.cancelAnimationFrame=()=>{tick=null;};
 const player=createViewerAnimation(gltf.scene,()=>{},()=>true);player.play();assert.ok(tick);tick(1000);tick(1100);assert.ok(player.position()>0);player.speed(2);player.seek(.4);assert.ok(Math.abs(player.position()-.4)<.001);player.pause();assert.equal(tick,null);player.loop(false);player.seek(0);assert.equal(player.position(),0);player.dispose();assert.equal(player.isPlaying(),false);assert.equal(removed,1);
 delete globalThis.document;delete globalThis.requestAnimationFrame;delete globalThis.cancelAnimationFrame;
});
test('Real Blender FBX preserves skeleton and animation clips through the worker serialization',async()=>{
 let result;globalThis.self={postMessage:r=>{result=r;}};await import('../src/services/viewerParser.worker.ts');self.onmessage({data:{bytes:bytes('etapa15-animated.fbx'),extension:'fbx',vertices:2000000,memory:256*1024*1024}});assert.ok(!result.error,result.error);const model=new ObjectLoader().parse(result.json);assert.ok(model.animations.length>0);assert.ok(model.animations.some(c=>c.duration>0&&c.tracks.length));let skeleton=false;model.traverse(o=>{if(o.isSkinnedMesh)skeleton=true;});assert.ok(skeleton);delete globalThis.self;
});
