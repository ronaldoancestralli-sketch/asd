import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { normalizeHeroMedia } from './media-storage.js?v=20260823-security-supabase-pin-1';
import {
  initSiteShell,
  escapeHtml,
  classColor,
  mediaOf,
  mediaStyle,
  mediaInner
} from './site-shell.js?v=20260831-hero-gif-rollback-1&sb=20260823-security-supabase-pin-1&identity=20260825-v6-public-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1';

const shell = await initSiteShell({ activeId: 'diversao' });
if (!shell) throw new Error('BLOQUEADO');

const $ = id => document.getElementById(id);
const stage = $('duel-stage');
const spinButton = $('spin-button');
const spinLabel = $('spin-label');
const revolver = $('revolver');
const yourTeam = $('your-team');
const enemyTeam = $('enemy-team');
const rouletteOverline = $('roulette-overline');
const rouletteStatus = $('roulette-status');
const rouletteHelp = $('roulette-help');
const syncPill = $('sync-pill');
const syncLabel = $('sync-label');
const roundResult = $('round-result');
const shotNodes = [...document.querySelectorAll('[data-shot]')];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function isAppleTouchWebKitRuntime() {
  const ua = String(navigator.userAgent || '');
  const appleTouch = /iPhone|iPad|iPod/i.test(ua)
    || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  return appleTouch && /AppleWebKit/i.test(ua);
}

const appleTouchWebKit = isAppleTouchWebKitRuntime();

const liveRound = $('live-round');
const livePool = $('live-pool');
const liveShot = $('live-shot');
const chamberIndex = $('chamber-index');
const chamberSide = $('chamber-side');
const chamberState = $('chamber-state');
const allyClassCount = $('ally-class-count');
const allyClassList = $('ally-class-list');
const enemyClassCount = $('enemy-class-count');
const enemyClassList = $('enemy-class-list');
const matchIntel = $('match-intel');
const matchState = $('match-state');
const intelRound = $('intel-round');
const intelClassCount = $('intel-class-count');
const intelClassList = $('intel-class-list');
const intelAllyDiversity = $('intel-ally-diversity');
const intelAllyClasses = $('intel-ally-classes');
const intelEnemyDiversity = $('intel-enemy-diversity');
const intelEnemyClasses = $('intel-enemy-classes');

const weaponAssetUrl = './assets/diversao/revolver-32.svg?v=20260821-weapon-1';
const MEDIA_DECODE_TIMEOUT_MS = 5000;

let roster = [];
let busy = false;
let round = 0;
let currentMatch = null;
let audioContext = null;
let audioMaster = null;
let noiseBuffer = null;

const wait = ms => new Promise(resolve => setTimeout(resolve, reduceMotion ? Math.min(ms, 70) : ms));
const nextFrame = () => new Promise(resolve => window.requestAnimationFrame(() => resolve()));

