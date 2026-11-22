import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createEmptyConversation,
  deriveConversationTitle,
  groupConversationTurns,
  loadNautiaConversations,
  resolveAssistantServiceStatus,
  saveNautiaConversations,
} from '../src/services/nautiaConversationStore.ts';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
}

test('A cancelled generation persists as cancellation and does not imply an unavailable verified provider',()=>{
 const now=Date.now(),storage=new MemoryStorage(),conversation=createEmptyConversation(new Date(now).toISOString());
 const turn={id:'cancelled',role:'nautia',text:'Geração cancelada.',status:'cancelled',createdAt:new Date(now+1).toISOString()};
 const previous=globalThis.window;globalThis.window={localStorage:storage};
 try {saveNautiaConversations([{...conversation,turns:[turn]}]);assert.equal(loadNautiaConversations()[0].turns[0].status,'cancelled');}
 finally {if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
 assert.equal(resolveAssistantServiceStatus({provider:'ollama',endpoint:'http://127.0.0.1:11434',model:'local',verifiedAt:now},turn).connectivity,'llm-ready');
});

test('Saving conversations does not silently discard legitimate history beyond twenty records',()=>{
 const previous=globalThis.window;globalThis.window={localStorage:new MemoryStorage()};
 try {const conversations=Array.from({length:35},(_,i)=>({...createEmptyConversation(),id:`history-${i}`,turns:[{id:`u-${i}`,role:'user',text:`Mensagem ${i}`,createdAt:new Date().toISOString()}]}));saveNautiaConversations(conversations);assert.equal(loadNautiaConversations().length,35);}
 finally {if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});

test('Ícones da NautIA substituem capacete antigo por chibi e Saturno por órbita com foguete', () => {
  const ocsisSvg = fs.readFileSync(
    new URL('../src/assets/icons/ocsis.svg', import.meta.url),
    'utf8',
  );
  const orbitaSvg = fs.readFileSync(
    new URL('../src/assets/icons/orbita.svg', import.meta.url),
    'utf8',
  );
  const chibiTsx = fs.readFileSync(
    new URL('../src/components/nautia/NautiaChibiIcon.tsx', import.meta.url),
    'utf8',
  );
  const quickActionsTsx = fs.readFileSync(
    new URL('../src/components/deck/NautiaQuickActions.tsx', import.meta.url),
    'utf8',
  );

  // Símbolo chibi no sprite SVG (sem capacete retangular legado)
  assert.equal(ocsisSvg.includes('<symbol id="ocsis-nautia"'), true);
  assert.equal(ocsisSvg.includes('fill-rule="evenodd"'), true);
  assert.equal(ocsisSvg.includes('<rect x="7.5" y="6"'), false);

  // Chibi compartilhado no inspector do Convés
  assert.equal(chibiTsx.includes('NautiaChibiIcon'), true);
  assert.equal(quickActionsTsx.includes('<NautiaChibiIcon'), true);

  // Novo símbolo orbital Saturno + foguete com cyan, roxo e detalhe laranja discreto
  assert.equal(orbitaSvg.includes('nautiaOrbGrad'), true);
  assert.equal(orbitaSvg.includes('nautiaRocketGrad'), true);
  assert.equal(orbitaSvg.includes('#fb923c'), true);

  // Marca d'água discreta de fundo do chatbot (PNG sem fundo em tonalidade escura)
  assert.equal(
    fs.existsSync(new URL('../src/assets/icons/orbita-watermark.png', import.meta.url)),
    true,
  );
  const studioCss = fs.readFileSync(
    new URL('../src/studio.css', import.meta.url),
    'utf8',
  );
  assert.equal(studioCss.includes("url('./assets/icons/orbita-watermark.png')"), true);
});

test('nautiaConversationStore agrupa balões consecutivos, avalia estado da assistente e persiste histórico sem conversas vazias', () => {
  const empty = createEmptyConversation('2026-11-15T00:00:00.000Z');
  assert.equal(empty.turns.length, 0);
  assert.equal(empty.title, 'Nova conversa');

  const title = deriveConversationTitle('  Analise todos os FBX da pasta   Personagens   com atenção extra para rigs  ');
  assert.equal(title.endsWith('...'), true);
  assert.equal(title.length <= 46, true);

  const turns = [
    { id: '1', role: 'user', text: 'Oi', createdAt: '2026-11-15T00:01:00.000Z' },
    { id: '2', role: 'nautia', text: 'Olá!', createdAt: '2026-11-15T00:01:01.000Z', status: 'success' },
    { id: '3', role: 'nautia', text: 'Plano concluído.', createdAt: '2026-11-15T00:01:02.000Z', status: 'success' },
    { id: '4', role: 'user', text: 'Obrigado', createdAt: '2026-11-15T00:02:00.000Z' },
  ];

  const grouped = groupConversationTurns(turns);
  assert.equal(grouped[0].isGroupStart, true);
  assert.equal(grouped[0].isGroupEnd, true);
  assert.equal(grouped[1].isGroupStart, true);
  assert.equal(grouped[1].isGroupEnd, false);
  assert.equal(grouped[2].isGroupStart, false);
  assert.equal(grouped[2].isGroupEnd, true);
  assert.equal(grouped[3].isGroupStart, true);
  assert.equal(grouped[3].isGroupEnd, true);

  // Estado honesto da assistente
  assert.equal(
    resolveAssistantServiceStatus({ provider: 'none', endpoint: '', model: '' }, null).connectivity,
    'deterministic',
  );
  assert.equal(
    resolveAssistantServiceStatus(
      { provider: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'llama3.1' },
      null,
    ).connectivity,
    'llm-unavailable',
  );
  assert.equal(
    resolveAssistantServiceStatus(
      { provider: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'llama3.1' },
      {
        id: 'err',
        role: 'nautia',
        text: 'Fallback',
        createdAt: '2026-11-15T00:03:00.000Z',
        status: 'unavailable',
        outcome: { kind: 'guidance', message: 'Fallback', warnings: ['Falha de comunicação com LLM'] },
      },
    ).connectivity,
    'llm-unavailable',
  );

  // Persistência segura de conversas não vazias
  const prevWindow = globalThis.window;
  globalThis.window = { localStorage: new MemoryStorage() };
  try {
    const activeConv = {
      id: 'conv-1',
      title: 'Analise FBX',
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-15T00:01:02.000Z',
      turns,
    };
    saveNautiaConversations([empty, activeConv]);
    const loaded = loadNautiaConversations();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, 'conv-1');
    assert.equal(loaded[0].turns.length, 4);
  } finally {
    if (prevWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = prevWindow;
    }
  }
});

test('NautIA Conversational Interface 2.0 implementa boas-vindas, balões, estados, cartões técnicos, histórico e Enter/Shift+Enter', () => {
  const welcomeTsx = fs.readFileSync(
    new URL('../src/components/nautia/NautiaWelcomeScreen.tsx', import.meta.url),
    'utf8',
  );
  const threadTsx = fs.readFileSync(
    new URL('../src/components/nautia/NautiaChatThread.tsx', import.meta.url),
    'utf8',
  );
  const cardsTsx = fs.readFileSync(
    new URL('../src/components/nautia/NautiaTurnCards.tsx', import.meta.url),
    'utf8',
  );
  const moduleTsx = fs.readFileSync(
    new URL('../src/components/nautia/NautiaModuleView.tsx', import.meta.url),
    'utf8',
  );

  // Tela de Boas-Vindas independente
  assert.equal(welcomeTsx.includes('Olá! Sou a NautIA.'), true);
  assert.equal(
    welcomeTsx.includes(
      'Sua copilota no RocketBox. Posso ajudar você a analisar, organizar e explorar seus assets.',
    ),
    true,
  );
  assert.equal(welcomeTsx.includes('Por onde começamos?'), true);
  assert.equal(welcomeTsx.includes('orbita-welcome.png'), true);
  assert.equal(
    fs.existsSync(new URL('../src/assets/icons/orbita-welcome.png', import.meta.url)),
    true,
  );
  for (const label of [
    'Analisar um asset',
    'Organizar biblioteca',
    'Criar etiquetas',
    'Verificar compatibilidade',
  ]) {
    assert.equal(welcomeTsx.includes(label), true, `Sugestão ausente: ${label}`);
  }

  // Exibição apenas quando vazia + transição sem duplicar mensagens entre abas
  assert.equal(moduleTsx.includes('turns.length === 0 && !isProcessing'), true);
  assert.equal(moduleTsx.includes('<NautiaWelcomeScreen'), true);
  assert.equal(moduleTsx.includes('+ Nova conversa'), true);
  assert.equal(moduleTsx.includes('Voltar às mensagens recentes'), true);
  assert.equal(moduleTsx.includes('event.shiftKey'), true);
  assert.equal(moduleTsx.includes('isComposing'), true);

  // Balões, estado processando (3 pontos) e tentar novamente
  assert.equal(threadTsx.includes('nautia-typing-dots'), true);
  assert.equal(threadTsx.includes('Tentar novamente'), true);
  assert.equal(threadTsx.includes('Serviço indisponível'), true);

  // Cartões técnicos compactos de análise, compatibilidade e plano de alteração
  assert.equal(cardsTsx.includes('ANÁLISE DE ASSET'), true);
  assert.equal(cardsTsx.includes('COMPATIBILIDADE & ANÁLISE'), true);
  assert.equal(cardsTsx.includes('PLANO DE ALTERAÇÃO'), true);
  assert.equal(cardsTsx.includes('Ver relatório completo'), true);
});
