import type { NautiaIntent } from '../../ai/Nautia_llm/runtime/foundation.ts';
import type { LibraryOperationsService } from './libraryOperationsService.ts';
import { normalizeTagLabel } from './deckFilterService.ts';
import type { NautiaContext, ToolName } from './nautiaToolSystem.ts';

/** Resolves typed entities against current official records. Never writes or resumes historical commands. */
export function resolveTagRequest(intent:NautiaIntent, context:NautiaContext, operations:LibraryOperationsService, prompt:string):
  {tool:ToolName;args:unknown}|{message:string}|null {
  if(intent.requiresClarification||intent.intent!=='manage_tags'||!['assignTags','removeTags'].includes(intent.proposedTool??''))return null;
  const catalog=operations.listTags().data?.assetTags??[];
  function literals(value:string):string[]{
    let items:unknown;
    try{items=JSON.parse(value);}catch{items=null;}
    if(Array.isArray(items)&&items.every(x=>typeof x==='string'))return items.map(x=>x.trim()).filter(Boolean);
    if(catalog.some(t=>normalizeTagLabel(t.label)===normalizeTagLabel(value)))return [value.trim()];
    return value.split(/\s*[,;]\s*|\s+e\s+/i).map(x=>x.trim().replace(/^["“']|["”']$/g,'')).filter(Boolean);
  }
  if(intent.entities.folderName&&!intent.entities.assetName)return null;
  const assets=operations.listAssets().data??[];
  const name=intent.entities.assetName?.trim();
  let names:string[]=[];
  if(name){
    if(assets.some(a=>normalizeTagLabel(a.nome)===normalizeTagLabel(name)))names=[name];
    else {try{const parsed=JSON.parse(name);if(Array.isArray(parsed)&&parsed.every(x=>typeof x==='string'))names=parsed;}catch{}if(!names.length)names=name.split(/\s*[,;]\s*|\s+e\s+/i);}
  }
  const chosen= name?assets.filter(a=>names.some(n=>normalizeTagLabel(a.nome)===normalizeTagLabel(n))):
    /\bselecionad[oa]s?\b/i.test(prompt)?assets.filter(a=>context.selectedAssetIds.includes(a.id)):[];
  if(names.some(n=>!assets.some(a=>normalizeTagLabel(a.nome)===normalizeTagLabel(n))))return {message:`Não encontrei todos os assets informados (${names.join(', ')}). Confira os nomes completos; nenhum plano foi preparado.`};
  if(!chosen.length)return {message:name?`Não encontrei um asset com o nome exato “${name}”. Informe o nome completo ou selecione o recurso no Convés.`:'Qual asset deve receber essa alteração? Informe o nome ou selecione os recursos no Convés.'};
  if(names.some(n=>chosen.filter(a=>normalizeTagLabel(a.nome)===normalizeTagLabel(n)).length>1)){
    const folders=operations.listFolders();
    return {message:`Há ${chosen.length} assets chamados “${name}”: ${chosen.map(a=>`${a.nome} em ${folders.find(f=>f.id===a.folder)?.name??'Convés (Raiz)'}`).join('; ')}. Selecione o registro desejado no Convés e peça a alteração nos selecionados.`};
  }
  if(!intent.entities.tag?.trim())return {message:'Quais etiquetas você deseja adicionar ou remover?'};
  const labels=[...new Map(literals(intent.entities.tag).map(label=>[normalizeTagLabel(label),catalog.find(t=>normalizeTagLabel(t.label)===normalizeTagLabel(label))?.label??label])).values()];
  if(!labels.length||labels.length>100)return {message:'Informe entre 1 e 100 etiquetas.'};
  const remove=intent.proposedTool==='removeTags';
  const relevant=labels.filter(label=>chosen.some(a=>remove?(a.tags??[]).some(t=>normalizeTagLabel(t)===normalizeTagLabel(label)):!(a.tags??[]).some(t=>normalizeTagLabel(t)===normalizeTagLabel(label))));
  if(!relevant.length)return {message:remove?'Esses assets não possuem as etiquetas informadas. Nenhuma alteração necessária.':'Esses assets já possuem as etiquetas informadas. Nenhuma alteração necessária.'};
  return {tool:remove?'removeTags':'assignTags',args:{...(remove?{}:{scope:'asset-tag'}),assetIds:chosen.map(a=>a.id),labels:relevant}};
}
