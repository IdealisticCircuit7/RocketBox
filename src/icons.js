import sprite from './assets/icons/ocsis.svg?raw';

const namespace = 'http://www.w3.org/2000/svg';
const CUSTOM_ICON_NAMES = new Set(['rocket', 'library', 'settings']);
const names = new Set(['home', 'rocket', 'library', 'folder', 'folder-add', 'tags',
  'sia', 'nautia', 'settings', 'personalize', 'help', 'book-open', 'automation', 'navigation',
  'recommendations', 'cube', 'message', 'edit', 'arrow-left', 'arrow-right',
  'arrow-up-right', 'plus', 'close', 'trash', 'restore']);

function createCustomIconElement(name, className = '') {
  const icon = document.createElement('span');
  const merged = ['ocsis-icon', 'ocsis-custom-icon', `ocsis-custom-icon--${name}`, className]
    .filter(Boolean)
    .join(' ');
  icon.setAttribute('class', merged);
  icon.dataset.customIcon = name;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function configure(svg, name) {
  if (!names.has(name)) throw new Error(`Ícone OCSIS desconhecido: ${name}`);
  if (CUSTOM_ICON_NAMES.has(name)) {
    const replacement = createCustomIconElement(name, svg.getAttribute('class') || '');
    svg.replaceWith(replacement);
    return replacement;
  }
  svg.classList.add('ocsis-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(namespace, 'use');
  use.setAttribute('href', `#ocsis-${name}`);
  svg.replaceChildren(use);
  return svg;
}

/** Decorative icons: accessible names belong to the surrounding control. */
export function createIcon(name, { className = '' } = {}) {
  if (!names.has(name)) throw new Error(`Ícone OCSIS desconhecido: ${name}`);
  if (CUSTOM_ICON_NAMES.has(name)) {
    return createCustomIconElement(name, className);
  }
  const svg = document.createElementNS(namespace, 'svg');
  if (className) svg.setAttribute('class', className);
  return configure(svg, name);
}

/** One local sprite; no external requests or dependency on an icon CDN. */
export function mountIcons(root = document) {
  if (!document.getElementById('ocsis-icon-sprite')) {
    document.body.insertAdjacentHTML('afterbegin', sprite);
  }
  root.querySelectorAll('svg[data-icon]').forEach(svg => configure(svg, svg.dataset.icon));
}
