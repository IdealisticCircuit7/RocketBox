import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildTagRelationshipIndex,
  createCleanAssetRecord,
  createFolderTag,
  createFolderWithRequiredTag,
  DEFAULT_UNIVERSAL_FILTERS,
  INDIVIDUAL_ASSET_CATEGORIES,
  migrateWorkspaceTagState,
  runDeckFilters,
} from '../src/services/deckFilterService.ts';
import {
  suggestAssetCategory,
  suggestAssetTags,
} from '../src/services/assetClassificationService.ts';
import { createLibraryOperationsService } from '../src/services/libraryOperationsService.ts';
import { createWorkspaceStore } from '../src/workspace-store.js';

class MemoryStorage {
  constructor(data = null) {
    this.raw = data == null ? null : JSON.stringify(data);
  }
  getItem() {
    return this.raw;
  }
  setItem(_key, value) {
    this.raw = value;
  }
}

function createTestEnvironment(
  initialData = { folders: [], assets: [], folderTags: [], assetTags: [] },
) {
  const storage = new MemoryStorage(initialData);
  let seq = 0;
  const store = createWorkspaceStore({
    storage,
    uuid: () => `id-${++seq}`,
    now: () => '2026-11-15T14:00:00.000Z',
  });
  const operations = createLibraryOperationsService(store);
  return { storage, store, operations };
}

test('Etapas 03 e 04: Categoria Objeto disponível e registro funciona sem etiquetas ou com múltiplas etiquetas opcionais', () => {
  assert.ok(
    INDIVIDUAL_ASSET_CATEGORIES.some((cat) => cat.value === 'Objeto'),
    'Categoria Objeto deve existir nas categorias de Asset Individual',
  );

  const { store, operations } = createTestEnvironment();

  // 1. Registrar asset sem etiquetas
  const withoutTags = operations.registerAsset({
    nome: 'Crate_Industrial',
    caminho: 'C:/Vault/Props/Crate_Industrial.fbx',
    kind: 'asset',
    categoria: 'Objeto',
    formato: '.fbx',
    engine: 'Unreal Engine',
    sourceSoftware: 'blender',
    targetSoftware: ['unreal'],
  });
  assert.equal(withoutTags.ok, true);
  assert.deepEqual(withoutTags.data.tags, []);
  assert.equal(withoutTags.data.categoria, 'Objeto');

  // 2. Registrar asset criando/associando múltiplas etiquetas opcionais (case-insensitive deduplication)
  const withMultipleTags = operations.registerAsset({
    nome: 'Jade_Tactical',
    caminho: 'C:/Vault/Chars/Jade_Tactical.fbx',
    kind: 'asset',
    categoria: 'Personagem',
    formato: '.fbx',
    engine: 'Unreal Engine',
    sourceSoftware: 'blender',
    targetSoftware: ['unreal'],
    projeto: 'Deadly Ops Warfare',
    tags: ['DOW', 'Personagem', 'dow', 'Heroi'],
  });
  assert.equal(withMultipleTags.ok, true);
  assert.deepEqual(withMultipleTags.data.tags, ['DOW', 'Personagem', 'Heroi']);
  assert.equal(withMultipleTags.data.assetTagIds.length, 3);

  const snapshot = store.snapshot();
  assert.equal(snapshot.assetTags.length, 3);
  // Categoria do primeiro asset ("Objeto") nunca vira etiqueta automaticamente
  assert.equal(
    snapshot.assetTags.some((t) => t.normalizedLabel === 'objeto'),
    false,
  );
});

