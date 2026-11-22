import React, { useEffect, useMemo, useState } from 'react';
import {
  CreateFolderWithTagInput,
  DeckAsset,
  DeckDragPayload,
  DeckFolder,
  EtiquetaDePasta,
  FolderTagIconId,
  TagAccent,
  buildFolderTreeOrder,
  validateDeckDropTarget,
} from '../../services/deckFilterService';
import {
  FOLDER_TAG_ICON_OPTIONS,
  FolderTagIconGlyph,
} from './FolderTagIconGlyph';

export interface MoveToFolderModalProps {
  readonly isOpen: boolean;
  readonly payload: DeckDragPayload | null;
  readonly folders: readonly DeckFolder[];
  readonly assets: readonly DeckAsset[];
  readonly folderTags: readonly EtiquetaDePasta[];
  readonly onConfirmMove: (targetFolderId: string | null) => void;
  readonly onCreateFolder?: (input: CreateFolderWithTagInput) => DeckFolder | null;
  readonly onClose: () => void;
}

const UNSET_TARGET = '__unset__' as const;
type TargetSelection = string | null | typeof UNSET_TARGET;

/**
 * Modal de seleção de pasta destino no Convés ("Mover para...").
 * Mostra a hierarquia real de pastas + Raiz, bloqueia ciclos/destinos inválidos
 * e permite criar uma nova pasta com etiqueta obrigatória diretamente no fluxo.
 */
