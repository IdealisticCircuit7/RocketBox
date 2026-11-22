/**
 * Serviços de Biblioteca — Passo 2 (Convés Inteligente, Nível 1) e Smart Asset Registration 2.0.
 * Lógica puramente determinística para etiquetas de pastas, isolamento de pastas,
 * filtros universais combinados sem duplicação de assets, identificação por modalidade
 * e migração segura de registros legados.
 */

import {
  type AssetRegistration,
  buildNautiaRegistrationGuidance,
  identifyAssetByPath,
  INDIVIDUAL_ASSET_CATEGORIES,
  legacyEngineToOriginSoftware,
  type NautiaRegistrationGuidance,
  ORIGIN_SOFTWARE_LABELS,
  type OriginSoftware,
  type PathIdentificationResult,
  PROJECT_TYPE_LABELS,
  type ProjectType,
  REGISTRATION_KIND_LABELS,
  type RegistrationKind,
  softwareToLegacyEngineLabel,
  VERIFICATION_STATUS_LABELS,
  type VerificationStatus,
  type ViewerPreviewKind,
} from './assetIdentificationService.ts';

export {
  type AssetRegistration,
  buildNautiaRegistrationGuidance,
  identifyAssetByPath,
  INDIVIDUAL_ASSET_CATEGORIES,
  legacyEngineToOriginSoftware,
  type NautiaRegistrationGuidance,
  ORIGIN_SOFTWARE_LABELS,
  type OriginSoftware,
  type PathIdentificationResult,
  PROJECT_TYPE_LABELS,
  type ProjectType,
  REGISTRATION_KIND_LABELS,
  type RegistrationKind,
  softwareToLegacyEngineLabel,
  VERIFICATION_STATUS_LABELS,
  type VerificationStatus,
  type ViewerPreviewKind,
};

export type FolderTagIconId =
  | 'folder'
  | 'rocket'
  | 'cube'
  | 'layers'
  | 'sparkles'
  | 'shield'
  | 'compass'
  | 'tag'
  | 'person'
  | 'environment'
  | 'image'
  | 'audio'
  | 'motion';

export type TagAccent = 'cyan' | 'purple';

export type FilterMatchMode = 'all' | 'any';

export type TagFilterScope = 'folder' | 'asset' | 'both';

/**
 * Contrato relacional de Etiqueta (Etapa 09).
 */
export interface Tag {
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly color?: string;
  readonly kind?: 'folder-tag' | 'asset-tag';
}

export interface AssetTag {
  readonly assetId: string;
  readonly tagId: string;
}

export interface FolderTag {
  readonly folderId: string;
  readonly tagId: string;
}

/**
 * Etiqueta exclusiva de pastas do Convés.
 * Discriminada estritamente de `EtiquetaDeAsset` via `kind: 'folder-tag'`.
 */
export interface EtiquetaDePasta {
  readonly id: string;
  readonly kind: 'folder-tag';
  readonly label: string;
  readonly normalizedLabel: string;
  readonly icon: FolderTagIconId;
  readonly accent: TagAccent;
  readonly color?: string;
  readonly createdAt: string;
}

/**
 * Etiqueta exclusiva de assets individuais.
 * Preservada separadamente para não colidir com etiquetas de pastas.
 */
export interface EtiquetaDeAsset {
  readonly id: string;
  readonly kind: 'asset-tag';
  readonly label: string;
  readonly normalizedLabel: string;
  readonly color?: string;
  readonly createdAt?: string;
}

export interface DeckFolder {
  readonly id: string;
  readonly name: string;
  readonly parent: string | null;
  readonly folderTagIds?: readonly string[];
  readonly deleted?: { readonly at: string; readonly batchId: string } | null;
}

export interface DeckAsset {
  readonly analysisReport?: import('./inferenceService.ts').StructuredInferenceReport;
  readonly id: string;
  readonly nome: string;
  readonly caminho: string;
  readonly categoria: string;
  readonly formato: string;
  readonly engine?: string;
  readonly projeto?: string;
  readonly folder: string | null;
  readonly tags: readonly string[];
  readonly assetTagIds?: readonly string[];
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly lastAnalyzedAt?: string;
  readonly fileSize?: string | number | null;
  readonly deleted?: { readonly at: string; readonly batchId: string } | null;

  // Smart Asset Registration 2.0 (Etapa 07, Etapa 08 e Etapa 11)
  readonly kind?: RegistrationKind;
  readonly sourcePath?: string;
  readonly sourceSoftware?: OriginSoftware;
  readonly projectType?: ProjectType;
  readonly detectedFormat?: string | null;
  readonly technicalType?: string | null;
  readonly targetSoftware?: readonly OriginSoftware[];
  readonly projectDirectory?: string | null;
  readonly structureMarkers?: readonly string[];
  readonly verificationStatus?: VerificationStatus;
  readonly identificationWarnings?: readonly string[];
}

export type OrganizationFilterState =
  | 'all'
  | 'in-folder'
  | 'root'
  | 'tagged'
  | 'untagged';

export interface UniversalFilterCriteria {
  readonly matchMode: FilterMatchMode;
  readonly nameQuery: string;
  readonly assetTagQuery: string;
  readonly selectedAssetTags?: readonly string[];
  readonly assetTagMatchMode?: FilterMatchMode;
  readonly tagScope?: TagFilterScope;
  readonly fileType: string | null;
  readonly format: string | null;
  readonly project: string | null;
  readonly organizationState: OrganizationFilterState;
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
}

export interface DiscoveredFolderTagItem {
  readonly tagId: string;
  readonly label: string;
  readonly normalizedLabel: string;
  readonly assetCount: number;
  readonly directAssetCount: number;
  readonly subfolderAssetCount: number;
  readonly assetIds: readonly string[];
}

export interface DiscoveredFolderTagsResult {
  readonly folderId: string;
  readonly scope: 'direct' | 'recursive';
  readonly includedFolderIds: readonly string[];
  readonly totalAssetsInScope: number;
  readonly discoveredTags: readonly DiscoveredFolderTagItem[];
}

export interface AssetTagMatchOrigin {
  readonly assetId: string;
  readonly byFolderTag: boolean;
  readonly byAssetTag: boolean;
  readonly matchedFolderTags: readonly string[];
  readonly matchedAssetTags: readonly string[];
}

export interface CreateFolderTagInput {
  readonly label: string;
  readonly icon?: FolderTagIconId;
  readonly accent?: TagAccent;
}

export interface CreateAssetTagInput {
  readonly label: string;
  readonly color?: string;
}

export interface CreateFolderWithTagInput {
  readonly name: string;
  readonly parent: string | null;
  readonly existingTagId?: string | null;
  readonly newTag?: CreateFolderTagInput | null;
}

export interface CreateFolderWithTagResult {
  readonly folder: DeckFolder;
  readonly createdTag: EtiquetaDePasta | null;
  readonly nextFolders: DeckFolder[];
  readonly nextFolderTags: EtiquetaDePasta[];
}

/**
 * Contrato de registro/importação de asset com Smart Asset Registration 2.0
 * e Smart Tags & Classification 3.0 (Etiquetas opcionais por modalidade).
 */
export interface RegisterAssetInput {
  readonly nome: string;
  readonly caminho: string;
  readonly categoria?: string | null;
  readonly formato?: string;
  readonly engine?: string;
  readonly projeto?: string;
  readonly folder?: string | null;
  readonly tags?: readonly string[];
  readonly assetTagIds?: readonly string[];
  readonly fileSize?: string | number | null;

  // Smart Asset Registration 2.0 e Etapa 11
  readonly kind?: RegistrationKind;
  readonly sourceSoftware?: OriginSoftware;
  readonly projectType?: ProjectType;
  readonly targetSoftware?: readonly OriginSoftware[];
  readonly detectedFormat?: string | null;
  readonly technicalType?: string | null;
  readonly projectDirectory?: string | null;
  readonly structureMarkers?: readonly string[];
  readonly directoryMarkers?: readonly string[];
  readonly verificationStatus?: VerificationStatus;
  readonly identificationWarnings?: readonly string[];
}

/**
 * Contrato estruturado retornado pelo Motor de Inferência Tauri/Python (SIA).
 */
export interface InferenceEngineResult {
  readonly nome: string;
  readonly caminho: string;
  readonly formato: string;
  readonly diagnostico: string;
  readonly explicacao: string;
  readonly engineAlvo?: string;
  readonly categoria?: string;
  readonly compatibilidade?: 'nativa' | 'ressalva' | 'incompativel';
}

export interface DeckFilterResult {
  readonly visibleFolders: readonly DeckFolder[];
  readonly visibleAssets: readonly DeckAsset[];
  readonly matchedTagIds: readonly string[];
  readonly isFolderIsolationActive: boolean;
  readonly hasUniversalFiltersActive: boolean;
  readonly tagMatchOrigins?: ReadonlyMap<string, AssetTagMatchOrigin>;
}

export const DEFAULT_UNIVERSAL_FILTERS: UniversalFilterCriteria = Object.freeze({
  matchMode: 'all',
  nameQuery: '',
  assetTagQuery: '',
  selectedAssetTags: [],
  assetTagMatchMode: 'any',
  tagScope: 'asset',
  fileType: null,
  format: null,
  project: null,
  organizationState: 'all',
  dateFrom: null,
  dateTo: null,
});

