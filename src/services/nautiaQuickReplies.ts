/**
 * Camada de respostas rápidas locais para interações triviais da NautIA (Etapa 3).
 * Reconhece apenas saudações, agradecimentos e despedidas inequívocas.
 * Nunca aprova, cancela ou executa ações operacionais quando há plano pendente ou comando.
 */

export type QuickReplyCategory = 'greeting' | 'thanks' | 'farewell';

export interface QuickReplyMatch {
  readonly category: QuickReplyCategory;
  readonly message: string;
}

const OPERATIONAL_OR_CONFIRMATION_WORDS = new Set([
  'sim',
  'nao',
  'ok',
  'okay',
  'pode',
  'confirmo',
  'confirmar',
  'aprovo',
  'aprovar',
  'aceito',
  'cancelar',
  'cancela',
  'parar',
  'executa',
  'executar',
  'criar',
  'crie',
  'mover',
  'mova',
  'apagar',
  'apague',
  'excluir',
  'exclua',
  'deletar',
  'delete',
  'remover',
  'remova',
  'renomear',
  'renomeie',
  'analisar',
  'analise',
  'organizar',
  'organize',
  'buscar',
  'busque',
  'listar',
  'liste',
  'pasta',
  'pastas',
  'asset',
  'assets',
  'arquivo',
  'arquivos',
  'tag',
  'tags',
  'etiqueta',
  'etiquetas',
  'lixeira',
  'restaurar',
  'restaure',
]);

let quickReplyRotation = 0;

function pickRotating(options: readonly string[]): string {
  const index = quickReplyRotation % options.length;
  quickReplyRotation += 1;
  return options[index];
}

const THANKS_VARIATIONS: Record<'formal' | 'casual', readonly string[]> = {
  formal: [
    'De nada! 💜 Se precisar, estou por aqui.',
    'Por nada! Podemos continuar de onde paramos quando você quiser.',
    'Disponha! Como posso ajudar agora?',
  ],
  casual: [
    'Por nada! 💜',
    'Sempre que precisar, é só chamar.',
    'Disponha! Quer continuar de onde paramos?',
  ],
};

const THANKS_KEYS = new Map<string, 'formal' | 'casual'>([
  ['obg', 'formal'],
  ['obrigado', 'formal'],
  ['obrigada', 'formal'],
  ['obgdo', 'formal'],
  ['obgda', 'formal'],
  ['brigado', 'formal'],
  ['brigada', 'formal'],
  ['brigadao', 'formal'],
  ['muito obrigado', 'formal'],
  ['muito obrigada', 'formal'],
  ['agradeco', 'formal'],
  ['thanks', 'formal'],
  ['thank you', 'formal'],
  ['thx', 'formal'],
  ['ty', 'formal'],
  ['vlw', 'casual'],
  ['valeu', 'casual'],
  ['valeu mesmo', 'casual'],
  ['vlw mesmo', 'casual'],
  ['tmj', 'casual'],
]);

const GREETING_SPECIFIC = new Map<string, readonly string[]>([
  [
    'bom dia',
    [
      'Bom dia, Mestre! ☀️ Posso ajudar você a buscar assets, organizar pastas ou analisar algum arquivo hoje?',
      'Bom dia, Mestre! ☀️ Como posso acelerar seu trabalho no Convés agora?',
    ],
  ],
  [
    'boa tarde',
    [
      'Boa tarde, Mestre! 🚀 Quer explorar sua biblioteca, aplicar etiquetas ou inspecionar algum projeto?',
      'Boa tarde, Mestre! 🚀 Em que posso ajudar na sua biblioteca agora?',
    ],
  ],
  [
    'boa noite',
    [
      'Boa noite, Mestre! ✨ Como posso ajudar na sua biblioteca agora — buscar assets, organizar pastas ou rodar uma análise?',
      'Boa noite, Mestre! ✨ Quer revisar algum asset ou organizar suas pastas antes de encerrar?',
    ],
  ],
  [
    'tudo bem',
    [
      'Tudo ótimo por aqui, Mestre! 💜 E com você? Quer ajuda para buscar assets, organizar pastas ou analisar algum arquivo?',
      'Tudo certo por aqui, Mestre! 🚀 Como posso te ajudar no RocketBox agora?',
    ],
  ],
  [
    'oi tudo bem',
    [
      'Tudo ótimo por aqui, Mestre! 💜 E com você? Quer ajuda para buscar assets, organizar pastas ou analisar algum arquivo?',
    ],
  ],
  [
    'ola tudo bem',
    [
      'Tudo ótimo por aqui, Mestre! 💜 E com você? Quer ajuda para buscar assets, organizar pastas ou analisar algum arquivo?',
    ],
  ],
  [
    'e ai',
    [
      'E aí, Mestre! 🚀 Pronto para colocar a biblioteca em ordem? Posso buscar assets, sugerir pastas ou fazer uma análise técnica.',
    ],
  ],
  [
    'eai',
    [
      'E aí, Mestre! 🚀 Pronto para colocar a biblioteca em ordem? Posso buscar assets, sugerir pastas ou fazer uma análise técnica.',
    ],
  ],
  [
    'eae',
    [
      'E aí, Mestre! 🚀 Pronto para colocar a biblioteca em ordem? Posso buscar assets, sugerir pastas ou fazer uma análise técnica.',
    ],
  ],
  [
    'salve',
    [
      'Salve, Mestre! 🚀 Quer que eu busque algum arquivo, organize suas pastas ou analise um asset selecionado?',
    ],
  ],
  [
    'fala nautia',
    [
      'Fala, Mestre! 💜 Estou pronta por aqui. Quer buscar assets, organizar etiquetas ou rodar uma análise?',
    ],
  ],
]);

