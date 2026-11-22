import { applySmartDragFocus, createDragTargetCache, setSmartDragImage } from '../../services/smartDragFocus';
import { AssetVaultPanel } from '../common/AssetVaultPanel';
import { DeckExportModal } from './DeckExportModal';
import { AssetIcon } from '../common/AssetIcon';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { NautiaContext } from '../../services/nautiaToolSystem';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  buildAssetClassificationProfile,
} from '../../services/assetClassificationService';
import {
  buildGlobalTagCatalog,
  DeckAsset,
  DeckDragPayload,
  DeckFolder,
  DEFAULT_UNIVERSAL_FILTERS,
  EtiquetaDeAsset,
  EtiquetaDePasta,
  FolderTagIconId,
  formatDisplayPath,
  getDiscoveredFolderTags,
  INDIVIDUAL_ASSET_CATEGORIES,
  migrateLegacyAssetRecord,
  normalizeTagLabel,
  ORIGIN_SOFTWARE_LABELS,
  OrganizationFilterState,
  REGISTRATION_KIND_LABELS,
  sanitizeTechnicalMetadataText,
  validateDeckDropTarget,
  VERIFICATION_STATUS_LABELS,
} from '../../services/deckFilterService';
import { StructuredInferenceReport } from '../../services/inferenceService';
import { analysisContextKey } from '../../services/inferenceService';
import { RULESET_VERSION } from '../../services/technicalRules';
import { LibraryOperationsService } from '../../services/libraryOperationsService';
import {
  executeApprovedActionPlan,
  NautiaActionPlan as ActionPlanModel,
  orchestrateQuickAction,
} from '../../services/nautiaOrchestratorService';
import { QuickActionScopePayload } from '../../services/nautiaQuickActionsService';
import {
  OperationHistoryEntry,
  OperationHistoryService,
} from '../../services/operationHistoryService';
import { useDeckFilters } from '../../state/useDeckFilters';
import { CustomIcon } from '../common/CustomIcon';
import { AssetViewer } from '../common/AssetViewer';
import { NautiaActionPlan } from '../nautia/NautiaActionPlan';
import { NautiaDiagnosticsPanel } from '../nautia/NautiaDiagnosticsPanel';
import { NautiaHistoryPanel } from '../nautia/NautiaHistoryPanel';
import { CreateFolderModal } from './CreateFolderModal';
import { ContextMenuSection, ExplorerContextMenu } from './ExplorerContextMenu';
import { MoveToFolderModal } from './MoveToFolderModal';
import { TagManagerModal } from './TagManagerModal';
import { FolderTagFilterBar } from './FolderTagFilterBar';
import { FolderTagIconGlyph, resolveCategoryIcon } from './FolderTagIconGlyph';
import { NautiaQuickActions } from './NautiaQuickActions';
import { TagPicker, TagPickerOption } from './TagPicker';
import { UniversalFiltersPanel } from './UniversalFiltersPanel';
import './deckFilters.css';

const COLLECTIONS: readonly { name: string; icon: FolderTagIconId }[] = [
  { name: 'Biblioteca', icon: 'cube' },
  { name: 'Todos os Assets', icon: 'layers' },
  { name: 'Recentes', icon: 'compass' },
  { name: 'Sem etiqueta', icon: 'tag' },
];

export interface DeckFilteredViewProps {
  readonly folders: readonly DeckFolder[];
  readonly assets: readonly DeckAsset[];
  readonly folderTags: readonly EtiquetaDePasta[];
  readonly assetTags?: readonly EtiquetaDeAsset[];
  readonly selectedAssetIds?: readonly string[];
  readonly onSelectedAssetIdsChange?: (ids: string[]) => void;
  readonly onFolderTagsChange: (nextTags: EtiquetaDePasta[]) => void;
  readonly onFoldersChange: (nextFolders: DeckFolder[]) => void;
  readonly onAssetsChange?: (nextAssets: DeckAsset[]) => void;
  readonly operations?: LibraryOperationsService;
  readonly history?: OperationHistoryService;
  readonly historyEntries?: readonly OperationHistoryEntry[];
  readonly onLibraryMutated?: () => void;
  readonly onNotify?: (message: string) => void;
  readonly onFolderNavigate?: (id: string | null) => void;
  readonly onContextChange?: (context: Pick<NautiaContext, 'folderId' | 'filters' | 'collection' | 'folderFilters'>) => void;
  readonly onOpenRegister?: () => void;
  readonly onOpenNautia?: () => void;
  readonly onInspectAsset?: (asset: DeckAsset) => void;
  readonly onTrashItem?: (ref: { type: 'folder' | 'asset'; id: string }) => void;
  readonly onRenameFolder?: (folder: DeckFolder) => void;
}

interface ActiveFilterChip {
  readonly id: string;
  readonly label: string;
  readonly onRemove: () => void;
}

const ORGANIZATION_LABELS: Readonly<Record<OrganizationFilterState, string>> = {
  all: 'Todos',
  'in-folder': 'Em pasta',
  root: 'Na raiz',
  tagged: 'Com etiquetas',
  untagged: 'Sem etiquetas',
};

function formatRecordDate(iso?: string): string {
  if (!iso) return 'Recente';
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Recente';
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Recente';
  }
}

/**
 * Visão do Convés Inteligente — Explorador em 3 Colunas (Sprint_conves.png):
 * - Esquerda (.studio-rail): Biblioteca, Todos os Assets, Recentes, Favoritos, Sem etiqueta, Pastas, Etiquetas e Lixeira.
 * - Centro (.studio-browser): Breadcrumbs + Alternância Lista/Grade, Pesquisa + Filtros, superfície unificada de Pastas e Assets.
 * - Direita (.studio-inspector): Inspetor da seleção com prévia, metadados e card contextual da Nautia.
 */
