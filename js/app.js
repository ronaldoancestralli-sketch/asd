import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { loadSiteStats } from './stats.js?v=20260823-security-supabase-pin-1&home=20260905-a1';
import { createHeroBuildReader, createHomeHeroSelection, homeBuildEquipmentSlots } from './home-hero-selection.mjs?v=20260906-home-equipment-1';
import { createHomeHeroMotion, createNeighborImagePreloader } from './home-hero-motion.mjs?v=20260906-c1';
import { homeFeaturedPresentation, readHomeFeaturedAuthority } from './home-featured-authority.mjs?v=20260906-f1';
import { resolveMediaUrl, normalizeHeroMedia } from './media-storage.js?v=20260823-security-supabase-pin-1';
import { syncPublicNavigation } from './public-navigation.js?v=20260822-drawer-unified-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1';
import {
  identityProfileUrl,
  identitySignupGateEnabled,
  identitySignupMetadata,
  normalizePublicHandle
} from './identity-public-launch-v6.js?v=20260825-identity-public-v6-1';

syncPublicNavigation('inicio');

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  session: null,
  role: null,
  maintenance: false,
  heroes: [],
  screenVideos: new Map(),
  activeHero: null,
  cmsContent: window.EchoSiteContent?.content || {},
  cmsReady: window.EchoSiteContent?.loaded === true,
  featuredAuthority: { featuredHeroId: '', source: 'pending', preview: false },
  carouselIndex: 0,
  authMode: 'login',
  heroQuery: ''
};

const heroMotion = createHomeHeroMotion({
  stage: $('#hero-stage'), media: $('#spot-media'), details: $('#hero-details'),
  screen: $('#arena-video-frame'), status: $('#hero-media-status')
});
const heroImagePreloader = createNeighborImagePreloader({
  enabled: () => !navigator.connection?.saveData && !/^(slow-)?2g$/.test(navigator.connection?.effectiveType || '')
});

const heroSelection = createHomeHeroSelection({
  readBuilds: createHeroBuildReader(supabase),
  featuredHeroId: '',
  onChange: renderHeroSelection
});

let signupHandleEnabled = false;
const signupHandleGatePromise = identitySignupGateEnabled(supabase).then((enabled) => {
  signupHandleEnabled = enabled;
  syncSignupFields();
  return enabled;
});

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[char]));

const isVideo = (source = '', mime = '') =>
  mime.startsWith('video/') || /\.(mp4|webm)$/i.test(source);

function mediaOf(hero = {}, slot = 'main') {
  const chain = slot === 'card'
    ? ['card', 'main', 'gif']
    : slot === 'gif'
      ? ['gif', 'main', 'card']
      : ['main', 'card', 'gif'];

  for (const key of chain) {
    const source = resolveMediaUrl(hero[`${key}_source`]);
    if (!source) continue;

    return {
      source,
      mime_type: hero[`${key}_mime_type`] || '',
      scale: hero[`${key}_scale`] ?? 1,
      offset_x: hero[`${key}_offset_x`] ?? 0,
      offset_y: hero[`${key}_offset_y`] ?? 0,
      fit: hero.fit || 'cover',
      anchor_x: hero.anchor_x || '50%',
      anchor_y: hero.anchor_y || '50%'
    };
  }

  return null;
}

function mediaStyle(media, fit) {
  if (!media) return '';
  return [
    `--fit:${fit || media.fit || 'cover'}`,
    `--pos:${media.anchor_x || '50%'} ${media.anchor_y || '50%'}`,
    `--scale:${Number(media.scale ?? 1)}`,
    `--x:${Number(media.offset_x ?? 0)}%`,
    `--y:${Number(media.offset_y ?? 0)}%`
  ].join(';');
}

