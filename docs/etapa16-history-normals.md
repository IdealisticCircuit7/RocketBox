# Etapa 16 — históricos e Normais

## Históricos

O histórico de atividades continua no serviço `operationHistoryService`, sob a chave legada `ocsis.rocketbox.nautia.history.v1` (apesar do nome antigo, registra operações do Convés e da assistente). O painel compartilhado passou a identificá-lo como histórico de atividades do Convés. A ação secundária Limpar histórico fica desabilitada quando vazio e abre confirmação com Cancelar/Limpar histórico. Sucesso atualiza os componentes pelo callback existente; falha de persistência é informada.

Inspeção encontrou dependência do Desfazer nos undoSteps. Ao limpar, somente entradas ainda reversíveis são preservadas como dados operacionais em `<chave>.undo.v1`, no mesmo serviço, com textos visuais descartados. A lista visual persistida fica vazia. undoEntry também consulta esses descritores, inclusive após reiniciar. Continua o limite existente de 100 registros. O armazenamento operacional é escrito antes de limpar o visual: uma falha não produz falso sucesso. Duas chaves de localStorage não formam uma transação distribuída; uma interrupção entre escritas pode conservar a lista antiga, mas não remove a cópia de recuperação de undo. O desfazer mantém a política anterior de gravação de logs após operações; não passou a ser uma transação atômica conjunta com a biblioteca.

O workspace e a Lixeira não dependem dessa lista para restaurar itens: conservam seus próprios dados e lotes. Nenhuma limpeza chama exclusão de assets/pastas, purge ou operações no disco.

Conversas continuam em `nautiaConversationStore`, chave `ocsis.nautia.conversations.v1`. O painel oferece Excluir por sessão e Limpar histórico de conversas, ambos com confirmação e destaque destrutivo apenas na confirmação. Ações ficam bloqueadas durante geração. Exclusão da sessão ativa remove seu ponteiro, apresenta sessão vazia e descarta mensagens, prompt, streaming e plano pendente em memória. O fluxo LLM recebe apenas os turnos da sessão ativa, portanto não recebe a sessão excluída por esse caminho. Excluir outra sessão preserva a conversa atual.

Configuração Ollama, identidade, preferências e workspace não são removidos. A gravação da exclusão precisa ter sucesso antes da atualização da lista. A confirmação Cancelar apenas fecha o pedido. Não foi implementada sincronização de exclusões entre múltiplas janelas já abertas; cada janela deve recarregar para renovar seu estado local. Backup/exportação anteriores podem naturalmente conter conversas antigas.

## Normais

O modo UV foi substituído por Normais, mantendo Sólido, Malha, Materiais, animações, iluminação e câmera. Coordenadas UV permanecem nos arquivos e na geometria; a aba 2D antiga não é mais exibida.

`viewerNormals.ts` desenha segmentos direcionais de **normais de vértices** no espaço global. As posições usam matrixWorld; direções usam sua matriz normal (inversa transposta), incluindo escala não uniforme. Os segmentos são atualizados no desenho, acompanhando rotações do modelo; a órbita da câmera preserva sua orientação no mundo. Comprimento ajustável entre 0,005 e 0,5 unidade da cena normalizada, cor roxa clara e limite global de 5 mil linhas, com amostragem para geometrias densas. Vetores nulos ou não finitos são ignorados.

Se faltarem normais, o painel informa a ausência e oferece cálculo opcional em clone temporário. Esse cálculo é limitado a malhas de até 100 mil vértices para não processar grandes geometrias na interação. Parsers podem ter criado normais ao carregar; a interface fala em geometria carregada e não certifica que todas vieram do arquivo original.

Malhas SkinnedMesh e com morph positions são excluídas da representação e identificadas como sem suporte específico à deformação. Não são mostradas linhas estáticas incorretas sobre animação esquelética. Outras malhas do mesmo modelo continuam inspecionáveis. Essa é uma limitação atual, não suporte universal a normais deformadas.

Desativar o modo, reconfigurar comprimento/cálculo, trocar de modelo ou desmontar remove os segmentos e libera geometry/material e clones. A geometria original não é recalculada ou sobrescrita. Não há novo loop de renderização permanente.

## Validação

- `npm test`: **123 testes aprovados**, incluindo oito casos novos.
- `npm --ignore-scripts run build`: aprovado; aviso existente de chunks grandes permanece.
- Casos novos: limpeza vazia, recarga do histórico, falha de escrita, preservação de chaves independentes, undo após limpeza, exclusão individual/completa e ponteiro de contexto, restauração real da Lixeira após recarga, direção sob rotação/escala, comprimento, descarte, cálculo não mutante e amostragem de 10 mil vértices.
- Normais também testadas com fixtures GLB, OBJ e FBX realmente interpretadas pelos loaders.
- Nenhum histórico real do usuário foi limpo nos testes; armazenamento de teste isolado foi utilizado.
- Não foi realizada nesta entrega validação visual ponta a ponta dos novos diálogos nem do overlay de normais na janela Tauri. Cancelamento dos diálogos é um fechamento de estado sem chamada ao serviço; o clique visual e foco/teclado ainda precisam de validação manual. Os testes de direção/descarte usam os objetos reais do Three.js, sem medição de GPU.

## Arquivos

- `src/services/operationHistoryService.ts`
- `src/services/nautiaConversationStore.ts`
- `src/components/nautia/NautiaHistoryPanel.tsx`
- `src/components/nautia/NautiaModuleView.tsx`
- `src/components/deck/DeckFilteredView.tsx`
- `src/nautia.css`
- `src/services/viewerNormals.ts` (novo)
- `src/services/modelViewer.ts`
- `src/components/common/ViewerInspection.tsx`
- `tests/etapa16.test.js` (novo)

Nenhum comando Tauri/Rust novo foi necessário. Os arquivos físicos e a identidade visual existente foram preservados.
