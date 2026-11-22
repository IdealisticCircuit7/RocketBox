export function minimizeToolData(value: unknown, depth=0): unknown {
  if(depth>7)return '[limite]';
  if(typeof value==='string')return value.slice(0,800);
  if(Array.isArray(value))return value.slice(0,20).map(v=>minimizeToolData(v,depth+1));
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['caminho','sourcePath','projectDirectory','path','evidence','fingerprint','ruleDefinitions','verifiedMetadata'].includes(k)).map(([k,v])=>[k,minimizeToolData(v,depth+1)]));
  return value;
}
