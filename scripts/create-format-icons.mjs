import {writeFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('../src/assets/icons/formats/',import.meta.url));
mkdirSync(directory,{recursive:true});
const gradients=`<defs>
  <linearGradient id="cyan" x1="12" y1="8" x2="50" y2="56" gradientUnits="userSpaceOnUse"><stop stop-color="#CBFAFF"/><stop offset=".45" stop-color="#5BE3FA"/><stop offset="1" stop-color="#289CCF"/></linearGradient>
  <linearGradient id="blue" x1="12" y1="10" x2="52" y2="54" gradientUnits="userSpaceOnUse"><stop stop-color="#86DAFF"/><stop offset=".48" stop-color="#398DFA"/><stop offset="1" stop-color="#5462CF"/></linearGradient>
  <linearGradient id="purple" x1="12" y1="12" x2="52" y2="54" gradientUnits="userSpaceOnUse"><stop stop-color="#A9DEFF"/><stop offset=".55" stop-color="#8E82EA"/><stop offset="1" stop-color="#6950AE"/></linearGradient>
  <linearGradient id="silver" x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse"><stop stop-color="#F1F7FD"/><stop offset=".5" stop-color="#BBCAD8"/><stop offset="1" stop-color="#73849B"/></linearGradient>
  <linearGradient id="metal" x1="16" y1="14" x2="48" y2="52" gradientUnits="userSpaceOnUse"><stop stop-color="#F3FCFF"/><stop offset=".25" stop-color="#BFD8E9"/><stop offset=".46" stop-color="#667C9D"/><stop offset=".52" stop-color="#273A59"/><stop offset=".72" stop-color="#8799B8"/><stop offset="1" stop-color="#3F497B"/></linearGradient>
  <linearGradient id="paper" x1="15" y1="8" x2="49" y2="56" gradientUnits="userSpaceOnUse"><stop stop-color="#263D55"/><stop offset="1" stop-color="#142039"/></linearGradient>
</defs>`;
const path=(d,fill='none',stroke='url(#cyan)',width=2)=>`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const circle=(x,y,r,fill,stroke='none',width=1)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
function save(name,title,body){writeFileSync(directory+name+'.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64" fill="none">\n<title>${title} — RocketBox</title>\n${gradients}\n${body}\n</svg>\n`);console.log(name);}
// Set 1: format symbols; FBX is retained from the first approved direction.
save('obj','OBJ triangular mesh',
  path('M32 8 53 25 44 52 20 52 11 25Z','url(#paper)','url(#blue)')+
  path('M32 8 32 31 11 25 M32 31 53 25 M32 31 44 52 M32 31 20 52 M20 52 32 8 M44 52 32 8','none','url(#blue)',1.6)+
  [[32,8],[53,25],[44,52],[20,52],[11,25],[32,31]].map(([x,y])=>circle(x,y,1.65,'#B5E9FF','#2B75C8',.6)).join(''));
save('gltf','GLTF layered orbital geometry',
  path('M10 36C3 45 19 53 37 50C49 48 57 42 56 35','none','url(#purple)',2.2)+
  path('M13 38 32 27 51 38 32 50Z','url(#paper)','url(#purple)')+
  path('M13 21 32 10 51 21 32 32Z','url(#paper)','url(#cyan)')+
  path('M32 32V39','none','url(#cyan)',1.8)+
  path('M56 35C58 25 42 18 25 21C13 23 6 29 8 35','none','url(#cyan)',2.2)+circle(55,38,2,'#B7F6FF'));
save('glb','GLB solid cube',
  path('M32 8 53 20 32 32 11 20Z','url(#cyan)','#A6EDFF',1.4)+
  path('M11 20 32 32 32 56 11 44Z','url(#blue)','#6BCDF2',1.4)+
  path('M32 32 53 20 53 44 32 56Z','url(#purple)','#9294F5',1.4));
save('3d-unknown','Unidentified 3D resource',
  path('M32 8 53 20 32 32 11 20Z','#CBD5E2','#E5EDF5',1.5)+
  path('M11 20 32 32 32 56 11 44Z','#8597AB','#CAD6E2',1.5)+
  path('M32 32 53 20 53 44 32 56Z','#52647B','#AFBECE',1.5));
// Set 2: category symbols, sharing the same 64-unit grid and clear margins.
save('texture','Texture UV surface',
  path('M9 42 32 55 55 22V26L32 59 9 46Z','#253C62','none')+
  path('M32 9 43.5 15.5 32 32 20.5 25.5Z','url(#cyan)','#7BDAEE',1.2)+
  path('M43.5 15.5 55 22 43.5 38.5 32 32Z','#233958','#7BDAEE',1.2)+
  path('M20.5 25.5 32 32 20.5 48.5 9 42Z','#253652','#7BDAEE',1.2)+
  path('M32 32 43.5 38.5 32 55 20.5 48.5Z','url(#purple)','#7BDAEE',1.2)+
  path('M32 9 55 22 32 55 9 42Z','none','url(#cyan)',1.8));
save('material','Metallic material sphere',
  circle(32,32,22,'url(#metal)','url(#cyan)',1.8)+
  path('M17 26C19 19 25 15 32 15','none','#E6FAFF',2.5)+
  path('M17 38C26 46 41 45 49 37','none','#A99BEA',1.5));
save('animation','Motion silhouette',
  path('M9 24H19 M7 32H16 M10 40H16','none','#5EA4D5',2)+
  circle(38,12,4,'url(#cyan)')+
  path('M34 22 27 32 35 38 42 51 M27 32 23 43 14 52 M34 22 42 28 51 25 M34 22 25 23 20 29','none','url(#cyan)',4.5));
save('audio','Audio waveform',
  [ [10,26,38],[17,20,44],[24,10,54],[32,17,47],[40,24,40],[47,15,49],[54,26,38] ]
    .map(([x,y1,y2])=>path(`M${x} ${y1}V${y2}`,'none',x<32?'url(#cyan)':'url(#purple)',3.5)).join(''));
save('document','Document',
  path('M17 8H37L49 20V53Q49 56 46 56H18Q15 56 15 53V11Q15 8 17 8Z','url(#paper)','url(#silver)',1.8)+
  path('M37 8V20H49','url(#blue)','url(#silver)',1.5)+
  path('M23 29H40 M23 37H40 M23 45H34','none','url(#cyan)',2.2));
save('file-unknown','Unidentified file',
  path('M17 8H37L49 20V53Q49 56 46 56H18Q15 56 15 53V11Q15 8 17 8Z','#273448','url(#silver)',1.8)+
  path('M37 8V20H49','#64778E','url(#silver)',1.5));
