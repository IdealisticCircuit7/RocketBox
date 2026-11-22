import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { normalizeTagLabel } from '../../services/deckFilterService';
import {
  addTagToSelection,
  buildTagPickerDropdownItems,
  computeNextHighlightIndex,
  removeTagFromSelection,
  resolveBackspaceTagRemoval,
  resolveTagPickerEnterAction,
  TagPickerDropdownItem,
  TagPickerOption,
} from '../../services/tagPickerLogic';
import { FolderTagIconGlyph } from './FolderTagIconGlyph';

export type { TagPickerOption };

export interface TagPickerProps {
  readonly id?: string;
  readonly label?: string;
  readonly optionalHint?: string;
  readonly ariaLabel?: string;
  readonly placeholder?: string;
  readonly availableTags: readonly TagPickerOption[];
  readonly selectedTags: readonly string[];
  readonly onChange: (nextSelectedTags: string[]) => void;
  readonly onCreateTag?: (newTagLabel: string) => void;
  readonly allowCreate?: boolean;
  readonly disabled?: boolean;
  readonly compact?: boolean;
  readonly maxLength?: number;
  readonly className?: string;
}

const KNOWN_COLOR_CLASSES = new Set([
  'cyan',
  'purple',
  'emerald',
  'amber',
  'neutral',
]);

function resolveTagMeta(
  label: string,
  catalogByNormalized: ReadonlyMap<string, TagPickerOption>,
): TagPickerOption | null {
  const norm = normalizeTagLabel(label);
  return catalogByNormalized.get(norm) ?? null;
}

/**
 * Seletor moderno, compacto e acessível de múltiplas etiquetas (Design System OCSIS RocketBox).
 * Reutilizável em Registrar Asset, Painel Detalhes do Convés, Edição de Assets e Etiquetas de Pastas.
 */