export function normalizeTagLabel(label: string): string {
  return label
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Cria uma nova `EtiquetaDePasta` garantindo unicidade por rótulo normalizado.
 */
export function createFolderTag(
  existingTags: readonly EtiquetaDePasta[],
  input: CreateFolderTagInput,
  now: () => string = () => new Date().toISOString(),
  idFactory: () => string = () => generateId('ftag'),
): EtiquetaDePasta {
  const cleanLabel = input.label.trim().replace(/\s+/g, ' ');
  if (!cleanLabel) {
    throw new Error('Informe um nome para a etiqueta de pasta.');
  }
  if (cleanLabel.length > 32) {
    throw new Error('A etiqueta de pasta deve ter no máximo 32 caracteres.');
  }

  const normalized = normalizeTagLabel(cleanLabel);
  if (isSystemReservedTag(normalized)) {
    throw new Error(`"${cleanLabel}" é um identificador reservado do sistema e não pode ser usado como etiqueta.`);
  }
  if (existingTags.some((tag) => tag.normalizedLabel === normalized)) {
    throw new Error(`Já existe uma etiqueta de pasta chamada "${cleanLabel}".`);
  }

  return {
    id: idFactory(),
    kind: 'folder-tag',
    label: cleanLabel,
    normalizedLabel: normalized,
    icon: input.icon ?? 'tag',
    accent: input.accent ?? 'cyan',
    createdAt: now(),
  };
}

/**
 * Aplica ou remove uma `EtiquetaDePasta` em uma pasta específica,
 * garantindo que somente IDs válidos de `EtiquetaDePasta` sejam vinculados.
 */
export function toggleFolderTagOnFolder(
  folders: readonly DeckFolder[],
  folderTags: readonly EtiquetaDePasta[],
  folderId: string,
  tagId: string,
): DeckFolder[] {
  const validTag = folderTags.find((tag) => tag.id === tagId && tag.kind === 'folder-tag');
  if (!validTag) {
    throw new Error('Etiqueta de pasta inválida ou inexistente.');
  }

  return folders.map((folder) => {
    if (folder.id !== folderId || folder.deleted) {
      return folder;
    }
    const current = folder.folderTagIds ?? [];
    const exists = current.includes(tagId);
    const nextTagIds = exists
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];

    return {
      ...folder,
      folderTagIds: nextTagIds,
    };
  });
}

/**
 * Retorna a contagem determinística de pastas ativas por `EtiquetaDePasta`.
 */
