(() => {
  function isAppleTouchWebKitRuntime() {
    const ua = String(navigator.userAgent || '');
    const appleTouch = /iPhone|iPad|iPod/i.test(ua)
      || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
    return appleTouch && /AppleWebKit/i.test(ua);
  }

  if (!isAppleTouchWebKitRuntime()) return;
  if (window.echoArenaDiversaoFrameBarrierV29) return;

  const nativeRequestAnimationFrame = window.requestAnimationFrame?.bind(window);
  const nativeCancelAnimationFrame = window.cancelAnimationFrame?.bind(window);
  if (typeof nativeRequestAnimationFrame !== 'function') return;

  const MAX_FRAME_WAIT_MS = 96;
  const pending = new Map();
  let nextId = 1;
  let fallbackCount = 0;

  function now() {
    return typeof performance?.now === 'function' ? performance.now() : Date.now();
  }

  function checkpoint(step, detail = {}) {
    try {
      window.echoArenaDiversaoDiagnosticV26?.checkpoint?.(step, detail);
    } catch {}
  }

  function finish(id, timestamp, source) {
    const entry = pending.get(id);
    if (!entry || entry.done) return;
    entry.done = true;
    pending.delete(id);
    window.clearTimeout(entry.timer);

    if (source === 'timeout') {
      fallbackCount += 1;
      try { nativeCancelAnimationFrame?.(entry.nativeId); } catch {}
      checkpoint('v29:raf-timeout-fallback', {
        fallbackCount,
        waitMs: MAX_FRAME_WAIT_MS,
        phase: document.getElementById('duel-stage')?.dataset?.phase || ''
      });
    }

    entry.callback(timestamp);
  }

  window.requestAnimationFrame = callback => {
    if (typeof callback !== 'function') return nativeRequestAnimationFrame(callback);

    const id = nextId++;
    const entry = {
      callback,
      nativeId: 0,
      timer: 0,
      done: false
    };

    entry.nativeId = nativeRequestAnimationFrame(timestamp => finish(id, timestamp, 'native'));
    entry.timer = window.setTimeout(() => finish(id, now(), 'timeout'), MAX_FRAME_WAIT_MS);
    pending.set(id, entry);
    return id;
  };

  window.cancelAnimationFrame = id => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    entry.done = true;
    window.clearTimeout(entry.timer);
    try { nativeCancelAnimationFrame?.(entry.nativeId); } catch {}
  };

  document.documentElement.dataset.diversaoFrameBarrier = 'v29';

  Object.defineProperty(window, 'echoArenaDiversaoFrameBarrierV29', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      version: 29,
      maxFrameWaitMs: MAX_FRAME_WAIT_MS,
      getFallbackCount: () => fallbackCount
    })
  });

  window.addEventListener('pagehide', () => {
    pending.forEach(entry => {
      window.clearTimeout(entry.timer);
      try { nativeCancelAnimationFrame?.(entry.nativeId); } catch {}
    });
    pending.clear();
  }, { once: true });
})();
