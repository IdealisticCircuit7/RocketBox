import * as T from 'three';
/** Bounded world-space vertex normals; source geometry is never edited. */
export function createNormalInspector(meshes:T.Mesh[],scene:T.Scene,draw:()=>void,limit=5000) {
 let helper:T.LineSegments|undefined;let enabled=false,length=.08,calculate=false;
 let sources:{mesh:T.Mesh;geometry:T.BufferGeometry;owned:boolean;stride:number}[]=[];
 const clear=()=>{if(helper){scene.remove(helper);helper.geometry.dispose();(helper.material as T.Material).dispose();helper=undefined;}for(const s of sources)if(s.owned)s.geometry.dispose();sources=[];};
 const update=()=>{if(!helper)return;const positions=helper.geometry.getAttribute('position') as T.BufferAttribute;let offset=0;
  for(const s of sources){s.mesh.updateWorldMatrix(true,false);const matrix=new T.Matrix3().getNormalMatrix(s.mesh.matrixWorld),p=s.geometry.getAttribute('position'),n=s.geometry.getAttribute('normal');for(let i=0;i<p.count&&offset<limit*2;i+=s.stride){const start=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(s.mesh.matrixWorld);const normal=new T.Vector3().fromBufferAttribute(n,i).applyMatrix3(matrix).normalize().multiplyScalar(length);if(![start.x,start.y,start.z,normal.x,normal.y,normal.z].every(Number.isFinite)||normal.lengthSq()===0)continue;positions.setXYZ(offset++,start.x,start.y,start.z);start.add(normal);if(![start.x,start.y,start.z,normal.x,normal.y,normal.z].every(Number.isFinite)||normal.lengthSq()===0)continue;positions.setXYZ(offset++,start.x,start.y,start.z);}}
  helper.geometry.setDrawRange(0,offset);positions.needsUpdate=true;helper.geometry.computeBoundingSphere();};
 const configure=(on:boolean,size=length,compute=calculate)=>{clear();enabled=on;length=Math.max(.005,Math.min(.5,size));calculate=compute;if(!on){draw();return {lines:0,missing:0,calculated:0,unsupported:0};}
  let missing=0,calculated=0,unsupported=0;const eligible=meshes.filter(m=>{if((m as T.SkinnedMesh).isSkinnedMesh||m.geometry.morphAttributes.position?.length){unsupported++;return false;}return !!m.geometry.getAttribute('position');});
  const total=eligible.reduce((n,m)=>n+m.geometry.getAttribute('position').count,0),stride=Math.max(1,Math.ceil(total/limit));
  for(const mesh of eligible){let geometry=mesh.geometry,owned=false;if(!geometry.getAttribute('normal')){if(!calculate||geometry.getAttribute('position').count>100000){missing++;continue;}geometry=geometry.clone();geometry.computeVertexNormals();owned=true;calculated++;}sources.push({mesh,geometry,owned,stride});}
  helper=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:0xf4a4ff,depthTest:true}));helper.geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(limit*6),3));helper.frustumCulled=false;scene.add(helper);update();draw();return {lines:helper.geometry.drawRange.count/2,missing,calculated,unsupported};
 };
 return {configure,update:()=>{if(enabled)update();},dispose:clear};
}