export const TagPicker: React.FC<TagPickerProps> = ({
  id,
  label = 'Etiquetas',
  optionalHint = 'opcional',
  ariaLabel,
  placeholder = 'Pesquisar ou criar etiqueta...',
  availableTags,
  selectedTags,
  onChange,
  onCreateTag,
  allowCreate = true,
  disabled = false,
  compact = false,
  maxLength = 40,
  className = '',
}) => {
  const generatedId = useId();
  const baseId = id ?? `rb-tag-picker-${generatedId}`;
  const labelId = `${baseId}-label`;
  const listboxId = `${baseId}-listbox`;

  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);

  const catalogByNormalized = useMemo(() => {
    const map = new Map<string, TagPickerOption>();
    for (const item of availableTags) {
      const norm = normalizeTagLabel(item.label);
      if (norm && !map.has(norm)) {
        map.set(norm, item);
      }
    }
    return map;
  }, [availableTags]);

  const dropdown = useMemo(
    () =>
      buildTagPickerDropdownItems({
        availableTags,
        selectedTags,
        query,
        allowCreate,
      }),
    [availableTags, selectedTags, query, allowCreate],
  );

  // Mantém o índice destacado dentro dos limites da lista filtrada
  useEffect(() => {
    if (dropdown.items.length === 0) {
      setHighlightedIndex(-1);
      return;
    }
    setHighlightedIndex((prev) =>
      prev >= 0 && prev < dropdown.items.length ? prev : 0,
    );
  }, [dropdown.items.length]);

  // Calcula abertura para cima ou para baixo evitando corte em containers com rolagem interna
  useEffect(() => {
    if (!isOpen || !controlRef.current || typeof window === 'undefined') {
      return;
    }

    const updatePlacement = () => {
      const controlEl = controlRef.current;
      if (!controlEl) return;
      const rect = controlEl.getBoundingClientRect();
      const scrollParent = controlEl.closest(
        '.nautia-register-form__body, .studio-inspector__body, .explorer-records',
      );
      const boundaryTop = scrollParent
        ? scrollParent.getBoundingClientRect().top
        : 0;
      const boundaryBottom = scrollParent
        ? Math.min(scrollParent.getBoundingClientRect().bottom, window.innerHeight)
        : window.innerHeight;

      const spaceBelow = boundaryBottom - rect.bottom;
      const spaceAbove = rect.top - boundaryTop;
      setOpenUpward(spaceBelow < 210 && spaceAbove > spaceBelow);
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    return () => {
      window.removeEventListener('resize', updatePlacement);
    };
  }, [isOpen, selectedTags.length, dropdown.items.length]);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen]);

  // Rola suavemente a opção ativa dentro da lista quando navegar via teclado
  useEffect(() => {
    if (!isOpen || highlightedIndex < 0 || !menuRef.current) return;
    const activeOption = menuRef.current.querySelector<HTMLElement>(
      `#${CSS?.escape ? CSS.escape(`${baseId}-opt-${highlightedIndex}`) : `${baseId}-opt-${highlightedIndex}`}`,
    );
    activeOption?.scrollIntoView?.({ block: 'nearest' });
  }, [isOpen, highlightedIndex, baseId]);

  const commitItem = (item: TagPickerDropdownItem) => {
    if (disabled) return;

    const result = addTagToSelection({
      selectedTags,
      availableTags,
      candidateLabel: item.label,
    });

    if (result.addedLabel) {
      if (item.kind === 'create-new') {
        onCreateTag?.(result.addedLabel);
      }
      onChange(result.nextSelectedTags);
    }

    setQuery('');
    setIsOpen(false);
  };

  const handleRemoveTag = (labelToRemove: string) => {
    if (disabled) return;
    onChange(removeTagFromSelection(selectedTags, labelToRemove));
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    // Não intercepta Enter ou teclas durante composição IME
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setHighlightedIndex(dropdown.items.length > 0 ? 0 : -1);
        } else {
          setHighlightedIndex((prev) =>
            computeNextHighlightIndex(prev, dropdown.items.length, 'next'),
          );
        }
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setHighlightedIndex(
            dropdown.items.length > 0 ? dropdown.items.length - 1 : -1,
          );
        } else {
          setHighlightedIndex((prev) =>
            computeNextHighlightIndex(prev, dropdown.items.length, 'prev'),
          );
        }
        break;
      }
      case 'Home': {
        if (isOpen && dropdown.items.length > 0) {
          event.preventDefault();
          setHighlightedIndex(0);
        }
        break;
      }
      case 'End': {
        if (isOpen && dropdown.items.length > 0) {
          event.preventDefault();
          setHighlightedIndex(dropdown.items.length - 1);
        }
        break;
      }
      case 'Enter': {
        if (isOpen || query.trim().length > 0) {
          event.preventDefault();
          const chosen = resolveTagPickerEnterAction({
            items: dropdown.items,
            highlightedIndex,
            isComposing: event.nativeEvent.isComposing,
          });
          if (chosen) {
            commitItem(chosen);
          } else {
            setIsOpen(false);
          }
        }
        break;
      }
      case 'Escape': {
        if (isOpen) {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(false);
        }
        break;
      }
      case 'Backspace': {
        const afterBackspace = resolveBackspaceTagRemoval({
          query,
          selectedTags,
        });
        if (afterBackspace !== null) {
          event.preventDefault();
          onChange(afterBackspace);
        }
        break;
      }
      default:
        break;
    }
  };

  const activeDescendantId =
    isOpen && highlightedIndex >= 0 && dropdown.items[highlightedIndex]
      ? `${baseId}-opt-${highlightedIndex}`
      : undefined;

  return (
    <div
      ref={containerRef}
      className={`nautia-field rb-tag-picker ${compact ? 'is-compact' : ''} ${
        isOpen ? 'is-open' : ''
      } ${isFocused ? 'is-focused' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
    >
      <div className="rb-tag-picker__label-row">
        <span id={labelId} className="nautia-field__label rb-tag-picker__title">
          <FolderTagIconGlyph icon="tag" className="rb-tag-picker__title-icon" />
          <span>{label}</span>
        </span>
        {optionalHint && (
          <span className="rb-tag-picker__optional">{optionalHint}</span>
        )}
      </div>

      <div className="rb-tag-picker__anchor">
        <div
          ref={controlRef}
          className={`rb-tag-picker__control ${isFocused ? 'is-focused' : ''} ${
            isOpen ? 'is-open' : ''
          }`}
          onClick={(event) => {
            if (disabled) return;
            if ((event.target as HTMLElement).closest('button')) return;
            inputRef.current?.focus();
            setIsOpen(true);
          }}
        >
          {selectedTags.map((tagLabel) => {
            const meta = resolveTagMeta(tagLabel, catalogByNormalized);
            const colorToken = meta?.color;
            const colorClass =
              colorToken && KNOWN_COLOR_CLASSES.has(colorToken)
                ? `accent-${colorToken}`
                : '';
            const customColorStyle =
              colorToken && !KNOWN_COLOR_CLASSES.has(colorToken)
                ? ({ '--tag-custom-color': colorToken } as React.CSSProperties)
                : undefined;

            return (
              <span
                key={tagLabel}
                className={`rb-tag-picker__chip ${colorClass}`}
                style={customColorStyle}
              >
                {meta?.icon ? (
                  <FolderTagIconGlyph
                    icon={meta.icon}
                    className="rb-tag-picker__chip-icon"
                  />
                ) : colorToken ? (
                  <span className="rb-tag-picker__chip-dot" aria-hidden="true" />
                ) : null}
                <span className="rb-tag-picker__chip-label">{tagLabel}</span>
                <button
                  type="button"
                  className="rb-tag-picker__chip-remove"
                  disabled={disabled}
                  aria-label={`Remover etiqueta ${tagLabel}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRemoveTag(tagLabel);
                  }}
                >
                  ×
                </button>
              </span>
            );
          })}

          <input
            ref={inputRef}
            id={baseId}
            type="text"
            role="combobox"
            className="rb-tag-picker__input"
            disabled={disabled}
            maxLength={maxLength}
            value={query}
            placeholder={selectedTags.length === 0 ? placeholder : 'Adicionar...'}
            aria-labelledby={labelId}
            aria-label={ariaLabel ?? (optionalHint ? `${label} (${optionalHint})` : label)}
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeDescendantId}
            onFocus={() => {
              setIsFocused(true);
              setIsOpen(true);
            }}
            onBlur={() => {
              setIsFocused(false);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              if (!isOpen) {
                setIsOpen(true);
              }
            }}
            onKeyDown={handleInputKeyDown}
          />

          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            className="rb-tag-picker__toggle"
            aria-label={isOpen ? 'Fechar lista de etiquetas' : 'Abrir lista de etiquetas'}
            onClick={(event) => {
              event.stopPropagation();
              if (disabled) return;
              setIsOpen((prev) => {
                const next = !prev;
                if (next) {
                  inputRef.current?.focus();
                }
                return next;
              });
            }}
          >
            <svg
              className={`rb-tag-picker__chevron ${isOpen ? 'is-open' : ''}`}
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
            </svg>
          </button>
        </div>

        {isOpen && (
          <ul
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-multiselectable="true"
            aria-label={`Sugestões de ${label.toLowerCase()}`}
            className={`rb-tag-picker__menu ${openUpward ? 'is-upward' : ''}`}
          >
            {dropdown.items.length > 0 ? (
              dropdown.items.map((item, idx) => {
                const isHighlighted = idx === highlightedIndex;
                if (item.kind === 'select-existing') {
                  const colorToken = item.option.color;
                  const colorClass =
                    colorToken && KNOWN_COLOR_CLASSES.has(colorToken)
                      ? `accent-${colorToken}`
                      : '';
                  return (
                    <li
                      key={item.id}
                      id={`${baseId}-opt-${idx}`}
                      role="option"
                      aria-selected={false}
                      className={`rb-tag-picker__option ${colorClass} ${
                        isHighlighted ? 'is-highlighted' : ''
                      }`}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        commitItem(item);
                      }}
                    >
                      <span className="rb-tag-picker__option-main">
                        <FolderTagIconGlyph
                          icon={item.option.icon ?? 'tag'}
                          className="rb-tag-picker__option-icon"
                        />
                        <span>{item.label}</span>
                      </span>
                      <span className="rb-tag-picker__option-badge">Existente</span>
                    </li>
                  );
                }

                return (
                  <li
                    key={item.id}
                    id={`${baseId}-opt-${idx}`}
                    role="option"
                    aria-selected={false}
                    className={`rb-tag-picker__option is-create ${
                      isHighlighted ? 'is-highlighted' : ''
                    }`}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      commitItem(item);
                    }}
                  >
                    <span className="rb-tag-picker__option-main">
                      <span className="rb-tag-picker__plus" aria-hidden="true">
                        +
                      </span>
                      <span>
                        Criar nova etiqueta: <strong>&ldquo;{item.label}&rdquo;</strong>
                      </span>
                    </span>
                    <span className="rb-tag-picker__option-badge is-purple">
                      Nova
                    </span>
                  </li>
                );
              })
            ) : (
              <li className="rb-tag-picker__empty" role="presentation">
                {dropdown.alreadySelectedMatch
                  ? `A etiqueta "${dropdown.alreadySelectedMatch}" já foi selecionada.`
                  : availableTags.length === 0
                    ? 'Digite um nome e pressione Enter para criar a primeira etiqueta.'
                    : 'Nenhuma etiqueta disponível corresponde à pesquisa.'}
              </li>
            )}
            {allowCreate &&
              !dropdown.items.some((item) => item.kind === 'create-new') && (
                <li
                  className="rb-tag-picker__option is-create rb-tag-picker__footer-create"
                  role="presentation"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    inputRef.current?.focus();
                  }}
                >
                  <span className="rb-tag-picker__option-main">
                    <span className="rb-tag-picker__plus" aria-hidden="true">
                      +
                    </span>
                    <span>Criar nova etiqueta (digite o nome acima)</span>
                  </span>
                </li>
              )}
          </ul>
        )}
      </div>
    </div>
  );
};
