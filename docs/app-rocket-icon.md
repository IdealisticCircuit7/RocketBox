# Ícone do aplicativo — foguete aprovado

A fonte oficial deste ícone é `src-tauri/icons/rocket-source.png`, copiada diretamente da imagem anexada pelo usuário em 16/11/2026. Esta é a versão com rastro de fogo irregular, escolhida explicitamente no anexo, e não a variante posterior com chama oval.

Fonte: PNG 1254 × 1254, com canal alpha e canto completamente transparente. SHA-256: `CFC8D8D6006B201C569DE1CA242B18795DA4B9BA564E59E3E3EED19DA99610AE`.

## Recursos atualizados

- `src-tauri/icons/rocket-source.png`.
- `src-tauri/icons/icon.ico`, `icon.icns`, `icon.png`, PNGs desktop e recursos de plataformas gerados pelo Tauri CLI, incluindo `android/`, `ios/` e imagens Appx.
- `src-tauri/icons/16x16.png` e `48x48.png`, exportações adicionais pelo mesmo CLI.
- `.qa/branding/RocketBox.lnk`: ícone explícito apontando para o ICO atualizado. Esse é o atalho de teste existente dentro do projeto; atalhos fixados pelo usuário não foram recriados.

A configuração existente em `src-tauri/tauri.conf.json` já aponta para os recursos corretos. O ícone padrão da janela e os recursos do executável derivam dessa configuração. Os atalhos produzidos pelos instaladores usam o executável. A logo completa, o favicon das telas, a navbar e o wallpaper permanecem independentes.

## Reprodução e validação

```
npx tauri icon src-tauri/icons/rocket-source.png
npx tauri icon src-tauri/icons/rocket-source.png --png 16
npx tauri icon src-tauri/icons/rocket-source.png --png 48
npx tauri build
```

O ICO inclui 16, 24, 32, 48, 64 e 256 px. As versões pequenas foram inspecionadas visualmente. A versão anterior do executável release deve estar fechada durante a compilação e o empacotamento para evitar bloqueio de arquivo. Não executar o antigo gerador vetorial `scripts/create-app-rocket.ps1` para regenerar esta imagem aprovada: ele representa uma proposta anterior.

O Windows pode conservar ícones de atalhos fixados em cache. Isso é independente do recurso incorporado ao novo executável; não foi feita limpeza global de cache nem reinicialização do Explorer.

Build final aprovado: TypeScript/Vite, executável release, instaladores MSI e NSIS. Janela release aberta e ícone conferido visualmente em http://tauri.localhost/. Evidência: .qa/branding/app-approved-rocket-window.jpg. Instaladores gerados, sem executar instalação sobre o sistema. A barra de tarefas e atalhos fixados não foram inspecionados separadamente.
