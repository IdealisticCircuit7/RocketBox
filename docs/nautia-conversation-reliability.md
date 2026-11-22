# NautIA — Conversas, contexto e interface

Aplicação do prompt de correção, mantendo o fundo estático solicitado posteriormente. O laboratório e os PNGs do avatar foram preservados.

## 1. Causas identificadas

O fluxo anterior publicava o texto de cada rodada do Ollama como resposta provisória. Uma rodada podia terminar em chamada de ferramenta ou acionar a revisão de afirmações sem evidência; a próxima rodada apagava e substituía o texto já exibido. Isso permite reproduzir respostas que parecem se cancelar ou mudar de assunto dentro da mesma solicitação.

O histórico também acrescentava resultados antigos de ferramentas diretamente ao conteúdo das mensagens da assistente. Trechos antigos do usuário entravam como uma nova mensagem de usuário resumida. Resoluções de planos e cancelamentos não eram separadas de forma suficiente para construir a memória. Essa combinação favorecia a retomada indevida de tarefas antigas pelo modelo.

Havia proteção contra envios simultâneos no componente, mas os IDs existentes protegiam principalmente o avatar. Os callbacks globais de texto, tratamento de erro e finalização não tinham a mesma identidade completa de conversa/mensagem/geração. Não foi encontrado um efeito React responsável, por si só, por iniciar duas gerações da mesma mensagem. Sem um rastreamento da execução antiga, não é possível afirmar qual rodada produziu cada uma das três respostas relatadas; os mecanismos que permitiam a substituição foram identificados e removidos.

Nos painéis, a escolha Ferramentas/Contexto mudava a ordem dos cartões, mas ambos continuavam presentes. O botão ativo também não fechava seu próprio painel.

A validação desktop revelou dois problemas adicionais: o modelo podia prometer uma busca sem chamar a ferramenta, e interpretava “Convés” como o nome de uma pasta para pesquisar. A interpretação agora distingue o nome da biblioteca de uma entidade de pasta; consultas simples com parâmetros já conhecidos são executadas diretamente pelos serviços oficiais.

## 2. Identidade e ciclo das solicitações

Cada envio aceito recebe `requestId`, `conversationId`, `userMessageId` e `assistantMessageId`, além do AbortController exclusivo. A posse é verificada antes de publicar conteúdo, atualizar o avatar, registrar uma conclusão ou limpar o estado de processamento.

- Um segundo envio simultâneo não cria outra geração para a mesma mensagem.
- Cancelar invalida a identidade antes de abortar o transporte e preserva uma resposta marcada como cancelada na origem. Texto parcial já publicado pode ser mantido com esse rótulo.
- Uma nova solicitação pode começar imediatamente após o cancelamento. Chunks, exceções e blocos `finally` antigos não afetam a nova geração.
- Trocar de conversa ou iniciar outra cancela a geração em andamento e registra a interrupção na conversa correta.
- A resposta é inserida uma única vez, com vínculo à mensagem original. Uma conversa diferente não aceita essa inserção.
- Atualizações de conversa não executam mais outro setter React dentro do updater de estado.
- Falhas de resposta são mostradas como erro de solicitação; uma nova checagem de disponibilidade verifica o Ollama, evitando inferir indisponibilidade apenas por um erro de formato do modelo.

Planos carregam a origem completa. Confirmar ou revisar exige que a conversa, a mensagem e a solicitação ainda correspondam ao plano pendente. Uma nova pergunta encerra a pendência anterior. Planos confirmados, cancelados, antigos ou de outra conversa não são retomados automaticamente. A validação oficial antes de gravar e a confirmação adicional de lixeira foram mantidas.

## 3. Contexto e geração

Foi reutilizado o interpretador estruturado existente. Ele recebe a mensagem atual isolada como a última mensagem de usuário; conversa anterior e contexto aparecem como dados históricos identificados, em JSON. O schema distingue consultas, conversa, esclarecimento, organização, etiquetas, criação, lixeira e restauração.

Na memória conversacional:

- Trocas completas são mantidas dentro dos limites existentes; evita-se começar por uma resposta órfã.
- Trocas canceladas, incompletas ou com erro não viram novas instruções para o modelo. O histórico visual permanece salvo.
- Resultados anteriores são referências separadas, com identificação da solicitação quando disponível, e não texto factual anexado à fala da assistente.
- Planos históricos carregam indicação de resolução e não constituem autorização atual.
- Caminhos e dados técnicos extensos continuam reduzidos pelo sanitizador compartilhado. O helper foi extraído para evitar dependência circular entre interpretação e conversação.

O processamento tem etapas distintas:

