# Biblioteca Global e Lixeira Inteligente

## Uso

No Convés, use **Pastas** e **Todos os Assets**. A **Lixeira** tem entrada própria na navegação, pela rota `#trash`, incluindo após recarregar a aplicação. Todos os Assets consulta os mesmos registros do cadastro: não há cópia de registros entre as telas. Há cards/lista, pesquisa por nome/caminho/categoria/etiqueta, filtros de categoria, extensão, etiqueta e pasta, ordenação e detalhes completos. Registros antigos sem data são ordenados por nome no desempate de Mais recentes.

Para remover logicamente um item:

1. Comece a arrastar um card de asset/pasta. A interface recebe um desfoque leve e uma lixeira flutuante aparece no canto inferior direito, com o nome do item. Ao entrar na área, a tampa abre e a borda acende. Soltar ali remove imediatamente o item do Convés, preservando sua estrutura. Soltar fora ou cancelar o arrasto não remove nada.
2. Como alternativas ao arraste, use o botão de lixeira, o menu com clique direito / Shift+F10 ou Delete com o item focado. Nessas alternativas, confira nome e quantidade de registros afetados e confirme. Cancelar e Escape não alteram dados.
3. O feedback oferece **Desfazer** por 16 segundos. Após isso, a restauração continua disponível na Lixeira.

Arrastos válidos recebem destaque e instrução textual; arrastos externos/inválidos são rejeitados. Entrada e movimento na área de destino aceitam o arraste interno, inclusive ao cruzar a borda rapidamente. Escape, fim do arrasto, troca de view e ocultação da página limpam os estados visuais. Também há controles de teclado, sem depender do arrasto ou apenas da cor. `prefers-reduced-motion` desativa a transição da tampa e o desfoque.

No Windows, `app.windows[].dragDropEnabled` fica `false` em `src-tauri/tauri.conf.json`: segundo o schema local do Tauri, isso é necessário para permitir HTML5 drag and drop no WebView2. Reinicie o aplicativo Tauri para aplicar a configuração. Nenhuma importação externa por arraste foi adicionada.

## Hierarquia e recuperação

A exclusão lógica conserva os registros em suas coleções, com metadados `deleted`: ID, tipo, lote, data, destino original e caminho legível. Uma pasta e seus descendentes ativos recebem o mesmo lote e aparecem agrupados. Itens que já estavam na lixeira mantêm seus próprios lotes e não são reativados automaticamente ao restaurar a pasta.

Na aba Lixeira, os itens aparecem como cartões selecionáveis, com origem e data da remoção. Restaure um item ou marque vários e use **Restaurar selecionados**. O botão direito ou Shift+F10 abre as ações da seleção: **Restaurar selecionados** e **Eliminar selecionados**. Clicar com o botão direito em um cartão não selecionado passa a selecionar apenas esse cartão. Pais são recuperados antes dos filhos. Se o destino original não estiver ativo/disponível, a recuperação usa a raiz do Convés e avisa o usuário. Conflitos de nomes recebem um sufixo `(restaurado N)`; os IDs e vínculos permanecem preservados. IDs duplicados/ciclos no armazenamento são rejeitados, sem sobrescrever dados silenciosamente.

A Central de Configurações (`#settings`) permite exigir confirmação adicional ao arrastar pastas e controlar a confirmação de restauração múltipla (ligada por padrão). As confirmações permanentes continuam obrigatórias. Consulte `configuracoes.md` para persistência e demais preferências da biblioteca.

**Eliminar selecionados** e **Esvaziar lixeira** são fluxos separados da remoção do Convés. A confirmação mostra a contagem incluindo descendentes, informa a irreversibilidade e exige digitar **EXCLUIR**. O comando de esvaziar fica no topo da aba e inclui todos os lotes removidos; fica desabilitado com a lixeira vazia. A exclusão de uma pasta inclui seus registros descendentes ainda na lixeira, mesmo de lotes anteriores. Estruturas com vínculos ativos inconsistentes são bloqueadas até recuperação. O recurso remove somente metadados do RocketBox.

