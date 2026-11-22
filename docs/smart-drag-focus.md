# Etapa 17 — Smart Drag Focus

## Implementação

O Convés mantém o desfoque durante arrastos internos, preservando destinos válidos e os registros de origem. As pastas da área principal, árvore e breadcrumbs, assim como os destinos de raiz existentes, usam a validação oficial `validateDeckDropTarget`. Pastas inválidas não recebem o destaque cyan. Um indicador adicional de seta evita depender apenas da cor.

O serviço `smartDragFocus.ts` divide o DOM em subárvores: aplica desfoque somente às regiões que não contêm destinos protegidos. Nenhum ancestral de um destino válido recebe o filtro. Os elementos interativos continuam sendo os originais; não há cópias de pastas nem destinos sobrepostos. A camada decorativa existente continua sem interceptar eventos. A Lixeira mantém sua camada independente e seus acentos de perigo.

A validação é memorizada por destino durante o arrasto, com invalidação quando os registros mudam. O drop executa uma nova validação antes de usar os serviços oficiais de movimentação. Um observador acompanha alterações de conteúdo e a expansão das árvores, agrupando atualizações por quadro, sem recalcular toda a árvore a cada movimento do cursor.

O item arrastado recebe uma representação com nome ou quantidade, e os registros de origem permanecem nítidos. Cancelamento, término, drop, ocultação da janela e perda de foco removem estados temporários. As preferências de movimento reduzido e desempenho são respeitadas. O efeito depende de um arrasto interno do Convés; arquivos externos não ativam esse modo. A alternativa “Mover para...” foi preservada.

A integração da Lixeira também foi ajustada para encaminhar uma seleção múltipla inteira ao serviço persistente, em vez de enviar somente o registro que iniciou o gesto. Os registros são verificados antes da operação; a confirmação em lote segue a preferência existente e a ação oferece desfazer. Não há movimentação ou exclusão de arquivos físicos.

## Arquivos

- `src/services/smartDragFocus.ts`: foco seletivo, cache de validação e representação do arrasto.
- `src/components/deck/DeckFilteredView.tsx`: ciclo de vida, destinos e integração com o Convés.
- `src/library.css`: desfoque seletivo, destaque, origem e preferências visuais.
- `src/library-ui.js`: limpeza do estado e Lixeira para seleção múltipla.
- `tests/etapa17.test.js`: validação, persistência e restauração pelos serviços oficiais.
- `tests/smart-drag-focus.html`: cenário visual isolado, sem acesso aos dados do usuário.

## Validação realizada

- Suíte completa: **126 testes aprovados**, sem falhas.
- Testes novos verificam destinos válidos, ciclos, descendentes, destino inexistente, colisões de nomes, registros excluídos, cache, movimentação múltipla persistida e recuperação da Lixeira.
- Conferência visual no navegador usando o serviço real em um cenário isolado: dois destinos válidos nítidos, origem preservada, conteúdo secundário desfocado e Lixeira nítida. Nenhum destino válido estava dentro de um ancestral desfocado.
- Escape, reinício do efeito e cancelamento pelo botão restauraram o cenário sem alterar registros.
- Evidência visual: `.qa/branding/smart-drag-focus.jpg`. Essa imagem mostra o cenário isolado, não uma operação na biblioteca do usuário.

Para repetir a conferência visual com o servidor de desenvolvimento ativo, copiar temporariamente `tests/smart-drag-focus.html` para `src/__dragqa.html`, abrir `/__dragqa.html` e remover a cópia ao terminar. O cenário apenas ativa o efeito; não simula uma movimentação bem-sucedida.

## Limites da validação

A conferência isolada não substitui os testes de arraste nativo na janela Tauri. Permanecem pendentes a verificação manual do gesto completo sobre os destinos reais (área principal, árvore, breadcrumbs, raiz e Lixeira), seleção múltipla na Lixeira, drop fora de destino, navegação/rolagem durante o gesto, arrastos externos do Windows e diferentes resoluções/layouts. Os testes de serviço validam persistência e regras, mas não comprovam a entrega dos eventos pelo Windows/WebView nem a interação final com o overlay no aplicativo desktop.

Nenhum código Rust, configuração Tauri, asset original ou banco do usuário foi alterado por esta etapa.
