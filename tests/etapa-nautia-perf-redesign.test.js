import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { matchNautiaQuickReply } from '../src/services/nautiaQuickReplies.ts';
import {
  clearNautiaPerformanceLogs,
  loadNautiaPerformanceLogs,
  recordNautiaPerformance,
  nsToMs,
  computeTokensPerSecond,
} from '../src/services/nautiaPerformance.ts';
import { converseWithOllama } from '../src/services/ollamaConversation.ts';
import { interpretNautiaIntent } from '../src/services/nautiaIntentService.ts';
import { createWorkspaceStore } from '../src/workspace-store.js';
import { createLibraryOperationsService } from '../src/services/libraryOperationsService.ts';
import { createModuleHarness } from './helpers/nautia-module-harness.js';

function setupLibrary() {
  const data = new Map();
  const store = createWorkspaceStore({
    storage: {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, v),
    },
  });
  const operations = createLibraryOperationsService(store);
  const context = { folderId: null, selectedAssetIds: [], project: null, filters: {} };
  return { store, operations, context };
}

function ndjsonFrames(frames) {
  const body = `${frames.map((frame) => JSON.stringify(frame)).join('\n')}\n`;
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

const emptyEntities = Object.fromEntries(
  ['query', 'assetName', 'folderName', 'project', 'format', 'software', 'dateHint', 'tag'].map((k) => [k, null]),
);

test('ETAPA 3: respostas rápidas locais resolvem cumprimentos e agradecimentos variados sem chamar Ollama', () => {
  const seenGreetings = new Set();
  for (const input of ['oi', 'Oi!', 'bom dia', 'boa tarde', 'boa noite', 'tudo bem?']) {
    const match = matchNautiaQuickReply(input);
    assert.ok(match, `Esperado match rápido para "${input}"`);
    assert.match(match.message, /\?$/);
    seenGreetings.add(match.message);
  }
  assert.ok(seenGreetings.size >= 5, 'Saudações diferentes e repetidas devem variar a resposta');

  for (const input of ['obg', 'obrigado', 'vlw', 'valeu!']) {
    const match = matchNautiaQuickReply(input);
    assert.ok(match, `Esperado match rápido para "${input}"`);
    assert.ok(match.message.length > 0);
    assert.doesNotMatch(match.message,/buscar assets|organizar pastas|analisar algum asset/i);
  }
});

test('ETAPA 3: palavras de confirmação/operacionais e prompts com plano pendente nunca são interceptados', () => {
  for (const blocked of ['sim', 'ok', 'pode', 'confirmo', 'confirmar', 'analise', 'oi, organize meus assets']) {
    assert.equal(matchNautiaQuickReply(blocked), null, `"${blocked}" não deve virar resposta rápida`);
  }
  assert.equal(matchNautiaQuickReply('obg', { hasPendingPlan: true }), null);
  assert.equal(matchNautiaQuickReply('oi', { hasPendingPlan: true }), null);
});

test('ETAPA 4: interpretNautiaIntent omite arrays vazios quando não há contexto nem histórico', async () => {
  let capturedMessages = [];
  const intent = await interpretNautiaIntent(
    'Analise o asset selecionado.',
    [],
    {},
    AbortSignal.timeout(1000),
    async (_url, init) => {
      capturedMessages = JSON.parse(init.body).messages;
      return ndjsonFrames([
        {
          message: {
            content: JSON.stringify({
              intent: 'analyze_asset',
              entities: emptyEntities,
              referencesPrior: false,
              requiresClarification: false,
              proposedTool: 'analyzeAsset',
            }),
          },
          done: false,
        },
        { done: true, eval_count: 18, eval_duration: 150_000_000 },
      ]);
    },
    'nautia:0.1',
    'http://127.0.0.1:11434',
  );
  assert.equal(intent.intent, 'analyze_asset');
  assert.equal(capturedMessages.length, 2);
  assert.ok(!capturedMessages.some((m) => m.content.includes('"historicalConversation":[]')));
});

test('ETAPA 2 & 6: comparação de chamadas LLM (saudação usa 1 chamada generativa direta vs fluxo completo com métricas)', async () => {
  const memoryMap = new Map();
  const mockStorage = {
    getItem: (k) => memoryMap.get(k) ?? null,
    setItem: (k, v) => memoryMap.set(k, v),
    removeItem: (k) => memoryMap.delete(k),
  };
  const allPerfEntries = [];
  const { operations, context } = setupLibrary();
  const config = { provider: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'nautia:0.1' };
  let fetchCount = 0;

  const knownOut = await converseWithOllama({
    config,
    prompt: 'Quem criou a RocketBox?',
    history: [],
    context,
    operations,
    signal: AbortSignal.timeout(1000),
    onText: () => {},
    onPerformanceMetrics: (entry) => {
      allPerfEntries.push(entry);
      recordNautiaPerformance(entry, mockStorage);
    },
    fetchImpl: async () => {
      fetchCount++;
      throw new Error('Não deveria chamar Ollama para conhecimento local');
    },
  });
  assert.equal(knownOut.kind, 'guidance');
  assert.equal(fetchCount, 0);

  let greetingPerf = null;
  let greetingChatCalls = 0;
  const greetingOut = await converseWithOllama({
    config,
    prompt: 'oi',
    history: [],
    context,
    operations,
    signal: AbortSignal.timeout(1000),
    onText: () => {},
    onPerformanceMetrics: (entry) => {
      greetingPerf = entry;
      allPerfEntries.push(entry);
      recordNautiaPerformance(entry, mockStorage);
    },
    fetchImpl: async (url) => {
      if (String(url).endsWith('/api/tags')) return Response.json({ models: [{ name: 'nautia:0.1' }] });
      greetingChatCalls++;
      return ndjsonFrames([
        { message: { content: 'Olá! Eu sou a NautIA, sua assistente no RocketBox. Como posso ajudar você hoje?' }, done: false },
        { done: true, load_duration: 4_000_000, prompt_eval_duration: 20_000_000, eval_duration: 100_000_000, prompt_eval_count: 80, eval_count: 20 },
      ]);
    },
  });
  assert.equal(greetingOut.kind, 'read-result');
  assert.equal(greetingChatCalls, 1);
  assert.equal(greetingPerf.llmCalls, 1);

  let recordedPerf = null;
  const ollamaOut = await converseWithOllama({
    config,
    prompt: 'Analise o asset selecionado.',
    history: [
      { role: 'user', text: 'Antigo 1' },
      { role: 'nautia', text: 'Resposta 1' },
      { role: 'user', text: 'Antigo 2' },
      { role: 'nautia', text: 'Resposta 2' },
      { role: 'user', text: 'Antigo 3' },
      { role: 'nautia', text: 'Resposta 3' },
    ],
    context,
    operations,
    signal: AbortSignal.timeout(1000),
    onText: () => {},
    onPerformanceMetrics: (entry) => {
      recordedPerf = entry;
      allPerfEntries.push(entry);
      recordNautiaPerformance(entry, mockStorage);
    },
    fetchImpl: async (url, init) => {
      fetchCount++;
      if (String(url).endsWith('/api/tags')) return Response.json({ models: [{ name: 'nautia:0.1' }] });
      const body = JSON.parse(init.body);
      if (body.format) {
        return ndjsonFrames([
          {
            message: {
              content: JSON.stringify({
                intent: 'general_chat',
                entities: emptyEntities,
                referencesPrior: false,
                requiresClarification: false,
                proposedTool: null,
              }),
            },
            done: false,
          },
          {
            done: true,
            load_duration: 12_000_000,
            prompt_eval_duration: 45_000_000,
            eval_duration: 100_000_000,
            prompt_eval_count: 120,
            eval_count: 25,
          },
        ]);
      }
      return ndjsonFrames([
        { message: { content: 'Selecione um asset no Convés para eu analisar.' }, done: false },
        {
          done: true,
          load_duration: 5_000_000,
          prompt_eval_duration: 60_000_000,
          eval_duration: 500_000_000,
          prompt_eval_count: 210,
          eval_count: 20,
        },
      ]);
    },
  });

  assert.equal(ollamaOut.kind, 'read-result');
  assert.ok(recordedPerf);
  assert.equal(recordedPerf.source, 'ollama');
  assert.equal(recordedPerf.llmCalls, 2);
  assert.equal(recordedPerf.ollamaLoadDurationMs, 17);
  assert.equal(recordedPerf.ollamaPromptEvalDurationMs, 105);
  assert.equal(recordedPerf.tokensPerSecond, computeTokensPerSecond(45, 600_000_000));
  assert.equal(nsToMs(12_000_000), 12);
  const stored = loadNautiaPerformanceLogs(mockStorage);
  assert.equal(stored.length, 3);
  assert.equal(allPerfEntries.length, 3);
  assert.equal(JSON.stringify(stored).includes('Antigo 1'), false);
  clearNautiaPerformanceLogs(mockStorage);
  assert.equal(loadNautiaPerformanceLogs(mockStorage).length, 0);
});

test('ETAPA 1 & 5: botão único Enviar <-> Parar geração, textarea editável e bloqueio de envio simultâneo', async (t) => {
  const emptyConv = { id: 'c1', title: 'Nova conversa', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), turns: [] };
  const h = createModuleHarness([emptyConv]);
  t.after(() => h.dispose());
  await h.flush();

  // Com Ollama ativo, até saudação segue para o modelo generativo (não retorna frase estática)
  await h.prompt('oi');
  assert.equal(h.calls.length, 1);
  h.calls[0].resolve({ kind: 'read-result', message: 'Olá! Sou a NautIA, assistente do RocketBox. Como posso ajudar?' });
  await h.flush();
  assert.match(h.thread().turns.at(-1).text, /NautIA/);

  // Inicia requisição real -> botão Enviar vira Parar geração no mesmo lugar
  await h.prompt('Pergunta complexa');
  assert.equal(h.calls.length, 2);
  assert.equal(h.thread().isProcessing, true);
  assert.equal(h.button('Enviar mensagem para a NautIA'), undefined);
  const stopBtn = h.button('Parar geração');
  assert.ok(stopBtn);
  assert.equal(stopBtn.props.type, 'button');

  // Textarea continua editável e Enter não dispara segunda requisição simultânea
  const textarea = h.find((n) => n.type === 'textarea');
  assert.ok(!textarea.props.disabled);
  textarea.props.onChange({ target: { value: 'rascunho enquanto gera' } });
  textarea.props.onKeyDown({ key: 'Enter', shiftKey: false, nativeEvent: { isComposing: false }, preventDefault() {} });
  h.render();
  assert.equal(h.calls.length, 2);

  // Não existe linha extra .nautia-stream-status nem botão separado "Cancelar geração"
  assert.equal(h.find((n) => n.props?.className === 'nautia-stream-status'), undefined);
  assert.equal(h.button('Cancelar geração'), undefined);

  // Clicar em Parar geração aborta imediatamente e ignora chunks tardios
  stopBtn.props.onClick();
  h.render();
  assert.equal(h.calls[1].params.signal.aborted, true);
  assert.equal(h.thread().isProcessing, false);
  assert.ok(h.button('Enviar mensagem para a NautIA'));
});

test('ETAPA 1 & 7: thread exibe Pensando.../Respondendo... e diagnóstico fica recolhível em Configurar NautIA', () => {
  const threadSrc = fs.readFileSync(new URL('../src/components/nautia/NautiaChatThread.tsx', import.meta.url), 'utf8');
  const viewSrc = fs.readFileSync(new URL('../src/components/nautia/NautiaModuleView.tsx', import.meta.url), 'utf8');
  assert.match(threadSrc, /Pensando\.\.\./);
  assert.match(threadSrc, /Respondendo\.\.\./);
  assert.match(viewSrc, /Diagnóstico de desempenho/);
  assert.doesNotMatch(viewSrc, /nautia-stream-status/);
});
