# NautIA Intelligence — Ollama local

> Registro da Etapa 08. A Etapa 10 acrescentou perfil `nautia:0.1`, reconexão automática, restauração da conversa ativa e memória limitada com resultados de ferramentas. A configuração e o uso atuais estão em [NautIA LLM Foundation](../ai/Nautia_llm/README.md); os detalhes abaixo descrevem a implementação e a validação originais.

## Implementação

O cliente LLM anterior era um planejador JSON sem streaming e sem detecção real de disponibilidade. Foi preservado para compatibilidade de código; o fluxo de conversa Ollama agora usa `ollamaClient.ts` e `ollamaConversation.ts`, reutilizando configuração tipada, histórico, UI e Tool System.

No Tauri, `ollama.rs` faz HTTP assíncrono em loopback e transmite bytes por `Channel`. Endpoint aceita HTTP em localhost/127.0.0.1/::1 com porta configurável, sem credenciais, query ou caminho. As únicas rotas são `/api/tags` e `/api/chat`. Redirecionamentos e proxy são desabilitados. Cancelamento aborta a tarefa nativa; limite de 4 requisições, 120 segundos e 2 MiB de resposta, 256 KiB de corpo. No browser, fetch continua disponível e depende de CORS configurado pelo usuário no Ollama.

Configuração persiste separadamente em `ocsis.nautia.ollama.v1`. Não existe modelo padrão presumido. “Testar conexão / Listar modelos” usa `/api/tags` e apresenta apenas modelos locais, excluindo entradas remotas/cloud identificadas. Nenhum download é iniciado. Estado conectado depende de resposta real recente e modelo presente na lista; expira após 60 segundos e é revalidado no envio.

Streaming lê NDJSON com decoder incremental, limites de tamanho, tratamento de término prematuro e erros. O rascunho aparece separado enquanto a resposta ainda está em geração. Cancelamento preserva o histórico com mensagem explícita. Nova conversa e reabertura continuam na interface existente. Mensagens finais usam a persistência de conversas existente (últimas 20 conversas); rascunhos parciais não são respostas concluídas salvas.

## Ferramentas e grounding

As 13 ferramentas têm schemas JSON enviados a `/api/chat`, mas a validação definitiva permanece no Tool System. Até 4 rodadas e 12 chamadas por mensagem. Consultas retornam resultados oficiais em mensagens de papel `tool` para nova geração; alterações retornam um Action Plan imediatamente e não são executadas pela LLM.

Não são enviados arquivos ou bytes de assets. Contexto só é consultado por ferramenta; resultados para o modelo são reduzidos a 20 itens por array, textos limitados e sem caminhos físicos/evidências completas. O histórico enviado é limitado a 12 turnos textuais. Metadados e nomes são tratados como dados não confiáveis nas instruções do sistema; validação e aprovação continuam obrigatórias independentemente do texto gerado. Prompt não garante ausência de alucinações: o balão identifica sugestão da LLM e os resultados oficiais permanecem disponíveis no bloco expansível.

Modelos que recusam ferramentas com erro HTTP 400 recebem uma tentativa de conversa sem ferramentas. Nesse modo o sistema orienta informar a impossibilidade de consultar/operar a biblioteca. Erros e indisponibilidade preservam o interpretador e as ações rápidas determinísticas; essas ações rápidas não dependem de LLM mesmo quando Ollama está selecionado.

## Usar

Reinicie o processo desktop para carregar o transporte nativo novo. Em NautIA → Configurar NautIA, escolha Ollama Local, mantenha ou informe o endpoint local, clique em Testar conexão/Listar modelos, selecione um dos modelos instalados e teste novamente. Converse normalmente; revise os planos antes de confirmar. O provedor OpenAI compatível legado não faz parte deste fluxo local novo.

## Validação desta etapa

- Ollama local respondeu à consulta de modelos com `qwen3.5:4b`; nenhum modelo foi baixado.
- Smoke real por streaming retornou “conexão local funcionando.”.
- Smoke real de ferramentas: o modelo solicitou `getCurrentContext`, recebeu contexto vazio de teste e respondeu “Agora não há assets selecionados.”. Nenhum dado da biblioteca pessoal foi usado nesses smokes.
- Testes controlados cobrem streaming fragmentado/UTF-8, cancelamento, respostas incompletas, whitelist de endpoint, exclusão de modelos remotos, retorno de ferramentas ao modelo, redução de dados, ferramenta inválida e alteração sem aprovação.
- Build frontend, compilação Rust e testes automatizados executados. O transporte IPC e a UI não foram exercitados manualmente de ponta a ponta nesta etapa; os smokes reais usaram o cliente HTTP no Node.

Referências do protocolo: https://docs.ollama.com/api/chat ; https://docs.ollama.com/api/tags ; https://docs.ollama.com/capabilities/tool-calling
