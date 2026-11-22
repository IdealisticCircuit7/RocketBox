# Etapa 18 — Smart Asset Icons Integration

## Entrega

Os 14 recursos de `src/assets/icons/formats/` são utilizados diretamente, como SVGs vetoriais locais. Nenhum ícone original foi alterado: os hashes SHA-256 dos 14 SVGs continuam correspondendo ao manifesto do pacote. Não houve mudança de banco, classificação, wallpaper, navbar, controles 3D ou arquivos físicos de assets.

## Arquivos adicionados

- `src/services/assetIconResolver.ts`: decisão centralizada e pura de ícone, origem, rótulo e fallback.
- `src/services/assetIconResources.ts`: URLs estáticas dos 14 recursos e tratamento limitado de erro de imagem.
- `src/services/assetIconDom.ts`: apresentação para as áreas legadas que usam DOM, com as mesmas regras do React.
- `src/components/common/AssetIcon.tsx`: componente reutilizável, memoizado, com nome acessível e imagens não arrastáveis.
- `src/components/common/assetIcon.css`: tamanhos estáveis, badge de origem, alinhamento e espaço das linhas da grade.
- `tests/asset-icons.test.js`: 33 testes da nova camada.
- `tests/asset-icons-browser.html` e `tests/asset-icons-browser.tsx`: cenário isolado para conferência dos componentes reais com biblioteca em memória.

## Componentes modificados

| Arquivo | Integração |
| --- | --- |
| `src/components/deck/DeckFilteredView.tsx` | Ícones nas linhas/cartões que também atendem pesquisa, recentes e navegação por pastas; identificação no painel Detalhes; envio de metadados ao Viewer. |
| `src/components/deck/RegisterAssetForm.tsx` | Ícone do arquivo selecionado e metadados do rascunho no Viewer. Sem arquivo, usa o fallback neutro, sem herdar o formato padrão do formulário. |
| `src/components/common/AssetViewer.tsx` | Identificação no status do arquivo, preservando ferramentas, estado vazio e renderização. |
| `src/components/common/ConvertedPreview.tsx` | Identificação do original em prévias convertidas, sem apresentar o GLB temporário como formato original. |
| `src/components/common/AudioPreview.tsx` | Identificação do áudio sem alterar os controles de reprodução. |
| `src/library-ui.js` | Cartões/lista legados e registros de assets na Lixeira. Pastas e ações continuam com os ícones existentes. |

O ajuste de grade usa linhas com altura baseada no conteúdo para acomodar ícones de 48 px sem sobreposição. Lista usa 28 px, cadastro 40 px, Detalhes 36 px; badges usam 13–16 px. Ícones têm `pointer-events:none`, sem novos filtros de desfoque ou glow. O Smart Drag Focus protege o registro de origem como antes.

## Regras implementadas

1. Projetos reconhecidos: BLEND/UPROJECT/Unity, tipo de projeto explícito e estrutura Unity reconhecida. Diretórios com ponto no nome não perdem a identidade do projeto. Formatos intercambiáveis conhecidos não são transformados em projetos por uma origem declarada incompatível.
2. Formatos nativos: BLEND → Blender; UASSET/UMAP/UPROJECT → Unreal; UNITYPACKAGE/UNITY/UNITYPROJ/UNITY_DIR → Unity.
3. FBX, OBJ, GLTF e GLB sempre preservam seu ícone de formato, mesmo com categoria Animação ou software de destino definido.
4. Imagens, materiais/shaders, animações, áudio e documentos usam suas extensões reconhecidas. Na falta de um formato mais específico, categoria e tipo técnico podem fornecer o ícone.
5. Modelos 3D de formatos sem ícone específico usam `3d-unknown`; arquivos totalmente desconhecidos usam `file-unknown`.
6. O badge usa somente `sourceSoftware` explicitamente conhecido. `targetSoftware`, o campo legado ambíguo `engine`, nome e diretório não são interpretados como origem. Não há badge redundante quando a origem coincide com o ícone principal.
7. Dados antigos são lidos dinamicamente, sem migração ou gravação de caminhos de ícones no banco.

Estas são regras visuais; um ícone não valida assinatura, conteúdo, animações, compatibilidade ou capacidade de renderização. Nenhuma classificação técnica foi alterada para combinar com os desenhos.

## Recursos ausentes e fallback

Nenhum dos 14 ícones está ausente. Se uma imagem principal falhar, há uma única tentativa com `3d-unknown` ou `file-unknown`, conforme o contexto. Se esse fallback também falhar, a imagem é ocultada, mantendo tamanho e identificação acessível. Badge ilegível é ocultado sem alterar o ícone principal. Não há repetição infinita de requisições.

Os recursos são resolvidos por URLs estáticas conhecidas pelo Vite; arquivos pequenos podem ser embutidos no bundle de produção. Não há conversão dinâmica, download externo ou inclusão dos PNGs de 512 px na renderização dos registros.

## Testes e build

- **159 testes aprovados**, zero falhas, incluindo **33 novos testes**: projetos, formatos nativos/intercambiáveis, imagens, áudio, animação, material, documentos, desconhecidos, origem versus destino, campos legados, imutabilidade, SVGs locais e fallback.
- **`npm --ignore-scripts run build`: aprovado** — TypeScript e Vite. Foi omitida somente a preparação de IA do ciclo `prebuild`, sem relação com ícones. O Vite mantém o aviso de bundles acima de 500 kB; não é falha da compilação.
- **Janela desktop Tauri:** iniciado `src-tauri/target/debug/rocket-box.exe`, carregando `http://127.0.0.1:1420/`. O seletor nativo abriu e carregou o FBX real `tests/fixtures/viewer-triangle.fbx`. O Viewer exibiu o triângulo real; o cadastro e o status mostraram FBX. Ao declarar Blender como origem, ambos mostraram o emblema Blender. Selecionar Unreal como destino preservou FBX + Blender. O rascunho foi cancelado sem registrar o recurso.
- **Componente real do Convés em cenário isolado:** 17 registros em memória cobrindo os 14 ícones. Todos carregaram sem imagem quebrada; lista medida em 28 px e grade em 48 px. Conferidas seleção individual, painel Detalhes, seleção múltipla e retorno à lista. Foram alternados `data-theme` e cores de acento de teste entre Cinematic e Professional; não foi exercitada toda a matriz de preferências persistidas.
- Uma tentativa de arraste no navegador isolado não confirmou movimentação. Portanto, a movimentação nativa completa após esta integração **não está validada de ponta a ponta**. Os testes existentes de regras/persistência continuam aprovados, as imagens não interceptam ponteiro e não restou estado de foco após a tentativa. Uma conferência manual adicional de arraste e drop no desktop permanece recomendada.
- **Favoritos:** o projeto já apresenta essa coleção como indisponível. Não foi criado um módulo de favoritos nesta etapa; as demais coleções existentes reutilizam as linhas/cartões integrados.

Evidência real do desktop: `.qa/branding/asset-icons-desktop.jpg` (FBX de teste com origem Blender declarada). Não contém registros inseridos artificialmente na biblioteca do usuário.

Para repetir a conferência isolada: copiar temporariamente os dois arquivos `tests/asset-icons-browser.*` para `src/__iconsqa.html` e `src/__iconsqa.tsx`, iniciar o servidor e abrir `/__iconsqa.html`. Remover as cópias ao terminar. O cenário usa somente memória e não acessa a persistência da biblioteca do usuário. As cópias foram removidas antes do build final.
