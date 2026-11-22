import { ViewerAnimation } from './ViewerAnimation';
import { useEffect, useState } from 'react';
type Viewer=Awaited<ReturnType<typeof import('../../services/modelViewer').mountModelViewer>>;
export function ViewerInspection({viewer}:{viewer:Viewer}) {
 const [mode,setMode]=useState('solid'),[material,setMaterial]=useState(0),[length,setLength]=useState(.08),[compute,setCompute]=useState(false);
 const [normalInfo,setNormalInfo]=useState({lines:0,missing:0,calculated:0,unsupported:0});
 useEffect(()=>{viewer.wireframe(mode==='wire');setNormalInfo(viewer.normals.configure(mode==='normals',length,compute));return()=>{viewer.normals.configure(false);};},[mode,viewer,length,compute]);
 const mat=viewer.materials[material];
 return <div className="rb-viewer-inspection">
  <div className="rb-viewer-toolbar" role="group" aria-label="Modos técnicos">{[['solid','Sólido'],['wire','Malha'],['materials','Materiais'],['normals','Normais']].map(([key,label])=><button type="button" title={key==='normals'?'Visualizar a orientação das normais da geometria.':label} aria-pressed={mode===key} key={key} onClick={()=>setMode(key)}>{label}</button>)}
  <select aria-label="Vista da câmera" defaultValue="" onChange={e=>viewer.view(e.target.value)}><option value="" disabled>Vista</option><option value="front">Frontal +Z</option><option value="back">Traseira −Z</option><option value="side">Lateral +X</option><option value="top">Superior +Y</option></select>
  <select aria-label="Projeção da câmera" onChange={e=>viewer.projection(e.target.value==='ortho')}><option value="perspective">Perspectiva</option><option value="ortho">Ortográfica</option></select></div>
  <details><summary>Inspeção técnica · {viewer.vertices.toLocaleString()} vértices · {viewer.meshes.length} malhas</summary>
   <p>Métricas do conteúdo visualizado: {JSON.stringify(viewer.metrics)}</p><p>Eixos: X vermelho · Y verde · Z azul. Arrastar orbita a câmera; os campos abaixo giram o modelo.</p>
   <div className="rb-viewer-rotation">{(['x','y','z'] as const).map(axis=><label key={axis}>Modelo {axis.toUpperCase()} °<input type="number" defaultValue={0} min={-360} max={360} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))viewer.rotate(axis,n);}}/></label>)}</div>
  </details>
  <ViewerAnimation animation={viewer.animation}/>
  {mode==='materials'&&<div className="rb-viewer-drawer"><select aria-label="Material" value={material} onChange={e=>setMaterial(Number(e.target.value))}>{viewer.materials.map((m,i)=><option key={m.uuid} value={i}>{m.name||`Material ${i+1}`} · {m.type}</option>)}</select>{mat&&<dl><dt>Tipo</dt><dd>{mat.type}</dd><dt>Transparência / opacidade</dt><dd>{String(mat.transparent)} / {mat.opacity}</dd><dt>Texturas carregadas</dt><dd>{Object.entries(mat).filter(([,v])=>v&&typeof v==='object'&&'isTexture' in v).map(([k])=>k).join(', ')||'Nenhuma'}</dd></dl>}</div>}
  {mode==='normals'&&<div className="rb-viewer-drawer"><label>Comprimento das normais<input aria-label="Comprimento das normais" type="range" min="0.005" max="0.5" step="0.005" value={length} onChange={e=>setLength(Number(e.target.value))}/></label><label><input type="checkbox" checked={compute} onChange={e=>setCompute(e.target.checked)}/>Calcular normais ausentes para esta inspeção</label><p>Normais de vértices da geometria carregada; os parsers podem tê-las gerado. Linhas: {normalInfo.lines} (máximo 5.000). Malhas sem normais: {normalInfo.missing}. Calculadas em cópias temporárias: {normalInfo.calculated}.</p>{normalInfo.unsupported>0&&<p>Normais indisponíveis para {normalInfo.unsupported} malha(s) com esqueleto/morph: a deformação exige suporte específico. Os demais modos permanecem disponíveis.</p>}</div>}
 </div>;
}
