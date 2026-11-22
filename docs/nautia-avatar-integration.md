# Integração do avatar animado da NautIA

> Registro da integração inicial. O comportamento atual de streaming, sonolência, sono, despertar e diagnóstico está documentado em [nautia-avatar-behavior.md](nautia-avatar-behavior.md), que substitui as descrições dessas partes abaixo.

Implementação de 17/11/2026 conforme plano aprovado. O laboratório original não foi modificado.

## Reutilização e integridade

Origem: `SIA_NautIA/Resultado final/NautIA-Avatar-Krita`.

- Copiados `krita-manifest.json` e os 73 PNGs referenciados, sem regenerar, recortar ou recomprimir imagens.
- Comparação final direta entre origem e destino: zero divergências nos 73 arquivos; manifesto idêntico por SHA-256.
- Coordenadas, dimensões, ordem, opacidade, `sourceRect`, grupo da cabeça, pivô e deslocamentos faciais preservados.
- Preservado o intermediário pensativo `49.5`, inclusive seu recorte de origem.
- Não copiados a interface de teste, servidor Python, simulação de conversa, arquivos Krita ou conteúdo de `_quarantine`.

## Arquivos

Adicionados:

- `src/assets/nautia-avatar/krita-manifest.json` e `krita-assets/`.
- `src/services/nautiaKritaRig.js`: lógica extraída do laboratório, sem dependência dos controles DOM. Mantém seleção de sprites, composição e interpolação smoothstep de 220 ms.
- `src/services/nautiaAvatarState.ts`: estado transitório central, IDs de solicitação, inatividade e limpeza dos timers.
- `src/services/nautiaAvatarResources.ts`: URLs locais reconhecidas pelo Vite, aquisição sob demanda e cache compartilhado.
- `src/components/nautia/NautiaAvatar.tsx` e `nautiaAvatar.css`: apresentação Canvas, visibilidade, preferências de movimento e fallback.
- `tests/nautia-avatar.test.js`.
- `tests/fixtures/nautia-lab-reference.js`: cópia exata do controlador original exclusivamente para comparação automatizada; não importada pelo aplicativo.

Modificados:

- `src/components/nautia/NautiaModuleView.tsx`: substituição do retrato principal, eventos da solicitação e ajuste de inatividade.
- `src/services/ollamaConversation.ts`: callback opcional `onActivity`, distinguindo conteúdo real dos avisos operacionais. Os consumidores antigos de `onText` continuam compatíveis.
- `tests/ollama.test.js`: teste das fases entre geração textual e ferramentas.

Retratos pequenos das mensagens e ícones da navegação permanecem estáticos. Não houve alterações em ferramentas de negócio, persistência de assets ou arquivos originais do usuário. O controlador do laboratório foi adaptado, sem uma biblioteca externa de animação.

## Estados

| Estado | Corpo | Olhos / boca / sobrancelhas |
| --- | --- | --- |
| idle | original | Piscar normalmente; boca fechada; neutras |
| thinking | thoughtful | Olhar e piscada pensativos; boca fechada; thinking |
| speaking | speaking | Piscada normal; sequência original de fala a 8 quadros/s; neutras |
| uncertainty | uncertain | Piscada normal; boca uncertain; sobrancelhas uncertain |
| sleeping | standby | Olhos semicerrados com piscada; boca sleepy; sobrancelhas sleepy |

Speaking mantém apenas `63/64/65` levantados e `8/10/11` neutros. O braço esquerdo anatômico fica elevado no lado direito da imagem. Sobrancelhas e boca são as variantes existentes, inclusive as reutilizações declaradas no manifesto. Não foram inventadas peças.

## Eventos reais

- Envio aceito → thinking.
- Trecho não vazio de texto gerado pelo Ollama → speaking.
- Fim da rodada textual, consulta a ferramentas ou nova rodada → thinking.
- Fim normal → idle e boca fechada.
- Cancelamento pelo AbortController → idle.
- Exceção, timeout, resultado com `failed` ou falha na execução de plano → uncertainty por 4 segundos, depois idle.
- Inatividade sem solicitação ativa → sleeping; interação por ponteiro, teclado ou rolagem desperta.

Avisos operacionais de `onText` não acionam a fala. A associação por ID impede que eventos atrasados de solicitações anteriores mudem a animação atual. Recusas são tratadas a partir de falhas estruturadas, sem classificar palavras livres da resposta como erros.

