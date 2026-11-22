import type { LlmClientConfig } from './llmClient.ts';
import type { NautiaQueryOutcome } from './nautiaOrchestratorService.ts';

export type ChatTurnStatus = 'success' | 'error' | 'unavailable' | 'cancelled';
export type PlanResolutionState = 'pending' | 'confirmed' | 'cancelled';

export interface ChatTurn {
  readonly id: string;
  readonly requestId?: string;
  readonly replyTo?: string;
  readonly role: 'user' | 'nautia';
  readonly text: string;
  readonly createdAt: string;
  readonly status?: ChatTurnStatus;
  readonly retryPrompt?: string;
  readonly sourceMode?: 'deterministic' | 'llm';
  readonly planResolution?: PlanResolutionState;
  readonly outcome?: NautiaQueryOutcome;
}

export interface GroupedChatTurn {
  readonly turn: ChatTurn;
  readonly isGroupStart: boolean;
  readonly isGroupEnd: boolean;
}

export interface NautiaConversationRecord {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly turns: readonly ChatTurn[];
}

export type NautiaServiceConnectivity =
  | 'deterministic'
  | 'llm-ready'
  | 'llm-unavailable';

export interface NautiaServiceStatus {
  readonly connectivity: NautiaServiceConnectivity;
  readonly label: string;
  readonly detail: string;
}

const STORAGE_KEY = 'ocsis.nautia.conversations.v1';
const ACTIVE_KEY='ocsis.nautia.active-conversation.v1';
export function restoreActiveConversation(conversations:readonly NautiaConversationRecord[], storage:Pick<Storage,'getItem'>):NautiaConversationRecord {
  try {
    const saved=JSON.parse(storage.getItem(ACTIVE_KEY)??'null');
    if(saved?.empty)return createEmptyConversation();
    if(saved?.id)return conversations.find(c=>c.id===saved.id)??createEmptyConversation();
  } catch { /* old/missing pointer: recover newest saved conversation */ }
  return conversations[0]??createEmptyConversation();
}
export function rememberActiveConversation(conversation:NautiaConversationRecord, storage:Pick<Storage,'setItem'>):void {
  storage.setItem(ACTIVE_KEY,JSON.stringify({id:conversation.id,empty:conversation.turns.length===0}));
}

export function makeConversationId(prefix = 'conv'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createEmptyConversation(nowIso = new Date().toISOString()): NautiaConversationRecord {
  return {
    id: makeConversationId('conv'),
    title: 'Nova conversa',
    createdAt: nowIso,
    updatedAt: nowIso,
    turns: [],
  };
}

export function deriveConversationTitle(promptText: string): string {
  const clean = promptText.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Nova conversa';
  return clean.length > 46 ? `${clean.slice(0, 43)}...` : clean;
}

/**
 * Agrupa mensagens consecutivas do mesmo emissor para evitar repetição excessiva de avatar e cabeçalho.
 */
export function groupConversationTurns(turns: readonly ChatTurn[]): GroupedChatTurn[] {
  return turns.map((turn, index) => {
    const prev = index > 0 ? turns[index - 1] : null;
    const next = index < turns.length - 1 ? turns[index + 1] : null;
    return {
      turn,
      isGroupStart: !prev || prev.role !== turn.role,
      isGroupEnd: !next || next.role !== turn.role,
    };
  });
}

/**
 * Determina honestamente o estado da assistente sem simular conexão ativa quando não há LLM.
 */
export function resolveAssistantServiceStatus(
  llmConfig: LlmClientConfig,
  lastTurn?: ChatTurn | null,
): NautiaServiceStatus {
  if (llmConfig.provider === 'none') {
    return {
      connectivity: 'deterministic',
      label: 'Local Determinístico',
      detail: 'Motor local e regras determinísticas ativos (sem LLM conectada).',
    };
  }

  const lastWarnings = lastTurn?.outcome?.warnings ?? [];
  const hasLlmFailure = (!llmConfig.verifiedAt || Date.parse(lastTurn?.createdAt ?? '') > llmConfig.verifiedAt) && (
    lastTurn?.status === 'unavailable' ||
    lastWarnings.some((warning) => /indisponível|falha|erro|endpoint|http/i.test(warning)));

  if (hasLlmFailure) {
    return {
      connectivity: 'llm-unavailable',
      label: 'LLM indisponível',
      detail: 'Provedor LLM inacessível no momento; recursos determinísticos seguem ativos.',
    };
  }

  if (!llmConfig.verifiedAt || Date.now() - llmConfig.verifiedAt > 60000) return { connectivity: 'llm-unavailable', label: 'LLM não verificada', detail: 'Teste a conexão e selecione um modelo instalado. Ações determinísticas disponíveis.' };

  const providerLabel =
    llmConfig.provider === 'ollama' ? `Ollama (${llmConfig.model})` : `OpenAI (${llmConfig.model})`;

  return {
    connectivity: 'llm-ready',
    label: `LLM · ${providerLabel}`,
    detail: `Provedor conversacional configurado (${providerLabel}) com validação no Action Plan.`,
  };
}

export function formatTurnTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function loadNautiaConversations(): NautiaConversationRecord[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is NautiaConversationRecord =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        Array.isArray(item.turns),
    );
  } catch {
    return [];
  }
}

export function saveNautiaConversations(conversations: readonly NautiaConversationRecord[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const nonEmpty = conversations.filter((conv) => conv.turns.length > 0);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nonEmpty));
  } catch {
    // Ignore storage quota or private-mode restrictions safely
  }
}

/** Called only after confirmation; other preferences and workspace keys are untouched. */
export function deleteNautiaConversations(records:readonly NautiaConversationRecord[],ids:readonly string[],activeId:string,storage:Pick<Storage,'setItem'>) {
 const removed=new Set(ids);const next=records.filter(r=>!removed.has(r.id));
 if(removed.has(activeId))storage.setItem(ACTIVE_KEY,JSON.stringify({empty:true}));
 storage.setItem(STORAGE_KEY,JSON.stringify(next));
 return {records:next,activeRemoved:removed.has(activeId)};
}
