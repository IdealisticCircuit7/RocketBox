# ETAPA 15 — Advanced Preview & Media

## Estado e uso

O Asset Viewer reutiliza o renderizador da Etapa 14. Há três rótulos distintos: visualização direta, prévia convertida e prévia indisponível. Nenhuma conversão grava os originais.

Ao abrir um `.blend` no Convés/registro, escolha **Gerar prévia GLB**. A operação é explícita, não automática. **Configurar Blender** permite selecionar `blender.exe`. A descoberta inicial usa as instalações em Program Files/Blender Foundation; não instala programas. Foi detectado e testado Blender **5.1.2** nesta máquina. O executável escolhido deve ser uma instalação confiável; o aplicativo valida o caminho/nome, não autentica a assinatura do fornecedor.

Para `.uasset`, o painel procura um `.uproject` nos ancestrais, lê EngineAssociation e o caminho relativo do recurso, apresenta tamanho e instalações Unreal detectadas e compara a declaração major/minor com versões instaladas. Encontradas instalações **5.4 e 5.8**. Essa coincidência não certifica compatibilidade: versões customizadas, plugins e tipo de asset exigem validação no Editor. O tipo fica explicitamente não identificado quando não há evidência.

**Unreal é assistido nesta entrega:** exporte um recurso pelo Unreal Editor compatível, usando os formatos que aquele Editor/plugin realmente oferecer, e escolha **Abrir exportação do Unreal** para mostrar o GLB/GLTF/FBX/OBJ real no Viewer. O vínculo entre o arquivo escolhido e o UASSET é informado como não verificado. Não há automação do Editor, instalação/ativação de plugin ou parser universal UASSET. Projetos não são modificados. **Localizar original no Explorer** permite chegar ao recurso para abri-lo no software de origem. Uma exportação manual não é adicionada ao cache de conversão Blender.

## Blender controlado

Backend executa exclusivamente o script empacotado `src-tauri/src/blender_preview.py`, com argumentos separados, sem shell: background, factory startup, `--disable-autoexec`, duas threads e código de erro Python. O script chama `open_mainfile(use_scripts=False)`, também desabilita autoexec nas preferências da sessão e não usa `save_mainfile`. Não lê ou executa textos Python do BLEND. Exporta GLB com skins/animações, sem compressão Draco, câmeras ou luzes. Dependências de imagem/bibliotecas ausentes impedem a conversão em vez de afirmar fidelidade completa.

Limites: original até **256 MiB**, **10 mil objetos**, **2 milhões de vértices de origem**, saída até **32 MiB**, timeout de **120 segundos**. Um Job Object do Windows aplica limite de **2 GiB** ao processo e encerramento ao fechar o job. Falha ao aplicar o limite impede a conversão. O processo roda com os privilégios normais do RocketBox; não solicita administrador. Outros sistemas ainda não têm implementação de limite de processo e recusam conversão. Há cancelamento cooperativo no backend e término do processo Blender; o worker nativo não bloqueia o React.

O limite de vértices antes da exportação não mede toda expansão possível de modificadores. Procedurais, efeitos, simulações e iluminação podem diferir ou faltar. Duas threads e memória/tempo não isolam completamente o Blender do sistema operacional, nem garantem exportação de toda variante. O Viewer aplica novamente os limites da Etapa 14 ao GLB gerado.

## Cache

Cache independente em `app_cache_dir/rocketbox-previews-v1`. Configuração do executável em `app_data_dir/preview-blender.json`. Cada versão tem manifesto com ID, origem, SHA-256 do original, adaptador, formato, criação, caminho e hash do GLB. O ID real do registro é passado pelo Convés; no formulário ainda não cadastrado a referência ao caminho serve como chave provisória.

A chave inclui ID, caminho, hash do BLEND, identidade/tamanho/mtime do Blender e hash do script controlado. O hit de cache verifica também o conteúdo da saída. Conversões usam diretório `.work-*`, verificam novamente o original após exportar e só publicam ao renomear o conjunto final. Alteração do original descarta a prévia. O painel revalida os hashes a cada 15 segundos enquanto ativo e ao recuperar foco; não é um filesystem watcher instantâneo. Atualizações de adaptador são consideradas na próxima geração.

O limite aproximado de 512 MiB impede novas gerações quando o conteúdo registrado já passa de 480 MiB, reservando até 32 MiB para a saída. Não é quota física do volume: metadados, temporários e dependências não estão incluídos. **Limpar cache** exige marcar confirmação, não apaga backups nem originais. Cache não é backup. Links/reparse points nas raízes/versões são recusados; isso não elimina todas as condições de corrida contra outro processo hostil.

Hash somente do BLEND não detecta toda alteração em dependências vinculadas externas. Se uma textura externa mudar sem mudar o BLEND, limpe o cache e gere novamente. Temporários são removidos em cancelamento/falha normal; queda abrupta do aplicativo pode deixar `.work-*`, que não é apresentado como prévia válida e exige limpeza manual com o aplicativo fechado. Não há promessa de recuperação durável de cache.

## Animações e métricas

