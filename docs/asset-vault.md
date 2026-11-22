# ETAPA13 — Asset Vault, Backup e Export

## Uso

No inspetor do Convés, **Mostrar no Explorador de Arquivos** revela o original existente. Se ele estiver ausente e a pasta pai existir, abre a pasta e explica que o arquivo está ausente. Se ambos faltarem, apresenta erro com orientação de recuperação.

**Localizar novamente** usa o seletor nativo e reaproveita `inspecionar_recurso`. Exige mesmo formato, assinatura quando suportada e estrutura Unity para diretórios Unity. Mostra caminho anterior/novo, tamanho, assinatura, avisos e comparação SHA-256 com a entrada do original no último backup do registro, quando disponível. Diferença de conteúdo fica explícita. A confirmação reconsulta a inspeção e a comparação; mudança detectada exige nova revisão. O serviço central aplica a referência em transação, preservando ID, pasta, etiquetas e datas de cadastro. Atualiza `sourcePath`, metadados físicos e invalida a análise técnica antiga. Não move nem modifica o original.

Em **Configurações → Sistema e Desempenho → Asset Vault**, escolha um diretório existente e separado do código-fonte e dos originais, ative o cofre e salve. Padrões: desativado, 10 GiB, cinco versões por registro, automático desligado. Configuração própria em `app_data_dir/asset-vault-config.json`; não altera o esquema do workspace nem exportações das preferências. Substituição atômica usa `MoveFileExW(REPLACE_EXISTING | WRITE_THROUGH)` no Windows. Trocar o diretório não migra ou apaga cópias antigas; reabra o diretório anterior na configuração para acessá-las.

O automático é opt-in e ocorre somente após cadastro ou relink de asset individual, copiando apenas o original. Não monitora alterações no disco, não varre a biblioteca na inicialização e não copia projetos/pacotes automaticamente. Falha de backup é informada sem desfazer um cadastro/relink válido.

## Escopos e revisão

- **Somente original**: um arquivo, com aviso de que dependências não foram incluídas.
- **Original + dependências**: lê `buffers[].uri` e `images[].uri` de glTF, `mtllib` de OBJ e mapas de textura de MTL. URIs `data:` ficam embutidas. Dependências mantêm caminhos relativos.
- **Arquivos explícitos do projeto**: lista manual de arquivos relativos, um por linha. Base: diretório selecionado ou pai do arquivo original. Não percorre diretórios recursivamente. Unity inicia nesse escopo. Projetos Blender/Unreal podem copiar o arquivo principal ou usar seleção explícita; o app não promete um projeto completo pela cópia do descritor.

**Preparar backup** e **Exportar original** mostram arquivos, tamanho e avisos antes de **Copiar escopo revisado**. O backend refaz o plano e compara raiz, escopo efetivo, lista, tamanho e fingerprint SHA-256 de todos os conteúdos com a revisão recebida. Repete a checagem antes da publicação. Mudança exige preparar novamente; não inclui arquivos ou bytes adicionais silenciosamente.

Dependências ausentes, remotas, com `..`, caminho absoluto ou URI codificada/ambígua são recusadas. MTL com opções de mapa que não possam ser interpretadas sem ambiguidade exige seleção explícita. Descritores limitados a 8 MiB, escopos a 10.000 arquivos. Não há download de dependências, reescrita de URIs ou descoberta de referências internas de `.blend`, FBX, Unreal, Unity e plugins de terceiros.

## Cópias, integridade e recuperação

As versões ficam em `rocketbox-vault-v1/v<timestamp>-<job>/manifest.json` e `files/`. Manifesto versionado registra ID, origem, escopo, data, avisos, nomes relativos, tamanhos e SHA-256. Originais permanecem somente leitura. A cópia usa diretório temporário no mesmo volume, arquivos `create_new`, `sync_all`, hashes de origem/destino e nova leitura da origem. A versão só fica visível após renomear o diretório completo. Limite de uso, limite de versões e espaço livre do volume são checados antes da cópia. Limites bloqueiam novas versões; não eliminam backups automaticamente.

A listagem sempre devolve `verification: not_checked`, independentemente do estado gravado no manifesto. Nunca considera o conteúdo íntegro só porque há manifesto. **Verificar cópia** executa leitura de tamanhos e hashes em `spawn_blocking` e retorna `verified_now` somente para a operação bem-sucedida. A criação registra `verified_at_copy`, que descreve aquele momento, não uma garantia permanente. O resultado da verificação exibido na interface é local à sessão.

