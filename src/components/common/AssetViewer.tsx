import { ConvertedPreview } from './ConvertedPreview';
import { AudioPreview } from './AudioPreview';
import { FolderTagIconGlyph } from '../deck/FolderTagIconGlyph';
import { AssetIcon } from './AssetIcon';
import type { AssetIconInput } from '../../services/assetIconResolver';
import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { viewerKind, viewerExtension, imageDimensions } from '../../services/viewerPolicy';
import './assetViewer.css';
import { DEFAULT_VIEWER_LIMITS } from '../../services/viewerResources';
import { ViewerInspection } from './ViewerInspection';
type ModelViewer = Awaited<ReturnType<typeof import('../../services/modelViewer').mountModelViewer>>;

function DirectAssetViewer({ path = '', file, active = true, iconRecord }: { path?: string; file?: File | null; active?: boolean; iconRecord?: AssetIconInput }) {
  const abort = useRef<AbortController | null>(null);
  const [modelInfo,setModelInfo]=useState<ModelViewer|null>(null);
  const [limits,setLimits]=useState(DEFAULT_VIEWER_LIMITS);
  const host = useRef<HTMLDivElement>(null);
  const actions = useRef<{ reset(): void; zoom(factor: number): void; grid(): void; axes(): void } | null>(null);
  const [status, setStatus] = useState('Nenhum arquivo selecionado.');
  const [state, setState] = useState('empty');
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const observer = new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? false));
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let stopped = false;
    const controller=new AbortController();abort.current=controller;setModelInfo(null);
    let cleanup = () => {};
    actions.current = null;
    const name = path || file?.name || '';
    const element = host.current;
    if (!element || !active || !visible) return;
    const kind = viewerKind(name);
    if (!name) { setState('empty'); setStatus('Nenhum arquivo selecionado.'); return; }
    if (kind === 'unsupported') { setState('unsupported'); setStatus('Formato sem suporte direto. BLEND e UASSET exigem um importador próprio; nenhuma conversão foi realizada.'); return; }
    setState('loading'); setStatus('Carregando recurso local…');
    void (async () => {
      let bytes: ArrayBuffer;
      try {
        if (file) { if (file.size > limits.bytes) throw new Error('Limite de 32 MiB excedido.'); bytes = await file.arrayBuffer(); }
        else if (isTauri()) bytes = await invoke<ArrayBuffer>('ler_recurso_viewer', { path });
        else throw new Error('Abra o aplicativo desktop para visualizar este caminho.');
      } catch (error) { if (!stopped) { setState('read-error'); setStatus(`Falha de leitura: ${String(error)}`); } return; }
      if (stopped || controller.signal.aborted) return;
      try {
        if (kind === 'image') {
          imageDimensions(bytes, viewerExtension(name));
          const url = URL.createObjectURL(new Blob([bytes], { type: viewerExtension(name) === 'png' ? 'image/png' : 'image/jpeg' }));
          const img = new Image(); img.alt = name.split(/[\\/]/).pop() ?? 'Asset'; img.draggable = false;
          cleanup = () => { URL.revokeObjectURL(url); img.remove(); };
          await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Imagem inválida ou não decodificável.')); img.src = url; });
          if (stopped || controller.signal.aborted) { cleanup(); return; }
          if (img.naturalWidth * img.naturalHeight > 32_000_000) throw new Error('Imagem excede 32 megapixels.');
          element.append(img);
          let scale = 1, x = 0, y = 0, drag: { x: number; y: number } | null = null;
          const draw = () => { img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; };
          const reset = () => { scale = 1; x = y = 0; draw(); };
          actions.current = { reset, zoom: factor => { scale = Math.max(.1, Math.min(16, scale * factor)); draw(); }, grid() {}, axes() {} };
          element.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY }; element.setPointerCapture(e.pointerId); };
          element.onpointermove = e => { if (drag) { x += e.clientX - drag.x; y += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; draw(); } };
          element.onpointerup = () => { drag = null; };
          element.onpointercancel = () => { drag = null; };
          element.onwheel = e => { e.preventDefault(); actions.current?.zoom(e.deltaY < 0 ? 1.1 : .9); };
          const release = cleanup;
          cleanup = () => { release(); element.onpointerdown = element.onpointermove = element.onpointerup = element.onpointercancel = element.onwheel = null; };
          setStatus(`${img.naturalWidth} × ${img.naturalHeight} px · Arraste para pan · Roda para zoom`);
        } else {
          const { mountModelViewer } = await import('../../services/modelViewer');
          if (stopped || controller.signal.aborted) return;
          if(bytes.byteLength>limits.bytes)throw new Error('Limite de tamanho excedido.');
          const viewer = await mountModelViewer(element, bytes, viewerExtension(name),{source:file?'':path,signal:controller.signal,limits});
          cleanup = viewer.dispose;
          if (stopped || controller.signal.aborted) { cleanup(); return; }
          actions.current = viewer;setModelInfo(viewer);
          setStatus(viewer.warnings.length?'Material ausente / parcial: '+viewer.warnings.slice(0,3).join(' • '):'Prévia pronta · Órbita: arraste · Pan: botão direito · Zoom: roda');
        }
        setState('ready');
      } catch (error) { cleanup(); if (!stopped) { setState(controller.signal.aborted?'cancelled':'invalid'); setStatus(controller.signal.aborted?'Carregamento cancelado.':`Falha / arquivo muito complexo ou sem suporte: ${String(error)}`); } }
    })();
    return () => { stopped = true; controller.abort(); actions.current = null; cleanup(); };
  }, [path, file, active, visible, limits]);
  return <section className="rb-viewer" data-state={state} aria-label="Visualizador do asset">
    <div className="rb-viewer-toolbar"><button type="button" title="Enquadrar e resetar câmera" aria-label="Enquadrar e resetar câmera" disabled={state !== 'ready'} onClick={() => actions.current?.reset()}>⤢</button><button type="button" title="Aproximar" aria-label="Aproximar" disabled={state !== 'ready'} onClick={() => actions.current?.zoom(1.25)}>+</button><button type="button" title="Afastar" aria-label="Afastar" disabled={state !== 'ready'} onClick={() => actions.current?.zoom(.8)}>−</button>{viewerKind(path || file?.name || '') === 'model' && <><button type="button" title="Alternar grade" aria-label="Alternar grade" disabled={state !== 'ready'} onClick={() => actions.current?.grid()}>▦</button><button type="button" title="Alternar eixos XYZ" aria-label="Alternar eixos XYZ" disabled={state !== 'ready'} onClick={() => actions.current?.axes()}>⊕</button></>}</div>
    {state==='loading'&&<button type="button" onClick={()=>{abort.current?.abort();setState('cancelled');setStatus('Carregamento cancelado.');}}>Cancelar carregamento</button>}
    {modelInfo&&state==='ready'&&<ViewerInspection viewer={modelInfo}/>}
    <div className="rb-viewer-surface" ref={host} />
    <details className="rb-viewer-limits"><summary>Limites de carregamento</summary>{([['bytes','Arquivo/conjunto MiB',1048576,1,32],['memory','Memória estimada MiB',1048576,16,512],['vertices','Vértices',1,1000,2000000],['milliseconds','Tempo cooperativo s',1000,1,120]] as const).map(([key,label,unit,min,max])=><label key={key}>{label}<input type="number" min={min} max={max} value={limits[key]/unit} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>=min&&n<=max)setLimits(v=>({...v,[key]:n*unit}));}}/></label>)}</details>
    <p role="status"><AssetIcon asset={iconRecord ?? {caminho:path || file?.name}} />{status}</p>
  </section>;
}

export function AssetViewer({path='',file,active=true,assetId,iconRecord}:{path?:string;file?:File|null;active?:boolean;assetId?:string;iconRecord?:AssetIconInput}) {
 if(!path.trim()&&!file)return <section className="rb-viewer rb-viewer--empty" data-state="empty" aria-label="Visualizador do asset"><div className="rb-viewer-empty" role="status"><FolderTagIconGlyph icon="cube" className="rb-viewer-empty__icon"/><h3>Nenhum asset carregado</h3><p>Selecione um asset ou escolha um arquivo para começar a visualizar.</p></div></section>;
 const ext=viewerExtension(path||file?.name||'');
 if(['wav','mp3','ogg'].includes(ext))return <AudioPreview path={path} file={file} active={active} iconRecord={iconRecord}/>;
 if(['blend','uasset'].includes(ext))return <ConvertedPreview key={path} path={path} assetId={assetId??path} active={active} iconRecord={iconRecord} render={p=><DirectAssetViewer path={p} active={active} iconRecord={iconRecord??{caminho:path}}/>}/>;
 return <DirectAssetViewer path={path} file={file} active={active} iconRecord={iconRecord}/>;
}
