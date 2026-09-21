import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomeHeroMotion, createNeighborImagePreloader, heroMotionFrames, watchHeroMedia } from '../js/home-hero-motion.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// Minimal DOM fixture: no network or browser state. Animations finish only when a test requests it.
class Element extends EventTarget {
  constructor(tagName = 'DIV') {
    super();
    this.tagName = tagName;
    this.childNodes = [];
    this.dataset = {};
    this.attr = new Map();
    this.style = { setProperty() {} };
    this.classList = { add() {} };
    this.hidden = false;
    this.createdAnimations = [];
  }
  get attributes() { return [...this.attr].map(([name, value]) => ({ name, value })); }
  get firstElementChild() { return this.childNodes[0]; }
  setAttribute(name, value) { this.attr.set(name, String(value)); }
  removeAttribute(name) { this.attr.delete(name); }
  getAttribute(name) { return this.attr.get(name) ?? null; }
  append(...nodes) {
    for (const node of nodes) { node.remove(); node.parentElement = this; this.childNodes.push(node); }
  }
  remove() {
    if (this.parentElement) this.parentElement.childNodes = this.parentElement.childNodes.filter(node => node !== this);
    this.parentElement = null;
  }
  querySelectorAll(selector) {
    const all = this.childNodes.flatMap(node => [node, ...node.querySelectorAll('*')]);
    if (selector === '*') return all;
    if (selector.startsWith('#')) return all.filter(node => node.getAttribute('id') === selector.slice(1));
    return all.filter(node => selector.split(',').includes(node.tagName.toLowerCase()));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  cloneNode(deep) {
    const clone = new Element(this.tagName);
    clone.dataset = { ...this.dataset };
    clone.attr = new Map(this.attr);
    if (deep) clone.append(...this.childNodes.map(node => node.cloneNode(true)));
    return clone;
  }
  animate(frames, options) {
    const finish = deferred();
    const animation = { frames, options, finished: finish.promise, cancelled: false,
      cancel() { this.cancelled = true; finish.reject(new Error('cancelled')); }, finish: finish.resolve };
    this.createdAnimations.push(animation);
    return animation;
  }
}

class Media extends Element {
  constructor(tag = 'IMG') {
    super(tag);
    this.complete = false;
    this.naturalWidth = 100;
    this.readyState = 0;
    this.decoded = deferred();
    this.paused = false;
  }
  decode() { return this.decoded.promise; }
  pause() { this.paused = true; }
  load() { this.readyState = 0; }
}

test('images are revealed only after decoding and cancelled decodes do not call back', async () => {
  const image = new Media();
  let ready = 0, failed = 0;
  const cancel = watchHeroMedia(image, { ready: () => ready++, failed: () => failed++ });
  image.dispatchEvent(new Event('load'));
  await tick();
  assert.equal(ready, 0);
  cancel();
  image.decoded.resolve();
  await tick();
  assert.equal(ready, 0);
  assert.equal(failed, 0);
  image.complete = true;
  const cancelAgain = watchHeroMedia(image, { ready: () => ready++ });
  await tick();
  assert.equal(ready, 1);
  cancelAgain();
});

test('media errors and stalled requests finish once, while loaded video does not need image decoding', async () => {
  const image = new Media();
  let failures = 0;
  const stop = watchHeroMedia(image, { failed: () => failures++, timeoutMs: 10 });
  image.dispatchEvent(new Event('error'));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(failures, 1);
  stop();
  watchHeroMedia(new Media(), { failed: () => failures++, timeoutMs: 1 });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(failures, 2);
  const video = new Media('VIDEO');
  video.readyState = 2;
  let ready = 0;
  const stopVideo = watchHeroMedia(video, { ready: () => ready++ });
  assert.equal(ready, 1);
  stopVideo();
});

test('preloading retains at most two images, never videos, and obeys data saving', () => {
  const created = [];
  let enabled = true;
  const preload = createNeighborImagePreloader({ enabled: () => enabled, createImage: () => {
    const image = { removeAttribute() { this.removed = true; } };
    created.push(image);
    return image;
  } });
  preload.update([{ source: 'a.webp' }, { source: 'b.mp4?version=2' }, { source: 'c.webp' }, { source: 'd.webp' }]);
  assert.deepEqual(created.map(image => image.src), ['a.webp', 'c.webp']);
  preload.update([{ source: 'c.webp' }, { source: 'a.webp' }]);
  assert.equal(created.length, 2);
  preload.update([{ source: 'e.webp' }, { source: 'video-without-extension', mime_type: 'video/webm' }]);
  assert.ok(created.slice(0, 2).every(image => image.removed));
  assert.equal(created[2].src, 'e.webp');
  enabled = false;
  preload.update([{ source: 'f.webp' }]);
  assert.equal(created.length, 3);
  assert.equal(created[2].removed, true);
  preload.clear();
});

function scene(t, reduced = false) {
  const previous = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#9367ff' });
  t.after(() => { if (previous) globalThis.getComputedStyle = previous; else delete globalThis.getComputedStyle; });
  const stage = new Element(), frame = new Element(), details = new Element(), visual = new Element();
  const media = new Element(), status = new Element(), screen = new Element(), context = new Element();
  context.setAttribute('id', 'featured-build-context');
  details.setAttribute('id', 'hero-details');
  details.setAttribute('data-cms-text', 'legacy-text');
  media.setAttribute('id', 'spot-media');
  stage.append(frame, visual, screen, context);
  frame.append(details);
  visual.append(media, status);
  screen.hidden = true;
  const preference = new EventTarget();
  preference.matches = reduced;
  const motion = createHomeHeroMotion({ stage, media, details, screen, status, reducedMotion: preference });
  t.after(() => motion.destroy());
  const render = image => {
    for (const child of [...media.childNodes]) child.remove();
    if (image) media.append(image);
  };
  return { motion, stage, frame, details, media, status, visual, preference, render };
}

test('rapid transitions replace outgoing layers and only the latest media can be revealed', async t => {
  const s = scene(t);
  const old = new Media();
  s.render(old);
  s.media.dataset.mediaState = 'ready';
  const first = new Media(), latest = new Media();
  s.motion.change(() => s.render(first), { animate: true, direction: 1 });
  const firstAnimation = s.details.createdAnimations[0];
  assert.equal(s.stage.dataset.motionDirection, 'next');
  assert.equal(s.frame.childNodes.length, 2);
  assert.equal(s.visual.childNodes.length, 3);
  assert.equal(s.frame.childNodes[1].getAttribute('id'), null);
  assert.equal(s.frame.childNodes[1].getAttribute('data-cms-text'), null);
  assert.equal(s.frame.childNodes[1].inert, true);
  first.dispatchEvent(new Event('load'));
  await tick();
  s.motion.change(() => s.render(latest), { animate: true, direction: -1 });
  assert.equal(firstAnimation.cancelled, true);
  assert.equal(s.frame.childNodes.length, 2, 'there is only one outgoing text layer');
  assert.equal(s.visual.childNodes.length, 2, 'pending art is not presented as an outgoing hero');
  first.decoded.resolve();
  await tick();
  assert.equal(s.media.dataset.mediaState, 'loading');
  latest.dispatchEvent(new Event('load'));
  latest.decoded.resolve();
  await tick();
  assert.equal(s.media.dataset.mediaState, 'ready');
  assert.equal(s.status.hidden, true);
  assert.equal(s.stage.dataset.motionDirection, 'previous');
  assert.equal(s.media.firstElementChild, latest);
  assert.equal(s.media.createdAnimations.at(-1).frames[0].transform, 'translateX(-24px)');
});

test('reduced motion commits immediately and changing the preference cancels active movement', async t => {
  const s = scene(t, true);
  let committed = 0;
  s.motion.change(() => { committed++; s.render(null); }, { animate: true });
  assert.equal(committed, 1);
  assert.equal(s.details.createdAnimations.length, 0);
  assert.equal(s.frame.childNodes.length, 1);
  assert.equal(s.stage.dataset.motionState, 'idle');
  s.preference.matches = false;
  s.motion.change(() => s.render(null), { animate: true });
  assert.equal(s.details.createdAnimations.length, 1);
  s.preference.matches = true;
  s.preference.dispatchEvent(new Event('change'));
  await tick();
  assert.equal(s.details.createdAnimations[0].cancelled, true);
  assert.equal(s.frame.childNodes.length, 1);
  assert.equal(s.stage.dataset.motionState, 'idle');
});

test('leaving video is moved rather than cloned and is stopped when the outgoing layer is removed', async t => {
  const s = scene(t);
  const video = new Media('VIDEO');
  s.render(video);
  s.media.dataset.mediaState = 'ready';
  s.motion.change(() => s.render(null), { animate: true });
  const ghost = s.visual.childNodes.at(-1);
  assert.equal(ghost.firstElementChild, video);
  ghost.createdAnimations[0].finish();
  await tick();
  assert.equal(video.paused, true);
  assert.equal(ghost.parentElement, null);
  assert.equal(s.media.dataset.mediaState, 'empty');
});

test('incoming and outgoing frames reverse together', () => {
  assert.equal(heroMotionFrames(1)[0].transform, 'translateX(24px)');
  assert.equal(heroMotionFrames(1, true)[1].transform, 'translateX(-24px)');
  assert.equal(heroMotionFrames(-1)[0].transform, 'translateX(-24px)');
  assert.equal(heroMotionFrames(-1, true)[1].transform, 'translateX(24px)');
});
