# Evolução dos comportamentos da NautIA

Implementação e validação em 17/11/2026. Complementa a integração inicial; o laboratório, o manifesto e os 73 PNGs continuam intactos.

## Correções e comportamento atual

O streaming era exibido como rascunho no rodapé enquanto o chat permanecia em “Processando”. Além disso, o callback de atividade voltava a `thinking` no fim de todas as rodadas, inclusive na resposta final. Agora:

1. Envio aceito inicia `thinking`, boca fechada, olhar/piscadas pensativos e balão.
2. O primeiro conteúdo textual não vazio entra no próprio balão de resposta do chat e inicia `speaking`. Avisos operacionais e quadros vazios não iniciam fala.
3. O streaming mantém a pose explicativa e a sequência original da boca. O relógio da boca reinicia na entrada de `speaking`, preservando o relógio das piscadas.
4. Consultas a ferramentas e revisão de evidências retornam a `thinking`; cada nova rodada textual pode iniciar nova fala. Textos transitórios não são salvos como respostas completas.
5. A conclusão fecha a boca e interpola os braços de volta à pose neutra. Respostas instantâneas admitem mínimo visual configurável de 0–1500 ms, padrão 450 ms, contado desde o primeiro conteúdo da rodada, sem segurar o texto. Streams longos não têm temporizador de encerramento da fala.
6. Respostas determinísticas sem streaming iniciam a breve apresentação somente ao disponibilizar o resultado, sem simular recebimento de tokens.
7. Cancelamento interrompe imediatamente a animação e o transporte existente; eventos atrasados são ignorados pelo ID da solicitação. O turno recebe `cancelled`/“Cancelada”, preservando a opção de tentar novamente e sem declarar o Ollama indisponível por causa da interrupção voluntária. Erros reais continuam em `uncertainty`, por quatro segundos.

O status/cancelamento do processamento fica em uma faixa compacta. O chat acompanha o conteúdo em streaming quando já está no fim; a navegação manual para mensagens anteriores é respeitada. No começo da geração, a rolagem usa posicionamento imediato para não confundir a animação de rolagem com uma saída voluntária do fim do chat.

Também foi corrigida a inicialização do avatar: o observador de visibilidade agora observa seu contêiner. Observar o Canvas oculto até `ready` impedia o próprio carregamento inicial dos sprites.

## Balão e privacidade

Balão CSS pequeno à esquerda da cabeça, com superfície escura, borda cyan, duas partículas e flutuação discreta. Está presente somente em `thinking`; desaparece na entrada da fala. Frases fixas alternam a cada três segundos no mesmo loop de animação, sem repetição consecutiva. O modo explícito Organização e nomes de ferramentas autorizadas podem indicar a categoria; solicitações sem classificação conhecida permanecem genéricas.

Nenhuma mensagem, caminho ou metadado do usuário é reproduzido no balão. Não há chamada adicional ao modelo, interpretação extra do prompt ou afirmação de operação concluída.

## Inatividade, cabeça e despertar

| Estado | Corpo | Olhos | Boca | Cabeça |
|---|---|---|---|---|
| idle | original | Abertos, piscada normal | Fechada | 0° |
| thinking | thoughtful | Pensativos e intermediário 49.5 | Fechada | 0° |
| speaking | speaking | Piscada normal | Sequência original, 8 quadros/s | 0° |
| uncertainty | uncertain | Piscada normal | Sprite uncertain | 0° |
| drowsy | original | Semicerrados | Fechada | Transição até 1° |
| sleeping | standby | Fechados | Fechada | Transição até 3° |

Novo padrão: 60 segundos de inatividade, três segundos de sonolência, depois sono. Valores de inatividade já salvos são respeitados; o valor encontrado nesta instalação era 120 segundos e foi restaurado após testar temporariamente com dez segundos. Ajustes ficam em **Comportamento**, junto da duração mínima de fala. Chaves locais: `ocsis.nautia.avatar.sleepSeconds` e `ocsis.nautia.avatar.minimumSpeakingMs`. Estados transitórios não são persistidos.

O grupo existente contém capacete traseiro (12), cabelo (13), rosto (15), olhos, boca, sobrancelhas, visor e capacete frontal (71); exclui o pescoço (14). Todos recebem o mesmo pivô `(1287,935)`, junto da base do pescoço, e a mesma rotação. A inclinação leva 900 ms e não altera posições ou pixels das peças. O corpo mantém a interpolação original de 220 ms.

Interação por ponteiro, teclado ou rolagem remove os Zzz e zera a inclinação imediatamente. Os olhos passam por `half` durante 180 ms antes de abrir. Enviar uma mensagem tem prioridade e avança diretamente a `thinking`, sem aguardar o despertar. Processamento e streaming bloqueiam ambos os prazos de sono.

## Diagnóstico e ciclo de vida

Em **Diagnóstico do avatar**, no próprio painel, há controles para pensamento/balão, streaming visual, pose explicativa, sonolência, sono, despertar, interrupção por nova mensagem e encerramento. A simulação é rotulada e utiliza um controlador isolado: não chama Ollama, não opera a biblioteca e não grava conversas. Fechar o painel, desmontar o componente ou iniciar uma solicitação real encerra seus efeitos e intervalos.

