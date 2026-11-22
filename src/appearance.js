import { syncMotion, configureParallax } from './cinematic.js';

export const WALLPAPERS = {
  close: new URL('./assets/branding/launch-wallpaper-close-extended.png', import.meta.url).href,
  original: new URL('./assets/branding/launch-wallpaper.png', import.meta.url).href,
  wide: new URL('./assets/branding/launch-wallpaper-wide.png', import.meta.url).href,
};
export const WALLPAPER_POSITIONS = { cinema: '70% 12%', center: '50% 50%', right: '85% 25%' };

export function initializeAppearance() {
  let tips = true;
  function tooltips() {
    document.querySelectorAll('[title], [data-context-title]').forEach(node => {
      if (node.hasAttribute('title')) node.dataset.contextTitle = node.title;
      if (tips) node.title = node.dataset.contextTitle;
      else node.removeAttribute('title');
    });
  }
  new MutationObserver(tooltips).observe(document.getElementById('app-container'), { childList: true, subtree: true });
  return function apply(p) {
    const root = document.documentElement, app = document.getElementById('app-container');
    root.style.setProperty('--cyan', { cyan:'#00D4FF', blue:'#65adff', purple:'#ba8cff' }[p.accent]);
    root.dataset.theme = p.theme;
    root.dataset.density = p.density;
    root.classList.toggle('performance-mode', p.performance);
    root.classList.toggle('no-animations', !p.animations || !p.animationIntensity || p.performance);
    root.classList.toggle('no-lighting', !p.lighting || !p.glow || p.performance);
    root.classList.toggle('hide-metadata', !p.showMetadata);
    root.classList.toggle('hide-nautia-avatar', !p.showNautiaAvatar);
    root.style.setProperty('--panel-alpha', (p.performance ? 100 : p.panelOpacity) / 100);
    root.style.setProperty('--glow-opacity', p.glow / 100);
    root.style.setProperty('--ui-duration', `${Math.round(80 + p.animationIntensity * 1.54)}ms`);
    root.style.setProperty('--motion-lift', `${(p.animationIntensity / 100 * 6).toFixed(2)}px`);
    root.style.setProperty('--wallpaper-position', WALLPAPER_POSITIONS[p.wallpaperPosition]);
    root.style.setProperty('--wallpaper-dim', p.overlay / 100);
    app.classList.remove('layout-left', 'layout-top'); app.classList.add(p.layout);
    app.classList.toggle('icons-only', !p.showNavLabels);
    app.classList.toggle('compact-menu', p.compactMenu);
    document.getElementById('layout-toggle').value = p.layout;
    document.getElementById('motion-toggle').checked = p.animations;
    document.getElementById('motion-toggle').disabled = p.performance;
    const image = document.querySelector('.wallpaper-scene');
    if (image.getAttribute('src') !== WALLPAPERS[p.wallpaper]) image.src = WALLPAPERS[p.wallpaper];
    configureParallax(p.parallax && !p.performance, p.parallaxIntensity);
    syncMotion(p.animations && !!p.animationIntensity && !p.performance);
    tips = p.tooltips; tooltips();
  };
}