## Arquivos físicos e SIA

O cadastro atual guarda referências de caminhos; não há cópias físicas ou thumbnails próprios para apagar. Nenhuma API de filesystem é usada nesta etapa. Nem a lixeira nem a exclusão permanente apagam arquivos externos. Registros diferentes podem apontar para o mesmo arquivo sem que a exclusão de um afete os outros.

O motor Python e sua base JSON continuam independentes dos cadastros locais do HUD. As consultas SIA existentes foram preservadas e não são reescritas por esta lixeira. A biblioteca global cobre os registros feitos no cadastro do RocketBox; ela não varre o disco nem importa automaticamente a base JSON do SIA.

## Persistência

Mantida a chave `ocsis.rocketbox.workspace.v1`, agora com `schemaVersion: 2`. Dados legados recebem IDs de asset quando faltantes e mantêm preferências/campos desconhecidos. A migração só é gravada junto à próxima operação confirmada.

Cada transação trabalha em uma cópia, valida o lote e grava todo o snapshot com um único `localStorage.setItem`. O estado em memória só muda após a escrita terminar. Falhas de quota/leitura não publicam alterações parciais. Dados ilegíveis ou inconsistentes bloqueiam a gravação para não substituir o conteúdo original por uma biblioteca vazia. Mudanças detectadas em outra janela exigem recarregar antes de continuar.

Persistência local por origem/perfil do WebView, como antes. Não há sincronização, exclusão física, retenção automática ou lixeira do sistema operacional. Limpar os dados do aplicativo remove esse armazenamento; não o trate como backup. Comparação otimista entre janelas evita sobrescrever uma versão já detectada como diferente; não substitui um banco de dados com bloqueio distribuído.

## Estrutura

- `src/workspace-store.js`: migração, snapshots, validação, filtros e transações de excluir/restaurar/purgar.
- `src/library-ui.js`: tabs do Convés, filtros, detalhes, menu de contexto, lixeira flutuante, seleção, confirmação e desfazer.
- `src/library.css`: apresentação dos novos componentes.
- `src/main.js`: cadastro, pastas e preferências passam pela mesma camada transacional; integração dos cards existentes.
- `src/index.html`: telas e diálogos; `src/icons.js` e `src/assets/icons/ocsis.svg`: símbolos de lixeira/restauração.
- `tests/workspace-store.test.js`: testes sem dependências externas, usando armazenamento isolado em memória. `package.json`: comando `npm test`.

## Validação

17 testes de domínio com `npm test`: migração, persistência, caminhos compartilhados, hierarquia, lotes independentes, recuperação múltipla, conflito de nomes/IDs, destinos ausentes, exclusão permanente, esvaziamento mantendo registros ativos, cancelamento sem escrita, falhas antes/depois da gravação, corrupção, concorrência e pesquisa/filtros/ordenação. Nenhum desses testes usa arquivos reais.

Verificação manual em origem isolada de desenvolvimento (`127.0.0.1:1422`), com registros sintéticos: cadastro em subpastas, pesquisa/filtros, cards/lista, Delete, cancelamento, menu de contexto, Desfazer, arrasto de pasta e asset para a lixeira flutuante, rota própria após reload, restauração em lote pelo menu de contexto, layout superior em 640 × 800 e bloqueio da eliminação/esvaziamento até digitar EXCLUIR. As confirmações permanentes foram canceladas no navegador; a efetivação da purga foi validada nos testes em memória. `npm run build` e `cargo check --manifest-path src-tauri/Cargo.toml` passaram; o Rust emitiu apenas avisos de cópia no cache incremental. O arraste foi exercitado no navegador; a configuração nativa exige reiniciar o Tauri para validação na janela Windows.
