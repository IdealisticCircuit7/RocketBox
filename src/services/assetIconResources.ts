import type {AssetIconId} from './assetIconResolver';
// Explicit static URLs let Vite bundle the supplied vectors once. No runtime conversion or remote requests.
export const ASSET_ICON_URLS: Readonly<Record<AssetIconId,string>> = {
  blender:new URL('../assets/icons/formats/blender.svg',import.meta.url).href,
  unreal:new URL('../assets/icons/formats/unreal.svg',import.meta.url).href,
  unity:new URL('../assets/icons/formats/unity.svg',import.meta.url).href,
  fbx:new URL('../assets/icons/formats/fbx.svg',import.meta.url).href,
  obj:new URL('../assets/icons/formats/obj.svg',import.meta.url).href,
  gltf:new URL('../assets/icons/formats/gltf.svg',import.meta.url).href,
  glb:new URL('../assets/icons/formats/glb.svg',import.meta.url).href,
  '3d-unknown':new URL('../assets/icons/formats/3d-unknown.svg',import.meta.url).href,
  texture:new URL('../assets/icons/formats/texture.svg',import.meta.url).href,
  material:new URL('../assets/icons/formats/material.svg',import.meta.url).href,
  animation:new URL('../assets/icons/formats/animation.svg',import.meta.url).href,
  audio:new URL('../assets/icons/formats/audio.svg',import.meta.url).href,
  document:new URL('../assets/icons/formats/document.svg',import.meta.url).href,
  'file-unknown':new URL('../assets/icons/formats/file-unknown.svg',import.meta.url).href,
};
/** One bounded fallback; never retry a broken URL indefinitely. */
export function fallbackAssetImage(image: HTMLImageElement, fallback: string) {
  if(image.dataset.fallbackAttempted==='true'||image.src===fallback){image.hidden=true;return;}
  image.dataset.fallbackAttempted='true';image.src=fallback;
}
