const ROOTS = [
  document.getElementById('your-team'),
  document.getElementById('enemy-team')
].filter(Boolean);

function isAppleTouchWebKitRuntime() {
  const ua = String(navigator.userAgent || '');
  const appleTouch = /iPhone|iPad|iPod/i.test(ua)
    || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  return appleTouch && /AppleWebKit/i.test(ua);
}

if (isAppleTouchWebKitRuntime() && ROOTS.length) {
  const settling = new WeakSet();
  const settled = new WeakSet();

  document.documentElement.dataset.diversaoGoldenLifecycle = 'v27';

  const nextFrame = () => new Promise(resolve => window.requestAnimationFrame(resolve));

  function diagnostic(step, card) {
    try {
      window.echoArenaDiversaoDiagnosticV26?.checkpoint?.(step, {
        hero: card?.getAttribute('aria-label') || '',
        prepared: card?.classList.contains('prepared') === true,
        revealed: card?.classList.contains('revealed') === true
      });
    } catch {}
  }

  async function afterPaint() {
    await nextFrame();
    await nextFrame();
  }

  function waitForPreparedMask(card) {
    const mask = card.querySelector('.prepared-mask');
    if (!mask) return afterPaint();

    const style = window.getComputedStyle(mask);
    const animationName = String(style.animationName || '');
    const animationDuration = String(style.animationDuration || '');
    const animated = animationName !== 'none' && animationDuration !== '0s' && animationDuration !== '0ms';
    if (!animated) return afterPaint();

    return new Promise(resolve => {
      let finished = false;
      let timeoutId = 0;

      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeoutId);
        mask.removeEventListener('animationend', onAnimationEnd);
        afterPaint().then(resolve);
      };

      const onAnimationEnd = event => {
        if (event.target !== mask) return;
        finish();
      };

      mask.addEventListener('animationend', onAnimationEnd);
      timeoutId = window.setTimeout(finish, 480);
    });
  }

  async function settleGoldenCard(card) {
    if (settling.has(card) || settled.has(card)) return;
    settling.add(card);
    card.dataset.goldenDeferredV27 = 'true';
    diagnostic('v27:golden-deferred-until-card-settles', card);

    await waitForPreparedMask(card);

    if (!card.isConnected || !card.classList.contains('revealed')) {
      settling.delete(card);
      return;
    }

    settled.add(card);
    settling.delete(card);
    delete card.dataset.goldenDeferredV27;
    card.dataset.goldenSettledV27 = 'true';
    card.classList.add('golden-reveal');
    diagnostic('v27:golden-applied-after-card-settled', card);
  }

  function inspect(card) {
    if (!(card instanceof HTMLElement) || !card.classList.contains('hero-draw-card')) return;
    if (!card.classList.contains('golden-reveal') || settled.has(card)) return;

    // MutationObserver roda no microtask checkpoint, antes do próximo paint.
    // Retira a promoção dourada precoce sem deixar o WebKit compor dois
    // lifecycles sobre a mesma textura no mesmo período.
    card.classList.remove('golden-reveal');
    if (!settling.has(card)) void settleGoldenCard(card);
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') inspect(record.target);
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        inspect(node);
        node.querySelectorAll?.('.hero-draw-card').forEach(inspect);
      }
    }
  });

  ROOTS.forEach(root => {
    root.querySelectorAll('.hero-draw-card').forEach(inspect);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class']
    });
  });

  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
}