function mediaInner(media, alt = '', eager = false) {
  if (!media?.source) return '';
  if (isVideo(media.source, media.mime_type || '')) {
    return `<video src="${escapeHtml(media.source)}" autoplay muted loop playsinline></video>`;
  }
  return `<img src="${escapeHtml(media.source)}" alt="${escapeHtml(alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
}

function storagePublicUrl(path) {
  return resolveMediaUrl(path);
}

async function loadScreenVideos() {
  const { data, error } = await supabase
    .from('heroes')
    .select(`
      id, screen_video_path, screen_video_intensity,
      screen_video_brightness, screen_video_contrast,
      screen_video_saturation, screen_video_hue,
      screen_video_tint, screen_video_vignette,
      screen_video_scale, screen_video_offset_x,
      screen_video_offset_y, screen_video_rotation
    `);

  if (error) {
    console.warn('[vídeos do telão]', error.message);
    state.screenVideos = new Map();
    return;
  }

  state.screenVideos = new Map((data || []).map((item) => [String(item.id), item]));
}

function renderScreenVideo(hero) {
  const frame = $('#arena-video-frame');
  const video = $('#arena-video');
  if (!frame || !video) return;

  const config = state.screenVideos.get(String(hero?.id || ''));
  const source = storagePublicUrl(config?.screen_video_path);

  if (!source) {
    video.pause();
    video.removeAttribute('src');
    video.load();
    frame.hidden = true;
    return;
  }

  const setting = (value, fallback, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, Number(value ?? fallback)));

  frame.style.setProperty('--screen-intensity', setting(config?.screen_video_intensity, .42, .18, .9));
  frame.style.setProperty('--screen-brightness', setting(config?.screen_video_brightness, .5, .25, 1.25));
  frame.style.setProperty('--screen-contrast', setting(config?.screen_video_contrast, 1.2, .7, 1.7));
  frame.style.setProperty('--screen-saturation', setting(config?.screen_video_saturation, .64, 0, 1.8));
  frame.style.setProperty('--screen-hue', `${setting(config?.screen_video_hue, 8, -180, 180)}deg`);
  frame.style.setProperty('--screen-tint', setting(config?.screen_video_tint, .36, 0, .85));
  frame.style.setProperty('--screen-vignette', setting(config?.screen_video_vignette, .42, 0, .9));
  frame.style.setProperty('--screen-scale', setting(config?.screen_video_scale, 1.08, 1, 1.8));
  frame.style.setProperty('--screen-x', `${setting(config?.screen_video_offset_x, 0, -35, 35)}%`);
  frame.style.setProperty('--screen-y', `${setting(config?.screen_video_offset_y, 0, -35, 35)}%`);
  frame.style.setProperty('--screen-rotate', `${setting(config?.screen_video_rotation, 0, -10, 10)}deg`);
  frame.hidden = false;

  if (video.src !== source) {
    video.src = source;
    video.load();
  }

  video.play().catch(() => {});
}

const CLASS_PALETTE = [
  '#F4D77A', '#8FE9FF', '#B794FF', '#4ADE80',
  '#F87171', '#FBBF24', '#67E8F9', '#F0A6D0'
];

function classColor(hero = {}) {
  const stored = String(hero.class_color || '').trim();
  if (/^#[0-9a-f]{3,8}$/i.test(stored)) return stored;

  const key = String(hero.class_slug || hero.class_name || hero.slug || 'echo');
  let sum = 0;
  for (let index = 0; index < key.length; index += 1) {
    sum = (sum + key.charCodeAt(index)) % 997;
  }
  return CLASS_PALETTE[sum % CLASS_PALETTE.length];
}

function showMessage(message, type = '') {
  const element = $('#auth-message');
  if (!element) return;
  element.textContent = message;
  element.className = `auth-message ${type}`.trim();
}

function setAuthMode(mode) {
  state.authMode = mode;
  const register = mode === 'register';
  $('#auth-title').textContent = register ? 'Criar conta' : 'Entrar';
  $('#auth-submit').textContent = register ? 'Registrar' : 'Entrar';
  $('#auth-switch-text').textContent = register ? 'Já tem uma conta?' : 'Ainda não tem conta?';
  $('#auth-switch-btn').textContent = register ? 'Entrar' : 'Registrar';
  syncSignupFields();
  $('#auth-password').autocomplete = register ? 'new-password' : 'current-password';
  showMessage('');
}

function syncSignupFields() {
  const register = state.authMode === 'register';
  const nameField = $('#name-field');
  const nameInput = $('#auth-name');
  const handleField = $('#handle-field');
  const handleInput = $('#auth-handle');
  if (nameField) nameField.hidden = !register;
  if (nameInput) nameInput.required = register;
  if (handleField) handleField.hidden = !(register && signupHandleEnabled);
  if (handleInput) handleInput.required = register && signupHandleEnabled;
}

function openAuth(mode = 'login') {
  setAuthMode(mode);
  $('#auth-modal').classList.add('open');
  $('#auth-modal').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#auth-email')?.focus(), 0);
}

function closeAuth() {
  $('#auth-modal').classList.remove('open');
  $('#auth-modal').setAttribute('aria-hidden', 'true');
  $('#auth-form').reset();
  showMessage('');
}

function heroRole(hero = {}) {
  return hero.subtitle || hero.class_name || 'Herói';
}

function renderHeroCards(heroes = state.heroes.filter(hero => !state.heroQuery ||
  [hero.name, hero.subtitle, hero.class_name, hero.description].filter(Boolean)
    .some(value => String(value).toLocaleLowerCase('pt-BR').includes(state.heroQuery)))) {
  const container = $('#heroes');
  if (!heroes.length) {
    container.innerHTML = '<div class="loading-card">Nenhum herói encontrado.</div>';
    return;
  }

  container.innerHTML = heroes.map((hero) => {
    const media = mediaOf(hero, 'card');
    const color = classColor(hero);
    const active = state.activeHero?.id === hero.id ? ' active' : '';
    const backdrop = media && !isVideo(media.source, media.mime_type || '')
      ? `<div class="media card-backdrop" aria-hidden="true" style="${mediaStyle(media, 'cover')}">${mediaInner(media, '')}</div>`
      : '';

    return `
      <article class="hero-card${active}" data-hero="${escapeHtml(hero.slug || hero.id)}" data-hero-id="${escapeHtml(hero.id)}" style="--class-color:${escapeHtml(color)}" tabindex="0" role="button" aria-pressed="${Boolean(active)}" aria-label="Selecionar ${escapeHtml(hero.name)}">
        ${backdrop}
        <div class="media ${media ? '' : 'empty'} card-media" style="${mediaStyle(media, 'contain')}">${mediaInner(media, hero.name)}</div>
        <div class="card-fade"></div><div class="role-mark">◇</div>
        <div class="card-copy"><div class="card-name">${escapeHtml(hero.name)}</div><div class="card-role">${escapeHtml(heroRole(hero))}</div></div>
      </article>`;
  }).join('');

  container.querySelectorAll('.hero-card').forEach((card) => {
    const select = () => {
      const hero = state.heroes.find((item) => String(item.slug || item.id) === card.dataset.hero);
      if (hero) heroSelection.selectHero(hero.id);
    };
    card.addEventListener('click', select);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select();
      }
    });
  });
  shiftCarousel(0, { revealSelected: true });
}

async function loadHeroes(authorityReady = Promise.resolve()) {
  $('#heroes').innerHTML = '<div class="loading-card">Carregando heróis...</div>';

  const { data, error } = await supabase
    .from('v_heroes_complete')
    .select('*')
    .eq('enabled', true)
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('name')
    .limit(60);

  if (error) {
    console.error('[heróis]', error);
    $('#heroes').innerHTML = '<div class="loading-card">Não foi possível carregar os heróis.</div>';
    return;
  }

  await authorityReady;
  state.heroes = (data || []).map(normalizeHeroMedia);
  heroSelection.setCatalog(state.heroes);
  renderHeroCards();
  sizeHeroCopy();
}

async function loadHomeFeaturedAuthority() {
  try {
    state.featuredAuthority = await readHomeFeaturedAuthority(supabase, {
      search: location.search,
      fallbackHeroId: state.cmsContent.featured_hero_id
    });
  } catch (error) {
    console.warn('[destaque da home] autoridade indisponível:', error?.message || error);
    state.featuredAuthority = {
      featuredHeroId: String(state.cmsContent.featured_hero_id || ''),
      source: 'fallback', preview: false, status: 'error'
    };
  }
  heroSelection.setFeaturedHero(state.featuredAuthority.featuredHeroId, { initial: true });
}

document.addEventListener('echo:content-applied', event => {
  if (event.detail?.pageKey && event.detail.pageKey !== 'home') return;
  const initial = !state.cmsReady;
  state.cmsContent = event.detail?.content || {};
  state.cmsReady = true;
  if (state.featuredAuthority.source === 'pending' || state.featuredAuthority.source === 'fallback') {
    state.featuredAuthority.featuredHeroId = String(state.cmsContent.featured_hero_id || '');
    heroSelection.setFeaturedHero(state.featuredAuthority.featuredHeroId, { initial });
  }
  queueCopySizing();
});

function renderHeroSelection(snapshot, change = {}) {
  const render = () => renderHeroSelectionContent(snapshot, change);
  if (change.heroChanged) {
    heroMotion.change(render, change);
    heroImagePreloader.update([snapshot.navigation.previousHero, snapshot.navigation.nextHero]
      .filter(Boolean).map(hero => mediaOf(hero, 'main')));
  } else render();
}

function renderHeroSelectionContent(snapshot, { heroChanged = false } = {}) {
  state.activeHero = snapshot.hero;
  if (heroChanged) renderSpotlight(snapshot.hero);
  const featuredPreview = snapshot.isFeatured && state.featuredAuthority.preview === true;
  const presentation = homeFeaturedPresentation({ isFeatured: snapshot.isFeatured, preview: featuredPreview });
  $('#hero-stage').dataset.selectedHero = snapshot.selectedHeroId;
  $('#hero-stage').dataset.featuredHero = snapshot.featuredHeroId;
  $('#hero-stage').dataset.isFeatured = String(snapshot.isFeatured);
  $('#hero-stage').dataset.featuredMode = presentation.mode;
  $('#hero-eyebrow').textContent = presentation.eyebrow;
  const seal = $('#hero-featured-seal');
  seal.hidden = !snapshot.isFeatured;
  $('#hero-featured-seal-label').textContent = presentation.sealLabel;
  const previewBanner = $('#hero-preview-banner');
  previewBanner.hidden = !featuredPreview;
  if (featuredPreview && snapshot.hero) {
    $('#hero-preview-copy').textContent = `${snapshot.hero.name} ocupará o próximo ciclo; esta visualização não altera a home pública.`;
  }
  $('#hero-sync').hidden = !snapshot.hero || snapshot.builds.status !== 'ready';
  for (const [id, key] of [['hero-tag-secondary', 'hero_tag_secondary'], ['hero-tag-tertiary', 'hero_tag_tertiary']]) {
    const element = $(`#${id}`);
    const text = snapshot.isFeatured ? String(state.cmsContent[key] || '').trim() : '';
    element.textContent = text;
    element.hidden = !text;
  }
  $$('.hero-card').forEach(card => {
    const active = card.dataset.heroId === snapshot.selectedHeroId;
    card.classList.toggle('active', active);
    card.setAttribute('aria-pressed', String(active));
  });
  const { available, previousHero, nextHero } = snapshot.navigation;
  $('#spotlight-navigation').hidden = !available;
  for (const [id, target, label] of [
    ['spotlight-prev', previousHero, 'Herói anterior'],
    ['spotlight-next', nextHero, 'Próximo herói']
  ]) {
    const button = $(`#${id}`);
    button.disabled = !available;
    button.title = target ? `${label}: ${target.name}` : label;
  }
  if (heroChanged) {
    shiftCarousel(0, { revealSelected: true });
    $('#hero-selection-status').textContent = snapshot.userSelected && snapshot.hero
      ? `${snapshot.hero.name} selecionado${presentation.announcementSuffix}.` : '';
  }
  const ready = snapshot.builds.status === 'ready';
  const { count, total } = snapshot.builds;
  $('#sp-builds').textContent = ready ? formatCount(count) : '—';
  $('#sp-usage').textContent = ready && count !== null && total > 0 ? `${((count / total) * 100).toFixed(1)}%` : '—';
  $('#sp-class').textContent = snapshot.hero?.class_name || '—';
  $('#hero-details-btn').disabled = !snapshot.destinations.explore;
  $('#create-build-btn').disabled = !snapshot.destinations.createBuild;
  renderFeaturedBuild(snapshot);
  renderBuildList(snapshot);
}

