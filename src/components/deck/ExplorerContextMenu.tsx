import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  clampContextMenuPosition,
  FolderTagIconId,
} from '../../services/deckFilterService';
import { FolderTagIconGlyph } from './FolderTagIconGlyph';

export type ContextMenuIconKind =
  | FolderTagIconId
  | 'trash'
  | 'copy'
  | 'edit'
  | 'open'
  | 'plus'
  | 'download'
  | 'backup'
  | 'locate';

export interface ContextMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: ContextMenuIconKind;
  readonly shortcut?: string;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}

export interface ContextMenuSection {
  readonly id: string;
  readonly items: readonly ContextMenuItem[];
}

export interface ExplorerContextMenuProps {
  readonly isOpen: boolean;
  readonly x: number;
  readonly y: number;
  readonly title?: string;
  readonly sections: readonly ContextMenuSection[];
  readonly onClose: () => void;
}

const ContextMenuGlyph: React.FC<{ readonly icon?: ContextMenuIconKind }> = ({
  icon,
}) => {
  if (!icon) return null;
  if (icon === 'trash') {
    return (
      <svg
        className="nautia-mini-svg"
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
    );
  }
  if (icon === 'copy') {
    return (
      <svg
        className="nautia-mini-svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    );
  }
  if (icon === 'edit') {
    return (
      <svg
        className="nautia-mini-svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    );
  }
  if (icon === 'open') {
    return (
      <svg
        className="nautia-mini-svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14 3h7v7" />
        <path d="M10 14 21 3" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      </svg>
    );
  }
  if (icon === 'plus') {
    return (
      <svg
        className="nautia-mini-svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }
  if (icon === 'locate') {
    return (
      <svg
        className="nautia-mini-svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    );
  }
  if (icon === 'download' || icon === 'backup') {
    return (
      <svg
        className="nautia-mini-svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M4 20h16" />
      </svg>
    );
  }
  return <FolderTagIconGlyph icon={icon} className="nautia-mini-svg" />;
};

/**
 * Menu contextual flutuante do Convés (Etapa 19.3 / 19.4).
 * Suporta clique direito, Shift+F10, tecla ContextMenu, navegação por setas,
 * fechamento por Escape/clique fora/scroll e ajuste automático aos limites da janela.
 */
export const ExplorerContextMenu: React.FC<ExplorerContextMenuProps> = ({
  isOpen,
  x,
  y,
  title,
  sections,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [coords, setCoords] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });

  const nonEmptySections = useMemo(
    () => sections.filter((section) => section.items.length > 0),
    [sections],
  );

  const flatItems = useMemo(
    () => nonEmptySections.flatMap((section) => section.items),
    [nonEmptySections],
  );

  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) return;
    const firstEnabled = flatItems.findIndex((item) => !item.disabled);
    setFocusedIndex(firstEnabled >= 0 ? firstEnabled : -1);
  }, [isOpen, flatItems]);

  useLayoutEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const rect = menuRef.current?.getBoundingClientRect();
    const width = rect?.width || 230;
    const height = rect?.height || 260;
    setCoords(
      clampContextMenuPosition({
        x,
        y,
        menuWidth: width,
        menuHeight: height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        margin: 8,
      }),
    );
  }, [isOpen, x, y, flatItems.length]);

  useEffect(() => {
    if (!isOpen) return;
    if (focusedIndex >= 0) {
      itemRefs.current[focusedIndex]?.focus({ preventScroll: true });
    }
  }, [isOpen, focusedIndex]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        onClose();
      }
    };

    const handleScrollOrResize = (event: Event) => {
      if (
        event.type === 'scroll' &&
        menuRef.current &&
        event.target instanceof Node &&
        menuRef.current.contains(event.target)
      ) {
        return;
      }
      onClose();
    };

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('keydown', handleWindowKeyDown, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('keydown', handleWindowKeyDown, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen || flatItems.length === 0) {
    return null;
  }

  const moveFocus = (delta: 1 | -1 | 'first' | 'last') => {
    if (flatItems.length === 0) return;
    const enabledIndices = flatItems
      .map((item, idx) => (!item.disabled ? idx : -1))
      .filter((idx) => idx >= 0);
    if (enabledIndices.length === 0) return;

    if (delta === 'first') {
      setFocusedIndex(enabledIndices[0]);
      return;
    }
    if (delta === 'last') {
      setFocusedIndex(enabledIndices[enabledIndices.length - 1]);
      return;
    }

    const currentPos = enabledIndices.indexOf(focusedIndex);
    if (currentPos < 0) {
      setFocusedIndex(
        delta === 1
          ? enabledIndices[0]
          : enabledIndices[enabledIndices.length - 1],
      );
      return;
    }
    const nextPos =
      (currentPos + delta + enabledIndices.length) % enabledIndices.length;
    setFocusedIndex(enabledIndices[nextPos]);
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(-1);
        break;
      case 'Home':
        event.preventDefault();
        moveFocus('first');
        break;
      case 'End':
        event.preventDefault();
        moveFocus('last');
        break;
      case 'Escape':
        event.preventDefault();
        onClose();
        break;
      case 'Enter':
      case ' ':
        if (focusedIndex >= 0 && flatItems[focusedIndex] && !flatItems[focusedIndex].disabled) {
          event.preventDefault();
          const chosen = flatItems[focusedIndex];
          onClose();
          chosen.onSelect();
        }
        break;
      default:
        break;
    }
  };

  let runningIndex = 0;

  const menuContent = (
    <div
      ref={menuRef}
      role="menu"
      aria-label={title ? `Menu de ações para ${title}` : 'Menu contextual do Convés'}
      className="rb-context-menu"
      style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
      onKeyDown={handleMenuKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {title && <div className="rb-context-menu__header">{title}</div>}
      {nonEmptySections.map((section, sectionIdx) => (
        <React.Fragment key={section.id}>
          {sectionIdx > 0 && (
            <div className="rb-context-menu__separator" role="separator" />
          )}
          <div className="rb-context-menu__group">
            {section.items.map((item) => {
              const itemIndex = runningIndex++;
              const isFocused = focusedIndex === itemIndex;
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    itemRefs.current[itemIndex] = el;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={isFocused ? 0 : -1}
                  disabled={item.disabled}
                  className={`rb-context-menu__item ${
                    item.danger ? 'is-danger' : ''
                  } ${isFocused ? 'is-focused' : ''}`}
                  onMouseEnter={() => {
                    if (!item.disabled) setFocusedIndex(itemIndex);
                  }}
                  onClick={() => {
                    if (item.disabled) return;
                    onClose();
                    item.onSelect();
                  }}
                >
                  <span className="rb-context-menu__item-icon" aria-hidden="true">
                    <ContextMenuGlyph icon={item.icon} />
                  </span>
                  <span className="rb-context-menu__item-label">{item.label}</span>
                  {item.shortcut && (
                    <span className="rb-context-menu__shortcut">{item.shortcut}</span>
                  )}
                </button>
              );
            })}
          </div>
        </React.Fragment>
      ))}
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(menuContent, document.body);
  }
  return menuContent;
};
