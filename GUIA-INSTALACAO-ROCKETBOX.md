# RocketBox by OCSIS 1.0.0 — Guia Rápido (Windows)

## 1. Instalação
1. Execute o instalador **`RocketBox_1.0.0_x64-setup.exe`**.
2. Avance no assistente e escolha a pasta de destino desejada (o padrão é na pasta de aplicativos do usuário; caminhos personalizados, inclusive com espaços e acentos, são suportados sem exigir permissão de administrador).
3. Ao concluir, o **RocketBox** estará disponível no **Menu Iniciar** e (se selecionado) na **Área de Trabalho**.
4. O aplicativo funciona de forma totalmente independente, sem necessidade de VS Code, terminal ou servidor de desenvolvimento.

> **Observação sobre IA local (Ollama):**  
> Todas as funções da biblioteca (cadastro, pastas virtuais, etiquetas, busca, lixeira, pré-visualização e exportação) funcionam **100% offline sem o Ollama**. Para conversar com a **NautIA** em modo generativo, basta ter o Ollama instalado e em execução localmente (`http://127.0.0.1:11434`). Se o Ollama estiver fechado ou indisponível, o RocketBox exibirá uma mensagem amigável e continuará funcionando normalmente.

---

## 2. Como utilizar
- **Início:** atalhos rápidos para **Registrar Asset** ou abrir o **Convés** (`Workspace / Biblioteca`).
- **Registrar Asset:** cadastre arquivos 3D (`.blend`, `.fbx`, `.obj`, `.glb`, `.gltf`), texturas, áudios ou pastas de projetos (Blender/Unity/Unreal). Os arquivos originais são apenas referenciados — nunca movidos no disco sem sua ação.
- **Convés (`Explorador`):**
  - Crie e organize pastas virtuais, arraste assets/pastas ou use **Mover para...**.
  - Gerencie **etiquetas** globais, de pastas e de assets (pelo painel ou clique direito → **Gerenciar etiquetas**).
  - Use a barra de busca e **Filtros avançados** para localizar qualquer item.
  - Exporte com **Exportar original...** ou converta formatos com **Exportar como...** (`FBX`, `OBJ`, `GLB`, `GLTF` via Blender configurado).
- **Lixeira:** exclusões são lógicas e reversíveis; restaure ou esvazie lotes com segurança.
- **NautIA:** consulte a biblioteca, peça análises e planos de organização. Toda operação que altera registros exibe um plano claro para você **confirmar** antes de ser aplicada.
- **Configurações:** personalize aparência, desempenho, cofre de backups e conexão do Ollama.

---

## 3. Onde os dados ficam salvos
Seus assets registrados, pastas, etiquetas, preferências, histórico de operações e conversas da NautIA ficam armazenados no perfil do usuário do Windows em:
- `%APPDATA%\com.bruno.rocket-box\rocketbox-state.json` (com cópia de segurança automática em `rocketbox-state.bak.json`)
- `%LOCALAPPDATA%\com.bruno.rocket-box\` (perfil WebView2 e cache de prévias)

Atualizar ou reinstalar o RocketBox **preserva integralmente** seus dados.

---

## 4. Desinstalação
1. Abra **Configurações do Windows → Aplicativos → Aplicativos instalados** (ou **Painel de Controle → Programas e Recursos**).
2. Localize **RocketBox** (Editor: **OCSIS**, Versão: **1.0.0**) e clique em **Desinstalar**.
3. Siga as instruções do desinstalador. Seus dados pessoais em `%APPDATA%\com.bruno.rocket-box\` permanecem preservados para não haver perda acidental da biblioteca.
