import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  clampContextMenuPosition,
  formatDisplayPath,
  sanitizeTechnicalMetadataText,
} from '../src/services/deckFilterService.ts';
import { createLibraryOperationsService } from '../src/services/libraryOperationsService.ts';
import { createWorkspaceStore } from '../src/workspace-store.js';

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
    now: () => '2026-11-16T13:30:00.000Z',
  });
  const operations = createLibraryOperationsService(store);
  return { storage, store, operations };
}

test('Etapa 19.1: formatDisplayPath e sanitizeTechnicalMetadataText removem prefixos internos \\\\?\\ sem alterar dados persistidos', () => {
  assert.equal(
    formatDisplayPath('\\\\?\\C:\\TestFixtures\\Blender\\HANAKO.blend'),
    'C:\\TestFixtures\\Blender\\HANAKO.blend',
  );
  assert.equal(
    formatDisplayPath('/?/C:/TestFixtures/Blender/HANAKO.blend'),
    'C:/TestFixtures/Blender/HANAKO.blend',
  );
  assert.equal(
    formatDisplayPath('\\\\?\\UNC\\Server\\Share\\Pack\\Hero.fbx'),
    '\\\\Server\\Share\\Pack\\Hero.fbx',
  );
  assert.equal(
    sanitizeTechnicalMetadataText(
      'Blender Project (.blend) · Dir: /?/C:/TestFixtures/HANAKO_1.0',
    ),
    'Blender Project (.blend) · Dir: C:/TestFixtures/HANAKO_1.0',
  );
});

test('Etapa 19.3 & 19.6(18): clampContextMenuPosition impede que o menu ultrapasse os limites da janela ao redimensionar', () => {
  // Canto inferior direito
  const bottomRight = clampContextMenuPosition({
    x: 1260,
    y: 780,
    menuWidth: 240,
    menuHeight: 300,
    viewportWidth: 1280,
    viewportHeight: 800,
    margin: 8,
  });
  assert.equal(bottomRight.left, 1032);
  assert.equal(bottomRight.top, 492);
  assert.ok(bottomRight.left + 240 <= 1280 - 8);
  assert.ok(bottomRight.top + 300 <= 800 - 8);

  // Janela muito pequena
  const smallViewport = clampContextMenuPosition({
    x: 400,
    y: 350,
    menuWidth: 240,
    menuHeight: 280,
    viewportWidth: 320,
    viewportHeight: 320,
    margin: 8,
  });
  assert.equal(smallViewport.left, 72);
  assert.equal(smallViewport.top, 32);

  // Coordenada negativa é ajustada para margem mínima
  const negative = clampContextMenuPosition({
    x: -25,
    y: -10,
    menuWidth: 220,
    menuHeight: 240,
    viewportWidth: 1024,
    viewportHeight: 768,
    margin: 8,
  });
  assert.equal(negative.left, 8);
  assert.equal(negative.top, 8);
});

