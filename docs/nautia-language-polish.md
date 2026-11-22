# NautIA — personalidade e linguagem

## Escopo e preservação

Polimento incremental, sem substituir a personagem. A orientação adicional do usuário foi manter respostas geradas e variadas, em vez de fixar uma apresentação para repetir. Portanto, a abertura continua generativa: saudação, NautIA/OCSIS, ajuda disponível, sugestões e pergunta convidativa.

O projeto não tinha uma saudação longa única e fixa: o Ollama a produz com base nas instruções e no contexto. Não foi congelado um dos exemplos como roteiro oficial. Foram preservados literalmente o bloco de saudações locais, a tela de boas-vindas e a instrução original de abertura. Os hashes anteriores e posteriores foram comparados; o bloco de saudações tem SHA-256 `2daa6a52587f11f2cfe74c967a9b32a5ebf561b553c5fb2a32592f2a187dd6bb`. As conversas armazenadas não foram reescritas.

## Inconsistências encontradas

1. O runtime instruía a NautIA a se apresentar ao receber qualquer saudação, sem distinguir uma conversa nova de uma retomada.
2. Duas instruções impunham oferecer ajuda ou fazer uma pergunta em toda resposta. Isso estimulava repetição e transformava agradecimentos simples em novos assuntos.
3. Todas as variantes locais de agradecimento terminavam oferecendo serviços ou perguntando o que fazer em seguida.
4. A regra geral de concisão não explicitava a exceção da apresentação inicial mais acolhedora.
5. As regras de linguagem não explicitavam a prioridade de um idioma solicitado pelo usuário nem a preservação de código e citações. Em uma amostra anterior, o pedido de explicação em inglês recebeu resposta em português.
6. O teste vivo revelou um problema de fundamentação: o modelo inventou cadastro por referência externa/ID. Não era um serviço existente. Faltavam os passos concretos do formulário nas informações oficiais fornecidas à conversa.

Os conectivos ingleses citados no pedido são exemplos a evitar; não foram apresentados como falhas reproduzidas em todas as respostas. Não foi instalada uma tabela de substituição de palavras.

## Ajustes

- `ai/Nautia_llm/prompts/persona.md` é a fonte editável das regras detalhadas de linguagem. `identity.md` mantém a identidade existente, sem alterações. O preparador inclui a persona no runtime e no Modelfile gerado.
- A persona é incluída uma vez no prompt conversacional e não é anexada ao classificador de intenção. Não foi criada uma etapa revisora ou uma nova chamada ao Ollama por resposta.
- `nautiaLanguageContext` distingue primeira saudação, conversa iniciada, agradecimento e despedida. A instrução original de abertura aplica-se somente à primeira saudação; nas seguintes, evita-se reapresentação. A orientação situacional entra na geração final, sem duplicação em outras etapas.
- A proatividade permanece, com sugestões relevantes e liberdade conversacional. A oferta/pergunta deixa de ser obrigatória em toda mensagem. Agradecimentos e despedidas podem encerrar a troca.
- As respostas locais de agradecimento ficaram mais leves e variadas. As saudações locais originais foram preservadas. Retomadas de conversa têm variantes próprias, sem repetir a apresentação.
- O modelo continua gerando as respostas enquanto Ollama está ativo, inclusive cumprimentos e agradecimentos. As variantes locais são apenas o caminho determinístico já existente quando o usuário usa esse modo; não são apresentadas como geração de uma LLM indisponível.
- Foram adicionadas ao contexto oficial as etapas verificadas de `RegisterAssetForm`: abrir Registrar Asset, escolher modalidade, selecionar arquivo/diretório local, revisar e confirmar. Não foram adicionadas operações ou permissões.
- A lista de ferramentas no prompt operacional foi atualizada para incluir os serviços de edição já existentes. Os resultados técnicos, a execução de ferramentas e as confirmações não foram reescritos.

## Comparação com o modelo local

Amostras de `nautia:0.1`, com a mesma temperatura de avaliação e sem consultar assets reais. Trechos abaixo são observações, não respostas fixas inseridas no aplicativo.

| Caso | Antes | Depois |
|---|---|---|
| Primeira saudação | “Oi! Aqui sou a NautIA, da OCSIS do RocketBox.” | “Olá! Eu sou a NautIA, assistente da OCSIS no RocketBox.” A amostra continuou com ajuda, sugestões e convite à interação. |
| Agradecimento | “Adoro receber um ‘obg’, é super legal.”, seguido de nova proposta e pergunta | A amostra final acolheu o agradecimento e encerrou com disponibilidade para ajudar, sem uma pergunta obrigatória. |
| Tutorial pedido em inglês | Resposta em português, incluindo referência por link/metadados | Resposta em inglês, organizada em cinco etapas do fluxo local; sem cadastro por links ou IDs externos. |
| Retomada da conversa | Novo convite para organizar, encontrar arquivos e explorar projetos | Retomada com referência à conversa em andamento, sem exigir uma apresentação completa da identidade. |

As primeiras amostras após a alteração ainda introduziram uma pergunta fora de contexto depois de “Obg”. Por isso foi acrescentada a orientação situacional específica de agradecimento à geração final. Não foi descartada uma resposta em produção nem feita uma segunda geração automática: as repetições ocorreram somente no teste de desenvolvimento.

