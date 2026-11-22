import * as THREE from 'three';
import type { ViewerLimits } from './viewerResources.ts';
export function parseInWorker(bytes:ArrayBuffer,extension:string,signal:AbortSignal,limits:ViewerLimits):Promise<THREE.Object3D> {
 return new Promise((resolve,reject)=>{
  signal.throwIfAborted();
  const worker=new Worker(new URL('./viewerParser.worker.ts',import.meta.url),{type:'module'});
  const close=()=>{worker.terminate();signal.removeEventListener('abort',abort);};
  const abort=()=>{close();reject(signal.reason??new Error('Carregamento cancelado.'));};
  signal.addEventListener('abort',abort,{once:true});
  worker.onerror=e=>{close();reject(new Error(e.message));};
  worker.onmessage=e=>{close();if(e.data.error)reject(new Error(e.data.error));else try{resolve(new THREE.ObjectLoader().parse(e.data.json));}catch(error){reject(error);}};
  worker.postMessage({bytes,extension,vertices:limits.vertices,memory:limits.memory});
 });
}
