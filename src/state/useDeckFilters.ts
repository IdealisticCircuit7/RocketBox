import { useCallback, useMemo, useReducer } from 'react';
import {
  countFoldersByTag,
  createCleanAssetRecord,
  createFolderTag,
  CreateFolderTagInput,
  createFolderWithRequiredTag,
  CreateFolderWithTagInput,
  DeckAsset,
  DeckFilterResult,
  DeckFolder,
  DEFAULT_UNIVERSAL_FILTERS,
  EtiquetaDePasta,
  extractUniversalFilterOptions,
  filterFolderTagCatalog,
  FilterMatchMode,
  RegisterAssetInput,
  runDeckFilters,
  toggleFolderTagOnFolder,
  UniversalFilterCriteria,
} from '../services/deckFilterService';
import { resolveSelectedAssetsScope } from '../services/nautiaQuickActionsService';

/**
 * Estado do Convés — Passo 2 e Etapa 02 (Nível 1).
 * Gerencia de forma determinística etiquetas de pastas, isolamento de pastas,
 * filtros universais combinados, seleção de assets e fluxos de criação/registro.
 */

export interface DeckFiltersState {
  readonly currentParentId: string | null;
  readonly selectedTagIds: readonly string[];
  readonly selectedAssetIds: readonly string[];
  readonly tagSearchQuery: string;
  readonly tagMatchMode: FilterMatchMode;
  readonly universalFilters: UniversalFilterCriteria;
  readonly lastTagError: string | null;
}

type DeckFiltersAction =
  | { type: 'SET_CURRENT_PARENT'; parentId: string | null }
  | { type: 'TOGGLE_TAG_FILTER'; tagId: string }
  | { type: 'SELECT_EXCLUSIVE_TAG'; tagId: string }
  | { type: 'TOGGLE_ASSET_SELECTION'; assetId: string }
  | { type: 'SET_SELECTED_ASSETS'; assetIds: readonly string[] }
  | { type: 'CLEAR_ASSET_SELECTION' }
  | { type: 'SET_TAG_SEARCH_QUERY'; query: string }
  | { type: 'SET_TAG_MATCH_MODE'; mode: FilterMatchMode }
  | { type: 'UPDATE_UNIVERSAL_FILTERS'; patch: Partial<UniversalFilterCriteria> }
  | { type: 'CLEAR_ALL_FILTERS' }
  | { type: 'SET_TAG_ERROR'; error: string | null };

const INITIAL_STATE: DeckFiltersState = {
  currentParentId: null,
  selectedTagIds: [],
  selectedAssetIds: [],
  tagSearchQuery: '',
  tagMatchMode: 'any',
  universalFilters: DEFAULT_UNIVERSAL_FILTERS,
  lastTagError: null,
};

function deckFiltersReducer(
  state: DeckFiltersState,
  action: DeckFiltersAction,
): DeckFiltersState {
  switch (action.type) {
    case 'SET_CURRENT_PARENT':
      return {
        ...state,
        currentParentId: action.parentId,
      };

    case 'TOGGLE_TAG_FILTER': {
      const exists = state.selectedTagIds.includes(action.tagId);
      return {
        ...state,
        selectedTagIds: exists
          ? state.selectedTagIds.filter((id) => id !== action.tagId)
          : [...state.selectedTagIds, action.tagId],
        lastTagError: null,
      };
    }

    case 'SELECT_EXCLUSIVE_TAG': {
      const isOnlySelected =
        state.selectedTagIds.length === 1 && state.selectedTagIds[0] === action.tagId;
      return {
        ...state,
        selectedTagIds: isOnlySelected ? [] : [action.tagId],
        lastTagError: null,
      };
    }

    case 'TOGGLE_ASSET_SELECTION': {
      const exists = state.selectedAssetIds.includes(action.assetId);
      return {
        ...state,
        selectedAssetIds: exists
          ? state.selectedAssetIds.filter((id) => id !== action.assetId)
          : [...state.selectedAssetIds, action.assetId],
      };
    }

    case 'SET_SELECTED_ASSETS':
      return {
        ...state,
        selectedAssetIds: Array.from(new Set(action.assetIds)),
      };

    case 'CLEAR_ASSET_SELECTION':
      return {
        ...state,
        selectedAssetIds: [],
      };

    case 'SET_TAG_SEARCH_QUERY':
      return {
        ...state,
        tagSearchQuery: action.query,
        lastTagError: null,
      };

    case 'SET_TAG_MATCH_MODE':
      return {
        ...state,
        tagMatchMode: action.mode,
      };

    case 'UPDATE_UNIVERSAL_FILTERS':
      return {
        ...state,
        universalFilters: {
          ...state.universalFilters,
          ...action.patch,
        },
      };

    case 'CLEAR_ALL_FILTERS':
      return {
        ...state,
        selectedTagIds: [],
        tagSearchQuery: '',
        universalFilters: DEFAULT_UNIVERSAL_FILTERS,
        lastTagError: null,
      };

    case 'SET_TAG_ERROR':
      return {
        ...state,
        lastTagError: action.error,
      };

    default:
      return state;
  }
}

