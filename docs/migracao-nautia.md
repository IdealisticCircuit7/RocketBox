# Etapa 01 — identidade local Nautia

O nome público da assistente específica do RocketBox passa a ser **Nautia**. A inteligência principal **Synclaire**, do ecossistema OCSIS, permanece uma identidade independente. Esta etapa não cria conexão com ela, IA, chatbot, avatar animado ou novos recursos.

## Inspeção e escopo

O projeto usa SPA em JavaScript com serviço de preferências TypeScript; não possui componentes React, hooks ou serviços de IA a renomear. A busca por Synclair/Synclaire e variações encontrou referências locais no HTML, CSS, sprite SVG, catálogo de ícones, navegação, configurações, preferência de avatar e documentação. Não há histórico conversacional implementado nem serviço global Synclaire neste repositório.

Foram alterados apenas arquivos identificados como pertencentes à assistente local. Os registros da biblioteca, nomes de assets/pastas, a base JSON, o motor Python e o backend Rust não foram reescritos. A família de ícones continua local ao aplicativo; somente o símbolo de astronauta associado à assistente foi renomeado.

## Identidade e contratos atuais

- Nome público: **Nautia**; rota: **`#nautia`**.
- `src/assistant-identity.js` centraliza a identidade local e o único alias de rota.
- Tela, títulos, navegação, mensagens, textos de ajuda, categorias de configurações, Sobre e campo conversacional preparatório usam Nautia.
- Classes/IDs/variáveis CSS usam `nautia-`; o stylesheet é `src/nautia.css`.
- O ícone local usa `data-icon="nautia"`, `createIcon('nautia')` e o símbolo `ocsis-nautia`. Não há IDs de ícones persistidos ou consumidores adicionais no projeto que exijam alias do símbolo antigo.
- As regiões de expansão são `nautia-avatar-slot`, `nautia-quick-actions` e `nautia-conversation-slot`. O campo `nautia-message` continua desabilitado.
- A aparência anterior foi preservada: base escura, ciano/roxo, capacete e órbitas. A área do avatar continua pronta para futura arte 2D/3D.

## Compatibilidade mantida

| Referência anterior | Tratamento |
| --- | --- |
| `#synclair` e variações de capitalização | Resolvidas para `#nautia` com `history.replaceState`, preservando o estado do histórico e sem adicionar uma etapa extra ao botão Voltar. |
| `showSynclairAvatar` em preferências v2 | Migrada para `showNautiaAvatar`, preservando inclusive o valor `false`. |
| `startup: "synclair"` em preferências v2 | Migrada para `startup: "nautia"`. Outros destinos continuam iguais. |
| Backups de preferências v1 | Migração anterior de layout/movimento preservada. |
| `PROMPT_FUTURO_SYNCLAIR.md` | Documento original mantido sem alteração como registro histórico; o prompt atual está em `PROMPT_FUTURO_NAUTIA.md`. |

Os aliases de persistência existem exclusivamente no leitor de v2 em `src/preferences.ts`. O schema atual não aceita nomes antigos em novas atualizações ou novos documentos v3. Documentos misturando as duas chaves de avatar são recusados, sem tentar adivinhar a preferência correta. Valores inválidos, campos desconhecidos e documentos incompletos continuam bloqueados.

O namespace de armazenamento **`ocsis.rocketbox.preferences`** foi mantido: ele já é neutro e específico do RocketBox. Não se cria uma segunda chave de preferências. A biblioteca permanece em `ocsis.rocketbox.workspace.v1`, sem alterações. Não existem chaves de chat local a migrar. Chaves de outros módulos/produtos não são percorridas nem modificadas.

O envelope passa para **`schemaVersion: 3`**, e o nome do arquivo exportado usa essa versão automaticamente. A leitura de v2 migra o snapshot em memória, sem reescrever o original durante o carregamento. A próxima gravação bem-sucedida salva v3 na mesma chave; uma exportação já produz v3. Na importação, o usuário mantém a etapa existente de revisar e aplicar. Falhas de escrita conservam o documento original e o estado anterior, sem duplicações ou gravações parciais.

