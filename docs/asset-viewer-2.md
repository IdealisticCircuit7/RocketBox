# Asset Viewer 2.0 — ETAPA 14

O visualizador reaproveita Three.js e a integração existente do Convés. Não grava nem converte os assets. O novo comando de leitura de dependências é registrado no mesmo backend Tauri.

## Organização

- `viewerPolicy.ts`: reconhecimento, validação glTF e limites de imagens.
- `viewerResources.ts`: escopo local, dependências, URLs temporárias e limites configuráveis.
- `viewerParser.worker.ts` / `viewerParser.ts`: geometria OBJ/FBX em worker terminável, serializada para reconstrução no Three.js. Nenhum script do arquivo é executado.
- `modelViewer.ts`: adaptadores, cena, câmera, controles e descarte.
- `ViewerInspection.tsx`: seleção de materiais e malhas, layout UV e rotação do modelo.
- `AssetViewer.tsx` / CSS: barra compacta com ícones, tooltips, modos segmentados e painéis recolhíveis.
- `src-tauri/src/viewer.rs`: leitura limitada do original e dependências locais em worker nativo.

## Formatos reais

GLB/glTF 2.0 preservam materiais e texturas PNG/JPEG. Buffers e imagens externos podem ser lidos em caminhos relativos abaixo do diretório do original. Imagens embutidas PNG/JPEG são inspecionadas antes da decodificação. Extensões glTF obrigatórias, incluindo compressões que exigiriam decoders adicionais, continuam recusadas. Não há decoder Draco/KTX2/Meshopt instalado por esta etapa.

OBJ preserva geometria e coordenadas UV e aplica o primeiro MTL indicado pelo arquivo. MTL com opções complexas de mapa ou múltiplos arquivos pode ficar parcial. Texturas externas comuns são carregadas quando resolvidas com segurança; os avisos indicam ausências. O worker não fabrica UVs.

FBX usa o FBXLoader do Three.js, com geometria em worker. Há leitura de texturas externas PNG/JPEG comuns encontradas pelo adaptador. Referências incomuns ou texturas embutidas FBX não são resolvidas nesta versão e apresentam aviso; a geometria pode continuar visível com o material disponível. O scanner de nomes é limitado e não constitui descoberta universal de dependências FBX. Animações não têm controles de reprodução nesta etapa.

BLEND e UASSET continuam sem renderização direta. Não há conversão automática. A prévia não promete equivalência com Blender, Unreal ou outro software de origem.

## Controles

Arrastar orbita a câmera; botão direito faz pan; roda aproxima/afasta. A barra oferece enquadramento/reset da câmera, zoom, grade e eixos. Há projeção perspectiva/ortográfica e vistas frontal, traseira, lateral e superior. Campos X/Y/Z giram o modelo, separados da câmera. As cores dos eixos são X vermelho, Y verde e Z azul.

Sólido utiliza os materiais carregados; Malha alterna wireframe no lugar das faces. Materiais lista nome, tipo, opacidade/transparência e mapas disponíveis. UV permite escolher malha e atributo `uv`, `uv1`, etc. Desenha triângulos reais no domínio 0–1, com até 50 mil triângulos no painel para limitar custo de desenho; coordenadas fora do domínio ficam recortadas. Ausência de UV é informada. Não há geração, unwrap ou edição de UV.

## Limites e estados

Padrões por carregamento: 32 MiB para o conjunto lido, 2 milhões de vértices, 256 MiB de memória estimada e 30 segundos. O painel permite reduzir limites ou ajustar memória até 512 MiB e tempo até 120 segundos. Os limites são locais à instância do Viewer e não são persistidos como preferências globais. O backend mantém teto de 32 MiB por leitura. Imagens: até 32 MP e 16384 px por dimensão. Dependências: até 128 tentativas por conjunto.

URLs remotas, caminhos absolutos, parent traversal, URIs codificadas e referências fora do diretório são bloqueados. Não há download de recursos. A leitura nativa verifica existência, tamanho e confinamento após canonicalização; não é isolamento contra um processo hostil trocando caminhos entre validação e abertura.

OBJ/FBX podem ser interrompidos pelo encerramento do worker; o teto de memória é uma estimativa verificada sobre dados coletados, não uma quota rígida do processo do navegador. glTF usa parse assíncrono, mas etapas síncronas internas e decodificação de imagens têm cancelamento/tempo cooperativos: uma etapa já iniciada pode precisar terminar antes do descarte. A leitura IPC pendente também é limitada em tamanho, porém não é abortada fisicamente no meio pelo cancelamento do frontend.

Há estados vazio, carregando, pronto, sem suporte, falha de leitura, cancelado e erro/complexidade excessiva; materiais ausentes são avisados na prévia parcial. Geometrias, materiais, texturas, ImageBitmaps, controles, observers, URLs e contexto WebGL são liberados ao sair/trocar/ocultar. Não existe loop de renderização contínua; os desenhos ocorrem em resposta a controles, resize e carregamento de texturas, com guardas de visibilidade.

## Validação desta entrega

- Suíte JavaScript: 113 testes aprovados. Inclui arquivos GLB/OBJ, UV real de OBJ, preservação de material glTF, FBX ASCII conhecido, serialização do worker e recusa de complexidade/caminhos inseguros.
- Rust: 18 testes aprovados, incluindo leitura real de dependência temporária e bloqueio de caminhos remotos, absolutos, parent traversal, diretório e arquivo ausente.
- Build TypeScript/Vite e `cargo build --offline` aprovados. Permanece o aviso de bundles maiores que 500 kB.
- Smoke no navegador com WebGL real: OBJ, FBX e GLTF renderizaram três vértices cada; o material colorido do GLTF foi exibido. Projeção ortográfica, vista frontal e alternância wireframe/sólido foram aplicadas pelo harness.
- A verificação visual usou uma página isolada de fixtures, sem acessar a biblioteca. Não houve verificação completa da janela Tauri com texturas externas nem inspeção visual de todos os painéis novos. Esses fluxos ainda precisam de validação desktop com uma coleção representativa de formatos.

Para repetir o smoke, com Vite ativo na porta 1420, copie `tests/viewer-browser.html` para `src/__viewerqa.html` e abra `http://127.0.0.1:1420/__viewerqa.html`. A página contém somente fixtures embutidas. Remova apenas a cópia temporária após verificar; ela não integra a entrada de produção. A cópia desta entrega foi removida.