export interface UseDeckFiltersParams {
  readonly allFolders?: boolean;
  readonly folders: readonly DeckFolder[];
  readonly assets: readonly DeckAsset[];
  readonly folderTags: readonly EtiquetaDePasta[];
  readonly onFolderTagsChange: (nextTags: EtiquetaDePasta[]) => void;
  readonly onFoldersChange: (nextFolders: DeckFolder[]) => void;
  readonly onAssetsChange?: (nextAssets: DeckAsset[]) => void;
  readonly initialParentId?: string | null;
}

export interface UseDeckFiltersReturn {
  readonly state: DeckFiltersState;
  readonly visibleTagIcons: readonly EtiquetaDePasta[];
  readonly folderCountByTag: ReadonlyMap<string, number>;
  readonly filterResult: DeckFilterResult;
  readonly selectedAssets: readonly DeckAsset[];
  readonly universalOptions: {
    readonly fileTypes: readonly string[];
    readonly formats: readonly string[];
    readonly projects: readonly string[];
    readonly assetTags: readonly string[];
  };
  readonly setCurrentParent: (parentId: string | null) => void;
  readonly toggleTagFilter: (tagId: string) => void;
  readonly selectExclusiveTag: (tagId: string) => void;
  readonly toggleAssetSelection: (assetId: string) => void;
  readonly selectAllVisibleAssets: () => void;
  readonly clearAssetSelection: () => void;
  readonly setTagSearchQuery: (query: string) => void;
  readonly setTagMatchMode: (mode: FilterMatchMode) => void;
  readonly updateUniversalFilters: (patch: Partial<UniversalFilterCriteria>) => void;
  readonly clearAllFilters: () => void;
  readonly createAndOptionallyApplyTag: (
    input: CreateFolderTagInput,
    targetFolderId?: string | null,
  ) => EtiquetaDePasta | null;
  readonly createFolder: (input: CreateFolderWithTagInput) => DeckFolder | null;
  readonly registerAsset: (input: RegisterAssetInput) => DeckAsset | null;
  readonly toggleTagOnFolder: (folderId: string, tagId: string) => void;
}

