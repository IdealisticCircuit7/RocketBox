# NautIA — capacidades operacionais

Atualizado em 18/11/2026. Auditoria inicial: [docs/nautia-operational-audit.md](docs/nautia-operational-audit.md).

## Contrato de execução

O Ollama interpreta a mensagem atual e retorna intenção/entidades tipadas. `nautiaTagResolution` e `nautiaRecordResolution` resolvem nomes nos registros atuais, sem executar alterações. Quando a interpretação contém nomes suficientes, a preparação não depende de uma segunda resposta generativa. Outros pedidos continuam usando o planejador privado com ferramentas limitadas por intenção.

`nautiaToolSystem` valida parâmetros, referências e permissões. Consultas retornam dados; alterações retornam planos. Somente o botão de confirmação associado à solicitação atual chama `executeApprovedActionPlan`. Uma nova pergunta, troca de conversa ou cancelamento encerra o plano anterior. “Sim” ou “ok” não substituem o botão de confirmação.

Os serviços oficiais continuam responsáveis por persistência, regras da biblioteca e histórico. Nada nesta integração move, renomeia ou exclui arquivos físicos. O modelo não recebe comandos de sistema, SQL ou acesso direto ao disco. Caminhos físicos e dados técnicos volumosos são removidos do contexto enviado ao modelo pelo minimizador existente.

## Ferramentas públicas

IDs precisam existir no catálogo atual; não são gerados pelo modelo. Listas possuem limite de 100 itens na validação. As permissões existentes são `read`, `analyze` e `mutate`; não foram ampliadas.

| Ferramenta | Parâmetros | Resultado / confirmação |
|---|---|---|
| `searchAssets` | `query?`, `category?`, `format?`, `project?`, `dateFrom?`, `dateTo?`, `scope?:current/library`, `labels?:string[]` | Assets/pastas pelos filtros oficiais; etiquetas combinadas com ALL; sem confirmação |
| `getAssetDetails` | `assetId` | Metadados registrados; sem confirmação |
| `listFolders` | `query?`, `parentId?:string/null` | Pastas ativas com caminho virtual; sem confirmação |
| `listTags` | `{}` | Catálogos independentes de assets e pastas; sem confirmação |
| `getCurrentContext` | `{}` | Pasta, seleção, projeto e filtros reais; sem confirmação |
| `listTrash` | `{}` | Assets/pastas apagados logicamente, para localizar IDs restauráveis; sem confirmação |
| `getAnalysisResult` | `assetId` | Relatório existente e validade conhecida; sem confirmação |
| `analyzeAsset` | `assetIds`, `targetEngine?` | Motor determinístico; persiste relatório, exige permissão `analyze`, sem plano de alteração da biblioteca |
| `createFolder` | `name`, `parent:string/null`, `existingTagId` ou `newTag:{label,icon?,accent?}` | Plano; exige confirmação; etiqueta obrigatória |
| `assignTags` | `scope:asset-tag`, `assetIds`, `labels` | Plano de associação aditiva; exige confirmação; criação de etiquetas ausentes aparece explicitamente nos avisos |
| `assignTags` | `scope:folder-tag`, `folderIds`, `tagIds`, `mode?:add/toggle` | Plano no catálogo de pastas; exige confirmação |
| `removeTags` | `assetIds`, `labels` | Plano que remove somente as etiquetas pedidas; exige confirmação |
| `moveAssetRecord` | `assetIds`, `targetFolderId:string/null` | Plano de vínculos virtuais; exige confirmação; conflitos de nomes bloqueiam preparação |
| `moveFolder` | `folderId`, `targetFolderId:string/null` | Plano de hierarquia virtual; exige confirmação; ciclos e colisões bloqueados |
| `updateAssetRecord` | `assetId`, `name?`, `project?` | Plano para nome/projeto; exige confirmação; pelo menos um campo; caminho físico preservado |
| `updateAssetCategory` | `assetId`, `category` | Plano; exige confirmação; não comprova propriedades técnicas |
| `renameFolder` | `folderId`, `name` | Plano de nome virtual; exige confirmação |
| `moveToTrash` | `refs:{type:asset/folder,id}[]` | Plano de exclusão lógica; revisão/aceite explícito na interface |
| `restoreRecord` | `refs:{type:asset/folder,id}[]` | Plano de restauração pelo serviço oficial; exige confirmação |

