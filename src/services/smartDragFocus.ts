import {validateDeckDropTarget,type DeckDragPayload,type DeckFolder,type DeckAsset} from './deckFilterService.ts';
export function createDragTargetCache(payload:DeckDragPayload,folders:readonly DeckFolder[],assets:readonly DeckAsset[]) {
 const cache=new Map<string,ReturnType<typeof validateDeckDropTarget>>();
 return (type:'folder'|'root',id:string|null)=>{const key=type+':'+id;if(!cache.has(key))cache.set(key,validateDeckDropTarget({payload,targetType:type,targetId:id,folders,assets}));return cache.get(key)!;};
}
/** Partition the DOM into protected destinations and maximal unrelated subtrees. Never blur a protected ancestor. */
export function applySmartDragFocus(root:HTMLElement,payload:DeckDragPayload,validate:ReturnType<typeof createDragTargetCache>) {
 let stopped=false,frame=0;const marked=new Set<Element>();
 const clear=()=>{for(const el of marked)el.classList.remove('smart-focus-muted','smart-focus-valid','smart-focus-invalid','smart-focus-source');marked.clear();};
 const mark=(el:Element,name:string)=>{el.classList.add(name);marked.add(el);};
 const render=()=>{frame=0;if(stopped)return;clear();const protectedNodes=new Set<Element>();
  for(const el of root.querySelectorAll<HTMLElement>('[data-drop-folder-id], [data-deck-type="folder"], [data-smart-drop-root]')) {
   const type=el.hasAttribute('data-smart-drop-root')?'root':'folder';const id=type==='root'?null:el.dataset.dropFolderId??el.dataset.deckId??null;
   const valid=validate(type,id).valid;mark(el,valid?'smart-focus-valid':'smart-focus-invalid');if(valid)protectedNodes.add(el);
  }
  for(const el of root.querySelectorAll<HTMLElement>('[data-deck-id]')){const source=payload.kind==='folder'?el.dataset.deckType==='folder'&&el.dataset.deckId===payload.folderId:el.dataset.deckType==='asset'&&payload.assetIds.includes(el.dataset.deckId??'');if(source){mark(el,'smart-focus-source');protectedNodes.add(el);}}
  for(const el of root.querySelectorAll('.nautia-drag-status'))protectedNodes.add(el);
  const ancestors=new Set<Element>();for(const el of protectedNodes){let parent=el.parentElement;while(parent&&root.contains(parent)){ancestors.add(parent);parent=parent.parentElement;}}
  const walk=(el:Element)=>{if(protectedNodes.has(el))return;if(!ancestors.has(el)){mark(el,'smart-focus-muted');return;}for(const child of el.children)walk(child);};for(const child of root.children)walk(child);
 };
 const schedule=()=>{if(!stopped&&!frame)frame=requestAnimationFrame(render);};
 document.body.classList.add('smart-drag-focus');render();const observer=new MutationObserver(schedule);observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
 return ()=>{stopped=true;cancelAnimationFrame(frame);observer.disconnect();clear();document.body.classList.remove('smart-drag-focus');};
}

export function setSmartDragImage(transfer:DataTransfer|null,label:string) {
 if(!transfer)return;const ghost=document.createElement('div');ghost.className='smart-drag-ghost';ghost.textContent=label;ghost.setAttribute('aria-hidden','true');document.body.append(ghost);transfer.setDragImage(ghost,18,18);window.setTimeout(()=>ghost.remove(),150);
}
