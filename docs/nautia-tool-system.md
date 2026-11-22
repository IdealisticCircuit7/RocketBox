# NautIA Tool System — Etapa 07

`nautiaToolSystem.ts` descreve 13 ferramentas com nome, descrição, contrato TypeScript, validação em runtime e permissão (`read`, `analyze`, `mutate`). Não usa LLM, shell ou execução arbitrária. Todos os acessos passam pelo `libraryOperationsService`; o motor técnico continua em `queryDiagnostics`.

## Consulta

- `searchAssets({query?})`: pesquisa no escopo do Convés, incluindo pasta, coleção, filtros universais e etiquetas de pasta.
- `getAssetDetails({assetId})`: metadados reais de registro ativo.
- `listFolders({})`: todas as pastas virtuais ativas, inclusive subpastas.
- `listTags({})`: catálogos independentes de assets e pastas.
- `getCurrentContext({})`: pasta aberta, IDs da seleção, projeto comum da seleção (ou null), filtros e coleção.
- `getAnalysisResult({assetId})`: relatório persistido; sinaliza alteração conhecida de cadastro/regras. Validade física exige nova análise.
- `analyzeAsset({assetIds,targetEngine?})`: análise determinística com persistência; erro físico/persistência não é apresentado como sucesso.

## Alteração com plano

`createFolder`, `assignTags`, `removeTags`, `moveAssetRecord`, `moveToTrash`, `restoreRecord` retornam planos; chamar a ferramenta não grava. A aplicação mantém o plano pendente, mostra parâmetros/escopo/destino e exige confirmação pelo componente Action Plan existente. Cancelar descarta o plano sem executar. Lixeira mantém confirmação adicional.

O executor existente aceita aliases antigos (`organizeRecords`, `removeAssetTags`, `restoreFromTrash`) para preservar integração. Antes de executar, valida ferramentas, limite de passos, argumentos, IDs, estado da lixeira e permissão. Referências de pasta criada dentro do plano só são aceitas depois do respectivo passo de criação. Serviço de biblioteca mantém validações de negócio e transações. Planos compostos legados são executados por passos: uma falha tardia pode deixar passos anteriores gravados; não há transação global/rollback automático de plano inteiro.

## Uso determinístico na conversa

- `contexto atual`
- `liste pastas`
- `liste etiquetas`
- `pesquise Cube`
- `detalhes` (exige um asset selecionado)
- `diagnóstico salvo` (exige um asset selecionado)
- `analise os selecionados` (exige seleção)
- `remova a etiqueta Hero`
- `mova selecionados para raiz` ou `mova selecionados para ID_DA_PASTA`
- `envie selecionados para a lixeira`
- `restaure registro ID_DO_ASSET`

Comandos anteriores de criação de pasta e associação de etiqueta continuam gerando Action Plans, agora também validados pelo registro de ferramentas antes da execução. A API estruturada aceita referências de pasta para lixeira/restauração e associação de etiquetas de pasta; a gramática textual nova de lixeira/restauração usa assets.

Os resultados estruturados aparecem em um bloco expansível no balão existente. Cards de análise do Convés usam a ferramenta `analyzeAsset`; demais planos anteriores permanecem no orquestrador e usam a mesma validação na confirmação. A ilustração e a estrutura conversacional foram preservadas.

## Validação

`tests/nautia-tools.test.js`: cada consulta e alteração, parâmetros inválidos, ferramentas desconhecidas, permissão negada, preparação/cancelamento sem escrita, confirmação com persistência/reabertura, destino removido após planejamento e seleção ausente. Não foi feita validação manual completa da interface nesta etapa.
