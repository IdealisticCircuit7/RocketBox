import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildGlobalTagCatalog,
  deduplicateWorkspaceTags,
  isSystemReservedTag,
  normalizeTagLabel,
} from '../src/services/deckFilterService.ts';
import { createLibraryOperationsService } from '../src/services/libraryOperationsService.ts';
import { buildTagPickerDropdownItems } from '../src/services/tagPickerLogic.ts';
import { createWorkspaceStore, normalizeTagName } from '../src/workspace-store.js';

class MemoryStorage {
  constructor(initialMap = {}) {
    this.map = new Map(
      Object.entries(initialMap).map(([key, val]) => [
        key,
        typeof val === 'string' ? val : JSON.stringify(val),
      ]),
    );
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, value);
  }
}

const WORKSPACE_KEY = 'ocsis.rocketbox.workspace.v1';

function createEnv(initialData = { folders: [], assets: [], folderTags: [], assetTags: [] }) {
  const storage = new MemoryStorage({ [WORKSPACE_KEY]: initialData });
  let seq = 0;
  const store = createWorkspaceStore({
    storage,
    key: WORKSPACE_KEY,
    uuid: () => `id-${++seq}`,
    now: () => '2026-11-15T19:30:00.000Z',
  });
  const operations = createLibraryOperationsService(store);
  return { storage, store, operations };
}

test('Etapa 12.1 & 12.2: etiquetas criadas no Registrar Asset aparecem imediatamente no catálogo global do Convés e persistem ao recarregar', () => {
  const { storage, store, operations } = createEnv();

  const reg = operations.registerAsset({
    nome: 'Cyber_Helmet',
    caminho: 'D:/Assets/Props/Cyber_Helmet.glb',
    kind: 'asset',
    categoria: 'Objeto',
    formato: '.glb',
    engine: 'Blender',
    sourceSoftware: 'blender',
    targetSoftware: ['unreal'],
    tags: ['Sci-Fi', 'DOW'],
  });
  assert.equal(reg.ok, true);

  const snap = store.snapshot();
  const catalog = buildGlobalTagCatalog({
    assets: snap.assets,
    folders: snap.folders,
    assetTags: snap.assetTags ?? [],
    folderTags: snap.folderTags ?? [],
  });

  assert.equal(catalog.length, 2);
  const dowTag = catalog.find((t) => t.normalizedLabel === 'dow');
  assert.ok(dowTag);
  assert.equal(dowTag.label, 'DOW');
  assert.equal(dowTag.assetCount, 1);
  assert.equal(dowTag.folderCount, 0);
  assert.ok(dowTag.id);
  assert.ok(dowTag.createdAt);

  // Recarregar store com mesmo storage
  const reloaded = createWorkspaceStore({ storage, key: WORKSPACE_KEY });
  const reloadedSnap = reloaded.snapshot();
  const reloadedCatalog = buildGlobalTagCatalog({
    assets: reloadedSnap.assets,
    folders: reloadedSnap.folders,
    assetTags: reloadedSnap.assetTags ?? [],
    folderTags: reloadedSnap.folderTags ?? [],
  });
  assert.equal(reloadedCatalog.length, 2);
  assert.equal(reloadedCatalog.find((t) => t.normalizedLabel === 'sci-fi')?.assetCount, 1);
});