GLTF/GLB mantêm os clipes do GLTFLoader; FBX mantém clipes e esqueleto pela serialização do worker. O AnimationMixer aplica tracks realmente carregadas. Só aparecem controles se houver clipes com duração positiva e tracks válidas: seleção, play/pause, reinício, velocidade 0,1–4x, timeline e loop. Renderização contínua existe apenas enquanto reproduzindo e visível; pausar/ocultar/descartar encerra o loop correspondente. Tracks e formatos ainda dependem das capacidades dos loaders; não há retargeting universal nem reprodução de simulações Blender.

Inspeção mostra objetos, malhas, vértices, triângulos, materiais, texturas, clipes, duração, esqueleto e conjuntos UV disponíveis. Para prévia Blender ou exportação Unreal escolhida manualmente, os rótulos dizem que essas métricas pertencem ao conteúdo visualizado, não a propriedades verificadas do original proprietário.

## Áudio

WAV, MP3 e OGG são entregues ao decoder de áudio do WebView. A reprodução real depende do codec do ambiente; erros não são apresentados como sucesso. Player oferece play/pause, progresso/duração, seek, volume e repetição; não há autoplay.

Arquivos locais usam protocolo Tauri `rocketmedia`, autorizado por registro temporário de token/caminho. Respostas Range têm no máximo **1 MiB**, permitem seek e são lidas em thread separada. O arquivo não é carregado inteiro em RAM. O handler aceita GET/HEAD, valida ranges e libera o token ao fechar. Arquivos escolhidos como File no browser usam Blob URL sobre o File, sem `arrayBuffer()` do áudio. Ao ocultar ou fechar, o player pausa; no descarte remove src, chama load, revoga URL e remove autorização nativa.

## Testes e limites da evidência

| Caso solicitado | Evidência nesta entrega |
| --- | --- |
| BLEND simples | Conversão real com Blender instalado; GLB válido e hash do original preservado |
| BLEND múltiplos objetos | Conversão real; mais de uma malha na saída |
| BLEND com materiais | Conversão real; material Fixture Copper presente |
| BLEND com rig/animação | Conversão real; skins e animations presentes |
| FBX animado | Exportado pelo Blender real; worker preservou esqueleto e clipes |
| GLB animado | Mixer testado com fixture real; avanço, seek, pause e descarte; reprodução/pausa também observadas no browser |
| UASSET exportável | **Pendente:** não foi executada exportação em um projeto Unreal compatível; integração atual é manual assistida |
| UASSET não exportável | **Pendente com arquivo real:** o painel usa metadados/fallback, sem parser ou promessa de exportação |
| Áudio | WAV real silencioso decodificado e reproduzido até 1 s no browser; ranges e liberação testados no Rust |
| Arquivo excessivo | Fixture esparsa de 257 MiB recusada antes de iniciar Blender |
| Conversão interrompida | Cancelamento durante execução; sem publicação nem temporário `.work` remanescente |
| Dependência ausente | BLEND com imagem externa ausente falhou na conversão controlada |
| Cache desatualizado | Mudança do BLEND gerou novo hash/caminho; saída corrompida foi recusada |
| Liberação | Loop e listeners de animação liberados em teste, autorização de áudio removida; descarte gráfico da Etapa 14 reutilizado. Sem profiling quantitativo de GPU/RAM |

Resultados: **115 testes JavaScript**, **21 testes Rust da suíte normal** e **1 integração real Blender executada separadamente**. A integração fica ignorada por padrão para não abrir software externo em todo `cargo test`; nesta entrega foi executada de verdade. O smoke visual isolado usou os componentes React reais com GLB de rig e WAV; não acessou registros pessoais. Não foi validado o fluxo completo dentro da janela Tauri, especialmente transporte de áudio WebView, conversão por clique e UASSET. MP3/OGG não receberam fixtures de codec nesta rodada.

Comandos:

```powershell
npm test
npm --ignore-scripts run build
cargo test --manifest-path src-tauri/Cargo.toml --offline --lib
cargo test --manifest-path src-tauri/Cargo.toml --offline real_blender_conversions_cache_and_cancellation -- --ignored --nocapture
cargo build --manifest-path src-tauri/Cargo.toml --offline
```

Builds frontend/Rust aprovados; persiste o aviso de chunks grandes. A integração Blender deve rodar sem elevação e gera exclusivamente fixtures temporárias e os pequenos FBX/GLB de regressão em tests/fixtures. `node scripts/preview-smoke.mjs` gera duas páginas temporárias em src para abrir `/__preview15.html` no Vite. As cópias temporárias desta entrega foram removidas. Reinicie a instância Tauri para carregar os novos comandos/protocolo nativos; uma janela antiga não recebe backend atualizado apenas por HMR.

Arquivos novos: `advanced_preview.rs`, `preview_process.rs`, `media_preview.rs`, `blender_preview.py`, `viewerAnimation.ts`, `ViewerAnimation.tsx`, `AudioPreview.tsx`, `ConvertedPreview.tsx`, testes/fixtures e gerador do smoke. Integrações alteradas: `lib.rs`, `modelViewer.ts`, `ViewerInspection.tsx`, `AssetViewer.tsx` e o ponto do Convés que fornece ID ao Viewer. Nenhuma dependência de runtime adicional foi instalada.
