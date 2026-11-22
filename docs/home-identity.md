# Polimento da home e ícone oficial

## Alterações

`src/home.css` é carregado após as folhas existentes e aplica suas regras apenas em `#app-container.is-home`. A home esconde a marca redundante da navegação, mantém Configurações à direita e usa uma barra de 48 px. A marca hero e o wallpaper original foram preservados. Não foram adicionados módulos ou indicadores fictícios.

Os dois cards mantêm seus destinos, com espaçamento/alinhamento, ícones de proporção consistente, texto mais direto, contraste e brilho inferior discreto em hover/foco. A composição mantém a área esquerda para a marca/ações e o foguete do wallpaper à direita. Na largura mínima, os cards passam para uma coluna e a home permite rolagem interna quando necessário. Estilos das telas internas e serviços de negócio não foram alterados. Preferências existentes de efeitos e movimento continuam sendo respeitadas.

## Ícone

O símbolo usado como referência é a parte superior de `src/assets/branding/rocketbox-logo.png`: foguete, caixa e anel orbital. A versão para aplicativo não contém wordmark. Foi preparada com a ferramenta **image_gen integrada**, em modo de edição com referência, transparência e sem CLI/API externa. A imagem mestre está em `src/assets/branding/rocketbox-app-icon.png`; o logo completo original não foi substituído.

Prompt final usado:

> Edit target: the provided official RocketBox logo. Produce a square transparent app-icon master. Extract and preserve ONLY the upper emblem: the exact silver rocket emerging diagonally from the open dark cyan box, with its cyan/purple orbital ring and the silver orbital emblem on the box front. Remove all wordmark text RocketBox and by OCSIS and all wordmark underlines. Preserve this existing brand identity and design; do not invent a new rocket or brand. Center the complete rocket-box-orbit emblem on a square canvas with about 8% transparent margins, retain all tips without clipping. Clean readable compact silhouette for desktop icon at 16,32,64px; limit tiny glow artifacts, retain cyan purple silver colors. Genuine alpha transparent background, no plate, no mockup, no typography, no extra elements. Output one app-icon master.

Geração dos formatos, usando a CLI já instalada:

```powershell
npx tauri icon src/assets/branding/rocketbox-app-icon.png --output src-tauri/icons
npx tauri icon src/assets/branding/rocketbox-app-icon.png -p 16 --output src-tauri/icons
```

O ICO contém 16, 24, 32, 48, 64 e 256 px. PNGs, ICNS e variantes de plataforma também foram gerados. PNG/ICO do favicon estão em `src/assets/branding/favicon.*` e são referenciados por `src/index.html`. A configuração de bundle existente já aponta para os arquivos substituídos em `src-tauri/icons`; não foi necessário trocar caminhos.

`src-tauri/build.rs` passou a declarar `cargo:rerun-if-changed=icons` e o arquivo de configuração. Antes disso, `cargo build` reutilizou o executável anterior à mudança de ícones. A recompilação foi confirmada pelo novo horário e pela comparação binária das seis imagens do ICO com os recursos RT_ICON do executável: **6/6 correspondentes**.

## Validação

- `npm test`: **115 aprovados**. Nenhum teste de implementação visual artificial foi adicionado.
- `npm --ignore-scripts run build`: aprovado, com PNG/ICO do favicon no dist. Mantido o aviso existente de chunks grandes.
- `cargo build --manifest-path src-tauri/Cargo.toml --offline`: aprovado, incluindo recompilação após ajuste do build script.
- Ícones 16/32/64 inspecionados visualmente; transparência conferida na imagem mestre.
- Executável aberto diretamente: `src-tauri/target/debug/rocket-box.exe`. Novo símbolo observado na barra de título.
- Na janela Tauri real, conferidos a home em 1280×800 e 640×480, cards em coluna, rolagem interna e os acessos Registrar Asset, Workspace/Biblioteca e Configurações. A navegação interna manteve sua identidade anterior. Nenhum cadastro foi confirmado ou preferência editada durante a verificação.
- A janela foi fechada/reaberta e deixada na home em seu tamanho desktop padrão.
- Capturas locais: `.qa/branding/home-desktop.png` e `home-compact.png`.
- Criado somente um atalho de validação dentro do projeto: `.qa/branding/RocketBox.lnk`, apontando para o executável recompilado e seu ícone de índice zero. Destino e IconLocation foram relidos e conferidos. Ele depende do servidor Vite por apontar para o build de desenvolvimento.

## Limites da entrega

Não foi instalado um novo MSI/NSIS nem substituída outra cópia instalada do RocketBox. Atalhos existentes na área de trabalho e ícones já fixados na barra de tarefas não foram alterados. O ícone compilado e o da janela foram comprovados; a aparência de atalhos previamente instalados/fixados e do cache do Explorer não foi validada visualmente. Esses itens usarão o novo recurso quando apontarem para a versão atualizada do executável/pacote.

Arquivos principais: `src/index.html`, `src/home.css`, imagem mestre e favicons em `src/assets/branding`, recursos em `src-tauri/icons` e `src-tauri/build.rs`. Wallpaper, logo hero, banco/registros, assets originais e módulos funcionais foram preservados.
