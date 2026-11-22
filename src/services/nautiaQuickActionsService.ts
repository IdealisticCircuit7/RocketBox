import {
  type DeckAsset,
  deduplicateAssets,
  type InferenceEngineResult,
  type TagAccent,
} from './deckFilterService.ts';

/**
 * Serviços de Biblioteca — Nautia Quick Actions (Nível 1).
 * Lógica puramente determinística que isola o escopo de execução estritamente
 * aos `selectedAssets` e prepara contratos prontos para o backend Tauri.
 */

export type NautiaQuickActionId =
  | 'analyze-assets'
  | 'organize'
  | 'create-tags'
  | 'check-compatibility';

export interface NautiaQuickActionDefinition {
  readonly id: NautiaQuickActionId;
  readonly title: string;
  readonly subtitle: string;
  readonly accent: TagAccent;
  readonly icon: 'sparkles' | 'layers' | 'tag' | 'shield';
  readonly backendCommand: string;
}

export interface QuickActionScopePayload {
  readonly actionId: NautiaQuickActionId;
  readonly backendCommand: string;
  readonly selectedAssetIds: readonly string[];
  readonly targetAssets: readonly DeckAsset[];
  readonly totalSelected: number;
  readonly preparedAt: string;
}

export interface QuickActionBackendResponse {
  readonly actionId: NautiaQuickActionId;
  readonly status: 'ready' | 'completed' | 'error';
  readonly summary: string;
  readonly inferenceResults?: readonly InferenceEngineResult[];
}

export const NAUTIA_QUICK_ACTION_CARDS: readonly NautiaQuickActionDefinition[] =
  Object.freeze([
    {
      id: 'analyze-assets',
      title: 'Analisar Assets',
      subtitle: 'Inspecionar metadados e estrutura do grupo selecionado.',
      accent: 'cyan',
      icon: 'sparkles',
      backendCommand: 'rodar_inferencia',
    },
    {
      id: 'organize',
      title: 'Organizar',
      subtitle: 'Mapear destino de pastas para os itens em seleção.',
      accent: 'purple',
      icon: 'layers',
      backendCommand: 'organizar_assets_selecionados',
    },
    {
      id: 'create-tags',
      title: 'Criar Etiquetas',
      subtitle: 'Preparar etiquetas estruturadas para este lote.',
      accent: 'cyan',
      icon: 'tag',
      backendCommand: 'gerar_etiquetas_assets',
    },
    {
      id: 'check-compatibility',
      title: 'Verificar Compatibilidade',
      subtitle: 'Consultar regras determinísticas de engine e formato.',
      accent: 'purple',
      icon: 'shield',
      backendCommand: 'rodar_inferencia',
    },
  ]);

/**
 * Resolve estritamente os assets ativos selecionados sem duplicações.
 */
export function resolveSelectedAssetsScope(
  assets: readonly DeckAsset[],
  selectedAssetIds: readonly string[],
): DeckAsset[] {
  if (selectedAssetIds.length === 0) return [];
  const selectedSet = new Set(selectedAssetIds);
  return deduplicateAssets(assets).filter(
    (asset) => !asset.deleted && selectedSet.has(asset.id),
  );
}

/**
 * Monta o contrato determinístico pronto para despacho ao backend Tauri
 * restrito exclusivamente ao grupo de `selectedAssets`.
 */
export function buildQuickActionScopePayload(
  actionId: NautiaQuickActionId,
  selectedAssets: readonly DeckAsset[],
  now: () => string = () => new Date().toISOString(),
): QuickActionScopePayload {
  const uniqueSelected = deduplicateAssets(selectedAssets).filter(
    (asset) => !asset.deleted,
  );
  if (uniqueSelected.length === 0) {
    throw new Error(
      'Selecione pelo menos um asset no Convés para executar esta ação.',
    );
  }

  const definition = NAUTIA_QUICK_ACTION_CARDS.find((card) => card.id === actionId);
  if (!definition) {
    throw new Error(`Ação rápida desconhecida: ${actionId}`);
  }

  return {
    actionId,
    backendCommand: definition.backendCommand,
    selectedAssetIds: uniqueSelected.map((asset) => asset.id),
    targetAssets: uniqueSelected,
    totalSelected: uniqueSelected.length,
    preparedAt: now(),
  };
}
