import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWorkspaceStore } from '../src/workspace-store.js';
import {
  buildNautiaRegistrationGuidance,
  createCleanAssetRecord,
  createFolderTag,
  createFolderWithRequiredTag,
  DEFAULT_UNIVERSAL_FILTERS,
  filterFoldersByTags,
  identifyAssetByPath,
  migrateLegacyAssetRecord,
  runDeckFilters,
  toAssetRegistration,
} from '../src/services/deckFilterService.ts';
import { runStructuredInference } from '../src/services/inferenceService.ts';
import { createLibraryOperationsService } from '../src/services/libraryOperationsService.ts';
import { createOperationHistoryService } from '../src/services/operationHistoryService.ts';
import { buildQuickActionScopePayload } from '../src/services/nautiaQuickActionsService.ts';
import {
  executeApprovedActionPlan,
  orchestrateNaturalLanguageRequest,
  orchestrateQuickAction,
} from '../src/services/nautiaOrchestratorService.ts';
import { validateToolCalls } from '../src/services/llmClient.ts';

class MemoryStorage {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
  }
  getItem(key) {
    return this.map.get(key) ?? null;
  }
  setItem(key, value) {
    this.map.set(key, value);
  }
}

function setupWorkspace(seed = {}) {
  let seq = 0;
  const storage = new MemoryStorage();
  const store = createWorkspaceStore({
    storage,
    uuid: () => `id-${++seq}`,
    now: () => '2026-11-14T18:00:00.000Z',
  });

  if (seed.folders || seed.assets || seed.folderTags || seed.assetTags) {
    store.transact((draft) => {
      if (seed.folders) draft.folders = seed.folders;
      if (seed.assets) draft.assets = seed.assets;
      if (seed.folderTags) draft.folderTags = seed.folderTags;
      if (seed.assetTags) draft.assetTags = seed.assetTags;
    });
  }

  const operations = createLibraryOperationsService(store);
  const history = createOperationHistoryService({ storage: new MemoryStorage() });
  return { store, storage, operations, history };
}

test('separa EtiquetaDePasta de EtiquetaDeAsset e isola apenas pastas com a etiqueta clicada ou pesquisada', () => {
  const tagChars = createFolderTag([], { label: 'Personagens', icon: 'rocket', accent: 'cyan' });
  const tagProps = createFolderTag([tagChars], { label: 'Cenário', icon: 'cube', accent: 'purple' });

  const folders = [
    { id: 'f1', name: 'Herois', parent: null, folderTagIds: [tagChars.id] },
    { id: 'f2', name: 'Ambiente', parent: null, folderTagIds: [tagProps.id] },
    { id: 'f3', name: 'SemTag', parent: null, folderTagIds: [] },
  ];

  const byIcon = filterFoldersByTags(folders, [tagChars, tagProps], {
    selectedTagIds: [tagChars.id],
    tagSearchQuery: '',
    currentParentId: null,
  });
  assert.deepEqual(byIcon.folders.map((f) => f.id), ['f1']);
  assert.equal(byIcon.isolationActive, true);

  const bySearch = filterFoldersByTags(folders, [tagChars, tagProps], {
    selectedTagIds: [],
    tagSearchQuery: 'cenario',
    currentParentId: null,
  });
  assert.deepEqual(bySearch.folders.map((f) => f.id), ['f2']);
  assert.equal(bySearch.isolationActive, true);
});

