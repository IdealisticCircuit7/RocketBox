import { vaultApi, validateRelink, type ResourceInspection } from './assetVaultService.ts';

import {

  type AssetClassificationProfile,

  buildAssetClassificationProfile,

} from './assetClassificationService.ts';

import {

  createCleanAssetRecord,

  createFolderTag,

  type CreateFolderTagInput,

  createFolderWithRequiredTag,

  type CreateFolderWithTagInput,

  type DeckAsset,

  type DeckFolder,

  deduplicateAssets,

  DEFAULT_UNIVERSAL_FILTERS,

  deleteAssetTagFromCatalog,

  deleteGlobalTagFromWorkspace,

  type DiscoveredFolderTagsResult,

  ensureAssetTagsCatalog,

  type EtiquetaDeAsset,

  type EtiquetaDePasta,

  type FilterMatchMode,

  getDiscoveredFolderTags,

  isSystemReservedTag,

  migrateLegacyAssetRecord,

  normalizeTagLabel,

  type RegisterAssetInput,

  removeAssetTagsFromAssets,

  renameAssetTagInCatalog,

  renameGlobalTagInWorkspace,

  runDeckFilters,

  toggleFolderTagOnFolder,

  type UniversalFilterCriteria,

  updateAssetCategoryRecord,

} from './deckFilterService.ts';

import {

  analysisContextKey,

  type InferenceServiceOptions,

  runStructuredInference,

  type StructuredInferenceReport,

} from './inferenceService.ts';



/**

 * Serviço Centralizado de Operações da Biblioteca (Etapa 02 - Seção 5 e Smart Tags 3.0).

 * Única camada autorizada para leitura e mutação controlada de registros,

 * compartilhada pelos cards do Convés (Nautia Quick Actions) e pelo módulo da Nautia.

 */



export type LibraryActor = 'user-ui' | 'nautia-assistant';



export interface PermissionContext {

  readonly actor: LibraryActor;

  readonly allowMutations: boolean;

}



export type LibraryOperationType =

  | 'relinkAsset'

  | 'updateAssetRecord'

  | 'moveFolder'

  | 'listAssets'

  | 'getAssetMetadata'

  | 'searchAssets'

  | 'createFolder'

  | 'renameFolder'

  | 'listTags'

  | 'createTag'

  | 'assignTags'

  | 'removeAssetTags'

  | 'renameAssetTag'

  | 'deleteAssetTag'

  | 'updateAssetCategory'

  | 'inspectFolderTags'

  | 'getAssetClassification'

  | 'organizeRecords'

  | 'queryDiagnostics'

  | 'moveToTrash'

  | 'restoreFromTrash'

  | 'registerAsset';

// Explorer metadata edits use the same transaction boundary as Nautia operations.



export interface WorkspaceSnapshotLike {

  folders: DeckFolder[];

  assets: DeckAsset[];

  folderTags?: EtiquetaDePasta[];

  assetTags?: EtiquetaDeAsset[];

  [key: string]: unknown;

}



export interface WorkspaceStoreAdapter {

  snapshot(): WorkspaceSnapshotLike;

  transact<T>(mutator: (draft: WorkspaceSnapshotLike) => T): T;

  moveToTrash(refs: Array<{ type: 'folder' | 'asset'; id: string }>): unknown[];

  restore(refs: Array<{ type: 'folder' | 'asset'; id: string }>): {

    relocated: string[];

    renamed: string[];

  };

}



export type UndoDescriptor =

  | { readonly kind: 'trash-created-folder'; readonly folderId: string }

  | {

      readonly kind: 'restore-folder-name';

      readonly folderId: string;

      readonly previousName: string;

    }

  | {

      readonly kind: 'restore-folder-parent';

      readonly folderId: string;

      readonly previousParent: string | null;

    }

  | {

      readonly kind: 'restore-asset-folders';

      readonly previousLocations: ReadonlyArray<{

        readonly assetId: string;

        readonly folder: string | null;

      }>;

    }

  | {

      readonly kind: 'restore-asset-tags';

      readonly previousTags: ReadonlyArray<{

        readonly assetId: string;

        readonly tags: readonly string[];

        readonly assetTagIds: readonly string[];

      }>;

    }

  | {

      readonly kind: 'restore-folder-tags';

      readonly previousTags: ReadonlyArray<{

        readonly folderId: string;

        readonly folderTagIds: readonly string[];

      }>;

    }

  | {

      readonly kind: 'restore-from-trash';

      readonly refs: ReadonlyArray<{ readonly type: 'folder' | 'asset'; readonly id: string }>;

    }

  | { readonly kind: 'delete-created-folder-tag'; readonly tagId: string };



export interface OperationResult<T = unknown> {

  readonly ok: boolean;

  readonly operation: LibraryOperationType;

  readonly data?: T;

  readonly summary: string;

  readonly affectedResources: readonly string[];

  readonly reversible: boolean;

  readonly undo?: UndoDescriptor;

  readonly error?: string;

}



const DEFAULT_USER_PERMISSIONS: PermissionContext = {

  actor: 'user-ui',

  allowMutations: true,

};



