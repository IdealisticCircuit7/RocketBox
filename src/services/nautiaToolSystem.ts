import type { LibraryOperationsService, OperationResult, PermissionContext } from './libraryOperationsService.ts';
import type { NautiaActionPlan, PlannedOperationStep } from './nautiaOrchestratorService.ts';
import { analysisContextKey } from './inferenceService.ts';
import { RULESET_VERSION } from './technicalRules.ts';
import { normalizeTagLabel } from './deckFilterService.ts';
import type { UniversalFilterCriteria } from './deckFilterService.ts';

export interface NautiaContext {
  folderId: string | null;
  selectedAssetIds: readonly string[];
  project: string | null;
  filters: Partial<UniversalFilterCriteria>;
  collection?: string;
  folderFilters?: { selectedTagIds: readonly string[]; tagSearchQuery: string; tagMatchMode: 'all' | 'any' };
}
export interface ToolArguments {
  searchAssets: { query?: string; category?:string; format?:string; project?:string; dateFrom?:string;dateTo?:string;scope?:'current'|'library'; labels?:string[] };
  listTrash: Record<string, never>;
  updateAssetRecord: { assetId:string; name?:string; project?:string };
  updateAssetCategory: { assetId:string; category:string };
  renameFolder: { folderId:string; name:string };
  getAssetDetails: { assetId: string };
  listFolders: {query?:string; parentId?:string|null};
  listTags: Record<string, never>;
  getCurrentContext: Record<string, never>;
  getAnalysisResult: { assetId: string };
  analyzeAsset: { assetIds: string[]; targetEngine?: string };
  createFolder: Parameters<LibraryOperationsService['createFolder']>[0];
  assignTags: Parameters<LibraryOperationsService['assignTags']>[0];
  removeTags: { assetIds: string[]; labels: string[] };
  moveAssetRecord: { assetIds: string[]; targetFolderId: string | null };
  moveFolder: { folderId: string; targetFolderId: string | null };
  moveToTrash: { refs: { type: 'asset' | 'folder'; id: string }[] };
  restoreRecord: { refs: { type: 'asset' | 'folder'; id: string }[] };
}
export type ToolName = keyof ToolArguments;
export interface ToolResult { ok: boolean; tool: string; summary: string; data?: unknown; plan?: NautiaActionPlan; error?: string }
export const TOOL_DEFINITIONS = {
  listTrash: { description: 'Consultar registros reais na lixeira, com IDs para restauração.', permission: 'read', parameters: '{}' },
  updateAssetRecord: { description: 'Preparar edição do nome ou projeto de um registro, preservando o arquivo original.', permission: 'mutate', parameters: 'assetId, name?, project?' },
  updateAssetCategory: { description: 'Preparar alteração da categoria de um registro.', permission: 'mutate', parameters: 'assetId, category' },
  renameFolder: { description: 'Preparar renomeação de uma pasta virtual.', permission: 'mutate', parameters: 'folderId, name' },
  searchAssets: { description: 'Pesquisar assets reais por nome, categoria, formato, projeto, etiquetas ou data. Por padrão busca na biblioteca inteira; scope current restringe à pasta e filtros do Convés.', permission: 'read', parameters: 'query?, category?, format?, project?, dateFrom?, dateTo?, scope?, labels?' },
  getAssetDetails: { description: 'Consultar metadados reais de um registro.', permission: 'read', parameters: 'assetId: string' },
  listFolders: { description: 'Localizar pastas virtuais reais por nome parcial, com IDs e hierarquia. Omita query para listar todas.', permission: 'read', parameters: 'query?: string, parentId?: string|null' },
  listTags: { description: 'Listar catálogos independentes de etiquetas.', permission: 'read', parameters: '{}' },
  getCurrentContext: { description: 'Consultar pasta, seleção, projeto e filtros do Convés.', permission: 'read', parameters: '{}' },
  getAnalysisResult: { description: 'Consultar último relatório salvo e sua validade conhecida.', permission: 'read', parameters: 'assetId: string' },
  analyzeAsset: { description: 'Analisar seleção pelo motor determinístico e salvar relatório.', permission: 'analyze', parameters: 'assetIds: string[], targetEngine?: string' },
  createFolder: { description: 'Preparar criação de pasta com etiqueta obrigatória.', permission: 'mutate', parameters: 'name, parent, existingTagId ou newTag' },
  assignTags: { description: 'Preparar associação de etiquetas no catálogo correto.', permission: 'mutate', parameters: 'scope, assetIds/labels ou folderIds/tagIds' },
  removeTags: { description: 'Preparar remoção de etiquetas de assets.', permission: 'mutate', parameters: 'assetIds, labels' },
  moveAssetRecord: { description: 'Preparar movimentação de assets para uma pasta virtual ou raiz (null).', permission: 'mutate', parameters: 'assetIds, targetFolderId' },
  moveFolder: { description: 'Preparar movimentação de uma pasta virtual para outra pasta ou raiz (null).', permission: 'mutate', parameters: 'folderId, targetFolderId' },
  moveToTrash: { description: 'Preparar exclusão lógica de assets ou pastas para a lixeira.', permission: 'mutate', parameters: 'refs: {type,id}[]' },
  restoreRecord: { description: 'Preparar restauração de registros da lixeira.', permission: 'mutate', parameters: 'refs: {type,id}[]' },
} as const;
const FOLDER_ICONS = ['folder','rocket','cube','layers','sparkles','shield','compass','tag','person','environment','image','audio','motion'];

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Parâmetros devem ser um objeto.');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) throw new Error('Texto/ID inválido (limite de 500 caracteres).');
  return value.trim();
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error('Informe entre 1 e 100 itens.');
  return Array.from(new Set(value.map(text)));
}
function keys(p: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(p).some(k => !allowed.includes(k))) throw new Error('Parâmetro não autorizado.');
}
const aliases: Record<string, string> = { organizeRecords: 'moveAssetRecord', removeAssetTags: 'removeTags', restoreFromTrash: 'restoreRecord' };
export function recordRevision(record:unknown):string {
  const r=record as Record<string,unknown>|undefined;
  return JSON.stringify(r?['nome','name','folder','parent','tags','assetTagIds','folderTagIds','projeto','categoria','deleted','updatedAt'].map(k=>r[k]??null):null);
}

