const overlay = document.getElementById('sealed-clash');
const stage = document.getElementById('duel-stage');
const spinButton = document.getElementById('spin-button');
const spinLabel = document.getElementById('spin-label');
const rouletteHelp = document.getElementById('roulette-help');
const QA_RESULT = 'echoarena:diversao-qa-result';

let overlayWatchdog = 0;
let lastOpenAt = 0;

function post(type, detail = {}) {
  if (window.parent === window) return;
  window.parent.postMessage({ type: QA_RESULT, event: type, detail }, location.origin);
}

function unlockOverlay(reason = 'cleanup') {
  window.clearTimeout(overlayWatchdog);
  overlayWatchdog = 0;
  if (!overlay) return;
  overlay.classList.remove('is-open', 'is-closing');
  document.body.classList.remove('sealed-active');
  if (lastOpenAt) post('overlay-closed', { reason, durationMs: Math.round(performance.now() - lastOpenAt) });
  lastOpenAt = 0;
}

function armOverlayWatchdog() {
  window.clearTimeout(overlayWatchdog);
  lastOpenAt = performance.now();
  post('overlay-opened', { eventId: overlay?.dataset.event || 'standard' });
  overlayWatchdog = window.setTimeout(() => {
    if (!overlay?.classList.contains('is-open')) return;
    console.warn('[diversao] watchdog liberou overlay que permaneceu aberto além do ciclo esperado.');
    unlockOverlay('watchdog');
  }, 7800);
}

if (overlay) {
  const observer = new MutationObserver(() => {
    if (overlay.classList.contains('is-open')) armOverlayWatchdog();
    else if (lastOpenAt) {
      window.clearTimeout(overlayWatchdog);
      overlayWatchdog = 0;
      post('overlay-closed', { reason: 'normal', durationMs: Math.round(performance.now() - lastOpenAt) });
      lastOpenAt = 0;
      document.body.classList.remove('sealed-active');
    }
  });
  observer.observe(overlay, { attributes: true, attributeFilter: ['class', 'data-event'] });
}

stage?.addEventListener('animationend', event => {
  if (event.target !== stage) return;
  if (event.animationName?.includes('flash')) stage.classList.remove('flash-ally', 'flash-enemy');
  if (event.animationName === 'golden-stage-flash') stage.classList.remove('golden-shot');
});

window.addEventListener('pagehide', () => unlockOverlay('pagehide'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) unlockOverlay('hidden');
});

window.addEventListener('unhandledrejection', event => {
  const message = String(event.reason?.message || event.reason || 'erro assíncrono');
  if (!/diversao|tambor|roster|hero|round|audio/i.test(`${message} ${event.reason?.stack || ''}`)) return;
  console.error('[diversao] execução protegida capturou rejeição:', event.reason);
  unlockOverlay('runtime-error');
  if (spinButton && window.echoArenaDiversao?.isBusy?.() !== true) {
    spinButton.disabled = false;
    if (spinLabel) spinLabel.textContent = 'Tentar novamente';
  }
  if (rouletteHelp) rouletteHelp.textContent = 'Uma etapa visual falhou e foi encerrada com segurança. Você pode tentar novamente sem fechar o navegador.';
  post('runtime-error', { message });
});