function shuffle(rows) {
  const result = rows.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function heroIds(rows = []) {
  return new Set(rows.map(hero => hero?.id).filter(Boolean));
}

function createRound(mode = 'full') {
  if (mode === 'rematch' && currentMatch?.allies?.length === 3) {
    const kept = currentMatch.allies.slice();
    const blocked = heroIds(kept);
    const available = shuffle(roster.filter(hero => !blocked.has(hero.id)));
    if (available.length < 3) throw new Error('Roster insuficiente para sortear novos inimigos sem repetir seu trio.');
    return { allies: kept, enemies: available.slice(0, 3), mode };
  }

  if (mode === 'destiny' && currentMatch?.enemies?.length === 3) {
    const kept = currentMatch.enemies.slice();
    const blocked = heroIds(kept);
    const available = shuffle(roster.filter(hero => !blocked.has(hero.id)));
    if (available.length < 3) throw new Error('Roster insuficiente para sortear um novo trio sem repetir os inimigos mantidos.');
    return { allies: available.slice(0, 3), enemies: kept, mode };
  }

  const shuffled = shuffle(roster);
  if (shuffled.length < 6) throw new Error('Roster insuficiente para formar dois times distintos.');
  return { allies: shuffled.slice(0, 3), enemies: shuffled.slice(3, 6), mode: 'full' };
}

function uniqueClasses(rows = []) {
  return [...new Set(rows.map(hero => String(hero?.class_name || 'Sem classe').trim()).filter(Boolean))];
}

function classSentence(rows = []) {
  const names = uniqueClasses(rows);
  return names.length ? names.join(' · ') : 'Nenhuma classe revelada.';
}

function pendingCard(index) {
  return `<article class="hero-draw-card pending"><span class="draw-index">${String(index + 1).padStart(2, '0')}</span><div class="pending-core">?</div><p>Aguardando</p></article>`;
}

function resetIntel() {
  matchIntel.classList.remove('ready');
  matchState.textContent = 'Aguardando sorteio';
  matchState.removeAttribute('data-round-event');
  intelRound.textContent = '—';
  intelClassCount.textContent = '—';
  intelClassList.textContent = 'As classes aparecem após os seis disparos.';
  intelAllyDiversity.textContent = '—';
  intelAllyClasses.textContent = 'Composição ainda não sorteada.';
  intelEnemyDiversity.textContent = '—';
  intelEnemyClasses.textContent = 'Composição ainda não sorteada.';
}

function updateTeamReadout(side, rows = []) {
  const classes = uniqueClasses(rows);
  const countNode = side === 'ally' ? allyClassCount : enemyClassCount;
  const listNode = side === 'ally' ? allyClassList : enemyClassList;
  countNode.textContent = `${classes.length} ${classes.length === 1 ? 'classe' : 'classes'} · ${rows.length}/3`;
  listNode.textContent = rows.length ? classSentence(rows) : side === 'ally' ? 'Aguardando o primeiro disparo.' : 'Aguardando a resposta inimiga.';
}

function updateMatchIntel(match) {
  const all = [...match.allies, ...match.enemies];
  const allClasses = uniqueClasses(all);
  const allyClasses = uniqueClasses(match.allies);
  const enemyClasses = uniqueClasses(match.enemies);

  matchIntel.classList.add('ready');
  matchState.textContent = 'Confronto definido';
  intelRound.textContent = String(round).padStart(2, '0');
  intelClassCount.textContent = String(allClasses.length);
  intelClassList.textContent = allClasses.join(' · ');
  intelAllyDiversity.textContent = `${allyClasses.length} / 3`;
  intelAllyClasses.textContent = allyClasses.join(' · ');
  intelEnemyDiversity.textContent = `${enemyClasses.length} / 3`;
  intelEnemyClasses.textContent = enemyClasses.join(' · ');
}

function setChamber(index = null, side = 'Neutro', state = 'Pronto') {
  chamberIndex.textContent = Number.isInteger(index) ? String(index + 1).padStart(2, '0') : '—';
  chamberSide.textContent = side;
  chamberState.textContent = state;
}

function eagerMediaInner(media, alt = '') {
  const markup = mediaInner(media, alt);
  if (!markup) return '';
  if (markup.startsWith('<img ')) {
    return markup.replace(' loading="lazy"', ' loading="eager" decoding="async" fetchpriority="high"');
  }
  if (markup.startsWith('<video ')) {
    return markup.replace('<video ', '<video preload="auto" ');
  }
  return markup;
}

function heroCard(hero, index, { prepared = false } = {}) {
  const color = classColor(hero);
  const media = mediaOf(hero, 'card');
  const stateClass = prepared ? 'pending prepared' : 'revealed';
  const ariaLabel = prepared
    ? `Carta ${index + 1}, aguardando revelação`
    : `${hero.name}, ${hero.class_name || 'sem classe'}`;
  const mediaMarkup = prepared ? eagerMediaInner(media, hero.name) : mediaInner(media, hero.name);
  const preparedMask = prepared
    ? '<div class="prepared-mask" aria-hidden="true"><div class="pending-core">?</div><p>Aguardando</p></div>'
    : '';

  return `<article class="hero-draw-card ${stateClass}" data-prepared="${prepared ? 'true' : 'false'}" style="--hero-color:${escapeHtml(color)}" aria-label="${escapeHtml(ariaLabel)}">
    <span class="draw-index">${String(index + 1).padStart(2, '0')}</span>
    <div class="draw-media media ${media ? '' : 'empty'}" style="${mediaStyle(media, 'cover')}">${mediaMarkup}</div>
    <div class="draw-copy"><small>${escapeHtml(hero.class_name || 'Sem classe')}</small><strong>${escapeHtml(hero.name)}</strong></div>
    ${preparedMask}
  </article>`;
}

function renderTeam(container, rows = []) {
  container.innerHTML = rows.map((hero, index) => heroCard(hero, index)).join('');
}

function waitForImageLoad(image) {
  if (image.complete) return Promise.resolve(image.naturalWidth > 0);
  return new Promise(resolve => {
    const done = success => resolve(success);
    image.addEventListener('load', () => done(true), { once: true });
    image.addEventListener('error', () => done(false), { once: true });
  });
}

async function decodePreparedCardMedia(image) {
  image.loading = 'eager';
  image.decoding = 'async';
  try { image.fetchPriority = 'high'; } catch {}

  const decodeTask = typeof image.decode === 'function'
    ? image.decode().then(() => true).catch(() => waitForImageLoad(image))
    : waitForImageLoad(image);
  const timeoutTask = new Promise(resolve => {
    window.setTimeout(() => resolve(image.complete && image.naturalWidth > 0), MEDIA_DECODE_TIMEOUT_MS);
  });
  return Promise.race([decodeTask, timeoutTask]);
}

async function warmPreparedCardMedia() {
  const preparedCards = [
    ...yourTeam.querySelectorAll('.hero-draw-card.prepared'),
    ...enemyTeam.querySelectorAll('.hero-draw-card.prepared')
  ];
  if (!preparedCards.length) return;

  const images = preparedCards.flatMap(card => [...card.querySelectorAll('img')]);
  const videos = preparedCards.flatMap(card => [...card.querySelectorAll('video')]);
  videos.forEach(video => {
    video.preload = 'auto';
    try { video.load(); } catch {}
  });

  liveShot.textContent = 'Preparando cartas';
  if (images.length) {
    const ready = await Promise.all(images.map(decodePreparedCardMedia));
    if (ready.some(value => value !== true)) {
      console.warn('[diversao] Uma ou mais imagens não confirmaram decode antecipado; mantendo o card já montado sem reinserção durante o tiro.');
    }
  }

  await nextFrame();
  await nextFrame();
}

function markPreservedShots(mode) {
  if (mode === 'rematch') {
    shotNodes.slice(0, 3).forEach(node => node.classList.add('done'));
  } else if (mode === 'destiny') {
    shotNodes.slice(3, 6).forEach(node => {
      node.classList.add('done', 'enemy');
    });
  }
}

function resetBoard(match = null, mode = 'full') {
  const keepAllies = mode === 'rematch' && match?.allies?.length === 3;
  const keepEnemies = mode === 'destiny' && match?.enemies?.length === 3;
  const allyMarkup = keepAllies
    ? match.allies.map((hero, index) => heroCard(hero, index)).join('')
    : match?.allies?.length === 3
      ? match.allies.map((hero, index) => heroCard(hero, index, { prepared: true })).join('')
      : [0, 1, 2].map(pendingCard).join('');
  const enemyMarkup = keepEnemies
    ? match.enemies.map((hero, index) => heroCard(hero, index)).join('')
    : match?.enemies?.length === 3
      ? match.enemies.map((hero, index) => heroCard(hero, index, { prepared: true })).join('')
      : [0, 1, 2].map(pendingCard).join('');

  yourTeam.innerHTML = allyMarkup;
  enemyTeam.innerHTML = enemyMarkup;
  shotNodes.forEach(node => node.classList.remove('active', 'done', 'enemy'));
  markPreservedShots(mode);
  roundResult.textContent = '';
  roundResult.className = 'round-result';
  stage.dataset.phase = 'ready';
  liveShot.textContent = mode === 'rematch' ? 'Seu trio mantido' : mode === 'destiny' ? 'Inimigos mantidos' : 'Pronto';
  setChamber(null, 'Neutro', mode === 'full' ? 'Pronto' : 'Preservado');
  updateTeamReadout('ally', keepAllies ? match.allies : []);
  updateTeamReadout('enemy', keepEnemies ? match.enemies : []);
  resetIntel();
}

async function revealHero(container, hero, index) {
  const card = container.children[index];
  if (!card) return;
  if (!card.classList.contains('prepared')) {
    console.warn('[diversao] Card não estava preparado antes do disparo; revelação estrutural recusada para evitar reinserção de mídia durante a animação.');
    return;
  }

  card.setAttribute('aria-label', `${hero.name}, ${hero.class_name || 'sem classe'}`);
  card.classList.remove('pending');
  card.classList.add('revealed');
  await nextFrame();
}

function markShot(index) {
  shotNodes.forEach((node, nodeIndex) => {
    const preserved = node.classList.contains('done') && (nodeIndex < 3 || nodeIndex >= 3);
    if (!preserved) node.classList.toggle('done', nodeIndex < index);
    node.classList.toggle('active', nodeIndex === index);
    node.classList.toggle('enemy', nodeIndex >= 3);
  });
}

function finishShots() {
  shotNodes.forEach(node => {
    node.classList.remove('active');
    node.classList.add('done');
  });
}

function ensureAudio() {
  if (audioContext) return audioContext;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;

  audioContext = new AudioCtor();
  audioMaster = audioContext.createGain();
  audioMaster.gain.value = 0.34;
  audioMaster.connect(audioContext.destination);

  const frameCount = Math.max(1, Math.floor(audioContext.sampleRate * 0.35));
  noiseBuffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  return audioContext;
}

function audioOutput(pan = 0) {
  const context = ensureAudio();
  if (!context || !audioMaster) return null;
  if (typeof context.createStereoPanner !== 'function') return audioMaster;
  const panner = context.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  panner.connect(audioMaster);
  return panner;
}

function playMechanicalClick(when, pan = 0, strength = 1) {
  const context = ensureAudio();
  const output = audioOutput(pan);
  if (!context || !output) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(880, when);
  oscillator.frequency.exponentialRampToValueAtTime(310, when + 0.025);
  filter.type = 'highpass';
  filter.frequency.value = 420;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.035 * strength, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.035);
  oscillator.connect(filter).connect(gain).connect(output);
  oscillator.start(when);
  oscillator.stop(when + 0.04);
}

