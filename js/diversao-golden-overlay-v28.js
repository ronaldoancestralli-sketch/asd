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
  document.documentElement.dataset.diversaoGoldenOverlay = 'v28';

  const pending = new WeakSet();
  const activated = new WeakSet();
  const nextFrame = () => new Promise(resolve => window.requestAnimationFrame(resolve));

  function checkpoint(step, card) {
    try {
      window.echoArenaDiversaoDiagnosticV26?.checkpoint?.(step, {
        hero: card?.getAttribute('aria-label') || '',
        revealed: card?.classList.contains('revealed') === true,
        prepared: card?.classList.contains('prepared') === true
      });
    } catch {}
  }

  function ensureOverlay(card) {
    if (!(card instanceof HTMLElement) || !card.classList.contains('hero-draw-card')) return null;
    let overlay = card.querySelector(':scope > .golden-card-overlay-v28');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'golden-card-overlay-v28';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<span class="golden-card-scan-v28"></span><span class="golden-card-badge-v28">CÂMARA DOURADA</span>';
    card.appendChild(overlay);
    return overlay;
  }

  function prepareTree(node) {
    if (!(node instanceof HTMLElement)) return;
    if (node.classList.contains('hero-draw-card')) ensureOverlay(node);
    node.querySelectorAll?.('.hero-draw-card').forEach(ensureOverlay);
  }

  function waitForRevealed(card) {
    if (card.classList.contains('revealed')) return Promise.resolve();
    return new Promise(resolve => {
      let done = false;
      let timeout = 0;
      const observer = new MutationObserver(() => {
        if (!card.classList.contains('revealed')) return;
        finish();
      });
      const finish = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timeout);
        observer.disconnect();
        resolve();
      };
      observer.observe(card, { attributes: true, attributeFilter: ['class'] });
      timeout = window.setTimeout(finish, 700);
    });
  }

  function waitForPreparedMask(card) {
    const mask = card.querySelector('.prepared-mask');
    if (!mask) return Promise.resolve();
    const style = window.getComputedStyle(mask);
    const animationName = String(style.animationName || '');
    const duration = String(style.animationDuration || '');
    if (animationName === 'none' || duration === '0s' || duration === '0ms') return Promise.resolve();

    return new Promise(resolve => {
      let done = false;
      let timeout = 0;
      const finish = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timeout);
        mask.removeEventListener('animationend', onEnd);
        resolve();
      };
      const onEnd = event => {
        if (event.target === mask) finish();
      };
      mask.addEventListener('animationend', onEnd);
      timeout = window.setTimeout(finish, 520);
    });
  }

  async function activateOverlay(card) {
    if (!(card instanceof HTMLElement) || pending.has(card) || activated.has(card)) return;
    pending.add(card);
    checkpoint('v28:golden-card-intercepted', card);

    await waitForRevealed(card);
    await waitForPreparedMask(card);
    await nextFrame();
    await nextFrame();

    if (!card.isConnected) {
      pending.delete(card);
      return;
    }

    const overlay = ensureOverlay(card);
    if (!overlay) {
      pending.delete(card);
      return;
    }

    overlay.classList.remove('is-active');
    await nextFrame();
    overlay.classList.add('is-active');
    activated.add(card);
    checkpoint('v30:golden-overlay-activated-once', card);
    pending.delete(card);
  }

  function intercept(card) {
    if (!(card instanceof HTMLElement) || !card.classList.contains('hero-draw-card')) return;
    ensureOverlay(card);
    if (!card.classList.contains('golden-reveal')) return;

    card.classList.remove('golden-reveal');
    if (activated.has(card)) {
      checkpoint('v30:duplicate-golden-reveal-ignored', card);
      return;
    }
    void activateOverlay(card);
  }

  function clearOverlays() {
    ROOTS.forEach(root => {
      root.querySelectorAll('.golden-card-overlay-v28.is-active').forEach(overlay => {
        overlay.classList.remove('is-active');
      });
    });
  }

  ROOTS.forEach(root => {
    root.querySelectorAll('.hero-draw-card').forEach(ensureOverlay);
  });

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') intercept(record.target);
      for (const node of record.addedNodes) prepareTree(node);
    }
  });

  ROOTS.forEach(root => {
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class']
    });
  });

  document.addEventListener('echoarena:diversao-golden', event => {
    if (event.detail?.state === 'armed') clearOverlays();
  });
  document.addEventListener('echoarena:diversao-round-complete', clearOverlays);
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
}