/** Runtime validation is used both when preparing and immediately before executing. */
export function validateTool(name: string, raw: unknown, operations: LibraryOperationsService, placeholders: ReadonlySet<string> = new Set()): Record<string, unknown> {
  name = aliases[name] ?? name;
  const p = object(raw);
  const assets = operations.listAssets(true).data ?? [];
  const folders = operations.listFolders(true);
  const tags = operations.listTags().data!;
  const assetIds = (value: unknown) => { const ids = strings(value); if (ids.some(id => !assets.some(a => a.id === id && !a.deleted))) throw new Error('Asset ausente ou na lixeira.'); return ids; };
  const folder = (value: unknown): string | null => { if (value === null) return null; const id = text(value); if (!placeholders.has(id) && !folders.some(f => f.id === id && !f.deleted)) throw new Error('Pasta ausente ou na lixeira.'); return id; };
  switch (name) {
    case 'searchAssets': {
      keys(p,['query','category','format','project','dateFrom','dateTo','scope','labels']);
      const result:Record<string,unknown>={};
      if(p.labels!==undefined)result.labels=strings(p.labels);
      for(const key of ['query','category','format','project','dateFrom','dateTo'])if(p[key]!==undefined)result[key]=text(p[key]);
      for(const key of ['dateFrom','dateTo'])if(result[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(String(result[key])) || Number.isNaN(Date.parse(String(result[key])))))throw new Error('Data inválida; use AAAA-MM-DD.');
      if(p.scope!==undefined){if(!['current','library'].includes(String(p.scope)))throw new Error('Escopo inválido.');result.scope=p.scope;}
      return result;
    }
    case 'getAssetDetails': case 'getAnalysisResult': keys(p, ['assetId']); return { assetId: assetIds([p.assetId])[0] };
    case 'listFolders': keys(p,['query','parentId']); return {...(p.query===undefined?{}:{query:text(p.query)}),...(p.parentId===undefined?{}:{parentId:folder(p.parentId)})};
    case 'listTags': case 'getCurrentContext': case 'listTrash': keys(p, []); return {};
    case 'updateAssetRecord': {
      keys(p,['assetId','name','project']);
      if(p.name===undefined&&p.project===undefined)throw new Error('Informe o novo nome ou projeto.');
      const id=assetIds([p.assetId])[0],current=assets.find(a=>a.id===id)!;
      if(p.name!==undefined&&assets.some(a=>!a.deleted&&a.id!==id&&a.folder===current.folder&&normalizeTagLabel(a.nome)===normalizeTagLabel(text(p.name))))throw new Error('Já existe um registro com este nome nesta pasta.');
      return {assetId:id,...(p.name===undefined?{}:{name:text(p.name)}),...(p.project===undefined?{}:{project:text(p.project)})};
    }
    case 'updateAssetCategory': keys(p,['assetId','category']);return {assetId:assetIds([p.assetId])[0],category:text(p.category)};
    case 'renameFolder': {
      keys(p,['folderId','name']);const id=folder(p.folderId),name=text(p.name).replace(/\s+/g,' ');
      if(!id)throw new Error('Informe a pasta de origem.');
      const source=folders.find(f=>f.id===id)!;
      if(folders.some(f=>!f.deleted&&f.id!==id&&f.parent===source.parent&&normalizeTagLabel(f.name)===normalizeTagLabel(name)))throw new Error('Já existe uma pasta com este nome neste nível.');
      return {folderId:id,name};
    }
    case 'analyzeAsset': keys(p, ['assetIds', 'targetEngine']); return { assetIds: assetIds(p.assetIds), ...(p.targetEngine === undefined ? {} : { targetEngine: text(p.targetEngine) }) };
    case 'createFolder': {
      keys(p, ['name', 'parent', 'existingTagId', 'newTag']);
      const result = { name: text(p.name), parent: folder(p.parent ?? null), existingTagId: p.existingTagId == null ? null : text(p.existingTagId), newTag: p.newTag == null ? null : object(p.newTag) };
      if (result.existingTagId && !tags.folderTags.some(t => t.id === result.existingTagId)) throw new Error('Etiqueta de pasta ausente.');
      if (result.newTag) { keys(result.newTag, ['label', 'icon', 'accent']); text(result.newTag.label); if (result.newTag.icon && !FOLDER_ICONS.includes(String(result.newTag.icon))) throw new Error('Ícone inválido.'); if (result.newTag.accent && !['cyan', 'purple'].includes(String(result.newTag.accent))) throw new Error('Cor de etiqueta inválida.'); }
      if (!result.existingTagId && !result.newTag) throw new Error('Pasta exige etiqueta.');
      if (folders.some(f => !f.deleted && f.parent === result.parent && f.name.toLocaleLowerCase() === result.name.toLocaleLowerCase())) throw new Error('Já existe pasta com este nome no destino.');
      return result;
    }
    case 'assignTags': {
      if (p.scope === 'asset-tag') { keys(p, ['scope', 'assetIds', 'labels']); return { scope: p.scope, assetIds: assetIds(p.assetIds), labels: strings(p.labels) }; }
      if (p.scope !== 'folder-tag') throw new Error('Escopo de etiqueta inválido.');
      keys(p, ['scope', 'folderIds', 'tagIds', 'mode']);
      const folderIds = strings(p.folderIds); folderIds.forEach(folder);
      const tagIds = strings(p.tagIds); if (tagIds.some(id => !tags.folderTags.some(t => t.id === id))) throw new Error('Etiqueta de pasta ausente.');
      if (p.mode !== undefined && !['add', 'toggle'].includes(String(p.mode))) throw new Error('Modo inválido.');
      return { scope: p.scope, folderIds, tagIds, mode: p.mode ?? 'add' };
    }
    case 'removeTags': keys(p, ['assetIds', 'labels']); return { assetIds: assetIds(p.assetIds), labels: strings(p.labels) };
    case 'moveAssetRecord': {
      keys(p, ['assetIds', 'targetFolderId']);const ids=assetIds(p.assetIds),destination=folder(p.targetFolderId);
      const names=new Set<string>();
      for(const id of ids){const source=assets.find(a=>a.id===id)!;const name=normalizeTagLabel(source.nome);
        if(names.has(name)||assets.some(a=>!a.deleted&&!ids.includes(a.id)&&a.folder===destination&&normalizeTagLabel(a.nome)===name))throw new Error(`Conflito: já existe um registro chamado “${source.nome}” no destino.`);
        names.add(name);
      }
      return {assetIds:ids,targetFolderId:destination};
    }
    case 'moveFolder': {
      keys(p, ['folderId', 'targetFolderId']);
      const folderId = folder(p.folderId);
      if (!folderId) throw new Error('Informe o ID da pasta de origem.');
      const targetFolderId = folder(p.targetFolderId);
      if (folderId === targetFolderId) throw new Error('A pasta já está neste destino ou não pode ser movida para si mesma.');
      const source=folders.find(f=>f.id===folderId)!;
      if(folders.some(f=>!f.deleted&&f.id!==folderId&&(f.parent??null)===targetFolderId&&normalizeTagLabel(f.name)===normalizeTagLabel(source.name)))throw new Error('Já existe uma pasta com este nome no destino.');
      if (targetFolderId) {
        const byId = new Map(folders.filter(f => !f.deleted).map(f => [f.id, f]));
        let cursor: string | null = targetFolderId;
        const visited = new Set<string>();
        while (cursor && !visited.has(cursor)) {
          if (cursor === folderId) throw new Error('Não é possível mover uma pasta para dentro de sua própria subpasta.');
          visited.add(cursor);
          cursor = byId.get(cursor)?.parent ?? null;
        }
      }
      return { folderId, targetFolderId };
    }
    case 'moveToTrash': case 'restoreRecord': {
      keys(p, ['refs']);
      if (!Array.isArray(p.refs) || !p.refs.length || p.refs.length > 100) throw new Error('Referências inválidas.');
      const refs = p.refs.map(rawRef => { const ref = object(rawRef); keys(ref, ['type', 'id']); const id = text(ref.id); if (ref.type !== 'asset' && ref.type !== 'folder') throw new Error('Tipo inválido.'); const record = ref.type === 'asset' ? assets.find(a => a.id === id) : folders.find(f => f.id === id); if (!record || Boolean(record.deleted) !== (name === 'restoreRecord')) throw new Error('Registro ausente ou estado da lixeira mudou.'); return { id, type: ref.type }; });
      return { refs };
    }
    case 'createTag': keys(p, ['scope', 'input', 'label']); if (p.scope === 'asset-tag') text(p.label); else if (p.scope === 'folder-tag') { const input = object(p.input); keys(input, ['label','icon','accent']); text(input.label); } else throw new Error('Escopo inválido.'); return p;
    default: throw new Error(`Ferramenta não autorizada: ${name}`);
  }
}