function playCylinderSound(reverse = false) {
  const context = ensureAudio();
  const output = audioOutput(reverse ? 0.12 : -0.12);
  if (!context || !output) return;
  const now = context.currentTime;

  const body = context.createOscillator();
  const bodyGain = context.createGain();
  body.type = 'triangle';
  body.frequency.setValueAtTime(reverse ? 118 : 132, now);
  body.frequency.exponentialRampToValueAtTime(72, now + 0.68);
  bodyGain.gain.setValueAtTime(0.0001, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.022, now + 0.025);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
  body.connect(bodyGain).connect(output);
  body.start(now);
  body.stop(now + 0.74);

  const ticks = [0.02, 0.085, 0.16, 0.25, 0.36, 0.5, 0.64];
  ticks.forEach((offset, index) => {
    playMechanicalClick(now + offset, reverse ? 0.12 : -0.12, 0.65 - index * 0.035);
  });
}

function playShotSound(side = 'ally') {
  const context = ensureAudio();
  const pan = side === 'ally' ? -0.18 : 0.18;
  const output = audioOutput(pan);
  if (!context || !output || !noiseBuffer) return;
  const now = context.currentTime;

  playMechanicalClick(now, pan, 0.9);

  const noise = context.createBufferSource();
  const noiseFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.buffer = noiseBuffer;
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(1450, now + 0.012);
  noiseFilter.Q.value = 0.75;
  noiseGain.gain.setValueAtTime(0.0001, now + 0.012);
  noiseGain.gain.exponentialRampToValueAtTime(0.24, now + 0.018);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
  noise.connect(noiseFilter).connect(noiseGain).connect(output);
  noise.start(now + 0.012);
  noise.stop(now + 0.16);

  const thump = context.createOscillator();
  const thumpGain = context.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(105, now + 0.01);
  thump.frequency.exponentialRampToValueAtTime(42, now + 0.16);
  thumpGain.gain.setValueAtTime(0.0001, now + 0.01);
  thumpGain.gain.exponentialRampToValueAtTime(0.19, now + 0.018);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
  thump.connect(thumpGain).connect(output);
  thump.start(now + 0.01);
  thump.stop(now + 0.21);

  const metal = context.createOscillator();
  const metalGain = context.createGain();
  metal.type = 'triangle';
  metal.frequency.setValueAtTime(side === 'ally' ? 690 : 640, now + 0.018);
  metal.frequency.exponentialRampToValueAtTime(260, now + 0.12);
  metalGain.gain.setValueAtTime(0.0001, now + 0.018);
  metalGain.gain.exponentialRampToValueAtTime(0.045, now + 0.023);
  metalGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
  metal.connect(metalGain).connect(output);
  metal.start(now + 0.018);
  metal.stop(now + 0.16);
}