export const MoveToFolderModal: React.FC<MoveToFolderModalProps> = ({
  isOpen,
  payload,
  folders,
  assets,
  folderTags,
  onConfirmMove,
  onCreateFolder,
  onClose,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<TargetSelection>(UNSET_TARGET);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateInline, setShowCreateInline] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [tagMode, setTagMode] = useState<'select' | 'create'>(
    folderTags.length > 0 ? 'select' : 'create',
  );
  const [selectedTagId, setSelectedTagId] = useState<string | null>(
    folderTags[0]?.id ?? null,
  );
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagIcon, setNewTagIcon] = useState<FolderTagIconId>('folder');
  const [newTagAccent, setNewTagAccent] = useState<TagAccent>('cyan');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedTarget(UNSET_TARGET);
    setSearchQuery('');
    setShowCreateInline(false);
    setNewFolderName('');
    setTagMode(folderTags.length > 0 ? 'select' : 'create');
    setSelectedTagId(folderTags[0]?.id ?? null);
    setNewTagLabel('');
    setNewTagIcon('folder');
    setNewTagAccent('cyan');
    setLocalError(null);
  }, [isOpen, payload, folderTags]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const orderedTree = useMemo(() => buildFolderTreeOrder(folders), [folders]);

  const tagById = useMemo(
    () => new Map(folderTags.map((tag) => [tag.id, tag] as const)),
    [folderTags],
  );

  const rootValidation = useMemo(
    () =>
      validateDeckDropTarget({
        payload,
        targetType: 'root',
        targetId: null,
        folders,
        assets,
      }),
    [payload, folders, assets],
  );

  const filteredTree = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return orderedTree;
    return orderedTree.filter(
      (item) =>
        item.folder.name.toLowerCase().includes(query) ||
        item.pathLabel.toLowerCase().includes(query),
    );
  }, [orderedTree, searchQuery]);

  const selectionSummary = useMemo(() => {
    if (!payload) return '';
    if (payload.kind === 'folder') {
      const folder = folders.find((item) => item.id === payload.folderId);
      return folder ? `Pasta: ${folder.name}` : 'Pasta selecionada';
    }
    if (payload.assetIds.length === 1) {
      const asset = assets.find((item) => item.id === payload.assetIds[0]);
      return asset ? `Asset: ${asset.nome}` : '1 asset selecionado';
    }
    return `${payload.assetIds.length} assets selecionados`;
  }, [payload, folders, assets]);

  const selectedValidation = useMemo(() => {
    if (selectedTarget === UNSET_TARGET) return null;
    return validateDeckDropTarget({
      payload,
      targetType: selectedTarget === null ? 'root' : 'folder',
      targetId: selectedTarget,
      folders,
      assets,
    });
  }, [selectedTarget, payload, folders, assets]);

  if (!isOpen || !payload) {
    return null;
  }

  const newFolderParentId =
    selectedTarget !== UNSET_TARGET && selectedTarget !== null
      ? selectedTarget
      : null;

  const newFolderParentName = newFolderParentId
    ? (folders.find((item) => item.id === newFolderParentId)?.name ?? 'Pasta selecionada')
    : 'Convés / Raiz';

  const handleCreateInlineFolder = () => {
    if (!onCreateFolder) return;
    if (!newFolderName.trim()) {
      setLocalError('Informe o nome da nova pasta.');
      return;
    }
    const hasTag =
      tagMode === 'select'
        ? Boolean(selectedTagId && folderTags.some((tag) => tag.id === selectedTagId))
        : newTagLabel.trim().length > 0;
    if (!hasTag) {
      setLocalError('Selecione uma etiqueta existente ou crie uma nova para a pasta.');
      return;
    }

    const parentGuard =
      newFolderParentId !== null
        ? validateDeckDropTarget({
            payload,
            targetType: 'folder',
            targetId: newFolderParentId,
            folders,
            assets,
          })
        : { valid: true };
    const safeParentId =
      payload.kind === 'folder' && !parentGuard.valid ? null : newFolderParentId;

    const created = onCreateFolder({
      name: newFolderName.trim(),
      parent: safeParentId,
      existingTagId: tagMode === 'select' ? selectedTagId : null,
      newTag:
        tagMode === 'create'
          ? { label: newTagLabel.trim(), icon: newTagIcon, accent: newTagAccent }
          : null,
    });

    if (created) {
      setSelectedTarget(created.id);
      setShowCreateInline(false);
      setNewFolderName('');
      setNewTagLabel('');
      setLocalError(null);
    } else {
      setLocalError('Não foi possível criar a pasta de destino.');
    }
  };

  const handleConfirm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedValidation?.valid || selectedTarget === UNSET_TARGET) {
      setLocalError(selectedValidation?.reason ?? 'Selecione uma pasta de destino válida.');
      return;
    }
    onConfirmMove(selectedTarget);
    onClose();
  };

  const showRootOption =
    !searchQuery.trim() || 'convés raiz sem pasta'.includes(searchQuery.trim().toLowerCase());

  return (
    <div
      className="nautia-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-to-folder-modal-title"
    >
      <form className="nautia-modal-card nautia-move-modal" onSubmit={handleConfirm}>
        <header className="nautia-modal-header">
          <div>
            <span className="nautia-eyebrow">CONVÉS / MOVIMENTAÇÃO VIRTUAL</span>
            <h2 id="move-to-folder-modal-title" className="nautia-section-title">
              Mover para pasta...
            </h2>
            <p className="nautia-muted-note">
              {selectionSummary} · Os arquivos físicos no Windows não serão movidos.
            </p>
          </div>
          <button
            type="button"
            className="nautia-btn-ghost"
            onClick={onClose}
            aria-label="Cancelar movimentação"
          >
            Fechar
          </button>
        </header>

        <div className="nautia-move-modal__toolbar">
          <input
            type="search"
            className="nautia-move-modal__search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Filtrar pastas do Convés..."
            aria-label="Filtrar pastas do Convés"
            autoFocus
          />
          {onCreateFolder && (
            <button
              type="button"
              className={`nautia-btn-chip ${showCreateInline ? 'is-active' : ''}`}
              onClick={() => {
                setShowCreateInline((prev) => !prev);
                setLocalError(null);
              }}
            >
              {showCreateInline ? 'Ocultar nova pasta' : '+ Nova pasta'}
            </button>
          )}
        </div>

        <div
          className="nautia-move-modal__tree"
          role="radiogroup"
          aria-label="Estrutura de pastas do Convés"
        >
          {showRootOption && (
            <button
              type="button"
              role="radio"
              aria-checked={selectedTarget === null}
              disabled={!rootValidation.valid}
              className={`nautia-move-modal__item ${
                selectedTarget === null ? 'is-selected' : ''
              } ${!rootValidation.valid ? 'is-invalid' : ''}`}
              onClick={() => {
                setSelectedTarget(null);
                setLocalError(null);
              }}
              title={rootValidation.reason}
            >
              <span className="nautia-move-modal__item-main">
                <FolderTagIconGlyph icon="folder" className="nautia-mini-svg" />
                <strong>Convés / Raiz (Sem pasta)</strong>
              </span>
              <span className="nautia-move-modal__item-meta">
                {rootValidation.valid ? 'Raiz' : rootValidation.reason}
              </span>
            </button>
          )}

          {filteredTree.map((item) => {
            const validation = validateDeckDropTarget({
              payload,
              targetType: 'folder',
              targetId: item.folder.id,
              folders,
              assets,
            });
            const primaryTagId = item.folder.folderTagIds?.[0];
            const primaryTag = primaryTagId
              ? tagById.get(primaryTagId)
              : undefined;
            const isSelected = selectedTarget === item.folder.id;

            return (
              <button
                key={item.folder.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={!validation.valid}
                style={{ paddingLeft: `${12 + item.depth * 18}px` }}
                className={`nautia-move-modal__item ${isSelected ? 'is-selected' : ''} ${
                  !validation.valid ? 'is-invalid' : ''
                }`}
                onClick={() => {
                  setSelectedTarget(item.folder.id);
                  setLocalError(null);
                }}
                title={validation.valid ? item.pathLabel : validation.reason}
              >
                <span className="nautia-move-modal__item-main">
                  <FolderTagIconGlyph
                    icon={primaryTag?.icon ?? 'folder'}
                    className="nautia-mini-svg"
                  />
                  <span>{item.folder.name}</span>
                  {item.depth > 0 && (
                    <span className="nautia-move-modal__path">{item.pathLabel}</span>
                  )}
                </span>
                <span className="nautia-move-modal__item-meta">
                  {validation.valid
                    ? primaryTag?.label ?? 'Pasta'
                    : validation.reason}
                </span>
              </button>
            );
          })}

          {!showRootOption && filteredTree.length === 0 && (
            <p className="nautia-muted-note">
              Nenhuma pasta encontrada para "{searchQuery}".
            </p>
          )}
        </div>

        {showCreateInline && onCreateFolder && (
          <section className="nautia-move-modal__create-box" aria-label="Criar nova pasta">
            <div className="nautia-step-header">
              <span className="nautia-step-badge">NOVA PASTA EM {newFolderParentName}</span>
              <div className="nautia-segmented" role="group" aria-label="Modo da etiqueta">
                <button
                  type="button"
                  className={tagMode === 'select' ? 'is-active' : undefined}
                  disabled={folderTags.length === 0}
                  onClick={() => setTagMode('select')}
                >
                  Existente
                </button>
                <button
                  type="button"
                  className={tagMode === 'create' ? 'is-active is-purple' : undefined}
                  onClick={() => setTagMode('create')}
                >
                  Nova etiqueta
                </button>
              </div>
            </div>

            <div className="nautia-move-modal__create-fields">
              <label className="nautia-field">
                <span>Nome da nova pasta</span>
                <input
                  type="text"
                  maxLength={80}
                  value={newFolderName}
                  onChange={(event) => {
                    setNewFolderName(event.target.value);
                    setLocalError(null);
                  }}
                  placeholder="Ex.: Personagens_UE5"
                />
              </label>

              {tagMode === 'select' ? (
                <div className="nautia-tag-icons-rail" role="radiogroup" aria-label="Etiqueta da pasta">
                  {folderTags.map((tag) => {
                    const checked = selectedTagId === tag.id;
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        className={`nautia-tag-icon-pill accent-${tag.accent} ${
                          checked ? 'is-selected' : ''
                        }`}
                        onClick={() => setSelectedTagId(tag.id)}
                      >
                        <FolderTagIconGlyph icon={tag.icon} className="nautia-icon-svg" />
                        <span>{tag.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="nautia-inline-tag-builder">
                  <label className="nautia-field">
                    <span>Nome da etiqueta</span>
                    <input
                      type="text"
                      maxLength={32}
                      value={newTagLabel}
                      onChange={(event) => setNewTagLabel(event.target.value)}
                      placeholder="Ex.: Produção"
                    />
                  </label>
                  <div className="nautia-icon-picker__grid">
                    {FOLDER_TAG_ICON_OPTIONS.slice(0, 6).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`nautia-icon-choice ${
                          newTagIcon === option.id ? 'is-selected' : ''
                        }`}
                        onClick={() => setNewTagIcon(option.id)}
                      >
                        <FolderTagIconGlyph icon={option.id} className="nautia-icon-svg" />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="nautia-segmented" role="group" aria-label="Cor">
                    <button
                      type="button"
                      className={newTagAccent === 'cyan' ? 'is-active' : undefined}
                      onClick={() => setNewTagAccent('cyan')}
                    >
                      Cyan
                    </button>
                    <button
                      type="button"
                      className={newTagAccent === 'purple' ? 'is-active is-purple' : undefined}
                      onClick={() => setNewTagAccent('purple')}
                    >
                      Roxo
                    </button>
                  </div>
                </div>
              )}

              <div className="nautia-move-modal__create-actions">
                <button
                  type="button"
                  className="nautia-btn-chip is-active"
                  onClick={handleCreateInlineFolder}
                >
                  Criar e selecionar destino
                </button>
              </div>
            </div>
          </section>
        )}

        {localError && (
          <p className="nautia-inline-error" role="alert">
            {localError}
          </p>
        )}

        <footer className="nautia-modal-footer">
          <button type="button" className="nautia-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="nautia-btn-primary"
            disabled={!selectedValidation?.valid}
          >
            Mover para pasta selecionada
          </button>
        </footer>
      </form>
    </div>
  );
};
