import {readFileSync,writeFileSync} from 'node:fs';
const glb=readFileSync(new URL('../tests/fixtures/etapa15-animated.glb',import.meta.url)).toString('base64');
const wav=readFileSync(new URL('../tests/fixtures/etapa15-silence.wav',import.meta.url)).toString('base64');
writeFileSync(new URL('../src/__preview15.html',import.meta.url),'<!doctype html><meta charset="utf-8"><title>ETAPA15 — fixtures</title><div id="root"></div><script type="module" src="/__preview15.tsx"></script>');
writeFileSync(new URL('../src/__preview15.tsx',import.meta.url),`import React from 'react';import {createRoot} from 'react-dom/client';import {AssetViewer} from '/components/common/AssetViewer';
const decode=(b:string)=>Uint8Array.from(atob(b),c=>c.charCodeAt(0));const glb=new File([decode('${glb}')],'rig.glb'),wav=new File([decode('${wav}')],'silencio.wav');
document.body.style.cssText='background:#08121c;color:#bde1f4;font:13px system-ui;margin:12px';
createRoot(document.getElementById('root')!).render(<><h2>Prévia direta — GLB com rig e clipes reais</h2><div style={{height:460}}><AssetViewer file={glb}/></div><h2>Áudio de teste WAV — silêncio de 1 segundo</h2><div style={{height:160}}><AssetViewer file={wav}/></div></>);`);
console.log('Abra http://127.0.0.1:1420/__preview15.html com Vite ativo. As duas cópias __preview15 em src são temporárias e podem ser removidas ao terminar.');