function playRoundCompleteSound() {
  const context = ensureAudio();
  const output = audioOutput(0);
  if (!context || !output) return;
  const now = context.currentTime;
  [196, 247, 294].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + index * 0.055;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.025, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    oscillator.connect(gain).connect(output);
    oscillator.start(start);
    oscillator.stop(start + 0.24);
  });
}

function sanitizeWeaponSvg(documentNode) {
  documentNode.querySelectorAll('script,foreignObject,image').forEach(node => node.remove());
  documentNode.querySelectorAll('*').forEach(node => {
    [...node.attributes].forEach(attribute => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')) node.removeAttribute(attribute.name);
      if ((name === 'href' || name === 'xlink:href') && value && !value.startsWith('#')) {
        node.removeAttribute(attribute.name);
      }
    });
  });
}

async function loadWeaponArt() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(weaponAssetUrl, { cache: 'force-cache', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const markup = await response.text();
    const documentNode = new DOMParser().parseFromString(markup, 'image/svg+xml');
    if (documentNode.querySelector('parsererror')) throw new Error('SVG inválido.');
    sanitizeWeaponSvg(documentNode);

    const svg = documentNode.documentElement;
    if (svg?.localName?.toLowerCase() !== 'svg') throw new Error('Asset sem raiz SVG.');
    svg.classList.add('revolver-svg', 'user-revolver-svg');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const currentWeapon = revolver.querySelector('.revolver-svg');
    if (!currentWeapon) throw new Error('Suporte visual do revólver não encontrado.');
    currentWeapon.replaceWith(document.importNode(svg, true));
    revolver.classList.add('user-weapon-ready');
  } catch (error) {
    console.warn('[diversao] Revólver fornecido não carregou; mantendo fallback vetorial:', error);
    revolver.classList.remove('user-weapon-ready');
  } finally {
    window.clearTimeout(timeout);
  }
}

