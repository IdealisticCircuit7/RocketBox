const app = document.getElementById('app-container');
const wallpaper = document.getElementById('space-wallpaper');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)');
let enabled = true;
let parallaxEnabled = true;
let parallaxIntensity = 60;
let isHome = true;
let listening = false;
const mainStage = document.querySelector('.main-stage');
let frame = 0;
let previousTime = 0;
let x = 0;
let y = 0;
let targetX = 0;
let targetY = 0;
let bounds = { left: 0, top: 0, width: 1, height: 1 };

function paint() {
  wallpaper.style.setProperty('--parallax-x', `${x.toFixed(3)}px`);
  wallpaper.style.setProperty('--parallax-y', `${y.toFixed(3)}px`);
}
function renderParallax(time) {
  const elapsed = previousTime ? Math.min(time - previousTime, 64) : 16;
  previousTime = time;
  const blend = 1 - Math.exp(-elapsed / 140);
  x += (targetX - x) * blend;
  y += (targetY - y) * blend;
  if (Math.abs(targetX - x) < .02 && Math.abs(targetY - y) < .02) {
    x = targetX;
    y = targetY;
    frame = 0;
    previousTime = 0;
  } else frame = requestAnimationFrame(renderParallax);
  paint();
}
function schedule() {
  if (!frame) frame = requestAnimationFrame(renderParallax);
}
function move(event) {
  if (event.pointerType !== 'mouse') return;
  const clamp = value => Math.max(-1, Math.min(1, value));
  // At maximum intensity, 10px / 7px displacement stays inside 12px overscan.
  targetX = clamp(((event.clientX - bounds.left) / bounds.width - .5) * 2) * -10 * parallaxIntensity / 100;
  targetY = clamp(((event.clientY - bounds.top) / bounds.height - .5) * 2) * -7 * parallaxIntensity / 100;
  schedule();
}
function reset(immediate = false) {
  targetX = targetY = 0;
  if (!immediate) { schedule(); return; }
  if (frame) cancelAnimationFrame(frame);
  frame = previousTime = x = y = 0;
  paint();
}
function leave() { reset(); }
function measureScene() {
  const top = isHome ? mainStage.getBoundingClientRect().top : 0;
  document.body.style.setProperty('--wallpaper-top', `${Math.max(0, top)}px`);
  bounds = wallpaper.getBoundingClientRect();
  reset(true);
}
function updateMotion() {
  const active = enabled && parallaxEnabled && parallaxIntensity > 0 && isHome && !reducedMotion.matches && finePointer.matches && !document.hidden;
  if (active === listening) return;
  listening = active;
  wallpaper.classList.toggle('parallax-active', active);
  if (active) {
    mainStage.addEventListener('pointermove', move, { passive: true });
    mainStage.addEventListener('pointerleave', leave);
  } else {
    mainStage.removeEventListener('pointermove', move);
    mainStage.removeEventListener('pointerleave', leave);
    reset(true);
  }
}
export function syncMotion(value) { enabled = value; updateMotion(); }
export function configureParallax(value, intensity) { parallaxEnabled = value; parallaxIntensity = Math.max(0, Math.min(100, intensity)); reset(true); updateMotion(); }
export function setCinematicView(view) {
  isHome = view === 'home';
  app.classList.toggle('is-home', isHome);
  measureScene();
  updateMotion();
}
reducedMotion.addEventListener('change', updateMotion);
finePointer.addEventListener('change', updateMotion);
document.addEventListener('visibilitychange', updateMotion);
// Observe layout changes too (header wrapping, zoom, and switching menu position).
const sceneObserver = new ResizeObserver(measureScene);
sceneObserver.observe(mainStage);
window.addEventListener('resize', measureScene, { passive: true });

export async function initializeCinematic(motionEnabled) {
  syncMotion(motionEnabled);
  const splash = document.getElementById('splash-screen');
  app.inert = true;
  const logoImages = [...document.querySelectorAll('.home-logo, .splash-logo')];
  logoImages.forEach(img => img.addEventListener('error', () => {
    img.hidden = true;
    const fallback = document.createElement('p');
    fallback.className = 'logo-fallback';
    fallback.textContent = 'RocketBox by OCSIS';
    img.after(fallback);
  }, { once: true }));
  const background = new Image();
  background.src = document.querySelector('.wallpaper-scene').src;
  // Image readiness drives the exit. No minimum loading delay or fake progress.
  const readiness = Promise.allSettled([...logoImages.map(img => img.decode()), background.decode()]);
  let watchdog;
  await Promise.race([readiness, new Promise(resolve => { watchdog = setTimeout(resolve, 8000); })]);
  clearTimeout(watchdog);
  splash.classList.add('is-ready');
  app.inert = false;
  const remove = () => splash.remove();
  splash.addEventListener('transitionend', remove, { once: true });
  setTimeout(remove, reducedMotion.matches ? 0 : 750);
}
