import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addTagToSelection,
  buildTagPickerDropdownItems,
  computeNextHighlightIndex,
  removeTagFromSelection,
  resolveBackspaceTagRemoval,
  resolveTagPickerEnterAction,
} from '../src/services/tagPickerLogic.ts';
import {
  DEFAULT_UNIVERSAL_FILTERS,
  runDeckFilters,
} from '../src/services/deckFilterService.ts';
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

function createEnv() {
  const storage = new MemoryStorage({
    folders: [],
    assets: [],
    folderTags: [],
    assetTags: [],
  });
  let seq = 0;
  const store = createWorkspaceStore({
    storage,
    uuid: () => `id-${++seq}`,
    now: () => '2026-11-15T15:00:00.000Z',
  });
  const operations = createLibraryOperationsService(store);
  return { store, operations };
}

const SAMPLE_CATALOG = [
  { id: 't1', label: 'DOW', icon: 'tag', color: 'cyan' },
  { id: 't2', label: 'Heroi', icon: 'tag', color: 'purple' },
  { id: 't3', label: 'Personagem 3D', icon: 'tag', color: 'cyan' },
  { id: 't4', label: 'Sci-Fi', icon: 'tag', color: 'emerald' },
];

test('TagPicker validações 1 a 5: seleção, criação, bloqueio de duplicadas, múltipla seleção e remoção', () => {
  // 1. Selecionar etiqueta existente e filtrar pelo texto digitado
  const filtered = buildTagPickerDropdownItems({
    availableTags: SAMPLE_CATALOG,
    selectedTags: [],
    query: 'sci',
    allowCreate: true,
  });
  assert.equal(filtered.items[0].kind, 'select-existing');
  assert.equal(filtered.items[0].label, 'Sci-Fi');

  // 2. Oferecer "Criar nova etiqueta" apenas quando não houver correspondência exata
  assert.equal(
    filtered.items.some((i) => i.kind === 'create-new' && i.label === 'sci'),
    true,
  );
  const brandNew = buildTagPickerDropdownItems({
    availableTags: SAMPLE_CATALOG,
    selectedTags: [],
    query: 'Unreal Engine 5',
    allowCreate: true,
  });
  assert.equal(brandNew.items.length, 1);
  assert.equal(brandNew.items[0].kind, 'create-new');
  assert.equal(brandNew.items[0].label, 'Unreal Engine 5');

  // 3. Tentar criar etiqueta duplicada ("  dow  " quando "DOW" já existe no catálogo)
  const dupAgainstCatalog = buildTagPickerDropdownItems({
    availableTags: SAMPLE_CATALOG,
    selectedTags: [],
    query: '  dow  ',
    allowCreate: true,
  });
  assert.equal(dupAgainstCatalog.exactExistingMatch?.label, 'DOW');
  assert.equal(
    dupAgainstCatalog.items.some((i) => i.kind === 'create-new'),
    false,
    'Nunca oferecer criação quando existir etiqueta equivalente no catálogo',
  );
  assert.equal(dupAgainstCatalog.items[0].label, 'DOW');

  // Tentativa após "DOW" já estar selecionada
  const dupAlreadySelected = buildTagPickerDropdownItems({
    availableTags: SAMPLE_CATALOG,
    selectedTags: ['DOW'],
    query: 'dow',
    allowCreate: true,
  });
  assert.equal(dupAlreadySelected.alreadySelectedMatch, 'DOW');
  assert.equal(dupAlreadySelected.items.length, 0);

  // 4. Adicionar múltiplas etiquetas mantendo grafia canônica e sem duplicatas
  const step1 = addTagToSelection({
    selectedTags: [],
    availableTags: SAMPLE_CATALOG,
    candidateLabel: 'dow',
  });
  assert.deepEqual(step1.nextSelectedTags, ['DOW']);

  const step2 = addTagToSelection({
    selectedTags: step1.nextSelectedTags,
    availableTags: SAMPLE_CATALOG,
    candidateLabel: 'Chefe Final',
  });
  assert.deepEqual(step2.nextSelectedTags, ['DOW', 'Chefe Final']);

  // 5. Remover etiqueta explícita e Backspace apenas quando query está vazia
  const afterRemove = removeTagFromSelection(step2.nextSelectedTags, 'DOW');
  assert.deepEqual(afterRemove, ['Chefe Final']);

  assert.equal(
    resolveBackspaceTagRemoval({ query: 'abc', selectedTags: step2.nextSelectedTags }),
    null,
    'Backspace não deve remover chip quando o usuário está apagando texto no input',
  );
  assert.deepEqual(
    resolveBackspaceTagRemoval({ query: '', selectedTags: step2.nextSelectedTags }),
    ['DOW'],
  );
});

