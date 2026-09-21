import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { resolveMediaUrl } from './media-storage.js?v=20260823-security-supabase-pin-1';
import { loadEquipmentVerificationV1 } from './equipment-verification-v1.js?v=20260916-equipment-verification-v1';

const $ = id => document.getElementById(id);
const grid = $('grid');
const state = {
  items: [],
  slots: new Map(),
  sets: new Map(),
  classes: new Map(),
  variants: new Map(),
  verifications: new Map(),
  active: '',
  swapTimer: null,
  sources: { slots: true, sets: true, classes: true, variants: true, levels: true }
};

const DIVINO_COLOR = '#FDE047';

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

function media(item) {
  return resolveMediaUrl(item?.image_path||item?.image_url||'');
}

function normalizeAttributes(value) {
  if (Array.isArray(value)) {
    return value.map(item => ({
      label: String(item?.label ?? item?.name ?? item?.raw ?? '').trim(),
      value: item?.value ?? ''
    })).filter(item => item.label);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([label, attributeValue]) => ({ label, value: attributeValue }));
  }
  return [];
}

function normalizeLabel(value = '') {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readableLabel(value = '') {
  const source = normalizeLabel(value);
  if (!source) return 'Atributo';

  const known = {
    'Alcance do tiro com mira do heroi': 'Alcance do tiro com mira',
    'Tamanho do carregador da arma do heroi': 'Tamanho do carregador',
    'Alcance de visao do heroi': 'Alcance de visão',
    'Dano da arma a armadura do inimigo percentual': 'Dano à armadura',
    'Armadura por segundo ao heroi': 'Armadura por segundo',
    'Armadura maxima do heroi percentual': 'Armadura máxima',
    'Vida Por Segundo Ao Heroi': 'Vida por segundo',
    'Velocidade Para Pegar Melhorias Percentual': 'Tempo para pegar melhorias',
    'Poder Perfuracao Arma': 'Poder de perfuração',
    'Dispersao Tiro Com Mira Arma Percentual': 'Dispersão com mira'
  };

  return known[source] || source.charAt(0).toUpperCase() + source.slice(1);
}

function formatAttributeValue(attribute) {
  const raw = String(attribute?.value ?? '').trim();
  if (!raw) return '—';

  const label = String(attribute?.label || '').toLowerCase();
  const numeric = Number(raw.replace(',', '.'));
  const isNumeric = Number.isFinite(numeric);
  const isPercent = /percentual|percent|pct|%/.test(label);

  if (!isNumeric) return raw;
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${raw}${isPercent ? '%' : ''}`;
}

function variantsFor(id) {
  return state.variants.get(String(id)) || [];
}

function divinoVariant(item) {
  if (!state.sources.variants) return null;
  const variants = variantsFor(item.id);
  return variants.find(variant => variant.slug === 'divino') || variants[0] || null;
}

function renderName(value) {
  const node = $('equipment-name');
  if (!node) return;
  const text = String(value || '—').trim() || '—';
  const words = text.split(/\s+/);
  if (words.length < 2) {
    node.textContent = text;
    return;
  }
  const accent = words.pop();
  node.innerHTML = `${esc(words.join(' '))} <span class="equipment-name-accent">${esc(accent)}</span>`;
}

function renderFeaturedVerification(item) {
  const host = document.querySelector('.equipment-meta');
  if (!host) return;

  const current = host.querySelector('[data-equipment-verification]');
  const verification = state.verifications.get(String(item?.id));
  if (!verification) {
    current?.remove();
    return;
  }

  const badge = current || document.createElement('span');
  badge.dataset.equipmentVerification = verification.kind;
  badge.className = `equipment-verification-badge ${verification.kind === 'master' ? 'is-master' : 'is-official'}`;
  badge.textContent = verification.label;
  if (!current) host.append(badge);
}

function renderAttributeCards(attributes, rarityName) {
  const host = $('equipment-attribute-cards');
  if (!host) return;

  if (!state.sources.variants) {
    host.innerHTML = '<div class="equipment-attribute-card is-empty"><span>Atributos</span><strong>—</strong><small>Fonte indisponível nesta leitura.</small></div>';
    return;
  }

  if (!attributes.length) {
    host.innerHTML = `<div class="equipment-attribute-card is-empty"><span>Atributos · ${esc(rarityName || 'Divino')}</span><strong>—</strong><small>Nenhum atributo cadastrado nesta raridade.</small></div>`;
    return;
  }

  host.innerHTML = attributes.slice(0, 3).map(attribute => `
    <div class="equipment-attribute-card">
      <span>${esc(readableLabel(attribute.label))}</span>
      <strong>${esc(formatAttributeValue(attribute))}</strong>
      <small>${esc(rarityName || 'Divino')}</small>
    </div>
  `).join('');
}

function renderHudAttributes(attributes) {
  const host = $('equipment-hud-attributes');
  if (!host) return;

  if (!state.sources.variants) {
    host.textContent = '—';
    return;
  }

  if (!attributes.length) {
    host.textContent = 'Sem atributos cadastrados';
    return;
  }

  host.innerHTML = attributes.slice(0, 2).map(attribute => `
    <span><b>${esc(readableLabel(attribute.label))}</b><em>${esc(formatAttributeValue(attribute))}</em></span>
  `).join('');
}

function animateEquipmentSwap(explorer, previousId) {
  if (!explorer || !previousId || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  explorer.classList.remove('is-updating');
  void explorer.offsetWidth;
  explorer.classList.add('is-updating');
  clearTimeout(state.swapTimer);
  state.swapTimer = setTimeout(() => explorer.classList.remove('is-updating'), 560);
}

function setFeatured(item) {
  if (!item) return;

  const nextId = String(item.id);
  if (state.active === nextId) return;

  const previousId = state.active;
  state.active = nextId;

  const slot = state.sources.slots ? state.slots.get(item.slot_id) : null;
  const set = state.sources.sets ? state.sets.get(item.set_id) : null;
  const heroClass = state.sources.classes ? state.classes.get(item.class_id) : null;
  const variant = divinoVariant(item);
  const attributes = normalizeAttributes(variant?.attributes);
  const src = media(item);

  const rarityText = state.sources.variants
    ? (variant?.name || 'Divino')
    : '—';
  const rarityColor = state.sources.variants
    ? (variant?.color || DIVINO_COLOR)
    : DIVINO_COLOR;

  const slotText = !item.slot_id
    ? 'Sem slot'
    : state.sources.slots
      ? (slot?.name || 'Slot não identificado')
      : '—';

  const setTextValue = !item.set_id
    ? 'Sem conjunto'
    : state.sources.sets
      ? (set?.name || 'Conjunto não identificado')
      : '—';

  const classText = !item.class_id
    ? 'Sem restrição'
    : state.sources.classes
      ? (heroClass?.name || 'Classe não identificada')
      : '—';

  const classNote = item.class_id && heroClass
    ? 'Equipamento exclusivo desta classe'
    : item.class_id
      ? ''
      : 'Disponível sem classe exclusiva cadastrada';

  const explorer = $('equipment-explorer');
  explorer?.style.setProperty('--item-color', rarityColor);
  explorer?.style.setProperty('--divino-color', rarityColor);
  if (explorer) explorer.dataset.activeId = nextId;

  setText('equipment-watermark', item.name || 'ITEM');
  renderName(item.name || '—');
  setText('equipment-rarity', rarityText);
  setText('equipment-slot', slotText);
  setText('equipment-set', setTextValue);
  renderFeaturedVerification(item);

  setText('equipment-hud-rarity', rarityText);
  setText('equipment-hud-slot', slotText);
  setText('equipment-hud-set', setTextValue);
  setText('equipment-hud-class', classText);
  setText('equipment-hud-class-note', classNote);
  renderHudAttributes(attributes);
  renderAttributeCards(attributes, rarityText);

  setText(
    'equipment-description',
    item.description?.trim() || 'Nenhuma análise editorial publicada ainda. Consulte a ficha completa para os dados técnicos disponíveis.'
  );

  const stage = $('equipment-stage');
  if (stage) stage.setAttribute('aria-label', `Mesa de inspeção tática: ${item.name || 'equipamento'}, raridade ${rarityText}`);

  const art = $('equipment-feature-art');
  if (art) {
    art.innerHTML = src
      ? `<div class="media"><img src="${esc(src)}" alt="${esc(item.name)}"></div>`
      : '<div class="media empty"></div>';
  }

  animateEquipmentSwap(explorer, previousId);

  grid?.querySelectorAll('.eq[data-id]').forEach(card => {
    card.classList.toggle('is-featured', String(card.dataset.id) === state.active);
  });
}

function enhanceCards() {
  grid?.querySelectorAll('.eq[data-id]').forEach(card => {
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
  });

  const current = [...grid?.querySelectorAll('.eq[data-id]') || []]
    .find(card => String(card.dataset.id) === state.active);

  if (!current) {
    const first = grid?.querySelector('.eq[data-id]');
    const item = first
      ? state.items.find(row => String(row.id) === String(first.dataset.id))
      : state.items[0];
    if (item) setFeatured(item);
  }
}

function bindGrid() {
  if (!grid) return;
  new MutationObserver(enhanceCards).observe(grid, { childList: true });
  enhanceCards();

  grid.addEventListener('mouseover', event => {
    const card = event.target.closest('.eq[data-id]');
    const item = card ? state.items.find(row => String(row.id) === String(card.dataset.id)) : null;
    if (item) setFeatured(item);
  });
  grid.addEventListener('focusin', event => {
    const card = event.target.closest('.eq[data-id]');
    const item = card ? state.items.find(row => String(row.id) === String(card.dataset.id)) : null;
    if (item) setFeatured(item);
  });
  grid.addEventListener('click', event => {
    const card = event.target.closest('.eq[data-id]');
    const item = card ? state.items.find(row => String(row.id) === String(card.dataset.id)) : null;
    if (item) setFeatured(item);
  }, true);
}

function bindStageMotion() {
  const stage = $('equipment-stage');
  const explorer = $('equipment-explorer');
  if (!stage || !explorer) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(pointer: coarse)').matches) return;

  stage.addEventListener('pointermove', event => {
    const rect = stage.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    explorer.style.setProperty('--stage-x', `${(x * 7).toFixed(2)}px`);
    explorer.style.setProperty('--stage-y', `${(y * 5).toFixed(2)}px`);
  });

  stage.addEventListener('pointerleave', () => {
    explorer.style.setProperty('--stage-x', '0px');
    explorer.style.setProperty('--stage-y', '0px');
  });
}

$('equipment-open-detail')?.addEventListener('click', () => {
  const card = [...grid?.querySelectorAll('.eq[data-id]') || []]
    .find(node => String(node.dataset.id) === state.active);
  card?.click();
});

$('equipment-browse')?.addEventListener('click', () => {
  grid?.scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start'
  });
});

async function load() {
  const verificationPromise = loadEquipmentVerificationV1(supabase).catch(error => {
    console.warn('[equipments-experience] selos de verificação indisponíveis nesta leitura', error);
    return new Map();
  });

  try {
    const [itemsResult, slotsResult, setsResult, classesResult, variantsResult, levelsResult] = await Promise.all([
      supabase.from('equipments')
        .select('id,name,description,image_path,image_url,rarity,slot_id,set_id,class_id,enabled,display_order')
        .eq('enabled',true)
        .order('display_order', { ascending: true })
        .order('name'),
      supabase.from('equipment_slots')
        .select('id,name,slug,display_order')
        .order('display_order'),
      supabase.from('equipment_sets')
        .select('id,name,slug,description'),
      supabase.from('hero_classes')
        .select('id,name,slug'),
      supabase.from('equipment_variants')
        .select('equipment_id,attributes,equipment_rarities(slug,name,rank,color)'),
      supabase.from('equipment_rarity_levels')
        .select('equipment_id,rarity_slug,rarity_name,rarity_order,rarity_color,stats')
        .order('rarity_order')
    ]);

    if (itemsResult.error) throw itemsResult.error;

    state.items = itemsResult.data || [];
    state.sources.slots = !slotsResult.error;
    state.sources.sets = !setsResult.error;
    state.sources.classes = !classesResult.error;
    state.sources.variants = !variantsResult.error;
    state.sources.levels = !levelsResult.error;

    state.slots = new Map((state.sources.slots ? slotsResult.data || [] : []).map(row => [row.id, row]));
    state.sets = new Map((state.sources.sets ? setsResult.data || [] : []).map(row => [row.id, row]));
    state.classes = new Map((state.sources.classes ? classesResult.data || [] : []).map(row => [row.id, row]));

    if (state.sources.variants) {
      for (const row of variantsResult.data || []) {
        const id = String(row.equipment_id);
        if (!state.variants.has(id)) state.variants.set(id, []);
        state.variants.get(id).push({
          slug: row.equipment_rarities?.slug || '',
          name: row.equipment_rarities?.name || row.equipment_rarities?.slug || '',
          rank: Number(row.equipment_rarities?.rank ?? 0),
          color: row.equipment_rarities?.color || DIVINO_COLOR,
          attributes: row.attributes
        });
      }
      for (const rows of state.variants.values()) rows.sort((a, b) => b.rank - a.rank);
    }

    if (slotsResult.error) console.warn('[equipments-experience] slots indisponíveis', slotsResult.error);
    if (setsResult.error) console.warn('[equipments-experience] conjuntos indisponíveis', setsResult.error);
    if (classesResult.error) console.warn('[equipments-experience] classes indisponíveis', classesResult.error);
    if (variantsResult.error) console.warn('[equipments-experience] variantes indisponíveis', variantsResult.error);
    if (levelsResult.error) console.warn('[equipments-experience] níveis de compatibilidade indisponíveis', levelsResult.error);

    setText('equipment-total', String(state.items.length));
    setText('equipment-slot-total', state.sources.slots ? String(state.slots.size) : '—');
    setText('equipment-set-total', state.sources.sets ? String(state.sets.size) : '—');

    bindGrid();
    bindStageMotion();
    setFeatured(state.items[0]);

    state.verifications = await verificationPromise;
    const activeItem = state.items.find(item => String(item.id) === state.active);
    renderFeaturedVerification(activeItem);
  } catch (error) {
    console.error('[equipments-experience]', error);
    setText('equipment-name', 'Equipamentos indisponíveis');
    setText('equipment-description', 'Não foi possível carregar o laboratório nesta leitura.');
  }
}

await load();
