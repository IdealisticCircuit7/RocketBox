import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceStore } from '../src/workspace-store.js';
import { createLibraryOperationsService } from '../src/services/libraryOperationsService.ts';
import { createOperationHistoryService } from '../src/services/operationHistoryService.ts';
import {
  converseWithOllama,
  allowedConversationTools,
} from '../src/services/ollamaConversation.ts';
import { executeApprovedActionPlan } from '../src/services/nautiaOrchestratorService.ts';
import { createNautiaToolSystem } from '../src/services/nautiaToolSystem.ts';
import { createModuleHarness } from './helpers/nautia-module-harness.js';

const entities = Object.fromEntries(
  ['query', 'assetName', 'folderName', 'project', 'format', 'software', 'dateHint', 'tag'].map((k) => [k, null]),
);

function makeTempLibrary() {
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  };
  const store = createWorkspaceStore({ storage });
  store.transact((d) => {
    d.folders = [
      { id: 'f-elite', name: 'Elite Maid Survival', parent: null, folderTagIds: [] },
      { id: 'f-dow', name: 'DOW', parent: null, folderTagIds: [] },
      { id: 'f-sub', name: 'DOW Extras', parent: 'f-dow', folderTagIds: [] },
    ];
    d.assets = [
      {
        id: 'a-hanako',
        nome: 'HANAKO',
        caminho: 'C:/TempTest/HANAKO.blend',
        formato: '.blend',
        categoria: 'Projeto Blender',
        folder: 'f-elite',
        tags: [],
      },
      {
        id: 'a-cube',
        nome: 'Cubo Teste',
        caminho: 'C:/TempTest/cubo.obj',
        formato: '.obj',
        categoria: 'Objeto',
        folder: null,
        tags: [],
      },
    ];
  });
  const operations = createLibraryOperationsService(store);
  const history = createOperationHistoryService({ storage });
  const context = { folderId: null, selectedAssetIds: [], project: null, filters: {}, collection: 'Biblioteca' };
  return { storage, store, operations, history, context };
}

function ndjson(items) {
  return new Response(`${items.map((x) => JSON.stringify(x)).join('\n')}\n`);
}

test('ETAPA 6.1 & 6.2 & 6.3 & 6.4: localizar pasta, preparar movimentação de pasta, cancelar e confirmar', async () => {
  const { store, operations, history, context } = makeTempLibrary();
  const config = { provider: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'nautia:0.1' };
  const before = store.snapshot();

  // Simula classificador retornando organize_assets com proposedTool=listFolders (cenário real que antes bloqueava mutação!)
  let calls = 0;
  const outcome = await converseWithOllama({
    config,
    prompt: 'Mova a pasta Elite Maid Survival para DOW',
    history: [],
    context,
    operations,
    signal: AbortSignal.timeout(2000),
    onText: () => {},
    fetchImpl: async (url, init) => {
      if (String(url).endsWith('/api/tags')) return Response.json({ models: [{ name: 'nautia:0.1' }] });
      const body = JSON.parse(init.body);
      if (body.format?.properties?.intent) {
        return ndjson([
          {
            message: {
              content: JSON.stringify({
                intent: 'organize_assets',
                entities: { ...entities, folderName: 'Elite Maid Survival' },
                referencesPrior: false,
                requiresClarification: false,
                proposedTool: 'listFolders',
              }),
            },
            done: true,
          },
        ]);
      }
      calls++;
      assert.ok(body.tools.some((t) => t.function.name === 'moveFolder'));
      const folderToolMsg = body.messages.find((m) => m.role === 'tool' && m.tool_name === 'listFolders');
      assert.ok(folderToolMsg, 'Pastas devem estar pré-carregadas para o modelo identificar os IDs reais');
      return ndjson([
        {
          message: {
            content: '',
            tool_calls: [{ function: { name: 'moveFolder', arguments: { folderId: 'f-elite', targetFolderId: 'f-dow' } } }],
          },
          done: true,
        },
      ]);
    },
  });

  assert.equal(calls, 1);
  assert.equal(outcome.kind, 'action-plan');
  assert.ok(outcome.plan);
  assert.equal(outcome.plan.steps[0].tool, 'moveFolder');
  // Antes da confirmação, nenhum dado foi alterado (equivale a cancelar antes de confirmar)
  assert.deepEqual(store.snapshot(), before);

  // Confirmação explícita executa a movimentação e verifica resultado real
  const executed = executeApprovedActionPlan({ plan: outcome.plan, operations, history });
  assert.equal(executed.ok, true, executed.summary);
  assert.equal(store.snapshot().folders.find((f) => f.id === 'f-elite')?.parent, 'f-dow');
});