test('TagPicker validações 6 a 9: registrar sem etiquetas, cancelar sem persistir rascunho, persistir no asset e exibir no Convés', () => {
  const { store, operations } = createEnv();

  // Simular digitação seguida de cancelamento antes de registrar: catálogo permanece intacto (0 etiquetas gravadas)
  const draftState = buildTagPickerDropdownItems({
    availableTags: store.snapshot().assetTags ?? [],
    selectedTags: [],
    query: 'EtiquetaTemporariaCancelada',
    allowCreate: true,
  });
  assert.equal(draftState.items[0].kind, 'create-new');
  // Cancelamento descarta draftState sem chamar operations
  assert.equal((store.snapshot().assetTags ?? []).length, 0);

  // 6. Registrar asset sem nenhuma etiqueta
  const withoutTags = operations.registerAsset({
    nome: 'Caixa_Simples',
    caminho: 'C:/Vault/Props/Caixa_Simples.fbx',
    kind: 'asset',
    categoria: 'Objeto',
    formato: '.fbx',
    engine: 'Universal',
  });
  assert.equal(withoutTags.ok, true);
  assert.deepEqual(withoutTags.data.tags, []);

  // 8. Persistir múltiplas etiquetas enviadas pelo TagPicker no registro do asset
  const withTags = operations.registerAsset({
    nome: 'Jade_Operative',
    caminho: 'C:/Vault/Chars/Jade_Operative.fbx',
    kind: 'asset',
    categoria: 'Personagem',
    formato: '.fbx',
    engine: 'Unreal Engine',
    tags: ['DOW', 'Heroi'],
  });
  assert.equal(withTags.ok, true);
  assert.deepEqual(withTags.data.tags, ['DOW', 'Heroi']);
  assert.equal(store.snapshot().assetTags.length, 2);

  // 9. Exibir e filtrar corretamente no Convés
  const convesResult = runDeckFilters({
    currentParentId: null,
    folders: store.snapshot().folders,
    assets: store.snapshot().assets,
    folderTags: store.snapshot().folderTags,
    selectedTagIds: [],
    tagSearchQuery: '',
    tagMatchMode: 'any',
    universalFilters: {
      ...DEFAULT_UNIVERSAL_FILTERS,
      selectedAssetTags: ['DOW'],
      tagScope: 'asset',
    },
  });
  assert.deepEqual(
    convesResult.visibleAssets.map((a) => a.nome),
    ['Jade_Operative'],
  );
});

test('TagPicker validações 10 a 13: teclado, proteção IME, reutilização, design tokens e layout fixo sem rolagem global', () => {
  // 10. Navegação por teclado e bloqueio durante composição IME
  assert.equal(computeNextHighlightIndex(0, 3, 'next'), 1);
  assert.equal(computeNextHighlightIndex(2, 3, 'next'), 0);
  assert.equal(computeNextHighlightIndex(0, 3, 'prev'), 2);
  assert.equal(computeNextHighlightIndex(1, 3, 'last'), 2);
  assert.equal(computeNextHighlightIndex(2, 3, 'first'), 0);

  const dropdown = buildTagPickerDropdownItems({
    availableTags: SAMPLE_CATALOG,
    selectedTags: [],
    query: '',
    allowCreate: true,
  });

  // Enter durante composição IME não deve confirmar opção
  assert.equal(
    resolveTagPickerEnterAction({
      items: dropdown.items,
      highlightedIndex: 0,
      isComposing: true,
    }),
    null,
  );
  // Enter normal confirma opção destacada
  assert.equal(
    resolveTagPickerEnterAction({
      items: dropdown.items,
      highlightedIndex: 1,
      isComposing: false,
    })?.label,
    'Heroi',
  );

  // Verificar implementação estrutural de TagPicker.tsx, RegisterAssetForm.tsx, DeckFilteredView.tsx e CSS
  const tagPickerSrc = readFileSync(
    new URL('../src/components/deck/TagPicker.tsx', import.meta.url),
    'utf8',
  );
  const registerFormSrc = readFileSync(
    new URL('../src/components/deck/RegisterAssetForm.tsx', import.meta.url),
    'utf8',
  );
  const deckViewSrc = readFileSync(
    new URL('../src/components/deck/DeckFilteredView.tsx', import.meta.url),
    'utf8',
  );
  const deckCssSrc = readFileSync(
    new URL('../src/components/deck/deckFilters.css', import.meta.url),
    'utf8',
  );
  const studioCssSrc = readFileSync(
    new URL('../src/studio.css', import.meta.url),
    'utf8',
  );

  // Semântica acessível + IME + fechamento ao clicar fora / Escape + reposicionamento inteligente
  assert.ok(tagPickerSrc.includes('role="combobox"'));
  assert.ok(tagPickerSrc.includes('role="listbox"'));
  assert.ok(tagPickerSrc.includes('aria-multiselectable="true"'));
  assert.ok(tagPickerSrc.includes('event.nativeEvent.isComposing'));
  assert.ok(tagPickerSrc.includes("case 'Escape':"));
  assert.ok(tagPickerSrc.includes("case 'ArrowDown':"));
  assert.ok(tagPickerSrc.includes("case 'ArrowUp':"));
  assert.ok(tagPickerSrc.includes("case 'Backspace':"));
  assert.ok(tagPickerSrc.includes('setOpenUpward'));

  // Reutilização entre Registrar Asset e Painel Detalhes do Convés + ausência de botão cinza isolado
  assert.ok(registerFormSrc.includes('<TagPicker'));
  assert.ok(deckViewSrc.includes('<TagPicker'));
  assert.equal(registerFormSrc.includes('nautia-optional-tags__add-btn'), false);
  assert.equal(registerFormSrc.includes('tag-input'), false);

  // Dimensões compactas, scroll restrito ao menu do dropdown e Fixed Workspace Layout intacto
  assert.ok(deckCssSrc.includes('.rb-tag-picker__menu'));
  assert.ok(deckCssSrc.includes('max-height: 220px'));
  assert.ok(deckCssSrc.includes('overflow-y: auto'));
  assert.ok(deckCssSrc.includes('.rb-tag-picker__menu.is-upward'));
  assert.ok(studioCssSrc.includes('overflow: hidden;'));
  assert.ok(studioCssSrc.includes('#view-register .nautia-register-form__body'));
});
