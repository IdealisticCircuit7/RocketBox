# NautIA LLM Foundation — 0.1

Módulo de personalidade, contexto e interpretação da NautIA da OCSIS, integrado ao RocketBox existente. Usa um modelo local; não treina uma rede neural do zero e não guarda pesos neste diretório.

## Instalação validada

Nesta máquina foram encontrados o Ollama **0.40.16** e a base local **`qwen3.5:4b`**. O perfil **`nautia:0.1`** foi criado reutilizando as camadas já instaladas, sem baixar modelos. Configuração em `config/model.config.json`:

| Item | Valor inicial |
| --- | --- |
| Endpoint | `http://127.0.0.1:11434` |
| Base / perfil | `qwen3.5:4b` / `nautia:0.1` |
| Temperatura / contexto | `0.4` / `8192` tokens |
| Limite de resposta | `768` tokens |
| Modelo em memória após uso | `10m` (`keep_alive`) |
| Reconexão | Ao abrir, ao recuperar foco e a cada 30 segundos |

O perfil fica selecionado e a conversa ativa é recuperada ao reabrir o RocketBox. Não é necessário clicar em Testar conexão a cada inicialização. Na aplicação Tauri, se o serviço não responder, um comando nativo fixo tenta iniciar o **Ollama já instalado**, com `ollama serve`, somente na porta local 11434 e sem janela de terminal. Não altera a inicialização do Windows. Outros endpoints locais devem ter seu serviço iniciado pelo usuário.

O modelo pode sair da RAM/VRAM após inatividade e ser carregado na próxima mensagem; manter a função habilitada não exige ocupar memória gráfica indefinidamente. Serviço e modelo ausentes são apresentados como indisponibilidade real, com novas tentativas automáticas e ações rápidas determinísticas disponíveis.

## Preparação em outra máquina

Dependências: Node.js compatível com o projeto, Ollama instalado, modelo base local e, para o aplicativo desktop, a cadeia Tauri/Rust já usada pelo RocketBox. Os scripts não instalam dependências nem baixam modelos.

Na raiz do projeto:

```powershell
npm run nautia:setup -- -CheckOnly
```

Se faltar o Ollama, instale-o pelo distribuidor oficial. Se faltar a base e você decidir baixá-la, execute manualmente `ollama pull qwen3.5:4b`. Abra o Ollama ou execute `ollama serve` antes da preparação. O script lista apenas entradas locais e interrompe a criação se a base estiver ausente.

```powershell
npm run nautia:setup -- -Create -Test
```

Após validar as dependências, o script gera o Modelfile e executa o equivalente a:

```powershell
ollama create nautia:0.1 -f ai/Nautia_llm/Modelfile
ollama run nautia:0.1 "Oi, NautIA! Vamos pensar em como organizar meus projetos?"
```

Sem `-Create`, a preparação pergunta se deve criar/atualizar o perfil. `-Test` também faz uma chamada real ao modelo. Não execute preparações concorrentes com conversas/avaliações se quiser medir latência sem disputa pelo modelo.

## Arquitetura e responsabilidades

| Arquivo | Responsabilidade |
| --- | --- |
| `config/model.config.json` | Base, perfil, geração e limites de contexto |
| `prompts/identity.md` | Identidade e personalidade OCSIS/NautIA |
| `prompts/conversation.md` | Continuidade, perguntas, grounding e aprovação |
| `prompts/intent.md` | Instruções do modo opcional de classificação |
| `schemas/intent.schema.json` | Estrutura validável de intenções e entidades |
| `runtime/foundation.ts` | Montagem das instruções, memória limitada e validação |
| `runtime/promptBundle.json` | Cópia gerada dos prompts para browser e Node |
| `Modelfile` | Perfil Ollama gerado a partir da configuração e dos prompts |
| `scripts/prepare.mjs` | Geração idempotente; não inicia nem baixa modelos |
| `scripts/setup.ps1` | Verificação, criação oferecida e smoke de geração |
| `scripts/evaluate.mjs` | Avaliação real das intenções, sem executar ações |
| `evaluations/conversation-cases.json` | 32 casos e expectativas explícitas |

