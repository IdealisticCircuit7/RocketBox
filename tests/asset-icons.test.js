import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveAssetIcon} from '../src/services/assetIconResolver.ts';
import {ASSET_ICON_URLS,fallbackAssetImage} from '../src/services/assetIconResources.ts';

const cases=[
 ['Projeto Blender',{kind:'project',formato:'.blend',projectType:'blender'},'blender'],
 ['Projeto Unity',{kind:'project',detectedFormat:'UNITY_DIR',sourceSoftware:'unity'},'unity'],
 ['Projeto Unreal',{kind:'project',formato:'.uproject'},'unreal'],
 ['Unity estruturado',{kind:'project',formato:'.dir',structureMarkers:['Assets','ProjectSettings']},'unity'],
 ['Projeto declarado antigo',{kind:'project',projectType:'blender',caminho:'C:/Projeto'},'blender'],
 ['Diretório de projeto com ponto no nome',{kind:'project',projectType:'unity',formato:'.dir',caminho:'C:/Projeto.v2'},'unity'],
 ['BLEND',{caminho:'D:\\Scenes\\Test.BLEND'},'blender'],
 ['UASSET',{formato:'.uasset'},'unreal'],
 ['UNITYPACKAGE',{formato:'.unitypackage'},'unity'],
 ['FBX com categoria animação',{formato:' FBX ',categoria:'Animação'},'fbx'],
 ['OBJ',{formato:'.obj'},'obj'], ['GLTF',{detectedFormat:'GLTF'},'gltf'],['GLB',{caminho:'C:/X.GLB'},'glb'],
 ['PNG',{formato:'png',categoria:'Material'},'texture'],['JPG',{formato:'jpg'},'texture'],['JPEG',{formato:'jpeg'},'texture'],
 ['Áudio',{formato:'.wav'},'audio'],['Animação declarada',{formato:'.custom',categoria:'Animação'},'animation'],
 ['Animação técnica',{technicalType:'3D skeletal animation'},'animation'],
 ['Material declarado',{categoria:'Material'},'material'],['Shader reconhecido',{formato:'hlsl'},'material'],
 ['Textura técnica',{technicalType:'Texture / Image'},'texture'],['Documento técnico',{technicalType:'Documento externo'},'document'],
 ['Modelo reconhecido',{technicalType:'3D Mesh / Scene',formato:'.custom'},'3d-unknown'],
 ['Modelo sem ícone específico',{formato:'.stl'},'3d-unknown'],['Documento',{formato:'.pdf'},'document'],
 ['Arquivo desconhecido',{caminho:'C:/arquivo.xyz',categoria:'Outro'},'file-unknown'],
 ['Formato AUTO com caminho',{formato:'AUTO',caminho:'C:/Test.obj'},'obj'],
 ['Formato contradiz projeto não reconhecido',{kind:'project',sourceSoftware:'blender',formato:'.fbx'},'fbx'],
];
for(const [name,record,expected] of cases) test(`Ícones: ${name}`,()=>assert.equal(resolveAssetIcon(record).primary,expected));

test('FBX mantém formato e emblema apenas da origem explícita; nunca destino ou engine legado',()=>{
  const source=resolveAssetIcon({formato:'.fbx',sourceSoftware:'blender',targetSoftware:['unreal']});
  assert.equal(source.primary,'fbx');assert.equal(source.origin,'blender');assert.match(source.accessibleLabel,/Origem: Blender/);
  for(const record of [{formato:'.fbx',targetSoftware:['unreal']},{formato:'.fbx',engine:'Unreal Engine'},{formato:'.fbx',sourceSoftware:'unknown'},{caminho:'C:/Blender/export.fbx'}]) {
    assert.equal(resolveAssetIcon(record).origin,null);assert.equal(resolveAssetIcon(record).primary,'fbx');
  }
  assert.equal(resolveAssetIcon({formato:'.blend',sourceSoftware:'blender'}).origin,null);
});
test('Registros antigos e novos são resolvidos sem mutação ou recadastro',()=>{
  const old=Object.freeze({id:'old',nome:'test',caminho:'C:/old.fbx',formato:'.fbx',engine:'Unity',categoria:'Personagem'});
  const before=JSON.stringify(old);assert.equal(resolveAssetIcon(old).primary,'fbx');assert.equal(resolveAssetIcon(old).origin,null);
  assert.equal(JSON.stringify(old),before);
  assert.equal(resolveAssetIcon({}).primary,'file-unknown');
});
test('Todos os 14 recursos são SVG reais locais, com canvas quadrado e sem dependências externas',()=>{
  assert.equal(Object.keys(ASSET_ICON_URLS).length,14);
  for(const url of Object.values(ASSET_ICON_URLS)) {
    const svg=fs.readFileSync(new URL(url),'utf8');
    assert.match(svg,/<svg\b/);assert.match(svg,/viewBox="0 0 64 64"/);
    assert.doesNotMatch(svg,/<(?:image|script|foreignObject)\b|(?:href|src)="https?:/);
  }
});
test('Falha de leitura troca para fallback uma única vez e não entra em repetição',()=>{
  const img={src:ASSET_ICON_URLS.fbx,dataset:{},hidden:false};
  fallbackAssetImage(img,ASSET_ICON_URLS['3d-unknown']);assert.equal(img.src,ASSET_ICON_URLS['3d-unknown']);assert.equal(img.hidden,false);
  fallbackAssetImage(img,ASSET_ICON_URLS['3d-unknown']);assert.equal(img.hidden,true);
  assert.equal(resolveAssetIcon({formato:'.fbx'}).fallback,'3d-unknown');
  assert.equal(resolveAssetIcon({formato:'.png'}).fallback,'file-unknown');
});
