// Isolated QA: production React components and official services, in-memory records only.
// Temporarily copy this file to src/__iconsqa.tsx and the HTML to src/__iconsqa.html.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DeckFilteredView} from '/components/deck/DeckFilteredView';
import {createWorkspaceStore} from '/workspace-store.js';
import {createLibraryOperationsService} from '/services/libraryOperationsService';
const memory=new Map();
const store=createWorkspaceStore({storage:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)}});
const specimens=[
 ['Projeto Blender','.blend','project','blender'],['Projeto Unreal','.uproject','project','unreal'],['Projeto Unity','.unityproj','project','unity'],
 ['Blender Asset','.blend','asset','blender'],['Unreal Asset','.uasset','asset','unreal'],['Unity Pacote','.unitypackage','package','unity'],
 ['FBX Origem Blender','.fbx','asset','blender'],['OBJ','.obj'],['GLTF','.gltf'],['GLB','.glb'],['Modelo 3D','.stl'],
 ['Textura','.png'],['Material','.mat'],['Animação','.bvh'],['Áudio','.wav'],['Documento','.pdf'],['Desconhecido','.xyz'],
];
store.transact(d=>{d.folders=[{id:'destination',name:'Destino de teste',parent:null}];d.assets=specimens.map(([nome,formato,kind='asset',sourceSoftware='unknown'],index)=>({id:'qa-'+index,nome,formato,kind,sourceSoftware,targetSoftware:['unreal'],caminho:'C:/fixture/'+nome+formato,folder:null,tags:[],categoria:'Outro'}));});
const operations=createLibraryOperationsService(store);
function Fixture(){const [data,setData]=useState(store.snapshot()),[selection,setSelection]=useState([]),[message,setMessage]=useState('');return <>
 <div className="qa-controls"><strong>Cenário isolado · biblioteca em memória</strong><button onClick={()=>{document.documentElement.dataset.theme='professional';document.documentElement.style.setProperty('--ui-accent','#73b8d3');}}>Tema Professional</button><button onClick={()=>{document.documentElement.dataset.theme='cinematic';document.documentElement.style.setProperty('--ui-accent','#00d4ff');}}>Tema Cinematic</button><output>{message}</output></div>
 <div id="app-container"><section id="view-workspace" className="view is-active"><div id="conves-react-root"><DeckFilteredView folders={data.folders} assets={data.assets} folderTags={[]} assetTags={[]} selectedAssetIds={selection} onSelectedAssetIdsChange={setSelection} onFolderTagsChange={()=>{}} onFoldersChange={()=>{}} operations={operations} onLibraryMutated={()=>setData(store.snapshot())} onNotify={setMessage}/></div></section></div>
 </>;}
createRoot(document.getElementById('fixture-root')).render(<Fixture/>);