`createTag` existe como passo interno legado de planos, não como ferramenta pública independente do modelo. Para assets, `assignTags` já cria etiquetas ausentes atomicamente na mesma transação de associação. Não foi duplicado esse mecanismo.

## Etiquetas e nomes

- “Coloque as etiquetas Personagem e Favorito na Lucy.” Busca Lucy pelo nome exato normalizado, consulta o catálogo, preserva etiquetas atuais e prepara um plano.
- “Adicione Favorito à Lucy e Jade.” Resolve todos os nomes antes de preparar qualquer alteração.
- “Remova Personagem da Lucy.” Remove apenas a associação solicitada, após confirmação.
- “Aplique Favorito nos selecionados.” Usa somente a seleção real. Sem seleção, pergunta qual recurso deve ser alterado.
- Nomes repetidos exigem esclarecimento; não se escolhe automaticamente o primeiro resultado. Para homônimos, selecione no Convés e peça a ação nos selecionados.
- Etiquetas contendo vírgulas ou a palavra “e” são preservadas quando retornadas como array JSON de strings pelo classificador; um nome completo já existente no catálogo tem prioridade sobre separação textual.
- Repetir uma associação já existente retorna “nenhuma alteração necessária”. Não duplica nem substitui etiquetas.
- Etiquetas de pasta não são copiadas para assets e vice-versa.

## Organização e contexto

“Mova Lucy para Favoritos”, “Coloque Lucy em Favoritos” e “Passe Lucy para Favoritos” são interpretações de movimentação virtual. O destino é resolvido no catálogo de pastas, mesmo quando também existe uma etiqueta chamada Favorito/Favoritos. Destinos ausentes ou ambíguos não são criados nem escolhidos silenciosamente.

O schema de intenção mantém os oito campos de entidades existentes e aceita quatro campos opcionais: `sourceFolderName`, `targetFolderName`, `newName`, `newCategory`. Campos desconhecidos e tipos inválidos continuam rejeitados. Exemplos adicionais: “Renomeie Lucy para Lucy final”, “Mude a categoria da Lucy para Personagem”, “Liste os registros da lixeira”, “Restaure Lucy”. A interpretação semântica continua dependendo da capacidade do modelo local.

## Planos, erros e histórico

Planos mostram nomes reais, origem, destino e alterações, com parâmetros técnicos recolhíveis. Avisos de criação de etiquetas também aparecem no cartão compacto, antes do botão Confirmar. Os registros envolvidos e destinos são comparados com as revisões observadas na preparação; alterações concorrentes exigem um novo plano.

Cada plano que iniciou execução é consumido na instância do serviço, inclusive em caso de falha. A UI também encerra o plano após uma execução falha. Não há repetição automática. Planos legados com vários passos não são uma transação global: em falha parcial, o resultado informa quantos passos foram concluídos, atualiza a biblioteca e registra falha no histórico. Consulte o estado atual antes de preparar outro plano.

O Histórico de Atividades existente mantém a ação Desfazer quando o serviço fornece um descritor de reversão. Não foi criado um mecanismo paralelo de undo. Edição de nome/projeto de asset e categoria não oferecem undo no serviço atual; restauração também segue as limitações do serviço oficial.

Estados de geração exibem interpretação, localização/validação, consulta e preparação; streaming exibe a resposta. Planos aguardam confirmação e os resultados de execução indicam conclusão ou falha. A chamada de gravação atual é síncrona: não há uma animação artificial de execução prolongada.

Interrupções distinguem cancelamento pelo usuário, troca de conversa, desmontagem, tempo limite e interrupção inesperada de streaming. As métricas locais existentes registram `failureCause`, `failureType` e `failed` para falhas durante a conversa instrumentada, sem conteúdo das mensagens; o console registra o erro técnico para diagnóstico. A interface conversacional não mostra `AbortError: Cancelado`. Não há regeneração ou reexecução automática de ações.

