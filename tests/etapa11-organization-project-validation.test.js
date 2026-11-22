import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildNautiaRegistrationGuidance,
  hasUnrealProjectMarker,
  hasValidUnityDirectoryMarkers,
  identifyAssetByPath,
  PROJECT_TYPE_LABELS,
} from '../src/services/assetIdentificationService.ts';
import {
  buildFolderTreeOrder,
  createCleanAssetRecord,
  isFolderDescendantOrSelf,
  validateDeckDropTarget,
} from '../src/services/deckFilterService.ts';
import { createLibraryOperationsService } from '../src/services/libraryOperationsService.ts';
import { createOperationHistoryService } from '../src/services/operationHistoryService.ts';
import { createWorkspaceStore } from '../src/workspace-store.js';

class MemoryStorage {
  constructor(initialMap = {}) {
    this.map = new Map(
      Object.entries(initialMap).map(([key, val]) => [
        key,
        typeof val === 'string' ? val : JSON.stringify(val),
      ]),
    );
    this.failWrites = false;
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    if (this.failWrites) {
      throw new Error('Falha simulada ao gravar no armazenamento.');
    }
    this.map.set(key, value);
  }
}

const WORKSPACE_KEY = 'ocsis.rocketbox.workspace.v1';
const HISTORY_KEY = 'ocsis.rocketbox.nautia.history.v1';

function createEnv(initialData = { folders: [], assets: [], folderTags: [], assetTags: [] }) {
  const storage = new MemoryStorage({ [WORKSPACE_KEY]: initialData });
  let seq = 0;
  const store = createWorkspaceStore({
    storage,
    key: WORKSPACE_KEY,
    uuid: () => `id-${++seq}`,
    now: () => '2026-11-15T19:00:00.000Z',
  });
  const operations = createLibraryOperationsService(store);
  const history = createOperationHistoryService({
    storage,
    key: HISTORY_KEY,
    now: () => '2026-11-15T19:01:00.000Z',
  });
  return { storage, store, operations, history };
}

test('Etapa 11.4 Cenário 1 a 3: mover asset para pasta recém-criada, entre pastas e seleção múltipla em lote', () => {
  const { store, operations, history } = createEnv();

  // Cenário 1: Registrar asset na Raiz, criar pasta e mover asset para ela
  const assetReg1 = operations.registerAsset({
    nome: 'Soldier_Tactical',
    caminho: 'D:/Assets/Chars/Soldier_Tactical.fbx',
    kind: 'asset',
    categoria: 'Personagem',
    formato: '.fbx',
    engine: 'Unreal Engine',
    sourceSoftware: 'blender',
    targetSoftware: ['unreal'],
    projeto: 'Deadly Ops',
    tags: ['DOW', 'Rigged'],
  });
  assert.equal(assetReg1.ok, true);
  assert.equal(assetReg1.data.folder, null);

  const createdFolderRes = operations.createFolder({
    name: 'Personagens_DOW',
    parent: null,
    existingTagId: null,
    newTag: { label: 'Personagens', icon: 'folder', accent: 'cyan' },
  });
  assert.equal(createdFolderRes.ok, true);
  const folderA = createdFolderRes.data.folder;

  const move1 = operations.organizeRecords({
    assetIds: [assetReg1.data.id],
    targetFolderId: folderA.id,
  });
  assert.equal(move1.ok, true);
  assert.equal(move1.data.movedCount, 1);

  history.record({
    actionType: move1.operation,
    source: 'quick-action',
    summary: `Mover asset para ${folderA.name}`,
    affectedResources: move1.affectedResources,
    status: 'executed',
    resultSummary: move1.summary,
    undoSteps: move1.undo ? [move1.undo] : [],
  });

  assert.equal(
    store.snapshot().assets.find((a) => a.id === assetReg1.data.id).folder,
    folderA.id,
  );
  // Caminho físico no Windows nunca é alterado pela movimentação virtual
  assert.equal(
    store.snapshot().assets.find((a) => a.id === assetReg1.data.id).caminho,
    'D:/Assets/Chars/Soldier_Tactical.fbx',
  );

  // Cenário 2: Mover asset entre duas pastas existentes
  const folderBRes = operations.createFolder({
    name: 'Aprovados_UE5',
    parent: null,
    existingTagId: createdFolderRes.data.createdTag.id,
    newTag: null,
  });
  assert.equal(folderBRes.ok, true);
  const folderB = folderBRes.data.folder;

  const move2 = operations.organizeRecords({
    assetIds: [assetReg1.data.id],
    targetFolderId: folderB.id,
  });
  assert.equal(move2.ok, true);
  assert.equal(
    store.snapshot().assets.find((a) => a.id === assetReg1.data.id).folder,
    folderB.id,
  );

  // Cenário 3: Seleção múltipla em lote sem duplicar registros
  const assetReg2 = operations.registerAsset({
    nome: 'Crate_Prop',
    caminho: 'D:/Assets/Props/Crate_Prop.glb',
    kind: 'asset',
    categoria: 'Objeto',
    formato: '.glb',
    engine: 'Blender',
    sourceSoftware: 'blender',
    targetSoftware: ['unreal'],
  });
  assert.equal(assetReg2.ok, true);

  const batchMove = operations.organizeRecords({
    assetIds: [assetReg1.data.id, assetReg2.data.id, assetReg1.data.id],
    targetFolderId: folderA.id,
  });
  assert.equal(batchMove.ok, true);
  assert.equal(batchMove.data.movedCount, 2);

  const activeAssets = store.snapshot().assets.filter((a) => !a.deleted);
  assert.equal(activeAssets.length, 2);
  assert.ok(activeAssets.every((a) => a.folder === folderA.id));
});

