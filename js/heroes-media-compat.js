import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { resolveMediaUrl } from './media-storage.js?v=20260821-media-4&sb=20260823-security-supabase-pin-1';

/*
  Compatibilidade de mídia da página Heróis.
  v_heroes_complete já fornece main_source/card_source como URLs públicas completas.
  Esta camada usa o contrato central resolveMediaUrl(), que preserva URLs públicas
  absolutas e só encaminha caminhos legados relativos ao Worker.
  Não altera dados, cálculos, filtros ou proveniência.
*/

const bySlug = new Map();
const byName = new Map();
const $ = id => document.getElementById(id);

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
}

function mediaFor(hero, preferred = 'card') {
  if (!hero) return null;
  const order = preferred === 'main' ? ['main', 'card', 'gif'] : ['card', 'main', 'gif'];
  for (const slot of order) {
    const source = resolveMediaUrl(String(hero[`${slot}_source`] || '').trim());
    if (!source) continue;
    return {
      source,
      mime: String(hero[`${slot}_mime_type`] || ''),
      scale: Number(hero[`${slot}_scale`] ?? 1),
      x: Number(hero[`${slot}_offset_x`] ?? 0),
      y: Number(hero[`${slot}_offset_y`] ?? 0),
      anchorX: hero.anchor_x || '50%',
      anchorY: hero.anchor_y || '50%'
    };
  }
  return null;
}

function renderMedia(host, media, alt = '', fit = 'cover') {
  if (!host || !media?.source) return false;
  host.style.setProperty('--fit', fit);
  host.style.setProperty('--pos', `${media.anchorX} ${media.anchorY}`);
  host.style.setProperty('--scale', Number.isFinite(media.scale) ? String(media.scale) : '1');
  host.style.setProperty('--x', `${Number.isFinite(media.x) ? media.x : 0}%`);
  host.style.setProperty('--y', `${Number.isFinite(media.y) ? media.y : 0}%`);
  const isVideo = media.mime.startsWith('video/') || /\.(mp4|webm)(?:\?|$)/i.test(media.source);
  host.innerHTML = isVideo
    ? `<video src="${esc(media.source)}" autoplay muted loop playsinline></video>`
    : `<img src="${esc(media.source)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
  host.classList.remove('empty');
  host.dataset.mediaCompat = 'direct-source';
  return true;
}

function patchCard(card) {
  const hero = bySlug.get(String(card?.dataset?.slug || ''));
  const host = card?.querySelector('.thumb .media');
  if (!hero || !host) return;
  renderMedia(host, mediaFor(hero, 'card'), hero.name, 'cover');
}

function patchAllCards() {
  document.querySelectorAll('#grid .hc[data-slug]').forEach(patchCard);
}

function featuredHero() {
  const name = $('featured-name')?.textContent?.trim().toLowerCase();
  return name ? byName.get(name) || null : null;
}

function patchFeatured() {
  const hero = featuredHero();
  if (!hero) return;
  const media = mediaFor(hero, 'main');
  renderMedia($('featured-media'), media, hero.name, 'contain');
  const background = $('hero-explorer-bg');
  if (background && media?.source) {
    const isVideo = media.mime.startsWith('video/') || /\.(mp4|webm)(?:\?|$)/i.test(media.source);
    background.innerHTML = isVideo
      ? `<video src="${esc(media.source)}" autoplay muted loop playsinline></video>`
      : `<img src="${esc(media.source)}" alt="" loading="eager" decoding="async">`;
    background.dataset.mediaCompat = 'direct-source';
  }
}

function patchDetail(slug) {
  const hero = bySlug.get(String(slug || ''));
  if (!hero) return;
  renderMedia($('hd-media'), mediaFor(hero, 'main'), hero.name, 'contain');
}

function wireDom() {
  const grid = $('grid');
  if (grid) {
    new MutationObserver(() => requestAnimationFrame(patchAllCards)).observe(grid, { childList: true, subtree: false });
    const syncFromCard = event => {
      const card = event.target.closest?.('.hc[data-slug]');
      if (!card) return;
      requestAnimationFrame(() => {
        patchCard(card);
        patchFeatured();
        if (event.type === 'click') patchDetail(card.dataset.slug);
      });
    };
    grid.addEventListener('mouseover', syncFromCard);
    grid.addEventListener('focusin', syncFromCard);
    grid.addEventListener('click', syncFromCard);
  }

  const featuredName = $('featured-name');
  if (featuredName) {
    new MutationObserver(() => requestAnimationFrame(patchFeatured)).observe(featuredName, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
}

async function load() {
  const { data, error } = await supabase
    .from('v_heroes_complete')
    .select('id,name,slug,enabled,main_source,main_mime_type,main_scale,main_offset_x,main_offset_y,card_source,card_mime_type,card_scale,card_offset_x,card_offset_y,gif_source,gif_mime_type,gif_scale,gif_offset_x,gif_offset_y,anchor_x,anchor_y')
    .eq('enabled', true)
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('name');

  if (error) {
    console.warn('[heroes-media-compat] mídia pública indisponível:', error.message);
    return;
  }

  for (const hero of data || []) {
    bySlug.set(String(hero.slug || ''), hero);
    byName.set(String(hero.name || '').trim().toLowerCase(), hero);
  }

  patchAllCards();
  patchFeatured();
}

wireDom();
await load();
