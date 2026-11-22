import React, { useEffect, useMemo, useState } from 'react';
import {
  buildGlobalTagCatalog,
  DeckAsset,
  DeckFolder,
  EtiquetaDeAsset,
  EtiquetaDePasta,
  GlobalTagCatalogItem,
} from '../../services/deckFilterService';
import { LibraryOperationsService } from '../../services/libraryOperationsService';
import { FolderTagIconGlyph } from './FolderTagIconGlyph';

export interface TagManagerModalProps {
  readonly isOpen: boolean;
  readonly assets: readonly DeckAsset[];
  readonly folders: readonly DeckFolder[];
  readonly assetTags: readonly EtiquetaDeAsset[];
  readonly folderTags: readonly EtiquetaDePasta[];
  readonly operations?: LibraryOperationsService;
  readonly onLibraryMutated?: () => void;
  readonly onNotify?: (message: string) => void;
  readonly onClose: () => void;
}

const TAG_COLOR_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'cyan', label: 'Ciano' },
  { value: 'purple', label: 'Roxo' },
  { value: 'emerald', label: 'Esmeralda' },
  { value: 'amber', label: 'Âmbar' },
];

function formatCreatedAt(iso: string): string {
  if (!iso) return 'Recente';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Recente';
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Modal centralizado "Gerenciar Etiquetas" do Convés (Etapa 12).
 * Exibe todas as etiquetas persistidas (assets e pastas) com contagem de uso,
 * pesquisa, criação sem duplicatas, renomeação e exclusão segura com confirmação.
 */
export const TagManagerModal: React.FC<TagManagerModalProps> = ({
  isOpen,
  assets,
  folders,
  assetTags,
  folderTags,
  operations,
  onLibraryMutated,
  onNotify,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('cyan');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [confirmDeleteTag, setConfirmDeleteTag] =
    useState<GlobalTagCatalogItem | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery('');
    setNewLabel('');
    setNewColor('cyan');
    setEditingTagId(null);
    setEditingLabel('');
    setConfirmDeleteTag(null);
    setLocalError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (confirmDeleteTag) {
          setConfirmDeleteTag(null);
        } else if (editingTagId) {
          setEditingTagId(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, confirmDeleteTag, editingTagId, onClose]);

  const catalog = useMemo(
    () =>
      buildGlobalTagCatalog({
        assets,
        folders,
        assetTags,
        folderTags,
      }),
    [assets, folders, assetTags, folderTags],
  );

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('pt-BR');
    if (!q) return catalog;
    return catalog.filter(
      (item) =>
        item.label.toLocaleLowerCase('pt-BR').includes(q) ||
        item.normalizedLabel.includes(q),
    );
  }, [catalog, searchQuery]);

  if (!isOpen) {
    return null;
  }

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!operations) {
      setLocalError('Serviço de operações indisponível.');
      return;
    }
    const res = operations.createTag({
      scope: 'asset-tag',
      label: newLabel,
      color: newColor,
      rejectDuplicates: true,
    });
    if (!res.ok) {
      setLocalError(res.summary);
      return;
    }
    setLocalError(null);
    setNewLabel('');
    onLibraryMutated?.();
    onNotify?.(res.summary);
  };

  const handleSaveRename = (tagId: string) => {
    if (!operations) return;
    const res = operations.renameGlobalTag(tagId, editingLabel);
    if (!res.ok) {
      setLocalError(res.summary);
      return;
    }
    setLocalError(null);
    setEditingTagId(null);
    setEditingLabel('');
    onLibraryMutated?.();
    onNotify?.(res.summary);
  };

  const handleConfirmDelete = () => {
    if (!operations || !confirmDeleteTag) return;
    const res = operations.deleteGlobalTag(confirmDeleteTag.id);
    if (!res.ok) {
      setLocalError(res.summary);
      return;
    }
    setLocalError(null);
    setConfirmDeleteTag(null);
    onLibraryMutated?.();
    onNotify?.(res.summary);
  };

  return (
    <div
      className="nautia-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tag-manager-modal-title"
    >
      <div className="nautia-modal-card nautia-tag-manager-modal">
        <header className="nautia-modal-header">
          <div>
            <span className="nautia-eyebrow">CONVÉS / CATÁLOGO GLOBAL DE ETIQUETAS</span>
            <h2 id="tag-manager-modal-title" className="nautia-section-title">
              Gerenciar Etiquetas ({catalog.length})
            </h2>
            <p className="nautia-muted-note">
              Fonte única persistente para Registrar Asset, Painel Detalhes e filtros do Convés.
            </p>
          </div>
          <button
            type="button"
            className="nautia-btn-ghost"
            onClick={onClose}
            aria-label="Fechar Gerenciador de Etiquetas"
          >
            Fechar
          </button>
        </header>

        <form className="nautia-tag-manager__create" onSubmit={handleCreate}>
          <input
            type="text"
            maxLength={40}
            value={newLabel}
            onChange={(event) => {
              setNewLabel(event.target.value);
              setLocalError(null);
            }}
            placeholder="Nova etiqueta (Ex.: DOW, PBR, Heroi)..."
            aria-label="Nome da nova etiqueta"
          />
          <select
            aria-label="Cor da etiqueta"
            value={newColor}
            onChange={(event) => setNewColor(event.target.value)}
          >
            {TAG_COLOR_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="nautia-btn-primary"
            disabled={!newLabel.trim()}
          >
            + Criar etiqueta
          </button>
        </form>

        <div className="nautia-tag-manager__search-bar">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Pesquisar etiquetas existentes..."
            aria-label="Pesquisar etiquetas existentes"
            autoFocus
          />
        </div>

        {localError && (
          <p className="nautia-inline-error" role="alert">
            {localError}
          </p>
        )}

        {confirmDeleteTag && (
          <section
            className="nautia-tag-manager__confirm-delete"
            role="alertdialog"
            aria-label="Confirmar exclusão de etiqueta"
          >
            <p>
              Excluir a etiqueta <strong>&ldquo;{confirmDeleteTag.label}&rdquo;</strong>? Ela está
              associada a <strong>{confirmDeleteTag.assetCount} asset(s)</strong> e{' '}
              <strong>{confirmDeleteTag.folderCount} pasta(s)</strong>. Os registros serão
              preservados; apenas os vínculos serão removidos.
            </p>
            <div className="nautia-tag-manager__confirm-actions">
              <button
                type="button"
                className="nautia-btn-ghost"
                onClick={() => setConfirmDeleteTag(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="nautia-btn-ghost nautia-btn-danger"
                onClick={handleConfirmDelete}
              >
                Confirmar exclusão
              </button>
            </div>
          </section>
        )}

        <div className="nautia-tag-manager__list" role="list">
          {filteredCatalog.length === 0 ? (
            <p className="nautia-muted-note">
              {searchQuery.trim()
                ? `Nenhuma etiqueta encontrada para "${searchQuery}".`
                : 'Nenhuma etiqueta personalizada cadastrada ainda.'}
            </p>
          ) : (
            filteredCatalog.map((item) => {
              const isEditing = editingTagId === item.id;
              return (
                <div
                  key={item.id}
                  role="listitem"
                  className="nautia-tag-manager__row"
                >
                  <div className="nautia-tag-manager__row-main">
                    <span
                      className={`nautia-tag-manager__dot accent-${item.color}`}
                      aria-hidden="true"
                    />
                    {isEditing ? (
                      <div className="nautia-tag-manager__edit-inline">
                        <input
                          type="text"
                          maxLength={40}
                          value={editingLabel}
                          aria-label={`Novo nome para ${item.label}`}
                          onChange={(event) => {
                            setEditingLabel(event.target.value);
                            setLocalError(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleSaveRename(item.id);
                            }
                          }}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="nautia-btn-chip is-active"
                          onClick={() => handleSaveRename(item.id)}
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          className="nautia-btn-chip"
                          onClick={() => {
                            setEditingTagId(null);
                            setLocalError(null);
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="nautia-tag-manager__info">
                        <span className="nautia-tag-manager__name">
                          <FolderTagIconGlyph icon="tag" className="nautia-mini-svg" />
                          <strong>{item.label}</strong>
                        </span>
                        <span className="nautia-tag-manager__meta">
                          {item.assetCount}{' '}
                          {item.assetCount === 1 ? 'asset' : 'assets'} ·{' '}
                          {item.folderCount}{' '}
                          {item.folderCount === 1 ? 'pasta' : 'pastas'} ·{' '}
                          {formatCreatedAt(item.createdAt)}
                        </span>
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="nautia-tag-manager__row-actions">
                      <span className="nautia-tag-manager__scope-badge">
                        {item.scope === 'both'
                          ? 'Asset + Pasta'
                          : item.scope === 'asset'
                            ? 'Asset'
                            : 'Pasta'}
                      </span>
                      <button
                        type="button"
                        className="nautia-btn-chip"
                        disabled={item.isSystemProtected}
                        onClick={() => {
                          setEditingTagId(item.id);
                          setEditingLabel(item.label);
                          setConfirmDeleteTag(null);
                          setLocalError(null);
                        }}
                      >
                        Renomear
                      </button>
                      <button
                        type="button"
                        className="nautia-btn-chip nautia-btn-danger"
                        disabled={item.isSystemProtected}
                        onClick={() => {
                          setConfirmDeleteTag(item);
                          setEditingTagId(null);
                          setLocalError(null);
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