function renderSpotlight(hero) {
  const stage = $('#hero-stage');
  const color = classColor(hero || {});
  stage.style.setProperty('--hero-accent', color);

  $('#sp-name').textContent = hero?.name || 'Heróis em atualização';
  $('#sp-sub').textContent = hero ? heroRole(hero) : 'Echo Arena';
  $('.hero-description').textContent = hero?.description || 'Informações em atualização.';
  $('#sp-tag-role').textContent = hero?.class_name || 'Herói';
  $('#hero-code').textContent = String(hero?.slug || hero?.id || '—').toUpperCase();
  const watermark = $('#hero-watermark');
  if (watermark) watermark.textContent = hero?.name || '';
  renderScreenVideo(hero);

  const media = hero ? mediaOf(hero, 'main') : null;
  const element = $('#spot-media');
  element.setAttribute('style', mediaStyle(media, 'contain'));
  element.innerHTML = mediaInner(media, hero?.name || '', true);
  element.classList.toggle('empty', !media);

  $('#hero-details-btn').dataset.slug = hero?.slug || '';
  $('#create-build-btn').dataset.hero = hero?.id || '';
}

// Measure text only, once per catalog/font/width change. Images and videos are never duplicated here.
function sizeHeroCopy() {
  const frame = $('#hero-details-frame');
  const content = $('#hero-details');
  const name = $('#sp-name');
  if (!state.heroes.length || !frame.clientWidth) return;
  name.style.fontSize = '';
  const baseSize = Number.parseFloat(getComputedStyle(name).fontSize);
  const measure = content.cloneNode(true);
  for (const node of [measure, ...measure.querySelectorAll('*')]) {
    node.removeAttribute('id');
    for (const attribute of [...node.attributes]) {
      if (attribute.name.startsWith('data-cms-')) node.removeAttribute(attribute.name);
    }
  }
  measure.classList.add('hero-copy-measure');
  measure.setAttribute('aria-hidden', 'true');
  measure.inert = true;
  measure.style.width = `${frame.clientWidth}px`;
  frame.append(measure);
  const title = measure.querySelector('.hero-name');
  title.style.fontSize = `${baseSize}px`;
  let widest = frame.clientWidth;
  for (const hero of state.heroes) {
    title.textContent = hero.name;
    widest = Math.max(widest, title.scrollWidth);
  }
  const fontSize = Math.floor(baseSize * frame.clientWidth / widest);
  name.style.fontSize = title.style.fontSize = `${fontSize}px`;
  let height = 0;
  for (const hero of state.heroes) {
    title.textContent = hero.name;
    measure.querySelector('.hero-class').textContent = heroRole(hero);
    measure.querySelector('.hero-description').textContent = hero.description || 'Informações em atualização.';
    const tags = [hero.class_name || 'Herói'];
    if (String(hero.id) === String(heroSelection.snapshot().featuredHeroId)) {
      tags.push(state.cmsContent.hero_tag_secondary, state.cmsContent.hero_tag_tertiary);
    }
    measure.querySelector('.tags').innerHTML = tags.filter(Boolean)
      .map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
    height = Math.max(height, measure.getBoundingClientRect().height);
  }
  frame.style.minHeight = `${Math.ceil(height)}px`;
  measure.remove();
}