export function executeToolMutation(step: PlannedOperationStep, operations: LibraryOperationsService, permissions: PermissionContext): OperationResult<any> {
  const p = validateTool(step.tool, step.params, operations);
  switch (aliases[step.tool] ?? step.tool) {
    case 'updateAssetRecord': return operations.updateAssetRecord(String(p.assetId), { ...(p.name===undefined?{}:{nome:String(p.name)}), ...(p.project===undefined?{}:{projeto:String(p.project)}) }, permissions);
    case 'updateAssetCategory': return operations.updateAssetCategory(String(p.assetId),String(p.category),permissions);
    case 'renameFolder': return operations.renameFolder(String(p.folderId),String(p.name),permissions);
    case 'createFolder': return operations.createFolder(p as unknown as ToolArguments['createFolder'], permissions);
    case 'createTag': return operations.createTag(p as Parameters<LibraryOperationsService['createTag']>[0], permissions);
    case 'assignTags': return operations.assignTags(p as ToolArguments['assignTags'], permissions);
    case 'removeTags': return operations.removeAssetTags(p as ToolArguments['removeTags'], permissions);
    case 'moveAssetRecord': return operations.organizeRecords(p as ToolArguments['moveAssetRecord'], permissions);
    case 'moveFolder': return operations.moveFolder(String(p.folderId), (p.targetFolderId as string | null) ?? null, permissions);
    case 'moveToTrash': return operations.moveToTrash((p as ToolArguments['moveToTrash']).refs, permissions);
    case 'restoreRecord': return operations.restoreFromTrash((p as ToolArguments['restoreRecord']).refs, permissions);
    default: throw new Error('Ferramenta de alteração não autorizada.');
  }
}

