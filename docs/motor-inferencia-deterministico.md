# Motor determinístico — Etapa 05

Fluxo compartilhado: Convés e NautIA → `libraryOperationsService.queryDiagnostics` → `inferenceService.runStructuredInference` → Tauri `analisar_recurso` → worker Rust `technical_analysis.collect` → regras TypeScript → relatório associado ao asset em `analysisReport`.

## Coleta e regras

Identificação por extensão e metadados cadastrados continuam no serviço existente. A coleta física é separada em `collectedData`: tamanho e data, cabeçalhos suportados, versão no header BLEND/GLB, dimensões declaradas PNG, campos JSON UPROJECT/glTF e marcadores de diretório Unity. OBJ valida presença de linha de vértice; FBX valida indicador inicial; UNITYPACKAGE valida apenas container gzip, sem extração. Isso não prova integridade completa, compatibilidade de versão ou sucesso de importação.

`technicalRules.ts` versiona a política local e descreve escopo/origem/limitações. Regras antigas de metadados são reaproveitadas e identificadas no relatório. As origens são políticas de engenharia locais, não certificações do fornecedor. Atualizações semânticas devem incrementar `RULESET_VERSION`. Nenhum resultado novo declara compatibilidade total: regras de rejeição direta são preservadas e os demais resultados são limitados ou têm ressalvas.

O motor técnico não chama LLM nem envia dados pela rede. A consulta Python existente permanece como ferramenta legada independente; deixou de ser confundida com inspeção física neste fluxo.

## Limites

Leitura de até 1 MiB por recurso; JSON limitado ao mesmo tamanho; lote de até 100 assets; um worker físico por vez, rejeitando concorrência excessiva; consultas simultâneas ao mesmo caminho compartilham a promessa de coleta. Regras são leves e cedem a execução entre assets. Não há varredura recursiva ou descompressão de pacote.

O frontend deixa de aguardar após 6 segundos; o Rust verifica orçamento de 5 segundos após a coleta. Operações bloqueadas pelo sistema de arquivos não podem ser interrompidas por esse timeout: o worker mantém sua trava até retornar. Isso evita multiplicar workers, mas não equivale a cancelamento rígido de I/O de rede. O conteúdo lido nunca é executado ou gravado no original.

## Persistência e validade

O relatório contém asset, formato, data, versão de regras, contexto do cadastro, impressão do recurso, dados coletados, evidências, regras, avisos, erros, compatibilidade e verificações não realizadas. Erro ao salvar é retornado explicitamente pelo serviço.

Uma nova análise lê novamente os fatos limitados. Resultado anterior só é reutilizado com versão, contexto e impressão idênticos, sem erro físico. Mudança de cadastro/regra é sinalizada no botão do histórico do Convés. O último relatório salvo é histórico: mudanças externas são detectadas sob demanda, sem watcher contínuo.

A impressão combina tamanho, data de modificação, checksum do prefixo e metadados coletados. Não é hash criptográfico integral; não detecta adulterações fora do prefixo que preservem tamanho/data. Diretórios verificam os três marcadores e a data da raiz, sem validar conteúdo recursivo. Essas limitações aparecem nas verificações não realizadas.

## Testes

Fixtures Rust escritas em diretório temporário exclusivo: BLEND com header reconhecido e truncado, GLB mínimo, OBJ, UPROJECT válido/inválido, estrutura Unity, extensão desconhecida e recurso inexistente. Os fixtures verificam somente o escopo parcial implementado.

Testes TypeScript com contrato IPC controlado: persistência/reabertura da store, revalidação/cache, mudança da impressão, mudança de versão da regra, modo browser sem coleta física, erro de arquivo e limite de lote. Regressão do motor anterior adaptada ao novo contrato de coleta nativa.

O novo comando exige reinício do executável desktop. Builds e testes automatizados não substituem teste de importação em engines nem uma inspeção completa de arquivos de produção.
