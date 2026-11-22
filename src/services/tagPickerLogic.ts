import {
  type FolderTagIconId,
  normalizeTagLabel,
} from './deckFilterService.ts';

export type TagAccentColor = 'cyan' | 'purple' | 'emerald' | 'amber' | 'neutral';

export interface TagPickerOption {
  readonly id: string;
  readonly label: string;
  readonly icon?: FolderTagIconId;
  readonly color?: TagAccentColor | string;
}

export type TagPickerDropdownItem =
  | {
      readonly kind: 'select-existing';
      readonly id: string;
      readonly label: string;
      readonly normalizedLabel: string;
      readonly option: TagPickerOption;
    }
  | {
      readonly kind: 'create-new';
      readonly id: string;
      readonly label: string;
      readonly normalizedLabel: string;
    };

export interface TagPickerDropdownBuildResult {
  readonly items: readonly TagPickerDropdownItem[];
  readonly exactExistingMatch: TagPickerOption | null;
  readonly alreadySelectedMatch: string | null;
  readonly cleanedQuery: string;
  readonly normalizedQuery: string;
}

/**
 * Resolve os itens visíveis no dropdown inteligente do `TagPicker`.
 * Garante deduplicação case/acento/espaço-insensitive e impede criação duplicada.
 */
export function buildTagPickerDropdownItems(params: {
  readonly availableTags: readonly TagPickerOption[];
  readonly selectedTags: readonly string[];
  readonly query: string;
  readonly allowCreate?: boolean;
}): TagPickerDropdownBuildResult {
  const allowCreate = params.allowCreate ?? true;
  const cleanedQuery = params.query.trim().replace(/\s+/g, ' ');
  const normalizedQuery = normalizeTagLabel(cleanedQuery);

  const selectedNorms = new Map<string, string>();
  for (const label of params.selectedTags) {
    const clean = label.trim().replace(/\s+/g, ' ');
    const norm = normalizeTagLabel(clean);
    if (norm && !selectedNorms.has(norm)) {
      selectedNorms.set(norm, clean);
    }
  }

  // Deduplica catálogo disponível por rótulo normalizado
  const uniqueAvailable: Array<TagPickerOption & { readonly normalizedLabel: string }> = [];
  const seenCatalogNorms = new Set<string>();
  for (const opt of params.availableTags) {
    const clean = opt.label.trim().replace(/\s+/g, ' ');
    const norm = normalizeTagLabel(clean);
    if (!norm || seenCatalogNorms.has(norm)) continue;
    seenCatalogNorms.add(norm);
    uniqueAvailable.push({
      ...opt,
      label: clean,
      normalizedLabel: norm,
    });
  }

  const exactExistingMatch =
    normalizedQuery
      ? uniqueAvailable.find((opt) => opt.normalizedLabel === normalizedQuery) ?? null
      : null;

  const alreadySelectedMatch =
    normalizedQuery ? selectedNorms.get(normalizedQuery) ?? null : null;

  const matchingUnselected = uniqueAvailable
    .filter((opt) => !selectedNorms.has(opt.normalizedLabel))
    .filter((opt) =>
      !normalizedQuery ? true : opt.normalizedLabel.includes(normalizedQuery),
    )
    .sort((a, b) => {
      if (normalizedQuery) {
        const aExact = a.normalizedLabel === normalizedQuery ? 0 : 1;
        const bExact = b.normalizedLabel === normalizedQuery ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        const aPrefix = a.normalizedLabel.startsWith(normalizedQuery) ? 0 : 1;
        const bPrefix = b.normalizedLabel.startsWith(normalizedQuery) ? 0 : 1;
        if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      }
      return a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' });
    });

  const items: TagPickerDropdownItem[] = matchingUnselected.map((opt) => ({
    kind: 'select-existing',
    id: opt.id,
    label: opt.label,
    normalizedLabel: opt.normalizedLabel,
    option: opt,
  }));

  // Oferece "Criar nova etiqueta" somente se não houver correspondência exata (nem no catálogo nem nas selecionadas)
  if (
    allowCreate &&
    cleanedQuery.length > 0 &&
    !exactExistingMatch &&
    !alreadySelectedMatch
  ) {
    items.push({
      kind: 'create-new',
      id: `__create__:${normalizedQuery}`,
      label: cleanedQuery,
      normalizedLabel: normalizedQuery,
    });
  }

  return {
    items,
    exactExistingMatch,
    alreadySelectedMatch,
    cleanedQuery,
    normalizedQuery,
  };
}

/**
 * Adiciona uma etiqueta à seleção respeitando unicidade normalizada e preservando
 * a grafia canônica caso a etiqueta já exista no catálogo.
 */
export function addTagToSelection(params: {
  readonly selectedTags: readonly string[];
  readonly availableTags: readonly TagPickerOption[];
  readonly candidateLabel: string;
}): {
  readonly nextSelectedTags: string[];
  readonly addedLabel: string | null;
  readonly isDuplicateInSelection: boolean;
} {
  const clean = params.candidateLabel.trim().replace(/\s+/g, ' ');
  const norm = normalizeTagLabel(clean);
  if (!norm) {
    return {
      nextSelectedTags: [...params.selectedTags],
      addedLabel: null,
      isDuplicateInSelection: false,
    };
  }

  const existingInSelection = params.selectedTags.find(
    (label) => normalizeTagLabel(label) === norm,
  );
  if (existingInSelection) {
    return {
      nextSelectedTags: [...params.selectedTags],
      addedLabel: null,
      isDuplicateInSelection: true,
    };
  }

  const canonicalOption = params.availableTags.find(
    (opt) => normalizeTagLabel(opt.label) === norm,
  );
  const canonicalLabel = canonicalOption?.label.trim().replace(/\s+/g, ' ') || clean;

  return {
    nextSelectedTags: [...params.selectedTags, canonicalLabel],
    addedLabel: canonicalLabel,
    isDuplicateInSelection: false,
  };
}

export function removeTagFromSelection(
  selectedTags: readonly string[],
  labelToRemove: string,
): string[] {
  const norm = normalizeTagLabel(labelToRemove);
  return selectedTags.filter((label) => normalizeTagLabel(label) !== norm);
}

export function resolveBackspaceTagRemoval(params: {
  readonly query: string;
  readonly selectedTags: readonly string[];
}): string[] | null {
  if (params.query.length > 0 || params.selectedTags.length === 0) {
    return null;
  }
  return params.selectedTags.slice(0, -1);
}

export function computeNextHighlightIndex(
  currentIndex: number,
  totalItems: number,
  direction: 'next' | 'prev' | 'first' | 'last',
): number {
  if (totalItems <= 0) return -1;
  if (direction === 'first') return 0;
  if (direction === 'last') return totalItems - 1;
  if (currentIndex < 0 || currentIndex >= totalItems) {
    return direction === 'next' ? 0 : totalItems - 1;
  }
  return direction === 'next'
    ? (currentIndex + 1) % totalItems
    : (currentIndex - 1 + totalItems) % totalItems;
}

export function resolveTagPickerEnterAction(params: {
  readonly items: readonly TagPickerDropdownItem[];
  readonly highlightedIndex: number;
  readonly isComposing?: boolean;
}): TagPickerDropdownItem | null {
  if (params.isComposing) return null;
  if (params.items.length === 0) return null;
  const idx =
    params.highlightedIndex >= 0 && params.highlightedIndex < params.items.length
      ? params.highlightedIndex
      : 0;
  return params.items[idx] ?? null;
}