let copySizingFrame = 0;
function queueCopySizing() {
  cancelAnimationFrame(copySizingFrame);
  copySizingFrame = requestAnimationFrame(sizeHeroCopy);
}

function buildTitle(build) {
  return build?.title || build?.name || 'Build da comunidade';
}

function formatCount(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value))
    ? Number(value).toLocaleString('pt-BR') : '—';
}

function buildStateMessage(snapshot) {
  const heroName = snapshot.hero?.name || 'este herói';
  if (snapshot.builds.status === 'loading') return `Carregando builds de ${heroName}…`;
  if (snapshot.builds.status === 'error') return `Não foi possível carregar as builds de ${heroName}.`;
  if (snapshot.builds.status === 'idle') return 'Selecione um herói para explorar suas builds.';
  return `Ainda não há builds públicas de ${heroName}.`;
}

function renderFeaturedBuildEquipment(build, status) {
  const grid = $('#featured-build-equipment');
  const slots = homeBuildEquipmentSlots(build);
  grid.setAttribute('aria-label', build
    ? `Equipamentos da build: ${slots.filter(Boolean).length} de ${slots.length} posições ocupadas`
    : status === 'loading' ? 'Carregando equipamentos da build' : 'Nenhuma build carregada');
  grid.replaceChildren(...slots.map((item, index) => {
    const slot = document.createElement('div');
    slot.className = `equipment-slot${item ? ' is-equipped' : ''}`;
    slot.dataset.slot = String(index + 1);
    const equipment = (Array.isArray(item?.equipment) ? item.equipment[0] : item?.equipment) || {};
    const name = item ? equipment.name || 'Equipamento indisponível' : build ? 'Posição vazia' : 'Aguardando build';
    slot.title = `Posição ${index + 1}: ${name}`;
    slot.setAttribute('aria-label', slot.title);
    const fallback = document.createElement('span');
    fallback.textContent = item ? '◇' : '＋';
    fallback.setAttribute('aria-hidden', 'true');
    slot.append(fallback);
    const source = item && resolveMediaUrl(equipment.image_path || equipment.image_url);
    if (source) {
      const image = document.createElement('img');
      image.alt = name;
      image.decoding = 'async';
      fallback.hidden = true;
      image.addEventListener('error', () => { image.remove(); fallback.hidden = false; }, { once: true });
      image.src = source;
      slot.append(image);
    }
    return slot;
  }));
}