async function spin(reverse = false) {
  const legacyCylinder = revolver.querySelector('#cylinder');
  revolver.classList.remove('spin-forward', 'spin-reverse');
  legacyCylinder?.classList.remove('spinning', 'reverse');
  revolver.getBoundingClientRect();

  if (revolver.classList.contains('user-weapon-ready')) {
    revolver.classList.add(reverse ? 'spin-reverse' : 'spin-forward');
  } else {
    legacyCylinder?.classList.add(reverse ? 'reverse' : 'spinning');
  }

  setChamber(null, reverse ? 'Inimigo' : 'Seu time', 'Girando');
  liveShot.textContent = 'Tambor girando';
  playCylinderSound(reverse);
  await wait(reverse ? 760 : 820);

  revolver.classList.remove('spin-forward', 'spin-reverse');
  legacyCylinder?.classList.remove('spinning', 'reverse');
}

async function restartShotVisuals(side) {
  const flashClass = side === 'ally' ? 'flash-ally' : 'flash-enemy';
  stage.classList.remove('flash-ally', 'flash-enemy');
  revolver.classList.remove('fire');

  if (appleTouchWebKit) {
    await nextFrame();
    stage.classList.add(flashClass);
    await nextFrame();
    revolver.classList.add('fire');
    return;
  }

  stage.getBoundingClientRect();
  stage.classList.add(flashClass);
  revolver.getBoundingClientRect();
  revolver.classList.add('fire');
}