export function createNautiaToolSystem(operations: LibraryOperationsService, getContext: () => NautiaContext, permissions = { read: true, analyze: true, mutate: true }) {
  return {
    definitions: TOOL_DEFINITIONS,
    async call<K extends ToolName>(name: K, raw: ToolArguments[K]): Promise<ToolResult> {
      try {
        const definition = TOOL_DEFINITIONS[name];
        if (!definition || !permissions[definition.permission]) throw new Error('Permissão insuficiente.');
        const p = validateTool(name, raw, operations);
        const context = getContext();
        if (definition.permission === 'mutate') {
          const ids = (p.assetIds ?? (p.assetId ? [p.assetId] : [])) as string[];
          const refs = (p.refs ?? []) as ToolArguments['moveToTrash']['refs'];
          const affected = [...ids, ...refs.filter(r => r.type === 'asset').map(r => r.id)];
          const folderRefs = [...refs.filter(r => r.type === 'folder').map(r => r.id), ...((p.folderIds as string[]|undefined)??[]), ...(typeof p.folderId === 'string' ? [p.folderId] : [])];
          const assets=operations.listAssets(true).data??[],folders=operations.listFolders(true);
          const folderName=(id:unknown)=>folders.find(f=>f.id===id)?.name??'Convés (Raiz)';
          const names=[...ids,...refs.filter(r=>r.type==='asset').map(r=>r.id)].map(id=>assets.find(a=>a.id===id)?.nome??id);
          const folderNames=folderRefs.map(folderName);
          const source=[...ids.map(id=>folderName(assets.find(a=>a.id===id)?.folder)),...folderRefs.map(id=>folderName(folders.find(f=>f.id===id)?.parent))];
          const description = `${definition.description} Recursos: ${[...names,...folderNames].join(', ')||String(p.name??'nova pasta')}. Origem: ${[...new Set(source)].join(', ')||'não se aplica'}.${'targetFolderId' in p?` Destino: ${folderName(p.targetFolderId)}.`:''}${p.labels?` Etiquetas: ${(p.labels as string[]).join(', ')}.`:''}${p.name?` Novo nome: ${p.name}.`:''}${p.category?` Categoria: ${p.category}.`:''}${p.project?` Projeto: ${p.project}.`:''}`;
          const plan: NautiaActionPlan = { id: crypto.randomUUID(), source: 'nautia-chat', objective: definition.description, steps: [{ stepId: 'tool-step', tool: name as PlannedOperationStep['tool'], description, params: p }], affectedAssetsCount: affected.length, affectedAssetIds: affected, affectedFolders: folderRefs, tagsAdded: name === 'assignTags' ? (p.labels as string[] ?? []) : [], tagsRemoved: name === 'removeTags' ? p.labels as string[] : [], conflicts: [], warnings: ['O plano será validado novamente antes de gravar.'], requiresDestructiveConfirmation: name === 'moveToTrash' };
          const destinations = typeof p.targetFolderId === 'string' ? [operations.listFolders().find(f => f.id === p.targetFolderId)?.name ?? p.targetFolderId] : p.targetFolderId === null ? ['Convés (Raiz)'] : [];
          const missing=name==='assignTags'&&p.scope==='asset-tag'?(p.labels as string[]).filter(label=>!operations.listTags().data?.assetTags.some(t=>normalizeTagLabel(t.label)===normalizeTagLabel(label))):[];
          const expectedRecords=[...new Set(affected)].map(id=>({type:'asset' as const,id,revision:recordRevision(assets.find(a=>a.id===id))}));
          const expectedFolders=[...new Set([...folderRefs,...(typeof p.targetFolderId==='string'?[p.targetFolderId]:[])])].map(id=>({type:'folder' as const,id,revision:recordRevision(folders.find(f=>f.id===id))}));
          return { ok: true, tool: name, summary: description, plan: { ...plan, expectedRecords:[...expectedRecords,...expectedFolders], affectedFolders: [...folderNames, ...destinations], warnings:[...plan.warnings,...(missing.length?[`Ao confirmar, criar também as etiquetas inexistentes: ${missing.join(', ')}. As etiquetas atuais serão preservadas.`]:[])] } };
        }
        let data: unknown;
        switch (name) {
          case 'getCurrentContext': data = context; break;
          case 'listFolders': {
            const folders=operations.listFolders();const byId=new Map(folders.map(f=>[f.id,f]));
            data=folders.filter(f=>(p.parentId===undefined||f.parent===p.parentId)&&(!p.query||f.name.toLocaleLowerCase().includes(String(p.query).toLocaleLowerCase()))).map(f=>{
              const names=[f.name],visited=new Set([f.id]);let parent=f.parent;
              while(parent && !visited.has(parent)){visited.add(parent);const ancestor=byId.get(parent);if(!ancestor)break;names.unshift(ancestor.name);parent=ancestor.parent;}
              return {...f,virtualPath:['Convés',...names].join(' / ')};
            });break;
          }
          case 'listTags': data = operations.listTags().data; break;
          case 'listTrash': data = { assets:operations.listAssets(true).data?.filter(a=>a.deleted)??[],folders:operations.listFolders(true).filter(f=>f.deleted) };break;
          case 'getAssetDetails': data = operations.getAssetMetadata(String(p.assetId)).data; break;
          case 'getAnalysisResult': { const asset = operations.getAssetMetadata(String(p.assetId)).data!; const report = asset.analysisReport; data = { report: report ?? null, stale: !report || report.rulesetVersion !== RULESET_VERSION || report.contextKey !== analysisContextKey(asset), physicalFreshness: 'Requer reanálise sob demanda' }; break; }
          case 'searchAssets': {
            const library=p.scope!=='current';
            const result=operations.searchAssets({currentParentId:context.folderId,allFolders:library||context.collection!=='Biblioteca',...(library?{}:context.folderFilters),universalFilters:{...(library?{}:context.filters),matchMode:'all',...(p.query?{nameQuery:String(p.query)}:{}),...(p.category?{fileType:String(p.category)}:{}),...(p.format?{format:String(p.format).startsWith('.')?String(p.format):`.${p.format}`} : {}),...(p.project?{project:String(p.project)}:{}),...(p.dateFrom?{dateFrom:String(p.dateFrom)}:{}),...(p.dateTo?{dateTo:String(p.dateTo)}:{}),...(p.labels?{selectedAssetTags:p.labels as string[],assetTagMatchMode:'all' as const,tagScope:'asset' as const}:{})}});
            if(!result.ok)throw new Error(result.summary);data=result.data;
            break;
          }
          case 'analyzeAsset': { const result = await operations.queryDiagnostics(p.assetIds as string[], { targetEngine: p.targetEngine as string | undefined }); if (!result.ok) throw new Error(result.summary); if (result.data?.some(r => r.errors?.length)) return { ok: false, tool: name, summary: 'Análise retornou erros; consulte os relatórios.', data: result.data, error: 'analysis-errors' }; data = result.data; break; }
          default: throw new Error('Ferramenta não implementada.');
        }
        return { ok: true, tool: name, summary: `${name}: consulta concluída.`, data };
      } catch (error) { const message = error instanceof Error ? error.message : String(error); return { ok: false, tool: name, summary: message, error: message }; }
    },
  };
}