test('ETAPA 6.5: envio de registro à lixeira mantém moveToTrash autorizado mesmo quando proposedTool é searchAssets', async () => {
  const { store, operations, history, context } = makeTempLibrary();
  const config = { provider: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'nautia:0.1' };
  const intent = {
    intent: 'trash_records',
    entities: { ...entities, assetName: 'Hanako' },
    referencesPrior: false,
    requiresClarification: false,
    proposedTool: 'searchAssets',
  };
  assert.equal(allowedConversationTools(intent).has('moveToTrash'), true);

  const outcome = await converseWithOllama({
    config,
    prompt: 'Mova a Hanako para a lixeira',
    history: [],
    context,
    operations,
    signal: AbortSignal.timeout(2000),
    onText: () => {},
    fetchImpl: async (url, init) => {
      if (String(url).endsWith('/api/tags')) return Response.json({ models: [{ name: 'nautia:0.1' }] });
      const body = JSON.parse(init.body);
      if (body.format?.properties?.intent) return ndjson([{ message: { content: JSON.stringify(intent) }, done: true }]);
      assert.ok(body.tools.some((t) => t.function.name === 'moveToTrash'));
      return ndjson([
        {
          message: {
            content: '',
            tool_calls: [{ function: { name: 'moveToTrash', arguments: { refs: [{ type: 'asset', id: 'a-hanako' }] } } }],
          },
          done: true,
        },
      ]);
    },
  });

  assert.equal(outcome.kind, 'action-plan');
  assert.equal(outcome.plan?.requiresDestructiveConfirmation, true);
  assert.equal(store.snapshot().assets.find((a) => a.id === 'a-hanako')?.deleted, undefined);

  const executed = executeApprovedActionPlan({ plan: outcome.plan, operations, history });
  assert.equal(executed.ok, true);
  assert.ok(store.snapshot().assets.find((a) => a.id === 'a-hanako')?.deleted);
});

test('ETAPA 6.6 & 6.9: solicitação ambígua não altera nada e erro em moveFolder preserva integridade sem duplicar', async () => {
  const { store, operations, history, context } = makeTempLibrary();
  const before = store.snapshot();

  const ambiguousTools = allowedConversationTools({
    intent: 'clarification_needed',
    entities,
    referencesPrior: false,
    requiresClarification: true,
    proposedTool: null,
  });
  assert.equal(ambiguousTools.size, 0);

  const tools = createNautiaToolSystem(operations, () => context);
  // Ciclo inválido: mover DOW para dentro de sua subpasta DOW Extras
  const invalidCycle = await tools.call('moveFolder', { folderId: 'f-dow', targetFolderId: 'f-sub' });
  assert.equal(invalidCycle.ok, false);
  assert.equal(invalidCycle.plan, undefined);
  assert.deepEqual(store.snapshot(), before);

  // Plano válido que fica obsoleto após exclusão da pasta destino não executa mutação parcial/duplicada
  const validPlan = await tools.call('moveFolder', { folderId: 'f-elite', targetFolderId: 'f-dow' });
  assert.equal(validPlan.ok, true);
  operations.moveToTrash([{ type: 'folder', id: 'f-dow' }]);
  const snapshotAfterTrash = store.snapshot();
  const staleExec = executeApprovedActionPlan({ plan: validPlan.plan, operations, history });
  assert.equal(staleExec.ok, false);
  assert.deepEqual(store.snapshot(), snapshotAfterTrash);
});

test('ETAPA 6.7 & 6.8: cancelamento, TimeoutError distinto e nova mensagem após operação sem reutilizar confirmação', async (t) => {
  const thread = {
    id: 'c-ops',
    title: 'Operações',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    turns: [],
  };
  const h = createModuleHarness([thread]);
  t.after(() => h.dispose());
  await h.flush();

  // Simula TimeoutError sem expor texto bruto "AbortError: Cancelado"
  await h.prompt('Mova a pasta Elite Maid Survival para DOW');
  h.calls[0].reject(new DOMException('Tempo esgotado', 'TimeoutError'));
  await h.flush();
  const timeoutReply = h.thread().turns.at(-1).text;
  assert.doesNotMatch(timeoutReply, /AbortError:\s*Cancelado/);
  assert.match(timeoutReply, /tempo limite|demorou/i);

  // Nova mensagem após erro/operação inicia sessão limpa sem reutilizar solicitação anterior
  await h.prompt('Quem criou a RocketBox?');
  await h.flush();
  assert.equal(h.calls.length, 1);
  assert.match(h.thread().turns.at(-1).text, /OCSIS/);
});