async function fire(side, shotIndex, hero, cardIndex) {
  const sideLabel = side === 'ally' ? 'Seu time' : 'Inimigo';
  if (!appleTouchWebKit) markShot(shotIndex);
  liveShot.textContent = `${side === 'ally' ? 'Seu' : 'Inimigo'} ${cardIndex + 1}/3`;
  setChamber(shotIndex, sideLabel, 'Disparo');

  await restartShotVisuals(side);
  playShotSound(side);
  if (navigator.vibrate) navigator.vibrate(18);

  if (appleTouchWebKit) {
    await wait(96);
    markShot(shotIndex);
    await nextFrame();
    await wait(72);
  }

  await revealHero(side === 'ally' ? yourTeam : enemyTeam, hero, cardIndex);
  await wait(430);
  revolver.classList.remove('fire');
  setChamber(shotIndex, sideLabel, 'Revelado');
}

function setCopy(overline, status, help) {
  rouletteOverline.textContent = overline;
  rouletteStatus.textContent = status;
  rouletteHelp.textContent = help;
}

async function revealAllies(match, revealedAllies) {
  stage.dataset.phase = 'ally';
  setCopy(match.mode === 'destiny' ? 'Novo destino' : 'Seu esquadrão', 'Girando o tambor...', match.mode === 'destiny' ? 'O inimigo permanece. Seu lado será refeito.' : 'Três pulsos vão definir o seu lado da arena.');
  await spin(false);

  for (let index = 0; index < match.allies.length; index += 1) {
    const hero = match.allies[index];
    setCopy(`Disparo ${index + 1} de 3`, hero.name, match.mode === 'destiny' ? 'Seu novo trio está tomando forma.' : 'Seu time está sendo formado.');
    await fire('ally', index, hero, index);
    revealedAllies.push(hero);
    updateTeamReadout('ally', revealedAllies);
  }
}

async function revealEnemies(match, revealedEnemies) {
  stage.dataset.phase = 'enemy';
  setCopy(match.mode === 'rematch' ? 'Revanche' : 'Resposta inimiga', 'O outro lado gira agora.', match.mode === 'rematch' ? 'Seu trio permanece. Três novos inimigos serão escolhidos.' : 'Mais três pulsos. Nenhum dos seis heróis se repete nesta rodada.');
  await spin(true);

  for (let index = 0; index < match.enemies.length; index += 1) {
    const hero = match.enemies[index];
    setCopy(`Resposta ${index + 1} de 3`, hero.name, match.mode === 'rematch' ? 'A revanche inimiga está tomando forma.' : 'O time inimigo está tomando forma.');
    await fire('enemy', index + 3, hero, index);
    revealedEnemies.push(hero);
    updateTeamReadout('enemy', revealedEnemies);
  }
}

function roundModeLabel(mode) {
  if (mode === 'rematch') return 'Revanche concluída';
  if (mode === 'destiny') return 'Destino alterado';
  return 'Rodada concluída';
}

