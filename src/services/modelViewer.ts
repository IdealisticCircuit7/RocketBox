import { createNormalInspector } from './viewerNormals.ts';
import { createViewerAnimation } from './viewerAnimation.ts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parseInWorker } from './viewerParser.ts';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { viewerResources, DEFAULT_VIEWER_LIMITS, type ViewerLimits } from './viewerResources.ts';
import { validateGltf } from './viewerPolicy.ts';

/** Validate glTF without discarding its materials. */
export function prepareGltf(bytes: ArrayBuffer, extension: string, dependencies = false): string | ArrayBuffer {
  const decoder = new TextDecoder();
  if (extension === 'gltf') {
    const json = JSON.parse(decoder.decode(bytes)); validateGltf(json, dependencies); return JSON.stringify(json);
  }
  const view = new DataView(bytes);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw new Error('Cabeçalho GLB inválido.');
  const length = view.getUint32(12, true);
  if (length > bytes.byteLength - 20 || length % 4) throw new Error('Chunk GLB inválido.');
  const json = JSON.parse(decoder.decode(new Uint8Array(bytes, 20, length))); validateGltf(json, dependencies);
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(encoded.length / 4) * 4;
  const tail = new Uint8Array(bytes, 20 + length);
  const result = new Uint8Array(20 + padded + tail.length); result.fill(32, 20, 20 + padded);
  const header = new DataView(result.buffer);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, result.length, true);
  header.setUint32(12, padded, true); header.setUint32(16, 0x4e4f534a, true);
  result.set(encoded, 20); result.set(tail, 20 + padded); return result.buffer;
}