test('Etapa 11.4 Cenário 4 e 5: cancelar/desfazer movimentação (assets e pastas) e persistência após recarregar', () => {
  const { storage, store, operations, history } = createEnv();

  const f1 = operations.createFolder({
    name: 'Origem',
    parent: null,
    existingTagId: null,
    newTag: { label: 'WIP', icon: 'folder', accent: 'cyan' },
  }).data.folder;
  const f2 = operations.createFolder({
    name: 'Destino',
    parent: null,
    existingTagId: null,
    newTag: { label: 'Final', icon: 'tag', accent: 'purple' },
  }).data.folder;

  const a1 = operations.registerAsset({
    nome: 'Drone_Mesh',
    caminho: 'D:/Mesh/Drone_Mesh.fbx',
    kind: 'asset',
    categoria: 'Objeto',
    formato: '.fbx',
    engine: 'Unity',
    sourceSoftware: 'blender',
    targetSoftware: ['unity'],
    folder: f1.id,
  }).data;

  // Executar movimento e registrar no histórico
  const moveRes = operations.organizeRecords({
    assetIds: [a1.id],
    targetFolderId: f2.id,
  });
  assert.equal(moveRes.ok, true);
  const entry = history.record({
    actionType: moveRes.operation,
    source: 'quick-action',
    summary: 'Mover asset para Destino',
    affectedResources: moveRes.affectedResources,
    status: 'executed',
    resultSummary: moveRes.summary,
    undoSteps: moveRes.undo ? [moveRes.undo] : [],
  });

  // Recarregar nova instância com o mesmo storage persistido
  const reloadedStore = createWorkspaceStore({ storage, key: WORKSPACE_KEY });
  const reloadedOps = createLibraryOperationsService(reloadedStore);
  const reloadedHistory = createOperationHistoryService({ storage, key: HISTORY_KEY });

  assert.equal(reloadedStore.snapshot().assets.find((a) => a.id === a1.id).folder, f2.id);
  assert.equal(reloadedHistory.list().length, 1);

  // Desfazer movimentação de asset pelo histórico recarregado
  const undoResult = reloadedHistory.undoEntry(entry.id, reloadedOps);
  assert.equal(undoResult.ok, true);
  assert.equal(reloadedStore.snapshot().assets.find((a) => a.id === a1.id).folder, f1.id);
  assert.equal(reloadedHistory.list()[0].status, 'reverted');

  // Mover pasta e desfazer pelo histórico (undo restore-folder-parent)
  const folderMove = reloadedOps.moveFolder(f1.id, f2.id);
  assert.equal(folderMove.ok, true);
  assert.equal(folderMove.reversible, true);
  const folderEntry = reloadedHistory.record({
    actionType: folderMove.operation,
    source: 'quick-action',
    summary: 'Mover pasta Origem para Destino',
    affectedResources: folderMove.affectedResources,
    status: 'executed',
    resultSummary: folderMove.summary,
    undoSteps: folderMove.undo ? [folderMove.undo] : [],
  });
  assert.equal(reloadedStore.snapshot().folders.find((f) => f.id === f1.id).parent, f2.id);

  const undoFolder = reloadedHistory.undoEntry(folderEntry.id, reloadedOps);
  assert.equal(undoFolder.ok, true);
  assert.equal(reloadedStore.snapshot().folders.find((f) => f.id === f1.id).parent, null);

  // Evitar erro não usado em store original
  assert.equal(typeof store.snapshot, 'function');
});