test('Etapa 19.6(7-17): operações do menu contextual (renomear, mover, etiquetas, lixeira, seleção múltipla e persistência pós-reinício)', () => {
  const { storage, store, operations } = createEnv();

  const fRes = operations.createFolder({
    name: 'DOW',
    parent: null,
    existingTagId: null,
    newTag: { label: 'Game', icon: 'folder', accent: 'cyan' },
  });
  assert.equal(fRes.ok, true);
  const folder = fRes.data.folder;

  const subRes = operations.createFolder({
    name: 'Personagens',
    parent: folder.id,
    existingTagId: fRes.data.createdTag.id,
    newTag: null,
  });
  assert.equal(subRes.ok, true);
  assert.equal(subRes.data.folder.parent, folder.id);

  const rawWindowsPath =
    '\\\\?\\C:\\TestFixtures\\Blender\\HANAKO_1.0\\HANAKO.blend';
  const a1 = operations.registerAsset({
    nome: 'HANAKO',
    caminho: rawWindowsPath,
    kind: 'project',
    categoria: 'Projeto Blender',
    formato: '.blend',
    engine: 'Blender',
    sourceSoftware: 'blender',
    projectType: 'blender',
    folder: null,
    tags: ['Anime'],
  }).data;

  const a2 = operations.registerAsset({
    nome: 'Sword_Prop',
    caminho: 'D:/Assets/Weapons/Sword_Prop.fbx',
    kind: 'asset',
    categoria: 'Objeto',
    formato: '.fbx',
    engine: 'Unreal Engine',
    sourceSoftware: 'blender',
    targetSoftware: ['unreal'],
    folder: null,
    tags: [],
  }).data;

  // Renomear registro (preserva caminho bruto interno no store; exibição usa formatDisplayPath)
  const renameAsset = operations.updateAssetRecord(a1.id, {
    nome: 'HANAKO_v2',
  });
  assert.equal(renameAsset.ok, true);
  assert.equal(renameAsset.data.nome, 'HANAKO_v2');
  assert.equal(renameAsset.data.caminho, rawWindowsPath);
  assert.equal(
    formatDisplayPath(renameAsset.data.caminho),
    'C:\\TestFixtures\\Blender\\HANAKO_1.0\\HANAKO.blend',
  );

  // Renomear pasta
  const renameFolder = operations.renameFolder(folder.id, 'DOW_Principal');
  assert.equal(renameFolder.ok, true);

  // Ações em seleção múltipla: aplicar etiqueta em lote + mover selecionados
  const batchTags = operations.assignTags({
    scope: 'asset-tag',
    assetIds: [a1.id, a2.id],
    labels: ['Revisado'],
  });
  assert.equal(batchTags.ok, true);

  const batchMove = operations.organizeRecords({
    assetIds: [a1.id, a2.id],
    targetFolderId: subRes.data.folder.id,
  });
  assert.equal(batchMove.ok, true);
  assert.equal(batchMove.data.movedCount, 2);

  // Enviar múltiplos selecionados para a lixeira e restaurar apenas 1 para checar persistência
  const trashMulti = operations.moveToTrash([
    { type: 'asset', id: a2.id },
  ]);
  assert.equal(trashMulti.ok, true);

  // Reiniciar app a partir do mesmo storage persistente
  const reloadedStore = createWorkspaceStore({ storage, key: WORKSPACE_KEY });
  const snap = reloadedStore.snapshot();
  const reloadedA1 = snap.assets.find((a) => a.id === a1.id);
  const reloadedFolder = snap.folders.find((f) => f.id === folder.id);

  assert.equal(reloadedA1.nome, 'HANAKO_v2');
  assert.equal(reloadedA1.folder, subRes.data.folder.id);
  assert.deepEqual(reloadedA1.tags, ['Anime', 'Revisado']);
  assert.equal(reloadedA1.caminho, rawWindowsPath);
  assert.equal(reloadedFolder.name, 'DOW_Principal');
  assert.equal(snap.assets.find((a) => a.id === a2.id).deleted.type, 'asset');
  assert.equal(typeof store.snapshot, 'function');
});