test('Etapa 12.3: unicidade por nome normalizado (DOW / dow / DOW / Dow) na camada persistente e migração segura sem perda de vínculos', () => {
  assert.equal(normalizeTagName('DOW'), 'dow');
  assert.equal(normalizeTagName(' dow '), 'dow');
  assert.equal(normalizeTagName('Dow'), 'dow');
  assert.equal(normalizeTagLabel('  DOW  '), 'dow');

  // Estado legado com etiquetas duplicadas em assetTags e folderTags
  const legacyState = {
    folders: [
      {
        id: 'fld-1',
        name: 'Personagens',
        parent: null,
        folderTagIds: ['ftag-2'],
      },
    ],
    assets: [
      {
        id: 'ast-1',
        nome: 'Hero_A',
        caminho: 'D:/Hero_A.fbx',
        categoria: 'Personagem',
        formato: '.fbx',
        engine: 'Unreal Engine',
        folder: 'fld-1',
        tags: ['DOW', 'dow', '  Dow '],
        assetTagIds: ['atag-1', 'atag-2', 'atag-3'],
      },
    ],
    assetTags: [
      { id: 'atag-1', kind: 'asset-tag', label: 'DOW', normalizedLabel: 'dow' },
      { id: 'atag-2', kind: 'asset-tag', label: 'dow', normalizedLabel: 'dow' },
      { id: 'atag-3', kind: 'asset-tag', label: ' DOW ', normalizedLabel: 'dow' },
    ],
    folderTags: [
      { id: 'ftag-1', kind: 'folder-tag', label: 'DOW', normalizedLabel: 'dow', icon: 'tag', accent: 'cyan' },
      { id: 'ftag-2', kind: 'folder-tag', label: ' dow ', normalizedLabel: 'dow', icon: 'tag', accent: 'cyan' },
    ],
    schemaVersion: 2,
  };

  // Migração pura
  const migratedPure = deduplicateWorkspaceTags({
    assets: legacyState.assets,
    folders: legacyState.folders,
    assetTags: legacyState.assetTags,
    folderTags: legacyState.folderTags,
    now: () => '2026-11-15T19:30:00.000Z',
  });
  assert.equal(migratedPure.mergedAssetDuplicates, 2);
  assert.equal(migratedPure.mergedFolderDuplicates, 1);
  assert.equal(migratedPure.nextAssetTags.length, 1);
  assert.equal(migratedPure.nextFolderTags.length, 1);
  assert.deepEqual(migratedPure.nextAssets[0].assetTagIds, ['atag-1']);
  assert.deepEqual(migratedPure.nextAssets[0].tags, ['DOW']);
  assert.deepEqual(migratedPure.nextFolders[0].folderTagIds, ['ftag-1']);

  // Migração automática ao abrir createWorkspaceStore
  const { store, operations } = createEnv(legacyState);
  const snap = store.snapshot();
  assert.equal(snap.assetTags.length, 1);
  assert.equal(snap.folderTags.length, 1);
  assert.deepEqual(snap.assets[0].assetTagIds, ['atag-1']);
  assert.deepEqual(snap.assets[0].tags, ['DOW']);
  assert.deepEqual(snap.folders[0].folderTagIds, ['ftag-1']);

  // Criação com rejectDuplicates bloqueia variante normalizada
  const dupAttempt = operations.createTag({
    scope: 'asset-tag',
    label: ' Dow ',
    rejectDuplicates: true,
  });
  assert.equal(dupAttempt.ok, false);
});

test('Etapa 12.4 & 12.5: TagPicker reutiliza catálogo central, cancelamento não gera órfãos, e pastas/assets permanecem independentes', () => {
  const { store, operations } = createEnv();

  const createdFolder = operations.createFolder({
    name: 'Veiculos',
    parent: null,
    existingTagId: null,
    newTag: { label: 'Transporte', icon: 'folder', accent: 'cyan' },
  }).data.folder;

  const createdTagRes = operations.createTag({
    scope: 'asset-tag',
    label: 'PBR',
    color: 'emerald',
    rejectDuplicates: true,
  });
  assert.equal(createdTagRes.ok, true);

  // TagPicker lista a etiqueta recém-criada no catálogo central
  const dropdown = buildTagPickerDropdownItems({
    availableTags: [
      {
        id: createdTagRes.data.id,
        label: createdTagRes.data.label,
        icon: 'tag',
        color: createdTagRes.data.color,
      },
    ],
    selectedTags: [],
    query: '',
    allowCreate: true,
  });
  assert.equal(dropdown.items.length, 1);
  assert.equal(dropdown.items[0].label, 'PBR');

  // Simular cadastro confirmado com nova etiqueta "HardSurface"
  const reg = operations.registerAsset({
    nome: 'Rover_Wheel',
    caminho: 'D:/Vehicles/Rover_Wheel.fbx',
    kind: 'asset',
    categoria: 'Objeto',
    formato: '.fbx',
    engine: 'Unity',
    sourceSoftware: 'blender',
    targetSoftware: ['unity'],
    folder: createdFolder.id,
    tags: ['PBR', 'HardSurface'],
  });
  assert.equal(reg.ok, true);

  // Pasta "Veiculos" não herda automaticamente as etiquetas do asset contido nela
  const snap = store.snapshot();
  const folder = snap.folders.find((f) => f.id === createdFolder.id);
  assert.deepEqual(folder.folderTagIds, [snap.folderTags[0].id]);
  assert.ok(!snap.folderTags.some((t) => t.normalizedLabel === 'hardsurface'));
});

