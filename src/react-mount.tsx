import { AssetVaultSettings } from './components/common/AssetVaultPanel';
import { automaticAssetBackup } from './services/assetVaultService';
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { DeckFilteredView } from './components/deck/DeckFilteredView';
import { RegisterAssetForm } from './components/deck/RegisterAssetForm';
import { NautiaModuleView } from './components/nautia/NautiaModuleView';
import {
  buildGlobalTagCatalog,
  DeckAsset,
  DeckFolder,
  ensureAssetTagsCatalog,
  EtiquetaDeAsset,
  EtiquetaDePasta,
} from './services/deckFilterService';
import {
  createLibraryOperationsService,
  WorkspaceSnapshotLike,
  WorkspaceStoreAdapter,
} from './services/libraryOperationsService';
import {
  createOperationHistoryService,
  OperationHistoryEntry,
} from './services/operationHistoryService';
import { Preferences, normalizeAssetPath } from './preferences';
import type { NautiaContext } from './services/nautiaToolSystem';

export interface ReactBridgeParams {
  readonly store: WorkspaceStoreAdapter;
  readonly preferences: {
    snapshot(): Preferences;
    subscribe(fn: (p: Preferences, changed: (keyof Preferences)[]) => void): () => void;
  };
  readonly notify: (message: string) => void;
  readonly navigate: (view: string) => void;
  readonly onExternalSync: () => void;
  readonly onInspectAsset: (asset: DeckAsset) => void;
  readonly onTrashItem: (ref: { type: 'folder' | 'asset'; id: string }) => void;
  readonly onRenameFolder: (folder: DeckFolder) => void;
}

interface BridgeAppProps extends ReactBridgeParams {
  readonly subscribeExternalTick: (listener: () => void) => () => void;
}