test('Etapa 11.4 Cenário 6: preservar etiquetas, projeto e metadados do asset + independência de etiquetas de pasta', () => {
  const { store, operations } = createEnv();

  const fSrc = operations.createFolder({
    name: 'Rascunhos',
    parent: null,
    existingTagId: null,
    newTag: { label: 'PastaRascunho', icon: 'folder', accent: 'cyan' },
  }).data.folder;

  const fDst = operations.createFolder({
    name: 'Producao',
    parent: null,
    existingTagId: null,
    newTag: { label: 'PastaProducao', icon: 'layers', accent: 'purple' },
  }).data.folder;

  const asset = operations.registerAsset({
    nome: 'Mecha_Commander',
    caminho: 'E:/Pipeline/Mecha_Commander.glb',
    kind: 'asset',
    categoria: 'Personagem',
    formato: '.glb',
    engine: 'Unreal Engine',
    sourceSoftware: 'blender',
    targetSoftware: ['unreal'],
    projeto: 'Project Solaris',
    folder: fSrc.id,
    tags: ['Mecha', 'Solaris', 'PBR'],
    fileSize: '14 MB',
  }).data;

  const originalTagIds = [...asset.assetTagIds];
  const move = operations.organizeRecords({
    assetIds: [asset.id],
    targetFolderId: fDst.id,
  });
  assert.equal(move.ok, true);

  const updatedAsset = store.snapshot().assets.find((a) => a.id === asset.id);
  const updatedDstFolder = store.snapshot().folders.find((f) => f.id === fDst.id);

  assert.equal(updatedAsset.folder, fDst.id);
  assert.deepEqual(updatedAsset.tags, ['Mecha', 'Solaris', 'PBR']);
  assert.deepEqual(updatedAsset.assetTagIds, originalTagIds);
  assert.equal(updatedAsset.projeto, 'Project Solaris');
  assert.equal(updatedAsset.categoria, 'Personagem');
  assert.equal(updatedAsset.fileSize, '14 MB');
  // Independência estrita: pasta de destino não copia etiquetas dos assets e asset não herda etiqueta da pasta
  assert.ok(!updatedDstFolder.folderTagIds.some((id) => originalTagIds.includes(id)));
  assert.ok(!updatedAsset.tags.includes('PastaProducao'));
});

