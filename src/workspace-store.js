export const WORKSPACE_KEY = 'ocsis.rocketbox.workspace.v1';
const clone = value => JSON.parse(JSON.stringify(value));
const defaults = () => ({ folders: [], assets: [], layout: 'layout-left', motion: true, schemaVersion: 2 });
export function normalizeTagName(label) {
  return String(label ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}
function deduplicateTagStoreState(target, fallbackNow) {
  const assetIdRemap = new Map();
  const canonicalAssetByNorm = new Map();
  if (Array.isArray(target.assetTags)) {
    const deduped = [];
    for (const rawTag of target.assetTags) {
      if (!rawTag || typeof rawTag.label !== 'string') continue;
      const cleanLabel = rawTag.label.trim().replace(/\s+/g, ' ');
      const norm = normalizeTagName(rawTag.normalizedLabel || cleanLabel);
      if (!cleanLabel || !norm) continue;
      const existing = canonicalAssetByNorm.get(norm);
      if (existing) {
        if (rawTag.id) assetIdRemap.set(rawTag.id, existing.id);
        continue;
      }
      const canonical = {
        ...rawTag,
        id: rawTag.id || `atag-${deduped.length + 1}`,
        kind: 'asset-tag',
        label: cleanLabel,
        normalizedLabel: norm,
        createdAt: rawTag.createdAt || fallbackNow,
      };
      canonicalAssetByNorm.set(norm, canonical);
      if (rawTag.id) assetIdRemap.set(rawTag.id, canonical.id);
      deduped.push(canonical);
    }
    target.assetTags = deduped;
  }

  const folderIdRemap = new Map();
  const canonicalFolderByNorm = new Map();
  if (Array.isArray(target.folderTags)) {
    const deduped = [];
    for (const rawTag of target.folderTags) {
      if (!rawTag || typeof rawTag.label !== 'string') continue;
      const cleanLabel = rawTag.label.trim().replace(/\s+/g, ' ');
      const norm = normalizeTagName(rawTag.normalizedLabel || cleanLabel);
      if (!cleanLabel || !norm) continue;
      const existing = canonicalFolderByNorm.get(norm);
      if (existing) {
        if (rawTag.id) folderIdRemap.set(rawTag.id, existing.id);
        continue;
      }
      const canonical = {
        ...rawTag,
        id: rawTag.id || `ftag-${deduped.length + 1}`,
        kind: 'folder-tag',
        label: cleanLabel,
        normalizedLabel: norm,
        color: rawTag.color || rawTag.accent || 'cyan',
        createdAt: rawTag.createdAt || fallbackNow,
      };
      canonicalFolderByNorm.set(norm, canonical);
      if (rawTag.id) folderIdRemap.set(rawTag.id, canonical.id);
      deduped.push(canonical);
    }
    target.folderTags = deduped;
  }

  if (Array.isArray(target.assets)) {
    target.assets = target.assets.map(asset => {
      if (!asset || typeof asset !== 'object') return asset;
      const next = { ...asset };
      if (Array.isArray(asset.assetTagIds)) {
        const mappedIds = [];
        const seenIds = new Set();
        for (const id of asset.assetTagIds) {
          const resolvedId = assetIdRemap.get(id) ?? id;
          if (resolvedId && !seenIds.has(resolvedId)) {
            seenIds.add(resolvedId);
            mappedIds.push(resolvedId);
          }
        }
        next.assetTagIds = mappedIds;
      }
      if (Array.isArray(asset.tags)) {
        const uniqueLabels = [];
        const seenNorms = new Set();
        for (const rawLabel of asset.tags) {
          const clean = String(rawLabel ?? '').trim().replace(/\s+/g, ' ');
          const norm = normalizeTagName(clean);
          if (!clean || !norm || seenNorms.has(norm)) continue;
          seenNorms.add(norm);
          const catalogMatch = canonicalAssetByNorm.get(norm);
          uniqueLabels.push(catalogMatch ? catalogMatch.label : clean);
        }
        next.tags = uniqueLabels;
      }
      return next;
    });
  }

  if (Array.isArray(target.folders) && folderIdRemap.size > 0) {
    target.folders = target.folders.map(folder => {
      if (!folder || !Array.isArray(folder.folderTagIds)) return folder;
      const mappedIds = [];
      const seenIds = new Set();
      for (const id of folder.folderTagIds) {
        const resolvedId = folderIdRemap.get(id) ?? id;
        if (resolvedId && !seenIds.has(resolvedId)) {
          seenIds.add(resolvedId);
          mappedIds.push(resolvedId);
        }
      }
      return { ...folder, folderTagIds: mappedIds };
    });
  }
}
export const itemKey = ref => `${ref.type}:${ref.id}`;
const records = (state, type) => type === 'folder' ? state.folders : state.assets;
function item(state, ref) {
  if (!['folder', 'asset'].includes(ref.type)) throw new Error('Tipo de item inválido.');
  const value = records(state, ref.type).find(record => record.id === ref.id);
  if (!value) throw new Error('O item não existe mais. Atualize a biblioteca.');
  return value;
}
export function folderPath(state, id) {
  const names = [], visited = new Set();
  let folder = state.folders.find(f => f.id === id);
  while (folder && !visited.has(folder.id)) {
    visited.add(folder.id); names.unshift(folder.name);
    folder = state.folders.find(f => f.id === folder.parent);
  }
  return ['Convés', ...names].join(' / ');
}
function subtree(state, root) {
  const ids = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of state.folders) if (ids.has(folder.parent) && !ids.has(folder.id)) { ids.add(folder.id); changed = true; }
  }
  return ids;
}
function validate(state) {
  for (const [type, list] of [['folder', state.folders], ['asset', state.assets]]) {
    const ids = new Set();
    for (const record of list) {
      if (!record || typeof record.id !== 'string' || !record.id || ids.has(record.id)) throw new Error(`IDs inválidos ou repetidos em ${type}. Dados preservados; revise o armazenamento.`);
      ids.add(record.id);
      if (typeof record[type === 'folder' ? 'name' : 'nome'] !== 'string') throw new Error('Registro inválido na biblioteca.');
      if (record.deleted && (record.deleted.id !== record.id || record.deleted.type !== type || typeof record.deleted.at !== 'string' || !record.deleted.batchId || !Object.hasOwn(record.deleted, 'originalParent'))) throw new Error('Metadados da lixeira inválidos. Dados preservados.');
    }
  }
  for (const folder of state.folders) {
    const seen = new Set([folder.id]);
    let parent = state.folders.find(f => f.id === folder.parent);
    while (parent) {
      if (seen.has(parent.id)) throw new Error('A hierarquia contém um ciclo. Operação cancelada.');
      seen.add(parent.id); parent = state.folders.find(f => f.id === parent.parent);
    }
  }
}
export function trashEntries(state) {
  return [...state.folders.map(f => ({ type: 'folder', ...f })), ...state.assets.map(a => ({ type: 'asset', ...a }))]
    .filter(record => record.deleted && !(record.type === 'folder'
      ? state.folders.some(parent => parent.id === record.parent && parent.deleted?.batchId === record.deleted.batchId)
      : state.folders.some(parent => parent.id === record.folder && parent.deleted?.batchId === record.deleted.batchId)))
    .sort((a, b) => b.deleted.at.localeCompare(a.deleted.at));
}
export function filterAssets(state, filters = {}) {
  const q = (filters.query || '').trim().toLocaleLowerCase();
  const result = state.assets.filter(a => !a.deleted)
    .filter(a => !q || [a.nome, a.caminho, a.categoria, ...(a.tags || [])].join(' ').toLocaleLowerCase().includes(q))
    .filter(a => !filters.category || a.categoria === filters.category)
    .filter(a => !filters.extension || a.formato === filters.extension)
    .filter(a => !filters.tag || (a.tags || []).includes(filters.tag))
    .filter(a => !filters.folder || (filters.folder === '__root__' ? a.folder == null : a.folder === filters.folder));
  const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
  const sort = filters.sort || 'name';
  return result.sort((a, b) => sort === 'recent'
    ? (b.createdAt || '').localeCompare(a.createdAt || '') || collator.compare(a.nome, b.nome)
    : sort === 'format' ? collator.compare(a.formato || '', b.formato || '') || collator.compare(a.nome, b.nome)
    : (sort === 'name-desc' ? -1 : 1) * collator.compare(a.nome, b.nome));
}