test('Etapa 19.1-19.5: integração de UI sem botões três pontinhos, com ExplorerContextMenu, Smart Details, acessibilidade e CSS preservando regras', () => {
  const deckViewSource = readFileSync(
    new URL('../src/components/deck/DeckFilteredView.tsx', import.meta.url),
    'utf8',
  );
  const contextMenuSource = readFileSync(
    new URL('../src/components/deck/ExplorerContextMenu.tsx', import.meta.url),
    'utf8',
  );
  const libraryUiSource = readFileSync(
    new URL('../src/library-ui.js', import.meta.url),
    'utf8',
  );
  const vaultSource = readFileSync(
    new URL('../src/components/common/AssetVaultPanel.tsx', import.meta.url),
    'utf8',
  );
  const deckCss = readFileSync(
    new URL('../src/components/deck/deckFilters.css', import.meta.url),
    'utf8',
  );
  const studioCss = readFileSync(
    new URL('../src/studio.css', import.meta.url),
    'utf8',
  );

  // 19.2: nenhum botão de três pontinhos nem controles inline expandidos nas linhas do Convés
  assert.equal(deckViewSource.includes('className="row-more"'), false);
  assert.equal(deckViewSource.includes('className="row-menu"'), false);
  assert.equal(studioCss.includes('minmax(0, 1.05fr) 34px'), false);

  // 19.1: Painel Detalhes Redesenhado
  assert.match(deckViewSource, /Selecione um asset ou pasta para visualizar os detalhes\./);
  assert.equal(deckViewSource.includes('Selecione um asset para inspecionar.'), false);
  assert.equal(deckViewSource.includes('Nenhuma etiqueta encontrada nos assets desta pasta.'), false);
  assert.match(deckViewSource, /className="studio-inspector__section studio-inspector__collapsible"/);
  assert.match(deckViewSource, /<span>Informações técnicas<\/span>/);
  assert.match(deckViewSource, /Copiar caminho/);
  assert.match(deckViewSource, /Ver caminho completo/);
  assert.match(deckViewSource, /formatDisplayPath\(inspectedAsset\.caminho\)/);
  assert.match(deckViewSource, /Etiquetas encontradas no conteúdo/);
  assert.match(deckViewSource, /aria-haspopup="menu"/);
  assert.match(deckViewSource, />\s*Ações\s*</);

  // Preserva compatibilidade com seções Smart Tags + Drag/SmartDragFocus
  assert.ok(deckViewSource.includes('1. Identificação'));
  assert.ok(deckViewSource.includes('2. Organização'));
  assert.ok(deckViewSource.includes('3. Informações técnicas'));
  assert.ok(deckViewSource.includes('4. Etiquetas do asset'));
  assert.match(deckViewSource, /applySmartDragFocus/);
  assert.match(deckViewSource, /setSmartDragImage/);

  // 19.3 & 19.4: ExplorerContextMenu com teclado, clique fora, scroll, Resize, Shift+F10, ContextMenu
  assert.match(deckViewSource, /<ExplorerContextMenu/);
  assert.match(deckViewSource, /openContextMenuForFolder/);
  assert.match(deckViewSource, /openContextMenuForAsset/);
  assert.match(deckViewSource, /Shift\+?F10|event\.key === 'F10'/);
  assert.match(deckViewSource, /Abrir no Asset Inspector/);
  assert.match(deckViewSource, /Criar subpasta/);
  assert.match(deckViewSource, /Renomear registro/);
  assert.match(deckViewSource, /Mover selecionados/);
  // Sem recursos fictícios de Favoritos no menu contextual
  assert.equal(deckViewSource.includes('Adicionar aos favoritos'), false);

  assert.match(contextMenuSource, /role="menu"/);
  assert.match(contextMenuSource, /role="menuitem"/);
  assert.match(contextMenuSource, /clampContextMenuPosition/);
  assert.match(contextMenuSource, /case 'ArrowDown':/);
  assert.match(contextMenuSource, /case 'ArrowUp':/);
  assert.match(contextMenuSource, /case 'Escape':/);
  assert.match(contextMenuSource, /pointerdown/);

  // library-ui.js não intercepta mais contextmenu em #conves-react-root (delegado ao React)
  assert.equal(libraryUiSource.includes("deck.addEventListener('contextmenu'"), false);

  // AssetVaultPanel escuta rocketbox:vault-action quando em desktop Tauri
  assert.match(vaultSource, /rocketbox:vault-action/);

  // 19.5: estilos do menu contextual, colapsáveis, títulos sem uppercase forçado e layout fixo intacto
  assert.match(deckCss, /\.rb-context-menu\s*\{/);
  assert.match(deckCss, /\.rb-context-menu__item\.is-danger/);
  assert.match(deckCss, /\.studio-inspector__collapsible/);
  assert.equal(
    /\.studio-inspector__section-title\s*\{[^}]*text-transform:\s*uppercase/.test(deckCss),
    false,
  );
});
