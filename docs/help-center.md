# Central de Ajuda do RocketBox

Acesso: **Configurações → Central de Ajuda**. O manual contém 22 artigos em 10 categorias, com pesquisa local, guia introdutório, painéis recolhíveis, FAQ e atalhos de navegação.

## Conteúdo verificado

- Primeiros passos: proposta do RocketBox, navegação e primeiro cadastro.
- Registrar Asset: modalidades, seleção local, revisão, caminhos duplicados e limitações da identificação.
- Convés e Inspector: escopo de pesquisa, grade/lista, seleção, detalhes, prévias e análises.
- Organização: hierarquia virtual, projetos, etiquetas independentes, localização do original, nova referência, cofre e exportação.
- Lixeira: exclusão lógica, restauração e exclusão definitiva de registros, com distinção dos arquivos físicos.
- NautIA e Ollama: conversa, contexto, histórico, ferramentas, planos, confirmação, conexão e limites reais.
- Configurações: aparência, navegação, biblioteca, desempenho e transferência de preferências.
- FAQ: seis perguntas sobre cadastro, localização, organização, restauração e assistência.
- Solução de problemas: seleção nativa, referências ausentes, formatos, conexão, demora e armazenamento protegido.
- Sobre: identidade OCSIS, objetivos, tecnologias e versão. Autoria individual, contato público e licença não foram inventados.

As descrições antigas das Configurações que negavam a integração já existente com NautIA/Ollama foram corrigidas. Os componentes da NautIA, a conexão, o motor, os serviços de biblioteca e as rotinas de organização não foram modificados.

## Estrutura e manutenção

- `src/help-content.json`: categorias, artigos, palavras-chave, seções e atalhos. Acrescente ou corrija o conteúdo aqui, sem reconstruir os componentes visuais. A distribuição atual empacota o JSON no build normal do aplicativo; não há editor de artigos em tempo de execução.
- `src/help-service.ts`: índice local, pesquisa sem distinção de acentos/caixa, combinação AND de termos e categoria, priorização de títulos e validação de destinos.
- `src/help-center.js`: montagem na interface DOM já usada pelas Configurações, abertura de artigos e navegação. Os corpos dos artigos são construídos ao abrir os painéis.
- `src/help-center.css`: estilos isolados e adaptação à janela compacta.
- `src/settings-ui.js`: nova categoria, integração com navegação e atualização da versão pelo `getVersion` existente.
- `tests/help-center.test.js`: integridade de artigos, referências, pesquisa, filtros, ausência de dependência de rede e segurança dos atalhos.

Os atalhos aceitam apenas rotas existentes, categorias/campos de Configurações permitidos ou IDs de artigos válidos. Não aceitam URLs arbitrárias ou comandos e não recebem callbacks de alteração de assets. O conteúdo é renderizado como texto, sem HTML fornecido pelos artigos.

## Metadados e diagnóstico

A versão começa com `package.json` e é atualizada pelo retorno nativo do Tauri quando disponível. O artigo Sobre informa a origem da versão. O valor 0.1.0 foi observado na janela desktop durante a validação; ele não foi fixado no componente.

O contexto institucional foi conferido em `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` e na marca exibida pelo aplicativo. O autor Rust `you` é um marcador de modelo, não uma autoria individual confirmada. Não há contato público ou licença de distribuição confirmados nos metadados examinados; o manual aponta essa ausência.

Os atalhos de diagnóstico levam a Sistema e Desempenho e reutilizam o painel existente. Não há coleta ou envio automático de caminhos, conversas, credenciais ou arquivos. A ajuda não testa a conexão com Ollama em segundo plano.

## Validação

- 271 testes aprovados, incluindo oito testes novos do manual.
- Build de produção aprovado; permanece o aviso anterior de chunks acima de 500 kB.
- Janela Tauri: navegação até a Ajuda, busca “recuperar” com quatro resultados, artigo de restauração, pesquisa sem correspondência, filtro Sobre, metadados nativos e abertura do guia introdutório.
- O atalho “Abrir a Lixeira” levou à rota existente, sem restaurar ou excluir registros.
- Conferidos os tamanhos 1280×800, 640×800 e o mínimo de 640×480. Em janelas baixas, apenas os cabeçalhos da Ajuda são compactados; a leitura continua por rolagem interna.
- Pesquisa testada com `fetch` indisponível. O índice, o conteúdo e os recursos de interface são locais; não dependem de internet ou Ollama. Não foi desligada a rede do Windows nem interrompido um serviço do usuário para o teste.
- Nenhum registro, original, conversa ou preferência foi excluído ou alterado pelos testes da Ajuda.

Não foi criado um novo instalador nesta tarefa. A validação desktop utilizou o executável de desenvolvimento existente com o frontend atual.

## Atualizações futuras

Ao disponibilizar uma nova funcionalidade, revise o artigo e suas limitações antes de documentá-la como pronta. Novos atalhos precisam continuar limitados à navegação. Informações de autoria, licença ou contato só devem ser preenchidas quando confirmadas pelo responsável do projeto.