test('Etapa 02: Independência estrita entre etiquetas de pastas e etiquetas de assets + Etiquetas Encontradas (direto e recursivo) + Movimentação', () => {
  const { store, operations } = createTestEnvironment();

  // Criar etiqueta própria da pasta
  const folderTag = createFolderTag([], { label: 'Core 3D', icon: 'cube' });

  const parentFolderRes = createFolderWithRequiredTag(
    [],
    [folderTag],
    { name: 'Personagens 3D', parent: null, existingTagId: folderTag.id },
    () => '2026-11-15T14:00:00.000Z',
    () => 'folder-chars',
  );
  const subFolderRes = createFolderWithRequiredTag(
    [parentFolderRes.folder],
    [folderTag],
    {
      name: 'Esquadrao Alpha',
      parent: 'folder-chars',
      existingTagId: folderTag.id,
    },
    () => '2026-11-15T14:00:00.000Z',
    () => 'folder-sub',
  );
  const destFolderRes = createFolderWithRequiredTag(
    [parentFolderRes.folder, subFolderRes.folder],
    [folderTag],
    { name: 'Arquivo Geral', parent: null, existingTagId: folderTag.id },
    () => '2026-11-15T14:00:00.000Z',
    () => 'folder-archive',
  );

  store.transact((draft) => {
    draft.folderTags = [folderTag];
    draft.folders = [
      parentFolderRes.folder,
      subFolderRes.folder,
      destFolderRes.folder,
    ];
  });

  // Registrar 3 assets conforme exemplo da especificação
  const jade = operations.registerAsset({
    nome: 'Jade.fbx',
    caminho: 'C:/Vault/Jade.fbx',
    categoria: 'Personagem',
    formato: '.fbx',
    engine: 'Unreal Engine',
    folder: 'folder-chars',
    tags: ['DOW', 'Personagem'],
  }).data;

  const lucy = operations.registerAsset({
    nome: 'Lucy.blend',
    caminho: 'C:/Vault/Lucy.blend',
    categoria: 'Personagem',
    formato: '.blend',
    engine: 'Blender',
    folder: 'folder-chars',
    tags: ['DOW', 'Blender'],
  }).data;

  const nautia = operations.registerAsset({
    nome: 'Nautia.glb',
    caminho: 'C:/Vault/Nautia.glb',
    categoria: 'Personagem',
    formato: '.glb',
    engine: 'Universal',
    folder: 'folder-sub',
    tags: ['OCSIS', 'Mascote'],
  }).data;

  const snap1 = store.snapshot();
  const folderChars = snap1.folders.find((f) => f.id === 'folder-chars');

  // Confirmar que a pasta não herda etiquetas dos assets e os assets não herdam "Core 3D" da pasta
  assert.deepEqual(folderChars.folderTagIds, [folderTag.id]);
  assert.equal(jade.tags.includes('Core 3D'), false);
  assert.equal(lucy.tags.includes('Core 3D'), false);

  // Etiquetas encontradas apenas nos filhos diretos de Personagens 3D
  const directDiscovered = operations.inspectFolderTags('folder-chars', 'direct').data;
  assert.equal(directDiscovered.totalAssetsInScope, 2);
  const directMap = new Map(
    directDiscovered.discoveredTags.map((item) => [item.label, item.assetCount]),
  );
  assert.equal(directMap.get('DOW'), 2);
  assert.equal(directMap.get('Personagem'), 1);
  assert.equal(directMap.get('Blender'), 1);
  assert.equal(directMap.has('OCSIS'), false);

  // Etiquetas encontradas incluindo subpastas (recursivo)
  const recursiveDiscovered = operations.inspectFolderTags(
    'folder-chars',
    'recursive',
  ).data;
  assert.equal(recursiveDiscovered.totalAssetsInScope, 3);
  const recursiveMap = new Map(
    recursiveDiscovered.discoveredTags.map((item) => [
      item.label,
      item.assetCount,
    ]),
  );
  assert.equal(recursiveMap.get('DOW'), 2);
  assert.equal(recursiveMap.get('OCSIS'), 1);
  assert.equal(recursiveMap.get('Mascote'), 1);

  // Mover Jade.fbx para Arquivo Geral: preserva etiquetas de Jade e atualiza etiquetas encontradas nas duas pastas
  operations.organizeRecords({
    assetIds: [jade.id],
    targetFolderId: 'folder-archive',
  });

  const afterMoveDirect = operations.inspectFolderTags('folder-chars', 'direct').data;
  const afterMoveArchive = operations.inspectFolderTags(
    'folder-archive',
    'direct',
  ).data;
  const movedJade = store.snapshot().assets.find((a) => a.id === jade.id);

  assert.deepEqual(movedJade.tags, ['DOW', 'Personagem']);
  assert.equal(
    afterMoveDirect.discoveredTags.find((t) => t.label === 'DOW')?.assetCount,
    1,
  );
  assert.equal(
    afterMoveArchive.discoveredTags.find((t) => t.label === 'DOW')?.assetCount,
    1,
  );
  assert.equal(
    afterMoveArchive.discoveredTags.find((t) => t.label === 'Personagem')
      ?.assetCount,
    1,
  );
  assert.ok(nautia.id);
});