test('filtros universais combinam ALL/ANY sem duplicar assets na renderização', () => {
  const f1 = { id: 'f1', name: 'Modelos', parent: null, folderTagIds: [] };
  const duplicatedInput = [
    {
      id: 'a1',
      nome: 'Lucy_Rig',
      caminho: 'D:/Assets/lucy.fbx',
      categoria: 'Personagem',
      formato: '.fbx',
      projeto: 'Aurora',
      folder: 'f1',
      tags: ['Rigged'],
      createdAt: '2026-11-10T10:00:00.000Z',
    },
    {
      id: 'a1',
      nome: 'Lucy_Rig',
      caminho: 'D:/Assets/lucy.fbx',
      categoria: 'Personagem',
      formato: '.fbx',
      projeto: 'Aurora',
      folder: 'f1',
      tags: ['Rigged'],
      createdAt: '2026-11-10T10:00:00.000Z',
    },
    {
      id: 'a2',
      nome: 'Tex_Metal',
      caminho: 'D:/Assets/metal.png',
      categoria: 'Textura',
      formato: '.png',
      projeto: 'Aurora',
      folder: null,
      tags: [],
      createdAt: '2026-11-14T10:00:00.000Z',
    },
  ];

  const allMatch = runDeckFilters({
    folders: [f1],
    assets: duplicatedInput,
    folderTags: [],
    selectedTagIds: [],
    tagSearchQuery: '',
    tagMatchMode: 'any',
    currentParentId: null,
    universalFilters: {
      ...DEFAULT_UNIVERSAL_FILTERS,
      matchMode: 'all',
      project: 'Aurora',
      format: '.fbx',
    },
  });
  assert.deepEqual(allMatch.visibleAssets.map((a) => a.id), ['a1']);

  const anyMatch = runDeckFilters({
    folders: [f1],
    assets: duplicatedInput,
    folderTags: [],
    selectedTagIds: [],
    tagSearchQuery: '',
    tagMatchMode: 'any',
    currentParentId: null,
    universalFilters: {
      ...DEFAULT_UNIVERSAL_FILTERS,
      matchMode: 'any',
      format: '.fbx',
      organizationState: 'untagged',
    },
  });
  assert.deepEqual(anyMatch.visibleAssets.map((a) => a.id), ['a1', 'a2']);
});

test('criação de pasta exige etiqueta obrigatória e registro de asset inicia sem etiquetas manuais', () => {
  const tag = createFolderTag([], { label: 'UE5', icon: 'cube', accent: 'cyan' });

  assert.throws(
    () =>
      createFolderWithRequiredTag([], [tag], {
        name: 'SemEtiqueta',
        parent: null,
      }),
    /Selecione uma etiqueta existente ou crie uma nova/,
  );

  const created = createFolderWithRequiredTag([], [tag], {
    name: 'Personagens',
    parent: null,
    existingTagId: tag.id,
  });
  assert.equal(created.folder.name, 'Personagens');
  assert.deepEqual(created.folder.folderTagIds, [tag.id]);

  const cleanAsset = createCleanAssetRecord(created.nextFolders, {
    nome: 'Nave_Base',
    caminho: 'D:/Vault/nave.fbx',
    categoria: 'Veiculo',
    formato: '.fbx',
    engine: 'Unreal Engine 5',
    folder: created.folder.id,
  });
  assert.deepEqual(cleanAsset.tags, []);
  assert.deepEqual(cleanAsset.assetTagIds, []);
});

test('Motor de Inferência retorna diagnóstico estruturado e detecta incompatibilidades determinísticas', async () => {
  const reports = await runStructuredInference(
    [
      {
        id: 'a1',
        nome: 'Heroi_Blender',
        caminho: 'D:/Vault/heroi.blend',
        categoria: 'Personagem',
        formato: '.blend',
        engine: 'Unreal Engine 5',
        folder: null,
        tags: [],
      },
      {
        id: 'a2',
        nome: 'Mapa_UE',
        caminho: 'D:/Vault/mapa.uasset',
        categoria: 'Cenario',
        formato: '.uasset',
        engine: 'Unity',
        folder: null,
        tags: [],
      },
    ],
    {
      runningInTauri: true,
      tauriInvoker: async (command, args) => {
        assert.equal(command, 'analisar_recurso');
        return { path: args.path, fingerprint: args.path, format: args.path.endsWith('.blend') ? 'blend' : 'uasset', metadata: { conteudoReconhecido: 'true' }, evidence: ['Cabeçalho da fixture'], warnings: [], errors: [], notPerformed: ['Importação no destino'] };
      },
    },
  );

  assert.equal(reports.length, 2);
  assert.equal(reports[0].diagnostic.status, 'warning');
  assert.equal(reports[0].identifiedFormat, '.blend');
  assert.equal(reports[0].source, 'tauri-file+rules');
  assert.ok(reports[0].evidence.length > 0);
  assert.equal(reports[1].diagnostic.status, 'incompatible');
});

