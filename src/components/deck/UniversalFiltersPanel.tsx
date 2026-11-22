import React, { useMemo } from 'react';
import {
  FilterMatchMode,
  normalizeTagLabel,
  OrganizationFilterState,
  TagFilterScope,
  UniversalFilterCriteria,
} from '../../services/deckFilterService';
import { AccessibleSelect, SelectOptionItem } from './AccessibleSelect';

export interface UniversalFiltersPanelProps {
  readonly criteria: UniversalFilterCriteria;
  readonly options: {
    readonly fileTypes: readonly string[];
    readonly formats: readonly string[];
    readonly projects: readonly string[];
    readonly assetTags: readonly string[];
  };
  readonly hasActiveFilters: boolean;
  readonly isOpen?: boolean;
  readonly onUpdate: (patch: Partial<UniversalFilterCriteria>) => void;
  readonly onReset: () => void;
  readonly onClose?: () => void;
}

const ORGANIZATION_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'all', label: 'Todos os estados' },
  { value: 'in-folder', label: 'Organizados em pasta' },
  { value: 'root', label: 'Sem pasta (na raiz)' },
  { value: 'tagged', label: 'Com etiquetas' },
  { value: 'untagged', label: 'Sem etiquetas' },
];

const TAG_SCOPE_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'both', label: 'Ambos (pastas e assets)' },
  { value: 'asset', label: 'Etiquetas dos assets' },
  { value: 'folder', label: 'Etiquetas da pasta' },
];

const ASSET_TAG_MATCH_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'any', label: 'Qualquer etiqueta (OU)' },
  { value: 'all', label: 'Todas as etiquetas (E)' },
];

/**
 * Painel Expansível de Filtros Avançados (Etapa 03).
 * Agrupa Formato, Projeto, Estado de organização, Etiqueta de asset,
 * Intervalo de datas e Regra de combinação (Todas / Qualquer), mantendo
 * a tela principal do Convés limpa quando recolhido.
 */