1. Informações básicas confirmadas sobre RocketBox/NautIA podem ser respondidas localmente, sem modelo ou ferramentas. O reconhecimento dessas perguntas é restrito a FAQs completas; pedidos compostos seguem o fluxo normal.
2. A interpretação determina quais ferramentas podem ser usadas. Conversa geral e pedidos ambíguos não recebem ferramentas de alteração. Intenções de alteração só habilitam o tipo de ação proposto para aquele pedido, além das consultas necessárias.
3. Listagem/pesquisa simples de pastas, listagem de etiquetas e consulta do contexto, quando identificadas com parâmetros suficientes, usam diretamente o Tool System. Pedidos mais complexos podem usar a etapa interna de preparação de ferramentas existente.
4. Rascunhos internos não são exibidos como resposta. Resultados e planos têm vínculo com a solicitação atual.
5. Há uma única etapa final de texto visível, sem novas ferramentas ou reinícios silenciosos. A publicação é progressiva por cláusulas recebidas do streaming real. O pequeno buffer permite aplicar a verificação determinística já existente antes de exibir certas afirmações de operações.
6. Uma afirmação bloqueada produz aviso explícito, preservando o prefixo já publicado. Não há nova geração substituindo o que o usuário estava lendo. Promessas de uma pesquisa posterior ao término da resposta também são bloqueadas.

As APIs de conversa e o interpretador respeitam o endpoint/modelo configurados. Não houve download, treinamento ou recriação do modelo instalado.

## 4. Conhecimento oficial do aplicativo

`rocketBoxKnowledge.ts` centraliza nome, marca indicada, finalidade, capacidades e limites confirmados pela identidade e serviços existentes. A fonte identifica **RocketBox by OCSIS** e a marca **OCSIS**; não atribui autoria individual a partir de nomes em diretórios.

“Quem criou a RocketBox?” foi testada após o histórico antigo de exclusão e após um cancelamento. A resposta usa essa fonte local e não chama a LLM nem ferramentas de exclusão. Informações não confirmadas são declaradas como tal.

## 5. Interface

**Ferramentas** e **Contexto** são estados mutuamente exclusivos, com troca direta e fechamento ao clicar no botão ativo. Ferramentas mostra ações existentes; Contexto mostra pasta, seleção, projeto, coleção, filtros e metadados disponíveis. Nenhum dado técnico ausente é inventado.

A ação Criar Etiquetas deixou de disparar uma pesquisa de FBX sem etiquetas sob um nome incorreto. Agora prepara o campo de mensagem para o usuário informar a etiqueta; a aplicação continua passando pelos serviços e confirmação existentes.

O cabeçalho mantém título real da conversa, estado verificado da conexão, Nova conversa e Histórico. Configuração, modo compacto, diagnóstico do avatar e histórico de operações ficam no menu de opções. O diagnóstico permanece disponível e desligado/recolhido por padrão. Não foram adicionados números fictícios de FPS, GPU, CPU ou latência.

As respostas suportam um subconjunto seguro de Markdown: títulos, parágrafos, listas, destaque, código, citações, tabelas simples e links HTTP(S). HTML bruto é texto; links de script ou arquivo local não são transformados em links executáveis. Não há `dangerouslySetInnerHTML` nem nova dependência.

Resultados de ferramentas têm resumo expansível e nomes legíveis; JSON e parâmetros ficam em um nível técnico adicional. Pastas dos planos são resolvidas por nome quando o registro está disponível.

A rolagem usa posicionamento antes da pintura e acompanha alterações de tamanho quando está fixada no fim. Rolagem manual para mensagens anteriores interrompe esse acompanhamento. Um botão permite voltar ao fim. ResizeObserver é desconectado na desmontagem.

O avatar completo, a composição original, as poses, o balão e os estados permanecem. O fundo azul-marinho estático foi mantido conforme o pedido mais recente, que prevalece sobre o trecho do anexo pedindo efeitos holográficos. Em janelas pequenas, os controles ficam compactos e os painéis têm rolagem interna; o campo de mensagem fica acessível.

## 6. Validação

`npm test`: **200 testes aprovados, zero falhas**. O teste existente do servidor de desenvolvimento usa loopback e foi executado com esse acesso. `npm run build`: preparação local, TypeScript e Vite aprovados; permanece o aviso de chunks acima de 500 kB.

| Cenário | Validação automatizada | Verificação desktop |
|---|---|---|
| Autoria do RocketBox | Resposta local, zero chamadas e biblioteca intacta | Resposta OCSIS após histórico de exclusão |
| Assunto anterior | Memória segregada e planos antigos bloqueados | Nova pergunta não retomou a exclusão antiga |
| Cancelar e enviar outra mensagem | Chunks e finalização antiga forçados após a nova geração | Cancelamento seguido de pergunta distinta funcionou |
| Streaming longo | Publicação monotônica, planejamento privado e bloqueio sem regeneração | Uma resposta longa com títulos terminou como uma única mensagem |
| Ferramentas/Contexto | Renderização do componente real com conteúdos distintos e fechamento | Alternância direta e consulta de contexto real verificadas |
| Troca de conversa | Resposta só aceita na origem; interrupção antiga não afeta destino | Histórico trocado durante a geração; cancelamento salvo na origem |
| Consulta de pastas | Serviço oficial retorna registros sem escrita | DOW e Elite Maid Survival retornadas com evidência no cartão |
| Leitura/rolagem | Seguir o fim, respeitar leitura manual e retomar por ação do usuário | Conteúdo e campo acessíveis durante streaming e mudança de painéis |
| Preservação | Hashes dos 73 sprites e persistência acima de vinte conversas | Histórico anterior mantido; testes não executaram mutações da biblioteca |

