import React, { useEffect, useState } from 'react';
import {
  CreateFolderWithTagInput,
  DeckFolder,
  EtiquetaDePasta,
  FolderTagIconId,
  TagAccent,
} from '../../services/deckFilterService';
import {
  FOLDER_TAG_ICON_OPTIONS,
  FolderTagIconGlyph,
} from './FolderTagIconGlyph';

export interface CreateFolderModalProps {
  readonly isOpen: boolean;
  readonly parentId: string | null;
  readonly parentName?: string;
  readonly folderTags: readonly EtiquetaDePasta[];
  readonly errorMessage?: string | null;
  readonly onCreateFolder: (input: CreateFolderWithTagInput) => DeckFolder | null;
  readonly onClose: () => void;
}

/**
 * Fluxo de Criação de Pastas (Contexto Macro).
 * Exige obrigatoriamente duas etapas/campos:
 * 1. Nome da Pasta
 * 2. Seleção ou Criação de Etiqueta de Pasta (para manter navegação por ícones/filtros)
 */
export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  parentId,
  parentName = 'Convés (Raiz)',
  folderTags,
  errorMessage,
  onCreateFolder,
  onClose,
}) => {
  const [folderName, setFolderName] = useState('');
  const [tagMode, setTagMode] = useState<'select' | 'create'>(
    folderTags.length > 0 ? 'select' : 'create',
  );
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagIcon, setNewTagIcon] = useState<FolderTagIconId>('folder');
  const [newTagAccent, setNewTagAccent] = useState<TagAccent>('cyan');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFolderName('');
      setTagMode(folderTags.length > 0 ? 'select' : 'create');
      setSelectedTagId(folderTags[0]?.id ?? null);
      setNewTagLabel('');
      setNewTagIcon('folder');
      setNewTagAccent('cyan');
      setLocalError(null);
    }
  }, [isOpen, folderTags]);

  if (!isOpen) {
    return null;
  }

  const hasValidName = folderName.trim().length > 0;
  const hasValidTag =
    tagMode === 'select'
      ? Boolean(selectedTagId && folderTags.some((tag) => tag.id === selectedTagId))
      : newTagLabel.trim().length > 0;

  const canSubmit = hasValidName && hasValidTag;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasValidName) {
      setLocalError('Informe o nome da pasta.');
      return;
    }
    if (!hasValidTag) {
      setLocalError('Selecione uma etiqueta existente ou crie uma nova etiqueta.');
      return;
    }

    setLocalError(null);
    const created = onCreateFolder({
      name: folderName,
      parent: parentId,
      existingTagId: tagMode === 'select' ? selectedTagId : null,
      newTag:
        tagMode === 'create'
          ? { label: newTagLabel, icon: newTagIcon, accent: newTagAccent }
          : null,
    });

    if (created) {
      onClose();
    }
  };

  const activeError = localError || errorMessage;

  return (
    <div
      className="nautia-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-folder-modal-title"
    >
      <form className="nautia-modal-card" onSubmit={handleSubmit}>
        <header className="nautia-modal-header">
          <div>
            <span className="nautia-eyebrow">CONVÉS / CONTEXTO MACRO</span>
            <h2 id="create-folder-modal-title" className="nautia-section-title">
              Nova Pasta em {parentName}
            </h2>
          </div>
          <button
            type="button"
            className="nautia-btn-ghost"
            onClick={onClose}
            aria-label="Fechar criação de pasta"
          >
            Fechar
          </button>
        </header>

        <div className="nautia-modal-step">
          <span className="nautia-step-badge">ETAPA 01 · OBRIGATÓRIA</span>
          <label className="nautia-field">
            <span>Nome da Pasta</span>
            <input
              type="text"
              maxLength={80}
              value={folderName}
              onChange={(event) => {
                setFolderName(event.target.value);
                setLocalError(null);
              }}
              placeholder="Ex.: Personagens_UE5, Veículos_SciFi"
              required
              autoFocus
            />
          </label>
        </div>

        <div className="nautia-modal-step">
          <div className="nautia-step-header">
            <span className="nautia-step-badge">ETAPA 02 · OBRIGATÓRIA</span>
            <div
              className="nautia-segmented"
              role="group"
              aria-label="Origem da etiqueta da pasta"
            >
              <button
                type="button"
                className={tagMode === 'select' ? 'is-active' : undefined}
                aria-pressed={tagMode === 'select'}
                disabled={folderTags.length === 0}
                onClick={() => setTagMode('select')}
              >
                Selecionar existente
              </button>
              <button
                type="button"
                className={tagMode === 'create' ? 'is-active is-purple' : undefined}
                aria-pressed={tagMode === 'create'}
                onClick={() => setTagMode('create')}
              >
                Criar nova etiqueta
              </button>
            </div>
          </div>

          {tagMode === 'select' ? (
            <div
              className="nautia-tag-icons-rail"
              role="radiogroup"
              aria-label="Selecione uma etiqueta obrigatória para a pasta"
            >
              {folderTags.map((tag) => {
                const isSelected = selectedTagId === tag.id;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`nautia-tag-icon-pill accent-${tag.accent} ${
                      isSelected ? 'is-selected' : ''
                    }`}
                    onClick={() => {
                      setSelectedTagId(tag.id);
                      setLocalError(null);
                    }}
                  >
                    <span className="nautia-tag-icon-pill__glyph">
                      <FolderTagIconGlyph icon={tag.icon} className="nautia-icon-svg" />
                    </span>
                    <span className="nautia-tag-icon-pill__label">{tag.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="nautia-inline-tag-builder">
              <label className="nautia-field">
                <span>Nome da nova etiqueta</span>
                <input
                  type="text"
                  maxLength={32}
                  value={newTagLabel}
                  onChange={(event) => {
                    setNewTagLabel(event.target.value);
                    setLocalError(null);
                  }}
                  placeholder="Ex.: Produção, Personagens, Protótipos"
                  required
                />
              </label>

              <div className="nautia-icon-picker__grid">
                {FOLDER_TAG_ICON_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`nautia-icon-choice ${
                      newTagIcon === option.id ? 'is-selected' : ''
                    }`}
                    aria-pressed={newTagIcon === option.id}
                    onClick={() => setNewTagIcon(option.id)}
                  >
                    <FolderTagIconGlyph icon={option.id} className="nautia-icon-svg" />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>

              <div
                className="nautia-segmented"
                role="group"
                aria-label="Cor de destaque da etiqueta"
              >
                <button
                  type="button"
                  className={newTagAccent === 'cyan' ? 'is-active' : undefined}
                  aria-pressed={newTagAccent === 'cyan'}
                  onClick={() => setNewTagAccent('cyan')}
                >
                  Cyan
                </button>
                <button
                  type="button"
                  className={
                    newTagAccent === 'purple' ? 'is-active is-purple' : undefined
                  }
                  aria-pressed={newTagAccent === 'purple'}
                  onClick={() => setNewTagAccent('purple')}
                >
                  Roxo
                </button>
              </div>
            </div>
          )}
        </div>

        {activeError && (
          <p className="nautia-inline-error" role="alert">
            {activeError}
          </p>
        )}

        <footer className="nautia-modal-footer">
          <button type="button" className="nautia-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="nautia-btn-primary"
            disabled={!canSubmit}
          >
            Criar Pasta com Etiqueta
          </button>
        </footer>
      </form>
    </div>
  );
};
