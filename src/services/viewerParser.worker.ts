import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
// Geometry parsing is isolated so cancellation/timeouts can terminate excessive FBX inflation or OBJ expansion.
THREE.TextureLoader.prototype.load=function(url:string) { const texture=new THREE.Texture<HTMLImageElement>();texture.userData.viewerUri=url;return texture; };
self.onmessage=e=>{
 try {
  const {bytes,extension,vertices:limit,memory:budget}=e.data;
  const object=extension==='fbx'?new FBXLoader().parse(bytes,''):new OBJLoader().parse(new TextDecoder().decode(bytes));
  let vertices=0,memory=0;
  object.traverse(o=>{const g=(o as THREE.Mesh).geometry;if(g){vertices+=g.getAttribute('position')?.count??0;for(const a of Object.values(g.attributes))memory+=a.array.byteLength;memory+=g.index?.array.byteLength??0;}});
  if(vertices>limit||memory>budget)throw new Error('Arquivo muito complexo para os limites configurados.');
  self.postMessage({json:object.toJSON()});
 }catch(error){self.postMessage({error:String(error)});}
};
