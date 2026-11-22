import { useCallback, useEffect, useMemo, useState } from 'react';
import { DeckAsset } from '../services/deckFilterService';
import {
  buildQuickActionScopePayload,
  NAUTIA_QUICK_ACTION_CARDS,
  NautiaQuickActionDefinition,
  NautiaQuickActionId,
  QuickActionBackendResponse,
  QuickActionScopePayload,
} from '../services/nautiaQuickActionsService';

/**
 * Estado das Ações Rápidas da Nautia — Nível 1.
 * Reage estritamente a `selectedAssets`, mantendo ações inativas sem seleção
 * e preparando contratos prontos para despacho ao backend Tauri quando há seleção.
 */

export interface UseNautiaQuickActionsParams {
  readonly selectedAssets: readonly DeckAsset[];
  readonly defaultCollapsed?: boolean;
  readonly onDispatchAction?: (
    payload: QuickActionScopePayload,
  ) => void | Promise<QuickActionBackendResponse | void>;
}

export interface UseNautiaQuickActionsReturn {
  readonly cards: readonly NautiaQuickActionDefinition[];
  readonly isCollapsed: boolean;
  readonly hasSelection: boolean;
  readonly selectedCount: number;
  readonly activeActionId: NautiaQuickActionId | null;
  readonly lastPayload: QuickActionScopePayload | null;
  readonly statusMessage: string;
  readonly toggleCollapsed: () => void;
  readonly triggerAction: (actionId: NautiaQuickActionId) => Promise<void>;
  readonly resetActiveAction: () => void;
}

export function useNautiaQuickActions({
  selectedAssets,
  defaultCollapsed = false,
  onDispatchAction,
}: UseNautiaQuickActionsParams): UseNautiaQuickActionsReturn {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [activeActionId, setActiveActionId] = useState<NautiaQuickActionId | null>(null);
  const [lastPayload, setLastPayload] = useState<QuickActionScopePayload | null>(null);
  const [backendStatus, setBackendStatus] = useState<string | null>(null);

  const selectedCount = selectedAssets.length;
  const hasSelection = selectedCount > 0;

  useEffect(() => {
    if (!hasSelection) {
      setActiveActionId(null);
      setLastPayload(null);
      setBackendStatus(null);
    }
  }, [hasSelection]);

  const statusMessage = useMemo(() => {
    if (!hasSelection) {
      return 'Nenhum asset selecionado. Selecione um ou mais itens no Convés para liberar as ações rápidas.';
    }
    if (backendStatus) {
      return backendStatus;
    }
    return `${selectedCount} ${
      selectedCount === 1 ? 'asset selecionado' : 'assets selecionados'
    }. As ações atuarão estritamente sobre este grupo.`;
  }, [hasSelection, selectedCount, backendStatus]);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const resetActiveAction = useCallback(() => {
    setActiveActionId(null);
    setLastPayload(null);
    setBackendStatus(null);
  }, []);

  const triggerAction = useCallback(
    async (actionId: NautiaQuickActionId) => {
      if (!hasSelection) {
        setActiveActionId(null);
        setLastPayload(null);
        return;
      }

      const payload = buildQuickActionScopePayload(actionId, selectedAssets);
      setActiveActionId(actionId);
      setLastPayload(payload);

      if (onDispatchAction) {
        const response = await onDispatchAction(payload);
        if (response?.summary) {
          setBackendStatus(response.summary);
          return;
        }
      }

      const card = NAUTIA_QUICK_ACTION_CARDS.find((item) => item.id === actionId);
      setBackendStatus(
        `Ação "${card?.title ?? actionId}" preparada para ${payload.totalSelected} ${
          payload.totalSelected === 1 ? 'asset' : 'assets'
        } (comando: ${payload.backendCommand}).`,
      );
    },
    [hasSelection, selectedAssets, onDispatchAction],
  );

  return {
    cards: NAUTIA_QUICK_ACTION_CARDS,
    isCollapsed,
    hasSelection,
    selectedCount,
    activeActionId,
    lastPayload,
    statusMessage,
    toggleCollapsed,
    triggerAction,
    resetActiveAction,
  };
}
