import { invoke } from '@tauri-apps/api/core';
import { imageDimensions } from './viewerPolicy.ts';
export interface ViewerLimits { bytes:number; vertices:number; memory:number; milliseconds:number }
export const DEFAULT_VIEWER_LIMITS:ViewerLimits={bytes:32*1024*1024,vertices:2_000_000,memory:256*1024*1024,milliseconds:30000};
export function localViewerReference(uri:string):string {
  if(!uri || uri.length>500 || /[:\\%?#\x00]/.test(uri) || uri.startsWith('/') || uri.split('/').some(p=>!p||p==='..'||p==='.'))throw new Error('Dependência externa ou caminho inseguro: '+uri);
  return uri;
}
export async function viewerResources(bytes:ArrayBuffer,extension:string,source:string,signal:AbortSignal,limits:ViewerLimits) {
  const urls=new Map<string,string>(), warnings:string[]=[];let used=bytes.byteLength;let decoded=0;let attempts=0;
  const inspectImage=(data:ArrayBuffer,ext:string)=>{const [w,h]=imageDimensions(data,ext);decoded+=w*h*4*1.34;if(decoded+used>limits.memory)throw new Error('Texturas excedem o limite de memória estimada.');};
  const dispose=()=>{for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();};
  const read=async(ref:string)=>{
    signal.throwIfAborted();ref=localViewerReference(ref);if(urls.has(ref))return;
    if(++attempts>128)throw new Error('Limite de 128 dependências excedido.');
    if(!source)throw new Error('Dependências exigem caminho local no aplicativo desktop.');
    const data=await invoke<ArrayBuffer>('ler_dependencia_viewer',{source,relative:ref});signal.throwIfAborted();
    used+=data.byteLength;if(used>limits.bytes)throw new Error('Conjunto de arquivos excede o limite de tamanho.');
    const ext=ref.split('.').pop()?.toLowerCase();
    if(['png','jpg','jpeg'].includes(ext??''))inspectImage(data,ext!);
    else if(!['bin','mtl'].includes(ext??''))throw new Error('Dependência sem suporte: '+ref);
    urls.set(ref,URL.createObjectURL(new Blob([data],{type:ext==='png'?'image/png':['jpg','jpeg'].includes(ext??'')?'image/jpeg':'application/octet-stream'})));
    return data;
  };
  let materialText='';
  try {
    if(extension==='gltf'||extension==='glb') {
      const view=new DataView(bytes);const json=JSON.parse(new TextDecoder().decode(extension==='gltf'?bytes:new Uint8Array(bytes,20,view.getUint32(12,true))));
      for(const buffer of json.buffers??[])if(buffer.uri&&!buffer.uri.startsWith('data:'))await read(buffer.uri);
      if((json.images?.length??0)>128)throw new Error('Limite de imagens excedido.');
      for(const img of json.images??[]) {
        if(img.uri&&!img.uri.startsWith('data:')){try{await read(img.uri);}catch(e){signal.throwIfAborted();if(used>limits.bytes||decoded+used>limits.memory)throw e;warnings.push('Material/textura ausente ou bloqueado: '+String(e));}}
        else if(img.bufferView!==undefined&&extension==='glb') {
          const b=json.bufferViews?.[img.bufferView];if(!b)throw new Error('Imagem sem bufferView válido.');
          const offset=28+view.getUint32(12,true)+(b.byteOffset??0);
          inspectImage(bytes.slice(offset,offset+b.byteLength),img.mimeType==='image/png'?'png':'jpeg');
        } else if(img.uri?.startsWith('data:')) {
          if(!/^data:image\/(png|jpeg);base64,/.test(img.uri))throw new Error('Imagem embutida sem suporte.');
          const raw=atob(img.uri.split(',')[1]);inspectImage(Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer,img.uri.startsWith('data:image/png')?'png':'jpeg');
        }
      }
    } else if(extension==='obj') {
      const text=new TextDecoder().decode(bytes);const refs=[...text.matchAll(/^mtllib\s+(.+)$/gm)].map(m=>m[1].trim());
      if(refs.length>1)warnings.push('OBJ com vários MTL: somente o primeiro é aplicado.');
      if(refs[0])try {
        const data=await read(refs[0]);materialText=new TextDecoder().decode(data);
        const prefix=refs[0].includes('/')?refs[0].slice(0,refs[0].lastIndexOf('/')+1):'';
        for(const m of materialText.matchAll(/^(?:map_\w+|bump|norm|disp)\s+(.+)$/gm)) {
          const ref=m[1].trim();if(ref.startsWith('-')){warnings.push('Opções MTL complexas sem suporte.');continue;}
          try{await read(prefix+ref);if(prefix)urls.set(ref,urls.get(prefix+ref)!);}catch(e){warnings.push('Textura MTL ausente: '+String(e));}
        }
      }catch(e){warnings.push('Material MTL ausente: '+String(e));}
    } else if(extension==='fbx') {
      // Common relative texture names, including binary string properties. Unknown references stay blocked.
      const refs=new Set(new TextDecoder().decode(bytes).match(/[\w -]+\.(?:png|jpg|jpeg)/gi)??[]);
      for(const ref of [...refs].slice(0,64))try{await read(ref.trim());}catch{warnings.push('Textura FBX não resolvida: '+ref);}
    }
    signal.throwIfAborted();return {urls,warnings,materialText,dispose,used};
  }catch(e){dispose();throw e;}
}
