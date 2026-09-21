const EASING = 'cubic-bezier(.22,.75,.25,1)';

export function heroMotionFrames(direction, outgoing = false) {
  const offset = direction === -1 ? -24 : 24;
  return outgoing
    ? [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-offset}px)` }]
    : [{ opacity: 0, transform: `translateX(${offset}px)` }, { opacity: 1, transform: 'translateX(0)' }];
}

// Readiness belongs to this element only. A cancelled decode must never reveal a later selection.
export function watchHeroMedia(element, { ready, failed, timeoutMs = 8000 } = {}) {
  let active = true;
  let decoding = false;
  const image = element.tagName === 'IMG';
  const event = image ? 'load' : 'loadeddata';
  const cleanup = () => {
    active = false;
    clearTimeout(timer);
    element.removeEventListener(event, loaded);
    element.removeEventListener('error', error);
  };
  const finish = (ok) => {
    if (!active) return;
    cleanup();
    (ok ? ready : failed)?.();
  };
  const error = () => finish(false);
  const loaded = () => {
    if (!active || decoding) return;
    if (image && !element.naturalWidth) return finish(false);
    if (!image || typeof element.decode !== 'function') return finish(true);
    decoding = true;
    Promise.resolve().then(() => active ? element.decode() : undefined).then(
      () => finish(true), () => finish(element.naturalWidth > 0)
    );
  };
  const timer = setTimeout(error, timeoutMs);
  element.addEventListener(event, loaded);
  element.addEventListener('error', error);
  if (image ? element.complete : element.readyState >= 2) loaded();
  return cleanup;
}

export function createNeighborImagePreloader({ createImage = () => new Image(), enabled = () => true } = {}) {
  const images = new Map();
  return {
    update(neighbors = []) {
      const sources = enabled() ? [...new Set(neighbors.filter(media => media?.source
        && !String(media.mime_type || '').startsWith('video/')
        && !/\.(mp4|webm)(?:[?#]|$)/i.test(media.source)).map(media => media.source))].slice(0, 2) : [];
      for (const [source, image] of images) {
        if (sources.includes(source)) continue;
        image.removeAttribute('src');
        images.delete(source);
      }
      for (const source of sources) {
        if (images.has(source)) continue;
        const image = createImage();
        image.decoding = 'async';
        image.fetchPriority = 'low';
        image.src = source;
        images.set(source, image);
      }
    },
    clear() {
      for (const image of images.values()) image.removeAttribute('src');
      images.clear();
    }
  };
}

function makeDecorative(element) {
  element.inert = true;
  element.setAttribute('aria-hidden', 'true');
  for (const node of [element, ...element.querySelectorAll('*')]) {
    node.removeAttribute('id');
    for (const attribute of [...node.attributes]) {
      if (attribute.name.startsWith('data-cms-')) node.removeAttribute(attribute.name);
    }
  }
  element.classList.add('hero-motion-ghost');
  return element;
}

export function createHomeHeroMotion({ stage, media, details, screen, status,
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)') }) {
  const animations = new Set();
  const ghosts = new Set();
  let stopMedia = () => {};
  let stopScreen = () => {};
  let generation = 0;

  function removeGhost(ghost) {
    for (const video of ghost.querySelectorAll('video')) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    ghost.remove();
    ghosts.delete(ghost);
  }

  function stopAnimations() {
    for (const animation of animations) animation.cancel();
    animations.clear();
    for (const ghost of [...ghosts]) removeGhost(ghost);
    stage.dataset.motionState = 'idle';
  }

  function play(element, frames, options = {}, done = () => {}) {
    const animation = element.animate(frames, { duration: 240, delay: 80, easing: EASING, fill: 'both', ...options });
    animations.add(animation);
    animation.finished.then(() => {
      animations.delete(animation);
      animation.cancel();
      done();
    }, () => animations.delete(animation));
  }

  function change(render, { animate = false, direction = 1 } = {}) {
    const ticket = ++generation;
    stopMedia();
    stopScreen();
    stopAnimations();
    const canAnimate = animate && !reducedMotion.matches && typeof details.animate === 'function';
    const previousColor = getComputedStyle(stage).getPropertyValue('--hero-accent');

    if (canAnimate) {
      const textGhost = makeDecorative(details.cloneNode(true));
      details.parentElement.append(textGhost);
      ghosts.add(textGhost);
      if (media.dataset.mediaState === 'ready' && media.firstElementChild) {
        const artGhost = makeDecorative(media.cloneNode(false));
        artGhost.append(...media.childNodes);
        media.parentElement.append(artGhost);
        ghosts.add(artGhost);
      }
      for (const ghost of ghosts) {
        // Keep the old accent on outgoing content while the new hero is committed.
        ghost.style.setProperty('--hero-accent', previousColor);
        play(ghost, heroMotionFrames(direction, true), { duration: 140, delay: 0 }, () => removeGhost(ghost));
      }
    } else {
      for (const video of media.querySelectorAll('video')) video.pause();
    }

    // The selection, badge, builds and destinations are updated together, without waiting for animation.
    render();
    stage.dataset.motionDirection = direction === -1 ? 'previous' : 'next';
    stage.dataset.motionState = canAnimate ? 'running' : 'idle';
    if (canAnimate) {
      play(details, heroMotionFrames(direction), {}, () => {
        if (ticket === generation) stage.dataset.motionState = 'idle';
      });
      play(stage.querySelector('#featured-build-context'), [{ opacity: .2 }, { opacity: 1 }], { delay: 0, duration: 320 });
    }

    const element = media.querySelector('img,video');
    status.textContent = element ? 'Preparando visual…' : 'Visual em atualização';
    status.hidden = false;
    media.dataset.mediaState = element ? 'loading' : 'empty';
    media.setAttribute('aria-busy', String(Boolean(element)));
    if (element) {
      stopMedia = watchHeroMedia(element, {
        ready: () => {
          if (ticket !== generation) return;
          media.dataset.mediaState = 'ready';
          media.setAttribute('aria-busy', 'false');
          status.hidden = true;
          if (canAnimate && !reducedMotion.matches) play(media, heroMotionFrames(direction), { delay: 0, duration: 320 });
        },
        failed: () => {
          if (ticket !== generation) return;
          media.dataset.mediaState = 'error';
          media.setAttribute('aria-busy', 'false');
          status.textContent = 'Visual indisponível';
          if (element.tagName === 'VIDEO') element.pause();
        }
      });
    }

    if (!screen.hidden) {
      screen.dataset.mediaState = 'loading';
      stopScreen = watchHeroMedia(screen.querySelector('video'), {
        ready: () => {
          if (ticket === generation) screen.dataset.mediaState = 'ready';
        },
        failed: () => {
          if (ticket === generation) screen.hidden = true;
        }
      });
    }
  }

  const onPreferenceChange = () => {
    if (reducedMotion.matches) stopAnimations();
  };
  reducedMotion.addEventListener('change', onPreferenceChange);
  return {
    change,
    destroy() {
      generation += 1;
      stopMedia();
      stopScreen();
      stopAnimations();
      reducedMotion.removeEventListener('change', onPreferenceChange);
    }
  };
}
