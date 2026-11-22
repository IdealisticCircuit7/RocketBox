import type {LibraryOperationsService} from './libraryOperationsService.ts';
import {normalizeTagLabel} from './deckFilterService.ts';
import {createNautiaToolSystem,type NautiaContext} from './nautiaToolSystem.ts';
import type {NautiaQueryOutcome} from './nautiaOrchestratorService.ts';

/** Only a complete, literal lookup with an exact registered name can bypass generation. */
export async function lookupNamedAsset(prompt:string,operations:LibraryOperationsService,context:NautiaContext):Promise<NautiaQueryOutcome|null>{
 const text=prompt.trim().replace(/[.!?]+$/,'');
 const match=text.match(/^(?:por favor[, ]+)?(?:(?:(?:voc[eê]|vc)\s+(?:pode|consegue)\s+)?(?:localiz(?:e|a|ar)|encontr(?:e|a|ar)|procur(?:e|a|ar)|bus(?:que|ca|car))|onde\s+(?:est[áa](?:\s+localizad[oa])?|fica|encontro))\s+(.+)$/iu);
 if(!match)return null;
 const query=match[1].replace(/\s*,?\s*por favor$/i,'').replace(/^(?:o|a|os|as)\s+/i,'').replace(/^(?:asset|arquivo|modelo|personagem)\s+/i,'').replace(/^["“']|["”']$/g,'').trim();
 if(!query||query.length>200||/^(?:ele|ela|eles|elas|isso|aquilo|esse|essa|selecionad[oa]s?)$/i.test(query))return null;
 const result=await createNautiaToolSystem(operations,()=>context).call('searchAssets',{query,scope:'library'});
 if(!result.ok)return null;
 const data=result.data as {assets:NonNullable<NautiaQueryOutcome['matchedAssets']>};
 const matches=data.assets.filter(asset=>normalizeTagLabel(asset.nome)===normalizeTagLabel(query)||normalizeTagLabel(asset.caminho.split(/[\\/]/).pop()??'')===normalizeTagLabel(query));
 if(!matches.length)return null;
 const folders=operations.listFolders(),byId=new Map(folders.map(f=>[f.id,f]));
 const folderPath=(id:string|null|undefined)=>{
  const parts:string[]=[],visited=new Set<string>();let cursor=id;
  while(cursor&&!visited.has(cursor)){visited.add(cursor);const folder=byId.get(cursor);if(!folder){parts.unshift('Pasta não encontrada');break;}parts.unshift(folder.name);cursor=folder.parent;}
  return ['Convés',...parts].join(' / ');
 };
 const locations=matches.map(asset=>`${asset.nome} — ${folderPath(asset.folder)}`);
 return {kind:'read-result',sourceMode:'deterministic',message:matches.length===1?`Encontrei o registro de ${matches[0].nome}.\n\nPasta: ${folderPath(matches[0].folder)}.`:`Encontrei ${matches.length} registros com esse nome:\n\n${locations.map(location=>`- ${location}`).join('\n')}\n\nQual deles você procura?`,matchedAssets:matches,toolData:[{...result,data:{assets:matches,locations}}]};
}