test('Quick Actions respeitam escopo de selectedAssets e Serviço Centralizado aplica permissões', async () => {
  const tag = createFolderTag([], { label: 'Modelos', icon: 'cube', accent: 'cyan' });
  const { operations, history } = setupWorkspace({
    folderTags: [tag],
    folders: [{ id: 'f1', name: 'Modelos', parent: null, folderTagIds: [tag.id] }],
    assets: [
      {
        id: 'a1',
        nome: 'Robo_A',
        caminho: 'D:/robo_a.fbx',
        categoria: 'Personagem',
        formato: '.fbx',
        engine: 'Unreal Engine 5',
        folder: null,
        tags: [],
      },
      {
        id: 'a2',
        nome: 'Robo_B',
        caminho: 'D:/robo_b.fbx',
        categoria: 'Personagem',
        formato: '.fbx',
        engine: 'Unreal Engine 5',
        folder: null,
        tags: [],
      },
    ],
  });

  assert.throws(() => buildQuickActionScopePayload('analyze-assets', []), /Selecione pelo menos um asset/);

  const denied = operations.createFolder(
    { name: 'Bloqueada', parent: null, existingTagId: tag.id },
    { actor: 'nautia-assistant', allowMutations: false },
  );
  assert.equal(denied.ok, false);

  const selected = [operations.listAssets().data[0]];
  const outcome = await orchestrateQuickAction({
    actionId: 'organize',
    selectedAssets: selected,
    folders: operations.searchAssets({}).data.folders,
    folderTags: [tag],
    operations,
    targetFolderId: 'f1',
  });

  assert.equal(outcome.kind, 'action-plan');
  assert.equal(outcome.plan.affectedAssetsCount, 1);
  assert.deepEqual(outcome.plan.affectedAssetIds, ['a1']);

  const exec = executeApprovedActionPlan({
    plan: outcome.plan,
    operations,
    history,
  });
  assert.equal(exec.ok, true);
  assert.equal(operations.getAssetMetadata('a1').data.folder, 'f1');
  assert.equal(operations.getAssetMetadata('a2').data.folder, null);

  // Desfazer restaura localização original de a1 sem tocar em a2
  const undo = history.undoEntry(exec.historyEntryId, operations);
  assert.equal(undo.ok, true);
  assert.equal(operations.getAssetMetadata('a1').data.folder, null);
  assert.equal(history.list()[0].status, 'reverted');
});

test('Nautia funciona sem LLM para consultas, planos de ação, duplicados e validação de ferramentas', async () => {
  const { operations, history } = setupWorkspace({
    assets: [
      {
        id: 'a1',
        nome: 'Mesh_Sem_Tag',
        caminho: 'D:/Vault/mesh.fbx',
        categoria: 'Personagem',
        formato: '.fbx',
        engine: 'Unreal Engine 5',
        folder: null,
        tags: [],
      },
      {
        id: 'a2',
        nome: 'Mesh_Dup',
        caminho: 'D:/Vault/mesh.fbx',
        categoria: 'Personagem',
        formato: '.fbx',
        engine: 'Unreal Engine 5',
        folder: null,
        tags: ['Pronto'],
      },
      {
        id: 'a3',
        nome: 'Albedo_Rock',
        caminho: 'D:/Vault/rock.png',
        categoria: 'Textura',
        formato: '.png',
        folder: null,
        tags: [],
      },
    ],
  });

  const fbxUntagged = await orchestrateNaturalLanguageRequest({
    prompt: 'Encontre todos os arquivos FBX sem etiquetas.',
    selectedAssets: [],
    operations,
  });
  assert.equal(fbxUntagged.kind, 'read-result');
  assert.deepEqual(fbxUntagged.matchedAssets.map((a) => a.id), ['a1']);

  const duplicates = await orchestrateNaturalLanguageRequest({
    prompt: 'Encontre arquivos duplicados na biblioteca.',
    selectedAssets: [],
    operations,
  });
  assert.equal(duplicates.kind, 'read-result');
  assert.equal(duplicates.duplicateGroups.length, 1);

  const separateTextures = await orchestrateNaturalLanguageRequest({
    prompt: 'Separe as texturas em uma coleção própria, sem mover os arquivos originais.',
    selectedAssets: [],
    operations,
  });
  assert.equal(separateTextures.kind, 'action-plan');
  const exec = executeApprovedActionPlan({
    plan: separateTextures.plan,
    operations,
    history,
  });
  assert.equal(exec.ok, true);
  assert.ok(operations.getAssetMetadata('a3').data.folder !== null);

  // Validador de ferramentas LLM nunca aceita ferramentas não autorizadas como purge
  const validated = validateToolCalls([
    { tool: 'purgeAll', args: {} },
    { tool: 'createFolder', args: { name: 'Segura' } },
  ]);
  assert.equal(validated.length, 1);
  assert.equal(validated[0].tool, 'createFolder');
});