test('Etapa 05: Filtros Inteligentes no Convés por Etiquetas da pasta, Etiquetas dos assets e Ambos sem duplicar resultados', () => {
  const tagDow = createFolderTag([], { label: 'DOW', icon: 'shield' });
  const tagVfx = createFolderTag([tagDow], { label: 'VFX', icon: 'sparkles' });
  const folderTags = [tagDow, tagVfx];

  const folderA = createFolderWithRequiredTag(
    [],
    folderTags,
    { name: 'Pasta DOW', parent: null, existingTagId: tagDow.id },
    () => '2026-11-15T14:00:00.000Z',
    () => 'f-dow',
  ).folder;
  const folderB = createFolderWithRequiredTag(
    [folderA],
    folderTags,
    { name: 'Pasta VFX', parent: null, existingTagId: tagVfx.id },
    () => '2026-11-15T14:00:00.000Z',
    () => 'f-vfx',
  ).folder;
  const folders = [folderA, folderB];

  // Asset 1 está na Pasta DOW (sem tag DOW direta no asset, apenas 'Rigged')
  const assetInDowFolder = createCleanAssetRecord(
    folders,
    {
      nome: 'Soldier_Base',
      caminho: 'C:/DOW/Soldier_Base.fbx',
      categoria: 'Personagem',
      formato: '.fbx',
      engine: 'Unreal Engine',
      folder: 'f-dow',
      tags: ['Rigged'],
    },
    () => '2026-11-15T14:00:00.000Z',
    () => 'a-1',
  );

  // Asset 2 está na Pasta VFX, mas possui a etiqueta de asset 'DOW' e 'Heroi'
  const assetWithDowTag = createCleanAssetRecord(
    folders,
    {
      nome: 'Hero_Weapon',
      caminho: 'C:/VFX/Hero_Weapon.fbx',
      categoria: 'Objeto',
      formato: '.fbx',
      engine: 'Unreal Engine',
      folder: 'f-vfx',
      tags: ['DOW', 'Heroi'],
    },
    () => '2026-11-15T14:00:00.000Z',
    () => 'a-2',
  );

  // Asset 3 está na Pasta DOW E possui a etiqueta de asset 'DOW' (não pode duplicar em 'both'!)
  const assetWithBoth = createCleanAssetRecord(
    folders,
    {
      nome: 'Commander_Mech',
      caminho: 'C:/DOW/Commander_Mech.fbx',
      categoria: 'Veiculo',
      formato: '.fbx',
      engine: 'Unreal Engine',
      folder: 'f-dow',
      tags: ['DOW'],
    },
    () => '2026-11-15T14:00:00.000Z',
    () => 'a-3',
  );

  const assets = [assetInDowFolder, assetWithDowTag, assetWithBoth];

  // 1. Filtrar apenas por Etiquetas da pasta ('folder')
  const folderScopeRes = runDeckFilters({
    currentParentId: null,
    folders,
    assets,
    folderTags,
    selectedTagIds: [tagDow.id],
    tagMatchMode: 'any',
    tagSearchQuery: '',
    universalFilters: {
      ...DEFAULT_UNIVERSAL_FILTERS,
      tagScope: 'folder',
    },
  });
  assert.deepEqual(
    folderScopeRes.visibleAssets.map((a) => a.id).sort(),
    ['a-1', 'a-3'],
  );

  // 2. Filtrar apenas por Etiquetas dos assets ('asset')
  const assetScopeRes = runDeckFilters({
    currentParentId: null,
    folders,
    assets,
    folderTags,
    selectedTagIds: [tagDow.id],
    tagMatchMode: 'any',
    tagSearchQuery: '',
    universalFilters: {
      ...DEFAULT_UNIVERSAL_FILTERS,
      tagScope: 'asset',
    },
  });
  assert.deepEqual(
    assetScopeRes.visibleAssets.map((a) => a.id).sort(),
    ['a-2', 'a-3'],
  );

  // 3. Filtrar por Ambos ('both'): traz a-1 (via pasta), a-2 (via asset) e a-3 (ambos, sem duplicar!)
  const bothScopeRes = runDeckFilters({
    currentParentId: null,
    folders,
    assets,
    folderTags,
    selectedTagIds: [tagDow.id],
    tagMatchMode: 'any',
    tagSearchQuery: '',
    universalFilters: {
      ...DEFAULT_UNIVERSAL_FILTERS,
      tagScope: 'both',
    },
  });
  assert.deepEqual(
    bothScopeRes.visibleAssets.map((a) => a.id).sort(),
    ['a-1', 'a-2', 'a-3'],
  );
  assert.deepEqual(bothScopeRes.tagMatchOrigins.get('a-1'), {
    assetId: 'a-1',
    byFolderTag: true,
    byAssetTag: false,
    matchedFolderTags: ['DOW'],
    matchedAssetTags: [],
  });
  assert.deepEqual(bothScopeRes.tagMatchOrigins.get('a-2'), {
    assetId: 'a-2',
    byFolderTag: false,
    byAssetTag: true,
    matchedFolderTags: [],
    matchedAssetTags: ['DOW'],
  });
  assert.deepEqual(bothScopeRes.tagMatchOrigins.get('a-3'), {
    assetId: 'a-3',
    byFolderTag: true,
    byAssetTag: true,
    matchedFolderTags: ['DOW'],
    matchedAssetTags: ['DOW'],
  });

  // 4. Combinação de múltiplas etiquetas de asset com 'all' (E) vs 'any' (OU)
  const multiAllRes = runDeckFilters({
    currentParentId: null,
    folders,
    assets,
    folderTags,
    selectedTagIds: [],
    tagMatchMode: 'any',
    tagSearchQuery: '',
    universalFilters: {
      ...DEFAULT_UNIVERSAL_FILTERS,
      selectedAssetTags: ['DOW', 'Heroi'],
      assetTagMatchMode: 'all',
      tagScope: 'asset',
    },
  });
  assert.deepEqual(multiAllRes.visibleAssets.map((a) => a.id), ['a-2']);
});