export function countFoldersByTag(
  folders: readonly DeckFolder[],
  folderTags: readonly EtiquetaDePasta[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const tag of folderTags) {
    counts.set(tag.id, 0);
  }
  for (const folder of folders) {
    if (folder.deleted) continue;
    const seenOnFolder = new Set(folder.folderTagIds ?? []);
    for (const tagId of seenOnFolder) {
      if (counts.has(tagId)) {
        counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/**
 * Filtra os ícones/etiquetas exibidos na barra do Convés pela pesquisa de etiqueta.
 */
export function filterFolderTagCatalog(
  folderTags: readonly EtiquetaDePasta[],
  tagSearchQuery: string,
): EtiquetaDePasta[] {
  const query = normalizeTagLabel(tagSearchQuery);
  if (!query) return [...folderTags];
  return folderTags.filter((tag) => tag.normalizedLabel.includes(query));
}

/**
 * Isola estritamente as pastas correspondentes às etiquetas selecionadas
 * (ou às etiquetas encontradas pela pesquisa textual quando nenhum ícone foi fixado).
 */
export function filterFoldersByTags(
  folders: readonly DeckFolder[],
  folderTags: readonly EtiquetaDePasta[],
  options: {
    readonly selectedTagIds: readonly string[];
    readonly tagSearchQuery: string;
    readonly tagMatchMode?: FilterMatchMode;
    readonly currentParentId?: string | null;
  },
): {
  readonly folders: DeckFolder[];
  readonly matchedTagIds: string[];
  readonly isolationActive: boolean;
} {
  const activeFolders = folders.filter((folder) => !folder.deleted);
  const validTagIds = new Set(folderTags.map((tag) => tag.id));
  const selectedIds = options.selectedTagIds.filter((id) => validTagIds.has(id));
  const query = normalizeTagLabel(options.tagSearchQuery);
  const tagMatchMode = options.tagMatchMode ?? 'any';

  // Caso 1: Ícones de etiqueta explicitamente selecionados -> isola SOMENTE pastas com essas etiquetas.
  if (selectedIds.length > 0) {
    const matched = activeFolders.filter((folder) => {
      const assigned = new Set(folder.folderTagIds ?? []);
      return tagMatchMode === 'all'
        ? selectedIds.every((id) => assigned.has(id))
        : selectedIds.some((id) => assigned.has(id));
    });
    return {
      folders: matched,
      matchedTagIds: selectedIds,
      isolationActive: true,
    };
  }

  // Caso 2: Pesquisa textual por etiqueta sem ícone clicado -> isola SOMENTE pastas com etiquetas que casam.
  if (query.length > 0) {
    const matchingTags = folderTags.filter((tag) => tag.normalizedLabel.includes(query));
    const matchingTagIds = matchingTags.map((tag) => tag.id);
    if (matchingTagIds.length === 0) {
      return {
        folders: [],
        matchedTagIds: [],
        isolationActive: true,
      };
    }
    const matchingIdSet = new Set(matchingTagIds);
    const matched = activeFolders.filter((folder) =>
      (folder.folderTagIds ?? []).some((id) => matchingIdSet.has(id)),
    );
    return {
      folders: matched,
      matchedTagIds: matchingTagIds,
      isolationActive: true,
    };
  }

  // Caso 3: Sem isolamento de etiqueta -> exibe pastas ativas do nível atual (ou todas se currentParentId === undefined).
  const scoped =
    options.currentParentId === undefined
      ? activeFolders
      : activeFolders.filter((folder) => folder.parent === options.currentParentId);

  return {
    folders: scoped,
    matchedTagIds: [],
    isolationActive: false,
  };
}

function toDayKey(isoOrDate?: string): string | null {
  if (!isoOrDate) return null;
  const trimmed = isoOrDate.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function evaluateAssetCriteria(
  asset: DeckAsset,
  criteria: UniversalFilterCriteria,
  folderTagLabelsByFolderId?: ReadonlyMap<string, readonly string[]>,
): {
  readonly active: boolean;
  readonly matches: boolean;
  readonly byFolderTag: boolean;
  readonly byAssetTag: boolean;
  readonly matchedFolderTags: readonly string[];
  readonly matchedAssetTags: readonly string[];
} {
  const predicates: boolean[] = [];
  let byFolderTag = false;
  let byAssetTag = false;
  const matchedFolderTags: string[] = [];
  const matchedAssetTags: string[] = [];

  if (criteria.nameQuery.trim()) {
    const q = normalizeTagLabel(criteria.nameQuery);
    const haystack = normalizeTagLabel(`${asset.nome} ${asset.caminho}`);
    predicates.push(haystack.includes(q));
  }

  const rawTagTokens = [
    ...(criteria.selectedAssetTags ?? []),
    ...(criteria.assetTagQuery.trim()
      ? criteria.assetTagQuery
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : []),
  ];
  const uniqueNormalizedTokens = Array.from(
    new Set(rawTagTokens.map(normalizeTagLabel).filter(Boolean)),
  );

  if (uniqueNormalizedTokens.length > 0) {
    const scope: TagFilterScope = criteria.tagScope ?? 'asset';
    const tagMatchMode: FilterMatchMode = criteria.assetTagMatchMode ?? 'any';
    const assetTagEntries = (asset.tags ?? []).map((label) => ({
      label,
      norm: normalizeTagLabel(label),
    }));
    const folderTagEntries = (
      (asset.folder ? folderTagLabelsByFolderId?.get(asset.folder) : undefined) ??
      []
    ).map((label) => ({
      label,
      norm: normalizeTagLabel(label),
    }));

    const tokenEvaluations = uniqueNormalizedTokens.map((token) => {
      const hitAsset =
        (scope === 'asset' || scope === 'both') &&
        assetTagEntries.some((entry) => {
          const hit = entry.norm.includes(token) || entry.norm === token;
          if (hit && !matchedAssetTags.includes(entry.label)) {
            matchedAssetTags.push(entry.label);
          }
          return hit;
        });

      const hitFolder =
        (scope === 'folder' || scope === 'both') &&
        folderTagEntries.some((entry) => {
          const hit = entry.norm.includes(token) || entry.norm === token;
          if (hit && !matchedFolderTags.includes(entry.label)) {
            matchedFolderTags.push(entry.label);
          }
          return hit;
        });

      if (hitAsset) byAssetTag = true;
      if (hitFolder) byFolderTag = true;
      return hitAsset || hitFolder;
    });

    const tagPredicate =
      tagMatchMode === 'all'
        ? tokenEvaluations.every(Boolean)
        : tokenEvaluations.some(Boolean);
    predicates.push(tagPredicate);
  }

  if (criteria.fileType) {
    const targetType = normalizeTagLabel(criteria.fileType);
    predicates.push(normalizeTagLabel(asset.categoria || '') === targetType);
  }

  if (criteria.format) {
    const targetFormat = criteria.format.trim().toLocaleLowerCase('pt-BR');
    predicates.push((asset.formato || '').trim().toLocaleLowerCase('pt-BR') === targetFormat);
  }

  if (criteria.project) {
    const targetProject = normalizeTagLabel(criteria.project);
    predicates.push(normalizeTagLabel(asset.projeto || '') === targetProject);
  }

  if (criteria.organizationState && criteria.organizationState !== 'all') {
    const hasFolder = Boolean(asset.folder);
    const hasTags = (asset.tags?.length ?? 0) > 0 || (asset.assetTagIds?.length ?? 0) > 0;
    if (criteria.organizationState === 'in-folder') predicates.push(hasFolder);
    else if (criteria.organizationState === 'root') predicates.push(!hasFolder);
    else if (criteria.organizationState === 'tagged') predicates.push(hasTags);
    else if (criteria.organizationState === 'untagged') predicates.push(!hasTags);
  }

  if (criteria.dateFrom || criteria.dateTo) {
    const assetDay = toDayKey(asset.createdAt);
    if (!assetDay) {
      predicates.push(false);
    } else {
      const afterFrom = !criteria.dateFrom || assetDay >= criteria.dateFrom;
      const beforeTo = !criteria.dateTo || assetDay <= criteria.dateTo;
      predicates.push(afterFrom && beforeTo);
    }
  }

  if (predicates.length === 0) {
    return {
      active: false,
      matches: true,
      byFolderTag: false,
      byAssetTag: false,
      matchedFolderTags: [],
      matchedAssetTags: [],
    };
  }

  const matches =
    criteria.matchMode === 'all'
      ? predicates.every(Boolean)
      : predicates.some(Boolean);

  return {
    active: true,
    matches,
    byFolderTag,
    byAssetTag,
    matchedFolderTags,
    matchedAssetTags,
  };
}

/**
 * Garante que nenhum asset apareça duplicado na renderização durante filtragem,
 * preservando a primeira ocorrência determinística por `asset.id`.
 */
export function deduplicateAssets(assets: readonly DeckAsset[]): DeckAsset[] {
  const unique = new Map<string, DeckAsset>();
  for (const asset of assets) {
    if (!unique.has(asset.id)) {
      unique.set(asset.id, asset);
    }
  }
  return Array.from(unique.values());
}

/**
 * Extrai opções determinísticas disponíveis para os filtros universais a partir dos assets ativos.
 */
export function extractUniversalFilterOptions(assets: readonly DeckAsset[]): {
  readonly fileTypes: readonly string[];
  readonly formats: readonly string[];
  readonly projects: readonly string[];
  readonly assetTags: readonly string[];
} {
  const active = deduplicateAssets(assets).filter((asset) => !asset.deleted);
  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

  const collect = (getter: (asset: DeckAsset) => string | undefined): string[] =>
    Array.from(
      new Set(
        active
          .map(getter)
          .map((value) => (value ?? '').trim())
          .filter(Boolean),
      ),
    ).sort(collator.compare);

  const assetTags = Array.from(
    new Set(
      active.flatMap((asset) => asset.tags ?? []).map((t) => t.trim()).filter(Boolean),
    ),
  ).sort(collator.compare);

  return {
    fileTypes: collect((asset) => asset.categoria),
    formats: collect((asset) => asset.formato),
    projects: collect((asset) => asset.projeto),
    assetTags,
  };
}

export function hasActiveUniversalFilters(criteria: UniversalFilterCriteria): boolean {
  return Boolean(
    criteria.nameQuery.trim() ||
      criteria.assetTagQuery.trim() ||
      (criteria.selectedAssetTags && criteria.selectedAssetTags.length > 0) ||
      criteria.fileType ||
      criteria.format ||
      criteria.project ||
      (criteria.organizationState && criteria.organizationState !== 'all') ||
      criteria.dateFrom ||
      criteria.dateTo,
  );
}

/**
 * Executa o pipeline completo e determinístico de filtragem do Convés:
 * 1. Isola pastas pelas etiquetas selecionadas / pesquisadas.
 * 2. Aplica os filtros universais (ALL / ANY) para Tipo, Formato, Projeto, Data e Escopo de Etiquetas (pasta, asset, ambos).
 * 3. Deduplica estritamente os assets retornados por `id` e informa a origem das correspondências de etiquetas.
 */
export function runDeckFilters(params: {
  readonly allFolders?: boolean;
  readonly folders: readonly DeckFolder[];
  readonly assets: readonly DeckAsset[];
  readonly folderTags: readonly EtiquetaDePasta[];
  readonly selectedTagIds: readonly string[];
  readonly tagSearchQuery: string;
  readonly tagMatchMode: FilterMatchMode;
  readonly currentParentId: string | null;
  readonly universalFilters: UniversalFilterCriteria;
}): DeckFilterResult {
  const folderResult = filterFoldersByTags(params.folders, params.folderTags, {
    selectedTagIds: params.selectedTagIds,
    tagSearchQuery: params.tagSearchQuery,
    tagMatchMode: params.tagMatchMode,
    currentParentId: params.currentParentId,
  });

  const folderTagLabelById = new Map<string, string>();
  for (const ftag of params.folderTags) {
    folderTagLabelById.set(ftag.id, ftag.label);
  }
  const folderTagLabelsByFolderId = new Map<string, readonly string[]>();
  for (const folder of params.folders) {
    if (folder.deleted) continue;
    const labels = (folder.folderTagIds ?? [])
      .map((id) => folderTagLabelById.get(id))
      .filter((item): item is string => Boolean(item));
    folderTagLabelsByFolderId.set(folder.id, labels);
  }

  const activeAssets = deduplicateAssets(params.assets).filter((asset) => !asset.deleted);
  const isolatedFolderIds = new Set(folderResult.folders.map((folder) => folder.id));

  // Quando etiquetas são selecionadas na barra de etiquetas de pasta ou pesquisadas,
  // derivamos seus rótulos para suportar os 3 escopos da Etapa 05 ('folder' | 'asset' | 'both').
  const selectedFolderTagLabels = params.selectedTagIds
    .map((id) => folderTagLabelById.get(id))
    .filter((item): item is string => Boolean(item));
  const effectiveUniversalFilters: UniversalFilterCriteria =
    folderResult.isolationActive &&
    (params.universalFilters.selectedAssetTags ?? []).length === 0 &&
    !params.universalFilters.assetTagQuery.trim()
      ? {
          ...params.universalFilters,
          selectedAssetTags: [
            ...selectedFolderTagLabels,
            ...(params.tagSearchQuery.trim() ? [params.tagSearchQuery.trim()] : []),
          ],
          assetTagMatchMode: params.tagMatchMode,
        }
      : params.universalFilters;

  const effectiveTagScope: TagFilterScope =
    effectiveUniversalFilters.tagScope ?? 'folder';
  const hasUniversalFiltersActive =
    hasActiveUniversalFilters(effectiveUniversalFilters);
  const filteredAssets: DeckAsset[] = [];
  const tagMatchOrigins = new Map<string, AssetTagMatchOrigin>();

  for (const asset of activeAssets) {
    if (folderResult.isolationActive && effectiveTagScope === 'folder') {
      // No escopo estrito de pasta ('folder'), restringe aos assets localizados nas pastas isoladas.
      if (!asset.folder || !isolatedFolderIds.has(asset.folder)) {
        continue;
      }
    } else if (
      !folderResult.isolationActive &&
      !params.allFolders &&
      !hasUniversalFiltersActive &&
      asset.folder !== params.currentParentId
    ) {
      // Sem isolamento nem filtro universal ativo, preserva o escopo da pasta atual.
      continue;
    }

    const evaluation = evaluateAssetCriteria(
      asset,
      effectiveUniversalFilters,
      folderTagLabelsByFolderId,
    );
    if (evaluation.matches) {
      filteredAssets.push(asset);
      const matchedFromIsolation =
        folderResult.isolationActive &&
        effectiveTagScope !== 'asset' &&
        asset.folder
          ? (params.folders
              .find((f) => f.id === asset.folder)
              ?.folderTagIds?.filter((id) => folderResult.matchedTagIds.includes(id))
              .map((id) => folderTagLabelById.get(id) ?? id) ?? [])
          : [];
      const mergedFolderMatches = Array.from(
        new Set([...evaluation.matchedFolderTags, ...matchedFromIsolation]),
      );
      tagMatchOrigins.set(asset.id, {
        assetId: asset.id,
        byFolderTag: evaluation.byFolderTag || matchedFromIsolation.length > 0,
        byAssetTag: evaluation.byAssetTag,
        matchedFolderTags: mergedFolderMatches,
        matchedAssetTags: evaluation.matchedAssetTags,
      });
    }
  }

  return {
    visibleFolders: folderResult.folders,
    visibleAssets: deduplicateAssets(filteredAssets),
    matchedTagIds: folderResult.matchedTagIds,
    isFolderIsolationActive: folderResult.isolationActive,
    hasUniversalFiltersActive,
    tagMatchOrigins,
  };
}

/**
 * Cria uma nova pasta no Convés exigindo obrigatoriamente uma `EtiquetaDePasta`
 * (selecionada do catálogo existente ou criada no mesmo fluxo).
 */
export function createFolderWithRequiredTag(
  folders: readonly DeckFolder[],
  folderTags: readonly EtiquetaDePasta[],
  input: CreateFolderWithTagInput,
  now: () => string = () => new Date().toISOString(),
  idFactory: (prefix: string) => string = generateId,
): CreateFolderWithTagResult {
  const cleanName = input.name.trim().replace(/\s+/g, ' ');
  if (!cleanName) {
    throw new Error('Informe o nome da pasta.');
  }
  if (cleanName.length > 80) {
    throw new Error('O nome da pasta deve ter no máximo 80 caracteres.');
  }

  const normalizedName = normalizeTagLabel(cleanName);
  const duplicateInLevel = folders.some(
    (folder) =>
      !folder.deleted &&
      folder.parent === input.parent &&
      normalizeTagLabel(folder.name) === normalizedName,
  );
  if (duplicateInLevel) {
    throw new Error('Já existe uma pasta ativa com este nome neste nível.');
  }

  let nextFolderTags = [...folderTags];
  let createdTag: EtiquetaDePasta | null = null;
  let assignedTagId: string | null = null;

  if (input.newTag && input.newTag.label.trim().length > 0) {
    createdTag = createFolderTag(
      nextFolderTags,
      input.newTag,
      now,
      () => idFactory('ftag'),
    );
    nextFolderTags = [...nextFolderTags, createdTag];
    assignedTagId = createdTag.id;
  } else if (input.existingTagId) {
    const existing = nextFolderTags.find(
      (tag) => tag.id === input.existingTagId && tag.kind === 'folder-tag',
    );
    if (!existing) {
      throw new Error('Selecione uma etiqueta de pasta válida.');
    }
    assignedTagId = existing.id;
  }

  if (!assignedTagId) {
    throw new Error(
      'Selecione uma etiqueta existente ou crie uma nova etiqueta para a pasta.',
    );
  }

  const folder: DeckFolder = {
    id: idFactory('fld'),
    name: cleanName,
    parent: input.parent,
    folderTagIds: [assignedTagId],
  };

  return {
    folder,
    createdTag,
    nextFolders: [...folders, folder],
    nextFolderTags,
  };
}

/**
 * Registra um asset, projeto ou pacote no Convés sem entrada manual de etiquetas.
 * As tags permanecem vazias até processamento futuro pelo Motor de Inferência.
 * Integra Smart Asset Registration 2.0 (Modalidade -> Software de Origem -> Identificação Automática).
 */
export function createCleanAssetRecord(
  folders: readonly DeckFolder[],
  input: RegisterAssetInput,
  now: () => string = () => new Date().toISOString(),
  idFactory: () => string = () => generateId('ast'),
): DeckAsset {
  const nome = input.nome.trim();
  const caminho = input.caminho.trim();
  if (!nome || !caminho) {
    throw new Error('Informe o nome e o caminho do asset.');
  }

  if (
    input.folder &&
    !folders.some((folder) => folder.id === input.folder && !folder.deleted)
  ) {
    throw new Error('A pasta de destino selecionada não está ativa.');
  }

  const identification = identifyAssetByPath(caminho, {
    selectedKind: input.kind,
    selectedSourceSoftware: input.sourceSoftware,
    directoryMarkers: input.directoryMarkers,
  });

  if (identification.blockingError) {
    throw new Error(identification.blockingError);
  }

  const effectiveKind: RegistrationKind =
    input.kind ?? identification.suggestedKind;

  // Regra Etapa 03: Não enviar valores antigos incompatíveis com a modalidade selecionada
  const targetSoftware: readonly OriginSoftware[] =
    effectiveKind === 'asset'
      ? Array.from(new Set(input.targetSoftware ?? []))
      : [];

  const sourceSoftware: OriginSoftware =
    identification.sourceSoftware !== 'unknown'
      ? identification.sourceSoftware
      : input.sourceSoftware ??
        (input.engine ? legacyEngineToOriginSoftware(input.engine) : 'unknown');

  const detectedFormat =
    identification.detectedFormat ??
    (input.formato ? input.formato.replace(/^\./, '').toUpperCase() : null);

  const normalizedFormato =
    identification.detectedExtension ??
    (input.formato?.trim()
      ? input.formato.trim().startsWith('.')
        ? input.formato.trim().toLocaleLowerCase('pt-BR')
        : `.${input.formato.trim().toLocaleLowerCase('pt-BR')}`
      : effectiveKind === 'project' && sourceSoftware === 'unity'
        ? '.unityproj'
        : '.unknown');

  const resolvedCategory =
    effectiveKind === 'project'
      ? identification.suggestedCategory ??
        `Projeto ${ORIGIN_SOFTWARE_LABELS[sourceSoftware]}`
      : (input.categoria?.trim() ||
          identification.suggestedCategory ||
          (effectiveKind === 'package' ? 'Pacote' : 'Outro'));

  const resolvedEngine =
    effectiveKind === 'project'
      ? softwareToLegacyEngineLabel(sourceSoftware, [])
      : input.engine?.trim() ||
        softwareToLegacyEngineLabel(sourceSoftware, targetSoftware);

  const projeto = input.projeto?.trim() || undefined;

  // Smart Tags & Classification 3.0 (Etapa 03 e Etapa 04):
  // Etiquetas são opcionais e nunca herdam automaticamente a categoria.
  const deduplicatedTags: string[] = [];
  const seenNormalized = new Set<string>();
  for (const rawTag of input.tags ?? []) {
    const clean = rawTag.trim().replace(/\s+/g, ' ');
    if (!clean) continue;
    const norm = normalizeTagLabel(clean);
    if (!norm || seenNormalized.has(norm)) continue;
    seenNormalized.add(norm);
    deduplicatedTags.push(clean);
  }

  const assetTagIds = Array.from(new Set(input.assetTagIds ?? []));
  const timestamp = now();

  return {
    id: idFactory(),
    nome,
    caminho,
    categoria: resolvedCategory,
    formato: normalizedFormato,
    engine: resolvedEngine,
    projeto,
    folder: input.folder ?? null,
    tags: deduplicatedTags,
    assetTagIds,
    createdAt: timestamp,
    updatedAt: timestamp,
    fileSize: input.fileSize ?? null,
    kind: effectiveKind,
    sourcePath: caminho,
    sourceSoftware,
    projectType: identification.projectType,
    detectedFormat,
    technicalType: identification.technicalType,
    targetSoftware,
    projectDirectory: input.projectDirectory ?? identification.projectDirectory,
    structureMarkers: input.structureMarkers ?? identification.structureMarkers,
    verificationStatus: input.verificationStatus ?? identification.verificationStatus,
    identificationWarnings: input.identificationWarnings ?? identification.warnings,
  };
}

/**
 * Migra deterministicamente registros antigos da biblioteca (Etapa 08) sem perder
 * IDs, relações com pastas, etiquetas ou caminhos, e sem inventar propriedades fictícias.
 */
export function migrateLegacyAssetRecord(asset: DeckAsset): DeckAsset {
  if (
    asset.kind &&
    asset.sourceSoftware &&
    asset.verificationStatus &&
    asset.sourcePath &&
    asset.projectType !== undefined
  ) {
    return asset;
  }

  const identification = identifyAssetByPath(asset.caminho || '', {
    selectedKind: asset.kind,
    selectedSourceSoftware: asset.sourceSoftware,
    directoryMarkers: asset.structureMarkers,
  });
  const kind: RegistrationKind = asset.kind ?? identification.suggestedKind ?? 'asset';

  // Não inventa origem se o caminho não trouxer evidência direta
  const sourceSoftware: OriginSoftware =
    asset.sourceSoftware ??
    (identification.sourceSoftware !== 'unknown'
      ? identification.sourceSoftware
      : 'unknown');

  const legacyTarget =
    asset.engine && asset.engine !== 'Qualquer'
      ? legacyEngineToOriginSoftware(asset.engine)
      : 'unknown';

  const targetSoftware: readonly OriginSoftware[] =
    asset.targetSoftware ??
    (kind === 'asset' && legacyTarget !== 'unknown' ? [legacyTarget] : []);

  const detectedFormat =
    asset.detectedFormat !== undefined
      ? asset.detectedFormat
      : identification.detectedFormat ??
        (asset.formato ? asset.formato.replace(/^\./, '').toUpperCase() : null);

  const verificationStatus: VerificationStatus =
    asset.verificationStatus ?? 'not_verified';

  const projectType: ProjectType =
    asset.projectType !== undefined
      ? asset.projectType
      : kind === 'project'
        ? identification.projectType ??
          (sourceSoftware !== 'unknown' ? sourceSoftware : null)
        : null;

  return {
    ...asset,
    kind,
    sourcePath: asset.sourcePath ?? asset.caminho,
    sourceSoftware,
    projectType,
    detectedFormat,
    technicalType: asset.technicalType ?? identification.technicalType,
    targetSoftware,
    projectDirectory: asset.projectDirectory ?? identification.projectDirectory,
    structureMarkers: asset.structureMarkers ?? identification.structureMarkers,
    verificationStatus,
    identificationWarnings:
      asset.identificationWarnings ?? identification.warnings,
  };
}

/**
 * Projeta qualquer `DeckAsset` (novo ou migrado) para o contrato `AssetRegistration` (Etapa 07).
 */
export function toAssetRegistration(asset: DeckAsset): AssetRegistration {
  const migrated = migrateLegacyAssetRecord(asset);
  return {
    id: migrated.id,
    name: migrated.nome,
    kind: migrated.kind ?? 'asset',
    sourcePath: migrated.sourcePath ?? migrated.caminho,
    sourceSoftware: migrated.sourceSoftware ?? 'unknown',
    detectedFormat: migrated.detectedFormat ?? null,
    technicalType: migrated.technicalType ?? null,
    projectType: migrated.projectType ?? null,
    category: migrated.categoria || null,
    targetSoftware: migrated.targetSoftware ?? [],
    folderId: migrated.folder ?? null,
    projectId: migrated.projeto ?? null,
    projectDirectory: migrated.projectDirectory ?? null,
    structureMarkers: migrated.structureMarkers ?? [],
    verificationStatus: migrated.verificationStatus ?? 'not_verified',
    identificationWarnings: migrated.identificationWarnings ?? [],
  };
}

/**
 * ============================================================================
 * SMART TAGS & CLASSIFICATION 3.0 — Etapas 02, 05, 06, 09 e 10
 * ============================================================================
 */

/**
 * Cria ou recupera uma `EtiquetaDeAsset` com ID estável e normalização de nome
 * (impede duplicatas como "DOW" e "dow", preservando a apresentação desejada).
 */
export function createAssetTag(
  existingTags: readonly EtiquetaDeAsset[],
  input: CreateAssetTagInput | string,
  now: () => string = () => new Date().toISOString(),
  idFactory: () => string = () => generateId('atag'),
): EtiquetaDeAsset {
  const rawLabel = typeof input === 'string' ? input : input.label;
  const color = typeof input === 'string' ? undefined : input.color;
  const cleanLabel = rawLabel.trim().replace(/\s+/g, ' ');
  if (!cleanLabel) {
    throw new Error('Informe um nome para a etiqueta de asset.');
  }
  if (cleanLabel.length > 40) {
    throw new Error('A etiqueta de asset deve ter no máximo 40 caracteres.');
  }

  const normalized = normalizeTagLabel(cleanLabel);
  const existing = existingTags.find((tag) => tag.normalizedLabel === normalized);
  if (existing) {
    return existing;
  }

  return {
    id: idFactory(),
    kind: 'asset-tag',
    label: cleanLabel,
    normalizedLabel: normalized,
    color,
    createdAt: now(),
  };
}

/**
 * Garante que todas as etiquetas informadas existam no catálogo `EtiquetaDeAsset`,
 * sem duplicar variantes de caixa ("DOW" vs "dow").
 */
export function ensureAssetTagsCatalog(
  existingTags: readonly EtiquetaDeAsset[],
  labels: readonly string[],
  now: () => string = () => new Date().toISOString(),
  idFactory: () => string = () => generateId('atag'),
): {
  readonly nextAssetTags: EtiquetaDeAsset[];
  readonly catalog: EtiquetaDeAsset[];
  readonly resolvedTags: EtiquetaDeAsset[];
} {
  const nextAssetTags = [...existingTags];
  const resolvedTags: EtiquetaDeAsset[] = [];
  const seenInBatch = new Set<string>();

  for (const raw of labels) {
    const clean = raw.trim().replace(/\s+/g, ' ');
    if (!clean) continue;
    const norm = normalizeTagLabel(clean);
    if (!norm || seenInBatch.has(norm)) continue;
    seenInBatch.add(norm);

    let match = nextAssetTags.find((tag) => tag.normalizedLabel === norm);
    if (!match) {
      match = {
        id: idFactory(),
        kind: 'asset-tag',
        label: clean,
        normalizedLabel: norm,
        createdAt: now(),
      };
      nextAssetTags.push(match);
    }
    resolvedTags.push(match);
  }

  return { nextAssetTags, catalog: nextAssetTags, resolvedTags };
}

/**
 * Remove uma ou mais etiquetas de um conjunto de assets sem apagar as etiquetas do catálogo
 * e sem afetar a categoria ou pastas.
 */
export function removeAssetTagsFromAssets(
  assets: readonly DeckAsset[],
  assetTags: readonly EtiquetaDeAsset[],
  assetIds: readonly string[],
  labelsOrTagIds: readonly string[],
  now: () => string = () => new Date().toISOString(),
): DeckAsset[] {
  const targetAssetSet = new Set(assetIds);
  const normalizedTargets = new Set(labelsOrTagIds.map(normalizeTagLabel));
  const rawIdTargets = new Set(labelsOrTagIds);

  for (const tag of assetTags) {
    if (rawIdTargets.has(tag.id) || normalizedTargets.has(tag.normalizedLabel)) {
      rawIdTargets.add(tag.id);
      normalizedTargets.add(tag.normalizedLabel);
    }
  }

  const timestamp = now();
  return assets.map((asset) => {
    if (!targetAssetSet.has(asset.id) || asset.deleted) return asset;
    const nextLabels = (asset.tags ?? []).filter(
      (label) => !normalizedTargets.has(normalizeTagLabel(label)),
    );
    const nextIds = (asset.assetTagIds ?? []).filter((id) => !rawIdTargets.has(id));
    return {
      ...asset,
      tags: nextLabels,
      assetTagIds: nextIds,
      updatedAt: timestamp,
    };
  });
}

/**
 * Renomeia uma `EtiquetaDeAsset` existente preservando seu `id` e atualizando
 * os rótulos exibidos nos assets vinculados.
 */
export function renameAssetTagInCatalog(
  assets: readonly DeckAsset[],
  assetTags: readonly EtiquetaDeAsset[],
  tagId: string,
  newLabel: string,
  now: () => string = () => new Date().toISOString(),
): {
  readonly nextAssetTags: EtiquetaDeAsset[];
  readonly nextAssets: DeckAsset[];
  readonly updatedTag: EtiquetaDeAsset;
} {
  const clean = newLabel.trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('Informe o novo nome da etiqueta.');
  const normalized = normalizeTagLabel(clean);

  const target = assetTags.find((tag) => tag.id === tagId);
  if (!target) throw new Error('Etiqueta de asset não encontrada.');

  const duplicate = assetTags.find(
    (tag) => tag.id !== tagId && tag.normalizedLabel === normalized,
  );
  if (duplicate) {
    throw new Error(`Já existe uma etiqueta de asset chamada "${duplicate.label}".`);
  }

  const updatedTag: EtiquetaDeAsset = {
    ...target,
    label: clean,
    normalizedLabel: normalized,
  };

  const nextAssetTags = assetTags.map((tag) => (tag.id === tagId ? updatedTag : tag));
  const timestamp = now();
  const nextAssets = assets.map((asset) => {
    const hasId = (asset.assetTagIds ?? []).includes(tagId);
    const hasOldLabel = (asset.tags ?? []).some(
      (lbl) => normalizeTagLabel(lbl) === target.normalizedLabel,
    );
    if (!hasId && !hasOldLabel) return asset;

    const updatedLabels = (asset.tags ?? []).map((lbl) =>
      normalizeTagLabel(lbl) === target.normalizedLabel ? clean : lbl,
    );
    if (!updatedLabels.some((lbl) => normalizeTagLabel(lbl) === normalized)) {
      updatedLabels.push(clean);
    }
    const ensuredIds = hasId
      ? asset.assetTagIds ?? []
      : [...(asset.assetTagIds ?? []), tagId];

    return {
      ...asset,
      tags: updatedLabels,
      assetTagIds: ensuredIds,
      updatedAt: timestamp,
    };
  });

  return { nextAssetTags, nextAssets, updatedTag };
}

/**
 * Exclui uma `EtiquetaDeAsset` do catálogo e desfaz seus vínculos nos assets,
 * preservando integralmente os registros dos assets.
 */
export function deleteAssetTagFromCatalog(
  assets: readonly DeckAsset[],
  assetTags: readonly EtiquetaDeAsset[],
  tagId: string,
  now: () => string = () => new Date().toISOString(),
): {
  readonly nextAssetTags: EtiquetaDeAsset[];
  readonly nextAssets: DeckAsset[];
} {
  const target = assetTags.find((tag) => tag.id === tagId);
  if (!target) {
    return { nextAssetTags: [...assetTags], nextAssets: [...assets] };
  }

  const nextAssetTags = assetTags.filter((tag) => tag.id !== tagId);
  const timestamp = now();
  const nextAssets = assets.map((asset) => {
    const hasId = (asset.assetTagIds ?? []).includes(tagId);
    const hasLabel = (asset.tags ?? []).some(
      (lbl) => normalizeTagLabel(lbl) === target.normalizedLabel,
    );
    if (!hasId && !hasLabel) return asset;
    return {
      ...asset,
      tags: (asset.tags ?? []).filter(
        (lbl) => normalizeTagLabel(lbl) !== target.normalizedLabel,
      ),
      assetTagIds: (asset.assetTagIds ?? []).filter((id) => id !== tagId),
      updatedAt: timestamp,
    };
  });

  return { nextAssetTags, nextAssets };
}

/**
 * Etapa 04 e 06 — Atualiza a categoria de um asset preservando suas etiquetas,
 * pasta, projeto e demais metadados, sem transformar a categoria em etiqueta.
 */
export function updateAssetCategoryRecord(
  assets: readonly DeckAsset[],
  assetId: string,
  newCategory: string,
  now: () => string = () => new Date().toISOString(),
): DeckAsset[] {
  const clean = newCategory.trim();
  if (!clean) {
    throw new Error('A categoria do asset não pode ser vazia.');
  }
  const timestamp = now();
  return assets.map((asset) =>
    asset.id === assetId && !asset.deleted
      ? {
          ...asset,
          categoria: clean,
          updatedAt: timestamp,
        }
      : asset,
  );
}

/**
 * Etapa 02 — Calcula dinamicamente as "Etiquetas encontradas" nos assets dentro de uma pasta.
 * Nunca grava vínculos diretos na pasta (`folder.folderTagIds` permanece intocado).
 * Diferencia explicitamente `scope: 'direct'` (apenas filhos diretos) de `scope: 'recursive'` (inclui subpastas).
 */
export function getDiscoveredFolderTags(
  folderId: string | null,
  folders: readonly DeckFolder[],
  assets: readonly DeckAsset[],
  assetTags: readonly EtiquetaDeAsset[] = [],
  options:
    | { readonly scope?: 'direct' | 'recursive' }
    | 'direct'
    | 'recursive' = {},
): DiscoveredFolderTagsResult {
  const scope =
    typeof options === 'string' ? options : (options.scope ?? 'direct');
  const activeFolders = folders.filter((f) => !f.deleted);
  const includedFolderIds = new Set<string>();

  if (folderId !== null) {
    includedFolderIds.add(folderId);
    if (scope === 'recursive') {
      let changed = true;
      while (changed) {
        changed = false;
        for (const f of activeFolders) {
          if (f.parent && includedFolderIds.has(f.parent) && !includedFolderIds.has(f.id)) {
            includedFolderIds.add(f.id);
            changed = true;
          }
        }
      }
    }
  }

  const activeAssets = deduplicateAssets(assets).filter((a) => !a.deleted);
  const assetsInScope = activeAssets.filter((asset) => {
    if (folderId === null) {
      return scope === 'direct' ? asset.folder === null : true;
    }
    return asset.folder !== null && includedFolderIds.has(asset.folder);
  });

  const catalogByNormalized = new Map<string, EtiquetaDeAsset>();
  const catalogById = new Map<string, EtiquetaDeAsset>();
  for (const tag of assetTags) {
    catalogByNormalized.set(tag.normalizedLabel, tag);
    catalogById.set(tag.id, tag);
  }

  const bucket = new Map<
    string,
    {
      tagId: string;
      label: string;
      normalizedLabel: string;
      assetIds: Set<string>;
      directAssetIds: Set<string>;
      subfolderAssetIds: Set<string>;
    }
  >();

  for (const asset of assetsInScope) {
    const isDirect = asset.folder === folderId;
    const labelsOnAsset = new Map<string, { tagId: string; label: string }>();

    for (const id of asset.assetTagIds ?? []) {
      const cat = catalogById.get(id);
      if (cat) {
        labelsOnAsset.set(cat.normalizedLabel, { tagId: cat.id, label: cat.label });
      }
    }
    for (const rawLabel of asset.tags ?? []) {
      const clean = rawLabel.trim();
      if (!clean) continue;
      const norm = normalizeTagLabel(clean);
      if (!labelsOnAsset.has(norm)) {
        const cat = catalogByNormalized.get(norm);
        labelsOnAsset.set(norm, {
          tagId: cat?.id ?? `derived-${norm}`,
          label: cat?.label ?? clean,
        });
      }
    }

    for (const [norm, info] of labelsOnAsset.entries()) {
      let entry = bucket.get(norm);
      if (!entry) {
        entry = {
          tagId: info.tagId,
          label: info.label,
          normalizedLabel: norm,
          assetIds: new Set<string>(),
          directAssetIds: new Set<string>(),
          subfolderAssetIds: new Set<string>(),
        };
        bucket.set(norm, entry);
      }
      entry.assetIds.add(asset.id);
      if (isDirect) {
        entry.directAssetIds.add(asset.id);
      } else {
        entry.subfolderAssetIds.add(asset.id);
      }
    }
  }

  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
  const discoveredTags: DiscoveredFolderTagItem[] = Array.from(bucket.values())
    .map((entry) => ({
      tagId: entry.tagId,
      label: entry.label,
      normalizedLabel: entry.normalizedLabel,
      assetCount: entry.assetIds.size,
      directAssetCount: entry.directAssetIds.size,
      subfolderAssetCount: entry.subfolderAssetIds.size,
      assetIds: Array.from(entry.assetIds),
    }))
    .sort(
      (a, b) =>
        b.assetCount - a.assetCount || collator.compare(a.label, b.label),
    );

  return {
    folderId: folderId ?? '__root__',
    scope,
    includedFolderIds: Array.from(includedFolderIds),
    totalAssetsInScope: assetsInScope.length,
    discoveredTags,
  };
}

/**
 * Etapa 09 — Constrói índices relacionais determinísticos (`Tag`, `AssetTag`, `FolderTag`)
 * sem relações duplicadas.
 */
export function buildTagRelationshipIndex(params: {
  readonly folders: readonly DeckFolder[];
  readonly assets: readonly DeckAsset[];
  readonly folderTags: readonly EtiquetaDePasta[];
  readonly assetTags: readonly EtiquetaDeAsset[];
}): {
  readonly tags: readonly Tag[];
  readonly folderTagLinks: readonly FolderTag[];
  readonly assetTagLinks: readonly AssetTag[];
  readonly assetsByTagId: ReadonlyMap<string, readonly DeckAsset[]>;
  readonly foldersByTagId: ReadonlyMap<string, readonly DeckFolder[]>;
} {
  const tags: Tag[] = [];
  const validFolderTagIds = new Set<string>();
  const assetTagByNormalized = new Map<string, EtiquetaDeAsset>();
  const assetTagById = new Map<string, EtiquetaDeAsset>();

  for (const ft of params.folderTags) {
    validFolderTagIds.add(ft.id);
    tags.push({
      id: ft.id,
      name: ft.label,
      normalizedName: ft.normalizedLabel,
      color: ft.accent,
      kind: 'folder-tag',
    });
  }

  for (const at of params.assetTags) {
    assetTagByNormalized.set(at.normalizedLabel, at);
    assetTagById.set(at.id, at);
    tags.push({
      id: at.id,
      name: at.label,
      normalizedName: at.normalizedLabel,
      color: at.color,
      kind: 'asset-tag',
    });
  }

  const folderTagLinks: FolderTag[] = [];
  const foldersByTagId = new Map<string, DeckFolder[]>();
  const seenFolderPairs = new Set<string>();

  for (const folder of params.folders) {
    if (folder.deleted) continue;
    for (const tagId of folder.folderTagIds ?? []) {
      if (!validFolderTagIds.has(tagId)) continue;
      const key = `${folder.id}::${tagId}`;
      if (seenFolderPairs.has(key)) continue;
      seenFolderPairs.add(key);
      folderTagLinks.push({ folderId: folder.id, tagId });
      foldersByTagId.set(tagId, [...(foldersByTagId.get(tagId) ?? []), folder]);
    }
  }

  const assetTagLinks: AssetTag[] = [];
  const assetsByTagId = new Map<string, DeckAsset[]>();
  const seenAssetPairs = new Set<string>();

  for (const asset of deduplicateAssets(params.assets)) {
    if (asset.deleted) continue;
    const resolvedTagIds = new Set<string>();
    for (const id of asset.assetTagIds ?? []) {
      if (assetTagById.has(id)) resolvedTagIds.add(id);
    }
    for (const label of asset.tags ?? []) {
      const match = assetTagByNormalized.get(normalizeTagLabel(label));
      if (match) resolvedTagIds.add(match.id);
    }
    for (const tagId of resolvedTagIds) {
      const key = `${asset.id}::${tagId}`;
      if (seenAssetPairs.has(key)) continue;
      seenAssetPairs.add(key);
      assetTagLinks.push({ assetId: asset.id, tagId });
      assetsByTagId.set(tagId, [...(assetsByTagId.get(tagId) ?? []), asset]);
    }
  }

  return {
    tags,
    folderTagLinks,
    assetTagLinks,
    assetsByTagId,
    foldersByTagId,
  };
}

/**
 * Etapa 10 — Migra registros de etiquetas de assets e sincroniza `assetTags` e `assetTagIds`
 * sem converter etiquetas de pastas (`folderTags`) em etiquetas de assets.
 */
export function migrateWorkspaceTagState(state: {
  readonly folders: readonly DeckFolder[];
  readonly assets: readonly DeckAsset[];
  readonly folderTags?: readonly EtiquetaDePasta[];
  readonly assetTags?: readonly EtiquetaDeAsset[];
}): {
  readonly folders: DeckFolder[];
  readonly assets: DeckAsset[];
  readonly folderTags: EtiquetaDePasta[];
  readonly assetTags: EtiquetaDeAsset[];
} {
  const folderTags = [...(state.folderTags ?? [])];
  const catalog = [...(state.assetTags ?? [])];
  const byNorm = new Map<string, EtiquetaDeAsset>();
  const byId = new Map<string, EtiquetaDeAsset>();

  for (const tag of catalog) {
    byNorm.set(tag.normalizedLabel, tag);
    byId.set(tag.id, tag);
  }

  const migratedAssets = state.assets.map((raw) => {
    const base = migrateLegacyAssetRecord(raw);
    const nextLabels: string[] = [];
    const nextIds: string[] = [];
    const seenNorm = new Set<string>();

    for (const existingId of base.assetTagIds ?? []) {
      const tag = byId.get(existingId);
      if (tag && !seenNorm.has(tag.normalizedLabel)) {
        seenNorm.add(tag.normalizedLabel);
        nextLabels.push(tag.label);
        nextIds.push(tag.id);
      }
    }

    for (const rawLabel of base.tags ?? []) {
      const clean = rawLabel.trim().replace(/\s+/g, ' ');
      if (!clean) continue;
      const norm = normalizeTagLabel(clean);
      if (!norm || seenNorm.has(norm)) continue;
      seenNorm.add(norm);

      let tag = byNorm.get(norm);
      if (!tag) {
        tag = {
          id: `atag-${norm.replace(/[^a-z0-9]+/g, '-') || generateId('atag')}`,
          kind: 'asset-tag',
          label: clean,
          normalizedLabel: norm,
        };
        catalog.push(tag);
        byNorm.set(norm, tag);
        byId.set(tag.id, tag);
      }
      nextLabels.push(tag.label);
      nextIds.push(tag.id);
    }

    return {
      ...base,
      tags: nextLabels,
      assetTagIds: nextIds,
    };
  });

  return {
    folders: [...state.folders],
    assets: migratedAssets,
    folderTags,
    assetTags: catalog,
  };
}

/**
 * ============================================================================
 * ETAPA 11 — Organização virtual no Convés (Drag-and-Drop e "Mover para...")
 * ============================================================================
 */

export type DeckDragPayload =
  | { readonly kind: 'assets'; readonly assetIds: readonly string[] }
  | { readonly kind: 'folder'; readonly folderId: string };

export interface DropTargetValidation {
  readonly valid: boolean;
  readonly targetFolderId: string | null;
  readonly reason: string;
}

export function isFolderDescendantOrSelf(
  folders: readonly DeckFolder[],
  folderId: string,
  candidateTargetId: string | null,
): boolean {
  if (!candidateTargetId) return false;
  if (candidateTargetId === folderId) return true;

  const byId = new Map(folders.filter((f) => !f.deleted).map((f) => [f.id, f]));
  const visited = new Set<string>();
  let cursor: string | null = candidateTargetId;
  while (cursor && !visited.has(cursor)) {
    if (cursor === folderId) return true;
    visited.add(cursor);
    cursor = byId.get(cursor)?.parent ?? null;
  }
  return false;
}

export function validateDeckDropTarget(params: {
  readonly payload: DeckDragPayload | null;
  readonly targetType: 'folder' | 'root' | 'asset' | 'invalid';
  readonly targetId: string | null;
  readonly folders: readonly DeckFolder[];
  readonly assets: readonly DeckAsset[];
}): DropTargetValidation {
  if (!params.payload) {
    return {
      valid: false,
      targetFolderId: null,
      reason: 'Nenhum item em arraste.',
    };
  }

  if (params.targetType === 'asset' || params.targetType === 'invalid') {
    return {
      valid: false,
      targetFolderId: null,
      reason: 'Destino inválido: solte sobre uma pasta ativa ou na raiz do Convés.',
    };
  }

  const targetFolderId = params.targetType === 'root' ? null : params.targetId;
  const activeFolders = params.folders.filter((folder) => !folder.deleted);

  if (
    targetFolderId !== null &&
    !activeFolders.some((folder) => folder.id === targetFolderId)
  ) {
    return {
      valid: false,
      targetFolderId,
      reason: 'Pasta de destino inexistente ou na lixeira.',
    };
  }

  if (params.payload.kind === 'folder') {
    const folderId = params.payload.folderId;
    const folder = activeFolders.find((item) => item.id === folderId);
    if (!folder) {
      return {
        valid: false,
        targetFolderId,
        reason: 'Pasta de origem inativa.',
      };
    }
    if (isFolderDescendantOrSelf(activeFolders, folder.id, targetFolderId)) {
      return {
        valid: false,
        targetFolderId,
        reason:
          'Uma pasta não pode ser movida para dentro dela própria ou de suas subpastas.',
      };
    }
    if ((folder.parent ?? null) === targetFolderId) {
      return {
        valid: false,
        targetFolderId,
        reason: 'A pasta já está localizada neste destino.',
      };
    }
    const nameCollision = activeFolders.some(
      (other) =>
        other.id !== folder.id &&
        (other.parent ?? null) === targetFolderId &&
        normalizeTagLabel(other.name) === normalizeTagLabel(folder.name),
    );
    if (nameCollision) {
      return {
        valid: false,
        targetFolderId,
        reason: 'Já existe uma pasta com este nome no destino.',
      };
    }
    return {
      valid: true,
      targetFolderId,
      reason: 'Destino válido para mover pasta.',
    };
  }

  const draggedIdSet = new Set(params.payload.assetIds);
  const activeDragged = deduplicateAssets(params.assets).filter(
    (asset) => !asset.deleted && draggedIdSet.has(asset.id),
  );
  if (activeDragged.length === 0) {
    return {
      valid: false,
      targetFolderId,
      reason: 'Nenhum asset ativo selecionado.',
    };
  }

  if (activeDragged.every((asset) => (asset.folder ?? null) === targetFolderId)) {
    return {
      valid: false,
      targetFolderId,
      reason: 'O(s) asset(s) já se encontram nesta pasta.',
    };
  }

  const existingInTarget = new Set(
    deduplicateAssets(params.assets)
      .filter(
        (asset) =>
          !asset.deleted &&
          !draggedIdSet.has(asset.id) &&
          (asset.folder ?? null) === targetFolderId,
      )
      .map((asset) => normalizeTagLabel(asset.nome)),
  );

  for (const dragged of activeDragged) {
    if (existingInTarget.has(normalizeTagLabel(dragged.nome))) {
      return {
        valid: false,
        targetFolderId,
        reason: `Já existe um asset chamado "${dragged.nome}" na pasta de destino.`,
      };
    }
  }

  return {
    valid: true,
    targetFolderId,
    reason: `Mover ${activeDragged.length} asset(s) para este destino.`,
  };
}

export interface FolderTreeItem {
  readonly folder: DeckFolder;
  readonly depth: number;
  readonly pathLabel: string;
}

export function buildFolderTreeOrder(
  folders: readonly DeckFolder[],
): readonly FolderTreeItem[] {
  const active = folders.filter((folder) => !folder.deleted);
  const childrenMap = new Map<string | null, DeckFolder[]>();
  const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

  for (const folder of active) {
    const parentKey =
      folder.parent && active.some((f) => f.id === folder.parent)
        ? folder.parent
        : null;
    const list = childrenMap.get(parentKey) ?? [];
    list.push(folder);
    childrenMap.set(parentKey, list);
  }

  for (const list of childrenMap.values()) {
    list.sort((a, b) => collator.compare(a.name, b.name));
  }

  const ordered: FolderTreeItem[] = [];
  const visited = new Set<string>();

  const walk = (parentId: string | null, depth: number, prefix: readonly string[]) => {
    const siblings = childrenMap.get(parentId) ?? [];
    for (const folder of siblings) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      const nextPrefix = [...prefix, folder.name];
      ordered.push({
        folder,
        depth,
        pathLabel: nextPrefix.join(' / '),
      });
      walk(folder.id, depth + 1, nextPrefix);
    }
  };

  walk(null, 0, []);
  return ordered;
}

/**
 * Etapa 12 — Catálogo Global Único, Proteção de Sistema, Deduplicação e Gerenciamento.
 */
const RESERVED_SYSTEM_TAG_NAMES = new Set([
  'lixeira',
  'trash',
  'raiz',
  'root',
  'biblioteca',
  'todos os assets',
  'recentes',
  'favoritos',
  'sem etiqueta',
]);

export function isSystemReservedTag(labelOrId: string): boolean {
  const trimmed = String(labelOrId ?? '').trim();
  if (!trimmed) return false;
  if (/^(sys|nav|system)[-_]/i.test(trimmed)) return true;
  return RESERVED_SYSTEM_TAG_NAMES.has(normalizeTagLabel(trimmed));
}

export interface GlobalTagCatalogItem {
  readonly id: string;
  readonly label: string;
  readonly normalizedLabel: string;
  readonly color: string;
  readonly createdAt: string;
  readonly scope: 'asset' | 'folder' | 'both';
  readonly assetTagId: string | null;
  readonly folderTagId: string | null;
  readonly assetCount: number;
  readonly folderCount: number;
  readonly totalCount: number;
  readonly isSystemProtected: boolean;
}

export function buildGlobalTagCatalog(params: {
  readonly assets: readonly DeckAsset[];
  readonly folders: readonly DeckFolder[];
  readonly assetTags: readonly EtiquetaDeAsset[];
  readonly folderTags: readonly EtiquetaDePasta[];
}): readonly GlobalTagCatalogItem[] {
  const activeAssets = params.assets.filter((asset) => !asset.deleted);
  const activeFolders = params.folders.filter((folder) => !folder.deleted);

  const byNorm = new Map<
    string,
    {
      id: string;
      label: string;
      normalizedLabel: string;
      color: string;
      createdAt: string;
      assetTagId: string | null;
      folderTagId: string | null;
      assetIds: Set<string>;
      folderIds: Set<string>;
    }
  >();

  for (const tag of params.assetTags) {
    const norm = tag.normalizedLabel || normalizeTagLabel(tag.label);
    if (!norm || isSystemReservedTag(norm) || isSystemReservedTag(tag.id)) continue;
    if (!byNorm.has(norm)) {
      byNorm.set(norm, {
        id: tag.id,
        label: tag.label,
        normalizedLabel: norm,
        color: tag.color ?? 'cyan',
        createdAt: tag.createdAt ?? '',
        assetTagId: tag.id,
        folderTagId: null,
        assetIds: new Set<string>(),
        folderIds: new Set<string>(),
      });
    } else {
      const entry = byNorm.get(norm)!;
      if (!entry.assetTagId) entry.assetTagId = tag.id;
    }
  }

  for (const tag of params.folderTags) {
    const norm = tag.normalizedLabel || normalizeTagLabel(tag.label);
    if (!norm || isSystemReservedTag(norm) || isSystemReservedTag(tag.id)) continue;
    const existing = byNorm.get(norm);
    if (existing) {
      if (!existing.folderTagId) existing.folderTagId = tag.id;
      if (!existing.createdAt && tag.createdAt) existing.createdAt = tag.createdAt;
      if (existing.color === 'cyan' && (tag.color || tag.accent)) {
        existing.color = tag.color ?? tag.accent;
      }
    } else {
      byNorm.set(norm, {
        id: tag.id,
        label: tag.label,
        normalizedLabel: norm,
        color: tag.color ?? tag.accent ?? 'cyan',
        createdAt: tag.createdAt ?? '',
        assetTagId: null,
        folderTagId: tag.id,
        assetIds: new Set<string>(),
        folderIds: new Set<string>(),
      });
    }
  }

  for (const asset of activeAssets) {
    const assetNorms = new Set((asset.tags ?? []).map(normalizeTagLabel).filter(Boolean));
    const assetTagIdSet = new Set(asset.assetTagIds ?? []);
    for (const entry of byNorm.values()) {
      if (
        (entry.assetTagId && assetTagIdSet.has(entry.assetTagId)) ||
        assetNorms.has(entry.normalizedLabel)
      ) {
        entry.assetIds.add(asset.id);
      }
    }
  }

  for (const folder of activeFolders) {
    for (const fid of folder.folderTagIds ?? []) {
      for (const entry of byNorm.values()) {
        if (entry.folderTagId === fid) {
          entry.folderIds.add(folder.id);
        }
      }
    }
  }

  const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
  return Array.from(byNorm.values())
    .map<GlobalTagCatalogItem>((entry) => {
      const scope =
        entry.assetTagId && entry.folderTagId
          ? 'both'
          : entry.assetTagId
            ? 'asset'
            : 'folder';
      const assetCount = entry.assetIds.size;
      const folderCount = entry.folderIds.size;
      return {
        id: entry.id,
        label: entry.label,
        normalizedLabel: entry.normalizedLabel,
        color: entry.color,
        createdAt: entry.createdAt,
        scope,
        assetTagId: entry.assetTagId,
        folderTagId: entry.folderTagId,
        assetCount,
        folderCount,
        totalCount: assetCount + folderCount,
        isSystemProtected: isSystemReservedTag(entry.normalizedLabel) || isSystemReservedTag(entry.id),
      };
    })
    .sort((a, b) => collator.compare(a.label, b.label));
}

export function deduplicateWorkspaceTags(params: {
  readonly assets: readonly DeckAsset[];
  readonly folders: readonly DeckFolder[];
  readonly assetTags: readonly EtiquetaDeAsset[];
  readonly folderTags: readonly EtiquetaDePasta[];
  readonly now?: () => string;
}): {
  readonly nextAssetTags: EtiquetaDeAsset[];
  readonly nextFolderTags: EtiquetaDePasta[];
  readonly nextAssets: DeckAsset[];
  readonly nextFolders: DeckFolder[];
  readonly mergedAssetDuplicates: number;
  readonly mergedFolderDuplicates: number;
} {
  const nowFn = params.now ?? (() => new Date().toISOString());
  const timestamp = nowFn();

  const nextAssetTags: EtiquetaDeAsset[] = [];
  const assetByNorm = new Map<string, EtiquetaDeAsset>();
  const assetIdRemap = new Map<string, string>();
  let mergedAssetDuplicates = 0;

  for (const tag of params.assetTags) {
    const clean = tag.label.trim().replace(/\s+/g, ' ');
    const norm = normalizeTagLabel(tag.normalizedLabel || clean);
    if (!clean || !norm) continue;
    const existing = assetByNorm.get(norm);
    if (existing) {
      assetIdRemap.set(tag.id, existing.id);
      mergedAssetDuplicates++;
      continue;
    }
    const canonical: EtiquetaDeAsset = {
      ...tag,
      label: clean,
      normalizedLabel: norm,
      createdAt: tag.createdAt ?? timestamp,
    };
    assetByNorm.set(norm, canonical);
    assetIdRemap.set(tag.id, canonical.id);
    nextAssetTags.push(canonical);
  }

  const nextFolderTags: EtiquetaDePasta[] = [];
  const folderByNorm = new Map<string, EtiquetaDePasta>();
  const folderIdRemap = new Map<string, string>();
  let mergedFolderDuplicates = 0;

  for (const tag of params.folderTags) {
    const clean = tag.label.trim().replace(/\s+/g, ' ');
    const norm = normalizeTagLabel(tag.normalizedLabel || clean);
    if (!clean || !norm) continue;
    const existing = folderByNorm.get(norm);
    if (existing) {
      folderIdRemap.set(tag.id, existing.id);
      mergedFolderDuplicates++;
      continue;
    }
    const canonical: EtiquetaDePasta = {
      ...tag,
      label: clean,
      normalizedLabel: norm,
      color: tag.color ?? tag.accent ?? 'cyan',
      createdAt: tag.createdAt ?? timestamp,
    };
    folderByNorm.set(norm, canonical);
    folderIdRemap.set(tag.id, canonical.id);
    nextFolderTags.push(canonical);
  }

  const nextAssets = params.assets.map((asset) => {
    const mappedIds: string[] = [];
    const seenIds = new Set<string>();
    for (const id of asset.assetTagIds ?? []) {
      const resolved = assetIdRemap.get(id) ?? id;
      if (resolved && !seenIds.has(resolved)) {
        seenIds.add(resolved);
        mappedIds.push(resolved);
      }
    }
    const uniqueLabels: string[] = [];
    const seenNorms = new Set<string>();
    for (const raw of asset.tags ?? []) {
      const clean = raw.trim().replace(/\s+/g, ' ');
      const norm = normalizeTagLabel(clean);
      if (!clean || !norm || seenNorms.has(norm)) continue;
      seenNorms.add(norm);
      const match = assetByNorm.get(norm);
      uniqueLabels.push(match ? match.label : clean);
    }
    return {
      ...asset,
      tags: uniqueLabels,
      assetTagIds: mappedIds,
    };
  });

  const nextFolders = params.folders.map((folder) => {
    const mappedIds: string[] = [];
    const seenIds = new Set<string>();
    for (const id of folder.folderTagIds ?? []) {
      const resolved = folderIdRemap.get(id) ?? id;
      if (resolved && !seenIds.has(resolved)) {
        seenIds.add(resolved);
        mappedIds.push(resolved);
      }
    }
    return {
      ...folder,
      folderTagIds: mappedIds,
    };
  });

  return {
    nextAssetTags,
    nextFolderTags,
    nextAssets,
    nextFolders,
    mergedAssetDuplicates,
    mergedFolderDuplicates,
  };
}

export function renameGlobalTagInWorkspace(params: {
  readonly assets: readonly DeckAsset[];
  readonly folders: readonly DeckFolder[];
  readonly assetTags: readonly EtiquetaDeAsset[];
  readonly folderTags: readonly EtiquetaDePasta[];
  readonly tagId: string;
  readonly newLabel: string;
  readonly now?: () => string;
}): {
  readonly nextAssetTags: EtiquetaDeAsset[];
  readonly nextFolderTags: EtiquetaDePasta[];
  readonly nextAssets: DeckAsset[];
  readonly nextFolders: DeckFolder[];
  readonly updatedLabel: string;
} {
  const clean = params.newLabel.trim().replace(/\s+/g, ' ');
  if (!clean) {
    throw new Error('Informe o novo nome da etiqueta.');
  }
  const newNorm = normalizeTagLabel(clean);
  if (isSystemReservedTag(newNorm)) {
    throw new Error(`"${clean}" é um identificador reservado do sistema.`);
  }

  const targetAssetTag = params.assetTags.find((t) => t.id === params.tagId) ?? null;
  const targetFolderTag = params.folderTags.find((t) => t.id === params.tagId) ?? null;
  if (!targetAssetTag && !targetFolderTag) {
    throw new Error('Etiqueta não encontrada no catálogo.');
  }

  const targetNorm = (targetAssetTag ?? targetFolderTag)!.normalizedLabel;
  if (isSystemReservedTag(targetNorm) || isSystemReservedTag(params.tagId)) {
    throw new Error('Identificadores internos do sistema não podem ser renomeados.');
  }

  const conflictingAssetTag = params.assetTags.find(
    (t) => t.normalizedLabel === newNorm && t.normalizedLabel !== targetNorm,
  );
  const conflictingFolderTag = params.folderTags.find(
    (t) => t.normalizedLabel === newNorm && t.normalizedLabel !== targetNorm,
  );
  const conflict = conflictingAssetTag ?? conflictingFolderTag;
  if (conflict) {
    throw new Error(`Já existe uma etiqueta chamada "${conflict.label}".`);
  }

  let nextAssetTags = [...params.assetTags];
  let nextAssets = [...params.assets];
  const matchingAssetTag = params.assetTags.find((t) => t.normalizedLabel === targetNorm);
  if (matchingAssetTag) {
    const renamed = renameAssetTagInCatalog(
      nextAssets,
      nextAssetTags,
      matchingAssetTag.id,
      clean,
      params.now,
    );
    nextAssetTags = renamed.nextAssetTags;
    nextAssets = renamed.nextAssets;
  }

  const nextFolderTags = params.folderTags.map((t) =>
    t.normalizedLabel === targetNorm
      ? { ...t, label: clean, normalizedLabel: newNorm }
      : t,
  );

  return {
    nextAssetTags,
    nextFolderTags,
    nextAssets,
    nextFolders: [...params.folders],
    updatedLabel: clean,
  };
}

export function deleteGlobalTagFromWorkspace(params: {
  readonly assets: readonly DeckAsset[];
  readonly folders: readonly DeckFolder[];
  readonly assetTags: readonly EtiquetaDeAsset[];
  readonly folderTags: readonly EtiquetaDePasta[];
  readonly tagId: string;
  readonly now?: () => string;
}): {
  readonly nextAssetTags: EtiquetaDeAsset[];
  readonly nextFolderTags: EtiquetaDePasta[];
  readonly nextAssets: DeckAsset[];
  readonly nextFolders: DeckFolder[];
  readonly removedLabel: string | null;
  readonly unlinkedAssets: number;
  readonly unlinkedFolders: number;
} {
  if (isSystemReservedTag(params.tagId)) {
    throw new Error('Identificadores internos do sistema não podem ser excluídos.');
  }

  const targetAssetTag = params.assetTags.find((t) => t.id === params.tagId) ?? null;
  const targetFolderTag = params.folderTags.find((t) => t.id === params.tagId) ?? null;
  const target = targetAssetTag ?? targetFolderTag;
  if (!target) {
    return {
      nextAssetTags: [...params.assetTags],
      nextFolderTags: [...params.folderTags],
      nextAssets: [...params.assets],
      nextFolders: [...params.folders],
      removedLabel: null,
      unlinkedAssets: 0,
      unlinkedFolders: 0,
    };
  }

  const targetNorm = target.normalizedLabel || normalizeTagLabel(target.label);
  if (isSystemReservedTag(targetNorm)) {
    throw new Error('Identificadores internos do sistema não podem ser excluídos.');
  }

  let nextAssetTags = [...params.assetTags];
  let nextAssets = [...params.assets];
  let unlinkedAssets = 0;

  const matchingAssetTag = params.assetTags.find(
    (t) => t.id === params.tagId || t.normalizedLabel === targetNorm,
  );
  if (matchingAssetTag) {
    unlinkedAssets = nextAssets.filter(
      (a) =>
        !a.deleted &&
        ((a.assetTagIds ?? []).includes(matchingAssetTag.id) ||
          (a.tags ?? []).some((lbl) => normalizeTagLabel(lbl) === targetNorm)),
    ).length;
    const deleted = deleteAssetTagFromCatalog(
      nextAssets,
      nextAssetTags,
      matchingAssetTag.id,
      params.now,
    );
    nextAssetTags = deleted.nextAssetTags;
    nextAssets = deleted.nextAssets;
  }

  const matchingFolderTagIds = new Set(
    params.folderTags
      .filter((t) => t.id === params.tagId || t.normalizedLabel === targetNorm)
      .map((t) => t.id),
  );
  let unlinkedFolders = 0;
  const nextFolderTags = params.folderTags.filter((t) => !matchingFolderTagIds.has(t.id));
  const nextFolders = params.folders.map((folder) => {
    const ids = folder.folderTagIds ?? [];
    if (!ids.some((id) => matchingFolderTagIds.has(id))) return folder;
    if (!folder.deleted) unlinkedFolders++;
    return {
      ...folder,
      folderTagIds: ids.filter((id) => !matchingFolderTagIds.has(id)),
    };
  });

  return {
    nextAssetTags,
    nextFolderTags,
    nextAssets,
    nextFolders,
    removedLabel: target.label,
    unlinkedAssets,
    unlinkedFolders,
  };
}

/**
 * Etapa 19 — Formatação limpa de caminhos para interface e posicionamento de menus.
 * Remove apenas prefixos internos do Windows (`\\?\`, `//?/`, `/?/`) na exibição,
 * preservando integralmente o caminho interno original nas operações de disco.
 */
export function formatDisplayPath(rawPath: string): string {
  const value = String(rawPath ?? '').trim();
  if (!value) return '';
  if (/^\\\\\?\\UNC\\/i.test(value)) {
    return `\\\\${value.slice(8)}`;
  }
  if (/^\/\/\?\/UNC\//i.test(value)) {
    return `//${value.slice(8)}`;
  }
  return value
    .replace(/^\\\\\?\\/, '')
    .replace(/^\/\/\?\//, '')
    .replace(/^\/\?\//, '');
}

export function sanitizeTechnicalMetadataText(text: string): string {
  const value = String(text ?? '');
  if (!value) return '';
  return value
    .replace(/\\\\\?\\UNC\\/gi, '\\\\')
    .replace(/\/\/\?\/UNC\//gi, '//')
    .replace(/\\\\\?\\/g, '')
    .replace(/\/\/\?\//g, '')
    .replace(/\/\?\//g, '');
}

export function clampContextMenuPosition(params: {
  readonly x: number;
  readonly y: number;
  readonly menuWidth: number;
  readonly menuHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly margin?: number;
}): { readonly left: number; readonly top: number } {
  const margin = params.margin ?? 8;
  const maxLeft = Math.max(margin, params.viewportWidth - params.menuWidth - margin);
  const maxTop = Math.max(margin, params.viewportHeight - params.menuHeight - margin);
  return {
    left: Math.min(Math.max(margin, params.x), maxLeft),
    top: Math.min(Math.max(margin, params.y), maxTop),
  };
}