/** All data is metadata. This module deliberately has no filesystem APIs. */
export function createWorkspaceStore({ storage, key = WORKSPACE_KEY, uuid = () => crypto.randomUUID(), now = () => new Date().toISOString() }) {
  let state = defaults(), serialized = null, readError = null;
  try {
    serialized = storage.getItem(key);
    if (serialized !== null) {
      const saved = JSON.parse(serialized);
      if (!saved || !Array.isArray(saved.folders) || !Array.isArray(saved.assets)) throw new Error('Armazenamento inválido.');
      state = { ...defaults(), ...saved, schemaVersion: 2 };
      state.folders = saved.folders.map(f => ({ ...f, parent: f.parent ?? null }));
      state.assets = saved.assets.map(a => ({ ...a, id: a.id || uuid(), folder: a.folder ?? null, tags: Array.isArray(a.tags) ? a.tags : [] }));
      deduplicateTagStoreState(state, now());
      validate(state);
    }
  } catch (error) { readError = error; state = defaults(); }
  function transact(mutator) {
    if (readError) throw new Error('Leitura indisponível: gravação bloqueada para preservar os dados existentes. Recarregue após corrigir o armazenamento.');
    if (storage.getItem(key) !== serialized) throw new Error('Os dados mudaram em outra janela. Recarregue antes de continuar.');
    const draft = clone(state);
    const result = mutator(draft);
    const activeFolders = new Map(draft.folders.filter(f => !f.deleted).map(f => [f.id, f]));
    const previousFolders = new Map(state.folders.map(f => [f.id, f]));
    const previousAssets = new Map(state.assets.map(a => [a.id, a]));
    for (const folder of draft.folders) {
      if (folder.deleted) continue;
      const previous = previousFolders.get(folder.id);
      if ((!previous || previous.parent !== folder.parent) && folder.parent != null && !activeFolders.has(folder.parent)) throw new Error('Pasta de destino inexistente ou na lixeira.');
    }
    for (const asset of draft.assets) {
      if (asset.deleted) continue;
      const previous = previousAssets.get(asset.id);
      if ((!previous || previous.folder !== asset.folder) && asset.folder != null && !activeFolders.has(asset.folder)) throw new Error('Pasta de destino inexistente ou na lixeira.');
    }
    deduplicateTagStoreState(draft, now());
    validate(draft);
    draft.schemaVersion = 2;
    const next = JSON.stringify(draft);
    // setItem is atomic: publish only after the complete snapshot was persisted.
    storage.setItem(key, next);
    serialized = next; state = draft;
    return result;
  }
  function affected(refs, mode) {
    const found = new Map();
    for (const ref of refs) {
      const root = item(state, ref);
      if (mode === 'trash' && root.deleted) throw new Error('Este item já está na lixeira.');
      if (mode !== 'trash' && !root.deleted) throw new Error('Este item está ativo.');
      const ids = ref.type === 'folder' ? subtree(state, ref.id) : new Set();
      const add = (type, record) => {
        const matches = mode === 'trash' ? !record.deleted : mode === 'restore' ? record.deleted?.batchId === root.deleted.batchId : !!record.deleted;
        if (matches) found.set(itemKey({ type, id: record.id }), { type, id: record.id });
      };
      add(ref.type, root);
      if (ref.type === 'folder') {
        for (const f of state.folders) if (ids.has(f.id)) add('folder', f);
        for (const a of state.assets) if (ids.has(a.folder)) add('asset', a);
        if (mode === 'purge' && (state.folders.some(f => ids.has(f.id) && !f.deleted) || state.assets.some(a => ids.has(a.folder) && !a.deleted))) throw new Error('Há registros ativos nesta estrutura. Restaure a pasta antes de excluir.');
      }
    }
    return [...found.values()];
  }
  function plan(refs, mode = 'trash') { return affected(refs, mode); }
  function moveToTrash(refs) {
    const targets = affected(refs, 'trash'), at = now(), batchId = uuid();
    transact(draft => {
      for (const ref of targets) {
        const record = item(draft, ref);
        record.deleted = { id: record.id, type: ref.type, batchId, at,
          originalParent: ref.type === 'folder' ? record.parent : record.folder,
          originalLocation: folderPath(draft, ref.type === 'folder' ? record.parent : record.folder) };
      }
    });
    return targets;
  }
  function restore(refs) {
    const targets = affected(refs, 'restore');
    const restoringFolders = new Set(targets.filter(r => r.type === 'folder').map(r => r.id));
    const changes = { relocated: [], renamed: [] };
    transact(draft => {
      const available = id => id == null || draft.folders.some(f => f.id === id && (!f.deleted || restoringFolders.has(id)));
      // Parents first; handle independent deletion batches without reviving them.
      const folders = targets.filter(r => r.type === 'folder').sort((a, b) => folderPath(draft, a.id).split(' / ').length - folderPath(draft, b.id).split(' / ').length);
      for (const ref of [...folders, ...targets.filter(r => r.type === 'asset')]) {
        const record = item(draft, ref), metadata = record.deleted;
        const destination = available(metadata.originalParent) ? metadata.originalParent : null;
        if (destination !== metadata.originalParent) changes.relocated.push(ref.id);
        const location = ref.type === 'folder' ? 'parent' : 'folder', nameKey = ref.type === 'folder' ? 'name' : 'nome';
        record[location] = destination;
        const base = record[nameKey];
        let name = base, suffix = 1;
        while (records(draft, ref.type).some(other => other.id !== ref.id && !other.deleted && other[location] === destination && other[nameKey].toLocaleLowerCase() === name.toLocaleLowerCase())) name = `${base} (restaurado ${suffix++})`;
        if (name !== base) { record[nameKey] = name; changes.renamed.push(ref.id); }
        delete record.deleted;
      }
    });
    return changes;
  }
  function purge(refs) {
    const targets = affected(refs, 'purge'), keys = new Set(targets.map(itemKey));
    transact(draft => {
      draft.folders = draft.folders.filter(f => !keys.has(itemKey({ type: 'folder', id: f.id })));
      draft.assets = draft.assets.filter(a => !keys.has(itemKey({ type: 'asset', id: a.id })));
    });
    return targets.length;
  }
  return { snapshot: () => clone(state), transact, plan, moveToTrash, restore, purge, readError };
}