O ajuste “Inatividade”, dentro do painel do avatar, permite 10–3600 segundos e inicia em 120. Somente esse ajuste é salvo em `ocsis.nautia.avatar.sleepSeconds`; os estados de animação não entram no histórico ou banco. O padrão foi restaurado para 120 segundos ao finalizar a conferência.

O retorno das ações determinísticas não ganha streaming artificial. A animação representa geração textual, não áudio ou sincronização labial.

## Recursos e ciclo de vida

- Carregamento somente quando o Canvas se torna visível; a referência completa do Krita não é carregada em produção.
- Imagens compartilhadas entre montagens. O cache é liberado 10 segundos após a última instância ser desmontada, permitindo remontagens rápidas sem duplicar os sprites.
- Canvas com coordenadas internas do manifesto e apresentação proporcional via `object-fit:contain`, sem recortar poses.
- Tamanho do Canvas definido na montagem, sem redefinição por quadro.
- Limite de 30 desenhos por segundo; quadros com composição idêntica são ignorados.
- A renderização para quando o avatar sai da área visível ou a janela fica oculta. Ao voltar, recupera o estado comportamental atual.
- Movimento reduzido, animações desativadas e modo de desempenho suspendem as animações contínuas e exibem a pose estática correspondente.
- Limpeza de requestAnimationFrame, IntersectionObserver, MutationObserver, listeners de visibilidade/preferências e timers.

Os PNGs somam cerca de 18,4 MiB em disco e 114,3 MiB estimados decodificados em RGBA, além das despesas do navegador. Isso é uma estimativa pelos pixels, não uma medição do consumo total do processo.

## Validação realizada

**Automatizada:** 175 testes aprovados, zero falhas. Entre os testes adicionados estão:

- SHA-256 dos 73 PNGs.
- Comparação dos comandos Canvas com o controlador original para idle, thinking, speaking, uncertainty e sleeping: ordem, imagens, coordenadas, transformações e opacidades.
- Interrupção de transições, pesos limitados entre 0 e 1 e braços corretos em speaking.
- Sequência da boca e sobrancelhas independentes da piscada.
- Piscada pensativa: 49 → 49.5 → 45 → 49.5 → 49.
- IDs de solicitações, rejeição de eventos atrasados, cancelamento, erro, adormecimento e descarte de timers do estado.
- Eventos de streaming antes/depois de ferramentas, sem fala para mensagens operacionais. Esse teste usa transporte controlado, não uma LLM simulada apresentada como validação real.

**Aplicação desktop:** aberto `src-tauri/target/debug/rocket-box.exe` com o frontend atual em `http://127.0.0.1:1420/`.

- Avatar completo exibido no painel existente, sem deformação aparente, em janela de aproximadamente 1280 × 830.
- Conversa real com o modelo local `nautia:0.1`: thinking observado, speaking capturado durante o rascunho real e retorno a idle após conclusão.
- Braço explicativo correto na captura do streaming.
- Sleeping observado após configuração temporária de 10 segundos; retorno a idle e restauração do padrão de 120 segundos.
- Modo compacto ocultou o avatar; modo completo remontou e exibiu idle.
- Criada uma conversa de teste identificada por “Teste de integração do avatar”, sem executar operações na biblioteca. A conversa foi preservada, assim como os históricos anteriores.

**Build:** `npm --ignore-scripts run build` aprovado (TypeScript e Vite), após as alterações finais. Mantido o aviso de bundles maiores que 500 kB. Nenhum código Rust foi alterado; os instaladores anteriores não foram regenerados nesta etapa.

Evidências:

- `.qa/branding/nautia-avatar-speaking.jpg`: streaming real e pose explicativa.
- `.qa/branding/nautia-avatar-integrated.jpg`: apresentação completa após retornar ao neutro.

## Limites da conferência

- As tentativas de clicar em Cancelar na automação desktop não produziram confirmação visível de cancelamento; a solicitação terminou normalmente. Cancelamento está coberto nos testes de transporte/estado, mas a confirmação manual de ponta a ponta pelo botão permanece pendente.
- Incerteza foi comparada automaticamente com o laboratório, mas não foi provocada uma falha de serviço de propósito na janela.
- Não foi feita uma medição prolongada de memória/GPU nem uma matriz visual de todas as resoluções. A limpeza foi implementada; faltam medições de consumo após sessões longas e repetidos ciclos completos de UI.
- Não foi validada uma rodada real de ferramentas com o Ollama nesta sessão; a separação das fases nesse caso foi verificada pelo teste de transporte controlado.
- A rotação da cabeça permaneceu em zero, com os agrupamentos originais preservados; não foi feita correção nova desse sistema.