function renderFeaturedBuild(snapshot) {
  const { hero, builds } = snapshot;
  const build = builds.status === 'ready' ? builds.items[0] : null;
  renderFeaturedBuildEquipment(build, builds.status);
  const button = $('#featured-build-btn');
  const card = $('#featured-build-card');
  card.dataset.hero = snapshot.selectedHeroId;
  card.setAttribute('aria-busy', String(builds.status === 'loading'));
  $('#featured-build-context').textContent = hero ? `Build de ${hero.name}` : 'Build da comunidade';
  $('#featured-build-status').textContent = build ? 'Pública' : builds.status === 'loading' ? 'Carregando' : 'Comunidade';
  delete button.dataset.build;
  delete button.dataset.action;
  if (!build) {
    const message = buildStateMessage(snapshot);
    $('#featured-build-title').textContent = message;
    $('#featured-build-author').textContent = builds.status === 'error'
      ? 'Tente carregar novamente.' : builds.status === 'ready' ? 'Compartilhe sua combinação com a comunidade.' : '';
    for (const id of ['featured-build-likes', 'featured-build-popularity', 'featured-build-favorites', 'featured-build-votes']) {
      $(`#${id}`).textContent = '—';
    }
    button.disabled = !hero || !['error', 'ready'].includes(builds.status);
    button.dataset.action = builds.status === 'error' ? 'retry' : 'create';
    button.textContent = builds.status === 'error' ? 'Tentar novamente' : builds.status === 'ready' ? `Criar build de ${hero?.name || 'herói'}` : 'Carregando builds…';
    $('#home-top-build').textContent = message;
    $('#home-top-meta').textContent = hero ? `Herói selecionado · ${hero.name}` : 'Aguardando seleção';
    return;
  }
  const author = Array.isArray(build.author) ? build.author[0] : build.author;
  $('#featured-build-title').textContent = buildTitle(build);
  $('#featured-build-author').textContent = `Por ${author?.display_name || author?.username || 'Jogador'}`;
  $('#featured-build-likes').textContent = `♡ ${formatCount(build.likes)}`;
  $('#featured-build-popularity').textContent = formatCount(build.views);
  $('#featured-build-favorites').textContent = formatCount(build.favorites_count);
  $('#featured-build-votes').textContent = formatCount(build.likes);
  button.disabled = false;
  button.dataset.build = build.id;
  button.textContent = 'Ver análise completa ›';
  $('#home-top-build').textContent = buildTitle(build);
  $('#home-top-meta').textContent = `${hero.name} · ${formatCount(build.likes)} curtidas`;
}

