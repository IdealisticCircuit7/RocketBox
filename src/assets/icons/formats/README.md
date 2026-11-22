# RocketBox by OCSIS — pacote de ícones

14 ícones individuais. SVGs com caminhos vetoriais reais, sem imagens raster embutidas ou dependências externas. PNGs com canal alpha em 512, 256, 48, 32 e 24 pixels.

## Arquivos

| Nome | Identificação |
| --- | --- |
| blender | Símbolo Blender original, laranja, branco e azul |
| unreal | Símbolo Unreal Engine original, variante branca da fonte EDS Icons |
| unity | Cubo Unity original, variante branca |
| fbx | Cubo wireframe cyan com vértices |
| obj | Malha triangular azul |
| gltf | Duas camadas e órbita cyan/roxa |
| glb | Cubo sólido azul/roxo |
| 3d-unknown | Cubo cinza-prateado |
| texture | Superfície UV quadriculada cyan/roxa; também PNG/JPG |
| material | Esfera metálica; também shaders |
| animation | Silhueta geométrica em movimento |
| audio | Waveform cyan/roxa |
| document | Documento com linhas |
| file-unknown | Arquivo genérico neutro |

Na pasta fonte, os SVGs e PNGs 512 ficam na raiz; as pastas `256`, `48`, `32` e `24` contêm os demais PNGs. No ZIP de entrega, os arquivos ficam separados em `svg/` e `png/<resolução>/`. O ZIP contém arquivos individuais, não sprites ou imagens compostas.

## Direção visual

Grade vetorial de 64 unidades, canvas quadrado, margens transparentes, formas simples e traços predominantemente de 1,5–2,2 unidades. Cyan, azul elétrico, roxo e prata acompanham os ícones e a identidade existentes no projeto. Os ícones próprios usam gradientes leves; as marcas mantêm a geometria e as cores de suas variantes originais, sem efeitos RocketBox adicionados. O círculo do símbolo Unreal integra a própria variante oficial; não é um card ou moldura decorativa acrescentada.

Os arquivos de referência existentes do projeto foram consultados: `src/assets/icons/library-icon.png`, `src/assets/icons/rocket-icon.png`, `src/assets/branding/viewer-empty-cube.png`, `.qa/branding/home-desktop.png`, além das regras de cor e escala de `src/icons.css`.

## Proveniência das marcas

Obtidos em 16/11/2026. Os nomes e símbolos pertencem aos respectivos titulares; o pacote não indica afiliação ou endosso dessas empresas ao RocketBox.

- **Blender Foundation:** [página oficial](https://www.blender.org/about/logo/) e [kit oficial](https://download.blender.org/branding/blender_logo_kit.zip). Origem: `blender_logo_kit/blender_logo.svg`. Foram preservados os três caminhos do símbolo isolado, com suas cores e curvas originais; somente a transformação de posicionamento e escala uniforme adapta o símbolo ao canvas quadrado. O arquivo integral fica em `official/blender-original.svg` para referência.
- **Unity:** [página oficial de marcas](https://unity.com/legal/branding-trademarks), que aponta para o [Brandfolder oficial](https://brandfolder.com/s/fj5fnvgrqhwv9g9rtbrc3). Origem: `Unity Logos/U_Cube_1C_White.svg`. Caminho e cor branca preservados; metadados de edição e conteúdo não visual foram removidos na versão normalizada. Arquivo original em `official/unity-original.svg`.
- **Epic Games / Unreal Engine:** [documentação oficial](https://dev.epicgames.com/documentation/en-us/unreal-engine) e [portal de marca](https://brand.epicgames.com/unreal-engine?lang=en-US). O símbolo foi extraído da fonte vetorial publicada pela própria Epic: [EDS Icons WOFF2](https://dev.epicgames.com/documentation/eds-iconfont.123ecdba546170ba.woff2). A [folha de estilos oficial](https://dev.epicgames.com/documentation/styles.84779b82322cc5b0.css) associa `.icon-unreal-engine` ao caractere `F146`. Exportação exata das curvas do glifo, com inversão do eixo vertical própria da passagem de fonte para SVG, escala uniforme e preenchimento branco. A fonte original está em `official/unreal-eds-icons.woff2`. Não é um redesenho nem uma aproximação gerada por IA.

## Verificação

14 SVGs e 70 PNGs exportados. Conferência visual individual em 256 e 24 pixels; cada tamanho PNG foi verificado quanto a conteúdo visível, pixels transparentes e ausência de pixels tocando os limites do canvas. Detalhes em `export-validation.json`. Isso verifica os arquivos gerados, não constitui teste de aplicação destes ícones em todos os componentes do RocketBox.

Nenhum componente, seletor de formato, arquivo físico de asset ou ícone já integrado à interface foi substituído. O pacote está pronto para uma integração posterior.

## Reexportação

- `scripts/create-format-icons.mjs`: gera os dez desenhos próprios adicionais, preservando o FBX inicial.
- `scripts/prepare-brand-icons.py`: normaliza somente geometria original das três marcas. Requer FontTools/Brotli como ferramentas de exportação; não são dependências do aplicativo.
- `scripts/export-icon-pack.ps1`: exporta os SVGs locais com o renderizador vetorial do Windows, sem novas bibliotecas no app; suporta apenas o subconjunto SVG controlado deste pacote.
- `scripts/package-icons.ps1`: monta o ZIP e o manifesto SHA-256 de entrega.

Os arquivos em `official/` são fontes de produção e não entram no ZIP de distribuição, que contém apenas os ícones finais e a documentação. O manifesto SHA-256 identifica exatamente os arquivos finais entregues.