test('interface de registro remove entrada manual de etiquetas e HTML monta raízes React', () => {
  const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const registerForm = fs.readFileSync(
    new URL('../src/components/deck/RegisterAssetForm.tsx', import.meta.url),
    'utf8',
  );

  assert.equal(html.includes('id="tag-input"'), false);
  assert.equal(html.includes('id="conves-react-root"'), true);
  assert.equal(html.includes('id="register-react-root"'), true);
  assert.equal(html.includes('id="nautia-react-root"'), true);
  assert.equal(registerForm.includes('tag-input'), false);
  assert.equal(registerForm.includes('Etiquetas personalizadas'), false);
});

test('refinamento de UI/UX garante categorias legíveis, seletores escuros no Windows, toolbar compacta e estados vazios contextuais', () => {
  const registerForm = fs.readFileSync(
    new URL('../src/components/deck/RegisterAssetForm.tsx', import.meta.url),
    'utf8',
  );
  const accessibleSelect = fs.readFileSync(
    new URL('../src/components/deck/AccessibleSelect.tsx', import.meta.url),
    'utf8',
  );
  const deckView = fs.readFileSync(
    new URL('../src/components/deck/DeckFilteredView.tsx', import.meta.url),
    'utf8',
  );
  const quickActions = fs.readFileSync(
    new URL('../src/components/deck/NautiaQuickActions.tsx', import.meta.url),
    'utf8',
  );
  const uiCss = fs.readFileSync(new URL('../src/ui.css', import.meta.url), 'utf8');
  const deckCss = fs.readFileSync(
    new URL('../src/components/deck/deckFilters.css', import.meta.url),
    'utf8',
  );

  // Categorias obrigatórias legíveis no formulário Registrar Asset
  for (const label of ['Personagem', 'Veículo', 'Cenário', 'Textura', 'Outro']) {
    assert.equal(registerForm.includes(label), true, `Categoria ausente: ${label}`);
  }

  // Seletor acessível com teclado e listbox + correção de option para Windows
  assert.equal(accessibleSelect.includes('role="combobox"'), true);
  assert.equal(accessibleSelect.includes('role="listbox"'), true);
  assert.equal(uiCss.includes('select option'), true);
  assert.equal(deckCss.includes('.nautia-custom-select__menu'), true);

  // Barra de ferramentas compacta, filtros avançados expansíveis, chips removíveis, Grade/Lista e Breadcrumbs
  assert.equal(deckView.includes('nautia-deck-toolbar'), true);
  assert.equal(deckView.includes('Filtros avançados'), true);
  assert.equal(deckView.includes('nautia-active-filters-bar'), true);
  assert.equal(deckView.includes('nautia-breadcrumbs-bar'), true);
  assert.equal(deckView.includes("setViewMode('grid')"), true);
  assert.equal(deckView.includes("setViewMode('list')"), true);

  // Estados vazios diferenciados por contexto
  assert.equal(deckView.includes('Biblioteca ainda vazia'), true);
  assert.equal(deckView.includes('Nenhum resultado para os filtros ativos'), true);

  // Barra compacta da Nautia Quick Actions sem seleção
  assert.equal(
    quickActions.includes('Selecione um asset para utilizar as ações rápidas da Nautia.'),
    true,
  );
});

