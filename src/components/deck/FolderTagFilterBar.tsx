import React, { useState } from 'react';
import {
  CreateFolderTagInput,
  EtiquetaDePasta,
  FilterMatchMode,
  FolderTagIconId,
  TagAccent,
} from '../../services/deckFilterService';
import {
  FOLDER_TAG_ICON_OPTIONS,
  FolderTagIconGlyph,
} from './FolderTagIconGlyph';

export interface FolderTagFilterBarProps {
  readonly tags: readonly EtiquetaDePasta[];
  readonly selectedTagIds: readonly string[];
  readonly tagSearchQuery: string;
  readonly tagMatchMode: FilterMatchMode;
  readonly folderCountByTag: ReadonlyMap<string, number>;
  readonly errorMessage: string | null;
  readonly targetFolderName?: string | null;
  readonly onToggleTag: (tagId: string) => void;
  readonly onTagSearchChange: (query: string) => void;
  readonly onTagMatchModeChange: (mode: FilterMatchMode) => void;
  readonly onCreateTag: (input: CreateFolderTagInput) => EtiquetaDePasta | null;
  readonly onClearFilters: () => void;
}

/**
 * Faixa Compacta de Etiquetas de Pastas do Convés (Etapas 02 e 03).
 * Renderiza cada `EtiquetaDePasta` como um ícone clicável que isola
 * exclusivamente as pastas correspondentes na visualização do Convés,
 * ocupando apenas uma linha compacta quando o criador está fechado.
 */
