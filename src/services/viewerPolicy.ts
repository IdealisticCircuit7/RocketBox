export const VIEWER_MAX_BYTES = 32 * 1024 * 1024;
export function imageDimensions(bytes: ArrayBuffer, extension: string): [number, number] {
  const v = new DataView(bytes); let width = 0, height = 0;
  if (extension === 'png' && v.byteLength >= 24 && v.getUint32(0) === 0x89504e47 && v.getUint32(4) === 0x0d0a1a0a && v.getUint32(12) === 0x49484452) {
    width = v.getUint32(16); height = v.getUint32(20);
  } else if (v.byteLength >= 4 && v.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset + 4 <= v.byteLength) {
      if (v.getUint8(offset++) !== 0xff) break;
      while (offset < v.byteLength && v.getUint8(offset) === 0xff) offset++;
      if (offset + 3 > v.byteLength) break;
      const marker = v.getUint8(offset++);
      if (marker === 0xda || marker === 0xd9) break;
      const length = v.getUint16(offset);
      if (length < 2 || offset + length > v.byteLength) break;
      if ([0xc0,0xc1,0xc2].includes(marker) && length >= 8) { height = v.getUint16(offset + 3); width = v.getUint16(offset + 5); break; }
      offset += length;
    }
  }
  if (!width || !height || width * height > 32_000_000 || width > 16384 || height > 16384) throw new Error('Imagem inválida ou acima do limite de 32 MP / 16384 px.');
  return [width, height];
}
export function viewerExtension(path: string): string { return path.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() ?? ''; }
export function viewerKind(path: string): 'image' | 'model' | 'unsupported' {
  const ext = viewerExtension(path);
  return ['png', 'jpg', 'jpeg'].includes(ext) ? 'image' : ['glb', 'gltf', 'obj', 'fbx'].includes(ext) ? 'model' : 'unsupported';
}
export function validateGltf(json: Record<string, any>, localDependencies = false): void {
  if (json.asset?.version !== '2.0') throw new Error('Somente glTF 2.0 é suportado.');
  if (json.extensionsRequired?.length) throw new Error('Modelo exige extensões não suportadas nesta versão.');
  let elements = 0;
  for (const accessor of json.accessors ?? []) {
    if (!Number.isSafeInteger(accessor.count) || accessor.count < 0) throw new Error('Accessor inválido.');
    elements += accessor.count;
  }
  if (elements > 2_000_000 || (json.nodes?.length ?? 0) > 10000) throw new Error('Modelo excede o limite de complexidade.');
  for (const buffer of json.buffers ?? []) {
    if (buffer.byteLength > VIEWER_MAX_BYTES || (!localDependencies && buffer.uri && !/^data:application\/(octet-stream|gltf-buffer);base64,/.test(buffer.uri))) throw new Error('Buffers externos ou grandes não suportados. Use GLB autocontido.');
  }
  // Material references are preserved; resource resolution is restricted by the adapter.
}