test('Smart Asset Registration 2.0 — Cenários 1 a 10: identificação automática, modalidades, bloqueios e alternância limpa', () => {
  // 1. Registrar um FBX (Lucy.fbx -> Asset Individual / FBX)
  const fbxProbe = identifyAssetByPath('C:/Vault/Characters/Lucy.fbx');
  assert.equal(fbxProbe.suggestedKind, 'asset');
  assert.equal(fbxProbe.detectedFormat, 'FBX');
  assert.equal(fbxProbe.viewerKind, '3d');
  assert.equal(fbxProbe.blockingError, null);
  const fbxRecord = createCleanAssetRecord([], {
    nome: 'Lucy',
    caminho: 'C:/Vault/Characters/Lucy.fbx',
    kind: 'asset',
    categoria: 'Personagem',
    targetSoftware: ['unreal', 'unity'],
  });
  assert.equal(fbxRecord.kind, 'asset');
  assert.equal(fbxRecord.detectedFormat, 'FBX');
  assert.equal(fbxRecord.formato, '.fbx');
  assert.deepEqual(fbxRecord.targetSoftware, ['unreal', 'unity']);

  // 2. Registrar um OBJ
  const objRecord = createCleanAssetRecord([], {
    nome: 'Crate_Prop',
    caminho: 'C:/Vault/Props/Crate_Prop.obj',
    kind: 'asset',
    categoria: 'Cenario',
  });
  assert.equal(objRecord.kind, 'asset');
  assert.equal(objRecord.detectedFormat, 'OBJ');
  assert.equal(objRecord.formato, '.obj');

  // 3. Registrar um GLB
  const glbRecord = createCleanAssetRecord([], {
    nome: 'SciFi_Corridor',
    caminho: 'C:/Vault/Env/SciFi_Corridor.glb',
    kind: 'asset',
    categoria: 'Cenario',
  });
  assert.equal(glbRecord.kind, 'asset');
  assert.equal(glbRecord.detectedFormat, 'GLB');
  assert.equal(glbRecord.formato, '.glb');

  // 4. Registrar um UASSET individual (permitido como asset, bloqueado como projeto completo)
  const uassetRecord = createCleanAssetRecord([], {
    nome: 'Hero_Mesh',
    caminho: 'D:/UE5/Content/Characters/Hero_Mesh.uasset',
    kind: 'asset',
    categoria: 'Personagem',
  });
  assert.equal(uassetRecord.kind, 'asset');
  assert.equal(uassetRecord.sourceSoftware, 'unreal');
  assert.equal(uassetRecord.detectedFormat, 'UASSET');
  assert.throws(
    () =>
      createCleanAssetRecord([], {
        nome: 'Falso_Projeto_UE',
        caminho: 'D:/UE5/Content/Characters/Hero_Mesh.uasset',
        kind: 'project',
      }),
    /não deve ser confundido com um projeto Unreal completo/,
  );

  // 5. Registrar um projeto Unreal por UPROJECT (associado ao diretório pai; bloqueado como asset individual)
  const uprojectProbe = identifyAssetByPath('D:/UnrealProjects/DeadlyGame/DeadlyGame.uproject');
  assert.equal(uprojectProbe.suggestedKind, 'project');
  assert.equal(uprojectProbe.sourceSoftware, 'unreal');
  assert.equal(uprojectProbe.detectedFormat, 'UPROJECT');
  assert.equal(uprojectProbe.technicalType, 'Unreal Project');
  assert.equal(uprojectProbe.projectDirectory, 'D:/UnrealProjects/DeadlyGame');

  const uprojectRecord = createCleanAssetRecord([], {
    nome: 'DeadlyGame',
    caminho: 'D:/UnrealProjects/DeadlyGame/DeadlyGame.uproject',
    kind: 'project',
    sourceSoftware: 'unreal',
  });
  assert.equal(uprojectRecord.kind, 'project');
  assert.equal(uprojectRecord.sourceSoftware, 'unreal');
  assert.equal(uprojectRecord.projectDirectory, 'D:/UnrealProjects/DeadlyGame');
  assert.throws(
    () =>
      createCleanAssetRecord([], {
        nome: 'DeadlyGame',
        caminho: 'D:/UnrealProjects/DeadlyGame/DeadlyGame.uproject',
        kind: 'asset',
      }),
    /representa um Projeto Unreal Engine completo/,
  );

  // 6. Registrar um projeto Unity por diretório (estrutura Assets, Packages, ProjectSettings)
  const unityProjRecord = createCleanAssetRecord([], {
    nome: 'SpaceOdyssey',
    caminho: 'C:/UnityProjects/SpaceOdyssey',
    kind: 'project',
    sourceSoftware: 'unity',
  });
  assert.equal(unityProjRecord.kind, 'project');
  assert.equal(unityProjRecord.sourceSoftware, 'unity');
  assert.equal(unityProjRecord.detectedFormat, 'UNITY_DIR');
  assert.deepEqual(unityProjRecord.structureMarkers, [
    'Assets',
    'Packages',
    'ProjectSettings',
  ]);

  // 7. Registrar um arquivo BLEND como projeto (sugestão padrão para Personagem.blend)
  const blendProbe = identifyAssetByPath('D:/Blender/Personagem.blend');
  assert.equal(blendProbe.suggestedKind, 'project');
  assert.equal(blendProbe.sourceSoftware, 'blender');
  assert.equal(blendProbe.detectedFormat, 'BLEND');

  const blendProjectRecord = createCleanAssetRecord([], {
    nome: 'Personagem_Project',
    caminho: 'D:/Blender/Personagem.blend',
    kind: 'project',
    sourceSoftware: 'blender',
  });
  assert.equal(blendProjectRecord.kind, 'project');
  assert.equal(blendProjectRecord.sourceSoftware, 'blender');
  assert.equal(blendProjectRecord.detectedFormat, 'BLEND');

  // 8. Registrar um BLEND como asset individual (permitido sem erro quando usuário escolhe Asset Individual)
  const blendAssetRecord = createCleanAssetRecord([], {
    nome: 'Personagem_Asset',
    caminho: 'D:/Blender/Personagem.blend',
    kind: 'asset',
    categoria: 'Personagem',
    targetSoftware: ['unreal'],
  });
  assert.equal(blendAssetRecord.kind, 'asset');
  assert.equal(blendAssetRecord.sourceSoftware, 'blender');
  assert.equal(blendAssetRecord.detectedFormat, 'BLEND');
  assert.deepEqual(blendAssetRecord.targetSoftware, ['unreal']);

  // 9. Registrar um UNITYPACKAGE (Pacote de Assets / Unity / Unity Package; nunca aceito como projeto)
  const pkgProbe = identifyAssetByPath('D:/Packs/Environment.unitypackage');
  assert.equal(pkgProbe.suggestedKind, 'package');
  assert.equal(pkgProbe.sourceSoftware, 'unity');
  assert.equal(pkgProbe.detectedFormat, 'UNITYPACKAGE');
  assert.equal(pkgProbe.technicalType, 'Unity Package');

  const pkgRecord = createCleanAssetRecord([], {
    nome: 'Environment Pack',
    caminho: 'D:/Packs/Environment.unitypackage',
    kind: 'package',
    categoria: 'Cenario',
  });
  assert.equal(pkgRecord.kind, 'package');
  assert.equal(pkgRecord.sourceSoftware, 'unity');
  assert.equal(pkgRecord.detectedFormat, 'UNITYPACKAGE');
  assert.throws(
    () =>
      createCleanAssetRecord([], {
        nome: 'Environment Pack',
        caminho: 'D:/Packs/Environment.unitypackage',
        kind: 'project',
      }),
    /é um Pacote de Assets da Unity, não um diretório de projeto Unity/,
  );

  // 10. Alternar modalidades durante o preenchimento (limpa targetSoftware quando salvo como project/package)
  const switchedRecord = createCleanAssetRecord([], {
    nome: 'Environment Pack Switched',
    caminho: 'D:/Packs/Environment.unitypackage',
    kind: 'package',
    targetSoftware: ['unreal', 'unity'], // resquício de outra modalidade deve ser limpo
  });
  assert.deepEqual(switchedRecord.targetSoftware, []);
});