function renderBuildList(snapshot) {
  const { builds, hero } = snapshot;
  const container = $('#builds');
  container.dataset.hero = snapshot.selectedHeroId;
  container.setAttribute('aria-busy', String(builds.status === 'loading'));
  $('#related-builds-hero').textContent = hero?.name || 'seu herói';
  if (builds.status !== 'ready' || !builds.items.length) {
    const action = builds.status === 'error'
      ? '<button class="all-link" type="button" data-build-retry>Tentar novamente</button>'
      : builds.status === 'ready' && hero
        ? '<button class="all-link" type="button" data-create-hero>Criar uma build</button>' : '';
    container.innerHTML = `<div class="loading-card"><p>${escapeHtml(buildStateMessage(snapshot))}</p>${action}</div>`;
    return;
  }
  container.innerHTML = builds.items.map((build) => {
    const author = Array.isArray(build.author) ? build.author[0] : build.author;
    return `<div class="build-row">
      <div><div class="name">${escapeHtml(buildTitle(build))}</div><div class="by">Por ${escapeHtml(author?.display_name || author?.username || 'Jogador')}</div></div>
      <div class="likes">${formatCount(build.likes)} ♡</div>
      <button class="open-build" type="button" data-build="${escapeHtml(build.id)}">Ver build</button>
    </div>`;
  }).join('');
}

function startBuildForActiveHero() {
  const href = heroSelection.snapshot().destinations.createBuild;
  if (!href) return;
  if (!state.session?.user) return openAuth('login');
  window.location.href = href;
}

function openSelectedBuild(buildId) {
  const snapshot = heroSelection.snapshot();
  if (snapshot.builds.status !== 'ready') return;
  const build = snapshot.builds.items.find(item => String(item.id) === String(buildId));
  if (build) window.location.href = `./criar-build.html?build=${encodeURIComponent(build.id)}`;
}