async function runRound(mode = 'full') {
  if (busy || roster.length < 6) return;
  if ((mode === 'rematch' || mode === 'destiny') && !currentMatch) return;

  let match;
  try {
    match = createRound(mode);
  } catch (error) {
    setError(error.message);
    return;
  }

  busy = true;
  round += 1;
  liveRound.textContent = String(round).padStart(2, '0');
  spinButton.disabled = true;
  spinLabel.textContent = mode === 'rematch' ? 'Preparando revanche' : mode === 'destiny' ? 'Trocando seu destino' : 'Tambor em movimento';
  resetBoard(match, match.mode);
  liveRound.textContent = String(round).padStart(2, '0');
  await warmPreparedCardMedia();

  const revealedAllies = match.mode === 'rematch' ? match.allies.slice() : [];
  const revealedEnemies = match.mode === 'destiny' ? match.enemies.slice() : [];

  if (match.mode !== 'rematch') await revealAllies(match, revealedAllies);
  if (match.mode === 'full') await wait(360);
  if (match.mode !== 'destiny') await revealEnemies(match, revealedEnemies);

  finishShots();
  stage.dataset.phase = 'complete';
  liveShot.textContent = '6 / 6 concluídos';
  setChamber(5, 'Ambos', 'Concluído');
  setCopy('Confronto definido', 'Seu 3 × 3 está pronto.', 'Escolha: girar tudo de novo, manter seu trio para uma revanche ou trocar apenas o seu destino.');
  roundResult.textContent = `${roundModeLabel(match.mode)} · rodada ${round} · seis heróis distintos`;
  roundResult.className = 'round-result ready';
  updateMatchIntel(match);
  playRoundCompleteSound();
  currentMatch = { allies: match.allies.slice(), enemies: match.enemies.slice(), mode: match.mode };
  spinLabel.textContent = 'Rodar novamente';
  spinButton.disabled = false;
  busy = false;

  document.dispatchEvent(new CustomEvent('echoarena:diversao-round-complete', {
    detail: {
      round,
      mode: match.mode,
      allies: currentMatch.allies,
      enemies: currentMatch.enemies
    }
  }));
}

function setError(message) {
  syncPill.className = 'sync-pill error';
  syncLabel.textContent = 'Roster indisponível';
  liveShot.textContent = 'Pausado';
  setChamber(null, 'Neutro', 'Erro');
  setCopy('Sorteio pausado', 'Não foi possível sincronizar os heróis.', message || 'Tente recarregar a página quando a conexão estiver disponível.');
  spinLabel.textContent = 'Indisponível';
  spinButton.disabled = true;
}

async function loadRoster() {
  try {
    const { data, error } = await supabase
      .from('v_heroes_complete')
      .select('*')
      .eq('enabled', true)
      .order('display_order', { ascending: true });

    if (error) throw error;
    roster = (data || []).map(normalizeHeroMedia).filter(hero => hero?.id && hero?.name);
    if (roster.length < 6) throw new Error('O roster ativo ainda não possui heróis suficientes para dois times distintos.');

    syncPill.className = 'sync-pill ready';
    syncLabel.textContent = `${roster.length} heróis ativos`;
    livePool.textContent = String(roster.length).padStart(2, '0');
    setCopy('Tambor pronto', 'A arena escolhe. Você joga.', 'Toque para sortear os seis heróis da rodada.');
    spinLabel.textContent = 'Girar o tambor';
    spinButton.disabled = false;
  } catch (error) {
    console.error('[diversao] Falha ao carregar roster:', error);
    setError(error?.message);
  }
}

const controller = {
  run(mode = 'full') {
    ensureAudio()?.resume?.();
    return runRound(mode);
  },
  getCurrentMatch() {
    return currentMatch ? {
      allies: currentMatch.allies.slice(),
      enemies: currentMatch.enemies.slice(),
      mode: currentMatch.mode,
      round
    } : null;
  },
  isBusy() {
    return busy;
  }
};

Object.defineProperty(window, 'echoArenaDiversao', {
  configurable: false,
  enumerable: false,
  writable: false,
  value: controller
});

spinButton.addEventListener('click', () => {
  controller.run('full');
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && audioContext?.state === 'running') audioContext.suspend().catch(() => {});
});

resetBoard();
await loadWeaponArt();
await loadRoster();
