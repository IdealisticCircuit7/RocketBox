# Convés File Explorer Core — Etapa 03

Implementado sobre os registros persistidos do workspace, preservando o shell e seus painéis internos.

- Árvore e breadcrumbs existentes reutilizados; ramos da árvore só são montados quando expandidos.
- Grade/lista e seleção múltipla de assets existentes preservadas. “Selecionar todos” abrange os resultados filtrados, inclusive outras páginas.
- Ordenação por nome crescente/decrescente, formato e atualização recente. Renderização limitada a 100 registros por página, com pastas antes dos assets.
- Mover pasta: menu ⋯ da pasta, seletor de destino. Serviço rejeita ciclos, destinos removidos/ausentes e conflitos de nomes no mesmo nível.
- Editar nome e projeto: campos no painel Detalhes, salvos ao sair do campo. Movimentação de assets e TagPicker existentes reutilizados.
- Localizar no disco: botão no painel Detalhes chama `localizar_recurso`, que valida a existência/acesso pelo comando de inspeção e revela o recurso pelo plugin opener existente. Erro é mostrado por notificação.
- Edição de nome/projeto e movimentação de pasta geram histórico, sem undo específico nesta etapa.
- A store também impede novas referências inválidas sem reescrever referências legadas durante a leitura.

Os arquivos físicos não são renomeados nem movidos. O projeto associado continua sendo um rótulo textual do modelo atual. Etiquetas de pastas e assets seguem independentes; etiquetas encontradas são consultas derivadas.

Desempenho: paginação limita o DOM e expansão sob demanda limita os ramos montados; filtros e índices ainda operam em memória sobre snapshots locais. Não há benchmark de bibliotecas grandes nem índice em banco nesta etapa.

Validação: testes de domínio existentes de navegação lógica, filtros, seleção, etiquetas, migração, lixeira e armazenamento; novo `tests/explorer-core.test.js` cobre mutações, ciclos, destinos inválidos, permissões e reabertura da store com caminho inexistente preservado. Builds frontend e Rust executados. Não foi feita uma nova validação manual completa na janela Tauri nem benchmark; localizar no disco exige reiniciar o processo desktop para carregar o novo comando.
