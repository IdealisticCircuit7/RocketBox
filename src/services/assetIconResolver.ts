/** Visual projection only: never changes classification, records or analysis. */
export type AssetIconId = 'blender' | 'unreal' | 'unity' | 'fbx' | 'obj' | 'gltf' | 'glb' |
  '3d-unknown' | 'texture' | 'material' | 'animation' | 'audio' | 'document' | 'file-unknown';
export type EngineIconId = 'blender' | 'unreal' | 'unity';
export interface AssetIconInput {
  readonly kind?: string;
  readonly formato?: string | null;
  readonly detectedFormat?: string | null;
  readonly caminho?: string;
  readonly sourcePath?: string;
  readonly sourceSoftware?: string;
  readonly projectType?: string | null;
  readonly categoria?: string | null;
  readonly category?: string | null;
  readonly technicalType?: string | null;
  readonly structureMarkers?: readonly string[];
  // Explicitly accepted for legacy inputs, but never interpreted as origin.
  readonly engine?: string;
  readonly targetSoftware?: readonly string[];
}
const labels: Record<AssetIconId, string> = {
  blender:'Blender', unreal:'Unreal Engine', unity:'Unity', fbx:'FBX', obj:'OBJ', gltf:'GLTF', glb:'GLB',
  '3d-unknown':'Modelo 3D', texture:'Textura / imagem', material:'Material / shader',
  animation:'Animação', audio:'Áudio', document:'Documento', 'file-unknown':'Arquivo desconhecido',
};
const normalize = (value?: string | null) => (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
function engine(value?: string | null): EngineIconId | null {
  const name=normalize(value);
  return name==='blender'?'blender':name==='unity'?'unity':['unreal','unreal engine'].includes(name)?'unreal':null;
}
function format(value?: string | null): string {
  const name=normalize(value).replace(/^\./,'');
  return /^[a-z0-9_]+$/.test(name)&&!['auto','unknown','desconhecido','outro','directory','dir'].includes(name)?name:'';
}
const formats: Readonly<Record<string,AssetIconId>> = {
  blend:'blender',uasset:'unreal',umap:'unreal',uproject:'unreal',unitypackage:'unity',unity:'unity',unityproj:'unity',unity_dir:'unity',
  fbx:'fbx',obj:'obj',gltf:'gltf',glb:'glb',
  png:'texture',jpg:'texture',jpeg:'texture',tga:'texture',exr:'texture',bmp:'texture',webp:'texture',tif:'texture',tiff:'texture',dds:'texture',hdr:'texture',
  mat:'material',mtl:'material',shader:'material',shadergraph:'material',hlsl:'material',glsl:'material',wgsl:'material',
  anim:'animation',bvh:'animation',
  wav:'audio',mp3:'audio',ogg:'audio',flac:'audio',aac:'audio',m4a:'audio',wma:'audio',opus:'audio',aiff:'audio',
  pdf:'document',txt:'document',md:'document',doc:'document',docx:'document',rtf:'document',odt:'document',csv:'document',
  stl:'3d-unknown',ply:'3d-unknown',dae:'3d-unknown',abc:'3d-unknown',usd:'3d-unknown',usda:'3d-unknown',usdc:'3d-unknown',usdz:'3d-unknown','3ds':'3d-unknown',c4d:'3d-unknown',max:'3d-unknown',
};
export function resolveAssetIcon(record: AssetIconInput = {}) {
  const path=record.sourcePath || record.caminho || '';
  const basename=path.split(/[\\/]/).pop() ?? '';
  const ext=format(record.formato)||format(record.detectedFormat)||format(/\.([a-z0-9]+)$/i.exec(basename)?.[1]);
  const source=engine(record.sourceSoftware); // No inference from extension, targetSoftware or legacy engine.
  let primary: AssetIconId | undefined;
  const projectEngine=engine(record.projectType) || source;
  const markers=(record.structureMarkers??[]).map(normalize);
  const unityStructure=['assets','projectsettings'].every(marker=>markers.includes(marker));
  if(record.kind==='project') {
    if(['blend','uproject','unityproj','unity_dir'].includes(ext)) primary=formats[ext];
    else if(unityStructure) primary='unity';
    else if(projectEngine&&(!ext||(engine(record.projectType)&&!formats[ext]))) primary=projectEngine;
  }
  primary ??= formats[ext];
  if(!primary) {
    const category=normalize(record.categoria||record.category);
    const technical=normalize(record.technicalType);
    if(/^(textura|texture|imagem|image)$/.test(category)) primary='texture';
    else if(/^(material|shader)$/.test(category)) primary='material';
    else if(/^(animacao|animation)$/.test(category)) primary='animation';
    else if(/^(audio|som|sound)$/.test(category)) primary='audio';
    else if(/^(documento|document)$/.test(category)) primary='document';
    else if(/^(modelo 3d|model 3d|3d|personagem|veiculo|cenario|objeto)$/.test(category)) primary='3d-unknown';
    else if(/\b(material|shader)\b/.test(technical)) primary='material';
    else if(/\b(animation|animacao)\b/.test(technical)) primary='animation';
    else if(/\b(audio)\b/.test(technical)) primary='audio';
    else if(/\b(texture|textura|image|imagem)\b/.test(technical)) primary='texture';
    else if(/\b(document|documento)\b/.test(technical)) primary='document';
    else if(/\b(3d|mesh|malha|geometry|geometria)\b/.test(technical)) primary='3d-unknown';
    else primary='file-unknown';
  }
  const origin=source&&source!==primary?source:null;
  const fallback: AssetIconId=['fbx','obj','gltf','glb','blender','unreal','unity','3d-unknown'].includes(primary)?'3d-unknown':'file-unknown';
  return {primary,origin,fallback,label:labels[primary],originLabel:origin?labels[origin]:null,
    accessibleLabel:labels[primary]+(origin?` · Origem: ${labels[origin]}`:'')};
}