function generateTagId(prefix: string): string {

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {

    return `${prefix}-${crypto.randomUUID()}`;

  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

}



export function createLibraryOperationsService(store: WorkspaceStoreAdapter) {

  async function relinkAsset(assetId: string, path: string, inspect: (path: string) => Promise<ResourceInspection> = vaultApi.inspect, permissions: PermissionContext = DEFAULT_USER_PERMISSIONS): Promise<OperationResult<DeckAsset>> {

    try {

      assertMutationAllowed('relinkAsset', permissions);

      const before = store.snapshot().assets.find(a => a.id === assetId && !a.deleted);

      if (!before) throw new Error('Registro não encontrado ou na lixeira.');

      const inspected = await inspect(path);

      validateRelink(before, inspected);

      let updated!: DeckAsset;

      store.transact(draft => {

        const current = draft.assets.find(a => a.id === assetId && !a.deleted);

        if (!current || current.caminho !== before.caminho || current.updatedAt !== before.updatedAt) throw new Error('Registro mudou durante a validação. Tente novamente.');

        const normalize = (p: string) => p.replace(/\\/g, '/').toLowerCase();

        if (draft.assets.some(a => a.id !== assetId && !a.deleted && normalize(a.caminho) === normalize(inspected.path))) throw new Error('Caminho já vinculado a outro registro.');

        updated = { ...current, caminho: inspected.path, sourcePath: inspected.path, projectDirectory: inspected.isDirectory ? inspected.path : inspected.path.replace(/[\\/][^\\/]+$/, ''), structureMarkers: inspected.structureMarkers, verificationStatus: 'verified', identificationWarnings: inspected.warnings, fileSize: inspected.size, analysisReport: undefined, lastAnalyzedAt: undefined, updatedAt: new Date().toISOString() };

        draft.assets = draft.assets.map(a => a.id === assetId ? updated : a);

      });

      return { ok: true, operation: 'relinkAsset', data: updated, summary: 'Referência validada e atualizada. Originais preservados.', affectedResources: [assetId], reversible: false };

    } catch (error) {

      return { ok: false, operation: 'relinkAsset', summary: error instanceof Error ? error.message : String(error), affectedResources: [], reversible: false };

    }

  }



  function updateAssetRecord(assetId: string, patch: { nome?: string; projeto?: string }, permissions: PermissionContext = DEFAULT_USER_PERMISSIONS): OperationResult<DeckAsset> {

    try {

      assertMutationAllowed('updateAssetRecord', permissions);

      let updated!: DeckAsset;

      store.transact(draft => {

        const asset = draft.assets.find(a => a.id === assetId && !a.deleted);

        if (!asset) throw new Error('Registro não encontrado ou na lixeira.');

        const nome = patch.nome === undefined ? asset.nome : patch.nome.trim();

        if (!nome) throw new Error('Informe um nome para o registro.');

        if (draft.assets.some(a => !a.deleted && a.id !== assetId && a.folder === asset.folder && normalizeTagLabel(a.nome) === normalizeTagLabel(nome))) throw new Error('Já existe um registro com este nome nesta pasta.');

        updated = { ...asset, nome, projeto: patch.projeto === undefined ? asset.projeto : patch.projeto.trim() || undefined, updatedAt: new Date().toISOString() };

        draft.assets = draft.assets.map(a => a.id === assetId ? updated : a);

      });

      return { ok: true, operation: 'updateAssetRecord', data: updated, summary: 'Registro atualizado.', affectedResources: [assetId], reversible: false };

    } catch (error) {

      return { ok: false, operation: 'updateAssetRecord', summary: String(error instanceof Error ? error.message : error), affectedResources: [], reversible: false };

    }

  }



  function moveFolder(folderId: string, parentId: string | null, permissions: PermissionContext = DEFAULT_USER_PERMISSIONS): OperationResult<DeckFolder> {

    try {

      assertMutationAllowed('moveFolder', permissions);

      let updated!: DeckFolder;

      let previousParent: string | null = null;

      store.transact(draft => {

        const byId = new Map(draft.folders.filter(f => !f.deleted).map(f => [f.id, f]));

        const folder = byId.get(folderId);

        if (!folder) throw new Error('Pasta não encontrada ou na lixeira.');

        previousParent = folder.parent ?? null;

        if (previousParent === parentId) throw new Error('A pasta já está localizada neste destino.');

        if (parentId !== null && !byId.has(parentId)) throw new Error('Destino inexistente ou na lixeira.');

        const visited = new Set<string>([folderId]);

        let cursor = parentId;

        while (cursor !== null) {

          if (visited.has(cursor)) throw new Error('A movimentação criaria um ciclo de pastas.');

          visited.add(cursor);

          cursor = byId.get(cursor)?.parent ?? null;

        }

        if (draft.folders.some(f => !f.deleted && f.id !== folderId && (f.parent ?? null) === parentId && normalizeTagLabel(f.name) === normalizeTagLabel(folder.name))) throw new Error('Já existe uma pasta com este nome no destino.');

        updated = { ...folder, parent: parentId };

        draft.folders = draft.folders.map(f => f.id === folderId ? updated : f);

      });

      return {

        ok: true,

        operation: 'moveFolder',

        data: updated,

        summary: `Pasta "${updated.name}" movida na biblioteca virtual.`,

        affectedResources: [folderId],

        reversible: true,

        undo: { kind: 'restore-folder-parent', folderId, previousParent },

      };

    } catch (error) {

      return { ok: false, operation: 'moveFolder', summary: String(error instanceof Error ? error.message : error), affectedResources: [], reversible: false };

    }

  }

  function assertMutationAllowed(

    operation: LibraryOperationType,

    permissions: PermissionContext,

  ): void {

    if (!permissions.allowMutations) {

      throw new Error(

        `Permissão insuficiente para executar "${operation}" sem autorização explícita.`,

      );

    }

  }



  function listAssets(includeDeleted = false): OperationResult<DeckAsset[]> {

    const snap = store.snapshot();

    const assets = deduplicateAssets(snap.assets ?? [])

      .filter((asset) => includeDeleted || !asset.deleted)

      .map(migrateLegacyAssetRecord);

    return {

      ok: true,

      operation: 'listAssets',

      data: assets,

      summary: `${assets.length} asset(s) listado(s).`,

      affectedResources: assets.map((a) => a.id),

      reversible: false,

    };

  }



  function getAssetMetadata(assetId: string): OperationResult<DeckAsset> {

    const snap = store.snapshot();

    const found = (snap.assets ?? []).find((asset) => asset.id === assetId);

    if (!found) {

      return {

        ok: false,

        operation: 'getAssetMetadata',

        summary: 'Asset não encontrado.',

        affectedResources: [],

        reversible: false,

        error: `Asset "${assetId}" não existe na biblioteca.`,

      };

    }

    const migrated = migrateLegacyAssetRecord(found);

    return {

      ok: true,

      operation: 'getAssetMetadata',

      data: migrated,

      summary: `Metadados consultados para "${migrated.nome}".`,

      affectedResources: [migrated.id],

      reversible: false,

    };

  }



  function searchAssets(params: {

    readonly allFolders?: boolean;

    readonly selectedTagIds?: readonly string[];

    readonly tagSearchQuery?: string;

    readonly tagMatchMode?: FilterMatchMode;

    readonly currentParentId?: string | null;

    readonly universalFilters?: Partial<UniversalFilterCriteria>;

  }): OperationResult<{

    readonly folders: readonly DeckFolder[];

    readonly assets: readonly DeckAsset[];

  }> {

    const snap = store.snapshot();

    const result = runDeckFilters({

      allFolders: params.allFolders,

      folders: snap.folders ?? [],

      assets: (snap.assets ?? []).map(migrateLegacyAssetRecord),

      folderTags: snap.folderTags ?? [],

      selectedTagIds: params.selectedTagIds ?? [],

      tagSearchQuery: params.tagSearchQuery ?? '',

      tagMatchMode: params.tagMatchMode ?? 'any',

      currentParentId: params.currentParentId ?? null,

      universalFilters: {

        ...DEFAULT_UNIVERSAL_FILTERS,

        ...(params.universalFilters ?? {}),

      },

    });

    return {

      ok: true,

      operation: 'searchAssets',

      data: {

        folders: result.visibleFolders,

        assets: result.visibleAssets,

      },

      summary: `${result.visibleFolders.length} pasta(s) e ${result.visibleAssets.length} asset(s) encontrados.`,

      affectedResources: result.visibleAssets.map((a) => a.id),

      reversible: false,

    };

  }



  function listTags(): OperationResult<{

    readonly folderTags: readonly EtiquetaDePasta[];

    readonly assetTags: readonly EtiquetaDeAsset[];

  }> {

    const snap = store.snapshot();

    return {

      ok: true,

      operation: 'listTags',

      data: {

        folderTags: snap.folderTags ?? [],

        assetTags: snap.assetTags ?? [],

      },

      summary: `${(snap.folderTags ?? []).length} etiqueta(s) de pasta e ${(snap.assetTags ?? []).length} etiqueta(s) de asset.`,

      affectedResources: [],

      reversible: false,

    };

  }



  function createFolder(

    input: CreateFolderWithTagInput,

    permissions: PermissionContext = DEFAULT_USER_PERMISSIONS,

  ): OperationResult<{ folder: DeckFolder; createdTag: EtiquetaDePasta | null }> {

    try {

      assertMutationAllowed('createFolder', permissions);

      let createdFolder!: DeckFolder;

      let createdTag: EtiquetaDePasta | null = null;



      store.transact((draft) => {

        const result = createFolderWithRequiredTag(

          draft.folders ?? [],

          draft.folderTags ?? [],

          input,

        );

        draft.folders = result.nextFolders;

        draft.folderTags = result.nextFolderTags;

        createdFolder = result.folder;

        createdTag = result.createdTag;

      });



      return {

        ok: true,

        operation: 'createFolder',

        data: { folder: createdFolder, createdTag },

        summary: `Pasta "${createdFolder.name}" criada com etiqueta obrigatória.`,

        affectedResources: [createdFolder.id],

        reversible: true,

        undo: { kind: 'trash-created-folder', folderId: createdFolder.id },

      };

    } catch (error) {

      const msg = error instanceof Error ? error.message : 'Erro ao criar pasta.';

      return {

        ok: false,

        operation: 'createFolder',

        summary: msg,

        affectedResources: [],

        reversible: false,

        error: msg,

      };

    }

  }



  function renameFolder(

    folderId: string,

    newName: string,

    permissions: PermissionContext = DEFAULT_USER_PERMISSIONS,

  ): OperationResult<DeckFolder> {

    try {

      assertMutationAllowed('renameFolder', permissions);

      const cleanName = newName.trim().replace(/\s+/g, ' ');

      if (!cleanName) throw new Error('Informe o novo nome da pasta.');



      let previousName = '';

      let updated!: DeckFolder;



      store.transact((draft) => {

        const target = (draft.folders ?? []).find(

          (folder) => folder.id === folderId && !folder.deleted,

        );

        if (!target) throw new Error('Pasta não encontrada ou está na lixeira.');



        const conflict = (draft.folders ?? []).some(

          (other) =>

            !other.deleted &&

            other.id !== folderId &&

            other.parent === target.parent &&

            normalizeTagLabel(other.name) === normalizeTagLabel(cleanName),

        );

        if (conflict) throw new Error('Já existe uma pasta com este nome neste nível.');



        previousName = target.name;

        const nextFolder: DeckFolder = { ...target, name: cleanName };

        draft.folders = draft.folders.map((f) => (f.id === folderId ? nextFolder : f));

        updated = nextFolder;

      });



      return {

        ok: true,

        operation: 'renameFolder',

        data: updated,

        summary: `Pasta "${previousName}" renomeada para "${cleanName}".`,

        affectedResources: [folderId],

        reversible: true,

        undo: { kind: 'restore-folder-name', folderId, previousName },

      };

    } catch (error) {

      const msg = error instanceof Error ? error.message : 'Erro ao renomear pasta.';

      return {

        ok: false,

        operation: 'renameFolder',

        summary: msg,

        affectedResources: [],

        reversible: false,

        error: msg,

      };

    }

  }



  function createTag(

    params:

      | { readonly scope: 'folder-tag'; readonly input: CreateFolderTagInput }

      | {

          readonly scope: 'asset-tag';

          readonly label: string;

          readonly color?: string;

          readonly rejectDuplicates?: boolean;

        },

    permissions: PermissionContext = DEFAULT_USER_PERMISSIONS,

  ): OperationResult<EtiquetaDePasta | EtiquetaDeAsset> {

    try {

      assertMutationAllowed('createTag', permissions);



      if (params.scope === 'folder-tag') {

        let created!: EtiquetaDePasta;

        store.transact((draft) => {

          created = createFolderTag(draft.folderTags ?? [], params.input);

          draft.folderTags = [...(draft.folderTags ?? []), created];

        });

        return {

          ok: true,

          operation: 'createTag',

          data: created,

          summary: `Etiqueta de pasta "${created.label}" criada.`,

          affectedResources: [created.id],

          reversible: true,

          undo: { kind: 'delete-created-folder-tag', tagId: created.id },

        };

      }



      const cleanLabel = params.label.trim().replace(/\s+/g, ' ');

      if (!cleanLabel) throw new Error('Informe um nome para a etiqueta de asset.');

      const normalized = normalizeTagLabel(cleanLabel);

      if (isSystemReservedTag(normalized)) {

        throw new Error(`"${cleanLabel}" é um identificador reservado do sistema.`);

      }



      let created!: EtiquetaDeAsset;

      store.transact((draft) => {

        const existing = draft.assetTags ?? [];

        const match = existing.find((tag) => tag.normalizedLabel === normalized);

        if (match) {

          if (params.rejectDuplicates) {

            throw new Error(`Já existe uma etiqueta chamada "${match.label}".`);

          }

          created = match;

          return;

        }

        created = {

          id: generateTagId('atag'),

          kind: 'asset-tag',

          label: cleanLabel,

          normalizedLabel: normalized,

          color: params.color ?? 'cyan',

          createdAt: new Date().toISOString(),

        };

        draft.assetTags = [...existing, created];

      });



      return {

        ok: true,

        operation: 'createTag',

        data: created,

        summary: `Etiqueta de asset "${created.label}" pronta para associação.`,

        affectedResources: [created.id],

        reversible: false,

      };

    } catch (error) {

      const msg = error instanceof Error ? error.message : 'Erro ao criar etiqueta.';

      return {

        ok: false,

        operation: 'createTag',

        summary: msg,

        affectedResources: [],

        reversible: false,

        error: msg,

      };

    }

  }



  function assignTags(

    params:

      | {

          readonly scope: 'folder-tag';

          readonly folderIds: readonly string[];

          readonly tagIds: readonly string[];

          readonly mode?: 'add' | 'toggle';

        }

      | {

          readonly scope: 'asset-tag';

          readonly assetIds: readonly string[];

          readonly labels: readonly string[];

        },

    permissions: PermissionContext = DEFAULT_USER_PERMISSIONS,

  ): OperationResult<{ updatedCount: number }> {

    try {

      assertMutationAllowed('assignTags', permissions);



      if (params.scope === 'folder-tag') {

        const previousTags: Array<{ folderId: string; folderTagIds: readonly string[] }> = [];

        let updatedCount = 0;



        store.transact((draft) => {

          const folderTags = draft.folderTags ?? [];

          let nextFolders = [...(draft.folders ?? [])];



          for (const folderId of params.folderIds) {

            const folder = nextFolders.find((f) => f.id === folderId && !f.deleted);

            if (!folder) continue;

            previousTags.push({

              folderId,

              folderTagIds: [...(folder.folderTagIds ?? [])],

            });

            for (const tagId of params.tagIds) {

              const alreadyAssigned = (folder.folderTagIds ?? []).includes(tagId);

              if (params.mode === 'add' && alreadyAssigned) continue;

              nextFolders = toggleFolderTagOnFolder(

                nextFolders,

                folderTags,

                folderId,

                tagId,

              );

            }

            updatedCount++;

          }

          draft.folders = nextFolders;

        });



        return {

          ok: true,

          operation: 'assignTags',

          data: { updatedCount },

          summary: `Etiquetas de pasta atualizadas em ${updatedCount} pasta(s).`,

          affectedResources: previousTags.map((item) => item.folderId),

          reversible: previousTags.length > 0,

          undo: { kind: 'restore-folder-tags', previousTags },

        };

      }



      const cleanLabels = Array.from(

        new Set(params.labels.map((l) => l.trim()).filter(Boolean)),

      );

      if (cleanLabels.length === 0) {

        throw new Error('Informe ao menos uma etiqueta de asset para associar.');

      }



      const previousTags: Array<{

        assetId: string;

        tags: readonly string[];

        assetTagIds: readonly string[];

      }> = [];

      let updatedCount = 0;



      store.transact((draft) => {

        const catalog = [...(draft.assetTags ?? [])];

        const ensuredTagIds: string[] = [];



        for (const label of cleanLabels) {

          const normalized = normalizeTagLabel(label);

          let found = catalog.find((item) => item.normalizedLabel === normalized);

          if (!found) {

            found = {

              id: generateTagId('atag'),

              kind: 'asset-tag',

              label,

              normalizedLabel: normalized,

            };

            catalog.push(found);

          }

          ensuredTagIds.push(found.id);

        }

        draft.assetTags = catalog;



        const targetIds = new Set(params.assetIds);

        draft.assets = (draft.assets ?? []).map((asset) => {

          if (!targetIds.has(asset.id) || asset.deleted) return asset;

          previousTags.push({

            assetId: asset.id,

            tags: [...(asset.tags ?? [])],

            assetTagIds: [...(asset.assetTagIds ?? [])],

          });

          const mergedLabels = [...(asset.tags ?? [])];

          for (const label of cleanLabels) {

            if (

              !mergedLabels.some(

                (existing) => normalizeTagLabel(existing) === normalizeTagLabel(label),

              )

            ) {

              mergedLabels.push(label);

            }

          }

          const mergedIds = Array.from(

            new Set([...(asset.assetTagIds ?? []), ...ensuredTagIds]),

          );

          updatedCount++;

          return {

            ...asset,

            tags: mergedLabels,

            assetTagIds: mergedIds,

          };

        });

      });



      return {

        ok: true,

        operation: 'assignTags',

        data: { updatedCount },

        summary: `${cleanLabels.length} etiqueta(s) aplicada(s) em ${updatedCount} asset(s).`,

        affectedResources: previousTags.map((item) => item.assetId),

        reversible: previousTags.length > 0,

        undo: { kind: 'restore-asset-tags', previousTags },

      };

    } catch (error) {

      const msg = error instanceof Error ? error.message : 'Erro ao associar etiquetas.';

      return {

        ok: false,

        operation: 'assignTags',

        summary: msg,

        affectedResources: [],

        reversible: false,

        error: msg,

      };

    }

  }



  function organizeRecords(

    params: {

      readonly assetIds: readonly string[];

      readonly targetFolderId: string | null;

    },

    permissions: PermissionContext = DEFAULT_USER_PERMISSIONS,

  ): OperationResult<{ movedCount: number }> {

    try {

      assertMutationAllowed('organizeRecords', permissions);

      const uniqueAssetIds = Array.from(new Set(params.assetIds.filter(Boolean)));

      if (uniqueAssetIds.length === 0) {

        throw new Error('Nenhum asset informado para organizar.');

      }



      const previousLocations: Array<{ assetId: string; folder: string | null }> = [];

      let movedCount = 0;

      const movedAt = new Date().toISOString();



      store.transact((draft) => {

        if (

          params.targetFolderId !== null &&

          !(draft.folders ?? []).some(

            (folder) => folder.id === params.targetFolderId && !folder.deleted,

          )

        ) {

          throw new Error('Pasta de destino inexistente ou na lixeira.');

        }



        const targetIds = new Set(uniqueAssetIds);

        const deduplicated = deduplicateAssets(draft.assets ?? []);

        draft.assets = deduplicated.map((asset) => {

          if (!targetIds.has(asset.id) || asset.deleted) return asset;

          previousLocations.push({ assetId: asset.id, folder: asset.folder ?? null });

          movedCount++;

          return {

            ...asset,

            folder: params.targetFolderId,

            updatedAt: movedAt,

          };

        });



        if (movedCount === 0) {

          throw new Error('Nenhum asset ativo encontrado para mover.');

        }

      });



      return {

        ok: true,

        operation: 'organizeRecords',

        data: { movedCount },

        summary: `${movedCount} registro(s) organizado(s) no Convés (arquivos originais no disco não foram movidos).`,

        affectedResources: previousLocations.map((item) => item.assetId),

        reversible: previousLocations.length > 0,

        undo: { kind: 'restore-asset-folders', previousLocations },

      };

    } catch (error) {

      const msg = error instanceof Error ? error.message : 'Erro ao organizar registros.';

      return {

        ok: false,

        operation: 'organizeRecords',

        summary: msg,

        affectedResources: [],

        reversible: false,

        error: msg,

      };

    }

  }



  function registerAsset(

    input: RegisterAssetInput,

    permissions: PermissionContext = DEFAULT_USER_PERMISSIONS,

  ): OperationResult<DeckAsset> {

    try {

      assertMutationAllowed('registerAsset', permissions);

      let created!: DeckAsset;

      store.transact((draft) => {

        const baseRecord = createCleanAssetRecord(draft.folders ?? [], input);

        if (baseRecord.tags.length > 0) {

          const catalogResult = ensureAssetTagsCatalog(

            draft.assetTags ?? [],

            baseRecord.tags,

          );

          draft.assetTags = catalogResult.nextAssetTags;

          created = {

            ...baseRecord,

            tags: catalogResult.resolvedTags.map((t) => t.label),

            assetTagIds: catalogResult.resolvedTags.map((t) => t.id),

          };

        } else {

          created = baseRecord;

        }

        draft.assets = [...(draft.assets ?? []), created];

      });

      return {

        ok: true,

        operation: 'registerAsset',

        data: created,

        summary:

          created.tags.length > 0

            ? `Asset "${created.nome}" registrado no Convés com ${created.tags.length} etiqueta(s).`

            : `Asset "${created.nome}" registrado no Convés sem etiquetas manuais.`,

        affectedResources: [created.id],

        reversible: false,

      };

    } catch (error) {

      const msg = error instanceof Error ? error.message : 'Erro ao registrar asset.';

      return {

        ok: false,

        operation: 'registerAsset',

        summary: msg,

        affectedResources: [],

        reversible: false,

        error: msg,

      };

    }

  }



  function removeAssetTags(

    params: {

      readonly assetIds: readonly string[];

      readonly labels: readonly string[];

    },

    permissions: PermissionContext = DEFAULT_USER_PERMISSIONS,

  ): OperationResult<{ updatedCount: number }> {

    try {

      assertMutationAllowed('removeAssetTags', permissions);

      const previousTags: Array<{

        assetId: string;

        tags: readonly string[];

        assetTagIds: readonly string[];

      }> = [];



      store.transact((draft) => {

        const targetIds = new Set(params.assetIds);

        for (const asset of draft.assets ?? []) {

          if (targetIds.has(asset.id) && !asset.deleted) {

            previousTags.push({

              assetId: asset.id,

              tags: [...(asset.tags ?? [])],

              assetTagIds: [...(asset.assetTagIds ?? [])],

            });

          }

        }

        draft.assets = removeAssetTagsFromAssets(

          draft.assets ?? [],

          draft.assetTags ?? [],

          params.assetIds,

          params.labels,

        );

      });



      return {

        ok: true,

        operation: 'removeAssetTags',

        data: { updatedCount: previousTags.length },

        summary: `Etiqueta(s) removida(s) de ${previousTags.length} asset(s).`,

        affectedResources: previousTags.map((p) => p.assetId),

        reversible: previousTags.length > 0,

        undo: { kind: 'restore-asset-tags', previousTags },

      };

    } catch (error) {

      const msg = error instanceof Error ? error.message : 'Erro ao remover etiquetas.';

      return {

        ok: false,

        operation: 'removeAssetTags',

        summary: msg,

        affectedResources: [],

        reversible: false,

        error: msg,

      };

    }

  }



  function renameAssetTag(

    tagId: string,

    newLabel: string,

    permissions: PermissionContext = DEFAULT_USER_PERMISSIONS,

  ): OperationResult<EtiquetaDeAsset> {

    try {

      assertMutationAllowed('renameAssetTag', permissions);

      let updatedTag!: EtiquetaDeAsset;

      store.transact((draft) => {

        const res = renameAssetTagInCatalog(

          draft.assets ?? [],

          draft.assetTags ?? [],

          tagId,

          newLabel,

        );

        draft.assetTags = res.nextAssetTags;

        draft.assets = res.nextAssets;

        updatedTag = res.updatedTag;

      });

      return {

        ok: true,

        operation: 'renameAssetTag',

        data: updatedTag,

        summary: `Etiqueta renomeada para "${updatedTag.label}".`,

        affectedResources: [tagId],

        reversible: false,

      };

    } catch (error) {

      const msg = error instanceof Error ? error.message : 'Erro ao renomear etiqueta.';

      return {

        ok: false,

        operation: 'renameAssetTag',

        summary: msg,

        affectedResources: [],

        reversible: false,

        error: msg,

      };

    }

  }



  function deleteAssetTag(

    tagId: string,

    permissions: PermissionContext = DEFAULT_USER_PERMISSIONS,

  ): OperationResult<{ deletedTagId: string }> {

    try {

      assertMutationAllowed('deleteAssetTag', permissions);

      store.transact((draft) => {

        const res = deleteAssetTagFromCatalog(

          draft.assets ?? [],

          draft.assetTags ?? [],

          tagId,

        );

        draft.assetTags = res.nextAssetTags;

        draft.assets = res.nextAssets;

      });

      return {

        ok: true,

        operation: 'deleteAssetTag',

        data: { deletedTagId: tagId },

        summary: 'Etiqueta de asset removida do catálogo; assets preservados.',

        affectedResources: [tagId],

        reversible: false,

      };

    } catch (error) {

      const msg = error instanceof Error ? error.message : 'Erro ao excluir etiqueta.';

      return {

        ok: false,

        operation: 'deleteAssetTag',

        summary: msg,

        affectedResources: [],

        reversible: false,

        error: msg,

      };

    }

  }



  function renameGlobalTag(

    tagId: string,

    newLabel: string,

    permissions: PermissionContext = DEFAULT_USER_PERMISSIONS,

  ): OperationResult<{ updatedLabel: string }> {

    try {

      assertMutationAllowed('renameAssetTag', permissions);

      let updatedLabel = '';

      store.transact((draft) => {

        const res = renameGlobalTagInWorkspace({

          assets: draft.assets ?? [],

          folders: draft.folders ?? [],

          assetTags: draft.assetTags ?? [],

          folderTags: draft.folderTags ?? [],

          tagId,

          newLabel,

        });

        draft.assetTags = res.nextAssetTags;

        draft.folderTags = res.nextFolderTags;

        draft.assets = res.nextAssets;

        draft.folders = res.nextFolders;

        updatedLabel = res.updatedLabel;

      });

      return {

        ok: true,

        operation: 'renameAssetTag',

        data: { updatedLabel },

        summary: `Etiqueta renomeada para "${updatedLabel}".`,

        affectedResources: [tagId],

        reversible: false,

      };

    } catch (error) {

      const msg = error instanceof Error ? error.message : 'Erro ao renomear etiqueta.';

      return {

        ok: false,

        operation: 'renameAssetTag',

        summary: msg,

        affectedResources: [],

        reversible: false,

        error: msg,

      };

    }

  }



  function deleteGlobalTag(

    tagId: string,

    permissions: PermissionContext = DEFAULT_USER_PERMISSIONS,

  ): OperationResult<{

    deletedTagId: string;

    unlinkedAssets: number;

    unlinkedFolders: number;

  }> {

    try {

      assertMutationAllowed('deleteAssetTag', permissions);

      let unlinkedAssets = 0;

      let unlinkedFolders = 0;

      let removedLabel: string | null = null;

      store.transact((draft) => {

        const res = deleteGlobalTagFromWorkspace({

          assets: draft.assets ?? [],

          folders: draft.folders ?? [],

          assetTags: draft.assetTags ?? [],

          folderTags: draft.folderTags ?? [],

          tagId,

        });

        draft.assetTags = res.nextAssetTags;

        draft.folderTags = res.nextFolderTags;

        draft.assets = res.nextAssets;

        draft.folders = res.nextFolders;

        unlinkedAssets = res.unlinkedAssets;

        unlinkedFolders = res.unlinkedFolders;

        removedLabel = res.removedLabel;

      });

      return {

        ok: true,

        operation: 'deleteAssetTag',

        data: { deletedTagId: tagId, unlinkedAssets, unlinkedFolders },

        summary: removedLabel

          ? `Etiqueta "${removedLabel}" excluída (${unlinkedAssets} asset(s) e ${unlinkedFolders} pasta(s) preservados).`

          : 'Etiqueta removida; registros preservados.',

        affectedResources: [tagId],

        reversible: false,

      };

    } catch (error) {

      const msg = error instanceof Error ? error.message : 'Erro ao excluir etiqueta.';

      return {

        ok: false,

        operation: 'deleteAssetTag',

        summary: msg,

        affectedResources: [],

        reversible: false,

        error: msg,

      };

    }

  }



  function updateAssetCategory(

    assetId: string,

    newCategory: string,

    permissions: PermissionContext = DEFAULT_USER_PERMISSIONS,

  ): OperationResult<DeckAsset> {

    try {

      assertMutationAllowed('updateAssetCategory', permissions);

      let updated!: DeckAsset;

      store.transact((draft) => {

        const nextAssets = updateAssetCategoryRecord(

          draft.assets ?? [],

          assetId,

          newCategory,

        );

        const found = nextAssets.find((a) => a.id === assetId && !a.deleted);

        if (!found) throw new Error('Asset não encontrado para atualizar categoria.');

        draft.assets = nextAssets;

        updated = migrateLegacyAssetRecord(found);

      });

      return {

        ok: true,

        operation: 'updateAssetCategory',

        data: updated,

        summary: `Categoria de "${updated.nome}" atualizada para "${updated.categoria}".`,

        affectedResources: [assetId],

        reversible: false,

      };

    } catch (error) {

      const msg = error instanceof Error ? error.message : 'Erro ao atualizar categoria.';

      return {

        ok: false,

        operation: 'updateAssetCategory',

        summary: msg,

        affectedResources: [],

        reversible: false,

        error: msg,

      };

    }

  }



  function inspectFolderTags(

    folderId: string | null,

    scope: 'direct' | 'recursive' = 'direct',

  ): OperationResult<DiscoveredFolderTagsResult> {

    const snap = store.snapshot();

    const data = getDiscoveredFolderTags(

      folderId,

      snap.folders ?? [],

      snap.assets ?? [],

      snap.assetTags ?? [],

      { scope },

    );

    return {

      ok: true,

      operation: 'inspectFolderTags',

      data,

      summary: `${data.discoveredTags.length} etiqueta(s) encontrada(s) nos assets do escopo (${scope === 'direct' ? 'filhos diretos' : 'incluindo subpastas'}).`,

      affectedResources: data.includedFolderIds,

      reversible: false,

    };

  }



  function getAssetClassification(

    assetId: string,

  ): OperationResult<AssetClassificationProfile> {

    const snap = store.snapshot();

    const asset = (snap.assets ?? []).find((a) => a.id === assetId && !a.deleted);

    if (!asset) {

      return {

        ok: false,

        operation: 'getAssetClassification',

        summary: 'Asset não encontrado.',

        affectedResources: [],

        reversible: false,

        error: `Asset "${assetId}" não encontrado.`,

      };

    }

    const profile = buildAssetClassificationProfile({

      asset,

      folders: snap.folders ?? [],

      existingAssetTags: snap.assetTags ?? [],

      existingFolderTags: snap.folderTags ?? [],

    });

    return {

      ok: true,

      operation: 'getAssetClassification',

      data: profile,

      summary: `Perfil de classificação consultado para "${asset.nome}".`,

      affectedResources: [asset.id],

      reversible: false,

    };

  }



  async function queryDiagnostics(

    assetIds: readonly string[],

    options: InferenceServiceOptions = {},

  ): Promise<OperationResult<StructuredInferenceReport[]>> {

    const snap = store.snapshot();

    const idSet = new Set(assetIds);

    const targets = deduplicateAssets(snap.assets ?? []).filter(

      (asset) => !asset.deleted && idSet.has(asset.id),

    );



    if (targets.length === 0) {

      return {

        ok: false,

        operation: 'queryDiagnostics',

        summary: 'Nenhum asset ativo selecionado para análise.',

        affectedResources: [],

        reversible: false,

        error: 'Selecione ao menos um asset ativo para consultar diagnósticos.',

      };

    }



    let reports: StructuredInferenceReport[];

    try {

      reports = await runStructuredInference(targets, { ...options, savedReports: Object.fromEntries(targets.map(a => [a.id, a.analysisReport])) });

    } catch (error) {

      return { ok: false, operation: 'queryDiagnostics', summary: String(error instanceof Error ? error.message : error), affectedResources: [], reversible: false };

    }

    const analyzedAt = new Date().toISOString();

    try {

      store.transact((draft) => {

        draft.assets = (draft.assets ?? []).map((a) =>

          idSet.has(a.id) && !a.deleted && targets.some(t => t.id === a.id && analysisContextKey(t, options.targetEngine) === analysisContextKey(a, options.targetEngine))

            ? { ...a, lastAnalyzedAt: analyzedAt, analysisReport: reports.find(r => r.assetId === a.id) } : a,

        );

      });

    } catch (error) {

      return { ok: false, operation: 'queryDiagnostics', data: reports, summary: `Análise concluída, mas não foi salva: ${String(error)}`, affectedResources: targets.map(a => a.id), reversible: false };

    }

    const warningsCount = reports.filter(

      (r) => r.diagnostic.status === 'warning' || r.diagnostic.status === 'incompatible',

    ).length;



    return {

      ok: true,

      operation: 'queryDiagnostics',

      data: reports,

      summary: `${reports.length} asset(s) analisado(s) (${warningsCount} com alerta/ressalva).`,

      affectedResources: targets.map((t) => t.id),

      reversible: false,

    };

  }



  function moveToTrash(

    refs: ReadonlyArray<{ readonly type: 'folder' | 'asset'; readonly id: string }>,

    permissions: PermissionContext = DEFAULT_USER_PERMISSIONS,

  ): OperationResult<{ movedCount: number }> {

    try {

      assertMutationAllowed('moveToTrash', permissions);

      const mutableRefs = refs.map((r) => ({ type: r.type, id: r.id }));

      const affected = store.moveToTrash(mutableRefs);

      return {

        ok: true,

        operation: 'moveToTrash',

        data: { movedCount: affected.length },

        summary: `${affected.length} registro(s) movido(s) para a lixeira (arquivos no disco preservados).`,

        affectedResources: refs.map((r) => r.id),

        reversible: true,

        undo: { kind: 'restore-from-trash', refs },

      };

    } catch (error) {

      const msg = error instanceof Error ? error.message : 'Erro ao mover para a lixeira.';

      return {

        ok: false,

        operation: 'moveToTrash',

        summary: msg,

        affectedResources: [],

        reversible: false,

        error: msg,

      };

    }

  }



  function restoreFromTrash(

    refs: ReadonlyArray<{ readonly type: 'folder' | 'asset'; readonly id: string }>,

    permissions: PermissionContext = DEFAULT_USER_PERMISSIONS,

  ): OperationResult<{ relocated: string[]; renamed: string[] }> {

    try {

      assertMutationAllowed('restoreFromTrash', permissions);

      const mutableRefs = refs.map((r) => ({ type: r.type, id: r.id }));

      const result = store.restore(mutableRefs);

      return {

        ok: true,

        operation: 'restoreFromTrash',

        data: result,

        summary: `${refs.length} item(ns) restaurado(s) da lixeira.`,

        affectedResources: refs.map((r) => r.id),

        reversible: false,

      };

    } catch (error) {

      const msg = error instanceof Error ? error.message : 'Erro ao restaurar da lixeira.';

      return {

        ok: false,

        operation: 'restoreFromTrash',

        summary: msg,

        affectedResources: [],

        reversible: false,

        error: msg,

      };

    }

  }



  function applyUndo(

    undo: UndoDescriptor,

    permissions: PermissionContext = DEFAULT_USER_PERMISSIONS,

  ): OperationResult<unknown> {

    try {

      assertMutationAllowed('organizeRecords', permissions);

      switch (undo.kind) {

        case 'trash-created-folder':

          return moveToTrash([{ type: 'folder', id: undo.folderId }], permissions);



        case 'restore-folder-name':

          return renameFolder(undo.folderId, undo.previousName, permissions);



        case 'restore-folder-parent':

          return moveFolder(undo.folderId, undo.previousParent, permissions);



        case 'restore-asset-folders': {

          const map = new Map(

            undo.previousLocations.map((item) => [item.assetId, item.folder]),

          );

          store.transact((draft) => {

            draft.assets = (draft.assets ?? []).map((asset) =>

              map.has(asset.id)

                ? { ...asset, folder: map.get(asset.id) ?? null }

                : asset,

            );

          });

          return {

            ok: true,

            operation: 'organizeRecords',

            summary: `Localização original restaurada para ${undo.previousLocations.length} asset(s).`,

            affectedResources: undo.previousLocations.map((i) => i.assetId),

            reversible: false,

          };

        }



        case 'restore-asset-tags': {

          const map = new Map(undo.previousTags.map((item) => [item.assetId, item]));

          store.transact((draft) => {

            draft.assets = (draft.assets ?? []).map((asset) => {

              const prev = map.get(asset.id);

              if (!prev) return asset;

              return {

                ...asset,

                tags: [...prev.tags],

                assetTagIds: [...prev.assetTagIds],

              };

            });

          });

          return {

            ok: true,

            operation: 'assignTags',

            summary: `Etiquetas anteriores restauradas em ${undo.previousTags.length} asset(s).`,

            affectedResources: undo.previousTags.map((i) => i.assetId),

            reversible: false,

          };

        }



        case 'restore-folder-tags': {

          const map = new Map(

            undo.previousTags.map((item) => [item.folderId, item.folderTagIds]),

          );

          store.transact((draft) => {

            draft.folders = (draft.folders ?? []).map((folder) =>

              map.has(folder.id)

                ? { ...folder, folderTagIds: [...(map.get(folder.id) ?? [])] }

                : folder,

            );

          });

          return {

            ok: true,

            operation: 'assignTags',

            summary: `Etiquetas anteriores restauradas em ${undo.previousTags.length} pasta(s).`,

            affectedResources: undo.previousTags.map((i) => i.folderId),

            reversible: false,

          };

        }



        case 'restore-from-trash':

          return restoreFromTrash(undo.refs, permissions);



        case 'delete-created-folder-tag': {

          store.transact((draft) => {

            const inUse = (draft.folders ?? []).some(

              (f) => !f.deleted && (f.folderTagIds ?? []).includes(undo.tagId),

            );

            if (inUse) {

              throw new Error(

                'Etiqueta já aplicada a pastas ativas; remova os vínculos antes de desfazer.',

              );

            }

            draft.folderTags = (draft.folderTags ?? []).filter(

              (tag) => tag.id !== undo.tagId,

            );

          });

          return {

            ok: true,

            operation: 'createTag',

            summary: 'Criação de etiqueta de pasta revertida.',

            affectedResources: [undo.tagId],

            reversible: false,

          };

        }

      }

    } catch (error) {

      const msg = error instanceof Error ? error.message : 'Falha ao desfazer operação.';

      return {

        ok: false,

        operation: 'organizeRecords',

        summary: msg,

        affectedResources: [],

        reversible: false,

        error: msg,

      };

    }

  }



  return {

    listFolders: (includeDeleted = false) => store.snapshot().folders.filter(f => includeDeleted || !f.deleted),

    relinkAsset,

    updateAssetRecord,

    moveFolder,

    listAssets,

    getAssetMetadata,

    searchAssets,

    listTags,

    createFolder,

    renameFolder,

    createTag,

    assignTags,

    removeAssetTags,

    renameAssetTag,

    deleteAssetTag,

    renameGlobalTag,

    deleteGlobalTag,

    updateAssetCategory,

    inspectFolderTags,

    getAssetClassification,

    organizeRecords,

    registerAsset,

    queryDiagnostics,

    moveToTrash,

    restoreFromTrash,

    applyUndo,

  };

}



export type LibraryOperationsService = ReturnType<

  typeof createLibraryOperationsService

>;

