import { invoke, isTauri } from '@tauri-apps/api/core';

export const PERSISTED_KEYS = [
  'ocsis.rocketbox.workspace.v1',
  'ocsis.rocketbox.preferences.v1',
  'ocsis.rocketbox.history.v1',
  'ocsis.nautia.conversations.v1',
  'ocsis.nautia.activeConversation.v1',
  'ocsis.nautia.ollama.v1',
  'ocsis.nautia.avatar.sleepSeconds',
  'ocsis.nautia.avatar.minimumSpeakingMs',
  'ocsis.nautia.perf.v1',
] as const;

const PERSISTED_SET = new Set<string>(PERSISTED_KEYS);

function hasWorkspaceRecords(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as {
      assets?: unknown[];
      folders?: unknown[];
    };
    return (
      (Array.isArray(parsed.assets) && parsed.assets.length > 0) ||
      (Array.isArray(parsed.folders) && parsed.folders.length > 0)
    );
  } catch {
    return false;
  }
}

function collectCurrentEntries(): Record<string, string> {
  const entries: Record<string, string> = {};
  if (typeof localStorage === 'undefined') return entries;
  for (const key of PERSISTED_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) {
        entries[key] = value;
      }
    } catch {
      // Ignora leitura indisponível.
    }
  }
  return entries;
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let hooksInstalled = false;

export async function flushNativePersistence(): Promise<void> {
  if (!isTauri() || typeof localStorage === 'undefined') return;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const entries = collectCurrentEntries();
  if (Object.keys(entries).length === 0) return;
  try {
    await invoke<string>('app_state_save', { entries });
  } catch (error) {
    console.warn('[RocketBox] Falha ao sincronizar estado persistente em AppData:', error);
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushNativePersistence();
  }, 120);
}

function installPersistenceHooks(): void {
  if (hooksInstalled || typeof Storage === 'undefined') return;
  hooksInstalled = true;

  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  Storage.prototype.setItem = function patchedSetItem(key: string, value: string): void {
    originalSetItem.call(this, key, value);
    if (this === window.localStorage && PERSISTED_SET.has(key)) {
      scheduleFlush();
    }
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key: string): void {
    originalRemoveItem.call(this, key);
    if (this === window.localStorage && PERSISTED_SET.has(key)) {
      scheduleFlush();
    }
  };

  window.addEventListener('pagehide', () => void flushNativePersistence());
  window.addEventListener('beforeunload', () => void flushNativePersistence());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushNativePersistence();
    }
  });
}

export async function initializeNativePersistence(): Promise<void> {
  if (!isTauri() || typeof localStorage === 'undefined') return;

  try {
    const loaded = await invoke<{ entries?: Record<string, unknown> }>('app_state_load');
    const diskEntries = loaded?.entries ?? {};
    let shouldFlushToDisk = false;

    for (const key of PERSISTED_KEYS) {
      const diskValue = typeof diskEntries[key] === 'string' ? (diskEntries[key] as string) : null;
      const localValue = localStorage.getItem(key);

      if (key === 'ocsis.rocketbox.workspace.v1') {
        const localHasRecords = hasWorkspaceRecords(localValue);
        const diskHasRecords = hasWorkspaceRecords(diskValue);
        if (!localHasRecords && diskHasRecords && diskValue !== null) {
          localStorage.setItem(key, diskValue);
        } else if (localValue === null && diskValue !== null) {
          localStorage.setItem(key, diskValue);
        } else if (localHasRecords && localValue !== diskValue) {
          shouldFlushToDisk = true;
        }
        continue;
      }

      if (localValue === null && diskValue !== null) {
        localStorage.setItem(key, diskValue);
      } else if (localValue !== null && diskValue === null) {
        shouldFlushToDisk = true;
      }
    }

    installPersistenceHooks();
    if (shouldFlushToDisk) {
      await flushNativePersistence();
    }
  } catch (error) {
    console.warn('[RocketBox] Não foi possível hidratar persistência nativa:', error);
    installPersistenceHooks();
  }
}