Há um único RAF para composição, limitado a 30 desenhos por segundo; a troca de frases reaproveita esse loop. Ausência de visibilidade ou janela oculta pausa RAF e efeitos CSS. Desmontagem cancela RAF, observadores, listeners e a aquisição dos sprites. Cache e descarte compartilhados anteriores foram preservados.

`prefers-reduced-motion`, opção Efeitos de movimento e modo de desempenho desativam os movimentos, alternância da boca e inclinação. Zzz continuam como indicação estática. Para evitar trabalho contínuo nesse modo, a frase de pensamento também permanece estática.

## Arquivos desta evolução

Modificados:

- `src/services/nautiaAvatarState.ts`: estados, prioridades, prazos, mínimo visual e cancelamento.
- `src/services/nautiaKritaRig.js`: combinações de sprites, relógio da boca, grupo da cabeça e despertar.
- `src/services/ollamaConversation.ts`: distinção entre texto gerado, andamento e ferramentas; fim das rodadas.
- `src/services/nautiaConversationStore.ts`: status de turno cancelado.
- `src/components/nautia/NautiaAvatar.tsx`: visibilidade inicial, frase, Zzz e suspensão de efeitos.
- `src/components/nautia/NautiaModuleView.tsx`: eventos reais, preferências, simulação isolada e streaming no chat.
- `src/components/nautia/NautiaChatThread.tsx`: resposta parcial e cancelamento.
- `src/components/nautia/nautiaAvatar.css`: efeitos leves e controles locais.
- `tests/nautia-avatar.test.js`, `tests/ollama.test.js`, `tests/nautia-conversational-2.test.js`.
- `docs/nautia-avatar-integration.md`: indicação de que o comportamento inicial foi atualizado.

Adicionados:

- `src/services/nautiaThoughts.ts`.
- `src/components/nautia/NautiaAvatarDiagnostics.tsx`.
- `tests/nautia-avatar-lifecycle.test.js`.
- Este relatório.

O diretório `dist/` foi regenerado pelo build. Não foram adicionadas dependências nem alterados serviços de assets ou código Rust.

## Validação

- `npm test`: **184 aprovados, zero falhas**. O teste existente de servidor precisa de loopback: na execução restrita ele falhou; a suíte completa passou após execução com esse acesso, sem modificar o teste.
- `npm run build`: **aprovado**, incluindo preparação local já existente, TypeScript e Vite; aviso existente de chunks superiores a 500 kB permanece.
- Integridade SHA-256 dos 73 PNGs verificada pela suíte.
- Comparação dos comandos de Canvas com o controlador original do laboratório para seis estados, configurando no laboratório as combinações e ângulos solicitados nesta evolução.
- Testes de 20 ciclos de interação/cancelamento, eventos atrasados, erro, descarte, sono em duas fases e mínimo contado só após início de fala.
- Testes de fluxo NDJSON controlado: primeiro conteúdo, quadros vazios, ferramentas, interrupção e preservação do estado após cancelamento.
- Teste de montagem com Canvas inicialmente oculto, aquisição via contêiner visível, suspensão fora da tela/janela oculta e liberação ao desmontar.
- Na janela Tauri: pensamento com balão, resposta real de oito parágrafos do modelo local `nautia:0.1`, pose explicativa durante o streaming e retorno ao repouso; cancelamento durante geração e rótulo “Cancelada”; sono por inatividade com dez segundos e despertar por clique; controles de diagnóstico, incluindo simulação de streaming e interrupção; alternância entre modos compacto/completo.

Executável efetivamente iniciado: `src-tauri/target/debug/rocket-box.exe`, PID 19284, carregando o frontend atualizado de `http://127.0.0.1:1420/`. Executável nativo pré-existente, de 16/11/2026; este trabalho é inteiramente frontend e não o recompilou. Não foi gerado instalador.

Capturas da validação em `.qa/branding/`:

- `nautia-behavior-chat.jpg`: streaming real com pose explicativa.
- `nautia-behavior-sleeping.jpg`: sono com capacete e cabeça inclinados juntos, olhos fechados e Zzz.
- `nautia-behavior-final.jpg`: retorno ao modo completo, cancelamento concluído e repouso.

Foi criada uma conversa identificada como teste de comportamento, mantida no histórico para revisão. Nenhum registro de biblioteca ou arquivo de asset foi alterado pelos testes.

## Limites

Não há áudio nem sincronização fonética; a boca representa geração de texto. O mínimo visual curto não é uma estimativa de leitura. A validação visual ocorreu na janela desktop de 1280×800 e no modo compacto; não constitui teste de todos os tamanhos de janela ou monitores/DPI. Não foi realizado perfil prolongado de memória/GPU. O limite de geração já existente de 120 segundos permanece. Os diagnósticos são simulações explicitamente isoladas, não prova de sucesso de operações reais.