Não foi criado um segundo cliente de rede. `src/services/ollamaClient.ts` mantém streaming NDJSON e usa o transporte HTTP nativo `src-tauri/src/ollama.rs` via Channel no desktop. `nautiaConnectionService.ts` concentra descoberta/reconexão. `ollamaConversation.ts` usa os prompts compartilhados e o Tool System existente. `nautiaIntentService.ts` oferece classificação JSON separada: a conversa normal continua em linguagem natural, sem obrigar cada resposta a ser um objeto JSON.

O fluxo de ferramentas continua: LLM propõe → whitelist e parâmetros são validados → consultas usam serviços oficiais → resultados reais voltam ao modelo. Alterações produzem um plano que requer aprovação na interface. Uma frase de confirmação na conversa não executa o plano. Não há ferramenta de shell, SQL arbitrário ou alteração de arquivos físicos.

Uma verificação limitada de texto identifica afirmações de operação sem evidência e pede uma correção ao modelo; se ele insistir, apresenta a falha em vez de sucesso. Essa proteção não autoriza nem escolhe ferramentas por palavras-chave e não elimina todas as possíveis alucinações.

As consultas existentes foram ampliadas para localizar pastas pelo nome e retornar sua hierarquia virtual, e para pesquisar assets por formato, categoria, projeto, intervalo de registro e escopo da biblioteca. Elas trabalham com **registros da biblioteca**, não com uma varredura irrestrita do disco.

## Memória administrada pelo RocketBox

- Reutiliza `ocsis.nautia.conversations.v1` e seu limite existente de 20 conversas salvas. A chave `ocsis.nautia.active-conversation.v1` identifica qual retomar, inclusive uma nova conversa intencionalmente vazia.
- A configuração permanece em `ocsis.nautia.ollama.v1`. A migração habilita o perfil na primeira execução desta fundação; escolhas explícitas posteriores, inclusive desativação, são respeitadas.
- Envia até 14 turnos recentes, limitados a 8.500 caracteres, e até 1.600 caracteres de trechos **literais** de mensagens antigas do usuário. Não apresenta suposições como resumos verificados.
- Preserva referências de resultados reais anteriores, incluindo IDs, para resolver continuações; esses resultados são marcados como possivelmente desatualizados e precisam de revalidação antes de alterar dados.
- Contexto do Convés é obtido pelo serviço existente, sem inventar seleção. Resultados enviados são reduzidos e omitem caminhos físicos e evidências completas. Não envia bytes de assets ou dados a serviços externos.

Isso é contexto de conversa, não treinamento contínuo, memória ilimitada ou busca automática em todas as conversas anteriores. Nova conversa inicia outro contexto. A primeira preferência de uma conversa muito longa pode deixar de caber no resumo extrativo; uma memória explícita de preferências é uma melhoria futura.

## Uso e edição

Inicie normalmente com `npx tauri dev`. Em NautIA → Configurar NautIA continuam disponíveis endpoint, modelos instalados e teste manual. O indicador conectado só aparece após uma consulta recente bem-sucedida e a confirmação de que o modelo está instalado. Sem conexão, o envio informa a falha; não transforma uma conversa casual em uma resposta artificial do interpretador por palavras-chave.

Para mudar o comportamento, edite os Markdown em `prompts/`, execute `npm run nautia:prepare` e recrie o perfil com o script de preparação. `npm run dev` e `npm run build` também atualizam o bundle antes de executar. Para trocar a base, altere `baseModel` na configuração, garanta que ela esteja instalada e teste novamente seu suporte a português, JSON e ferramentas. Modelos alternativos instalados podem ser selecionados na interface. Não há promessa de equivalência entre modelos.

O executável desktop verificado nesta entrega foi `src-tauri/target/debug/rocket-box.exe`, gerado pelo Cargo e aberto diretamente. Em modo de desenvolvimento, ele usa o servidor Vite do projeto na porta 1420. Esta entrega não atualiza um instalador ou outra cópia antiga do RocketBox fora desse caminho.