export const FolderTagFilterBar: React.FC<FolderTagFilterBarProps> = ({
  tags,
  selectedTagIds,
  tagSearchQuery,
  tagMatchMode,
  folderCountByTag,
  errorMessage,
  targetFolderName,
  onToggleTag,
  onTagSearchChange,
  onTagMatchModeChange,
  onCreateTag,
  onClearFilters,
}) => {
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState<FolderTagIconId>('tag');
  const [accent, setAccent] = useState<TagAccent>('cyan');

  const hasTagFilter =
    selectedTagIds.length > 0 || tagSearchQuery.trim().length > 0;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = onCreateTag({ label, icon, accent });
    if (created) {
      setLabel('');
      setIcon('tag');
      setAccent('cyan');
      setIsCreatorOpen(false);
    }
  };

  return (
    <section
      className={`nautia-deck-tagbar ${hasTagFilter ? 'is-isolating' : ''}`}
      aria-label="Filtros rápidos por etiquetas de pastas"
    >
      <div className="nautia-deck-tagbar__strip">
        <div className="nautia-deck-tagbar__label">
          <FolderTagIconGlyph icon="tag" className="nautia-mini-svg" />
          <span>ETIQUETAS:</span>
        </div>

        <div
          className="nautia-tag-icons-rail"
          role="group"
          aria-label="Ícones clicáveis de etiquetas de pastas"
        >
          {tags.length === 0 ? (
            <span className="nautia-empty-hint">
              {tagSearchQuery.trim()
                ? 'Nenhuma etiqueta corresponde à busca.'
                : 'Crie uma etiqueta para isolar pastas por ícone.'}
            </span>
          ) : (
            tags.map((tag) => {
              const isSelected = selectedTagIds.includes(tag.id);
              const count = folderCountByTag.get(tag.id) ?? 0;

              return (
                <button
                  key={tag.id}
                  type="button"
                  title={`Isolar pastas com etiqueta "${tag.label}" (${count} pasta${
                    count === 1 ? '' : 's'
                  })`}
                  className={`nautia-tag-icon-pill accent-${tag.accent} ${
                    isSelected ? 'is-selected' : ''
                  }`}
                  aria-pressed={isSelected}
                  aria-label={`Filtrar pastas com etiqueta ${tag.label} (${count} pasta${
                    count === 1 ? '' : 's'
                  })`}
                  onClick={() => onToggleTag(tag.id)}
                >
                  <span className="nautia-tag-icon-pill__glyph">
                    <FolderTagIconGlyph
                      icon={tag.icon}
                      className="nautia-icon-svg"
                    />
                  </span>
                  <span className="nautia-tag-icon-pill__label">
                    {tag.label}
                  </span>
                  <span className="nautia-tag-icon-pill__count">{count}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="nautia-deck-tagbar__controls">
          <label className="nautia-search-field nautia-search-field--compact">
            <span className="sr-only">Pesquisar etiqueta de pasta</span>
            <input
              type="search"
              value={tagSearchQuery}
              onChange={(event) => onTagSearchChange(event.target.value)}
              placeholder="Filtrar etiqueta..."
              aria-label="Pesquisar etiqueta de pasta"
            />
          </label>

          {selectedTagIds.length > 1 && (
            <div
              className="nautia-segmented"
              role="group"
              aria-label="Modo de combinação entre etiquetas selecionadas"
            >
              <button
                type="button"
                className={tagMatchMode === 'any' ? 'is-active' : undefined}
                aria-pressed={tagMatchMode === 'any'}
                onClick={() => onTagMatchModeChange('any')}
              >
                OU
              </button>
              <button
                type="button"
                className={tagMatchMode === 'all' ? 'is-active' : undefined}
                aria-pressed={tagMatchMode === 'all'}
                onClick={() => onTagMatchModeChange('all')}
              >
                E
              </button>
            </div>
          )}

          {hasTagFilter && (
            <button
              type="button"
              className="nautia-btn-chip"
              title="Restaurar visualização de todas as pastas"
              onClick={onClearFilters}
            >
              Limpar isolamento
            </button>
          )}

          <button
            type="button"
            className="nautia-btn-chip nautia-btn-tag-add"
            aria-expanded={isCreatorOpen}
            title="Criar nova etiqueta de pasta"
            onClick={() => setIsCreatorOpen((prev) => !prev)}
          >
            {isCreatorOpen ? 'Fechar ▴' : '+ Etiqueta'}
          </button>
        </div>
      </div>

      {isCreatorOpen && (
        <form className="nautia-tag-creator" onSubmit={handleSubmit}>
          <div className="nautia-tag-creator__row">
            <label className="nautia-field">
              <span className="nautia-field__label">Nome da etiqueta</span>
              <input
                type="text"
                maxLength={32}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Ex.: Produção UE5, Personagens, Crítico"
                required
              />
            </label>

            <div className="nautia-field">
              <span className="nautia-field__label">Cor de destaque</span>
              <div
                className="nautia-segmented"
                role="group"
                aria-label="Cor de destaque da etiqueta"
              >
                <button
                  type="button"
                  className={
                    accent === 'cyan' ? 'is-active is-cyan' : undefined
                  }
                  aria-pressed={accent === 'cyan'}
                  onClick={() => setAccent('cyan')}
                >
                  Cyan
                </button>
                <button
                  type="button"
                  className={
                    accent === 'purple' ? 'is-active is-purple' : undefined
                  }
                  aria-pressed={accent === 'purple'}
                  onClick={() => setAccent('purple')}
                >
                  Roxo
                </button>
              </div>
            </div>
          </div>

          <fieldset className="nautia-icon-picker">
            <legend>Ícone clicável</legend>
            <div className="nautia-icon-picker__grid">
              {FOLDER_TAG_ICON_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`nautia-icon-choice ${
                    icon === option.id ? 'is-selected' : ''
                  }`}
                  aria-pressed={icon === option.id}
                  title={option.label}
                  onClick={() => setIcon(option.id)}
                >
                  <FolderTagIconGlyph
                    icon={option.id}
                    className="nautia-icon-svg"
                  />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="nautia-tag-creator__footer">
            <span className="nautia-muted-note">
              A etiqueta aparecerá como filtro clicável na barra acima.
            </span>

            <button type="submit" className="nautia-btn-primary">
              {targetFolderName
                ? `Criar e aplicar em "${targetFolderName}"`
                : 'Criar etiqueta de pasta'}
            </button>
          </div>
        </form>
      )}

      {errorMessage && (
        <p className="nautia-inline-error" role="alert">
          {errorMessage}
        </p>
      )}
    </section>
  );
};