export const UniversalFiltersPanel: React.FC<UniversalFiltersPanelProps> = ({
  criteria,
  options,
  hasActiveFilters,
  isOpen = true,
  onUpdate,
  onReset,
  onClose,
}) => {
  const formatOptions = useMemo<readonly SelectOptionItem[]>(
    () => [
      { value: '', label: 'Todos os formatos' },
      ...options.formats.map((fmt) => ({ value: fmt, label: fmt })),
    ],
    [options.formats],
  );

  const projectOptions = useMemo<readonly SelectOptionItem[]>(
    () => [
      { value: '', label: 'Todos os projetos' },
      ...options.projects.map((proj) => ({ value: proj, label: proj })),
    ],
    [options.projects],
  );

  const fileTypeOptions = useMemo<readonly SelectOptionItem[]>(
    () => [
      { value: '', label: 'Todos os tipos' },
      ...options.fileTypes.map((type) => ({ value: type, label: type })),
    ],
    [options.fileTypes],
  );

  if (!isOpen) {
    return null;
  }

  const handleMatchMode = (matchMode: FilterMatchMode) => {
    onUpdate({ matchMode });
  };

  return (
    <section
      id="nautia-advanced-filters-panel"
      className="nautia-universal-filters"
      aria-label="Filtros avançados de assets"
    >
      <div className="nautia-universal-filters__header">
        <div>
          <span className="nautia-eyebrow">FILTROS AVANÇADOS · CONSULTA COMBINADA</span>
          <h3 className="nautia-subsection-title">
            Refinar por formato, projeto, organização e período
          </h3>
        </div>

        <div className="nautia-universal-filters__mode">
          <div
            className="nautia-segmented"
            role="group"
            aria-label="Regra de correspondência dos filtros"
          >
            <button
              type="button"
              className={criteria.matchMode === 'all' ? 'is-active' : undefined}
              aria-pressed={criteria.matchMode === 'all'}
              onClick={() => handleMatchMode('all')}
            >
              Todas as condições (E)
            </button>
            <button
              type="button"
              className={criteria.matchMode === 'any' ? 'is-active' : undefined}
              aria-pressed={criteria.matchMode === 'any'}
              onClick={() => handleMatchMode('any')}
            >
              Qualquer condição (OU)
            </button>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="nautia-btn-ghost"
              onClick={onReset}
            >
              Limpar filtros avançados
            </button>
          )}

          {onClose && (
            <button
              type="button"
              className="nautia-btn-chip"
              onClick={onClose}
            >
              Fechar ▴
            </button>
          )}
        </div>
      </div>

      <div className="nautia-universal-filters__grid">
        <AccessibleSelect
          label="Tipo de arquivo"
          value={criteria.fileType ?? ''}
          options={fileTypeOptions}
          onChange={(val) => onUpdate({ fileType: val || null })}
        />

        <AccessibleSelect
          label="Formato"
          value={criteria.format ?? ''}
          options={formatOptions}
          onChange={(val) => onUpdate({ format: val || null })}
        />

        <AccessibleSelect
          label="Projeto"
          value={criteria.project ?? ''}
          options={projectOptions}
          onChange={(val) => onUpdate({ project: val || null })}
        />

        <AccessibleSelect
          label="Estado de organização"
          value={criteria.organizationState}
          options={ORGANIZATION_OPTIONS}
          onChange={(val) =>
            onUpdate({
              organizationState: val as OrganizationFilterState,
            })
          }
        />

        <AccessibleSelect
          label="Escopo das etiquetas"
          value={criteria.tagScope ?? 'both'}
          options={TAG_SCOPE_OPTIONS}
          onChange={(val) =>
            onUpdate({
              tagScope: (val || 'both') as TagFilterScope,
            })
          }
        />

        <AccessibleSelect
          label="Combinação de etiquetas de asset"
          value={criteria.assetTagMatchMode ?? 'any'}
          options={ASSET_TAG_MATCH_OPTIONS}
          onChange={(val) =>
            onUpdate({
              assetTagMatchMode: (val || 'any') as FilterMatchMode,
            })
          }
        />

        <label className="nautia-field">
          <span className="nautia-field__label">Etiqueta de asset</span>
          <input
            type="search"
            list="nautia-asset-tags-datalist"
            value={criteria.assetTagQuery}
            onChange={(event) =>
              onUpdate({ assetTagQuery: event.target.value })
            }
            placeholder="Ex.: Rigged, PBR, UE5..."
          />
          <datalist id="nautia-asset-tags-datalist">
            {options.assetTags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        </label>

        <div className="nautia-date-range">
          <label className="nautia-field">
            <span className="nautia-field__label">Data inicial</span>
            <input
              type="date"
              value={criteria.dateFrom ?? ''}
              onChange={(event) =>
                onUpdate({ dateFrom: event.target.value || null })
              }
            />
          </label>
          <label className="nautia-field">
            <span className="nautia-field__label">Data final</span>
            <input
              type="date"
              value={criteria.dateTo ?? ''}
              onChange={(event) =>
                onUpdate({ dateTo: event.target.value || null })
              }
            />
          </label>
        </div>
      </div>

      {options.assetTags.length > 0 && (
        <div
          className="nautia-universal-filters__asset-tag-bar"
          aria-label="Filtrar por etiquetas de assets"
        >
          <span className="nautia-field__label">
            Etiquetas de assets disponíveis:
          </span>
          <div className="nautia-universal-filters__tag-pills">
            {options.assetTags.map((tag) => {
              const selected = (criteria.selectedAssetTags ?? []).some(
                (item) => normalizeTagLabel(item) === normalizeTagLabel(tag),
              );
              return (
                <button
                  key={tag}
                  type="button"
                  className={`nautia-tag-chip ${selected ? 'is-active' : ''}`}
                  aria-pressed={selected}
                  onClick={() => {
                    const current = criteria.selectedAssetTags ?? [];
                    const norm = normalizeTagLabel(tag);
                    const next = selected
                      ? current.filter(
                          (item) => normalizeTagLabel(item) !== norm,
                        )
                      : [...current, tag];
                    onUpdate({ selectedAssetTags: next });
                  }}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
