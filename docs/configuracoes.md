# Central de Configurações do RocketBox

A entrada **Configurações** está no menu dos módulos e no cabeçalho da Home. A rota é `#settings`. A implementação mantém a SPA em JavaScript do projeto, sem React, novos frameworks ou dependências. O serviço de preferências é TypeScript estrito.

## Funcionalidades disponíveis

| Categoria | Controles com efeitos reais |
| --- | --- |
| Aparência | Perfis Cinematic, Professional, Performance e Personalizado; três wallpapers locais; enquadramento; overlay; parallax e intensidade; brilho; iluminação; opacidade dos painéis; intensidade das animações; prévia com resposta ao cursor; restaurar wallpaper. |
| Interface e navegação | Menu lateral/superior; nomes junto aos ícones; menu compacto; densidade; grade/lista da biblioteca global; dicas contextuais; restaurar layout. |
| Biblioteca e assets | Ordenação e filtros iniciais por categoria/extensão; pasta virtual padrão do cadastro; extensões e metadados nos cartões; permitir, avisar ou bloquear cadastros com caminhos duplicados. |
| Lixeira e segurança | Confirmação adicional ao arrastar pastas; confirmação de restauração múltipla; contagem de registros removidos; acesso direto à lixeira. A confirmação permanente com EXCLUIR continua obrigatória. |
| Nautia e SIA | Visibilidade da ilustração preparatória da Nautia; preferência de expansão do painel de consulta SIA; acesso ao painel existente. |
| Sistema e desempenho | Tela inicial; modo de desempenho; animações não essenciais; versão e ambiente; estimativa de armazenamento; diagnóstico local e eventos desta sessão; exportar/importar JSON; restaurar padrões. |
| Sobre | Logo, versão real, proposta do RocketBox e tecnologias efetivamente utilizadas. |

A pesquisa encontra opções pelo título, descrição ou categoria, incluindo as indisponíveis. Exemplos: **parallax**, **menu superior**, **lixeira**, **Nautia** e **backup**. Um resultado abre a categoria e foca o controle correspondente. Setas, Home e End percorrem as categorias; Escape fecha os resultados e seta para baixo entra neles. Os controles usam labels, descrições e estados nativos; sliders funcionam por teclado.

### Regras de aplicação

- Alterações são salvas e aplicadas imediatamente, sem reload. Os ajustes rápidos do menu usam o mesmo serviço. Grade/lista alterada na biblioteca também atualiza a preferência da Central.
- Um ajuste manual de aparência muda o perfil para **Personalizado**. Os perfis não alteram pastas ou filtros da biblioteca. O modo de desempenho suspende parallax, glow, transparência e animações sem apagar os valores personalizados; controles suspensos explicam o motivo.
- `prefers-reduced-motion` prevalece sobre as preferências. O parallax real funciona apenas na Home, com mouse e página visível. O máximo de 10 px horizontal e 7 px vertical fica dentro da margem de 12 px. A prévia usa a mesma imagem, enquadramento e overlay.
- A pasta padrão é virtual: só define o destino dos metadados. Ao cadastrar a partir de uma subpasta aberta, essa subpasta tem prioridade. Se o destino salvo não existir mais, o cadastro usa a raiz. Não há importação ou movimentação física.
- Os filtros iniciais afetam a biblioteca global; todas as pastas permanecem incluídas, salvo um filtro de pasta aplicado manualmente. Se a categoria/extensão salva não estiver disponível, usa-se Todos. Filtrar não altera os registros.
- A política de duplicados compara caminhos de **assets ativos**, ignorando caixa e normalizando separadores. É uma comparação de referências, sem leitura/hash dos arquivos. Não altera os duplicados já existentes. O padrão é avisar e pedir confirmação antes de criar outro registro.
- A confirmação adicional de pastas vem desligada, preservando o gesto de soltar na lixeira com Desfazer. Botões e Delete já pedem confirmação. A confirmação de restauração de mais de um item selecionado vem ligada. Cancelar não altera registros. A eliminação permanente nunca pode ser desprotegida nas configurações.
- A preferência de expansão do SIA abre o painel existente; não declara o Python conectado nem executa consultas automaticamente. A disponibilidade efetiva é verificada ao consultar.
- A tela inicial escolhida vale quando a aplicação abre sem hash; uma rota explícita tem prioridade.

## Recursos futuros, claramente desabilitados

Não foram simulados: identificação de arquivos ausentes, importação física, exclusão automática após 7/30/90 dias, vínculos com outros projetos, assistente de IA, avatar inteligente, sugestões/notificações inteligentes, seleção de provedor/modelo, Ollama, permissões de IA e histórico conversacional. A retenção atual é **sem exclusão automática**.

Nenhuma rotina ou permissão nova de filesystem foi adicionada. Esta lixeira nunca apaga arquivos externos. Futuras credenciais deverão usar armazenamento seguro compatível com Tauri; não há campos de token/senha nem integração fictícia neste módulo.

## Persistência e recuperação

`src/preferences.ts` é a fonte central de tipos, padrões, limites, presets, migração e validação. O serviço mantém a chave **`ocsis.rocketbox.preferences`**, com envelope `format: ocsis.rocketbox.preferences` e `schemaVersion: 3`. Usa o `localStorage` já disponível no WebView, por origem e perfil, sem plugin adicional.