test('Etapas 06, 07 e 08: Detalhes do Convés, edição de etiquetas/categoria, Motor de Inferência e Classificação Assistida da NautIA sem LLM', async () => {
  const { store, operations } = createTestEnvironment();

  const registered = operations.registerAsset({
    nome: 'Jade_Character_Rig',
    caminho: 'C:/DOW/Characters/Jade_Character_Rig.fbx',
    kind: 'asset',
    categoria: 'Outro',
    formato: '.fbx',
    engine: 'Unreal Engine',
    sourceSoftware: 'blender',
    targetSoftware: ['unreal'],
    projeto: 'Deadly Ops Warfare',
  }).data;

  // Adicionar e remover etiquetas pelo painel Detalhes
  operations.assignTags({
    scope: 'asset-tag',
    assetIds: [registered.id],
    labels: ['Rigged', 'PBR'],
  });
  assert.deepEqual(store.snapshot().assets[0].tags, ['Rigged', 'PBR']);

  operations.removeAssetTags({
    assetIds: [registered.id],
    labels: ['PBR'],
  });
  assert.deepEqual(store.snapshot().assets[0].tags, ['Rigged']);

  // Consultar perfil de 4 camadas (Declarada, Identificação técnica, Inferência técnica, Sugestão inteligente)
  const profile = operations.getAssetClassification(registered.id).data;
  assert.ok(profile);
  assert.equal(profile.declared.originLayer, 'declared');
  assert.equal(
    profile.technicalIdentification.originLayer,
    'technical_identification',
  );
  assert.equal(profile.technicalInference.originLayer, 'technical_inference');
  assert.equal(profile.suggestions.originLayer, 'intelligent_suggestion');

  // Sugestão de categoria com evidência no nome ("Character" / "Rig") sem sobrescrever automaticamente a categoria declarada ("Outro")
  assert.equal(store.snapshot().assets[0].categoria, 'Outro');
  assert.equal(
    profile.suggestions.categorySuggestion.suggestedCategory,
    'Personagem',
  );
  assert.equal(
    profile.suggestions.categorySuggestion.requiresUserConfirmation,
    true,
  );
  assert.ok(profile.suggestions.categorySuggestion.evidence.length > 0);

  // Confirmar que um arquivo 3D genérico sem evidência semântica NÃO inventa categoria Personagem/Veículo/Cenário
  const generic3dAsset = createCleanAssetRecord([], {
    nome: 'Asset_001',
    caminho: 'C:/Vault/Asset_001.fbx',
    categoria: 'Outro',
    formato: '.fbx',
    engine: 'Universal',
  });
  const genericSuggestion = suggestAssetCategory({ asset: generic3dAsset });
  assert.equal(genericSuggestion.suggestedCategory, null);

  // Sugestão inteligente de etiquetas inclui sigla do projeto ("DOW" para "Deadly Ops Warfare")
  const suggestedTags = suggestAssetTags({
    asset: { ...store.snapshot().assets[0], categoria: 'Personagem' },
    existingAssetTags: store.snapshot().assetTags,
  });
  const suggestedLabels = suggestedTags.map((s) => s.label);
  assert.ok(
    suggestedLabels.includes('DOW'),
    'Deve sugerir sigla DOW do projeto Deadly Ops Warfare',
  );
  assert.ok(
    suggestedLabels.includes('Personagem 3D'),
    'Deve sugerir etiqueta composta Personagem 3D',
  );

  // Atualizar categoria pelo painel Detalhes e verificar persistência e funcionamento do Motor de Inferência
  const catUpdate = operations.updateAssetCategory(registered.id, 'Personagem');
  assert.equal(catUpdate.ok, true);
  assert.equal(store.snapshot().assets[0].categoria, 'Personagem');

  const diagResult = await operations.queryDiagnostics([registered.id]);
  assert.equal(diagResult.data.length, 1);
  assert.ok(store.snapshot().assets[0].lastAnalyzedAt);
});