test('Etapa 11.4 Cenário 7: bloqueio de destinos inválidos, ciclos de pasta e rollback transacional em falha de gravação', () => {
  const { storage, store, operations } = createEnv();

  const rootFolder = operations.createFolder({
    name: 'Raiz_Mundo',
    parent: null,
    existingTagId: null,
    newTag: { label: 'Ambiente', icon: 'folder', accent: 'cyan' },
  }).data.folder;

  const childFolder = operations.createFolder({
    name: 'Sub_Cidade',
    parent: rootFolder.id,
    existingTagId: rootFolder.folderTagIds[0],
    newTag: null,
  }).data.folder;

  const grandChildFolder = operations.createFolder({
    name: 'Sub_Bairro',
    parent: childFolder.id,
    existingTagId: rootFolder.folderTagIds[0],
    newTag: null,
  }).data.folder;

  const asset = operations.registerAsset({
    nome: 'StreetLamp',
    caminho: 'E:/Props/StreetLamp.fbx',
    kind: 'asset',
    categoria: 'Objeto',
    formato: '.fbx',
    engine: 'Blender',
    sourceSoftware: 'blender',
    targetSoftware: ['unreal'],
    folder: childFolder.id,
  }).data;

  const snap = store.snapshot();
  assert.equal(isFolderDescendantOrSelf(snap.folders, rootFolder.id, grandChildFolder.id), true);

  // Validação de destino para pasta -> ela mesma ou descendente
  const selfDrop = validateDeckDropTarget({
    payload: { kind: 'folder', folderId: rootFolder.id },
    targetType: 'folder',
    targetId: rootFolder.id,
    folders: snap.folders,
    assets: snap.assets,
  });
  assert.equal(selfDrop.valid, false);

  const cycleDrop = validateDeckDropTarget({
    payload: { kind: 'folder', folderId: rootFolder.id },
    targetType: 'folder',
    targetId: grandChildFolder.id,
    folders: snap.folders,
    assets: snap.assets,
  });
  assert.equal(cycleDrop.valid, false);

  // Validação de asset -> soltar sobre outro asset ou sobre a pasta onde já está
  const ontoAssetDrop = validateDeckDropTarget({
    payload: { kind: 'assets', assetIds: [asset.id] },
    targetType: 'asset',
    targetId: asset.id,
    folders: snap.folders,
    assets: snap.assets,
  });
  assert.equal(ontoAssetDrop.valid, false);

  const sameFolderDrop = validateDeckDropTarget({
    payload: { kind: 'assets', assetIds: [asset.id] },
    targetType: 'folder',
    targetId: childFolder.id,
    folders: snap.folders,
    assets: snap.assets,
  });
  assert.equal(sameFolderDrop.valid, false);

  // buildFolderTreeOrder preserva hierarquia e profundidades
  const treeOrder = buildFolderTreeOrder(snap.folders);
  assert.deepEqual(
    treeOrder.map((item) => [item.folder.name, item.depth]),
    [
      ['Raiz_Mundo', 0],
      ['Sub_Cidade', 1],
      ['Sub_Bairro', 2],
    ],
  );

  // Bloqueio no serviço contra ciclo
  const invalidCycleMove = operations.moveFolder(rootFolder.id, grandChildFolder.id);
  assert.equal(invalidCycleMove.ok, false);

  // Falha de gravação no storage mantém estado consistente (sem mover parcial)
  storage.failWrites = true;
  const failedWriteMove = operations.organizeRecords({
    assetIds: [asset.id],
    targetFolderId: rootFolder.id,
  });
  assert.equal(failedWriteMove.ok, false);
  storage.failWrites = false;

  assert.equal(
    store.snapshot().assets.find((a) => a.id === asset.id).folder,
    childFolder.id,
  );
});