Se a chave não existir, migra `layout` e `effectsEnabled`/`motion` do snapshot existente. Esses campos legados continuam preservados junto aos demais dados antigos; os controles passam a ler e escrever exclusivamente no serviço de preferências. A biblioteca segue em `ocsis.rocketbox.workspace.v1` e não é regravada ao personalizar a interface.

Uma gravação valida todos os campos e só publica o estado reativo após `setItem` concluir. Falhas de quota preservam o snapshot anterior. Mudanças entre janelas são sincronizadas pelo evento `storage`, com verificação otimista antes de salvar. Uma divergência não é sobrescrita silenciosamente.

Preferências ilegíveis acionam padrões seguros e um aviso. Antes da próxima gravação, o conteúdo original é preservado em `ocsis.rocketbox.preferences.recovery.<timestamp>`; falha nesse salvamento bloqueia a substituição. Essa recuperação é local e não é exportada. O serviço nunca apaga a biblioteca para recuperar configurações.

Exportações contêm apenas os campos permitidos das preferências. Importações limitam o arquivo a 100 KB, rejeitam JSON inválido, versões não suportadas, campos desconhecidos, valores fora dos limites e exportações incompletas. O formato v1, restrito a layout/movimento, possui migração explícita. O formato v2 migra a antiga preferência de avatar e a tela inicial da assistente para Nautia; os novos arquivos usam v3. Consulte `migracao-nautia.md`. O arquivo validado mostra a quantidade de diferenças antes da ação **Aplicar preferências importadas**. Cancelar mantém os ajustes anteriores.

Restaurar padrões exige confirmação e afeta somente configurações. Exportação de preferências **não é backup da biblioteca**. O diagnóstico mostra uma estimativa UTF-16 das duas chaves principais, não o uso exato do disco nem a quota do WebView. Os eventos são locais, voláteis e sem valores de preferências, caminhos, registros ou credenciais; não representam logs do backend.

## Arquivos

- `src/preferences.ts`: serviço tipado, padrões, perfis, validação, migração, importação/exportação e comparação de caminhos.
- `src/settings-ui.js`: categorias, controles reutilizáveis, pesquisa, prévia, restauração, backup, diagnóstico e Sobre.
- `src/settings.css`: Central responsiva e estilos dirigidos pelas preferências, incluindo movimento reduzido e modo de desempenho.
- `src/appearance.js`: aplicação central de tokens/classes, wallpapers e dicas contextuais.
- `src/index.html`: rota, entrada de navegação e acesso pela Home.
- `src/main.js`: integração da SPA, ajustes rápidos, cadastro, política de duplicados e pasta padrão.
- `src/library-ui.js`: visualização, ordenação/filtros iniciais, apresentação e confirmações configuráveis. Reutiliza o diálogo existente.
- `src/cinematic.js`: parallax parametrizado e carregamento da imagem efetivamente selecionada.
- `tests/preferences.test.js`: 13 testes de persistência, migração, validação, recuperação, concorrência e preservação dos registros.
- `tests/tauri-settings-validation.json`: perfil nativo de validação isolado, sem alterar a configuração padrão do produto.
- `README.md` e este documento: uso, validação e limites.

## Verificação

- **37 testes passaram**: 13 de preferências, 7 da migração Nautia e 17 da biblioteca/lixeira.
- Ambiente de teste: Node 24.20.0. Os testes importam o serviço TypeScript usando o suporte nativo dessa versão do Node.
- **`npm run build` passou**: TypeScript estrito e build Vite.
- **`cargo check --manifest-path src-tauri/Cargo.toml` passou**; avisos de cache incremental sem falha. A execução nativa também compilou; o linker emitiu apenas uma mensagem informativa de criação da biblioteca.
- Consulta de smoke do Python com os mesmos argumentos e diretório usados pelo Rust: JSON válido, campos esperados e base preservada. O backend não foi modificado.
- Na origem isolada `127.0.0.1:1422`, foram verificados perfis, wallpaper/enquadramento/overlay, sliders por teclado, busca e foco, layout, nomes, densidade, persistência após reload, grade/lista, filtros/ordenação, metadados, destino do cadastro, bloqueio de duplicados, avatar preparatório, painel SIA expandido e restauração dos padrões conservando os registros sintéticos.
- Exportação real seguida de importação do arquivo baixado, revisão de diferenças e aplicação; importação incompatível recusada sem escrita.
- Pasta arrastada com confirmação adicional ativada: contagem correta e cancelamento preservando os dados. Restauração de seleção com quatro registros incluindo descendentes: cancelamento e posterior recuperação integral. Nenhuma eliminação permanente foi executada na interface.
- Janela **640 × 480**, menu superior compacto, rolagem e teclado sem overflow horizontal da página ou palco.
- Aplicativo **Tauri/WebView2** aberto com o perfil de validação: Central renderizada, ambiente Tauri e versão nativa reconhecidos, menu superior aplicado e mantido após fechar e reabrir o processo. As janelas de teste foram encerradas; preferências do perfil principal não foram alteradas. Os diálogos nativos de importação/exportação não foram exercitados separadamente; o fluxo de arquivos foi validado no navegador.

Para repetir a validação nativa, inicie o frontend com `npm run dev -- --port 1422` e execute `npm run tauri dev -- --config tests/tauri-settings-validation.json --no-watch`. O perfil usa identificador próprio. Para uso normal, continue com `npm run tauri dev`.
