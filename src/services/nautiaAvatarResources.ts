import manifest from '../assets/nautia-avatar/krita-manifest.json';
export {manifest};
const urls=import.meta.glob('../assets/nautia-avatar/krita-assets/*.png',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
let cache:Promise<Map<string,HTMLImageElement>>|null=null,users=0;
let eviction:ReturnType<typeof setTimeout>|undefined;
export function acquireNautiaImages(){
  users++;clearTimeout(eviction);
  cache??=Promise.all(manifest.layers.filter(layer=>layer.src).map(layer=>new Promise<[string,HTMLImageElement]>((resolve,reject)=>{
    const image=new Image(),src=layer.src!;image.onload=()=>resolve([src,image]);image.onerror=()=>reject(new Error(`Sprite indisponível: ${src}`));
    image.src=urls[`../assets/nautia-avatar/${src}`]??'';
  }))).then(entries=>new Map(entries)).catch(error=>{cache=null;throw error;});
  let released=false;
  return {ready:cache,release(){if(released)return;released=true;if(--users===0)eviction=setTimeout(()=>{cache=null;eviction=undefined;},10000);}};
}