test('Etapa 11.4 Cenários 8 e 9: validação de projetos Blender/Unreal/Unity, .blend como asset individual, bloqueio de incompatíveis e justificativa para diretório incerto', () => {
  // Cenário 8A: Projeto Blender válido (.blend)
  const blenderProj = identifyAssetByPath('D:/Scenes/Hero_Showcase.blend', {
    selectedKind: 'project',
  });
  assert.equal(blenderProj.blockingError, null);
  assert.equal(blenderProj.projectType, 'blender');
  assert.deepEqual(blenderProj.allowedProjectTypes, ['blender']);
  assert.equal(blenderProj.suggestedCategory, 'Projeto Blender');

  // Cenário 8B: .blend legítimo cadastrado como Asset Individual continua permitido
  const blenderIndividual = identifyAssetByPath('D:/Assets/Props/Chair_Model.blend', {
    selectedKind: 'asset',
  });
  assert.equal(blenderIndividual.blockingError, null);
  assert.equal(blenderIndividual.sourceSoftware, 'blender');
  assert.equal(blenderIndividual.detectedFormat, 'BLEND');
  assert.equal(blenderIndividual.legacyFormat, '.blend');

  const cleanBlendAsset = createCleanAssetRecord([], {
    nome: 'Chair_Model',
    caminho: 'D:/Assets/Props/Chair_Model.blend',
    kind: 'asset',
    categoria: 'Objeto',
    formato: '.blend',
    engine: 'Blender',
    sourceSoftware: 'blender',
    targetSoftware: ['unreal'],
  });
  assert.equal(cleanBlendAsset.kind, 'asset');
  assert.equal(cleanBlendAsset.sourceSoftware, 'blender');

  // Cenário 8C: Projeto Unreal válido (.uproject)
  const unrealProj = identifyAssetByPath('D:/Unreal/DeadlyOps/DeadlyOps.uproject', {
    selectedKind: 'project',
  });
  assert.equal(unrealProj.blockingError, null);
  assert.equal(unrealProj.projectType, 'unreal');
  assert.deepEqual(unrealProj.allowedProjectTypes, ['unreal']);

  // Cenário 8D: Diretório Unity válido (Assets + ProjectSettings)
  assert.equal(hasValidUnityDirectoryMarkers(['Assets', 'ProjectSettings']), true);
  assert.equal(hasValidUnityDirectoryMarkers(['Assets']), false);
  assert.equal(hasUnrealProjectMarker(['DeadlyOps.uproject']), true);

  const unityProj = identifyAssetByPath('D:/Unity/SpaceOdyssey', {
    selectedKind: 'project',
    directoryMarkers: ['Assets', 'ProjectSettings', 'Packages'],
  });
  assert.equal(unityProj.blockingError, null);
  assert.equal(unityProj.projectType, 'unity');
  assert.deepEqual(unityProj.allowedProjectTypes, ['unity']);
  assert.equal(PROJECT_TYPE_LABELS[unityProj.projectType], 'Projeto Unity (Diretório)');

  // Cenário 9A: Bug original corrigido — .blend selecionado como Projeto NÃO pode mudar para Unity ou Unreal
  const blendForcedUnity = identifyAssetByPath('D:/Scenes/Hero_Showcase.blend', {
    selectedKind: 'project',
    selectedSourceSoftware: 'unity',
  });
  assert.ok(blendForcedUnity.blockingError, 'Deve bloquear .blend marcado como projeto Unity');
  assert.deepEqual(blendForcedUnity.allowedProjectTypes, ['blender']);

  const blendForcedUnreal = identifyAssetByPath('D:/Scenes/Hero_Showcase.blend', {
    selectedKind: 'project',
    selectedSourceSoftware: 'unreal',
  });
  assert.ok(blendForcedUnreal.blockingError, 'Deve bloquear .blend marcado como projeto Unreal');

  // Tentativa direta de criar registro corrompido via createCleanAssetRecord também é bloqueada
  assert.throws(() =>
    createCleanAssetRecord([], {
      nome: 'Hero_Showcase',
      caminho: 'D:/Scenes/Hero_Showcase.blend',
      kind: 'project',
      categoria: 'Projeto',
      formato: '.blend',
      engine: 'Unity',
      sourceSoftware: 'unity',
    }),
  );

  // Cenário 9B: .uproject não pode virar Blender; diretório Unity não pode virar Unreal ou Blender
  const uprojAsBlender = identifyAssetByPath('D:/Unreal/Game/Game.uproject', {
    selectedKind: 'project',
    selectedSourceSoftware: 'blender',
  });
  assert.ok(uprojAsBlender.blockingError);

  const unityDirAsBlender = identifyAssetByPath('D:/Unity/SpaceOdyssey', {
    selectedKind: 'project',
    directoryMarkers: ['Assets', 'ProjectSettings'],
    selectedSourceSoftware: 'blender',
  });
  assert.ok(unityDirAsBlender.blockingError);

  // Cenário 9C: .zip nunca pode ser projeto
  const zipAsProj = identifyAssetByPath('D:/Downloads/Pack_UE5.zip', {
    selectedKind: 'project',
  });
  assert.ok(zipAsProj.blockingError);

  // Cenário 9D: Diretório sem marcadores gera identificação incerta com justificativa explícita
  const uncertainDir = identifyAssetByPath('D:/Work/PastaQualquer', {
    selectedKind: 'project',
    directoryMarkers: [],
    selectedSourceSoftware: 'other',
  });
  assert.equal(uncertainDir.isIdentificationUncertain, true);
  assert.ok(uncertainDir.uncertaintyJustification && uncertainDir.uncertaintyJustification.length > 20);
  const guidance = buildNautiaRegistrationGuidance(uncertainDir, []);
  assert.ok(
    guidance.compatibilityNotes.some((note) =>
      note.includes(uncertainDir.uncertaintyJustification),
    ),
  );
});