export function useDeckFilters({
  folders,
  assets,
  folderTags,
  onFolderTagsChange,
  onFoldersChange,
  onAssetsChange,
  initialParentId = null,
  allFolders = false,
}: UseDeckFiltersParams): UseDeckFiltersReturn {
  const [state, dispatch] = useReducer(deckFiltersReducer, {
    ...INITIAL_STATE,
    currentParentId: initialParentId,
  });

  const visibleTagIcons = useMemo(
    () => filterFolderTagCatalog(folderTags, state.tagSearchQuery),
    [folderTags, state.tagSearchQuery],
  );

  const folderCountByTag = useMemo(
    () => countFoldersByTag(folders, folderTags),
    [folders, folderTags],
  );

  const universalOptions = useMemo(
    () => extractUniversalFilterOptions(assets),
    [assets],
  );

  const filterResult = useMemo(
    () =>
      runDeckFilters({
        allFolders,
        folders,
        assets,
        folderTags,
        selectedTagIds: state.selectedTagIds,
        tagSearchQuery: state.tagSearchQuery,
        tagMatchMode: state.tagMatchMode,
        currentParentId: state.currentParentId,
        universalFilters: state.universalFilters,
      }),
    [
      allFolders,
      folders,
      assets,
      folderTags,
      state.selectedTagIds,
      state.tagSearchQuery,
      state.tagMatchMode,
      state.currentParentId,
      state.universalFilters,
    ],
  );

  const selectedAssets = useMemo(
    () => resolveSelectedAssetsScope(assets, state.selectedAssetIds),
    [assets, state.selectedAssetIds],
  );

  const setCurrentParent = useCallback((parentId: string | null) => {
    dispatch({ type: 'SET_CURRENT_PARENT', parentId });
  }, []);

  const toggleTagFilter = useCallback((tagId: string) => {
    dispatch({ type: 'TOGGLE_TAG_FILTER', tagId });
  }, []);

  const selectExclusiveTag = useCallback((tagId: string) => {
    dispatch({ type: 'SELECT_EXCLUSIVE_TAG', tagId });
  }, []);

  const toggleAssetSelection = useCallback((assetId: string) => {
    dispatch({ type: 'TOGGLE_ASSET_SELECTION', assetId });
  }, []);

  const selectAllVisibleAssets = useCallback(() => {
    dispatch({
      type: 'SET_SELECTED_ASSETS',
      assetIds: filterResult.visibleAssets.map((asset) => asset.id),
    });
  }, [filterResult.visibleAssets]);

  const clearAssetSelection = useCallback(() => {
    dispatch({ type: 'CLEAR_ASSET_SELECTION' });
  }, []);

  const setTagSearchQuery = useCallback((query: string) => {
    dispatch({ type: 'SET_TAG_SEARCH_QUERY', query });
  }, []);

  const setTagMatchMode = useCallback((mode: FilterMatchMode) => {
    dispatch({ type: 'SET_TAG_MATCH_MODE', mode });
  }, []);

  const updateUniversalFilters = useCallback(
    (patch: Partial<UniversalFilterCriteria>) => {
      dispatch({ type: 'UPDATE_UNIVERSAL_FILTERS', patch });
    },
    [],
  );

  const clearAllFilters = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL_FILTERS' });
  }, []);

  const createAndOptionallyApplyTag = useCallback(
    (input: CreateFolderTagInput, targetFolderId?: string | null): EtiquetaDePasta | null => {
      try {
        const created = createFolderTag(folderTags, input);
        const nextTags = [...folderTags, created];
        onFolderTagsChange(nextTags);

        if (targetFolderId) {
          const nextFolders = toggleFolderTagOnFolder(
            folders,
            nextTags,
            targetFolderId,
            created.id,
          );
          onFoldersChange(nextFolders);
        }

        dispatch({ type: 'SET_TAG_ERROR', error: null });
        return created;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Não foi possível criar a etiqueta.';
        dispatch({ type: 'SET_TAG_ERROR', error: message });
        return null;
      }
    },
    [folderTags, folders, onFolderTagsChange, onFoldersChange],
  );

  const createFolder = useCallback(
    (input: CreateFolderWithTagInput): DeckFolder | null => {
      try {
        const result = createFolderWithRequiredTag(folders, folderTags, input);
        if (result.createdTag) {
          onFolderTagsChange(result.nextFolderTags);
        }
        onFoldersChange(result.nextFolders);
        dispatch({ type: 'SET_TAG_ERROR', error: null });
        return result.folder;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Não foi possível criar a pasta.';
        dispatch({ type: 'SET_TAG_ERROR', error: message });
        return null;
      }
    },
    [folders, folderTags, onFolderTagsChange, onFoldersChange],
  );

  const registerAsset = useCallback(
    (input: RegisterAssetInput): DeckAsset | null => {
      try {
        const created = createCleanAssetRecord(folders, input);
        onAssetsChange?.([...assets, created]);
        dispatch({ type: 'SET_TAG_ERROR', error: null });
        return created;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Não foi possível registrar o asset.';
        dispatch({ type: 'SET_TAG_ERROR', error: message });
        return null;
      }
    },
    [folders, assets, onAssetsChange],
  );

  const toggleTagOnFolder = useCallback(
    (folderId: string, tagId: string) => {
      try {
        const nextFolders = toggleFolderTagOnFolder(folders, folderTags, folderId, tagId);
        onFoldersChange(nextFolders);
        dispatch({ type: 'SET_TAG_ERROR', error: null });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Não foi possível atualizar a pasta.';
        dispatch({ type: 'SET_TAG_ERROR', error: message });
      }
    },
    [folders, folderTags, onFoldersChange],
  );

  return {
    state,
    visibleTagIcons,
    folderCountByTag,
    filterResult,
    selectedAssets,
    universalOptions,
    setCurrentParent,
    toggleTagFilter,
    selectExclusiveTag,
    toggleAssetSelection,
    selectAllVisibleAssets,
    clearAssetSelection,
    setTagSearchQuery,
    setTagMatchMode,
    updateUniversalFilters,
    clearAllFilters,
    createAndOptionallyApplyTag,
    createFolder,
    registerAsset,
    toggleTagOnFolder,
  };
}
