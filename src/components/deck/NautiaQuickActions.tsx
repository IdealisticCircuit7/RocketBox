import React from 'react';
import { DeckAsset } from '../../services/deckFilterService';
import {
  NautiaQuickActionId,
  QuickActionBackendResponse,
  QuickActionScopePayload,
} from '../../services/nautiaQuickActionsService';
import { useNautiaQuickActions } from '../../state/useNautiaQuickActions';
import { NautiaChibiIcon } from '../nautia/NautiaChibiIcon';
import { FolderTagIconGlyph } from './FolderTagIconGlyph';

export interface NautiaQuickActionsProps {
  readonly selectedAssets: readonly DeckAsset[];
  readonly defaultCollapsed?: boolean;
  readonly onClearSelection?: () => void;
  readonly onOpenNautiaModule?: () => void;
  readonly onDispatchAction?: (
    payload: QuickActionScopePayload,
  ) => void | Promise<QuickActionBackendResponse | void>;
}

const COMPACT_ACTION_META: Readonly<
  Record<NautiaQuickActionId, { readonly title: string; readonly subtitle: string }>
> = {
  'analyze-assets': {
    title: 'Analisar',
    subtitle: 'Verificar e diagnosticar',
  },
  'create-tags': {
    title: 'Etiquetar',
    subtitle: 'Sugerir etiquetas',
  },
  organize: {
    title: 'Organizar',
    subtitle: 'Mover ou classificar',
  },
  'check-compatibility': {
    title: 'Compatibilidade',
    subtitle: 'Validar no projeto',
  },
};

/**
 * Nautia Quick Actions — Card Contextual do Inspetor (Sprint_conves.png).
 * - Preserva orientação clara quando não há seleção:
 *   "Selecione um asset para utilizar as ações rápidas da Nautia."
 * - Exibe grade 2x2 de ações contextuais quando integrada ao inspetor do Convés.
 */
export const NautiaQuickActions: React.FC<NautiaQuickActionsProps> = ({
  selectedAssets,
  defaultCollapsed = false,
  onClearSelection,
  onOpenNautiaModule,
  onDispatchAction,
}) => {
  const {
    cards,
    isCollapsed,
    hasSelection,
    selectedCount,
    activeActionId,
    statusMessage,
    toggleCollapsed,
    triggerAction,
  } = useNautiaQuickActions({
    selectedAssets,
    defaultCollapsed,
    onDispatchAction,
  });

  const handleActionClick = (actionId: NautiaQuickActionId) => {
    if (!hasSelection) return;
    void triggerAction(actionId);
  };

  return (
    <aside
      className={`nautia-quick-bar studio-nautia-card ${
        isCollapsed ? 'is-compact' : 'is-expanded'
      } ${hasSelection ? 'has-selection' : 'no-selection'}`}
      aria-label="Nautia Quick Actions"
    >
      <div className="studio-nautia-card__header">
        <div className="studio-nautia-card__top-row">
          <div className="studio-nautia-card__identity">
            <span className="studio-nautia-card__avatar" aria-hidden="true">
              <NautiaChibiIcon className="nautia-icon-svg" />
            </span>
            <div className="studio-nautia-card__title-row">
              <strong className="studio-nautia-card__title">Nautia</strong>
              <span className="studio-nautia-card__badge">ASSISTENTE</span>
            </div>
          </div>

          <div className="studio-nautia-card__top-actions">
            {hasSelection && onClearSelection && (
              <button
                type="button"
                className="studio-nautia-card__chip-btn"
                title="Desmarcar todos os assets selecionados"
                onClick={onClearSelection}
              >
                Limpar ({selectedCount})
              </button>
            )}
            <button
              type="button"
              className="studio-nautia-card__chip-btn"
              aria-expanded={!isCollapsed}
              onClick={toggleCollapsed}
              title={isCollapsed ? 'Expandir ações da Nautia' : 'Recolher ações'}
            >
              {isCollapsed ? 'Expandir' : 'Recolher'}
            </button>
          </div>
        </div>

        <p className="studio-nautia-card__subtitle" role="status">
          {hasSelection
            ? selectedCount === 1
              ? 'Como posso ajudar com este asset?'
              : `Atuando sobre ${selectedCount} assets selecionados.`
            : 'Selecione um asset para utilizar as ações rápidas da Nautia.'}
        </p>
      </div>

      {!isCollapsed && (
        <>
          <div
            className="studio-nautia-grid"
            role="group"
            aria-label="Ações contextuais da Nautia"
          >
            {cards.map((card) => {
              const isSelected = hasSelection && activeActionId === card.id;
              const meta = COMPACT_ACTION_META[card.id] ?? {
                title: card.title,
                subtitle: card.subtitle,
              };

              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={!hasSelection}
                  aria-disabled={!hasSelection}
                  aria-pressed={isSelected}
                  title={
                    hasSelection
                      ? `${card.title}: ${card.subtitle}`
                      : 'Selecione ao menos um asset no Convés para habilitar esta ação'
                  }
                  className={`studio-nautia-action accent-${card.accent} ${
                    isSelected ? 'is-selected' : ''
                  }`}
                  onClick={() => handleActionClick(card.id)}
                >
                  <span className="studio-nautia-action__icon">
                    <FolderTagIconGlyph
                      icon={card.icon}
                      className="nautia-icon-svg"
                    />
                  </span>
                  <span className="studio-nautia-action__text">
                    <strong>{meta.title}</strong>
                    <small>{meta.subtitle}</small>
                  </span>
                </button>
              );
            })}
          </div>

          {statusMessage && hasSelection && (
            <p className="studio-nautia-card__status" role="status">
              {statusMessage}
            </p>
          )}

          {onOpenNautiaModule && (
            <button
              type="button"
              className="nautia-btn-accent studio-nautia-card__open-btn"
              onClick={onOpenNautiaModule}
            >
              <FolderTagIconGlyph icon="sparkles" className="nautia-mini-svg" />
              <span>Abrir módulo completo da Nautia</span>
            </button>
          )}
        </>
      )}
    </aside>
  );
};
