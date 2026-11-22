import test from 'node:test';
import assert from 'node:assert/strict';
import { viewerKind, validateGltf, imageDimensions } from '../src/services/viewerPolicy.ts';
import { prepareGltf } from '../src/services/modelViewer.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { readFileSync } from 'node:fs';
import { ObjectLoader } from 'three';
import { localViewerReference } from '../src/services/viewerResources.ts';

test('Local dependency policy rejects remote, encoded, absolute and parent paths',()=>{
  for(const value of ['../tex.png','https://host/tex.png','C:/tex.png','/tex.png','tex%20.png','a/./b','a\\b','a?x'])assert.throws(()=>localViewerReference(value));
  assert.equal(localViewerReference('textures/albedo.png'),'textures/albedo.png');
});
test('Materials and UV references survive glTF validation',()=>{
 const json={asset:{version:'2.0'},buffers:[{uri:'mesh.bin',byteLength:36}],materials:[{name:'Copper'}],images:[{uri:'textures/albedo.png'}],meshes:[{primitives:[{material:0,attributes:{TEXCOORD_0:1}}]}]};
 validateGltf(json,true);assert.equal(json.materials[0].name,'Copper');assert.equal(json.meshes[0].primitives[0].attributes.TEXCOORD_0,1);
});
test('Worker parses real OBJ UVs and compatible FBX and rejects excessive geometry',async()=>{
 let result;globalThis.self={postMessage:value=>{result=value;}};
 await import('../src/services/viewerParser.worker.ts');
 const obj=new TextEncoder().encode('v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3\n').buffer;
 self.onmessage({data:{bytes:obj,extension:'obj',vertices:100,memory:100000}});
 assert.ok(!result.error);const model=new ObjectLoader().parse(result.json);assert.equal(model.children[0].geometry.attributes.uv.count,3);
 const data=readFileSync(new URL('./fixtures/viewer-triangle.fbx',import.meta.url));const bytes=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
 self.onmessage({data:{bytes,extension:'fbx',vertices:100,memory:100000}});assert.ok(!result.error);const fbx=new ObjectLoader().parse(result.json);assert.equal(fbx.children[0].geometry.attributes.position.count,3);
 self.onmessage({data:{bytes:obj,extension:'obj',vertices:1,memory:100000}});assert.match(result.error,/complexo/);
 delete globalThis.self;
});

test('Viewer supports explicit formats and rejects external dependencies and excessive allocations', () => {
  assert.equal(viewerKind('C:/image.PNG'), 'image');
  assert.equal(viewerKind('test.obj'), 'model');
  for (const ext of ['blend', 'uasset']) assert.equal(viewerKind(`test.${ext}`), 'unsupported');
  assert.throws(() => validateGltf({ asset: { version: '2.0' }, buffers: [{ uri: 'https://example.org/secret.bin' }] }), /externos/);
  assert.throws(() => validateGltf({ asset: { version: '2.0' }, accessors: [{ count: 3000000 }] }), /complexidade/);
  assert.throws(() => prepareGltf(new ArrayBuffer(4), 'glb'), /inválido/);
});
test('Image header limits reject oversized and truncated input before decoding', () => {
  const bytes = new ArrayBuffer(24), v = new DataView(bytes);
  v.setUint32(0,0x89504e47); v.setUint32(4,0x0d0a1a0a); v.setUint32(12,0x49484452); v.setUint32(16,640); v.setUint32(20,480);
  assert.deepEqual(imageDimensions(bytes,'png'), [640,480]);
  v.setUint32(16,100000); assert.throws(() => imageDimensions(bytes,'png'), /limite/);
  assert.throws(() => imageDimensions(new ArrayBuffer(5),'jpeg'), /inválida/);
});
test('Real GLB triangle and OBJ geometry parse with neutral materials', async () => {
  const json = { asset: { version: '2.0' }, buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0,0,0], max: [1,1,0] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 };
  const text = new TextEncoder().encode(JSON.stringify(json)); const padded = Math.ceil(text.length / 4) * 4;
  const buffer = new ArrayBuffer(12 + 8 + padded + 8 + 36); const view = new DataView(buffer);
  [0x46546c67,2,buffer.byteLength,padded,0x4e4f534a].forEach((value,index) => view.setUint32(index * 4,value,true));
  new Uint8Array(buffer,20,padded).fill(32); new Uint8Array(buffer,20,text.length).set(text);
  view.setUint32(20+padded,36,true); view.setUint32(24+padded,0x004e4942,true);
  new Float32Array(buffer,28+padded,9).set([0,0,0,1,0,0,0,1,0]);
  const gltf = await new GLTFLoader().parseAsync(prepareGltf(buffer,'glb'), '');
  assert.equal(gltf.scene.children[0].geometry.getAttribute('position').count,3);
  gltf.scene.children[0].geometry.dispose(); gltf.scene.children[0].material.dispose();
  const obj = new OBJLoader().parse('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  assert.equal(obj.children[0].geometry.getAttribute('position').count,3);
  obj.children[0].geometry.dispose(); obj.children[0].material.dispose();
});
