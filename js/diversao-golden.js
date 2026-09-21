const GOLDEN_CHAMBER_CHANCE = 0.10;
const stage = document.getElementById('duel-stage');
const shotNodes = [...document.querySelectorAll('[data-shot]')];
const allyCards = document.getElementById('your-team');
const enemyCards = document.getElementById('enemy-team');
const chamberHud = stage?.querySelector('.chamber-hud');

function isAppleTouchWebKitRuntime() {
  const ua = String(navigator.userAgent || '');
  const appleTouch = /iPhone|iPad|iPod/i.test(ua)
    || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  return appleTouch && /AppleWebKit/i.test(ua);
}

const appleTouchWebKit = isAppleTouchWebKitRuntime();
if (appleTouchWebKit) {
  document.documentElement.dataset.diversaoWebkitSafe = 'v22';
  if (!document.querySelector('link[data-diversao-webkit-v22]')) {
    const safeCss = document.createElement('link');
    safeCss.rel = 'stylesheet';
    safeCss.href = './css/diversao-webkit-v22.css?v=20260827-diversao-webkit-v22-1';
    safeCss.dataset.diversaoWebkitV22 = 'true';
    document.head.appendChild(safeCss);
  }
}

if (stage && shotNodes.length === 6) {
  let goldenIndex = null;
  let triggerTimer = 0;
  let triggerFrame = 0;
  let goldenSettled = false;
  let reentryReported = false;

  const indicator = document.createElement('div');
  indicator.className = 'golden-chamber-indicator';
  indicator.hidden = true;
  indicator.innerHTML = '<span></span><strong>Câmara Dourada</strong><small data-golden-label></small>';
  chamberHud?.insertAdjacentElement('afterend', indicator);
  const indicatorLabel = indicator.querySelector('[data-golden-label]');

  function diagnostic(step, detail = {}) {
    try { window.echoArenaDiversaoDiagnosticV26?.checkpoint?.(step, detail); } catch {}
  }

  function activeIndexes(mode) {
    if (mode === 'rematch') return [3, 4, 5];
    if (mode === 'destiny') return [0, 1, 2];
    return [0, 1, 2, 3, 4, 5];
  }

  function clearGolden() {
    window.clearTimeout(triggerTimer);
    if (triggerFrame) window.cancelAnimationFrame(triggerFrame);
    triggerTimer = 0;
    triggerFrame = 0;
    goldenIndex = null;
    goldenSettled = false;
    reentryReported = false;
    delete stage.dataset.goldenChamber;
    stage.classList.remove('golden-armed', 'golden-shot');
    shotNodes.forEach(node => node.classList.remove('golden-ready', 'golden-active', 'golden-done'));
    [allyCards, enemyCards].forEach(container => {
      container?.querySelectorAll('.hero-draw-card.golden-reveal').forEach(card => card.classList.remove('golden-reveal'));
    });
    indicator.hidden = true;
    if (indicatorLabel) indicatorLabel.textContent = '';
  }

  function armGolden(mode = 'full', options = {}) {
    clearGolden();
    const forced = options.forced === true;
    if (!forced && Math.random() >= GOLDEN_CHAMBER_CHANCE) return null;

    const candidates = activeIndexes(mode);
    const requested = Number.isInteger(options.index) ? options.index : null;
    goldenIndex = requested !== null && candidates.includes(requested)
      ? requested
      : candidates[Math.floor(Math.random() * candidates.length)];
    const node = shotNodes[goldenIndex];
    if (!node) {
      clearGolden();
      return null;
    }

    stage.dataset.goldenChamber = String(goldenIndex);
    stage.classList.add('golden-armed');
    node.classList.add('golden-ready');
    indicator.hidden = false;
    if (indicatorLabel) indicatorLabel.textContent = `Pulso ${goldenIndex + 1} de 6`;

    document.dispatchEvent(new CustomEvent('echoarena:diversao-golden', {
      detail: { state: 'armed', index: goldenIndex, mode, forced }
    }));
    return goldenIndex;
  }

  function armForced(mode = 'full', preferredIndex = null) {
    const candidates = activeIndexes(mode);
    const index = Number.isInteger(preferredIndex) && candidates.includes(preferredIndex)
      ? preferredIndex
      : candidates[0];
    return armGolden(mode, { forced: true, index });
  }

  function markGoldenHero() {
    if (!Number.isInteger(goldenIndex)) return;
    const side = goldenIndex < 3 ? 'ally' : 'enemy';
    const cardIndex = goldenIndex < 3 ? goldenIndex : goldenIndex - 3;
    const container = side === 'ally' ? allyCards : enemyCards;
    const card = container?.querySelectorAll('.hero-draw-card.revealed')?.[cardIndex];
    if (card) card.classList.add('golden-reveal');
  }

  function activateGoldenFrame(node, expectedIndex) {
    triggerFrame = 0;
    if (goldenSettled) return;
    if (goldenIndex !== expectedIndex || shotNodes[expectedIndex] !== node || !node.classList.contains('active')) return;
    stage.classList.add('golden-shot');
    if (indicatorLabel) indicatorLabel.textContent = 'Ativa agora';
    window.clearTimeout(triggerTimer);
    triggerTimer = window.setTimeout(markGoldenHero, appleTouchWebKit ? 118 : 70);
  }

  function triggerGolden() {
    if (!Number.isInteger(goldenIndex) || goldenSettled) return;
    const node = shotNodes[goldenIndex];
    if (!node || !node.classList.contains('active') || node.classList.contains('golden-active')) return;
    node.classList.remove('golden-ready');
    node.classList.add('golden-active');

    if (appleTouchWebKit) {
      if (triggerFrame) window.cancelAnimationFrame(triggerFrame);
      const expectedIndex = goldenIndex;
      triggerFrame = window.requestAnimationFrame(() => activateGoldenFrame(node, expectedIndex));
    } else {
      activateGoldenFrame(node, goldenIndex);
    }

    document.dispatchEvent(new CustomEvent('echoarena:diversao-golden', {
      detail: { state: 'triggered', index: goldenIndex, forced: stage.dataset.qaGolden === 'true' }
    }));
  }

  function settleGolden() {
    if (!Number.isInteger(goldenIndex) || goldenSettled) return;
    const node = shotNodes[goldenIndex];
    if (!node || node.classList.contains('active')) return;
    if (!node.classList.contains('done')) return;

    goldenSettled = true;
    window.clearTimeout(triggerTimer);
    triggerTimer = 0;
    if (triggerFrame) {
      window.cancelAnimationFrame(triggerFrame);
      triggerFrame = 0;
    }
    node.classList.remove('golden-active', 'golden-ready');
    node.classList.add('golden-done');
    stage.classList.remove('golden-shot');
    if (indicatorLabel) indicatorLabel.textContent = 'Revelada';
    markGoldenHero();
    diagnostic('v30:golden-settled-once', { index: goldenIndex });
    document.dispatchEvent(new CustomEvent('echoarena:diversao-golden', {
      detail: { state: 'settled', index: goldenIndex, forced: stage.dataset.qaGolden === 'true' }
    }));
  }

  const shotObserver = new MutationObserver(() => {
    if (goldenSettled) {
      if (!reentryReported) {
        reentryReported = true;
        diagnostic('v30:golden-settle-reentry-blocked', { index: goldenIndex });
      }
      return;
    }
    triggerGolden();
    settleGolden();
  });
  shotNodes.forEach(node => shotObserver.observe(node, { attributes: true, attributeFilter: ['class'] }));

  const goldenController = Object.freeze({
    armForced,
    clear: clearGolden,
    isArmed: () => Number.isInteger(goldenIndex),
    isSettled: () => goldenSettled,
    getIndex: () => goldenIndex
  });
  Object.defineProperty(window, 'echoArenaDiversaoGolden', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: goldenController
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('#spin-button,[data-diversao-mode]');
    if (!button) return;
    const mode = button.dataset?.diversaoMode || 'full';
    armGolden(mode);
  }, { capture: true });

  document.addEventListener('echoarena:diversao-round-complete', () => {
    settleGolden();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stage.classList.remove('golden-shot');
  });

  window.addEventListener('pagehide', () => {
    shotObserver.disconnect();
    clearGolden();
  });
}