async function loadSavedBuilds() {
  const container = $('#saved');
  if (!state.session?.user) {
    container.innerHTML = '<div class="loading-card">Entre para ver suas builds.</div>';
    return;
  }

  const { data, error } = await supabase
    .from('builds')
    .select('id,title,updated_at')
    .eq('user_id', state.session.user.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('[builds salvas]', error);
    container.innerHTML = '<div class="loading-card">Não foi possível carregar suas builds.</div>';
    return;
  }

  container.innerHTML = data?.length
    ? data.map((build) => `<div class="saved-row"><div><strong>${escapeHtml(build.title)}</strong><div class="date">Atualizada em ${new Date(build.updated_at).toLocaleDateString('pt-BR')}</div></div><span class="heart">♥</span></div>`).join('')
    : '<div class="loading-card">Você ainda não salvou builds.</div>';
}

async function loadAccountContext() {
  state.role = null;
  state.maintenance = false;
  const userId = state.session?.user?.id;
  if (!userId) return;

  try {
    const [profileResult, statusResult] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
      supabase.rpc('site_status')
    ]);
    state.role = profileResult.data?.role ?? null;
    const status = Array.isArray(statusResult.data) ? statusResult.data[0] : statusResult.data;
    state.maintenance = status?.maintenance_mode === true;
  } catch (error) {
    console.warn('[conta] contexto indisponível:', error.message);
  }
}

function confirmLogout() {
  if (state.role !== 'admin') return Promise.resolve(true);
  const warning = state.maintenance
    ? '\n\nO site está em manutenção e ficará bloqueado nesta aba.'
    : '';
  return Promise.resolve(window.confirm(`Sair da conta de administrador?${warning}`));
}

function updateAuthUI() {
  const loginButton = $('#login-btn');
  const accountButton = $('#register-btn');

  if (state.session?.user) {
    loginButton.textContent = 'Sair';
    loginButton.onclick = async () => {
      if (await confirmLogout()) await supabase.auth.signOut();
    };
    accountButton.textContent = 'Meu Perfil';
    accountButton.disabled = false;
    accountButton.onclick = () => window.location.assign(identityProfileUrl(window.location.href));
  } else {
    loginButton.textContent = 'Entrar';
    loginButton.onclick = () => openAuth('login');
    accountButton.textContent = 'Registrar';
    accountButton.disabled = false;
    accountButton.onclick = () => openAuth('register');
  }

  loadSavedBuilds();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  showMessage('Processando...');

  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const displayName = $('#auth-name').value.trim();

  if (state.authMode === 'register') {
    await signupHandleGatePromise;
    let metadata;
    try {
      metadata = identitySignupMetadata(displayName, $('#auth-handle')?.value, signupHandleEnabled);
    } catch {
      return showMessage('Escolha um apelido de 3–24 caracteres com letras, números, ponto, hífen ou underline.', 'error');
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: identityProfileUrl(window.location.href)
      }
    });
    if (error) return showMessage(error.message, 'error');
    if (data?.session) {
      window.location.assign(identityProfileUrl(window.location.href));
      return;
    }
    showMessage('Conta criada. Confirme seu e-mail para concluir sua identidade em Meu Perfil.', 'success');
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return showMessage(error.message, 'error');
  closeAuth();
}

async function resetPassword() {
  const email = $('#auth-email').value.trim();
  if (!email) return showMessage('Digite seu e-mail primeiro.', 'error');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
  if (error) return showMessage(error.message, 'error');
  showMessage('Enviamos o link de recuperação para seu e-mail.', 'success');
}

function shiftCarousel(direction, { revealSelected = false } = {}) {
  const container = $('#heroes');
  const cards = $$('.hero-card');
  if (!cards.length) return;
  const cardWidth = cards[0].getBoundingClientRect().width;
  const gap = Number.parseFloat(getComputedStyle(container).columnGap) || 16;
  const step = cardWidth + gap;
  const visible = Math.max(1, Math.floor(($('.heroes-viewport').clientWidth + gap) / step));
  const maxIndex = Math.max(0, cards.length - visible);
  state.carouselIndex = Math.min(maxIndex, Math.max(0, state.carouselIndex + direction));
  if (revealSelected) {
    const selected = cards.findIndex(card => card.dataset.heroId === String(state.activeHero?.id));
    if (selected >= 0 && selected < state.carouselIndex) state.carouselIndex = selected;
    else if (selected >= state.carouselIndex + visible) state.carouselIndex = selected - visible + 1;
  }
  container.style.transform = `translateX(${-state.carouselIndex * step}px)`;
}