const GENERIC_GREETINGS_VARIATIONS: readonly string[] = [
  'Olá, Mestre! 🚀 Posso te ajudar a buscar assets, organizar pastas ou analisar algum arquivo hoje?',
  'Oi, Mestre! 💜 O que vamos fazer na sua biblioteca agora — pesquisar arquivos, criar pastas ou checar compatibilidade?',
  'Olá, Mestre! ✨ Se quiser encontrar um projeto, aplicar etiquetas ou rodar um diagnóstico técnico, é só pedir. Por onde começamos?',
  'Oi, Mestre! 🚀 Estou por aqui no Convés. Como posso ajudar você agora?',
];

const GREETINGS_EXACT = new Set([
  'oi',
  'oie',
  'oii',
  'oiii',
  'ola',
  'ola nautia',
  'oi nautia',
  'ei nautia',
  'hello',
  'hi',
  'hey',
  'bom dia',
  'boa tarde',
  'boa noite',
  'e ai',
  'eai',
  'eae',
  'salve',
  'fala nautia',
  'tudo bem',
  'oi tudo bem',
  'ola tudo bem',
]);

const FAREWELLS_EXACT = new Set([
  'tchau',
  'xau',
  'ate mais',
  'ate logo',
  'ate breve',
  'flw',
  'falou',
  'bye',
  'fui',
  'ate amanha',
]);

export function normalizeQuickReplyInput(raw: string): string {
  return raw
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[!?.,;:~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchNautiaQuickReply(
  rawPrompt: string,
  options: { readonly hasPendingPlan?: boolean; readonly conversationStarted?:boolean } = {},
): QuickReplyMatch | null {
  if (options.hasPendingPlan || rawPrompt.trim().length === 0 || rawPrompt.length > 48) {
    return null;
  }

  const normalized = normalizeQuickReplyInput(rawPrompt);
  if (!normalized) return null;

  const tokens = normalized.split(' ');
  // Nunca intercepta confirmações ou termos operacionais (especialmente com plano pendente).
  if (
    options.hasPendingPlan &&
    tokens.some((token) => OPERATIONAL_OR_CONFIRMATION_WORDS.has(token))
  ) {
    return null;
  }
  if (tokens.some((token) => OPERATIONAL_OR_CONFIRMATION_WORDS.has(token))) {
    return null;
  }

  const thanksTone = THANKS_KEYS.get(normalized);
  if (thanksTone) {
    return { category: 'thanks', message: pickRotating(THANKS_VARIATIONS[thanksTone]) };
  }

  if(options.conversationStarted&&GREETINGS_EXACT.has(normalized))return {
    category:'greeting',
    message:pickRotating(['Oi de novo! 💜 Quer continuar de onde paramos?', 'Olá! Estou por aqui. Como posso ajudar agora?', 'Oi! Vamos continuar?']),
  };

  const specificGreeting = GREETING_SPECIFIC.get(normalized);
  if (specificGreeting) {
    return { category: 'greeting', message: pickRotating(specificGreeting) };
  }

  if (GREETINGS_EXACT.has(normalized)) {
    return {
      category: 'greeting',
      message: pickRotating(GENERIC_GREETINGS_VARIATIONS),
    };
  }

  if (FAREWELLS_EXACT.has(normalized)) {
    return {
      category: 'farewell',
      message: 'Até mais, Mestre! Se precisar organizar ou analisar algum asset depois, é só chamar. ✨',
    };
  }

  return null;
}