test('Etapa 12.2 & 12.6: renomear e excluir etiqueta preservando assets/pastas e protegendo identificadores do sistema (Lixeira)', () => {
  const { store, operations } = createEnv();

  assert.equal(isSystemReservedTag('Lixeira'), true);
  assert.equal(isSystemReservedTag('trash'), true);
  assert.equal(isSystemReservedTag('sys-trash'), true);

  const lixeiraAttempt = operations.createTag({
    scope: 'asset-tag',
    label: 'Lixeira',
    rejectDuplicates: true,
  });
  assert.equal(lixeiraAttempt.ok, false);

  const protectDelete = operations.deleteGlobalTag('sys-trash');
  assert.equal(protectDelete.ok, false);

  const reg = operations.registerAsset({
    nome: 'SciFi_Crate',
    caminho: 'D:/Props/SciFi_Crate.glb',
    kind: 'asset',
    categoria: 'Objeto',
    formato: '.glb',
    engine: 'Blender',
    sourceSoftware: 'blender',
    targetSoftware: ['unreal'],
    tags: ['PropAntigo', 'PBR'],
  }).data;

  const targetTagId = reg.assetTagIds[0];
  const renameRes = operations.renameGlobalTag(targetTagId, 'PropAtualizado');
  assert.equal(renameRes.ok, true);
  assert.ok(store.snapshot().assets[0].tags.includes('PropAtualizado'));
  assert.ok(!store.snapshot().assets[0].tags.includes('PropAntigo'));

  const deleteRes = operations.deleteGlobalTag(targetTagId);
  assert.equal(deleteRes.ok, true);
  assert.equal(deleteRes.data.unlinkedAssets, 1);

  const snapAfter = store.snapshot();
  assert.equal(snapAfter.assets.length, 1);
  assert.deepEqual(snapAfter.assets[0].tags, ['PBR']);
  assert.ok(!snapAfter.assetTags.some((t) => t.id === targetTagId));
});

test('Etapa 12: integração de UI no Convés (Gerenciar Etiquetas, Catálogo na barra lateral, Lixeira protegida) e TagPicker', () => {
  const deckViewSource = readFileSync(
    new URL('../src/components/deck/DeckFilteredView.tsx', import.meta.url),
    'utf8',
  );
  const tagManagerSource = readFileSync(
    new URL('../src/components/deck/TagManagerModal.tsx', import.meta.url),
    'utf8',
  );
  const tagPickerSource = readFileSync(
    new URL('../src/components/deck/TagPicker.tsx', import.meta.url),
    'utf8',
  );

  assert.match(deckViewSource, /buildGlobalTagCatalog/);
  assert.match(deckViewSource, /Gerenciar Etiquetas/);
  assert.match(deckViewSource, /<TagManagerModal/);
  assert.match(deckViewSource, /studio-rail__asset-tags/);
  assert.match(deckViewSource, /href="#trash" className="studio-rail__trash-link"/);

  assert.match(tagManagerSource, /Confirmar exclusão/);
  assert.match(tagManagerSource, /renameGlobalTag/);
  assert.match(tagManagerSource, /deleteGlobalTag/);
  assert.match(tagManagerSource, /rejectDuplicates: true/);

  assert.match(tagPickerSource, /Criar nova etiqueta/);
});
