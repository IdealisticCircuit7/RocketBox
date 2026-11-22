import type {
  LibraryOperationsService,
  LibraryOperationType,
  OperationResult,
  PermissionContext,
  UndoDescriptor,
} from './libraryOperationsService.ts';

/**
 * Histórico estruturado e Desfazer (Etapa 02 - Seção 8).
 * Persiste logs das operações executadas pela Nautia ou pelo Convés,
 * permitindo reversão controlada de operações reversíveis.
 */

export const NAUTIA_HISTORY_KEY = 'ocsis.rocketbox.nautia.history.v1';
const MAX_HISTORY_ENTRIES = 100;

export type HistoryExecutionStatus = 'executed' | 'reverted' | 'failed';
export type HistorySource = 'quick-action' | 'nautia-chat' | 'action-plan';

export interface OperationHistoryEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly actionType: LibraryOperationType | 'action-plan';
  readonly source: HistorySource;
  readonly summary: string;
  readonly affectedResources: readonly string[];
  readonly status: HistoryExecutionStatus;
  readonly resultSummary: string;
  readonly reversible: boolean;
  readonly undoSteps: readonly UndoDescriptor[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function generateEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `op-${crypto.randomUUID()}`;
  }
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createOperationHistoryService(params?: {
  readonly storage?: StorageLike | null;
  readonly key?: string;
  readonly now?: () => string;
}) {
  const storage =
    params?.storage !== undefined
      ? params.storage
      : typeof localStorage !== 'undefined'
        ? localStorage
        : null;
  const key = params?.key ?? NAUTIA_HISTORY_KEY;
  const now = params?.now ?? (() => new Date().toISOString());

  let entries: OperationHistoryEntry[] = load();
  let undoArchive:OperationHistoryEntry[]=load(key+'.undo.v1');

  function load(storageKey=key): OperationHistoryEntry[] {
    if (!storage) return [];
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as OperationHistoryEntry[]) : [];
    } catch {
      return [];
    }
  }

  function persist(next: OperationHistoryEntry[]): void {
    entries = next.slice(0, MAX_HISTORY_ENTRIES);
    if (!storage) return;
    try {
      storage.setItem(key, JSON.stringify(entries));
    } catch {
      // Falha de cota no localStorage não deve quebrar operação em memória.
    }
  }

  function record(input: {
    readonly actionType: OperationHistoryEntry['actionType'];
    readonly source: HistorySource;
    readonly summary: string;
    readonly affectedResources: readonly string[];
    readonly status: HistoryExecutionStatus;
    readonly resultSummary: string;
    readonly undoSteps?: readonly UndoDescriptor[];
  }): OperationHistoryEntry {
    const undoSteps = input.undoSteps ?? [];
    const entry: OperationHistoryEntry = {
      id: generateEntryId(),
      timestamp: now(),
      actionType: input.actionType,
      source: input.source,
      summary: input.summary,
      affectedResources: Array.from(new Set(input.affectedResources)),
      status: input.status,
      resultSummary: input.resultSummary,
      reversible: input.status === 'executed' && undoSteps.length > 0,
      undoSteps,
    };

    persist([entry, ...entries]);
    return entry;
  }

  function undoEntry(
    entryId: string,
    operations: LibraryOperationsService,
    permissions: PermissionContext = { actor: 'user-ui', allowMutations: true },
  ): OperationResult<{ entry: OperationHistoryEntry }> {
    const target = [...entries,...undoArchive].find((item) => item.id === entryId);
    if (!target) {
      return {
        ok: false,
        operation: 'organizeRecords',
        summary: 'Registro de histórico não encontrado.',
        affectedResources: [],
        reversible: false,
        error: 'Registro de histórico não encontrado.',
      };
    }

    if (!target.reversible || target.status !== 'executed') {
      return {
        ok: false,
        operation: 'organizeRecords',
        summary: 'Esta operação não pode ser desfeita ou já foi revertida.',
        affectedResources: target.affectedResources,
        reversible: false,
        error: 'Operação não reversível no estado atual.',
      };
    }

    // Reverte passos em ordem inversa à execução.
    const stepsReversed = [...target.undoSteps].reverse();
    const summaries: string[] = [];
    for (const step of stepsReversed) {
      const undoResult = operations.applyUndo(step, permissions);
      if (!undoResult.ok) {
        return {
          ok: false,
          operation: undoResult.operation,
          summary: undoResult.summary,
          affectedResources: target.affectedResources,
          reversible: false,
          error: undoResult.error ?? undoResult.summary,
        };
      }
      summaries.push(undoResult.summary);
    }

    const updatedEntry: OperationHistoryEntry = {
      ...target,
      status: 'reverted',
      reversible: false,
      resultSummary: `Desfeito: ${summaries.join(' ')}`,
    };

    if(entries.some(item=>item.id===entryId))persist(entries.map((item) => (item.id === entryId ? updatedEntry : item)));
    else {const next=undoArchive.filter(item=>item.id!==entryId);undoArchive=next;try{storage?.setItem(key+'.undo.v1',JSON.stringify(next));}catch{/* Same best-effort undo logging policy as the visible history. */}}

    return {
      ok: true,
      operation: 'organizeRecords',
      data: { entry: updatedEntry },
      summary: updatedEntry.resultSummary,
      affectedResources: target.affectedResources,
      reversible: false,
    };
  }

  function list(): readonly OperationHistoryEntry[] {
    return entries;
  }

  function clear(): void {
    const archived=[...new Map([...undoArchive,...entries.filter(e=>e.reversible&&e.status==='executed')].map(e=>[e.id,e])).values()].slice(-MAX_HISTORY_ENTRIES).map(e=>({...e,summary:'Dados operacionais de desfazer',resultSummary:''}));
    // Operational undo records survive visual log deletion. Write them first; failures never claim success.
    storage?.setItem(key+'.undo.v1',JSON.stringify(archived));
    storage?.setItem(key,'[]');
    undoArchive=archived;entries=[];
  }

  return {
    list,
    record,
    undoEntry,
    clear,
  };
}

export type OperationHistoryService = ReturnType<
  typeof createOperationHistoryService
>;
