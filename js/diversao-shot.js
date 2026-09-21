const shotAssetUrl = './assets/diversao/revolver-shot-v2.mp3?v=20260821-shot-1';

const NativeAudioContext = window.AudioContext || window.webkitAudioContext;

function isAppleTouchWebKitRuntime() {
  const ua = String(navigator.userAgent || '');
  const appleTouch = /iPhone|iPad|iPod/i.test(ua)
    || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  return appleTouch && /AppleWebKit/i.test(ua);
}

const appleTouchWebKit = isAppleTouchWebKitRuntime();
let shotContext = null;
let shotBuffer = null;
let shotBytesPromise = null;
let shotDecodePromise = null;
let fireLatched = false;
let weaponObserver = null;

function preloadShotBytes() {
  if (appleTouchWebKit) return Promise.resolve(null);
  if (!shotBytesPromise) {
    shotBytesPromise = fetch(shotAssetUrl, { cache: 'force-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .catch(error => {
        console.warn('[diversao-shot] Sample de disparo indisponível:', error);
        return null;
      });
  }
  return shotBytesPromise;
}

async function prepareShotAudio() {
  if (appleTouchWebKit) return null;
  if (!NativeAudioContext) return null;
  if (!shotContext || shotContext.state === 'closed') {
    shotContext = new NativeAudioContext();
  }
  if (shotContext.state === 'suspended') {
    await shotContext.resume().catch(() => {});
  }
  if (shotBuffer) return shotBuffer;
  if (!shotDecodePromise) {
    shotDecodePromise = preloadShotBytes().then(async bytes => {
      if (!bytes || !shotContext || shotContext.state === 'closed') return null;
      try {
        shotBuffer = await shotContext.decodeAudioData(bytes.slice(0));
        return shotBuffer;
      } catch (error) {
        console.warn('[diversao-shot] Falha ao decodificar sample:', error);
        return null;
      }
    });
  }
  return shotDecodePromise;
}

function playRealisticShot(side) {
  if (appleTouchWebKit) return false;
  if (!shotContext || !shotBuffer || shotContext.state !== 'running') return false;
  try {
    const source = shotContext.createBufferSource();
    const gain = shotContext.createGain();
    source.buffer = shotBuffer;
    source.playbackRate.value = 0.985 + Math.random() * 0.03;
    gain.gain.value = 0.72;

    if (typeof shotContext.createStereoPanner === 'function') {
      const panner = shotContext.createStereoPanner();
      panner.pan.value = side === 'enemy' ? 0.12 : -0.12;
      source.connect(panner);
      panner.connect(gain);
    } else {
      source.connect(gain);
    }
    gain.connect(shotContext.destination);
    source.start();
    source.addEventListener('ended', () => {
      try { source.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
    }, { once: true });
    return true;
  } catch (error) {
    console.warn('[diversao-shot] Disparo realista falhou; o áudio sintetizado principal continua disponível:', error);
    return false;
  }
}

preloadShotBytes();

document.addEventListener('click', event => {
  if (event.target.closest('#spin-button,[data-diversao-mode]')) prepareShotAudio();
}, { capture: true });

function observeWeapon() {
  if (appleTouchWebKit) return;
  const revolver = document.getElementById('revolver');
  if (!revolver) return;
  weaponObserver?.disconnect();
  weaponObserver = new MutationObserver(() => {
    const firing = revolver.classList.contains('fire');
    if (firing && !fireLatched) {
      fireLatched = true;
      const side = document.getElementById('duel-stage')?.dataset.phase === 'enemy' ? 'enemy' : 'ally';
      playRealisticShot(side);
    } else if (!firing) {
      fireLatched = false;
    }
  });
  weaponObserver.observe(revolver, { attributes: true, attributeFilter: ['class'] });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeWeapon, { once: true });
} else {
  observeWeapon();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && shotContext?.state === 'running') shotContext.suspend().catch(() => {});
});

window.addEventListener('pagehide', () => {
  weaponObserver?.disconnect();
  if (shotContext?.state === 'running') shotContext.suspend().catch(() => {});
});