Limites existentes: transporte Tauri de 120 s por chamada e 5 s de conexão; conversa com limite total de 180 s; resposta de até 2 MiB no transporte. O cliente agora também aplica 120 s por geração e 5 s para consultar modelos, preservando um `TimeoutError` identificável no frontend. O modelo configurado e os limites nativos não foram alterados. Não foi possível determinar retroativamente a causa das três interrupções relatadas sem os logs originais.

## Validação e limites reais

- Baseline anterior às alterações: 210 testes aprovados. Suíte após a correção de localização: 226 aprovados, sem falhas. A suíte ampliada verifica operações com armazenamento isolado: nomes, múltiplas etiquetas, ambiguidade, permissões, persistência/reabertura, lixeira/restauração, conflitos, planos obsoletos, falhas parciais e cancelamento.
- Ollama real `nautia:0.1`: etiquetas de Lucy preparadas e gravadas somente em memória de teste; três variantes de movimentação produziram o destino correto. Os quatro pedidos levaram aproximadamente 41–47 segundos cada neste computador. Isso valida esses exemplos, não toda frase possível.
- A janela nativa do executável de desenvolvimento foi aberta com o frontend atual: avatar e interface preservados; Contexto informou Raiz/Biblioteca, nenhum item e nenhum projeto. Nenhuma alteração de biblioteca real foi confirmada pela automação.
- Exclusão permanente, comandos arbitrários e execução física de arquivos não são ferramentas da NautIA.
- Remoção de etiquetas de pastas e criação de novos registros de assets pela conversa não são ferramentas dedicadas; cadastro continua pelo Registrar Asset e APIs autorizadas existentes. Conversas longas usam o orçamento de memória já existente, não memória ilimitada.
- Para nomes/destinos que o classificador não resolver, o planejador privado ainda pode precisar de consultas extras ou esclarecimento. Não há garantia universal de interpretação ou tempo de resposta.
- A Central de Ajuda está disponível em Configurações, com artigos locais sobre a NautIA, ferramentas, confirmação e conexão com Ollama. Este documento continua sendo a referência técnica operacional.

Dependências reutilizadas: `libraryOperationsService`, `workspace-store`, `operationHistoryService`, `nautiaToolSystem`, `nautiaOrchestratorService`, motor determinístico e cliente Ollama/Tauri. Sem novas bibliotecas, mudanças no modelo, sprites, animações ou arquivos originais.

## Personalidade e linguagem

O polimento mantém a apresentação generativa, a identidade da NautIA/OCSIS e a proatividade. As instruções de linguagem ficam em `ai/Nautia_llm/prompts/persona.md`; o contexto diferencia abertura e retomada, sem impor uma pergunta ao fim de toda resposta. Não há etapa revisora nem substituição global de texto. A suíte passou a 251 testes. Comparações reais, preservações e limitações estão em [docs/nautia-language-polish.md](docs/nautia-language-polish.md).


## Correção de localização nominal — 18/11/2026

`nautiaNamedLookup` atende pedidos literais como “localize a Hanako” e “onde está localizada a hanako?” diretamente pelo Tool System, quando o nome corresponde a um registro real. A consulta usa a biblioteca inteira, independentemente da pasta aberta ou dos filtros ativos. Retorna nome, caminho virtual e os registros encontrados; homônimos são apresentados com seus locais, sem escolher um deles. Não verifica a existência física do arquivo e não afirma que ela foi verificada.

Esse caminho não chama o Ollama, não depende de modelo disponível e registra origem determinística e zero chamadas LLM. Não intercepta comandos compostos ou perguntas sobre como fazer algo; nesses casos permanece a interpretação semântica. Buscas interpretadas por nome também usam a consulta oficial diretamente, sem etapa extra de planejamento. `searchAssets` agora é global por padrão; `scope:current` mantém a restrição explícita ao contexto do Convés.

Validação na janela Tauri: com o contexto em Raiz, sem seleção, a pergunta real “onde está localizada a hanako?” retornou “Encontrei o registro de HANAKO. Pasta: Convés / Elite Maid Survival.” no mesmo fluxo de envio, sem espera por geração. Nenhum asset foi alterado. Os testes incluem subpastas, filtros incompatíveis, homônimos, nome de arquivo, cancelamento e indisponibilidade do modelo. A suíte completa passou com 226 testes.