test('Smart Asset Registration 2.0 — Cenários 11 a 15: formatos desconhecidos, migração legada, persistência, Convés e Motor de Inferência', async () => {
  // 11. Formato desconhecido -> Estado "Não verificado" (not_verified); arquivo comprimido .zip alerta que não é pacote validado
  const unknownRecord = createCleanAssetRecord([], {
    nome: 'Cache_Proprietario',
    caminho: 'D:/Vault/Proprietary/arquivo.xyz',
    kind: 'asset',
    categoria: 'Outro',
  });
  assert.equal(unknownRecord.verificationStatus, 'not_verified');
  assert.equal(unknownRecord.detectedFormat, 'XYZ');

  const zipProbe = identifyAssetByPath('D:/Downloads/bundle.zip', {
    selectedKind: 'package',
  });
  assert.equal(zipProbe.verificationStatus, 'warning');
  assert.ok(
    zipProbe.warnings.some((w) => w.includes('não é possível presumir automaticamente')),
  );
  const guidance = buildNautiaRegistrationGuidance(zipProbe);
  assert.equal(guidance.canProceed, true);
  assert.ok(guidance.warnings.length > 0);

  // 12 & 13. Abrir e migrar registros antigos + verificar persistência no workspace-store
  const legacyRecord = {
    id: 'legacy-1',
    nome: 'Antigo_Heroi',
    caminho: 'D:/OldVault/heroi_antigo.fbx',
    categoria: 'Personagem',
    formato: '.fbx',
    engine: 'Unreal Engine 5',
    folder: null,
    tags: ['LegacyTag'],
    createdAt: '2026-10-01T12:00:00.000Z',
  };
  const legacyUnknown = {
    id: 'legacy-2',
    nome: 'Registro_Sem_Extensao',
    caminho: 'D:/OldVault/item_desconhecido.customfmt',
    categoria: 'Outro',
    formato: '.customfmt',
    engine: 'Qualquer',
    folder: null,
    tags: [],
    createdAt: '2026-10-02T12:00:00.000Z',
  };

  const migrated = migrateLegacyAssetRecord(legacyRecord);
  assert.equal(migrated.id, 'legacy-1');
  assert.equal(migrated.kind, 'asset');
  assert.equal(migrated.sourcePath, 'D:/OldVault/heroi_antigo.fbx');
  assert.equal(migrated.detectedFormat, 'FBX');
  assert.deepEqual(migrated.targetSoftware, ['unreal']);
  assert.deepEqual(migrated.tags, ['LegacyTag']);

  const contractObj = toAssetRegistration(legacyUnknown);
  assert.equal(contractObj.id, 'legacy-2');
  assert.equal(contractObj.sourceSoftware, 'unknown');
  assert.equal(contractObj.verificationStatus, 'not_verified');

  const { store, operations } = setupWorkspace({
    assets: [legacyRecord, legacyUnknown],
  });
  const listed = operations.listAssets().data;
  assert.equal(listed.length, 2);
  assert.equal(listed[0].kind, 'asset');
  assert.equal(listed[0].detectedFormat, 'FBX');
  assert.equal(listed[1].verificationStatus, 'not_verified');

  // Persistir um novo projeto via store.transact e recuperar
  const newProjectAsset = createCleanAssetRecord([], {
    nome: 'Aurora_UE5_Project',
    caminho: 'D:/Projects/Aurora/Aurora.uproject',
    kind: 'project',
    sourceSoftware: 'unreal',
    projeto: 'Aurora',
  });
  store.transact((draft) => {
    draft.assets.push(newProjectAsset);
  });
  const savedInStore = operations.getAssetMetadata(newProjectAsset.id).data;
  assert.equal(savedInStore.kind, 'project');
  assert.equal(savedInStore.detectedFormat, 'UPROJECT');
  assert.equal(savedInStore.projectDirectory, 'D:/Projects/Aurora');

  // 14. Confirmar organização correta no Convés
  const filteredDeck = runDeckFilters({
    folders: [],
    assets: store.snapshot().assets,
    folderTags: [],
    selectedTagIds: [],
    tagSearchQuery: '',
    tagMatchMode: 'any',
    currentParentId: null,
    universalFilters: {
      ...DEFAULT_UNIVERSAL_FILTERS,
      project: 'Aurora',
    },
  });
  assert.equal(filteredDeck.visibleAssets.length, 1);
  assert.equal(filteredDeck.visibleAssets[0].nome, 'Aurora_UE5_Project');

  // 15. Verificar funcionamento do Motor de Inferência (separa intenção de destino de compatibilidade técnica real e usa not_verified)
  const blendWithUnrealIntent = createCleanAssetRecord([], {
    nome: 'Arma_Plasma',
    caminho: 'D:/Blender/Arma_Plasma.blend',
    kind: 'asset',
    categoria: 'Outro',
    targetSoftware: ['unreal'],
  });

  const inferenceReports = await runStructuredInference(
    [blendWithUnrealIntent, unknownRecord, savedInStore],
    { runningInTauri: false },
  );
  assert.equal(inferenceReports.length, 3);

  // .blend com destino pretendido Unreal Engine gera warning (intenção != compatibilidade direta sem exportação FBX/GLTF)
  assert.equal(inferenceReports[0].diagnostic.status, 'warning');
  assert.ok(
    inferenceReports[0].appliedRules.includes('RULE_TARGET_INTENT_SEPARATION'),
  );
  assert.ok(inferenceReports[0].appliedRules.includes('RULE_UE5_BLEND_EXPORT'));

  // Formato desconhecido recebe verificationStatus === 'not_verified'
  assert.equal(inferenceReports[1].verificationStatus, 'not_verified');

  // Projeto .uproject reconhecido com regra RULE_UNREAL_UPROJECT
  assert.ok(inferenceReports[2].appliedRules.includes('RULE_UNREAL_UPROJECT'));
});