export const DeckFilteredView: React.FC<DeckFilteredViewProps> = ({
  folders,
  assets,
  folderTags,
  assetTags = [],
  selectedAssetIds: controlledSelectedIds,
  onSelectedAssetIdsChange,
  onFolderTagsChange,
  onFoldersChange,
  onAssetsChange,
  operations,
  history,
  historyEntries = [],
  onLibraryMutated,
  onNotify,
  onFolderNavigate,
  onContextChange,
  onOpenRegister,
  onOpenNautia,
  onInspectAsset,
  onTrashItem,
  onRenameFolder,
}) => {
  const [scope, setScope] = useState('Biblioteca');
  const [expandedFolders, setExpandedFolders] = useState<ReadonlySet<string>>(new Set());
  const [sortOrder, setSortOrder] = useState('name');
  const [page, setPage] = useState(0);
  const pageSize = 100;
  const [focusedFolderId, setFocusedFolderId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [editingFolderTags, setEditingFolderTags] = useState(false);
  const [showFullPath, setShowFullPath] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<
    string | null | undefined
  >(undefined);
  const [contextMenuState, setContextMenuState] = useState<{
    readonly x: number;
    readonly y: number;
    readonly title: string;
    readonly sections: readonly ContextMenuSection[];
  } | null>(null);
  const [renamingAsset, setRenamingAsset] = useState<DeckAsset | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [batchTagsModalIds, setBatchTagsModalIds] = useState<
    readonly string[] | null
  >(null);
  const [batchTagsDraft, setBatchTagsDraft] = useState<string[]>([]);
  const [folderTagsModalId, setFolderTagsModalId] = useState<string | null>(
    null,
  );
  const [folderTagsDraft, setFolderTagsDraft] = useState<string[]>([]);
  const [exportModalState, setExportModalState] = useState<{
    readonly asset: DeckAsset;
    readonly mode: 'original' | 'convert';
  } | null>(null);
  const [vaultSectionExpanded, setVaultSectionExpanded] = useState(false);
  const [batchTrashIds, setBatchTrashIds] = useState<readonly string[] | null>(
    null,
  );
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [pendingPlan, setPendingPlan] = useState<ActionPlanModel | null>(null);
  const [diagnosticReports, setDiagnosticReports] = useState<
    readonly StructuredInferenceReport[]
  >([]);
  const [showHistory, setShowHistory] = useState(false);
  const [discoveredTagScope, setDiscoveredTagScope] = useState<'direct' | 'recursive'>('direct');
  const [moveModalPayload, setMoveModalPayload] = useState<DeckDragPayload | null>(null);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [dragPayload, setDragPayload] = useState<DeckDragPayload | null>(null);
  const [dropHover, setDropHover] = useState<{
    key: string;
    valid: boolean;
    reason: string;
  } | null>(null);
  const dragCancelledRef = useRef(false);

  const globalTagCatalog = useMemo(
    () =>
      buildGlobalTagCatalog({
        assets,
        folders,
        assetTags,
        folderTags,
      }),
    [assets, folders, assetTags, folderTags],
  );

  const inspectorTagOptions = useMemo<readonly TagPickerOption[]>(
    () =>
      globalTagCatalog.map((tag) => ({
        id: tag.id,
        label: tag.label,
        icon: 'tag',
        color: tag.color ?? 'cyan',
      })),
    [globalTagCatalog],
  );

  const {
    state,
    visibleTagIcons,
    folderCountByTag,
    filterResult: matches,
    selectedAssets: internalSelectedAssets,
    universalOptions,
    setCurrentParent: changeParent,
    toggleTagFilter,
    toggleAssetSelection: internalToggleAsset,
    selectAllVisibleAssets: internalSelectAll,
    clearAssetSelection: internalClearSelection,
    setTagSearchQuery,
    setTagMatchMode,
    updateUniversalFilters,
    clearAllFilters,
    createAndOptionallyApplyTag,
    createFolder,
    toggleTagOnFolder,
  } = useDeckFilters({
    allFolders: scope !== 'Biblioteca',
    folders,
    assets,
    folderTags,
    onFolderTagsChange,
    onFoldersChange,
    onAssetsChange,
  });
  useEffect(() => {
    onContextChange?.({ folderId: state.currentParentId, filters: state.universalFilters, collection: scope, folderFilters: { selectedTagIds: state.selectedTagIds, tagSearchQuery: state.tagSearchQuery, tagMatchMode: state.tagMatchMode } });
  }, [state.currentParentId, state.universalFilters, state.selectedTagIds, state.tagSearchQuery, state.tagMatchMode, scope, onContextChange]);

  const filterResult = useMemo(() => {
    const name = state.universalFilters.nameQuery.trim().toLocaleLowerCase();
    const visibleFolders =
      scope === 'Biblioteca'
        ? matches.visibleFolders.filter((folder) =>
            folder.name.toLocaleLowerCase().includes(name),
          )
        : [];
    const visibleAssets =
      scope === 'Recentes'
        ? matches.visibleAssets
            .filter((asset) => asset.createdAt)
            .sort((a, b) => b.createdAt!.localeCompare(a.createdAt!))
        : matches.visibleAssets;
    const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
    const sortedAssets = [...visibleAssets].sort((a, b) => sortOrder === 'recent' || scope === 'Recentes'
      ? (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? '') || collator.compare(a.nome, b.nome)
      : sortOrder === 'format' ? collator.compare(a.formato, b.formato) || collator.compare(a.nome, b.nome)
      : collator.compare(a.nome, b.nome) * (sortOrder === 'name-desc' ? -1 : 1));
    return { ...matches, visibleFolders: [...visibleFolders].sort((a, b) => collator.compare(a.name, b.name)), visibleAssets: sortedAssets };
  }, [matches, scope, sortOrder, state.universalFilters.nameQuery]);
  const pageCount = Math.max(1, Math.ceil((filterResult.visibleFolders.length + filterResult.visibleAssets.length) / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * pageSize;
  const pageFolders = filterResult.visibleFolders.slice(pageStart, pageStart + pageSize);
  const pageAssets = filterResult.visibleAssets.slice(Math.max(0, pageStart - filterResult.visibleFolders.length), Math.max(0, pageStart + pageSize - filterResult.visibleFolders.length));

  const editRecord = (asset: DeckAsset, field: 'nome' | 'projeto', value: string) => {
    if (!operations || value === (asset[field] ?? '')) return;
    const result = operations.updateAssetRecord(asset.id, { [field]: value });
    history?.record({ actionType: result.operation, source: 'quick-action', summary: 'Editar registro', affectedResources: result.affectedResources, status: result.ok ? 'executed' : 'failed', resultSummary: result.summary });
    onNotify?.(result.summary);
    if (result.ok) onLibraryMutated?.();
  };
  const locateOriginal = async (asset: DeckAsset) => {
    if (!isTauri()) { onNotify?.('Localizar no disco exige o aplicativo desktop.'); return; }
    try { onNotify?.(await invoke<string>('localizar_recurso', { path: asset.caminho })); }
    catch (error) { onNotify?.(`Recurso indisponível: ${String(error)}`); }
  };

  const setCurrentParent = (id: string | null) => {
    setPage(0);
    setScope('Biblioteca');
    changeParent(id);
    setFocusedFolderId(id);
    setSelectedFolderId(id);
    onFolderNavigate?.(id);
  };

  const browse = (name: string) => {
    clearAllFilters();
    changeParent(null);
    setFocusedFolderId(null);
    setSelectedFolderId(null);
    onFolderNavigate?.(null);
    setScope(name);
    if (name === 'Sem etiqueta') {
      updateUniversalFilters({ organizationState: 'untagged' });
    }
  };

  const activeSelectedIds = controlledSelectedIds ?? state.selectedAssetIds;

  const selectedAssets = useMemo(() => {
    if (!controlledSelectedIds) return internalSelectedAssets;
    const set = new Set(controlledSelectedIds);
    return assets.filter((asset) => !asset.deleted && set.has(asset.id));
  }, [controlledSelectedIds, internalSelectedAssets, assets]);

  useEffect(() => {
    if (activeSelectedIds.length > 0) {
      setSelectedFolderId(null);
      setEditingFolderTags(false);
    }
  }, [activeSelectedIds.length]);

  const selectSingleAsset = (assetId: string) => {
    setSelectedFolderId(null);
    if (onSelectedAssetIdsChange) {
      onSelectedAssetIdsChange([assetId]);
      return;
    }
    internalClearSelection();
    if (!activeSelectedIds.includes(assetId)) {
      internalToggleAsset(assetId);
    }
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedFolderId(null);
    if (onSelectedAssetIdsChange) {
      const exists = activeSelectedIds.includes(assetId);
      onSelectedAssetIdsChange(
        exists
          ? activeSelectedIds.filter((id) => id !== assetId)
          : [...activeSelectedIds, assetId],
      );
      return;
    }
    internalToggleAsset(assetId);
  };

  const selectAllVisibleAssets = () => {
    setSelectedFolderId(null);
    if (onSelectedAssetIdsChange) {
      onSelectedAssetIdsChange(filterResult.visibleAssets.map((a) => a.id));
      return;
    }
    internalSelectAll();
  };

  const clearAssetSelection = () => {
    setSelectedFolderId(null);
    setEditingFolderTags(false);
    if (!state.currentParentId) {
      setFocusedFolderId(null);
    }
    if (onSelectedAssetIdsChange) {
      onSelectedAssetIdsChange([]);
      return;
    }
    internalClearSelection();
  };

  const tagById = useMemo(
    () => new Map(folderTags.map((tag) => [tag.id, tag])),
    [folderTags],
  );

  const folderById = useMemo(
    () => new Map(folders.filter((f) => !f.deleted).map((f) => [f.id, f])),
    [folders],
  );

  const executeMovePayload = (
    payload: DeckDragPayload,
    targetFolderId: string | null,
  ): boolean => {
    const validation = validateDeckDropTarget({
      payload,
      targetType: targetFolderId === null ? 'root' : 'folder',
      targetId: targetFolderId,
      folders,
      assets,
    });
    if (!validation.valid) {
      onNotify?.(validation.reason);
      return false;
    }

    const targetLabel = targetFolderId
      ? (folderById.get(targetFolderId)?.name ?? 'Pasta selecionada')
      : 'Convés / Raiz';

    if (payload.kind === 'folder') {
      if (operations) {
        try {
          const result = operations.moveFolder(payload.folderId, targetFolderId);
          history?.record({
            actionType: result.operation,
            source: 'quick-action',
            summary: `Mover pasta para ${targetLabel}`,
            affectedResources: result.affectedResources,
            status: result.ok ? 'executed' : 'failed',
            resultSummary: result.summary,
            undoSteps: result.undo ? [result.undo] : [],
          });
          onNotify?.(result.summary);
          if (result.ok) {
            setContextMenuState(null);
            onLibraryMutated?.();
          }
          return result.ok;
        } catch (error) {
          onNotify?.(
            `Não foi possível mover a pasta: ${error instanceof Error ? error.message : String(error)}`,
          );
          return false;
        }
      }
      if (onFoldersChange) {
        const next = folders.map((item) =>
          item.id === payload.folderId
            ? { ...item, parent: targetFolderId }
            : item,
        );
        onFoldersChange(next);
        onNotify?.(`Pasta movida para ${targetLabel}.`);
        return true;
      }
      return false;
    }

    const uniqueIds = Array.from(new Set(payload.assetIds));
    if (operations) {
      try {
        const result = operations.organizeRecords({
          assetIds: uniqueIds,
          targetFolderId,
        });
        history?.record({
          actionType: result.operation,
          source: 'quick-action',
          summary:
            uniqueIds.length === 1
              ? `Mover asset para ${targetLabel}`
              : `Mover ${uniqueIds.length} assets para ${targetLabel}`,
          affectedResources: result.affectedResources,
          status: result.ok ? 'executed' : 'failed',
          resultSummary: result.summary,
          undoSteps: result.undo ? [result.undo] : [],
        });
        onNotify?.(result.summary);
        if (result.ok) {
          setContextMenuState(null);
          onLibraryMutated?.();
        }
        return result.ok;
      } catch (error) {
        onNotify?.(
          `Não foi possível concluir a movimentação: ${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
      }
    }

    if (onAssetsChange) {
      const targetSet = new Set(uniqueIds);
      const next = assets.map((item) =>
        targetSet.has(item.id) ? { ...item, folder: targetFolderId } : item,
      );
      onAssetsChange(next);
      onNotify?.(
        `${uniqueIds.length} asset(s) movido(s) para ${targetLabel} mantendo etiquetas e metadados.`,
      );
      return true;
    }

    return false;
  };

  useEffect(() => {
    if (!dragPayload || typeof window === 'undefined') return;
    const handleEscapeCancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dragCancelledRef.current = true;
        setDragPayload(null);
        setDropHover(null);
        onNotify?.('Movimentação por arrasto cancelada.');
      }
    };
    window.addEventListener('keydown', handleEscapeCancel);
    return () => window.removeEventListener('keydown', handleEscapeCancel);
  }, [dragPayload, onNotify]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOpenMoveModal = (event: Event) => {
      const detail = (
        event as CustomEvent<{ type: 'folder' | 'asset'; id: string } | undefined>
      ).detail;
      if (!detail) return;
      setContextMenuState(null);
      if (detail.type === 'folder') {
        setMoveModalPayload({ kind: 'folder', folderId: detail.id });
      } else {
        const useMulti =
          activeSelectedIds.includes(detail.id) && activeSelectedIds.length > 1;
        setMoveModalPayload({
          kind: 'assets',
          assetIds: useMulti ? [...activeSelectedIds] : [detail.id],
        });
      }
    };
    window.addEventListener('rocketbox:open-move-modal', handleOpenMoveModal);
    return () =>
      window.removeEventListener('rocketbox:open-move-modal', handleOpenMoveModal);
  }, [activeSelectedIds]);

  const openMoveModalForAsset = (assetId: string) => {
    const useMulti =
      activeSelectedIds.includes(assetId) && activeSelectedIds.length > 1;
    setContextMenuState(null);
    setMoveModalPayload({
      kind: 'assets',
      assetIds: useMulti ? [...activeSelectedIds] : [assetId],
    });
  };

  const openMoveModalForFolder = (folderId: string) => {
    setContextMenuState(null);
    setMoveModalPayload({ kind: 'folder', folderId });
  };

  const copyAssetPath = async (asset: DeckAsset) => {
    const clean = formatDisplayPath(asset.caminho);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(clean);
        onNotify?.(`Caminho copiado: ${clean}`);
        return;
      }
    } catch {
      // Fallback via notificação caso área de transferência esteja indisponível.
    }
    onNotify?.(`Caminho: ${clean}`);
  };

  const buildFolderMenuSections = (
    folder: DeckFolder,
  ): readonly ContextMenuSection[] => [
    {
      id: 'folder-open',
      items: [
        {
          id: 'folder-open-item',
          label: 'Abrir',
          icon: 'open',
          onSelect: () => handleOpenFolder(folder.id),
        },
      ],
    },
    {
      id: 'folder-manage',
      items: [
        {
          id: 'folder-move',
          label: 'Mover para...',
          icon: 'folder',
          onSelect: () => openMoveModalForFolder(folder.id),
        },
        ...(onRenameFolder
          ? [
              {
                id: 'folder-rename',
                label: 'Renomear',
                icon: 'edit' as const,
                onSelect: () => onRenameFolder(folder),
              },
            ]
          : []),
        {
          id: 'folder-tags',
          label: 'Gerenciar etiquetas',
          icon: 'tag',
          onSelect: () => {
            setSelectedFolderId(folder.id);
            setFocusedFolderId(folder.id);
            const currentLabels = (folder.folderTagIds ?? [])
              .map((tid) => tagById.get(tid)?.label)
              .filter((lbl): lbl is string => Boolean(lbl));
            setFolderTagsDraft(currentLabels);
            setFolderTagsModalId(folder.id);
            if (onSelectedAssetIdsChange) {
              onSelectedAssetIdsChange([]);
            } else {
              internalClearSelection();
            }
          },
        },
        {
          id: 'folder-subfolder',
          label: 'Criar subpasta',
          icon: 'plus',
          onSelect: () => {
            setCreateFolderParentId(folder.id);
            setIsFolderModalOpen(true);
          },
        },
      ],
    },
    ...(onTrashItem || operations
      ? [
          {
            id: 'folder-danger',
            items: [
              {
                id: 'folder-trash',
                label: 'Mover para a lixeira',
                icon: 'trash' as const,
                danger: true,
                onSelect: () => {
                  if (onTrashItem) {
                    onTrashItem({ type: 'folder', id: folder.id });
                  } else if (operations) {
                    const res = operations.moveToTrash([
                      { type: 'folder', id: folder.id },
                    ]);
                    onNotify?.(res.summary);
                    if (res.ok) onLibraryMutated?.();
                  }
                },
              },
            ],
          },
        ]
      : []),
  ];

  const buildSingleAssetMenuSections = (
    asset: DeckAsset,
  ): readonly ContextMenuSection[] => [
    {
      id: 'asset-inspect',
      items: [
        ...(onInspectAsset
          ? [
              {
                id: 'asset-open-inspector',
                label: 'Abrir no Asset Inspector',
                icon: 'open' as const,
                onSelect: () => onInspectAsset(asset),
              },
            ]
          : []),
        ...(isTauri()
          ? [
              {
                id: 'asset-locate',
                label: 'Localizar original',
                icon: 'locate' as const,
                onSelect: () => void locateOriginal(asset),
              },
            ]
          : []),
        {
          id: 'asset-copy-path',
          label: 'Copiar caminho',
          icon: 'copy',
          onSelect: () => void copyAssetPath(asset),
        },
      ],
    },
    {
      id: 'asset-organize',
      items: [
        {
          id: 'asset-move',
          label: 'Mover para...',
          icon: 'folder',
          onSelect: () => openMoveModalForAsset(asset.id),
        },
        {
          id: 'asset-rename',
          label: 'Renomear registro',
          icon: 'edit',
          onSelect: () => {
            setRenamingAsset(asset);
            setRenameDraft(asset.nome);
          },
        },
        {
          id: 'asset-tags',
          label: 'Gerenciar etiquetas',
          icon: 'tag',
          onSelect: () => {
            setBatchTagsModalIds([asset.id]);
            setBatchTagsDraft([...asset.tags]);
          },
        },
      ],
    },
    ...(isTauri()
      ? [
          {
            id: 'asset-vault',
            items: [
              {
                id: 'asset-export',
                label: 'Exportar original...',
                icon: 'download' as const,
                onSelect: () => {
                  selectSingleAsset(asset.id);
                  setExportModalState({ asset, mode: 'original' });
                },
              },
              {
                id: 'asset-export-as',
                label: 'Exportar como...',
                icon: 'download' as const,
                onSelect: () => {
                  selectSingleAsset(asset.id);
                  setExportModalState({ asset, mode: 'convert' });
                },
              },
              {
                id: 'asset-backup',
                label: 'Criar backup...',
                icon: 'backup' as const,
                onSelect: () => {
                  selectSingleAsset(asset.id);
                  setVaultSectionExpanded(true);
                  if (typeof window !== 'undefined') {
                    window.setTimeout(() => {
                      window.dispatchEvent(
                        new CustomEvent('rocketbox:vault-action', {
                          detail: { assetId: asset.id, action: 'backup' },
                        }),
                      );
                    }, 40);
                  }
                },
              },
            ],
          },
        ]
      : []),
    ...(onTrashItem || operations
      ? [
          {
            id: 'asset-danger',
            items: [
              {
                id: 'asset-trash',
                label: 'Mover para a lixeira',
                icon: 'trash' as const,
                danger: true,
                onSelect: () => {
                  if (onTrashItem) {
                    onTrashItem({ type: 'asset', id: asset.id });
                  } else if (operations) {
                    const res = operations.moveToTrash([
                      { type: 'asset', id: asset.id },
                    ]);
                    onNotify?.(res.summary);
                    if (res.ok) onLibraryMutated?.();
                  }
                },
              },
            ],
          },
        ]
      : []),
  ];

  const buildMultiAssetMenuSections = (
    ids: readonly string[],
  ): readonly ContextMenuSection[] => [
    {
      id: 'multi-organize',
      items: [
        {
          id: 'multi-move',
          label: `Mover selecionados (${ids.length})`,
          icon: 'folder',
          onSelect: () => setMoveModalPayload({ kind: 'assets', assetIds: [...ids] }),
        },
        {
          id: 'multi-tags',
          label: 'Gerenciar etiquetas',
          icon: 'tag',
          onSelect: () => {
            setBatchTagsModalIds([...ids]);
            setBatchTagsDraft([]);
          },
        },
      ],
    },
    ...(operations || onTrashItem
      ? [
          {
            id: 'multi-danger',
            items: [
              {
                id: 'multi-trash',
                label: `Mover para a lixeira (${ids.length})`,
                icon: 'trash' as const,
                danger: true,
                onSelect: () => setBatchTrashIds([...ids]),
              },
            ],
          },
        ]
      : []),
  ];

  const openContextMenuForFolder = (
    x: number,
    y: number,
    folder: DeckFolder,
  ) => {
    setSelectedFolderId(folder.id);
    setFocusedFolderId(folder.id);
    if (activeSelectedIds.length > 0) {
      if (onSelectedAssetIdsChange) {
        onSelectedAssetIdsChange([]);
      } else {
        internalClearSelection();
      }
    }
    setContextMenuState({
      x,
      y,
      title: folder.name,
      sections: buildFolderMenuSections(folder),
    });
  };

  const openContextMenuForAsset = (x: number, y: number, asset: DeckAsset) => {
    const inMulti =
      activeSelectedIds.includes(asset.id) && activeSelectedIds.length > 1;
    if (inMulti) {
      setContextMenuState({
        x,
        y,
        title: `${activeSelectedIds.length} assets selecionados`,
        sections: buildMultiAssetMenuSections(activeSelectedIds),
      });
      return;
    }
    selectSingleAsset(asset.id);
    setContextMenuState({
      x,
      y,
      title: asset.nome,
      sections: buildSingleAssetMenuSections(asset),
    });
  };

  const openContextMenuFromAnchor = (
    element: HTMLElement,
    title: string,
    sections: readonly ContextMenuSection[],
  ) => {
    const rect = element.getBoundingClientRect();
    setContextMenuState({
      x: Math.round(rect.left + Math.min(rect.width * 0.4, 90)),
      y: Math.round(rect.bottom + 4),
      title,
      sections,
    });
  };

  const buildPayloadFromDragEvent = (
    event: React.DragEvent,
  ): DeckDragPayload | null => {
    if (dragPayload) return dragPayload;
    const raw = event.dataTransfer?.getData('application/x-rocketbox-deck-drag');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as DeckDragPayload;
      if (parsed && (parsed.kind === 'assets' || parsed.kind === 'folder')) {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  };

  const startDragAsset = (
    event: React.DragEvent<HTMLElement>,
    asset: DeckAsset,
  ) => {
    if(event.defaultPrevented)return;
    dragCancelledRef.current = false;
    const useMulti =
      activeSelectedIds.includes(asset.id) && activeSelectedIds.length > 1;
    const assetIds = useMulti ? [...activeSelectedIds] : [asset.id];
    const payload: DeckDragPayload = { kind: 'assets', assetIds };
    setDragPayload(payload);
    setSmartDragImage(event.dataTransfer,assetIds.length>1?`${assetIds.length} assets`:asset.nome);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(
        'application/x-rocketbox-deck-drag',
        JSON.stringify(payload),
      );
      event.dataTransfer.setData(
        'text/plain',
        assetIds.length > 1 ? `${assetIds.length} assets` : asset.nome,
      );
    }
  };

  const startDragFolder = (
    event: React.DragEvent<HTMLElement>,
    folder: DeckFolder,
  ) => {
    if(event.defaultPrevented)return;
    dragCancelledRef.current = false;
    const payload: DeckDragPayload = { kind: 'folder', folderId: folder.id };
    setDragPayload(payload);
    setSmartDragImage(event.dataTransfer,folder.name);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(
        'application/x-rocketbox-deck-drag',
        JSON.stringify(payload),
      );
      event.dataTransfer.setData('text/plain', folder.name);
    }
  };

  const dragTargetCache=useMemo(()=>dragPayload?createDragTargetCache(dragPayload,folders,assets):null,[dragPayload,folders,assets]);
  useEffect(()=>{if(!dragPayload||!dragTargetCache)return;const root=document.getElementById('app-container');if(!root)return;return applySmartDragFocus(root,dragPayload,dragTargetCache);},[dragPayload,dragTargetCache]);
  useEffect(()=>{if(!dragPayload)return;const end=()=>{setDragPayload(null);setDropHover(null);};const hidden=()=>{if(document.hidden)end();};document.addEventListener('drop',end);document.addEventListener('dragend',end);document.addEventListener('visibilitychange',hidden);window.addEventListener('blur',end);return()=>{document.removeEventListener('drop',end);document.removeEventListener('dragend',end);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('blur',end);};},[dragPayload]);

  const handleTargetDragOver = (
    event: React.DragEvent<HTMLElement>,
    key: string,
    targetType: 'folder' | 'root' | 'asset' | 'invalid',
    targetId: string | null,
  ) => {
    const activePayload = buildPayloadFromDragEvent(event);
    if (!activePayload || dragCancelledRef.current) return;
    const validation = dragTargetCache&&(targetType==='folder'||targetType==='root')?dragTargetCache(targetType,targetId):validateDeckDropTarget({payload:activePayload,targetType,targetId,folders,assets});
    if (validation.valid) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    } else {
      if (targetType === 'folder' || targetType === 'root') {
        event.preventDefault();
      }
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    }
    if (
      dropHover?.key !== key ||
      dropHover.valid !== validation.valid ||
      dropHover.reason !== validation.reason
    ) {
      setDropHover({
        key,
        valid: validation.valid,
        reason: validation.reason,
      });
    }
  };

  const handleTargetDragLeave = (key: string) => {
    if (dropHover?.key === key) {
      setDropHover(null);
    }
  };

  const handleTargetDrop = (
    event: React.DragEvent<HTMLElement>,
    targetType: 'folder' | 'root' | 'asset' | 'invalid',
    targetId: string | null,
  ) => {
    const activePayload = buildPayloadFromDragEvent(event);
    setDragPayload(null);
    setDropHover(null);
    if (!activePayload || dragCancelledRef.current) {
      dragCancelledRef.current = false;
      return;
    }
    event.preventDefault();
    const validation = validateDeckDropTarget({
      payload: activePayload,
      targetType,
      targetId,
      folders,
      assets,
    });
    if (!validation.valid) {
      onNotify?.(validation.reason);
      return;
    }
    executeMovePayload(activePayload, validation.targetFolderId);
  };

  const handleDragEnd = () => {
    dragCancelledRef.current = false;
    setDragPayload(null);
    setDropHover(null);
  };

  const dropStateClass = (key: string) =>
    dropHover?.key === key
      ? dropHover.valid
        ? 'is-drop-target-valid'
        : 'is-drop-target-invalid'
      : '';

  const focusedFolder = useMemo(
    () =>
      folders.find((folder) => folder.id === focusedFolderId && !folder.deleted) ??
      null,
    [folders, focusedFolderId],
  );

  const currentParentFolder = useMemo(
    () =>
      folders.find(
        (folder) => folder.id === state.currentParentId && !folder.deleted,
      ) ?? null,
    [folders, state.currentParentId],
  );

  // Contagem de itens por pasta para exibir na coluna da lista
  const itemCountByFolder = useMemo(() => {
    const counts = new Map<string, number>();
    for (const folder of folders) {
      if (!folder.deleted && folder.parent) {
        counts.set(folder.parent, (counts.get(folder.parent) ?? 0) + 1);
      }
    }
    for (const asset of assets) {
      if (!asset.deleted && asset.folder) {
        counts.set(asset.folder, (counts.get(asset.folder) ?? 0) + 1);
      }
    }
    return counts;
  }, [folders, assets]);

  // Construção da trilha de Breadcrumbs
  const breadcrumbs = useMemo(() => {
    const trail: DeckFolder[] = [];
    let cursorId = state.currentParentId;
    const visited = new Set<string>();
    while (cursorId && !visited.has(cursorId)) {
      visited.add(cursorId);
      const folder = folderById.get(cursorId);
      if (!folder) break;
      trail.unshift(folder);
      cursorId = folder.parent;
    }
    return trail;
  }, [state.currentParentId, folderById]);

  // Chips removíveis de filtros ativos
  const activeFilterChips = useMemo<readonly ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    const uf = state.universalFilters;

    if (uf.nameQuery.trim()) {
      chips.push({
        id: 'nameQuery',
        label: `Busca: "${uf.nameQuery.trim()}"`,
        onRemove: () => updateUniversalFilters({ nameQuery: '' }),
      });
    }

    for (const tagId of state.selectedTagIds) {
      const tag = tagById.get(tagId);
      if (tag) {
        chips.push({
          id: `folder-tag-${tag.id}`,
          label: `Etiqueta Pasta: ${tag.label}`,
          onRemove: () => toggleTagFilter(tag.id),
        });
      }
    }

    if (state.tagSearchQuery.trim()) {
      chips.push({
        id: 'tagSearchQuery',
        label: `Filtro etiqueta: "${state.tagSearchQuery.trim()}"`,
        onRemove: () => setTagSearchQuery(''),
      });
    }

    if (uf.fileType) {
      chips.push({
        id: 'fileType',
        label: `Tipo: ${uf.fileType}`,
        onRemove: () => updateUniversalFilters({ fileType: null }),
      });
    }

    if (uf.format) {
      chips.push({
        id: 'format',
        label: `Formato: ${uf.format}`,
        onRemove: () => updateUniversalFilters({ format: null }),
      });
    }

    if (uf.project) {
      chips.push({
        id: 'project',
        label: `Projeto: ${uf.project}`,
        onRemove: () => updateUniversalFilters({ project: null }),
      });
    }

    if (uf.organizationState !== 'all') {
      chips.push({
        id: 'organizationState',
        label: `Organização: ${ORGANIZATION_LABELS[uf.organizationState]}`,
        onRemove: () => updateUniversalFilters({ organizationState: 'all' }),
      });
    }

    if (uf.assetTagQuery.trim()) {
      chips.push({
        id: 'assetTagQuery',
        label: `Etiqueta Asset: "${uf.assetTagQuery.trim()}"`,
        onRemove: () => updateUniversalFilters({ assetTagQuery: '' }),
      });
    }

    for (const tagLabel of uf.selectedAssetTags ?? []) {
      chips.push({
        id: `selected-asset-tag-${tagLabel}`,
        label: `#${tagLabel}`,
        onRemove: () =>
          updateUniversalFilters({
            selectedAssetTags: (uf.selectedAssetTags ?? []).filter(
              (item) => normalizeTagLabel(item) !== normalizeTagLabel(tagLabel),
            ),
          }),
      });
    }

    if (
      uf.tagScope &&
      uf.tagScope !== 'both' &&
      (state.selectedTagIds.length > 0 ||
        state.tagSearchQuery.trim() ||
        uf.assetTagQuery.trim() ||
        (uf.selectedAssetTags ?? []).length > 0)
    ) {
      chips.push({
        id: 'tagScope',
        label: `Escopo etiquetas: ${
          uf.tagScope === 'asset' ? 'Assets' : 'Pastas'
        }`,
        onRemove: () => updateUniversalFilters({ tagScope: 'both' }),
      });
    }

    if (uf.dateFrom) {
      chips.push({
        id: 'dateFrom',
        label: `Desde: ${uf.dateFrom}`,
        onRemove: () => updateUniversalFilters({ dateFrom: null }),
      });
    }

    if (uf.dateTo) {
      chips.push({
        id: 'dateTo',
        label: `Até: ${uf.dateTo}`,
        onRemove: () => updateUniversalFilters({ dateTo: null }),
      });
    }

    return chips;
  }, [
    state.universalFilters,
    state.selectedTagIds,
    state.tagSearchQuery,
    tagById,
    updateUniversalFilters,
    toggleTagFilter,
    setTagSearchQuery,
  ]);

  const advancedFilterCount = useMemo(() => {
    const uf = state.universalFilters;
    let count = 0;
    if (uf.format) count += 1;
    if (uf.project) count += 1;
    if (uf.organizationState !== 'all') count += 1;
    if (uf.assetTagQuery.trim()) count += 1;
    if ((uf.selectedAssetTags ?? []).length > 0) count += (uf.selectedAssetTags ?? []).length;
    if (uf.dateFrom) count += 1;
    if (uf.dateTo) count += 1;
    return count;
  }, [state.universalFilters]);

  const hasAnyFilterActive = activeFilterChips.length > 0;

  const folderChildren = useMemo(() => {
    const children = new Map<string | null, DeckFolder[]>();
    for (const folder of folders) {
      if (folder.deleted) continue;
      const siblings = children.get(folder.parent) ?? [];
      siblings.push(folder);
      children.set(folder.parent, siblings);
    }
    return children;
  }, [folders]);

  function folderTree(parent: string | null): React.ReactNode {
    const items = folderChildren.get(parent);
    if (!items || items.length === 0) {
      return parent === null ? (
        <span className="nautia-muted-note">Nenhuma pasta criada</span>
      ) : null;
    }
    return items.map((folder) => {
      const treeKey = `tree-${folder.id}`;
      const link = (
        <button
          type="button"
          className={`tree-link ${dropStateClass(treeKey)}`}
          aria-current={folder.id === state.currentParentId}
          title={dropHover?.key === treeKey ? dropHover.reason : folder.name}
          data-drop-folder-id={folder.id}
          onDragOver={(event) =>
            handleTargetDragOver(event, treeKey, 'folder', folder.id)
          }
          onDragLeave={() => handleTargetDragLeave(treeKey)}
          onDrop={(event) => handleTargetDrop(event, 'folder', folder.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openContextMenuForFolder(event.clientX, event.clientY, folder);
          }}
          onKeyDown={(event) => {
            if (
              event.key === 'ContextMenu' ||
              (event.shiftKey && event.key === 'F10')
            ) {
              event.preventDefault();
              event.stopPropagation();
              openContextMenuFromAnchor(
                event.currentTarget,
                folder.name,
                buildFolderMenuSections(folder),
              );
            }
          }}
          onClick={() => {
            clearAllFilters();
            setCurrentParent(folder.id);
          }}
        >
          <span className="studio-rail__icon" aria-hidden="true">
            <FolderTagIconGlyph icon="folder" />
          </span>
          <span className="studio-rail__label">{folder.name}</span>
        </button>
      );
      return (
        <div key={folder.id}>
          {link}
          {folderChildren.has(folder.id) && (
            <details className="tree-branch" open={expandedFolders.has(folder.id)} onToggle={event => {
              const open = event.currentTarget.open;
              setExpandedFolders(previous => { const next = new Set(previous); if (open) next.add(folder.id); else next.delete(folder.id); return next; });
            }}>
              <summary>Subpastas de {folder.name}</summary>
              {expandedFolders.has(folder.id) ? folderTree(folder.id) : null}
            </details>
          )}
        </div>
      );
    });
  }

  const handleOpenFolder = (folderId: string) => {
    setFocusedFolderId(folderId);
    setSelectedFolderId(folderId);
    setContextMenuState(null);
    if (!filterResult.isFolderIsolationActive) {
      setCurrentParent(folderId);
    }
  };

  const handleDispatchQuickAction = async (payload: QuickActionScopePayload) => {
    if (!operations) {
      return {
        actionId: payload.actionId,
        status: 'ready' as const,
        summary: `Escopo preparado para ${payload.totalSelected} asset(s).`,
      };
    }

    const outcome = await orchestrateQuickAction({
      actionId: payload.actionId,
      selectedAssets: payload.targetAssets,
      folders,
      folderTags,
      operations,
      targetFolderId: state.currentParentId,
    });

    if (outcome.inferenceReports) {
      setDiagnosticReports(outcome.inferenceReports);
    }
    if (outcome.plan) {
      setPendingPlan(outcome.plan);
    }

    return {
      actionId: payload.actionId,
      status: outcome.failed ? 'error' as const : 'completed' as const,
      summary: outcome.message,
    };
  };

  const handleConfirmPlan = (adjustedPlan: ActionPlanModel) => {
    if (!operations || !history) return;
    if (pendingPlan?.id !== adjustedPlan.id) { onNotify?.('Este plano não está pendente de aprovação.'); return; }
    const result = executeApprovedActionPlan({
      plan: adjustedPlan,
      operations,
      history,
    });
    setPendingPlan(null);
    onLibraryMutated?.();
    onNotify?.(result.summary);
  };

  const handleUndoHistory = (entryId: string) => {
    if (!operations || !history) return;
    const result = history.undoEntry(entryId, operations);
    onLibraryMutated?.();
    onNotify?.(result.summary);
  };

  const inspectedAsset = useMemo(
    () =>
      selectedAssets.length === 1
        ? migrateLegacyAssetRecord(selectedAssets[0])
        : null,
    [selectedAssets],
  );

  const inspectedClassification = useMemo(
    () =>
      inspectedAsset
        ? buildAssetClassificationProfile({
            asset: inspectedAsset,
            folders,
            existingAssetTags: assetTags,
            existingFolderTags: folderTags,
          })
        : null,
    [inspectedAsset, folders, assetTags, folderTags],
  );

  const inspectedAssetFolderTrail = useMemo(() => {
    if (!inspectedAsset) return 'Convés (Raiz)';
    if (!inspectedAsset.folder) return 'Convés (Raiz)';
    const parts: string[] = [];
    let cursor: string | null = inspectedAsset.folder;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const found = folderById.get(cursor);
      if (!found) break;
      parts.unshift(found.name);
      cursor = found.parent;
    }
    return parts.length > 0 ? parts.join(' / ') : 'Convés (Raiz)';
  }, [inspectedAsset, folderById]);

  const assetTagUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of assets) {
      if (item.deleted) continue;
      const seenInAsset = new Set<string>();
      for (const raw of item.tags ?? []) {
        const norm = normalizeTagLabel(raw);
        if (!norm || seenInAsset.has(norm)) continue;
        seenInAsset.add(norm);
        counts.set(norm, (counts.get(norm) ?? 0) + 1);
      }
    }
    return counts;
  }, [assets]);

  const contextFolderForTags =
    (selectedFolderId ? folderById.get(selectedFolderId) : undefined) ??
    focusedFolder ??
    currentParentFolder ??
    null;

  const inspectedFolder =
    !inspectedAsset && selectedAssets.length <= 1 ? contextFolderForTags : null;

  const inspectedFolderCounts = useMemo(() => {
    if (!inspectedFolder) {
      return { totalItems: 0, directFolders: 0, directAssets: 0 };
    }
    const directFolders = folders.filter(
      (f) => !f.deleted && f.parent === inspectedFolder.id,
    ).length;
    const directAssets = assets.filter(
      (a) => !a.deleted && a.folder === inspectedFolder.id,
    ).length;
    return {
      totalItems: directFolders + directAssets,
      directFolders,
      directAssets,
    };
  }, [inspectedFolder, folders, assets]);

  const inspectedFolderTrail = useMemo(() => {
    if (!inspectedFolder) return 'Convés (Raiz)';
    const parts: string[] = [];
    let cursor = inspectedFolder.parent;
    const visited = new Set<string>([inspectedFolder.id]);
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const found = folderById.get(cursor);
      if (!found) break;
      parts.unshift(found.name);
      cursor = found.parent;
    }
    return parts.length > 0 ? `Convés / ${parts.join(' / ')}` : 'Convés (Raiz)';
  }, [inspectedFolder, folderById]);

  useEffect(() => {
    setShowFullPath(false);
  }, [inspectedAsset?.id]);

  const discoveredFolderTags = useMemo(() => {
    if (!contextFolderForTags) return null;
    return getDiscoveredFolderTags(
      contextFolderForTags.id,
      folders,
      assets,
      assetTags,
      discoveredTagScope,
    );
  }, [contextFolderForTags, folders, assets, assetTags, discoveredTagScope]);

  const handleConfirmRenameAsset = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renamingAsset) return;
    const clean = renameDraft.trim();
    if (!clean) return;
    editRecord(renamingAsset, 'nome', clean);
    setRenamingAsset(null);
  };

  const handleConfirmBatchTags = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!batchTagsModalIds || batchTagsModalIds.length === 0) return;

    if (batchTagsModalIds.length === 1) {
      const target = assets.find((a) => a.id === batchTagsModalIds[0]);
      if (target) {
        const currentNorms = new Map(
          target.tags.map((lbl) => [normalizeTagLabel(lbl), lbl]),
        );
        const nextNorms = new Map(
          batchTagsDraft.map((lbl) => [normalizeTagLabel(lbl), lbl]),
        );
        const toAdd = batchTagsDraft.filter(
          (lbl) => !currentNorms.has(normalizeTagLabel(lbl)),
        );
        const toRemove = target.tags.filter(
          (lbl) => !nextNorms.has(normalizeTagLabel(lbl)),
        );
        if (operations) {
          if (toAdd.length > 0) {
            operations.assignTags({
              scope: 'asset-tag',
              assetIds: [target.id],
              labels: toAdd,
            });
          }
          if (toRemove.length > 0) {
            operations.removeAssetTags({
              assetIds: [target.id],
              labels: toRemove,
            });
          }
          if (toAdd.length > 0 || toRemove.length > 0) {
            onLibraryMutated?.();
            onNotify?.(`Etiquetas de "${target.nome}" atualizadas.`);
          }
        } else if (onAssetsChange) {
          onAssetsChange(
            assets.map((item) =>
              item.id === target.id ? { ...item, tags: [...batchTagsDraft] } : item,
            ),
          );
        }
      }
      setBatchTagsModalIds(null);
      return;
    }

    if (batchTagsDraft.length > 0) {
      if (operations) {
        const res = operations.assignTags({
          scope: 'asset-tag',
          assetIds: [...batchTagsModalIds],
          labels: [...batchTagsDraft],
        });
        onNotify?.(res.summary);
        if (res.ok) onLibraryMutated?.();
      } else if (onAssetsChange) {
        const targetSet = new Set(batchTagsModalIds);
        onAssetsChange(
          assets.map((item) => {
            if (!targetSet.has(item.id)) return item;
            const merged = [...item.tags];
            for (const lbl of batchTagsDraft) {
              if (
                !merged.some(
                  (e) => normalizeTagLabel(e) === normalizeTagLabel(lbl),
                )
              ) {
                merged.push(lbl);
              }
            }
            return { ...item, tags: merged };
          }),
        );
      }
    }
    setBatchTagsModalIds(null);
  };

  const handleConfirmFolderTags = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!folderTagsModalId) return;
    const folder = folders.find((f) => f.id === folderTagsModalId);
    if (!folder) {
      setFolderTagsModalId(null);
      return;
    }

    if (operations) {
      const tagMap = new Map(
        folderTags.map((t) => [normalizeTagLabel(t.label), t.id]),
      );
      const desiredIds = new Set<string>();
      for (const rawLabel of folderTagsDraft) {
        const norm = normalizeTagLabel(rawLabel);
        if (!norm) continue;
        let id = tagMap.get(norm);
        if (!id) {
          const created = operations.createTag({
            scope: 'folder-tag',
            input: { label: rawLabel.trim(), icon: 'tag', accent: 'cyan' },
          });
          if (created.ok && created.data) {
            id = created.data.id;
            tagMap.set(norm, id);
          }
        }
        if (id) desiredIds.add(id);
      }

      const currentIds = new Set(folder.folderTagIds ?? []);
      const toToggle = [
        ...[...desiredIds].filter((id) => !currentIds.has(id)),
        ...[...currentIds].filter((id) => !desiredIds.has(id)),
      ];
      if (toToggle.length > 0) {
        operations.assignTags({
          scope: 'folder-tag',
          folderIds: [folder.id],
          tagIds: toToggle,
          mode: 'toggle',
        });
        onLibraryMutated?.();
        onNotify?.(`Etiquetas da pasta "${folder.name}" atualizadas.`);
      }
    } else {
      const tagMap = new Map(
        folderTags.map((t) => [normalizeTagLabel(t.label), t.id]),
      );
      const desiredIds = new Set(
        folderTagsDraft
          .map((lbl) => tagMap.get(normalizeTagLabel(lbl)))
          .filter((id): id is string => Boolean(id)),
      );
      const currentIds = new Set(folder.folderTagIds ?? []);
      for (const id of desiredIds) {
        if (!currentIds.has(id)) toggleTagOnFolder(folder.id, id);
      }
      for (const id of currentIds) {
        if (!desiredIds.has(id)) toggleTagOnFolder(folder.id, id);
      }
    }
    setFolderTagsModalId(null);
  };

  const handleConfirmBatchTrash = () => {
    if (!batchTrashIds || batchTrashIds.length === 0) return;
    if (operations) {
      const refs = batchTrashIds.map((id) => ({
        type: 'asset' as const,
        id,
      }));
      const res = operations.moveToTrash(refs);
      history?.record({
        actionType: res.operation,
        source: 'quick-action',
        summary: `Mover ${batchTrashIds.length} assets para a lixeira`,
        affectedResources: res.affectedResources,
        status: res.ok ? 'executed' : 'failed',
        resultSummary: res.summary,
        undoSteps: res.undo ? [res.undo] : [],
      });
      onNotify?.(res.summary);
      if (res.ok) {
        clearAssetSelection();
        onLibraryMutated?.();
      }
    } else if (onTrashItem) {
      for (const id of batchTrashIds) {
        onTrashItem({ type: 'asset', id });
      }
    }
    setBatchTrashIds(null);
  };

  const handleInspectorAddTag = (rawLabel: string) => {
    if (!inspectedAsset) return;
    const clean = rawLabel.trim();
    const norm = normalizeTagLabel(clean);
    if (!norm) return;
    if (operations) {
      operations.assignTags({
        scope: 'asset-tag',
        assetIds: [inspectedAsset.id],
        labels: [clean],
      });
      onLibraryMutated?.();
      onNotify?.(`Etiqueta "${clean}" associada a "${inspectedAsset.nome}".`);
    } else if (onAssetsChange) {
      const next = assets.map((item) => {
        if (item.id !== inspectedAsset.id) return item;
        if (item.tags.some((t) => normalizeTagLabel(t) === norm)) return item;
        return { ...item, tags: [...item.tags, clean] };
      });
      onAssetsChange(next);
    }
  };

  const handleInspectorTagsChange = (nextLabels: string[]) => {
    if (!inspectedAsset) return;
    const currentNorms = new Map(
      inspectedAsset.tags.map((label) => [normalizeTagLabel(label), label]),
    );
    const nextNorms = new Map(
      nextLabels.map((label) => [normalizeTagLabel(label), label]),
    );

    const toAdd = nextLabels.filter(
      (label) => !currentNorms.has(normalizeTagLabel(label)),
    );
    const toRemove = inspectedAsset.tags.filter(
      (label) => !nextNorms.has(normalizeTagLabel(label)),
    );

    if (operations) {
      if (toAdd.length > 0) {
        operations.assignTags({
          scope: 'asset-tag',
          assetIds: [inspectedAsset.id],
          labels: toAdd,
        });
      }
      if (toRemove.length > 0) {
        operations.removeAssetTags({
          assetIds: [inspectedAsset.id],
          labels: toRemove,
        });
      }
      if (toAdd.length > 0 || toRemove.length > 0) {
        onLibraryMutated?.();
      }
    } else if (onAssetsChange) {
      const next = assets.map((item) =>
        item.id === inspectedAsset.id ? { ...item, tags: nextLabels } : item,
      );
      onAssetsChange(next);
    }
  };

  const handleInspectorUpdateCategory = (nextCategoria: string) => {
    if (!inspectedAsset || !nextCategoria.trim()) return;
    if (operations) {
      operations.updateAssetCategory(inspectedAsset.id, nextCategoria);
      onLibraryMutated?.();
      onNotify?.(
        `Categoria de "${inspectedAsset.nome}" atualizada para "${nextCategoria}".`,
      );
    } else if (onAssetsChange) {
      const next = assets.map((item) =>
        item.id === inspectedAsset.id
          ? { ...item, categoria: nextCategoria }
          : item,
      );
      onAssetsChange(next);
    }
  };

  const handleInspectorRunDiagnostics = async () => {
    if (!inspectedAsset || !operations) return;
    const diag = await operations.queryDiagnostics([inspectedAsset.id]);
    if (diag.data) {
      setDiagnosticReports(diag.data);
    }
    onLibraryMutated?.();
    onNotify?.(`Análise técnica concluída para "${inspectedAsset.nome}".`);
  };

  const totalVisibleCount =
    filterResult.visibleFolders.length + filterResult.visibleAssets.length;

  return (
    <div className="nautia-deck-shell">
      {/* 1. CABEÇALHO COMPACTO */}
      <header className="stage-header nautia-deck-topbar">
        <div className="nautia-deck-topbar__title-block">
          <p className="eyebrow">OCSIS / CONVÉS</p>
          <div className="nautia-deck-topbar__headline">
            <h1 id="workspace-title" tabIndex={-1}>
              Convés<span className="accent">.</span>
            </h1>
            <p className="muted">
              Gerenciamento de pastas, assets e diagnósticos técnicos.
            </p>
          </div>
        </div>

        <div className="nautia-deck-topbar__actions">
          {history && (
            <button
              type="button"
              className={`nautia-btn-ghost ${showHistory ? 'is-active' : ''}`}
              aria-expanded={showHistory}
              title="Visualizar histórico de operações e desfazer ações"
              onClick={() => setShowHistory((prev) => !prev)}
            >
              Histórico ({historyEntries.length})
            </button>
          )}
          <button
            type="button"
            className="nautia-btn-ghost"
            onClick={() => setIsTagManagerOpen(true)}
          >
            <FolderTagIconGlyph icon="tag" className="nautia-mini-svg" />
            <span>Gerenciar Etiquetas ({globalTagCatalog.length})</span>
          </button>
          <button
            type="button"
            className="nautia-btn-ghost"
            onClick={() => setIsFolderModalOpen(true)}
          >
            <FolderTagIconGlyph icon="folder" className="nautia-mini-svg" />
            <span>Nova Pasta</span>
          </button>
          {onOpenRegister && (
            <button
              type="button"
              className="nautia-btn-primary nautia-btn-cta"
              onClick={onOpenRegister}
            >
              <CustomIcon name="rocket" size={16} className="nautia-mini-svg" />
              <span>Registrar Asset</span>
            </button>
          )}
        </div>
      </header>

      {/* 2. EXPLORADOR EM 3 ÁREAS (Esquerda: Coleções/Árvore, Centro: Lista/Grade Unificada, Direita: Inspetor + Nautia) */}
      <div className="studio-explorer">
        {/* COLUNA ESQUERDA: NAVEGAÇÃO DA BIBLIOTECA */}
        <details open className="studio-rail">
          <summary>Explorador</summary>
          <nav aria-label="Coleções do Convés">
            {COLLECTIONS.map(({ name, icon }) => {
              const isRootCollection = name === 'Biblioteca';
              return (
                <button
                  key={name}
                  type="button"
                  className={`studio-rail__nav-btn ${
                    isRootCollection ? dropStateClass('rail-root') : ''
                  }`}
                  data-smart-drop-root={isRootCollection?'true':undefined}
                  aria-current={scope === name}
                  onDragOver={
                    isRootCollection
                      ? (event) =>
                          handleTargetDragOver(event, 'rail-root', 'root', null)
                      : undefined
                  }
                  onDragLeave={
                    isRootCollection
                      ? () => handleTargetDragLeave('rail-root')
                      : undefined
                  }
                  onDrop={
                    isRootCollection
                      ? (event) => handleTargetDrop(event, 'root', null)
                      : undefined
                  }
                  onClick={() => browse(name)}
                >
                  <span className="studio-rail__icon" aria-hidden="true">
                    {name === 'Biblioteca' ? (
                      <CustomIcon name="library" size={18} />
                    ) : (
                      <FolderTagIconGlyph icon={icon} />
                    )}
                  </span>
                  <span className="studio-rail__label">{name}</span>
                </button>
              );
            })}

            <div
              className="studio-rail__disabled-item"
              title="Favoritos estará disponível em uma próxima atualização"
            >
              <span className="studio-rail__icon" aria-hidden="true">
                <FolderTagIconGlyph icon="sparkles" />
              </span>
              <span className="studio-rail__label">Favoritos</span>
              <small className="studio-rail__badge-soon">indisponível</small>
            </div>

            <hr className="studio-rail__divider" />

            <details open className="studio-rail__section">
              <summary>Pastas</summary>
              <div className="studio-rail__tree">{folderTree(null)}</div>
            </details>

            <details className="studio-rail__section">
              <summary>Etiquetas</summary>
              <FolderTagFilterBar
                tags={visibleTagIcons}
                selectedTagIds={state.selectedTagIds}
                tagSearchQuery={state.tagSearchQuery}
                tagMatchMode={state.tagMatchMode}
                folderCountByTag={folderCountByTag}
                errorMessage={state.lastTagError}
                targetFolderName={focusedFolder?.name ?? null}
                onToggleTag={toggleTagFilter}
                onTagSearchChange={setTagSearchQuery}
                onTagMatchModeChange={setTagMatchMode}
                onCreateTag={(input) =>
                  createAndOptionallyApplyTag(input, focusedFolder?.id ?? null)
                }
                onClearFilters={clearAllFilters}
              />

              <div
                className="studio-rail__asset-tags"
                aria-label="Catálogo global de etiquetas de assets"
              >
                <div className="studio-rail__asset-tags-head">
                  <span className="studio-rail__sublabel">
                    Catálogo ({globalTagCatalog.length})
                  </span>
                  <button
                    type="button"
                    className="nautia-btn-inline"
                    onClick={() => setIsTagManagerOpen(true)}
                  >
                    Gerenciar Etiquetas
                  </button>
                </div>
                {globalTagCatalog.length === 0 ? (
                  <span className="nautia-empty-hint">
                    Nenhuma etiqueta cadastrada ainda.
                  </span>
                ) : (
                  <div className="studio-rail__asset-tags-list">
                    {globalTagCatalog.map((item) => {
                      const activeAssetTags = state.universalFilters.selectedAssetTags ?? [];
                      const isActive = activeAssetTags.some(
                        (lbl) => normalizeTagLabel(lbl) === item.normalizedLabel,
                      );
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-pressed={isActive}
                          className={`studio-rail__asset-tag-chip accent-${item.color} ${
                            isActive ? 'is-active' : ''
                          }`}
                          title={`${item.label}: ${item.assetCount} asset(s) · ${item.folderCount} pasta(s)`}
                          onClick={() => {
                            const nextTags = isActive
                              ? activeAssetTags.filter(
                                  (lbl) => normalizeTagLabel(lbl) !== item.normalizedLabel,
                                )
                              : [...activeAssetTags, item.label];
                            updateUniversalFilters({
                              selectedAssetTags: nextTags,
                              tagScope: item.folderTagId && !item.assetTagId ? 'both' : 'asset',
                            });
                          }}
                        >
                          <span>{item.label}</span>
                          <small>{item.totalCount}</small>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </details>

            <hr className="studio-rail__divider" />

            <a href="#trash" className="studio-rail__trash-link">
              <span className="studio-rail__icon" aria-hidden="true">
                <svg
                  className="nautia-icon-svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6l-1 14H6L5 6" />
                </svg>
              </span>
              <span className="studio-rail__label">Lixeira</span>
            </a>
          </nav>
        </details>

        {/* COLUNA CENTRAL: CAMINHO + PESQUISA/FILTROS + SUPERFÍCIE UNIFICADA */}
        <div className="studio-surface studio-browser">
          {/* Topo: Caminho da Pasta (Breadcrumbs) + Alternância Lista/Grade */}
          <nav
            className="nautia-breadcrumbs-bar"
            aria-label="Localização atual no Convés"
          >
            <div className="nautia-breadcrumbs-trail">
              <button
                type="button"
                className={`nautia-breadcrumb-btn ${
                  state.currentParentId === null &&
                  !filterResult.isFolderIsolationActive &&
                  scope === 'Biblioteca'
                    ? 'is-current'
                    : ''
                } ${dropStateClass('crumb-root')}`}
                onDragOver={(event) =>
                  handleTargetDragOver(event, 'crumb-root', 'root', null)
                }
                data-smart-drop-root="true" onDragLeave={() => handleTargetDragLeave('crumb-root')}
                onDrop={(event) => handleTargetDrop(event, 'root', null)}
                onClick={() => setCurrentParent(null)}
              >
                <FolderTagIconGlyph icon="folder" className="nautia-mini-svg" />
                <span>Convés / Raiz</span>
              </button>

              {scope !== 'Biblioteca' && (
                <>
                  <span className="nautia-breadcrumb-sep" aria-hidden="true">
                    /
                  </span>
                  <span className="nautia-breadcrumb-badge">{scope}</span>
                </>
              )}

              {filterResult.isFolderIsolationActive ? (
                <>
                  <span className="nautia-breadcrumb-sep" aria-hidden="true">
                    /
                  </span>
                  <span className="nautia-breadcrumb-badge">
                    Isolamento por etiqueta ativo
                  </span>
                </>
              ) : (
                breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === breadcrumbs.length - 1;
                  const crumbKey = `crumb-${crumb.id}`;
                  return (
                    <React.Fragment key={crumb.id}>
                      <span className="nautia-breadcrumb-sep" aria-hidden="true">
                        /
                      </span>
                      <button
                        type="button"
                        className={`nautia-breadcrumb-btn ${
                          isLast ? 'is-current' : ''
                        } ${dropStateClass(crumbKey)}`}
                        aria-current={isLast ? 'page' : undefined}
                        onDragOver={(event) =>
                          handleTargetDragOver(event, crumbKey, 'folder', crumb.id)
                        }
                        data-drop-folder-id={crumb.id} onDragLeave={() => handleTargetDragLeave(crumbKey)}
                        onDrop={(event) =>
                          handleTargetDrop(event, 'folder', crumb.id)
                        }
                        onClick={() => setCurrentParent(crumb.id)}
                      >
                        <span>{crumb.name}</span>
                      </button>
                    </React.Fragment>
                  );
                })
              )}
            </div>

            <div className="studio-browser__top-controls">
              <div
                className="nautia-segmented nautia-view-toggle"
                role="group"
                aria-label="Alternar modo de visualização"
              >
                <button
                  type="button"
                  className={viewMode === 'grid' ? 'is-active' : undefined}
                  aria-pressed={viewMode === 'grid'}
                  title="Visualização em grade"
                  onClick={() => setViewMode('grid')}
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <rect x="2" y="2" width="5" height="5" rx="1" />
                    <rect x="9" y="2" width="5" height="5" rx="1" />
                    <rect x="2" y="9" width="5" height="5" rx="1" />
                    <rect x="9" y="9" width="5" height="5" rx="1" />
                  </svg>
                  <span>Grade</span>
                </button>
                <button
                  type="button"
                  className={viewMode === 'list' ? 'is-active' : undefined}
                  aria-pressed={viewMode === 'list'}
                  title="Visualização em lista compacta"
                  onClick={() => setViewMode('list')}
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path d="M2.5 4h11M2.5 8h11M2.5 12h11" strokeLinecap="round" />
                  </svg>
                  <span>Lista</span>
                </button>
              </div>
            </div>
          </nav>

          {/* Barra de pesquisa e filtros */}
          <section
            className="nautia-deck-toolbar"
            aria-label="Barra de ferramentas principal do Convés"
          >
            <div className="nautia-deck-toolbar__primary">
              <select className="studio-inspector__inline-select" aria-label="Ordenar biblioteca" value={sortOrder} onChange={e => { setSortOrder(e.target.value); setPage(0); }}>
                <option value="name">Nome A–Z</option><option value="name-desc">Nome Z–A</option><option value="recent">Mais recentes</option><option value="format">Formato</option>
              </select>
              <label className="nautia-toolbar-search">
                <svg
                  className="nautia-toolbar-search__icon"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  aria-hidden="true"
                >
                  <circle cx="9" cy="9" r="6" />
                  <path d="m13.5 13.5 4 4" />
                </svg>
                <input
                  type="search"
                  value={state.universalFilters.nameQuery}
                  onChange={(event) =>
                    updateUniversalFilters({ nameQuery: event.target.value })
                  }
                  placeholder={`Pesquisar em ${
                    currentParentFolder?.name ?? scope
                  }...`}
                  aria-label="Pesquisar assets ou pastas por nome"
                />
              </label>

              {universalOptions.fileTypes.length > 0 && (
                <div
                  className="nautia-quick-type-pills"
                  role="group"
                  aria-label="Filtro rápido por tipo de arquivo"
                >
                  <button
                    type="button"
                    className={`nautia-type-chip ${
                      !state.universalFilters.fileType ? 'is-active' : ''
                    }`}
                    aria-pressed={!state.universalFilters.fileType}
                    onClick={() => updateUniversalFilters({ fileType: null })}
                  >
                    Todos
                  </button>
                  {universalOptions.fileTypes.map((type) => {
                    const isActive = state.universalFilters.fileType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        className={`nautia-type-chip ${
                          isActive ? 'is-active' : ''
                        }`}
                        aria-pressed={isActive}
                        onClick={() =>
                          updateUniversalFilters({
                            fileType: isActive ? null : type,
                          })
                        }
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="nautia-deck-toolbar__right">
                <button
                  type="button"
                  className={`nautia-btn-ghost nautia-btn-filters-toggle ${
                    isAdvancedFiltersOpen || advancedFilterCount > 0
                      ? 'is-active'
                      : ''
                  }`}
                  aria-expanded={isAdvancedFiltersOpen}
                  aria-controls="nautia-advanced-filters-panel"
                  onClick={() => setIsAdvancedFiltersOpen((prev) => !prev)}
                >
                  <FolderTagIconGlyph icon="compass" className="nautia-mini-svg" />
                  <span>Filtros avançados</span>
                  {advancedFilterCount > 0 && (
                    <span className="nautia-filter-count-badge">
                      {advancedFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {hasAnyFilterActive && (
              <div
                className="nautia-active-filters-bar"
                role="region"
                aria-label="Filtros ativos"
              >
                <span className="nautia-active-filters-bar__count">
                  {activeFilterChips.length}{' '}
                  {activeFilterChips.length === 1
                    ? 'filtro ativo:'
                    : 'filtros ativos:'}
                </span>
                <div className="nautia-active-filters-bar__chips">
                  {activeFilterChips.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className="nautia-removable-chip"
                      title={`Remover filtro ${chip.label}`}
                      onClick={chip.onRemove}
                    >
                      <span>{chip.label}</span>
                      <span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="nautia-btn-chip nautia-btn-clear-all"
                  onClick={clearAllFilters}
                >
                  Limpar filtros
                </button>
              </div>
            )}
          </section>

          <UniversalFiltersPanel
            criteria={state.universalFilters}
            options={universalOptions}
            hasActiveFilters={filterResult.hasUniversalFiltersActive}
            isOpen={isAdvancedFiltersOpen}
            onUpdate={updateUniversalFilters}
            onReset={() => updateUniversalFilters(DEFAULT_UNIVERSAL_FILTERS)}
            onClose={() => setIsAdvancedFiltersOpen(false)}
          />

          <NautiaActionPlan
            plan={pendingPlan}
            folders={folders}
            onConfirm={handleConfirmPlan}
            onCancel={() => setPendingPlan(null)}
          />

          <NautiaDiagnosticsPanel
            reports={diagnosticReports}
            onClose={() => setDiagnosticReports([])}
          />

          {showHistory && history && (
            <NautiaHistoryPanel
              entries={historyEntries}
              onUndo={handleUndoHistory}
              onClear={()=>{try{history.clear();onLibraryMutated?.();onNotify?.('Histórico de atividades limpo.');}catch(e){onNotify?.(`Não foi possível limpar: ${String(e)}`);}}}
            />
          )}

          {/* Superfície unificada de Pastas e Assets */}
          <div className="nautia-deck-workspace-body">
            {dragPayload && (
              <div
                className={`nautia-drag-status ${
                  dropHover ? (dropHover.valid ? 'is-valid' : 'is-invalid') : ''
                }`}
                role="status"
              >
                <span>
                  {dragPayload.kind === 'folder'
                    ? `Arrastando pasta: ${
                        folderById.get(dragPayload.folderId)?.name ?? 'Pasta'
                      }`
                    : dragPayload.assetIds.length === 1
                      ? 'Arrastando 1 asset'
                      : `Arrastando ${dragPayload.assetIds.length} assets`}
                </span>
                <strong>
                  {dropHover
                    ? dropHover.reason
                    : 'Solte em uma pasta ou na Raiz (Esc para cancelar)'}
                </strong>
              </div>
            )}
            <div className={`explorer-records mode-${viewMode}`}>
              {totalVisibleCount > 0 && (
                <div className="explorer-columns">
                  <span>NOME ↑</span>
                  <span>TIPO</span>
                  <span>FORMATO / ITENS</span>
                  <span>MODIFICAÇÃO / TAGS</span>
                </div>
              )}

              {pageFolders.map((folder) => {
                const count = itemCountByFolder.get(folder.id) ?? 0;
                const tagLabels = folder.folderTagIds
                  ?.map((id) => tagById.get(id)?.label)
                  .filter(Boolean)
                  .join(', ');
                const rowKey = `row-folder-${folder.id}`;
                const isFolderSelected =
                  !inspectedAsset &&
                  selectedAssets.length <= 1 &&
                  selectedFolderId === folder.id;

                return (
                  <article
                    className={`explorer-record is-folder-row ${
                      isFolderSelected ? 'selected' : ''
                    } ${dropStateClass(rowKey)}`}
                    key={folder.id}
                    draggable
                    data-deck-type="folder"
                    data-deck-id={folder.id}
                    tabIndex={0}
                    onDragStart={(event) => startDragFolder(event, folder)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(event) =>
                      handleTargetDragOver(event, rowKey, 'folder', folder.id)
                    }
                    onDragLeave={() => handleTargetDragLeave(rowKey)}
                    onDrop={(event) =>
                      handleTargetDrop(event, 'folder', folder.id)
                    }
                    onClick={(event) => {
                      if (
                        !(event.target as HTMLElement).closest('button.record-name')
                      ) {
                        setSelectedFolderId(folder.id);
                        setFocusedFolderId(folder.id);
                        if (activeSelectedIds.length > 0) {
                          if (onSelectedAssetIdsChange) {
                            onSelectedAssetIdsChange([]);
                          } else {
                            internalClearSelection();
                          }
                        }
                      }
                    }}
                    onDoubleClick={() => handleOpenFolder(folder.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openContextMenuForFolder(
                        event.clientX,
                        event.clientY,
                        folder,
                      );
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'ContextMenu' ||
                        (event.shiftKey && event.key === 'F10')
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        openContextMenuFromAnchor(
                          event.currentTarget,
                          folder.name,
                          buildFolderMenuSections(folder),
                        );
                      }
                    }}
                  >
                    <button
                      type="button"
                      className="record-name"
                      onClick={() => handleOpenFolder(folder.id)}
                    >
                      <span className="record-check-spacer" aria-hidden="true" />
                      <span className="record-name__icon" aria-hidden="true">
                        <FolderTagIconGlyph icon="folder" />
                      </span>
                      <span className="record-name__text">{folder.name}</span>
                    </button>
                    <span className="record-type-cell">Pasta</span>
                    <span className="record-size-cell">
                      {count} {count === 1 ? 'item' : 'itens'}
                    </span>
                    <span className="record-meta-cell">
                      {tagLabels || 'Convés'}
                    </span>
                  </article>
                );
              })}

              {pageAssets.map((raw) => {
                const asset = migrateLegacyAssetRecord(raw);
                const selected = activeSelectedIds.includes(asset.id);
                const softwareKey = asset.sourceSoftware ?? 'unknown';
                const softwareBadge =
                  softwareKey !== 'unknown'
                    ? ORIGIN_SOFTWARE_LABELS[softwareKey]
                    : null;
                const formatDisplay = (
                  asset.detectedFormat ||
                  asset.formato ||
                  'ASSET'
                )
                  .replace(/^\./, '')
                  .toUpperCase();

                const assetRowKey = `row-asset-${asset.id}`;

                return (
                  <article
                    key={asset.id}
                    className={`explorer-record ${selected ? 'selected' : ''} ${dropStateClass(assetRowKey)}`}
                    draggable
                    data-deck-type="asset"
                    data-deck-id={asset.id}
                    tabIndex={0}
                    onDragStart={(event) => startDragAsset(event, asset)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(event) =>
                      handleTargetDragOver(event, assetRowKey, 'asset', asset.id)
                    }
                    onDragLeave={() => handleTargetDragLeave(assetRowKey)}
                    onDrop={(event) =>
                      handleTargetDrop(event, 'asset', asset.id)
                    }
                    onClick={(event) => {
                      if (
                        !(event.target as HTMLElement).closest('label,input,button')
                      ) {
                        toggleAssetSelection(asset.id);
                      }
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openContextMenuForAsset(
                        event.clientX,
                        event.clientY,
                        asset,
                      );
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'ContextMenu' ||
                        (event.shiftKey && event.key === 'F10')
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        const useMulti =
                          activeSelectedIds.includes(asset.id) &&
                          activeSelectedIds.length > 1;
                        openContextMenuFromAnchor(
                          event.currentTarget,
                          useMulti
                            ? `${activeSelectedIds.length} assets selecionados`
                            : asset.nome,
                          useMulti
                            ? buildMultiAssetMenuSections(activeSelectedIds)
                            : buildSingleAssetMenuSections(asset),
                        );
                      }
                    }}
                  >
                    <label className="record-name">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleAssetSelection(asset.id)}
                      />
                      <span className="record-name__icon" aria-hidden="true">
                        <AssetIcon asset={asset} />
                      </span>
                      <span className="record-name__text">{asset.nome}</span>
                      {softwareBadge && (
                        <span
                          className={`record-origin-pill origin-${softwareKey}`}
                        >
                          {softwareBadge}
                        </span>
                      )}
                      {filterResult.tagMatchOrigins?.get(asset.id) &&
                        (state.selectedTagIds.length > 0 ||
                          state.tagSearchQuery.trim() ||
                          state.universalFilters.assetTagQuery.trim() ||
                          (state.universalFilters.selectedAssetTags ?? [])
                            .length > 0) && (
                          <span
                            className="record-tag-origin-badge"
                            title="Origem da correspondência de etiqueta"
                          >
                            {filterResult.tagMatchOrigins.get(asset.id)
                              ?.byAssetTag &&
                            filterResult.tagMatchOrigins.get(asset.id)
                              ?.byFolderTag
                              ? 'Pasta + Asset'
                              : filterResult.tagMatchOrigins.get(asset.id)
                                  ?.byFolderTag
                                ? 'via Pasta'
                                : 'via Asset'}
                          </span>
                        )}
                    </label>
                    <span className="record-type-cell">
                      <FolderTagIconGlyph
                        icon={resolveCategoryIcon(asset.categoria, asset.kind)}
                        className="nautia-mini-svg"
                      />
                      <span>
                        {asset.kind && asset.kind !== 'asset'
                          ? REGISTRATION_KIND_LABELS[asset.kind]
                          : asset.categoria}
                      </span>
                    </span>
                    <span className="record-size-cell">{formatDisplay}</span>
                    <span className="record-meta-cell">
                      {asset.tags.length > 0
                        ? asset.tags.join(', ')
                        : formatRecordDate(asset.createdAt)}
                    </span>
                  </article>
                );
              })}
            </div>

            {!filterResult.visibleAssets.length &&
              !filterResult.visibleFolders.length && (
                <p className="explorer-empty">
                  {hasAnyFilterActive
                    ? 'Nenhum resultado para os filtros ativos'
                    : assets.every((asset) => asset.deleted) &&
                        folders.every((folder) => folder.deleted)
                      ? 'Biblioteca ainda vazia'
                      : 'Nenhum item nesta coleção.'}
                </p>
              )}

            {/* Rodapé da lista unificada */}
            <footer className="explorer-footer" role="status">
              {pageCount > 1 && <div>
                <button type="button" className="nautia-btn-chip" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</button>
                <span>Página {currentPage + 1} de {pageCount}</span>
                <button type="button" className="nautia-btn-chip" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Próxima</button>
              </div>}
              <div className="explorer-footer__counts">
                <strong>{totalVisibleCount} itens</strong>
                <span aria-hidden="true">|</span>
                <span>
                  {filterResult.visibleFolders.length}{' '}
                  {filterResult.visibleFolders.length === 1 ? 'pasta' : 'pastas'}{' '}
                  · {filterResult.visibleAssets.length}{' '}
                  {filterResult.visibleAssets.length === 1 ? 'asset' : 'assets'}
                </span>
              </div>

              {filterResult.visibleAssets.length > 0 && (
                <div className="explorer-footer__actions">
                  <button
                    type="button"
                    className="nautia-btn-chip"
                    onClick={selectAllVisibleAssets}
                  >
                    Selecionar todos ({filterResult.visibleAssets.length})
                  </button>
                  {selectedAssets.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="nautia-btn-chip is-active"
                        onClick={() =>
                          setMoveModalPayload({
                            kind: 'assets',
                            assetIds: selectedAssets.map((item) => item.id),
                          })
                        }
                      >
                        Mover para... ({selectedAssets.length})
                      </button>
                      <button
                        type="button"
                        className="nautia-btn-chip"
                        onClick={clearAssetSelection}
                      >
                        Limpar seleção
                      </button>
                    </>
                  )}
                </div>
              )}
            </footer>
          </div>
        </div>

        {/* COLUNA DIREITA: INSPETOR DA SELEÇÃO + NAUTIA CONTEXTUAL (ETAPA 19) */}
        <details open className="studio-inspector">
          <summary>Detalhes da seleção</summary>

          <div className="studio-inspector__body">
            {inspectedAsset ? (() => {
              const displayPath = formatDisplayPath(inspectedAsset.caminho);
              const isLongPath = displayPath.length > 68;
              const compactPath =
                isLongPath && !showFullPath
                  ? `…${displayPath.slice(-64)}`
                  : displayPath;
              const verificationStatus =
                inspectedAsset.verificationStatus ?? 'not_verified';
              const verificationLabel =
                VERIFICATION_STATUS_LABELS[verificationStatus];
              const formatLabel = (
                inspectedAsset.detectedFormat ||
                inspectedAsset.formato ||
                ''
              )
                .replace(/^\./, '')
                .toUpperCase();
              const analysisStateLabel = inspectedAsset.analysisReport
                ? verificationStatus === 'verified'
                  ? 'Verificada'
                  : 'Parcial'
                : verificationStatus === 'verified'
                  ? 'Verificada'
                  : 'Não realizada';

              return (
                <div className="studio-inspector__asset">
                  <header className="studio-inspector__header">
                    <div className="studio-inspector__header-actions">
                      <div className="studio-inspector__header-meta">
                        <span className="studio-inspector__kind-label">
                          {inspectedAsset.kind === 'project'
                            ? 'Projeto'
                            : inspectedAsset.kind === 'package'
                              ? 'Pacote'
                              : 'Asset'}
                        </span>
                        <span
                          className={`studio-inspector__status-text is-${verificationStatus}`}
                        >
                          <span aria-hidden="true">•</span> {verificationLabel}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="nautia-btn-chip"
                        aria-haspopup="menu"
                        onClick={(event) =>
                          openContextMenuFromAnchor(
                            event.currentTarget,
                            inspectedAsset.nome,
                            buildSingleAssetMenuSections(inspectedAsset),
                          )
                        }
                      >
                        Ações
                      </button>
                    </div>
                    <h3 className="studio-inspector__asset-title">
                      <AssetIcon asset={inspectedAsset} />
                      <span>{inspectedAsset.nome}</span>
                    </h3>
                  </header>

                  <div className="studio-inspector__preview">
                    <AssetViewer
                      assetId={inspectedAsset.id}
                      path={inspectedAsset.caminho}
                      iconRecord={inspectedAsset}
                    />
                  </div>

                  {/* SEÇÃO 1: IDENTIFICAÇÃO ESSENCIAL */}
                  <section
                    className="studio-inspector__section"
                    aria-label="1. Identificação"
                  >
                    <h4 className="studio-inspector__section-title">
                      Identificação
                    </h4>
                    <dl className="studio-inspector__meta">
                      <div>
                        <dt>Categoria</dt>
                        <dd className="studio-inspector__category-cell">
                          <span className="studio-inspector__category-inline">
                            <FolderTagIconGlyph
                              icon={resolveCategoryIcon(
                                inspectedAsset.categoria,
                                inspectedAsset.kind,
                              )}
                              className="nautia-mini-svg"
                            />
                            <span>{inspectedAsset.categoria}</span>
                          </span>
                          {(!inspectedAsset.kind ||
                            inspectedAsset.kind === 'asset') && (
                            <select
                              className="studio-inspector__inline-select"
                              aria-label="Alterar categoria do asset"
                              value={inspectedAsset.categoria}
                              onChange={(e) =>
                                handleInspectorUpdateCategory(e.target.value)
                              }
                            >
                              {INDIVIDUAL_ASSET_CATEGORIES.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </dd>
                      </div>
                      {formatLabel && formatLabel !== 'AUTO' && (
                        <div>
                          <dt>Formato</dt>
                          <dd>{formatLabel}</dd>
                        </div>
                      )}
                      {inspectedAsset.fileSize && (
                        <div>
                          <dt>Tamanho</dt>
                          <dd>{inspectedAsset.fileSize}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Verificação</dt>
                        <dd>{verificationLabel}</dd>
                      </div>
                    </dl>
                  </section>

                  {/* SEÇÃO 2: ORGANIZAÇÃO E ETIQUETAS */}
                  <section
                    className="studio-inspector__section"
                    aria-label="2. Organização"
                  >
                    <h4 className="studio-inspector__section-title">
                      Organização
                    </h4>
                    <dl className="studio-inspector__meta">
                      <div className="studio-inspector__meta-full">
                        <dt>Pasta atual</dt>
                        <dd className="studio-inspector__folder-cell">
                          <span>{inspectedAssetFolderTrail}</span>
                          <button
                            type="button"
                            className="nautia-btn-chip"
                            onClick={() => openMoveModalForAsset(inspectedAsset.id)}
                          >
                            Mover para...
                          </button>
                        </dd>
                      </div>
                      {(inspectedAsset.projeto || '').trim() !== '' && (
                        <div>
                          <dt>Projeto associado</dt>
                          <dd>
                            <input
                              key={`project-${inspectedAsset.id}-${inspectedAsset.projeto}`}
                              aria-label="Projeto associado ao registro"
                              className="studio-inspector__inline-select"
                              defaultValue={inspectedAsset.projeto ?? ''}
                              placeholder="Sem projeto"
                              onBlur={(e) =>
                                editRecord(inspectedAsset, 'projeto', e.target.value)
                              }
                            />
                          </dd>
                        </div>
                      )}
                      {inspectedAsset.sourceSoftware &&
                        inspectedAsset.sourceSoftware !== 'unknown' && (
                          <div>
                            <dt>Software de origem</dt>
                            <dd>
                              {
                                ORIGIN_SOFTWARE_LABELS[
                                  inspectedAsset.sourceSoftware
                                ]
                              }
                            </dd>
                          </div>
                        )}
                    </dl>

                    <div
                      aria-label="4. Etiquetas do asset"
                      className="studio-inspector__folder-tags-group"
                    >
                      <TagPicker
                        id={`inspector-tags-${inspectedAsset.id}`}
                        compact
                        label="Etiquetas"
                        optionalHint="asset"
                        placeholder="Buscar ou criar etiqueta..."
                        availableTags={inspectorTagOptions}
                        selectedTags={inspectedAsset.tags}
                        onChange={handleInspectorTagsChange}
                      />

                      {inspectedAsset.tags.length > 0 && (
                        <div
                          className="studio-inspector__tag-usage"
                          aria-label="Uso das etiquetas no Convés"
                        >
                          {inspectedAsset.tags.map((tag) => {
                            const usageCount =
                              assetTagUsageCounts.get(normalizeTagLabel(tag)) ??
                              1;
                            return (
                              <span
                                key={tag}
                                className="studio-inspector__tag-usage-item"
                              >
                                #{tag}: {usageCount}{' '}
                                {usageCount === 1 ? 'asset' : 'assets'}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Sugestões Inteligentes da NautIA (Etapas 07 e 08) */}
                      {inspectedClassification &&
                        (inspectedClassification.suggestions.tagSuggestions
                          .length > 0 ||
                          (inspectedClassification.suggestions
                            .categorySuggestion.suggestedCategory &&
                            normalizeTagLabel(
                              inspectedClassification.suggestions
                                .categorySuggestion.suggestedCategory,
                            ) !==
                              normalizeTagLabel(inspectedAsset.categoria))) && (
                          <div
                            className="studio-inspector__nautia-suggestions"
                            aria-label="Sugestões da NautIA"
                          >
                            <div className="studio-inspector__nautia-head">
                              <FolderTagIconGlyph
                                icon="sparkles"
                                className="nautia-mini-svg"
                              />
                              <strong>Sugestões da NautIA</strong>
                              <span className="studio-inspector__nautia-note">
                                Requer confirmação
                              </span>
                            </div>

                            {inspectedClassification.suggestions
                              .categorySuggestion.suggestedCategory &&
                              normalizeTagLabel(
                                inspectedClassification.suggestions
                                  .categorySuggestion.suggestedCategory,
                              ) !== normalizeTagLabel(inspectedAsset.categoria) && (
                                <div className="studio-inspector__category-suggestion">
                                  <p>
                                    Categoria sugerida:{' '}
                                    <strong>
                                      {
                                        inspectedClassification.suggestions
                                          .categorySuggestion.suggestedCategory
                                      }
                                    </strong>{' '}
                                    <small>
                                      (
                                      {
                                        inspectedClassification.suggestions
                                          .categorySuggestion.justification
                                      }
                                      )
                                    </small>
                                  </p>
                                  <button
                                    type="button"
                                    className="nautia-btn-chip"
                                    onClick={() =>
                                      handleInspectorUpdateCategory(
                                        inspectedClassification.suggestions
                                          .categorySuggestion.suggestedCategory!,
                                      )
                                    }
                                  >
                                    Confirmar categoria
                                  </button>
                                </div>
                              )}

                            {inspectedClassification.suggestions.tagSuggestions
                              .length > 0 && (
                              <div className="studio-inspector__suggested-tags">
                                {inspectedClassification.suggestions.tagSuggestions.map(
                                  (sug) => (
                                    <button
                                      key={sug.normalizedLabel}
                                      type="button"
                                      className="studio-inspector__suggested-tag-btn"
                                      title={sug.reason}
                                      onClick={() =>
                                        handleInspectorAddTag(sug.label)
                                      }
                                    >
                                      <span>+ #{sug.label}</span>
                                    </button>
                                  ),
                                )}
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                  </section>

                  {/* AÇÕES PRINCIPAIS */}
                  <div className="studio-inspector__actions">
                    {onInspectAsset && (
                      <button
                        type="button"
                        className="nautia-btn-primary"
                        onClick={() => onInspectAsset(inspectedAsset)}
                      >
                        Abrir no Inspetor
                      </button>
                    )}
                    <button
                      type="button"
                      className="nautia-btn-ghost"
                      onClick={() => void locateOriginal(inspectedAsset)}
                    >
                      Localizar original
                    </button>
                    <button
                      type="button"
                      className="nautia-btn-ghost"
                      onClick={() => openMoveModalForAsset(inspectedAsset.id)}
                    >
                      Mover para...
                    </button>
                  </div>

                  {/* SEÇÃO 3 RECOLHÍVEL: INFORMAÇÕES TÉCNICAS SOB DEMANDA */}
                  <details
                    className="studio-inspector__section studio-inspector__collapsible"
                    aria-label="3. Informações técnicas"
                    open={vaultSectionExpanded || undefined}
                  >
                    <summary>
                      <span>Informações técnicas</span>
                      <span
                        className={`studio-inspector__verification-pill is-${verificationStatus}`}
                      >
                        {analysisStateLabel}
                      </span>
                    </summary>

                    <div className="studio-inspector__collapsible-body">
                      <div className="studio-inspector__section-head">
                        <span className="studio-inspector__sub-label">
                          Análise: {analysisStateLabel} · Última:{' '}
                          {inspectedAsset.lastAnalyzedAt
                            ? formatRecordDate(inspectedAsset.lastAnalyzedAt)
                            : 'Automática'}
                        </span>
                        {operations && (
                          <button
                            type="button"
                            className="nautia-btn-chip"
                            onClick={handleInspectorRunDiagnostics}
                          >
                            Analisar
                          </button>
                        )}
                      </div>

                      <div className="studio-inspector__path-box">
                        <span className="studio-inspector__sub-label">
                          Caminho completo
                        </span>
                        <span className="studio-inspector__path">
                          {compactPath}
                        </span>
                        <div className="studio-inspector__path-actions">
                          <button
                            type="button"
                            className="nautia-btn-chip"
                            onClick={() => void copyAssetPath(inspectedAsset)}
                          >
                            Copiar caminho
                          </button>
                          {isLongPath && (
                            <button
                              type="button"
                              className="nautia-btn-chip"
                              onClick={() => setShowFullPath((prev) => !prev)}
                            >
                              {showFullPath
                                ? 'Recolher caminho'
                                : 'Ver caminho completo'}
                            </button>
                          )}
                        </div>
                      </div>

                      <dl className="studio-inspector__meta">
                        <div>
                          <dt>Registrado em</dt>
                          <dd>{formatRecordDate(inspectedAsset.createdAt)}</dd>
                        </div>
                        <div>
                          <dt>Atualizado em</dt>
                          <dd>
                            {formatRecordDate(
                              inspectedAsset.updatedAt ||
                                inspectedAsset.createdAt,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Destinos pretendidos</dt>
                          <dd>
                            {(inspectedAsset.targetSoftware ?? []).length > 0
                              ? (inspectedAsset.targetSoftware ?? [])
                                  .map(
                                    (sw) => ORIGIN_SOFTWARE_LABELS[sw] ?? sw,
                                  )
                                  .join(', ')
                              : inspectedAsset.engine || 'Universal'}
                          </dd>
                        </div>
                        <div className="studio-inspector__meta-full">
                          <dt>Metadados extraídos</dt>
                          <dd className="studio-inspector__diagnostic-text">
                            {inspectedAsset.technicalType || 'Asset técnico'}
                            {inspectedAsset.projectDirectory
                              ? ` · Diretório: ${formatDisplayPath(inspectedAsset.projectDirectory)}`
                              : ''}
                            {(inspectedAsset.structureMarkers ?? []).length > 0
                              ? ` · Marcadores: ${(
                                  inspectedAsset.structureMarkers ?? []
                                ).join(', ')}`
                              : ''}
                          </dd>
                        </div>
                      </dl>

                      {inspectedClassification && (
                        <div className="studio-inspector__path-box">
                          <span className="studio-inspector__sub-label">
                            Compatibilidade e diagnóstico
                          </span>
                          <p className="studio-inspector__diagnostic-text">
                            <strong>
                              {
                                inspectedClassification.technicalInference
                                  .diagnosticTitle
                              }
                            </strong>{' '}
                            —{' '}
                            {sanitizeTechnicalMetadataText(
                              inspectedClassification.technicalInference
                                .diagnosticSummary,
                            )}
                          </p>
                          {inspectedClassification.technicalInference.warnings
                            .length > 0 && (
                            <div className="studio-inspector__warnings">
                              {inspectedClassification.technicalInference.warnings.map(
                                (w) => (
                                  <span
                                    key={w}
                                    className="studio-inspector__warning-item"
                                  >
                                    ⚠ {sanitizeTechnicalMetadataText(w)}
                                  </span>
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {inspectedAsset.analysisReport && (
                        <button
                          type="button"
                          className="nautia-btn-ghost"
                          onClick={() =>
                            setDiagnosticReports([
                              inspectedAsset.analysisReport!,
                            ])
                          }
                        >
                          {inspectedAsset.analysisReport.rulesetVersion !==
                            RULESET_VERSION ||
                          inspectedAsset.analysisReport.contextKey !==
                            analysisContextKey(inspectedAsset)
                            ? 'Diagnóstico salvo (desatualizado — reanalise)'
                            : 'Abrir último diagnóstico salvo'}
                        </button>
                      )}

                      <details
                        className="studio-inspector__subcollapsible"
                        open={vaultSectionExpanded || undefined}
                      >
                        <summary>Cofre, backup e exportação</summary>
                        <AssetVaultPanel
                          key={inspectedAsset.id}
                          asset={inspectedAsset}
                          operations={operations}
                          changed={onLibraryMutated}
                          notify={onNotify}
                        />
                      </details>
                    </div>
                  </details>
                </div>
              );
            })() : selectedAssets.length > 1 ? (
              <div className="studio-inspector__multi">
                <span className="nautia-eyebrow">Seleção múltipla</span>
                <h3>{selectedAssets.length} assets selecionados</h3>
                <p className="nautia-muted-note">
                  Organize, aplique etiquetas ou mova todos os itens selecionados.
                </p>
                <div className="studio-inspector__actions">
                  <button
                    type="button"
                    className="nautia-btn-primary"
                    onClick={() =>
                      setMoveModalPayload({
                        kind: 'assets',
                        assetIds: selectedAssets.map((item) => item.id),
                      })
                    }
                  >
                    Mover selecionados
                  </button>
                  <button
                    type="button"
                    className="nautia-btn-ghost"
                    onClick={() => {
                      setBatchTagsModalIds(selectedAssets.map((item) => item.id));
                      setBatchTagsDraft([]);
                    }}
                  >
                    Gerenciar etiquetas
                  </button>
                  <button
                    type="button"
                    className="nautia-btn-ghost nautia-btn-danger"
                    onClick={() =>
                      setBatchTrashIds(selectedAssets.map((item) => item.id))
                    }
                  >
                    Mover para a lixeira
                  </button>
                </div>
              </div>
            ) : inspectedFolder && discoveredFolderTags ? (
              <section
                className="studio-inspector__section studio-inspector__folder-card"
                aria-label={`Pasta ${inspectedFolder.name}`}
              >
                <div className="studio-inspector__folder-head">
                  <div className="studio-inspector__folder-title">
                    <FolderTagIconGlyph
                      icon="folder"
                      className="nautia-icon-svg"
                    />
                    <div>
                      <h3>{inspectedFolder.name}</h3>
                      <p className="studio-inspector__folder-location">
                        {inspectedFolderTrail} ·{' '}
                        {inspectedFolderCounts.totalItems}{' '}
                        {inspectedFolderCounts.totalItems === 1
                          ? 'item'
                          : 'itens'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="nautia-btn-chip"
                    aria-haspopup="menu"
                    onClick={(event) =>
                      openContextMenuFromAnchor(
                        event.currentTarget,
                        inspectedFolder.name,
                        buildFolderMenuSections(inspectedFolder),
                      )
                    }
                  >
                    Ações
                  </button>
                </div>

                <div className="studio-inspector__actions">
                  {state.currentParentId !== inspectedFolder.id && (
                    <button
                      type="button"
                      className="nautia-btn-primary"
                      onClick={() => handleOpenFolder(inspectedFolder.id)}
                    >
                      Abrir pasta
                    </button>
                  )}
                  <button
                    type="button"
                    className="nautia-btn-ghost"
                    onClick={() => openMoveModalForFolder(inspectedFolder.id)}
                  >
                    Mover para...
                  </button>
                  {onRenameFolder && (
                    <button
                      type="button"
                      className="nautia-btn-ghost"
                      onClick={() => onRenameFolder(inspectedFolder)}
                    >
                      Renomear
                    </button>
                  )}
                </div>

                <div className="studio-inspector__folder-tags-group">
                  <div className="studio-inspector__section-head">
                    <span className="studio-inspector__sub-label">
                      Etiquetas próprias
                    </span>
                    <button
                      type="button"
                      className="nautia-btn-chip"
                      onClick={() => setEditingFolderTags((prev) => !prev)}
                    >
                      {editingFolderTags ? 'Concluir' : 'Editar etiquetas'}
                    </button>
                  </div>
                  <div className="studio-inspector__tags">
                    {(inspectedFolder.folderTagIds ?? []).length > 0 ? (
                      (inspectedFolder.folderTagIds ?? []).map((id) => {
                        const fTag = tagById.get(id);
                        return fTag ? (
                          <span key={id} className="studio-inspector__tag-pill">
                            <FolderTagIconGlyph
                              icon={fTag.icon}
                              className="nautia-mini-svg"
                            />
                            <span>{fTag.label}</span>
                          </span>
                        ) : null;
                      })
                    ) : (
                      <span className="nautia-muted-note">
                        Sem etiquetas próprias
                      </span>
                    )}
                  </div>

                  {editingFolderTags && (
                    <div className="studio-inspector__folder-tag-editor">
                      {folderTags.map((tag) => {
                        const active = (
                          inspectedFolder.folderTagIds ?? []
                        ).includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            aria-pressed={active}
                            className={`nautia-btn-chip ${
                              active ? 'is-active' : ''
                            }`}
                            onClick={() =>
                              toggleTagOnFolder(inspectedFolder.id, tag.id)
                            }
                          >
                            {active ? '✓ ' : '+ '}
                            {tag.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <details className="studio-inspector__subcollapsible">
                  <summary>
                    Etiquetas encontradas no conteúdo (
                    {discoveredFolderTags.discoveredTags.length})
                  </summary>
                  <div className="studio-inspector__collapsible-body">
                    <div className="studio-inspector__section-head">
                      <span className="studio-inspector__sub-label">
                        {discoveredFolderTags.totalAssetsInScope}{' '}
                        {discoveredFolderTags.totalAssetsInScope === 1
                          ? 'asset no escopo'
                          : 'assets no escopo'}
                      </span>
                      <div
                        className="studio-inspector__scope-toggle"
                        role="group"
                        aria-label="Escopo das etiquetas encontradas"
                      >
                        <button
                          type="button"
                          className={`nautia-btn-chip ${
                            discoveredTagScope === 'direct' ? 'is-active' : ''
                          }`}
                          onClick={() => setDiscoveredTagScope('direct')}
                        >
                          Diretos
                        </button>
                        <button
                          type="button"
                          className={`nautia-btn-chip ${
                            discoveredTagScope === 'recursive' ? 'is-active' : ''
                          }`}
                          onClick={() => setDiscoveredTagScope('recursive')}
                        >
                          + Subpastas
                        </button>
                      </div>
                    </div>
                    <div className="studio-inspector__tags">
                      {discoveredFolderTags.discoveredTags.length > 0 ? (
                        discoveredFolderTags.discoveredTags.map((dTag) => (
                          <button
                            key={dTag.normalizedLabel}
                            type="button"
                            className="studio-inspector__discovered-pill"
                            title="Filtrar por esta etiqueta encontrada nos assets"
                            onClick={() =>
                              updateUniversalFilters({
                                assetTagQuery: dTag.label,
                                tagScope: 'asset',
                              })
                            }
                          >
                            <span>#{dTag.label}</span>
                            <small>({dTag.assetCount})</small>
                          </button>
                        ))
                      ) : (
                        <span className="nautia-muted-note">
                          Nenhuma etiqueta encontrada neste escopo.
                        </span>
                      )}
                    </div>
                  </div>
                </details>
              </section>
            ) : (
              <div className="studio-inspector__empty-clean">
                <p>Selecione um asset ou pasta para visualizar os detalhes.</p>
              </div>
            )}

            <NautiaQuickActions
              selectedAssets={selectedAssets}
              defaultCollapsed={false}
              onClearSelection={clearAssetSelection}
              onOpenNautiaModule={onOpenNautia}
              onDispatchAction={handleDispatchQuickAction}
            />
          </div>
        </details>
      </div>

      <CreateFolderModal
        isOpen={isFolderModalOpen}
        parentId={
          createFolderParentId !== undefined
            ? createFolderParentId
            : state.currentParentId
        }
        parentName={
          createFolderParentId !== undefined
            ? (createFolderParentId
                ? (folderById.get(createFolderParentId)?.name ?? 'Pasta')
                : 'Convés (Raiz)')
            : (currentParentFolder?.name ?? 'Convés (Raiz)')
        }
        folderTags={folderTags}
        errorMessage={state.lastTagError}
        onCreateFolder={(input) => {
          const created = createFolder(input);
          if (created) {
            onNotify?.(`Pasta "${created.name}" criada com etiqueta obrigatória.`);
          }
          return created;
        }}
        onClose={() => {
          setIsFolderModalOpen(false);
          setCreateFolderParentId(undefined);
        }}
      />

      <MoveToFolderModal
        isOpen={moveModalPayload !== null}
        payload={moveModalPayload}
        folders={folders}
        assets={assets}
        folderTags={folderTags}
        onConfirmMove={(targetFolderId) => {
          if (!moveModalPayload) return;
          executeMovePayload(moveModalPayload, targetFolderId);
        }}
        onCreateFolder={(input) => {
          const created = createFolder(input);
          if (created) {
            onNotify?.(`Pasta "${created.name}" criada com etiqueta obrigatória.`);
          }
          return created;
        }}
        onClose={() => setMoveModalPayload(null)}
      />

      <TagManagerModal
        isOpen={isTagManagerOpen}
        assets={assets}
        folders={folders}
        assetTags={assetTags}
        folderTags={folderTags}
        operations={operations}
        onLibraryMutated={onLibraryMutated}
        onNotify={onNotify}
        onClose={() => setIsTagManagerOpen(false)}
      />

      <ExplorerContextMenu
        isOpen={contextMenuState !== null}
        x={contextMenuState?.x ?? 0}
        y={contextMenuState?.y ?? 0}
        title={contextMenuState?.title}
        sections={contextMenuState?.sections ?? []}
        onClose={() => setContextMenuState(null)}
      />

      {renamingAsset && (
        <div
          className="nautia-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-asset-modal-title"
        >
          <form
            className="nautia-modal-card nautia-compact-modal"
            onSubmit={handleConfirmRenameAsset}
          >
            <header className="nautia-modal-header">
              <div>
                <span className="nautia-eyebrow">Convés / Registro</span>
                <h2 id="rename-asset-modal-title" className="nautia-section-title">
                  Renomear registro
                </h2>
              </div>
              <button
                type="button"
                className="nautia-btn-ghost"
                onClick={() => setRenamingAsset(null)}
              >
                Cancelar
              </button>
            </header>
            <label className="nautia-field">
              <span>Novo nome</span>
              <input
                type="text"
                maxLength={120}
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                autoFocus
                required
              />
            </label>
            <footer className="nautia-modal-footer">
              <button
                type="button"
                className="nautia-btn-ghost"
                onClick={() => setRenamingAsset(null)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="nautia-btn-primary"
                disabled={!renameDraft.trim()}
              >
                Salvar nome
              </button>
            </footer>
          </form>
        </div>
      )}

      {batchTagsModalIds && (
        <div
          className="nautia-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-tags-modal-title"
        >
          <form
            className="nautia-modal-card nautia-compact-modal"
            onSubmit={handleConfirmBatchTags}
          >
            <header className="nautia-modal-header">
              <div>
                <span className="nautia-eyebrow">Convés / Etiquetas</span>
                <h2 id="batch-tags-modal-title" className="nautia-section-title">
                  {batchTagsModalIds.length === 1
                    ? 'Gerenciar etiquetas do asset'
                    : `Aplicar etiquetas (${batchTagsModalIds.length} selecionados)`}
                </h2>
              </div>
              <button
                type="button"
                className="nautia-btn-ghost"
                onClick={() => setBatchTagsModalIds(null)}
              >
                Fechar
              </button>
            </header>
            <TagPicker
              id="context-batch-tags-picker"
              label="Etiquetas"
              optionalHint="asset"
              placeholder="Pesquisar ou criar etiqueta..."
              availableTags={inspectorTagOptions}
              selectedTags={batchTagsDraft}
              onChange={setBatchTagsDraft}
            />
            <footer className="nautia-modal-footer">
              <button
                type="button"
                className="nautia-btn-ghost"
                onClick={() => setBatchTagsModalIds(null)}
              >
                Cancelar
              </button>
              <button type="submit" className="nautia-btn-primary">
                Aplicar etiquetas
              </button>
            </footer>
          </form>
        </div>
      )}

      {folderTagsModalId && (
        <div
          className="nautia-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="folder-tags-modal-title"
        >
          <form
            className="nautia-modal-card nautia-compact-modal"
            onSubmit={handleConfirmFolderTags}
          >
            <header className="nautia-modal-header">
              <div>
                <span className="nautia-eyebrow">Convés / Etiquetas de Pasta</span>
                <h2 id="folder-tags-modal-title" className="nautia-section-title">
                  Gerenciar etiquetas da pasta
                </h2>
              </div>
              <button
                type="button"
                className="nautia-btn-ghost"
                onClick={() => setFolderTagsModalId(null)}
              >
                Fechar
              </button>
            </header>
            <TagPicker
              id="context-folder-tags-picker"
              label="Etiquetas da pasta"
              optionalHint="independente dos assets"
              placeholder="Pesquisar ou criar etiqueta..."
              availableTags={inspectorTagOptions}
              selectedTags={folderTagsDraft}
              onChange={setFolderTagsDraft}
            />
            <footer className="nautia-modal-footer">
              <button
                type="button"
                className="nautia-btn-ghost"
                onClick={() => setFolderTagsModalId(null)}
              >
                Cancelar
              </button>
              <button type="submit" className="nautia-btn-primary">
                Aplicar etiquetas
              </button>
            </footer>
          </form>
        </div>
      )}

      {exportModalState && (
        <DeckExportModal
          asset={exportModalState.asset}
          mode={exportModalState.mode}
          onClose={() => setExportModalState(null)}
          onNotify={onNotify}
        />
      )}

      {batchTrashIds && (
        <div
          className="nautia-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-trash-modal-title"
        >
          <div className="nautia-modal-card nautia-compact-modal">
            <header className="nautia-modal-header">
              <div>
                <span className="nautia-eyebrow">Convés / Confirmação</span>
                <h2 id="batch-trash-modal-title" className="nautia-section-title">
                  Mover {batchTrashIds.length} itens para a lixeira?
                </h2>
              </div>
            </header>
            <p className="nautia-muted-note">
              Os registros serão enviados para a lixeira e poderão ser restaurados depois. Os arquivos físicos no disco não serão apagados.
            </p>
            <footer className="nautia-modal-footer">
              <button
                type="button"
                className="nautia-btn-ghost"
                onClick={() => setBatchTrashIds(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="nautia-btn-ghost nautia-btn-danger"
                onClick={handleConfirmBatchTrash}
              >
                Confirmar exclusão
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};