**Restaurar em…** verifica todos os arquivos antes e durante a cópia, funciona mesmo sem o original e usa o diretório escolhido. Exportação do original não exige cofre habilitado. Ambas publicam uma subpasta com identificador da versão/exportação; destino existente é recusado, sem substituir arquivos. Restaurar não muda automaticamente a referência: revise **Localizar novamente** se desejar apontar para a cópia recuperada. Nenhum conversor é simulado: só existe exportação dos bytes originais, pois não há adaptador real instalado.

Cópia, restauração, exportação e verificação usam worker e aceitam cancelamento cooperativo entre blocos de 64 KiB e etapas. Temporários são removidos ao retornar por erro/cancelamento. A preparação do plano também roda fora da UI, mas não tem cancelamento exposto. Operações bloqueadas dentro do sistema operacional aguardam o retorno de I/O; não há interrupção rígida de leitura em unidade de rede.

Links simbólicos e reparse points/junctions são recusados na raiz do cofre, ancestrais, diretórios de versão, raiz `files`, dependências e destinos. Caminhos são validados novamente antes do uso. Isso evita escapes por árvores já redirecionadas; não constitui isolamento contra outro processo hostil trocando caminhos exatamente entre a validação e a abertura. A serialização de operações é por processo, não um lock distribuído entre múltiplas instâncias do aplicativo.

## Limpeza e limites reais

Configurações mostram uso lógico dos conteúdos registrados, espaço livre do volume e versões selecionáveis. **Revisar limpeza** mostra IDs e tamanho do lote; **Confirmar exclusão das cópias** é a etapa destrutiva explícita. Somente versões reconhecidas dentro da raiz do cofre são removidas. Originais, referências e lixeira virtual não são afetados.

- Uso contabilizado corresponde aos arquivos dos manifestos; não inclui custo de diretórios, manifestos, arquivos estranhos nem temporários de um processo encerrado abruptamente. Espaço livre vem do volume. Uma queda do processo pode deixar `.partial-*`; não são apresentadas como versões nem apagadas automaticamente. A limpeza dessas sobras é manual, com o aplicativo fechado.
- Manifesto malformado, link ou raiz `files` ausente bloqueia a leitura do cofre e a limpeza pelo app, preservando os dados para inspeção manual. Não há reparo silencioso nem restauração parcial.
- Não há criptografia, assinatura autenticada do manifesto, deduplicação, compressão, backup do workspace/localStorage, sincronização ou serviço em segundo plano. SHA-256 detecta alterações em relação ao manifesto; não protege contra adulteração coordenada do manifesto e dos arquivos.
- Publicação atômica depende da renomeação no mesmo sistema de arquivos. `sync_all` reduz perda por falha, mas não garante recuperação após toda falha de energia/controlador. Permissões, ACLs, timestamps e atributos especiais não são preservados.
- Espaço livre está implementado para Windows. Outros alvos retornam erro explícito em vez de afirmar espaço suficiente.
- A integração frontend compila; seletores nativos, layout e fluxos visuais não foram exercitados por CUA nesta entrega. Testes não utilizaram assets reais.

## Validação

`npm test`: suíte inteira, incluindo relink validado/persistente, falhas de assinatura/permissão/quota, duplicidade, concorrência e estrutura Unity. O teste existente de HTTP localhost precisa de rede local permitida no ambiente de execução.

`cargo test --manifest-path src-tauri/Cargo.toml`: fixtures temporárias para hash conhecido, glTF, OBJ/MTL, escopo explícito, traversal, dependências ausentes, revisão obsoleta, cancelamento, versões/quota, exportação sem cofre, restauração sem original, corrupção, conflitos de destino, configuração substituída repetidamente e junctions nas raízes de versão/arquivos. O teste de junction exige que o ambiente permita `mklink /J` apenas nas fixtures.

Builds: `npm --ignore-scripts run build` e `cargo build --manifest-path src-tauri/Cargo.toml`. `--ignore-scripts` evita executar o `prebuild` existente, que prepara arquivos em `ai/Nautia_llm`, fora do escopo autorizado desta etapa.