const RocketBoxIntelligenceBridge: React.FC<BridgeAppProps> = ({
  store,
  preferences,
  notify,
  navigate,
  onExternalSync,
  onInspectAsset,
  onTrashItem,
  onRenameFolder,
  subscribeExternalTick,
}) => {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshotLike>(() =>
    store.snapshot(),
  );
  const [deckFolderId, setDeckFolderId] = useState<string | null>(null);
  const [deckContext, setDeckContext] = useState<Pick<NautiaContext, 'folderId' | 'filters' | 'collection' | 'folderFilters'>>({ folderId: null, filters: {}, collection: 'Biblioteca' });
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [showAvatar, setShowAvatar] = useState<boolean>(
    () => preferences.snapshot().showNautiaAvatar,
  );

  const operations = useMemo(() => createLibraryOperationsService(store), [store]);
  const history = useMemo(() => createOperationHistoryService(), []);
  const [historyEntries, setHistoryEntries] = useState<
    readonly OperationHistoryEntry[]
  >(() => history.list());

  const refreshAll = () => {
    setSnapshot(store.snapshot());
    setHistoryEntries([...history.list()]);
    onExternalSync();
  };

  useEffect(() => {
    const unsubExternal = subscribeExternalTick(() => {
      setSnapshot(store.snapshot());
    });
    const unsubPrefs = preferences.subscribe((prefs) => {
      setShowAvatar(prefs.showNautiaAvatar);
    });
    return () => {
      unsubExternal();
      unsubPrefs();
    };
  }, [preferences, store, subscribeExternalTick]);

  const folders = (snapshot.folders ?? []) as DeckFolder[];
  const assets = (snapshot.assets ?? []) as DeckAsset[];
  const folderTags = (snapshot.folderTags ?? []) as EtiquetaDePasta[];
  const assetTags = useMemo<readonly EtiquetaDeAsset[]>(() => {
    const rawCatalog = (snapshot.assetTags ?? []) as EtiquetaDeAsset[];
    const activeTagLabels = assets
      .filter((a) => !a.deleted)
      .flatMap((a) => a.tags ?? []);
    return ensureAssetTagsCatalog(rawCatalog, activeTagLabels).catalog;
  }, [snapshot.assetTags, assets]);

  const unifiedAvailableTags = useMemo<readonly EtiquetaDeAsset[]>(() => {
    const globalItems = buildGlobalTagCatalog({
      assets,
      folders,
      assetTags,
      folderTags,
    });
    return globalItems.map((item) => ({
      id: item.id,
      kind: 'asset-tag' as const,
      label: item.label,
      normalizedLabel: item.normalizedLabel,
      color: item.color,
      createdAt: item.createdAt,
    }));
  }, [assets, folders, assetTags, folderTags]);

  const selectedAssets = useMemo(() => {
    const idSet = new Set(selectedAssetIds);
    return assets.filter((asset) => !asset.deleted && idSet.has(asset.id));
  }, [assets, selectedAssetIds]);

  const handleFolderTagsChange = (nextTags: EtiquetaDePasta[]) => {
    try {
      store.transact((draft) => {
        draft.folderTags = nextTags;
      });
      refreshAll();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Erro ao salvar etiquetas.');
    }
  };

  const handleFoldersChange = (nextFolders: DeckFolder[]) => {
    try {
      store.transact((draft) => {
        draft.folders = nextFolders;
      });
      refreshAll();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Erro ao salvar pastas.');
    }
  };

  const handleAssetsChange = (nextAssets: DeckAsset[]) => {
    try {
      store.transact((draft) => {
        draft.assets = nextAssets;
      });
      refreshAll();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Erro ao salvar assets.');
    }
  };

  const convesSlot = document.getElementById('conves-react-root');
  const registerSlot = document.getElementById('register-react-root');
  const nautiaSlot = document.getElementById('nautia-react-root');

  return (
    <>
      {convesSlot &&
        createPortal(
          <DeckFilteredView
            onContextChange={setDeckContext}
            onFolderNavigate={setDeckFolderId}
            folders={folders}
            assets={assets}
            folderTags={folderTags}
            assetTags={assetTags}
            selectedAssetIds={selectedAssetIds}
            onSelectedAssetIdsChange={setSelectedAssetIds}
            onFolderTagsChange={handleFolderTagsChange}
            onFoldersChange={handleFoldersChange}
            onAssetsChange={handleAssetsChange}
            operations={operations}
            history={history}
            historyEntries={historyEntries}
            onLibraryMutated={refreshAll}
            onNotify={notify}
            onOpenRegister={() => navigate('register')}
            onOpenNautia={() => navigate('nautia')}
            onInspectAsset={onInspectAsset}
            onTrashItem={onTrashItem}
            onRenameFolder={onRenameFolder}
          />,
          convesSlot,
        )}

      {registerSlot &&
        createPortal(
          <RegisterAssetForm
            onCancel={() => navigate('workspace')}
            folders={folders}
            availableAssetTags={unifiedAvailableTags}
            onRegisterAsset={(input) => {
              const duplicate = assets.find(asset => !asset.deleted && normalizeAssetPath(asset.caminho) === normalizeAssetPath(input.caminho));
              if (duplicate) {
                notify(`Este caminho já está cadastrado como "${duplicate.nome}".`);
                return null;
              }
              const result = operations.registerAsset(input);
              if (!result.ok || !result.data) {
                notify(result.summary);
                return null;
              }
              void automaticAssetBackup(result.data, notify);
              history.record({ actionType: 'registerAsset', source: 'quick-action', summary: `Cadastro de ${result.data.nome}`, affectedResources: [result.data.id], status: 'executed', resultSummary: result.summary });
              refreshAll();
              notify(result.summary);
              navigate('workspace');
              return result.data;
            }}
          />,
          registerSlot,
        )}

      {nautiaSlot &&
        createPortal(
          <NautiaModuleView
            context={{ ...deckContext, selectedAssetIds: selectedAssets.map(a => a.id), project: selectedAssets.length && selectedAssets.every(a => a.projeto === selectedAssets[0].projeto) ? selectedAssets[0].projeto ?? null : null }}
            currentFolder={folders.find(folder => !folder.deleted && folder.id === deckFolderId)?.name ?? 'Raiz'}
            folders={folders}
            selectedAssets={selectedAssets}
            showAvatar={showAvatar}
            operations={operations}
            history={history}
            historyEntries={historyEntries}
            onLibraryMutated={refreshAll}
            onNotify={notify}
          />,
          nautiaSlot,
        )}
    </>
  );
};

export function mountRocketBoxReactBridge(params: ReactBridgeParams): {
  syncFromStore: () => void;
} {
  let host = document.getElementById('rocketbox-react-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'rocketbox-react-host';
    document.body.append(host);
  }

  const listeners = new Set<() => void>();
  const subscribeExternalTick = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  createRoot(host).render(
    <RocketBoxIntelligenceBridge
      {...params}
      subscribeExternalTick={subscribeExternalTick}
    />,
  );

  return {
    syncFromStore: () => {
      listeners.forEach((fn) => fn());
    },
  };
}

export function mountAssetVaultSettings(host: HTMLElement) { createRoot(host).render(<AssetVaultSettings />); }