## Testes e avaliações

```powershell
npm test
npm run build
cargo build --manifest-path src-tauri/Cargo.toml --offline
cargo test --manifest-path src-tauri/Cargo.toml --lib --offline
npm run nautia:evaluate
```

As avaliações de compreensão precisam do serviço e do perfil instalados. Usam geração real com schema, temperatura zero e limite de 90 segundos por caso; comparam intenção, entidades esperadas, referências, necessidade de esclarecimento e ferramenta proposta. Classificação não chama o Tool System: cada caso registra `actionsExecuted: 0`. Isso não substitui os testes de permissões e confirmação do Tool System, incluídos em `npm test`.

`evaluations/results-initial.json` conserva a rodada inicial (14/32). `evaluations/results.json` contém a rodada mais recente. O relatório em `evaluations/README.md` registra as falhas e verificações desktop. Casos são uma amostra de regressão, não um certificado de inteligência geral ou resistência completa a prompt injection. Para testar outro modelo instalado: defina `NAUTIA_EVAL_MODEL`; `NAUTIA_EVAL_OUTPUT` permite preservar um arquivo alternativo relativo a `scripts/`.

A segunda rodada aprovou **22/32** casos; os dez restantes estão descritos no relatório, sem alterar expectativas para escondê-los. A suíte do aplicativo passou em **95 testes**, além de **2 testes Rust**, builds frontend/Rust e verificação de conversa, retomada e consulta oficial na janela desktop.

## Arquivos de integração criados e modificados

Além dos arquivos deste diretório, foram criados `src/services/nautiaFoundation.ts`, `src/services/nautiaConnectionService.ts`, `src/services/nautiaIntentService.ts` e `tests/nautia-foundation.test.js`.

Foram modificados:

- `src/services/ollamaClient.ts`: opções de geração compartilhadas, contexto e saída estruturada opcional.
- `src/services/ollamaConversation.ts`: instruções, memória, validação de evidência e schemas das ferramentas existentes.
- `src/services/nautiaToolSystem.ts`: filtros de pesquisa e hierarquia das pastas pelos serviços oficiais.
- `src/services/nautiaConversationStore.ts`: identificação/restauração da conversa ativa e estado real da conexão.
- `src/components/nautia/NautiaModuleView.tsx`: inicialização, reconexão, persistência e tratamento honesto de indisponibilidade.
- `src/components/nautia/NautiaChatThread.tsx`: identificação da resposta como “NautIA · local”, preservando o componente visual.
- `src-tauri/src/ollama.rs` e `src-tauri/src/lib.rs`: comando fixo de início do Ollama instalado e seu registro Tauri.
- `package.json`: preparação, criação e avaliações; geração antes de dev/build, sem dependências novas.
- `tests/ollama.test.js`: padrão de modelo e regressão contra afirmações sem evidência.
- `docs/nautia-ollama.md`: referência à configuração e validação atuais, preservando o relatório da Etapa 08.

Os builds também regeneraram os artefatos em `dist/` e `src-tauri/target/`. Pesos do modelo permanecem sob administração do Ollama, fora do projeto.

## Limitações e próximos passos

O modelo 4B pode confundir intenções, omitir entidades ou produzir texto incorreto. A validação rejeita classificações inválidas, e permissões/aprovação são independentes da qualidade do modelo. A classificação opcional não concede autorização para ações.

Inferência depende do hardware e de outras requisições locais; conversas longas e ferramentas podem demorar. Streaming e cancelamento permanecem disponíveis. O transporte mantém os limites existentes de tempo, tamanho e chamadas.

Prioridades seguintes: memória explícita e revisável de preferências de organização; ampliar avaliações independentes de conversas completas e ferramentas; testar outros modelos locais na mesma suíte; medir latência sem concorrência; reduzir ambiguidades restantes antes de automatizar planos com múltiplas etapas.