Os testes do componente usam seu TSX real com transporte controlado para forçar corridas difíceis de reproduzir manualmente. Esses testes foram complementados pela aplicação Tauri e pelo Ollama local, não usados como substitutos da validação desktop.

Tamanhos inspecionados: cliente de aproximadamente **1280×800**, **896×800**, **640×800** e mínimo **640×480**. A janela de teste voltou ao tamanho original. O menu e o painel Contexto foram verificados sem cobrir o campo de mensagem. No tamanho mínimo, a área de leitura é reduzida e os painéis exigem rolagem interna.

Executável usado: `src-tauri/target/debug/rocket-box.exe`, janela de teste 1311966, frontend atualizado em `http://127.0.0.1:1420/`. O código Rust não mudou; não houve geração de instalador ou novo executável nativo. `dist/` contém o build atualizado do frontend.

Capturas: `.qa/branding/nautia-conversation-tools.jpg` e `.qa/branding/nautia-conversation-minimum.jpg`.

Uma conversa identificada como teste foi criada, e perguntas de verificação foram acrescentadas ao histórico existente. Mensagens antigas incorretas continuam preservadas; não foram reescritas nem apagadas. Nenhum asset físico foi modificado e nenhum plano de alteração foi confirmado pelos testes.

## 7. Arquivos

Modificados:

- `src/components/nautia/NautiaModuleView.tsx`
- `src/components/nautia/NautiaChatThread.tsx`
- `src/components/nautia/NautiaTurnCards.tsx`
- `src/components/nautia/NautiaActionPlan.tsx`
- `src/services/ollamaConversation.ts`
- `src/services/nautiaIntentService.ts`
- `src/services/nautiaConversationStore.ts`
- `src/services/nautiaOrchestratorService.ts` — somente metadados opcionais de origem do plano
- `ai/Nautia_llm/runtime/foundation.ts`
- `ai/Nautia_llm/prompts/intent.md`
- `ai/Nautia_llm/prompts/conversation.md`
- `ai/Nautia_llm/schemas/intent.schema.json`
- `ai/Nautia_llm/runtime/promptBundle.json` e `ai/Nautia_llm/Modelfile` — gerados pelas fontes editáveis
- `tests/ollama.test.js`, `tests/nautia-foundation.test.js`, `tests/nautia-conversational-2.test.js`

Adicionados:

- `src/services/nautiaRequestSession.ts`
- `src/services/nautiaConversationFlow.ts`
- `src/services/nautiaReplyStream.ts`
- `src/services/nautiaModelData.ts`
- `src/services/rocketBoxKnowledge.ts`
- `src/services/nautiaMarkdown.ts`
- `src/components/nautia/NautiaMarkdown.tsx`
- `src/components/nautia/NautiaToolResults.tsx`
- `src/components/nautia/nautiaConversation.css`
- `tests/helpers/nautia-module-harness.js`
- `tests/nautia-conversation-flow.test.js`
- Este relatório

A limpeza anterior do fundo está em `src/studio.css` e no teste de redesign correspondente. Não houve inclusão de bibliotecas, alteração dos PNGs ou reescrita dos serviços de organização.

## 8. Limitações restantes

- A interpretação de linguagem natural ainda depende da qualidade do modelo local. Consultas complexas podem precisar de esclarecimento; o aplicativo não promete execução futura para mascarar a falta de uma consulta.
- A classificação estruturada acrescenta uma chamada local antes da resposta; FAQs oficiais não precisam dela. A latência depende do hardware/modelo. O limite existente de 120 segundos por solicitação permanece.
- A verificação de afirmações é determinística e restrita aos padrões definidos, não uma garantia de veracidade semântica de toda a prosa de uma LLM. Resultados oficiais ficam disponíveis para conferência.
- O Markdown implementa os recursos comuns listados, não toda a especificação CommonMark ou extensões HTML.
- Não houve benchmark prolongado de memória/GPU, matriz de todos os monitores/DPI, execução integral do benchmark opcional de LLM nem validação de concorrência entre vários processos do aplicativo.
- A validação desktop utilizou o modo de desenvolvimento; instaladores e versões já instaladas precisam de um empacotamento posterior para incorporar o novo frontend.