test('Etapas 09, 10 e 11: Modelo relacional, migração de legado, renomear/excluir etiqueta sem apagar assets e persistência ao recarregar', () => {
  // Simular workspace legado onde assets têm tags em texto mas não há catálogo assetTags nem assetTagIds
  const legacyFolderTag = createFolderTag([], {
    label: 'Ambiente',
    icon: 'environment',
  });
  const legacyData = {
    folders: [
      {
        id: 'f-legacy',
        name: 'Cenários Antigos',
        parent: null,
        folderTagIds: [legacyFolderTag.id],
      },
    ],
    folderTags: [legacyFolderTag],
    assets: [
      {
        id: 'a-legacy',
        nome: 'Ruinas_Templo',
        caminho: 'C:/Legacy/Ruinas_Templo.fbx',
        categoria: 'Cenario',
        formato: '.fbx',
        engine: 'Unreal Engine',
        folder: 'f-legacy',
        tags: ['DOW', 'Ruinas'],
      },
    ],
  };

  // Migração explícita preserva etiquetas de pastas separadas das etiquetas de assets
  const migrated = migrateWorkspaceTagState(legacyData);
  assert.equal(migrated.folderTags.length, 1);
  assert.equal(migrated.assetTags.length, 2);
  assert.equal(
    migrated.assetTags.some((t) => t.normalizedLabel === 'ambiente'),
    false,
    'Etiqueta de pasta nunca deve ser transformada em etiqueta de asset na migração',
  );
  assert.equal(migrated.assets[0].assetTagIds.length, 2);

  // Índices relacionais AssetTag e FolderTag
  const relIndex = buildTagRelationshipIndex({
    folders: migrated.folders,
    assets: migrated.assets,
    folderTags: migrated.folderTags,
    assetTags: migrated.assetTags,
  });
  assert.equal(relIndex.folderTagLinks.length, 1);
  assert.equal(relIndex.assetTagLinks.length, 2);

  // Persistência em store + operações de renomear e excluir etiqueta do catálogo sem apagar o asset
  const { storage, store, operations } = createTestEnvironment(migrated);
  const dowTag = store
    .snapshot()
    .assetTags.find((t) => t.normalizedLabel === 'dow');
  assert.ok(dowTag);

  const renameRes = operations.renameAssetTag(dowTag.id, 'DOW Oficial');
  assert.equal(renameRes.ok, true);
  assert.deepEqual(store.snapshot().assets[0].tags, ['DOW Oficial', 'Ruinas']);

  const deleteTagRes = operations.deleteAssetTag(dowTag.id);
  assert.equal(deleteTagRes.ok, true);
  // Asset permanece intacto, apenas sem a etiqueta removida
  assert.equal(store.snapshot().assets.length, 1);
  assert.deepEqual(store.snapshot().assets[0].tags, ['Ruinas']);

  // Recarregar o aplicativo a partir do storage e verificar persistência completa
  const reloadedStore = createWorkspaceStore({
    storage,
    uuid: () => 'reloaded-uuid',
    now: () => '2026-11-15T15:00:00.000Z',
  });
  const reloadedSnap = reloadedStore.snapshot();
  assert.equal(reloadedSnap.assets.length, 1);
  assert.deepEqual(reloadedSnap.assets[0].tags, ['Ruinas']);
  assert.equal(reloadedSnap.folderTags.length, 1);

  // Verificar presença das 4 seções no componente DeckFilteredView e campo opcional em RegisterAssetForm
  const deckViewSource = readFileSync(
    new URL('../src/components/deck/DeckFilteredView.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(deckViewSource.includes('1. Identificação'));
  assert.ok(deckViewSource.includes('2. Organização'));
  assert.ok(deckViewSource.includes('3. Informações técnicas'));
  assert.ok(deckViewSource.includes('4. Etiquetas do asset'));

  const registerFormSource = readFileSync(
    new URL('../src/components/deck/RegisterAssetForm.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(registerFormSource.includes('Etiquetas (opcional)'));
});