test('Etapa 11: integração da UI no Convés, Registrar Asset, menu contextual e CSS preservando regras', () => {
  const deckViewSource = readFileSync(
    new URL('../src/components/deck/DeckFilteredView.tsx', import.meta.url),
    'utf8',
  );
  const moveModalSource = readFileSync(
    new URL('../src/components/deck/MoveToFolderModal.tsx', import.meta.url),
    'utf8',
  );
  const registerSource = readFileSync(
    new URL('../src/components/deck/RegisterAssetForm.tsx', import.meta.url),
    'utf8',
  );
  const libraryUiSource = readFileSync(
    new URL('../src/library-ui.js', import.meta.url),
    'utf8',
  );
  const cssSource = readFileSync(
    new URL('../src/components/deck/deckFilters.css', import.meta.url),
    'utf8',
  );

  // Drag-and-drop na árvore lateral, área principal, breadcrumbs, seleção múltipla e Escape
  assert.match(deckViewSource, /tree-link \$\{dropStateClass\(treeKey\)\}/);
  assert.match(deckViewSource, /nautia-breadcrumb-btn/);
  assert.match(deckViewSource, /startDragAsset/);
  assert.match(deckViewSource, /startDragFolder/);
  assert.match(deckViewSource, /event\.key === 'Escape'/);
  assert.match(deckViewSource, /<MoveToFolderModal/);
  assert.match(deckViewSource, /Mover para\.\.\./);

  // Modal hierárquico com criação inline e bloqueio de destinos inválidos
  assert.match(moveModalSource, /buildFolderTreeOrder/);
  assert.match(moveModalSource, /validateDeckDropTarget/);
  assert.match(moveModalSource, /Mover para pasta selecionado|Mover para pasta selecionada/);
  assert.match(moveModalSource, /\+ Nova pasta/);

  // Menu contextual (right-click / Shift+F10) em library-ui.js
  assert.match(libraryUiSource, /Mover para\.\.\./);
  assert.match(libraryUiSource, /rocketbox:open-move-modal/);

  // Registrar Asset com separação dos 5 conceitos e opções desabilitadas por compatibilidade
  assert.match(registerSource, /options=\{projectSoftwareOptions\}/);
  assert.match(registerSource, /options=\{assetSourceOptions\}/);
  assert.match(registerSource, /PROJECT_TYPE_LABELS/);
  assert.match(registerSource, /Corrigir para/);

  // CSS tokens visuais de destino válido/inválido e modal
  assert.match(cssSource, /\.is-drop-target-valid/);
  assert.match(cssSource, /\.is-drop-target-invalid/);
  assert.match(cssSource, /\.nautia-move-modal__tree/);
});
