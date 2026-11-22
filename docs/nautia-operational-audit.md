# Auditoria operacional da NautIA — 18/11/2026

## Evidência anterior às alterações desta tarefa

Baseline: 210 testes aprovados. Não há histórico Git neste diretório; portanto não é possível atribuir toda limitação a uma regressão de versão. Os testes `etapa-nautia-ops-restore` já cobrem movimentação de pastas e lixeira: essas capacidades existem, mas seus testes usam chamadas de ferramentas predeterminadas, não comprovam a interpretação de qualquer frase por um modelo local.

Fluxo: `NautiaModuleView` → `ollamaConversation` → `nautiaIntentService` → planejamento privado pelo modelo → `nautiaToolSystem` → plano → confirmação na interface → `executeApprovedActionPlan` → `libraryOperationsService` → `workspace-store`. Histórico: `operationHistoryService`. O motor técnico é chamado por `queryDiagnostics`. A comunicação Ollama usa `ollamaClient` e o transporte Tauri; o modelo não acessa diretamente banco ou disco.

| Capacidade | Estado inicial verificado | Lacuna |
|---|---|---|
| Pesquisa por nome/formato/categoria/projeto/data | Funcional no serviço; parcial na conversa | Depende da chamada escolhida pelo modelo |
| Pesquisa por etiqueta | Desconectada na ferramenta | `searchAssets` não recebe etiquetas |
| Detalhes, contexto, pastas, catálogo de etiquetas | Funcionais | Respostas dependem de resultados reais |
| Etiquetar/remover etiquetas de assets | Parcial | Sem resolução determinística por nome; sem pré-consulta de etiquetas; criação implícita pelo serviço não aparece claramente no plano |
| Mover asset/pasta | Funcional no serviço e testes de planos | Interpretação depende do modelo; ciclos validados |
| Renomear/editar registro, categoria, renomear pasta | Desconectada na NautIA | Serviços oficiais existem, ferramentas públicas ausentes |
| Criar pasta | Funcional | Exige etiqueta; não deve inventar uma |
| Enviar à lixeira/restaurar | Funcional por IDs | Falta ferramenta de consulta da lixeira para descobrir IDs apagados |
| Exclusão permanente | Fora do contrato da NautIA | Não expor |
| Diagnósticos técnicos | Funcional | Não equivale a compatibilidade total |
| Confirmação, cancelamento, troca de conversa | Funcionais nos testes | Plano de execução com falha volta a `pending`; pode permitir tentativa repetida após execução parcial |
| Conversação e respostas rápidas | Funcionais com limites | Respostas rápidas só interceptam frases exatas; não foi encontrada interceptação de comandos compostos |
| Abortos | Tratamento parcial | UI tem limite de 180 s; transporte preserva TimeoutError, mas descarta outras razões; diagnóstico insuficiente para atribuir o relato a uma única causa |

## Plano incremental

1. Conectar as ferramentas ausentes aos serviços existentes, sem ampliar permissões ou tocar arquivos físicos.
2. Resolver etiquetas e assets por nomes reais, bloquear ambiguidades e apresentar criação de etiquetas no plano antes da gravação.
3. Melhorar evidências e descrições dos planos; impedir repetição de plano falho; distinguir causas de interrupção sem tentativas automáticas.
4. Testar com armazenamento isolado, incluindo recarga, falhas de persistência, confirmação e cancelamento. Documentar capacidades reais e limites.

O avatar, seus controladores, PNGs, modelo configurado e visual permanecem fora do escopo das alterações.

## Resultado e evidências posteriores

Foi reproduzida uma falha operacional com o modelo real `nautia:0.1`: após etiquetar Lucy numa biblioteca isolada, “Mova Lucy para a pasta Favoritos” terminou em resposta textual sobre sua etiqueta Favorito, sem plano de movimentação, após aproximadamente 132 s. Isso confirma uma falha do fluxo de planejamento atual; sem versões anteriores não é possível afirmar em qual atualização ela surgiu.

A correção introduz resolução determinística de nomes/destinos depois da interpretação tipada e antes do planejador generativo. A repetição com o mesmo modelo preparou corretamente as etiquetas e três variantes de movimentação (mova/coloque/passe), em aproximadamente 41–47 s por pedido. Somente a associação de etiquetas foi executada, em memória isolada; os planos de movimentação não foram confirmados. Logs locais: `.qa/nautia-live-before-record-resolution.log` e `.qa/nautia-live-operations.log`. Nenhuma dessas execuções leu arquivos físicos de assets.

