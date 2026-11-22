# OCSIS RocketBox

Aplicativo desktop para catalogar assets, projetos e pacotes, organizar uma biblioteca de referências locais e consultar informações técnicas. O **Convés** reúne os registros; os arquivos originais permanecem no disco. A **NautIA** auxilia nas consultas e na preparação de ações que precisam de confirmação.

## Principais funcionalidades

- Cadastro de arquivos, diretórios de projetos e pacotes com seleção nativa e identificação inicial.
- Biblioteca com pastas virtuais, etiquetas, pesquisa, filtros, ordenação, grade/lista e seleção múltipla.
- Edição e movimentação de registros, sem renomear ou mover automaticamente os arquivos originais.
- Lixeira de registros com restauração e eliminação definitiva mediante confirmação.
- Asset Inspector com imagens e modelos compatíveis, materiais, UVs e animações quando os dados estiverem disponíveis.
- Motor de Inferência com regras técnicas, evidências, avisos e relatórios associados aos recursos.
- Localização de originais, revisão de novas referências, cofre opcional de backups e exportação.
- NautIA com histórico de conversas, ferramentas autorizadas e integração local opcional com Ollama.
- Personalização da interface e Central de Ajuda com pesquisa local.

O suporte depende do formato e das ferramentas disponíveis. Uma extensão reconhecida não garante visualização ou compatibilidade integral. Prévia temporária não substitui backup. Projetos grandes não são copiados automaticamente.

## Tecnologias

Tauri 2, Rust, React, TypeScript, JavaScript, Vite, Three.js e Python. A conversação generativa da NautIA utiliza Ollama quando instalado e configurado.

## Requisitos

O desenvolvimento e o empacotamento desta versão foram preparados para **Windows x64**.

- **Node.js 24 e npm**, recomendados para os testes que importam TypeScript diretamente. O Vite instalado declara suporte a Node.js `^20.19.0 || >=22.12.0`, mas isso não garante compatibilidade de versões antigas com toda a suíte de testes.
- **Rust e Cargo**, com suporte à edição 2024, e a cadeia MSVC.
- **Microsoft C++ Build Tools** com ferramentas de desenvolvimento desktop em C++ e Windows SDK.
- **Microsoft Edge WebView2 Runtime**, utilizado pela janela desktop.
- **Python 3** disponível como `python` para as rotinas Python de inspeção e o painel especialista legado.
- **Git**, para obter e versionar o código.

Recursos opcionais: Ollama e um modelo local instalado para conversação; Blender instalado/configurado para prévias e conversões que dependem dele. O aplicativo não baixa modelos automaticamente. Bibliotecas externas não são necessárias para ler o manual local.

## Instalação e execução

Clone este repositório, entre na pasta `RocketBox` e instale exatamente as dependências do arquivo de lock:

```powershell
npm ci
```

Inicie a aplicação desktop:

```powershell
npm run tauri dev
```

O comando inicia o frontend e compila o backend Rust. O servidor local usa a porta **1420**. O projeto pode reutilizar um servidor Vite identificado como pertencente à mesma pasta; não encerra automaticamente programas de outros projetos que ocupem a porta.

Para iniciar somente a interface no navegador:

```powershell
npm run dev
```

A prévia no navegador não substitui o desktop: seleção nativa, acesso ao sistema de arquivos e outras integrações Tauri podem não estar disponíveis.

## Testes e compilação

Na raiz do projeto:

```powershell
npm test
npm run build
```

O build verifica TypeScript e gera o frontend em `dist/`. Os hooks existentes preparam as instruções locais da NautIA antes de executar ou compilar a interface.

Para verificar ou compilar o backend separadamente:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
cargo build --manifest-path src-tauri/Cargo.toml
```

Para gerar o aplicativo e o instalador Windows configurado no projeto:

```powershell
npm run tauri build
```

O instalador NSIS é gerado em `src-tauri/target/release/bundle/nsis/`. Os binários de compilação não fazem parte do código-fonte versionado.

## NautIA e Ollama

A biblioteca e o manual local não dependem de um modelo de linguagem. Para conversar em modo generativo:

1. Instale e inicie o Ollama no computador.
2. Disponibilize um modelo local compatível.
3. Abra as opções da NautIA, confira o endpoint local, liste os modelos e teste a conexão.

O módulo `ai/Nautia_llm/` contém configuração, prompts, schemas e scripts do perfil local; não contém pesos de modelos. Para conferir as dependências desse perfil:

```powershell
npm run nautia:setup -- -CheckOnly
```

Para criar o perfil configurado, depois de disponibilizar a base local necessária:

```powershell
npm run nautia:setup -- -Create -Test
```

Consulte a [documentação da integração local](ai/Nautia_llm/README.md) e as [capacidades operacionais](NAUTIA_CAPABILITIES.md). Consultas retornam dados dos serviços; alterações propostas pela assistente exigem aprovação. Ela não executa comandos arbitrários no sistema.

## Organização do projeto

| Caminho | Conteúdo |
|---|---|
| `src/` | Interface, componentes React, serviços TypeScript/JavaScript e estilos |
| `src/assets/` | Imagens, sprites do avatar, ícones e demais recursos visuais |
| `src-tauri/src/` | Backend Rust e rotinas locais de integração |
| `src-tauri/icons/` | Ícones da janela, executável e instalador |
| `src-tauri/tauri.conf.json` | Configuração do desktop e do empacotamento |
| `python/` | Motor especialista legado em Python |
| `assets_knowledge_base.json` | Base de conhecimento utilizada pelo motor Python |
| `ai/Nautia_llm/` | Configuração e instruções da integração com o modelo local |
| `scripts/` | Scripts de desenvolvimento e preparação de recursos |
| `tests/` | Testes e fixtures do projeto |
| `docs/` | Documentação técnica e limitações conhecidas |
| `package-lock.json` e `src-tauri/Cargo.lock` | Versões resolvidas das dependências |

## Dados e cuidados

A publicação contém o programa, recursos visuais necessários e testes. A biblioteca pessoal, conversas, preferências, originais, cofre e credenciais do usuário não devem ser enviados ao repositório.

O cadastro armazena referências: não é uma cópia de segurança dos arquivos. Exportar preferências também não inclui a biblioteca nem os originais. Evite limpar o armazenamento do aplicativo sem avaliar a recuperação dos dados.

Os testes automatizados usam dados de exemplo e armazenamento isolado. A instalação de ferramentas externas e os recursos efetivamente disponíveis podem limitar verificações opcionais. O código do diagnóstico não deve ser interpretado como garantia universal de suporte a um formato.

## Documentação

- [Guia de instalação e uso no Windows](GUIA-INSTALACAO-ROCKETBOX.md)
- [Central de Ajuda e manual](docs/help-center.md)
- [Convés e organização](docs/conves-explorer-core.md)
- [Motor de Inferência](docs/motor-inferencia-deterministico.md)
- [Asset Inspector](docs/asset-viewer-2.md)
- [Asset Vault e exportação](docs/asset-vault.md)

## Identidade e distribuição

Projeto identificado como **RocketBox by OCSIS**. A versão é definida nos metadados do projeto. Este repositório não declara uma licença de distribuição; disponibilidade pública do código não deve ser interpretada como concessão automática de direitos sobre imagens, marcas ou outros recursos.

Um instalador já compilado pode ser disponibilizado separadamente nos arquivos de uma **GitHub Release**, depois de revisar seu funcionamento e seus direitos de distribuição.