No fluxo real, “Obg” e “Vlw” produziram textos diferentes, cada um com uma chamada LLM e nenhuma ferramenta. A resposta a “Vlw” ainda incluiu “Que bom que tudo vai bem!” e uma despedida não solicitada. A instrução de agradecimento foi então refinada para não presumir humor, tarefa resolvida ou despedida. Essa última orientação foi validada nos testes de contrato; não foi feita uma nova rodada viva para afirmar que o comportamento desapareceu em todos os casos.

Logs locais: `.qa/nautia-language-live.log` (comparação inicial), `.qa/nautia-language-live-final.log` (retomada, agradecimento e tutorial após fundamentação), `.qa/nautia-language-thanks-final.log` (ajuste final de agradecimento) e `.qa/nautia-language-variation.log` (duas mensagens seguidas no fluxo real).

## Validação

- Suíte completa: **251 testes aprovados**, incluindo 25 testes novos de linguagem/contratos. Build de produção aprovado; permanece o aviso anterior de chunks acima de 500 kB.
- Os 22 pedidos do anexo são exercitados nos testes de integração com transporte controlado: abertura, retomada, identidade, autoria, capacidades, conversa casual, explicações, operações, ambiguidade, português e inglês.
- Esses testes verificam instruções, chamadas, integridade dos resultados, Markdown/código e aprovação antes de gravar. Respostas controladas não provam qualidade linguística de um modelo: a avaliação do Ollama real descrita acima cobre uma amostra menor.
- Os testes de operações usam biblioteca isolada. As operações de etiquetar Jade, mover Lucy e preparar lixeira produzem planos sem alteração do armazenamento antes da confirmação.
- Nenhuma mensagem é submetida a substituições globais ou a um corretor adicional. O texto recebido continua pelo streaming e pelo renderizador existentes.
- Modelo, parâmetros de geração, controladores de animação, sprites, fluxo de confirmação e arquivos de assets não foram alterados. O arquivo Modelfile foi regenerado; o perfil instalado no Ollama não foi recriado e não houve download de modelo.

## Limites e acompanhamento

Variação natural não significa garantir uma formulação inédita em toda mensagem, nem variar fatos para evitar repetição. A geração continua probabilística e pode produzir frases pouco naturais. Não se promete eliminar todo erro gramatical ou factual com instruções de persona.

As medições das amostras variaram conforme tamanho da resposta e processamento local; não há alegação de ganho de velocidade. A mudança não acrescenta chamadas de revisão, mas as instruções de linguagem acrescentam contexto à geração conversacional. O classificador mantém o prompt anterior.

Próximas melhorias possíveis, preservando a identidade: ampliar o conjunto de avaliação com conversas reais autorizadas, acompanhar repetições em interações longas e ampliar instruções verificadas de uso dos recursos. Uma mudança de modelo ou uma saudação fixa dependeria de outra decisão; não foi feita nesta etapa.

## Arquivos

- Novo: `ai/Nautia_llm/prompts/persona.md`.
- Novos: `src/services/nautiaLanguageContext.ts`, `tests/nautia-language.test.js`.
- Integração: `src/services/ollamaConversation.ts`, `nautiaQuickReplies.ts`, `rocketBoxKnowledge.ts`, `src/components/nautia/NautiaModuleView.tsx`.
- Prompts/preparo: `ai/Nautia_llm/prompts/conversation.md`, `scripts/prepare.mjs`, `runtime/foundation.ts`, `runtime/promptBundle.json`, `Modelfile`.
- Testes adaptados: `tests/etapa-nautia-perf-redesign.test.js`, `tests/helpers/nautia-module-harness.js`.

## Correção de relevância temporal — 18/11/2026

A data local era enviada em todas as conversas. O novo `src/services/nautiaTemporalContext.ts` retira a referência de cumprimentos e conversas comuns, sem outra chamada ao modelo. Perguntas explícitas sobre data/horário recebem a referência do relógio local na geração final, com orientação para responder somente ao pedido. As operações conservam sua referência anterior de data para filtros relativos e planejamento.

A persona passou a orientar explicitamente a abertura aprovada em três linhas, mantendo acolhimento e sugestões, sem linha adicional de data ou estado do sistema. Os textos existentes de saudação, a tela de boas-vindas e a instrução original de abertura foram preservados. Não há reformatação automática da resposta; a quebra visual depende da largura da janela.

Validação no Ollama real, em biblioteca vazia de teste: “Oi” produziu três linhas não vazias, sem data; a pergunta direta recebeu a data correspondente ao relógio local; depois dela, “Olá NautIA” e “Obg” não repetiram a data. Uma primeira resposta sobre a data ainda ofereceu organizar assets; a orientação temporal foi então movida para o contexto final dessa pergunta e reforçada para evitar ofertas fora de contexto. Logs: `.qa/nautia-context-live.log` e `.qa/nautia-context-date-final.log`.

Suíte completa após a alteração: 263 testes aprovados. Os novos testes cobrem cumprimentos, conversas comuns, datas, horários, preservação da referência para operações, ausência de revisão adicional e streaming sem reescrita. Não houve alteração de ferramentas, confirmações, animações ou arquivos físicos de assets.