| Capacidade | Estado após a tarefa |
|---|---|
| Pesquisa por nome, formato, categoria, projeto e etiquetas | Ferramentas conectadas aos filtros oficiais; interpretação de frases continua dependente do modelo |
| Etiquetas por nome de asset / múltiplos assets | Resolução exata normalizada; plano aditivo; nomes ambíguos bloqueados; criação ausente exibida antes de confirmar |
| Movimentação por nomes de assets/pastas | Resolução de origem e destino reais; conflito/ciclo bloqueados; fallback privado para entidades insuficientes |
| Edição de nome/projeto/categoria e renomeação de pasta | Novas ferramentas conectadas aos serviços já existentes; testes de preparação/execução aprovados |
| Lixeira/restauração | Consulta pública da lixeira adicionada; resolução de registros apagados; exclusão permanente não exposta |
| Confirmação e concorrência | Plano ligado à solicitação; revisões de registros/destinos revalidadas; execução tentada não se repete; UI encerra plano falho |
| Abortos e diagnóstico | Razões preservadas; limites explícitos por chamada no cliente; mensagens claras; falhas instrumentadas nos diagnósticos, sem retentativa automática |
| Interface | Avisos no cartão compacto, descrições com recursos/origem/destino, status de consulta, nomes das novas ferramentas e diagnóstico de falhas; layout/avatares preservados |

### Arquivos alterados

- Camada de serviços: `src/services/nautiaToolSystem.ts`, `nautiaOrchestratorService.ts`, `ollamaConversation.ts`, `ollamaClient.ts`, `nautiaIntentService.ts`, `nautiaPerformance.ts`, `nautiaRequestSession.ts`.
- Novos resolvedores/diagnóstico: `src/services/nautiaTagResolution.ts`, `nautiaRecordResolution.ts`, `nautiaFailure.ts`.
- Interface existente: `src/components/nautia/NautiaModuleView.tsx`, `NautiaChatThread.tsx`, `NautiaTurnCards.tsx`, `NautiaToolResults.tsx`.
- Contrato/prompts: `ai/Nautia_llm/schemas/intent.schema.json`, `runtime/foundation.ts`, `prompts/intent.md` e saídas geradas `runtime/promptBundle.json`/`Modelfile` pelo preparador existente.
- Testes: novo `tests/nautia-operational-audit.test.js`, adaptação de `tests/nautia-conversation-flow.test.js` para mensagens sem erro técnico bruto, e `tests/helpers/nautia-module-harness.js` usando o classificador real de falhas.
- Documentação: este relatório e `NAUTIA_CAPABILITIES.md`.

### Validação

- `npm test`: 220 testes aprovados; logs em `.qa/nautia-operational-tests.log`.
- TypeScript e build de produção aprovados (`npm run build`); aviso existente de chunks acima de 500 kB. Log `.qa/nautia-operational-build.log`.
- Janela desktop aberta pelo executável absoluto `src-tauri/target/debug/rocket-box.exe`, usando o frontend atual em `http://127.0.0.1:1420/`. Conferidos avatar, controles por ícones e contexto real sem seleção. Não houve recompilação Rust nesta tarefa: nenhuma fonte Rust foi modificada e não foi produzido novo instalador.
- Não se confirmou uma alteração em registros reais pela janela. As gravações, exclusões lógicas, restaurações, falhas e recargas foram verificadas no armazenamento isolado dos testes. Os testes existentes do componente React continuam cobrindo cancelamento, troca de conversa, respostas tardias e planos antigos.

### Limitações e trabalho restante

O tempo de interpretação do modelo local ainda é perceptível. Não se validou toda formulação possível, toda edição por linguagem natural ou todas as operações pela interface desktop. As ferramentas de edição foram validadas no serviço e nos planos; o teste vivo da LLM cobriu etiquetas e três formas de movimentação. Falhas antigas de cancelamento não podem ser atribuídas retroativamente sem logs.

Planos legados com vários passos ainda podem concluir parcialmente: a correção informa a falha e impede repetir o mesmo plano, mas não introduz transação global ou rollback fictício. Novos registros de assets e remoção dedicada de etiquetas de pasta pela conversa continuam sem ferramenta específica. O undo mantém os limites existentes do serviço. Nenhuma Central de Ajuda implementada foi encontrada; as capacidades estão documentadas no arquivo solicitado.
