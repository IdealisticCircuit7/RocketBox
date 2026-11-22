/**
 * Telemetria e diagnóstico de desempenho da NautIA (Etapas 2 e 7).
 * Registra apenas durações, contadores e métricas do Ollama — nunca o conteúdo das mensagens.
 */

export const NAUTIA_PERF_KEY = 'ocsis.nautia.perf.v1';
const MAX_PERF_ENTRIES = 25;

export interface OllamaRawMetrics {
  readonly totalDurationNs?: number;
  readonly loadDurationNs?: number;
  readonly promptEvalDurationNs?: number;
  readonly evalDurationNs?: number;
  readonly promptEvalCount?: number;
  readonly evalCount?: number;
  readonly firstTokenMs?: number;
}

export interface NautiaStageDurations {
  readonly receiveMs: number;
  readonly classifyMs: number;
  readonly contextMs: number;
  readonly toolSelectMs: number;
  readonly toolExecMs: number;
  readonly ollamaRequestMs: number;
  readonly firstTokenMs: number | null;
  readonly streamCompleteMs: number;
  readonly totalDurationMs: number;
}

export interface NautiaPerformanceEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly source: 'quick-reply' | 'knowledge' | 'deterministic' | 'ollama';
  readonly model: string;
  readonly llmCalls: number;
  readonly toolsExecuted: number;
  readonly historyMessagesCount: number;
  readonly historyChars: number;
  readonly cancelled: boolean;
  readonly failed: boolean;
  readonly failureCause?: string;
  readonly failureType?: string;
  readonly stages: NautiaStageDurations;
  readonly ollamaTotalDurationMs: number | null;
  readonly ollamaLoadDurationMs: number | null;
  readonly ollamaPromptEvalDurationMs: number | null;
  readonly ollamaEvalDurationMs: number | null;
  readonly promptEvalCount: number | null;
  readonly evalCount: number | null;
  readonly tokensPerSecond: number | null;
}

export function nsToMs(ns?: number): number | null {
  if (typeof ns !== 'number' || !Number.isFinite(ns) || ns < 0) return null;
  return Math.round((ns / 1_000_000) * 100) / 100;
}

export function computeTokensPerSecond(
  evalCount?: number,
  evalDurationNs?: number,
): number | null {
  if (
    typeof evalCount !== 'number' ||
    typeof evalDurationNs !== 'number' ||
    !Number.isFinite(evalCount) ||
    !Number.isFinite(evalDurationNs) ||
    evalCount <= 0 ||
    evalDurationNs <= 0
  ) {
    return null;
  }
  return Math.round((evalCount / (evalDurationNs / 1_000_000_000)) * 10) / 10;
}

export function formatPerfDuration(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function loadNautiaPerformanceLogs(
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): NautiaPerformanceEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(NAUTIA_PERF_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as NautiaPerformanceEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordNautiaPerformance(
  entry: NautiaPerformanceEntry,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): NautiaPerformanceEntry[] {
  const current = loadNautiaPerformanceLogs(storage);
  const next = [entry, ...current].slice(0, MAX_PERF_ENTRIES);
  if (storage) {
    try {
      storage.setItem(NAUTIA_PERF_KEY, JSON.stringify(next));
    } catch {
      // Falha de cota no localStorage não deve interromper o chat.
    }
  }
  return next;
}

export function createNautiaPerformanceEntry(input: {
  source: NautiaPerformanceEntry['source'];
  model: string;
  llmCalls?: number;
  toolsExecuted?: number;
  historyMessagesCount?: number;
  historyChars?: number;
  cancelled?: boolean;
  failed?: boolean;
  failureCause?: string;
  failureType?: string;
  stages?: Partial<NautiaStageDurations>;
  ollamaTotalDurationMs?: number | null;
  ollamaLoadDurationMs?: number | null;
  ollamaPromptEvalDurationMs?: number | null;
  ollamaEvalDurationMs?: number | null;
  promptEvalCount?: number | null;
  evalCount?: number | null;
  tokensPerSecond?: number | null;
}): NautiaPerformanceEntry {
  return {
    id: `perf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    source: input.source,
    model: input.model,
    llmCalls: input.llmCalls ?? 0,
    toolsExecuted: input.toolsExecuted ?? 0,
    historyMessagesCount: input.historyMessagesCount ?? 0,
    historyChars: input.historyChars ?? 0,
    cancelled: Boolean(input.cancelled),
    failed: Boolean(input.failed),
    failureCause: input.failureCause,
    failureType: input.failureType,
    stages: {
      receiveMs: input.stages?.receiveMs ?? 0,
      classifyMs: input.stages?.classifyMs ?? 0,
      contextMs: input.stages?.contextMs ?? 0,
      toolSelectMs: input.stages?.toolSelectMs ?? 0,
      toolExecMs: input.stages?.toolExecMs ?? 0,
      ollamaRequestMs: input.stages?.ollamaRequestMs ?? 0,
      firstTokenMs: input.stages?.firstTokenMs ?? null,
      streamCompleteMs: input.stages?.streamCompleteMs ?? 0,
      totalDurationMs: input.stages?.totalDurationMs ?? 0,
    },
    ollamaTotalDurationMs: input.ollamaTotalDurationMs ?? null,
    ollamaLoadDurationMs: input.ollamaLoadDurationMs ?? null,
    ollamaPromptEvalDurationMs: input.ollamaPromptEvalDurationMs ?? null,
    ollamaEvalDurationMs: input.ollamaEvalDurationMs ?? null,
    promptEvalCount: input.promptEvalCount ?? null,
    evalCount: input.evalCount ?? null,
    tokensPerSecond: input.tokensPerSecond ?? null,
  };
}

export function clearNautiaPerformanceLogs(
  storage: Pick<Storage, 'removeItem'> | null = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): void {
  if (!storage) return;
  try {
    storage.removeItem(NAUTIA_PERF_KEY);
  } catch {
    // Ignorar falha de remoção.
  }
}
