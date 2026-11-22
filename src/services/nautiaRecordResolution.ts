import type {NautiaIntent} from '../../ai/Nautia_llm/runtime/foundation.ts';
import type {LibraryOperationsService} from './libraryOperationsService.ts';
import {normalizeTagLabel} from './deckFilterService.ts';
import type {ToolName} from './nautiaToolSystem.ts';

/** Name resolution after semantic interpretation. Missing or ambiguous names never authorize writes. */
export function resolveRecordRequest(intent:NautiaIntent,operations:LibraryOperationsService):{tool:ToolName;args:unknown}|{message:string}|null{
 if(intent.requiresClarification||!['organize_assets','trash_records','restore_records','edit_records'].includes(intent.intent))return null;
 const e=intent.entities,deleted=intent.intent==='restore_records';
 const assets=(operations.listAssets(true).data??[]).filter(a=>Boolean(a.deleted)===deleted);
 const folders=operations.listFolders(true).filter(f=>Boolean(f.deleted)===deleted);
 const asset=e.assetName?assets.filter(a=>normalizeTagLabel(a.nome)===normalizeTagLabel(e.assetName!)):[];
 const folderSource=e.sourceFolderName??(!e.assetName?e.folderName:null);
 const folder=folderSource?folders.filter(f=>normalizeTagLabel(f.name)===normalizeTagLabel(folderSource)):[];
 if(!e.assetName&&!folderSource)return null;
 const matches=e.assetName?asset:folder;
 if(matches.length!==1)return {message:matches.length?'Encontrei mais de um registro com esse nome. Informe a pasta ou selecione o recurso desejado; nenhum plano foi preparado.':'Não encontrei esse nome exato entre os registros disponíveis. Confira o nome e se ele está na biblioteca ou na lixeira.'};
 const id=matches[0].id;
 if(intent.intent==='trash_records'||deleted)return {tool:deleted?'restoreRecord':'moveToTrash',args:{refs:[{type:e.assetName?'asset':'folder',id}]}};
 if(intent.intent==='edit_records'){
  if(e.newName)return e.assetName?{tool:'updateAssetRecord',args:{assetId:id,name:e.newName}}:{tool:'renameFolder',args:{folderId:id,name:e.newName}};
  if(e.assetName&&e.newCategory)return {tool:'updateAssetCategory',args:{assetId:id,category:e.newCategory}};
  if(e.assetName&&e.project)return {tool:'updateAssetRecord',args:{assetId:id,project:e.project}};
  return null;
 }
 const destination=e.targetFolderName??(e.assetName?e.folderName:null);
 if(!destination)return null;
 const root=['raiz','conves','biblioteca'].includes(normalizeTagLabel(destination));
 const targets=operations.listFolders().filter(f=>normalizeTagLabel(f.name)===normalizeTagLabel(destination));
 if(!root&&targets.length!==1)return {message:targets.length?'Há várias pastas com o nome de destino informado. Especifique qual deseja.':'Não encontrei a pasta de destino. Nenhuma pasta foi criada e nenhum registro foi movido.'};
 return e.assetName?{tool:'moveAssetRecord',args:{assetIds:[id],targetFolderId:root?null:targets[0].id}}:{tool:'moveFolder',args:{folderId:id,targetFolderId:root?null:targets[0].id}};
}
