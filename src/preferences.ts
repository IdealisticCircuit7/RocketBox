/** Preferences contain presentation/policy only. Never assets, paths, tokens or credentials. */
export const PREFERENCES_KEY = 'ocsis.rocketbox.preferences';
export const PREFERENCES_VERSION = 3;
export interface Preferences {
  accent: 'cyan' | 'blue' | 'purple';
  theme: 'cinematic' | 'professional' | 'performance' | 'custom';
  wallpaper: 'close' | 'original' | 'wide';
  wallpaperPosition: 'cinema' | 'center' | 'right';
  overlay: number;
  parallax: boolean;
  parallaxIntensity: number;
  glow: number;
  panelOpacity: number;
  lighting: boolean;
  animationIntensity: number;
  layout: 'layout-left' | 'layout-top';
  showNavLabels: boolean;
  compactMenu: boolean;
  density: 'comfortable' | 'compact';
  assetView: 'cards' | 'list';
  tooltips: boolean;
  sort: 'name' | 'name-desc' | 'recent' | 'format';
  initialCategory: string;
  initialExtension: string;
  defaultFolder: string;
  showExtensions: boolean;
  showMetadata: boolean;
  duplicateMode: 'warn' | 'block' | 'allow';
  confirmFolders: boolean;
  confirmBatch: boolean;
  showNautiaAvatar: boolean;
  siaExpanded: boolean;
  startup: 'home' | 'workspace' | 'register' | 'trash' | 'nautia' | 'settings';
  performance: boolean;
  animations: boolean;
}
export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  accent: 'cyan', theme: 'cinematic', wallpaper: 'close', wallpaperPosition: 'cinema', overlay: 30,
  parallax: true, parallaxIntensity: 60, glow: 55, panelOpacity: 86, lighting: true,
  animationIntensity: 65, layout: 'layout-left', showNavLabels: true, compactMenu: false,
  density: 'comfortable', assetView: 'cards', tooltips: true, sort: 'name',
  initialCategory: '', initialExtension: '', defaultFolder: '', showExtensions: true,
  showMetadata: true, duplicateMode: 'warn', confirmFolders: false, confirmBatch: true,
  showNautiaAvatar: true, siaExpanded: false, startup: 'home', performance: false, animations: true,
});
const oneOf = (...values: string[]) => (v: unknown) => typeof v === 'string' && values.includes(v);
const boolean = (v: unknown) => typeof v === 'boolean';
const range = (min: number, max: number) => (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const text = (max: number) => (v: unknown) => typeof v === 'string' && v.length <= max && !/[\u0000-\u001f]/.test(v);
const rules: Record<keyof Preferences, (value: unknown) => boolean> = {
  accent: oneOf('cyan','blue','purple'),
  theme: oneOf('cinematic', 'professional', 'performance', 'custom'),
  wallpaper: oneOf('close', 'original', 'wide'), wallpaperPosition: oneOf('cinema', 'center', 'right'),
  overlay: range(0, 85), parallax: boolean, parallaxIntensity: range(0, 100), glow: range(0, 100),
  panelOpacity: range(40, 100), lighting: boolean, animationIntensity: range(0, 100),
  layout: oneOf('layout-left', 'layout-top'), showNavLabels: boolean, compactMenu: boolean,
  density: oneOf('comfortable', 'compact'), assetView: oneOf('cards', 'list'), tooltips: boolean,
  sort: oneOf('name', 'name-desc', 'recent', 'format'), initialCategory: text(80), initialExtension: text(20),
  defaultFolder: text(120), showExtensions: boolean, showMetadata: boolean,
  duplicateMode: oneOf('warn', 'block', 'allow'), confirmFolders: boolean, confirmBatch: boolean,
  showNautiaAvatar: boolean, siaExpanded: boolean,
  startup: oneOf('home', 'workspace', 'register', 'trash', 'nautia', 'settings'), performance: boolean, animations: boolean,
};
const keys = Object.keys(rules) as (keyof Preferences)[];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function validatePatch(value: unknown): Partial<Preferences> {
  if (!object(value)) throw new Error('Preferências inválidas: esperado um objeto.');
  for (const [key, v] of Object.entries(value)) {
    if (!Object.prototype.hasOwnProperty.call(rules, key) || !rules[key as keyof Preferences](v)) throw new Error('Preferências inválidas: campo desconhecido ou valor fora dos limites.');
  }
  return value as Partial<Preferences>;
}
export function migrateLegacy(legacy: unknown): Preferences {
  const next = { ...DEFAULT_PREFERENCES };
  if (object(legacy)) {
    if (rules.layout(legacy.layout)) next.layout = legacy.layout as Preferences['layout'];
    const motion = legacy.effectsEnabled ?? legacy.motion;
    if (typeof motion === 'boolean') next.animations = motion;
  }
  return next;
}
/** Strict import: unknown fields are rejected, never copied into preferences. */
export function parsePreferences(input: string): Preferences {
  if (input.length > 100_000) throw new Error('Arquivo de preferências excede 100 KB.');
  let envelope: unknown;
  try { envelope = JSON.parse(input); } catch { throw new Error('JSON de preferências inválido.'); }
  if (!object(envelope) || envelope.format !== 'ocsis.rocketbox.preferences' || !object(envelope.preferences)) throw new Error('Este arquivo não é uma exportação de preferências do RocketBox.');
  if (Object.keys(envelope).some(k => !['format', 'schemaVersion', 'exportedAt', 'preferences'].includes(k))) throw new Error('A exportação contém campos não permitidos.');
  if (envelope.schemaVersion === 1) {
    const old = envelope.preferences;
    if (Object.keys(old).some(k => !['layout', 'motion', 'effectsEnabled'].includes(k)) || ('layout' in old && !rules.layout(old.layout)) || ['motion', 'effectsEnabled'].some(k => k in old && !boolean(old[k]))) throw new Error('Preferências antigas inválidas.');
    return migrateLegacy(old);
  }
  let migrated = envelope.preferences;
  if (envelope.schemaVersion === 2) {
    // Compatibility is restricted to the previous local assistant's persisted contract.
    // Reject mixed identities instead of guessing which avatar preference to preserve.
    const old = envelope.preferences;
    if ('showNautiaAvatar' in old || !Object.prototype.hasOwnProperty.call(old, 'showSynclairAvatar') ||
        !boolean(old.showSynclairAvatar) || !oneOf('home', 'workspace', 'register', 'trash', 'synclair', 'settings')(old.startup)) {
      throw new Error('Preferências v2 inválidas ou ambíguas.');
    }
    const { showSynclairAvatar, startup, ...unchanged } = old;
    migrated = { ...unchanged, showNautiaAvatar: showSynclairAvatar, startup: startup === 'synclair' ? 'nautia' : startup };
  } else if (envelope.schemaVersion !== PREFERENCES_VERSION) throw new Error('Versão de preferências não suportada.');
  const values = validatePatch({ accent: DEFAULT_PREFERENCES.accent, ...migrated });
  if (keys.some(k => !Object.prototype.hasOwnProperty.call(values, k))) throw new Error('Exportação incompleta: faltam preferências.');
  return { ...DEFAULT_PREFERENCES, ...values };
}
export const serializePreferences = (preferences: Preferences) => JSON.stringify({
  format: 'ocsis.rocketbox.preferences', schemaVersion: PREFERENCES_VERSION,
  exportedAt: new Date().toISOString(), preferences: { ...DEFAULT_PREFERENCES, ...validatePatch(preferences) },
}, null, 2);
const visualKeys: (keyof Preferences)[] = ['accent', 'wallpaper', 'wallpaperPosition', 'overlay', 'parallax', 'parallaxIntensity', 'glow', 'panelOpacity', 'lighting', 'animationIntensity', 'performance', 'animations'];
export const THEME_PRESETS: Record<'cinematic' | 'professional' | 'performance', Partial<Preferences>> = {
  cinematic: { ...Object.fromEntries(visualKeys.map(k => [k, DEFAULT_PREFERENCES[k]])), animations: true, performance: false },
  professional: { overlay: 65, parallax: false, glow: 20, panelOpacity: 96, lighting: true, animationIntensity: 30, animations: true, performance: false },
  performance: { overlay: 75, parallax: false, glow: 0, panelOpacity: 100, lighting: false, animationIntensity: 0, animations: false, performance: true },
};
export function createPreferencesService({ storage, legacy = {} }: { storage: Storage; legacy?: unknown }) {
  let values = migrateLegacy(legacy), serialized: string | null = null;
  let warning = '', savedAt: string | null = null, damaged = false;
  const listeners = new Set<(p: Preferences, changed: (keyof Preferences)[]) => void>();
  function load() {
    try {
      serialized = storage.getItem(PREFERENCES_KEY);
      values = serialized === null ? migrateLegacy(legacy) : parsePreferences(serialized);
      damaged = false; warning = '';
    } catch {
      values = { ...DEFAULT_PREFERENCES }; damaged = true;
      warning = 'Preferências ilegíveis. Padrões seguros aplicados; o conteúdo original será preservado antes de uma nova gravação.';
    }
  }
  load();
  function publish(next: Preferences) {
    const changed = keys.filter(k => next[k] !== values[k]);
    values = next;
    listeners.forEach(fn => fn({ ...values }, changed));
  }
  function replace(next: Preferences) {
    validatePatch(next);
    if (storage.getItem(PREFERENCES_KEY) !== serialized) throw new Error('As preferências mudaram em outra janela. Recarregue antes de continuar.');
    if (damaged && serialized !== null) storage.setItem(`${PREFERENCES_KEY}.recovery.${Date.now()}`, serialized);
    const text = serializePreferences(next);
    storage.setItem(PREFERENCES_KEY, text);
    serialized = text; damaged = false; warning = ''; savedAt = new Date().toISOString();
    publish({ ...next });
  }
  function update(patch: Partial<Preferences>, { preset = false } = {}) {
    validatePatch(patch);
    const next = { ...values, ...patch };
    if (!preset && visualKeys.some(k => k in patch && patch[k] !== values[k])) next.theme = 'custom';
    replace(next);
  }
  return {
    snapshot: () => ({ ...values }), update,
    set<K extends keyof Preferences>(key: K, value: Preferences[K]) { update({ [key]: value }); },
    setTheme(theme: Preferences['theme']) { update({ ...(theme === 'custom' ? {} : THEME_PRESETS[theme]), theme }, { preset: true }); },
    reset() { replace({ ...DEFAULT_PREFERENCES }); },
    import(text: string) { replace(parsePreferences(text)); },
    export: () => serializePreferences(values),
    subscribe(fn: (p: Preferences, changed: (keyof Preferences)[]) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    reload() { const previous = values; load(); const next = values; values = previous; publish(next); },
    get status() { return { warning, savedAt, damaged }; },
  };
}
/** Local path comparison only; no filesystem access or content hashing. */
export const normalizeAssetPath = (value: string) => value.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase();
