# Ícones OCSIS

Família vetorial própria do RocketBox, com grade de 24 × 24, traço de 1,7 unidades, pontas e junções arredondadas, sem preenchimento e cor herdada via `currentColor`. Detalhes chanfrados, camadas e referências orbitais dão unidade sem reduzir a leitura.

## Fontes

- `src/assets/icons/ocsis.svg`: sprite local com os desenhos, sem dependências ou CDN.
- `src/icons.js`: montagem única do sprite, hidratação do HTML e criação de ícones dinâmicos.
- `src/icons.css`: tamanhos por contexto, alinhamento e estados. Não altere o traço de um ícone individual para ajustar seu tamanho.

| Contexto | Nome |
| --- | --- |
| Home / Início | `home` |
| Registrar Asset | `rocket` |
| Workspace / Biblioteca | `library` |
| Pastas / criar pasta | `folder`, `folder-add` |
| Etiquetas | `tags` |
| Consultas SIA / assistência | `sia` |
| Nautia | `nautia` |
| Configurações | `settings` |
| Personalização | `personalize` |
| Ajuda / notas explicativas / futuro Sobre | `help` |
| Automação / navegação / recomendações | `automation`, `navigation`, `recommendations` |
| Visualizador / conversa futura | `cube`, `message` |
| Editar / adicionar / remover | `edit`, `plus`, `close` |
| Lixeira / restaurar | `trash`, `restore` |
| Direções | `arrow-left`, `arrow-right`, `arrow-up-right` |

Os símbolos de Ajuda e Configurações foram aplicados a contextos existentes; não criam novos módulos ou ações sem implementação. Marca RocketBox, animação de abertura e ilustração reservada ao avatar não são ícones de controle e permanecem independentes.

## HTML

```html
<button type="button" aria-label="Adicionar etiqueta">
  <svg data-icon="plus" aria-hidden="true"></svg>
</button>
```

Chame `mountIcons()` no início do frontend. Para HTML inserido depois, use `mountIcons(container)` ou crie o SVG com a função abaixo. A montagem é idempotente.

## JavaScript

```js
import { createIcon } from './icons.js';
button.prepend(createIcon('folder-add'));
```

Todos os SVGs são decorativos (`aria-hidden`, `focusable=false`). Mantenha texto visível ou `aria-label` no controle; o desenho não deve substituir seu nome acessível. Nomes desconhecidos geram erro para evitar falhas silenciosas.

## Estados

Os ícones herdam a cor do componente. Na navegação, hover, foco e rota ativa usam o destaque cyan ou roxo já definido no botão. As ações desabilitadas mantêm opacidade reduzida e não recebem glow. Foco por teclado permanece no controle, e movimento reduzido desativa as transições.

## Tamanhos

20–21 px na navegação; 15–18 px em ações; 36 px nas pastas; 48 px nos cartões principais, reduzidos para 34–38 px em janelas menores. Os ícones antigos em PNG permanecem preservados nos assets, mas o cartão de registro agora utiliza a família SVG.