As referências antigas restantes em produção são, portanto, o alias de rota e o bloco de migração v2. As demais estão em testes de compatibilidade, documentação da migração ou no registro histórico. `Synclaire` não é tratado como alias de rota: o nome global permanece separado da identidade local.

## Arquivos alterados

| Arquivo | Alteração |
| --- | --- |
| `src/assistant-identity.js` | Novo registro da identidade local e resolução do alias antigo. |
| `src/index.html` | Nome público, rota/IDs, texto de apresentação, acessibilidade, placeholders e import do stylesheet. |
| `src/main.js` | Título oficial e redirecionamento do acesso antigo. |
| `src/nautia.css` | Renomeado de `src/synclair.css`; seletores e variável de destaque atualizados, sem redesenhar o módulo. |
| `src/settings-ui.js` | Categoria, controle do avatar, inicialização, Sobre e nome versionado da exportação. |
| `src/preferences.ts` | Contrato v3 e migração estrita dos documentos v2. |
| `src/appearance.js`, `src/settings.css` | Preferência e seletores de visibilidade/estilo da Nautia. |
| `src/icons.js`, `src/icons.css`, `src/assets/icons/ocsis.svg` | Nome do símbolo e seletores locais atualizados; geometria preservada. |
| `tests/nautia-migration.test.js` | Sete testes adicionais de compatibilidade e integridade. |
| `PROMPT_FUTURO_NAUTIA.md` | Versão atual do prompt futuro, vinculada ao documento histórico preservado. |
| `README.md`, `docs/configuracoes.md`, `docs/icons.md` | Documentação operacional atualizada. |
| `docs/migracao-nautia.md` | Escopo, contratos, aliases, arquivos e validação desta etapa. |

## Testes realizados

- **37 testes passaram** com `npm test`: os 30 anteriores e 7 da migração.
- Os testes adicionais cobrem avatar visível/oculto, inicialização, preservação de outros ajustes, biblioteca e registro histórico, ausência de chaves duplicadas, reabertura do serviço, importação/exportação v2→v3, rejeição de ambiguidades e valores inválidos, falha de gravação, idempotência e separação da identidade global Synclaire.
- **`npm run build` passou** com TypeScript e Vite; stylesheet e sprite renomeados resolveram corretamente.
- **`cargo check --manifest-path src-tauri/Cargo.toml` passou**, com os avisos de cópia do cache incremental já existentes. A execução nativa recompilou e iniciou o aplicativo; o linker apresentou apenas uma mensagem informativa.
- No navegador, em `127.0.0.1:1422` com dados sintéticos, foram verificados redirecionamento do link antigo, variação em maiúsculas, reload da rota oficial, nomes e ícone na navegação/configurações, ausência de nomes antigos no texto visível e manutenção do campo conversacional desabilitado.
- Um backup v2 com `showSynclairAvatar: false`, `startup: "synclair"` e overlay personalizado foi importado pela interface. Após aplicar e reabrir sem hash, Nautia foi a tela inicial e o avatar continuou oculto. A exportação real baixada foi validada como v3, mantendo esses valores sem a chave antiga.
- Restaurar os padrões manteve os dois assets sintéticos e suas pastas. O estado padrão do avatar voltou a visível; não houve nova funcionalidade conversacional.
- Na janela **Tauri/WebView2**, o mesmo perfil isolado de validação criado na etapa anterior foi aberto com o URL antigo. A janela carregou `#nautia`, mostrou a identidade Nautia e manteve o menu superior previamente salvo. O perfil principal não foi alterado e a janela de teste foi encerrada.
- Nenhum erro de console foi observado na prévia. Imagem de conferência: `rocketbox-nautia.jpg`, na pasta de visualizações da sessão.

## Continuidade

O módulo continua preparatório. Não há chatbot funcional a testar nem histórico real a converter. O código específico do RocketBox usa Nautia; uma futura integração com Synclaire deverá manter seus próprios contratos e namespace, sem reaproveitar a identidade da assistente local.