export async function mountModelViewer(host:HTMLElement,bytes:ArrayBuffer,extension:string,options:{source?:string;signal?:AbortSignal;limits?:ViewerLimits}={}) {
 const limits=options.limits??DEFAULT_VIEWER_LIMITS;
 const signal=AbortSignal.any([options.signal??new AbortController().signal,AbortSignal.timeout(limits.milliseconds)]);
 const resources=await viewerResources(bytes,extension,options.source??'',signal,limits);
 const manager=new THREE.LoadingManager();const warnings=resources.warnings;
 const placeholder='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
 manager.setURLModifier(url=>{
   signal.throwIfAborted();if([...resources.urls.values()].includes(url))return url;if(url.startsWith('blob:')&&extension!=='fbx')return url;if(resources.urls.has(url))return resources.urls.get(url)!;
   if(/^data:application\/(octet-stream|gltf-buffer);base64,/.test(url))return url;
   if(/^data:image\/(png|jpeg);base64,/.test(url))return url;
   warnings.push('Material ausente ou textura bloqueada: '+url.slice(0,120));return placeholder;
 });
 manager.onLoad=()=>draw();
 manager.onError=url=>warnings.push('Falha de textura: '+url.slice(0,120));
 let model:THREE.Object3D|undefined,renderer:THREE.WebGLRenderer|undefined,controls:OrbitControls|undefined,observer:ResizeObserver|undefined;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#07101a');
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 let normals:ReturnType<typeof createNormalInspector>|undefined;
 let disposed=false;let animation:ReturnType<typeof createViewerAnimation>|undefined;
 const dispose=()=>{disposed=true;normals?.dispose();animation?.dispose();observer?.disconnect();controls?.dispose();document.removeEventListener('visibilitychange',draw);scene.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)geometries.add(m.geometry);if(m.material)for(const mat of Array.isArray(m.material)?m.material:[m.material]){materials.add(mat);for(const v of Object.values(mat))if(v instanceof THREE.Texture)textures.add(v);}});for(const x of geometries)x.dispose();for(const x of materials)x.dispose();for(const x of textures){const image=x.image as {close?:()=>void}|undefined;image?.close?.();x.dispose();}renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove();resources.dispose();};
 let camera:THREE.PerspectiveCamera|THREE.OrthographicCamera=new THREE.PerspectiveCamera(45,1,.01,1000);
 function draw(){if(disposed||!renderer||document.hidden||!host.getClientRects().length||!host.clientHeight)return;const aspect=host.clientWidth/host.clientHeight;renderer.setSize(host.clientWidth,host.clientHeight,false);if(camera instanceof THREE.PerspectiveCamera)camera.aspect=aspect;else{camera.left=-2*aspect;camera.right=2*aspect;}camera.updateProjectionMatrix();normals?.update();renderer.render(scene,camera);}
 try {
  signal.throwIfAborted();
  if(extension==='obj'||extension==='fbx') {
   model=await parseInWorker(bytes,extension,signal,limits);
   if(extension==='obj'&&resources.materialText){const creator=new MTLLoader(manager).parse(resources.materialText,'');model.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.isMesh)mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>creator.materialsInfo[m.name]?creator.create(m.name):m):creator.materialsInfo[mesh.material.name]?creator.create(mesh.material.name):mesh.material;});}
   if(extension==='fbx')model.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.material)return;for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])for(const value of Object.values(mat))if(value instanceof THREE.Texture&&value.userData.viewerUri){const uri=String(value.userData.viewerUri);const ref=uri.split(/[\\/]/).pop()??uri;const url=resources.urls.get(ref);if(url){new THREE.TextureLoader(manager).load(url,t=>{if(disposed){t.dispose();return;}value.image=t.image;value.needsUpdate=true;t.dispose();draw();});}else warnings.push('Textura FBX ausente ou embutida sem suporte: '+ref);}});
  }
  else {const gltf=await new GLTFLoader(manager).parseAsync(prepareGltf(bytes,extension,true),'');model=gltf.scene;model.animations=gltf.animations;}
  scene.add(model);signal.throwIfAborted();
  const meshes:THREE.Mesh[]=[];let vertices=0,memory=resources.used;
  model.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;meshes.push(mesh);vertices+=mesh.geometry.getAttribute('position')?.count??0;for(const a of Object.values(mesh.geometry.attributes))memory+=a.array.byteLength;memory+=mesh.geometry.index?.array.byteLength??0;for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(mat);});
  for(const mat of materials)for(const value of Object.values(mat))if(value instanceof THREE.Texture){textures.add(value);const img=value.image as {width?:number;height?:number}|undefined;memory+=(img?.width??0)*(img?.height??0)*4*1.34;}
  if(!vertices||vertices>limits.vertices||memory>limits.memory)throw new Error('Arquivo muito complexo ou acima do limite de memória.');
  const bounds=new THREE.Box3().setFromObject(model);const size=bounds.getSize(new THREE.Vector3()).length();if(!Number.isFinite(size)||size<=0)throw new Error('Geometria inválida.');
  const pivot=new THREE.Group();scene.remove(model);pivot.add(model);scene.add(pivot);model.position.sub(bounds.getCenter(new THREE.Vector3()));pivot.scale.setScalar(2/size);
  renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.append(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minDistance=.1;controls.maxDistance=100;
  const grid=new THREE.GridHelper(4,20,0x00d4ff,0x233949),axes=new THREE.AxesHelper(1.5);scene.add(grid,axes,new THREE.HemisphereLight(0xffffff,0x334466,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(3,4,5);scene.add(light);
  const reset=()=>{camera.position.set(2,1.5,3);camera.up.set(0,1,0);camera.zoom=1;controls!.target.set(0,0,0);controls!.update();draw();};
  controls.addEventListener('change',draw);observer=new ResizeObserver(draw);observer.observe(host);document.addEventListener('visibilitychange',draw);reset();
  animation=createViewerAnimation(model,draw,()=>!disposed&&!document.hidden&&!!host.getClientRects().length);
  let objects=0,triangles=0,skeleton=false;model.traverse(o=>{objects++;const m=o as THREE.SkinnedMesh;if(m.isSkinnedMesh)skeleton=true;if(m.isMesh)triangles+=(m.geometry.index?.count??m.geometry.getAttribute('position')?.count??0)/3;});
  const metrics={objects,meshes:meshes.length,vertices,triangles:Math.floor(triangles),materials:materials.size,textures:textures.size,skeleton,clips:animation.clips.length};
  normals=createNormalInspector(meshes,scene,draw);
  return {normals,animation,metrics,dispose,reset,warnings,meshes,materials:[...materials],vertices,
   zoom(factor:number){if(camera instanceof THREE.OrthographicCamera){camera.zoom=Math.max(.1,Math.min(30,camera.zoom*factor));}else camera.position.sub(controls!.target).multiplyScalar(1/factor).add(controls!.target);controls!.update();draw();},grid(){grid.visible=!grid.visible;draw();},axes(){axes.visible=!axes.visible;draw();},
   view(name:string){camera.up.set(0,1,0);camera.position.set(...({front:[0,0,3],back:[0,0,-3],side:[3,0,0],top:[0,3,.001]}[name]??[2,1.5,3]) as [number,number,number]);controls!.target.set(0,0,0);controls!.update();draw();},
   projection(ortho:boolean){const position=camera.position.clone();controls!.dispose();camera=ortho?new THREE.OrthographicCamera(-2,2,2,-2,.01,1000):new THREE.PerspectiveCamera(45,1,.01,1000);camera.position.copy(position);controls=new OrbitControls(camera,renderer!.domElement);controls.addEventListener('change',draw);controls.update();draw();},
   wireframe(enabled:boolean){for(const mat of materials)if('wireframe' in mat){(mat as THREE.MeshStandardMaterial).wireframe=enabled;mat.needsUpdate=true;}draw();},
   rotate(axis:'x'|'y'|'z',degrees:number){pivot.rotation[axis]=THREE.MathUtils.degToRad(degrees);draw();}
  };
 }catch(e){dispose();throw e;}
}