let navigationToastTimer = 0;

function setSidebarOpen(open) {
  const sidebar = $('#site-sidebar');
  const trigger = $('#sidebar-open');
  if (!sidebar || !trigger) return;

  document.body.classList.toggle('sidebar-open', open);
  sidebar.setAttribute('aria-hidden', String(!open));
  trigger.setAttribute('aria-expanded', String(open));
  $('#sidebar-backdrop')?.setAttribute('aria-hidden', String(!open));

  if (open) $('#sidebar-close')?.focus();
  else trigger.focus({ preventScroll: true });
}

function showNavigationToast(message) {
  const toast = $('#nav-toast');
  if (!toast) return;
  window.clearTimeout(navigationToastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  navigationToastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function bindSidebarNavigation() {
  $('#sidebar-open')?.addEventListener('click', () => setSidebarOpen(true));
  $('#sidebar-close')?.addEventListener('click', () => setSidebarOpen(false));
  $('#sidebar-backdrop')?.addEventListener('click', () => setSidebarOpen(false));

  $$('#site-sidebar a').forEach((link) => {
    link.addEventListener('click', (event) => {
      const upcoming = link.dataset.comingSoon;
      if (upcoming) {
        event.preventDefault();
        showNavigationToast(`${upcoming}: esta área será disponibilizada em breve.`);
        return;
      }
      setSidebarOpen(false);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('sidebar-open')) {
      setSidebarOpen(false);
    }
  });
}

function bindEvents() {
  bindSidebarNavigation();
  $('#auth-close').addEventListener('click', closeAuth);
  $('#auth-modal').addEventListener('click', (event) => {
    if (event.target.id === 'auth-modal') closeAuth();
  });
  $('#auth-form').addEventListener('submit', handleAuthSubmit);
  $('#auth-switch-btn').addEventListener('click', () => setAuthMode(state.authMode === 'login' ? 'register' : 'login'));
  $('#auth-handle')?.addEventListener('input', (event) => {
    event.currentTarget.value = normalizePublicHandle(event.currentTarget.value);
  });
  $('#forgot-password-btn').addEventListener('click', resetPassword);

  $('#hero-details-btn').addEventListener('click', () => {
    const href = heroSelection.snapshot().destinations.explore;
    if (href) window.location.href = href;
  });

  $('#create-build-btn').addEventListener('click', startBuildForActiveHero);
  $('#featured-build-btn').addEventListener('click', (event) => {
    const { build, action } = event.currentTarget.dataset;
    if (build) openSelectedBuild(build);
    else if (action === 'retry') heroSelection.retry();
    else if (action === 'create') startBuildForActiveHero();
  });
  $('#builds').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.build) openSelectedBuild(button.dataset.build);
    else if (button.hasAttribute('data-build-retry')) heroSelection.retry();
    else if (button.hasAttribute('data-create-hero')) startBuildForActiveHero();
  });

  $('#spotlight-prev').addEventListener('click', () => heroSelection.stepHero(-1));
  $('#spotlight-next').addEventListener('click', () => heroSelection.stepHero(1));
  $('#heroes-prev').addEventListener('click', () => shiftCarousel(-1));
  $('#heroes-next').addEventListener('click', () => shiftCarousel(1));

  $('#hero-search').addEventListener('input', (event) => {
    state.heroQuery = event.target.value.trim().toLocaleLowerCase('pt-BR');
    state.carouselIndex = 0;
    $('#heroes').style.transform = '';
    renderHeroCards();
  });

  window.addEventListener('resize', () => { shiftCarousel(0); queueCopySizing(); });
  document.fonts?.ready.then(queueCopySizing);
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    heroMotion.destroy();
    heroImagePreloader.clear();
    cancelAnimationFrame(copySizingFrame);
  });
}

async function bootstrap() {
  if (window.__ECHO_BLOCKED) return;
  bindEvents();

  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  await loadAccountContext();
  updateAuthUI();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    await loadAccountContext();
    updateAuthUI();
  });

  const authorityReady = loadHomeFeaturedAuthority();
  await Promise.all([loadScreenVideos(), loadHeroes(authorityReady), loadSiteStats(), authorityReady]);
}

bootstrap().catch((error) => console.error('[Echo Arena]', error));
