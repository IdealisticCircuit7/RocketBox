import React, { useEffect, useId, useRef, useState } from 'react';

export interface SelectOptionItem {
  readonly value: string;
  readonly label: string;
  readonly badge?: string;
  readonly disabled?: boolean;
}

export interface AccessibleSelectProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOptionItem[];
  readonly onChange: (nextValue: string) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly name?: string;
  readonly className?: string;
  readonly compact?: boolean;
  readonly ariaLabel?: string;
}

/**
 * Seletor acessível reutilizável do Design System OCSIS RocketBox.
 * Resolve limitações de contraste do popup nativo no Windows combinando:
 * - Controle customizado com suporte completo a teclado (Setas, Home, End, Enter, Espaço, Escape),
 *   foco visível, ARIA (`combobox` + `listbox`) e contraste WCAG AA em tema escuro;
 * - Elemento `<select>` nativo sincronizado para semântica de formulário e inspeção.
 */
export const AccessibleSelect: React.FC<AccessibleSelectProps> = ({
  label,
  value,
  options,
  onChange,
  placeholder = 'Selecionar...',
  disabled = false,
  id,
  name,
  className = '',
  compact = false,
  ariaLabel,
}) => {
  const generatedId = useId();
  const controlId = id ?? `rb-select-${generatedId}`;
  const labelId = `${controlId}-label`;
  const listboxId = `${controlId}-listbox`;

  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(() => {
    const idx = options.findIndex((opt) => opt.value === value);
    return idx >= 0 ? idx : 0;
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const selectedOption = options.find((opt) => opt.value === value) ?? null;

  useEffect(() => {
    const idx = options.findIndex((opt) => opt.value === value);
    if (idx >= 0) {
      setHighlightedIndex(idx);
    }
  }, [value, options]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen]);

  const findNextEnabledIndex = (start: number, step: 1 | -1): number => {
    if (options.length === 0) return -1;
    let cursor = start;
    for (let i = 0; i < options.length; i += 1) {
      cursor = (cursor + step + options.length) % options.length;
      if (!options[cursor]?.disabled) {
        return cursor;
      }
    }
    return start;
  };

  const commitOption = (index: number) => {
    const target = options[index];
    if (!target || target.disabled) return;
    onChange(target.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((prev) => findNextEnabledIndex(prev, 1));
        }
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((prev) => findNextEnabledIndex(prev, -1));
        }
        break;
      }
      case 'Home': {
        if (isOpen) {
          event.preventDefault();
          const first = options.findIndex((opt) => !opt.disabled);
          if (first >= 0) setHighlightedIndex(first);
        }
        break;
      }
      case 'End': {
        if (isOpen) {
          event.preventDefault();
          for (let i = options.length - 1; i >= 0; i -= 1) {
            if (!options[i]?.disabled) {
              setHighlightedIndex(i);
              break;
            }
          }
        }
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          commitOption(highlightedIndex);
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
      case 'Tab': {
        if (isOpen) {
          setIsOpen(false);
        }
        break;
      }
      default:
        break;
    }
  };

  const activeDescendantId =
    isOpen && highlightedIndex >= 0 && options[highlightedIndex]
      ? `${controlId}-opt-${highlightedIndex}`
      : undefined;

  return (
    <div
      ref={containerRef}
      className={`nautia-field nautia-select-field ${
        compact ? 'is-compact' : ''
      } ${isOpen ? 'is-open' : ''} ${className}`.trim()}
    >
      {label && (
        <span id={labelId} className="nautia-field__label">
          {label}
        </span>
      )}

      {/* Select nativo sincronizado para acessibilidade de formulários e fallback */}
      <select
        className="nautia-native-select-sync"
        name={name}
        value={value}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>

      <div className="nautia-custom-select">
        <button
          ref={triggerRef}
          id={controlId}
          type="button"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-labelledby={label ? labelId : undefined}
          aria-label={!label ? ariaLabel ?? placeholder : undefined}
          aria-activedescendant={activeDescendantId}
          disabled={disabled}
          className={`nautia-custom-select__trigger ${
            isOpen ? 'is-open' : ''
          }`}
          onClick={() => {
            if (!disabled) setIsOpen((prev) => !prev);
          }}
          onKeyDown={handleKeyDown}
        >
          <span className="nautia-custom-select__value">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span className="nautia-custom-select__badge">
              {selectedOption.badge}
            </span>
          )}
          <svg
            className="nautia-custom-select__chevron"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 7.5 5 5 5-5" />
          </svg>
        </button>

        {isOpen && (
          <ul
            id={listboxId}
            role="listbox"
            aria-labelledby={label ? labelId : undefined}
            aria-label={!label ? ariaLabel ?? placeholder : undefined}
            className="nautia-custom-select__menu"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlightedIndex;

              return (
                <li
                  key={`${option.value}-${index}`}
                  id={`${controlId}-opt-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled}
                  className={`nautia-custom-select__option ${
                    isSelected ? 'is-selected' : ''
                  } ${isHighlighted ? 'is-highlighted' : ''} ${
                    option.disabled ? 'is-disabled' : ''
                  }`}
                  onMouseEnter={() => {
                    if (!option.disabled) setHighlightedIndex(index);
                  }}
                  onMouseDown={(event) => {
                    // Evita perda de foco antes do clique
                    event.preventDefault();
                  }}
                  onClick={() => commitOption(index)}
                >
                  <span className="nautia-custom-select__option-label">
                    {option.label}
                  </span>
                  <span className="nautia-custom-select__option-meta">
                    {option.badge && (
                      <span className="nautia-custom-select__option-badge">
                        {option.badge}
                      </span>
                    )}
                    {isSelected && (
                      <span
                        className="nautia-custom-select__check"
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
