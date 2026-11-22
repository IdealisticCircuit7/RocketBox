# Asset Viewer — Etapa 06

O componente `AssetViewer` é compartilhado pelo painel do cadastro e pela prévia do inspetor do Convés. Mantém o shell, as colunas e as rolagens existentes. A biblioteca Three.js foi adicionada porque não havia renderizador/importador 3D no projeto. O código 3D é carregado por importação dinâmica.

## Suporte inicial

- PNG/JPEG: leitura do recurso original, validação prévia de dimensões, decodificação pelo WebView/browser, ajustar, zoom e pan. Limites: 32 MiB, 32 megapixels, dimensão máxima de 16384 px.
- GLB/glTF 2.0 autocontido: geometria real com material neutro; texturas, materiais originais e animação não são exibidos nesta versão. glTF pode conter buffers em data URI, mas arquivos `.bin` externos não são resolvidos automaticamente.
- OBJ: malhas reais com material neutro; sem MTL/texturas externas.
- FBX: ainda sem suporte nesta versão. BLEND/UASSET também não são renderizados diretamente. O estado informa ausência de suporte, sem converter arquivos nem mostrar um modelo substituto.

3D dispõe de órbita, zoom, pan, reset, grade, eixos, iluminação básica e enquadramento. Não executa código contido nos arquivos. Recursos externos são bloqueados antes do importador glTF e também pelo LoadingManager. Extensões glTF obrigatórias são recusadas; não há carregamento automático de decodificadores.

## Arquitetura e recursos

`viewer.rs` entrega bytes locais via resposta binária IPC, com whitelist de extensões e limite de 32 MiB. A leitura fica em `spawn_blocking`. `viewerPolicy.ts` valida os limites de imagens e glTF. `modelViewer.ts` usa OBJLoader/GLTFLoader e renderiza somente quando controles, dimensão ou visibilidade mudam; não existe loop de renderização contínua.

Ao ocultar/trocar o recurso, o componente cancela a publicação de resultados atrasados, libera URLs de imagens, observers e listeners, descarta geometrias/materiais/texturas e encerra o contexto WebGL. Limites de complexidade glTF são verificados antes do parser; OBJ é limitado por bytes na entrada e por 2 milhões de vértices após parsing. O parsing 3D ainda acontece no JavaScript e pode pausar a interface em arquivos complexos próximos do limite: isolamento em worker permanece uma evolução necessária para volumes maiores.

Estados: vazio, carregando, disponível, formato sem suporte, falha de leitura e arquivo inválido/recurso incompatível com o importador. A seleção de diretório continua permitida para cadastro, mas não produz uma cena de projeto.

## Validação

Testes de parser com triângulos reais em GLB e OBJ; rejeição de glTF com buffers externos, complexidade excessiva e header GLB inválido; limites de imagem antes de decodificação. Fixture OBJ pequena em `tests/fixtures/viewer-triangle.obj`.

Na janela Tauri foi confirmado carregamento da imagem real `rocketbox-logo.png`, dimensão de 1983 × 793 px e zoom funcional. A tentativa de validação visual 3D foi interrompida pelo encerramento da janela; portanto, os parsers 3D foram testados automaticamente, mas a renderização WebGL final não foi confirmada manualmente nesta sessão. O comando nativo novo foi incluído no executável compilado.
