import { restoreEquipmentLoadout } from './equipment-eligibility.js?v=1';
import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { resolveMediaUrl } from './media-storage.js?v=20260823-security-supabase-pin-1';
import { esc, numSafe, corDoItem, nivelAtual, normalizar } from './ui-core.js';
import { analyzeBuildV2, loadCalculationDataV2 } from './calculation-v2-build-adapter.js?v=20260915-calculation-v2-1&partial=20260917-partial-effects-1';
import { formatCalculationValue } from './calculation-v2-view.js?v=20260915-calculation-v2-1&partial=20260917-partial-effects-1';

/* ============================================================
   COMPARAR BUILDS — somente dados reais

   Fonte da build: rascunho local ou tabela builds.
   Fonte do ranking: builds públicas do mesmo herói.
   Fonte dos números: catálogo publicado do motor de cálculo v2.
   Fonte da arte: campos exclusivos do Editor de Herói.
   ============================================================ */

const BUILD_FIELDS = [
  'id', 'user_id', 'hero_id', 'title', 'description', 'is_public',
  'visibility', 'status', 'likes', 'views', 'rating_average',
  'rating_count', 'created_at', 'updated_at', 'published_at', 'deleted_at'
].join(',');

const DEFAULT_SLOTS = [
  { key: 'cabeca', label: 'Cabeça' },
  { key: 'peito', label: 'Peito' },
  { key: 'mao', label: 'Mão' },
  { key: 'pe', label: 'Pé' },
  { key: 'acessorio', label: 'Acessório' },
  { key: 'gadget', label: 'Gadget' }
];

const CATEGORY_KEYS = {
  ofensiva: new Set([
    'weapon.damage', 'weapon.fire_rate', 'weapon.fire_interval',
    'weapon.armor_penetration', 'weapon.armor_penetration_power'
  ]),
  defesa: new Set(['hero.health', 'hero.armor']),
  mobilidade: new Set(['hero.movement_speed']),
  utilidade: new Set([
    'hero.power', 'hero.vision_range', 'weapon.magazine', 'weapon.reload_time',
    'weapon.range', 'weapon.aim_time', 'weapon.spread', 'weapon.spread_factor',
    'weapon.moving_spread_modifier'
  ])
};

const STAT_DESCRIPTIONS = {
  'weapon.damage': 'Dano base da arma após os efeitos numéricos publicados.',
  'hero.health': 'Vida do herói após os efeitos numéricos publicados.',
  'hero.armor': 'Armadura do herói após os efeitos numéricos publicados.',
  'hero.movement_speed': 'Velocidade de movimento do herói.',
  'hero.vision_range': 'Alcance de visão do herói.',
  'weapon.reload_time': 'Tempo de recarga da arma; menor é melhor.',
  'weapon.magazine': 'Quantidade de munição antes de recarregar.',
  'weapon.spread': 'Dispersão base da arma; menor é melhor.',
  'weapon.moving_spread_modifier': 'Modificador específico da dispersão durante movimento; menor é melhor.'
};

const state = {
  session: null,
  catalog: null,
  mine: null,
  ranked: [],
  selected: null,
  filter: 'alterados',
  query: '',
  buildQuery: '',
  expanded: null,
  ready: false,
  profiles: new Map()
};

const $ = id => document.getElementById(id);
const valueOr = (value, fallback = '') => value === undefined || value === null || value === '' ? fallback : value;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const cms = (key, fallback = '') => valueOr(window.EchoSiteContent?.content?.[key], fallback);

function format(value, decimals = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return numeric.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatStat(value, definition = {}) {
  return formatCalculationValue(value, definition);
}

function getInitials(value = '') {
  const parts = String(value).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'EA';
  return parts.slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function categoryFor(key) {
  return Object.entries(CATEGORY_KEYS).find(([, keys]) => keys.has(key))?.[0] || 'utilidade';
}

function categoryIcon(category) {
  const icons = {
    ofensiva: '◎',
    defesa: '⬡',
    mobilidade: 'ϟ',
    utilidade: '✦'
  };
  return icons[category] || '◇';
}

function resolveHeroMedia(hero) {
  /* Estes dois campos pertencem ao Editor de Herói. Não existe fallback
     para a página inicial nem para o CMS editorial. */
  const artPath = hero.build_card_image_path || hero.build_image_path || '';
  const thumbPath = hero.card_image_path || hero.build_card_image_path || hero.build_image_path || '';
  const useCardTransform = Boolean(hero.build_card_image_path);
  return {
    art: resolveMediaUrl(artPath),
    thumb: resolveMediaUrl(thumbPath),
    scale: numSafe(useCardTransform ? hero.build_card_image_scale : hero.build_image_scale, 1),
    x: numSafe(useCardTransform ? hero.build_card_image_offset_x : hero.build_image_offset_x, 0),
    y: numSafe(useCardTransform ? hero.build_card_image_offset_y : hero.build_image_offset_y, 0)
  };
}

function mediaStyle(media) {
  return `--hero-scale:${number(media?.scale, 1)};--hero-offset-x:${number(media?.x, 0)}%;--hero-offset-y:${number(media?.y, 0)}%;`;
}

function showComparisonContent(show) {
  document.querySelectorAll('[data-comparison-content]').forEach(element => {
    const visibilityKey = element.dataset.cmsVisible;
    const allowed = !visibilityKey || window.EchoSiteContent?.content?.[visibilityKey] !== false;
    element.hidden = !(show && allowed);
  });
}

function setSource(mode, label, detail) {
  const context = $('source-context');
  if (context) context.className = `meta-context data-source ${mode}`;
  if ($('source-label')) $('source-label').textContent = label;
  if ($('data-source')) $('data-source').textContent = detail;
}

function setPageState(mode, title, copy, action = null) {
  const panel = $('comparison-state');
  if (!panel) return;
  panel.className = `comparison-state is-${mode}`;
  panel.hidden = false;
  $('comparison-state-kicker').textContent = mode === 'loading'
    ? 'CARREGANDO DADOS REAIS'
    : mode === 'error' ? 'NÃO FOI POSSÍVEL COMPARAR' : 'COMPARAÇÃO INDISPONÍVEL';
  $('comparison-state-title').textContent = title;
  $('comparison-state-copy').textContent = copy;
  const link = $('comparison-state-action');
  if (action) {
    link.textContent = action.label;
    link.href = action.href;
    link.hidden = false;
  } else {
    link.hidden = true;
  }
  showComparisonContent(false);
}

function finishLoading() {
  $('comparison-state').hidden = true;
  showComparisonContent(true);
  setSource('live', 'DADOS VERIFICADOS', 'Supabase + motor real');
}

function queryError(result, label, required = true) {
  if (!result?.error) return;
  const error = new Error(`Falha ao carregar ${label}: ${result.error.message}`);
  error.cause = result.error;
  if (required) throw error;
  console.warn(`[comparar-build] ${label} indisponível:`, result.error.message);
}

async function loadCatalog() {
  const [
    heroesResult, classesResult, equipmentsResult, slotsResult,
    variantsResult, raritiesResult, setsResult,
    bonusesResult, tiersResult, calculationData
  ] = await Promise.all([
    supabase.from('heroes').select(`
      id,name,slug,class_id,enabled,display_order,
      image_path,card_image_path,
      build_image_path,build_image_scale,build_image_offset_x,build_image_offset_y,
      build_card_image_path,build_card_image_scale,build_card_image_offset_x,build_card_image_offset_y
    `).eq('enabled', true).order('display_order', { ascending: true }).order('name', { ascending: true }),
    supabase.from('hero_classes').select('id,name,slug,color,icon'),
    supabase.from('equipments').select(`
      id,name,description,image_path,image_url,rarity,slot_id,set_id,hero_id,class_id,is_personal,
      recommendation_text,enabled,display_order
    `).eq('enabled', true).order('display_order', { ascending: true }).order('name', { ascending: true }),
    supabase.from('equipment_slots').select('id,name,slug,display_order').order('display_order', { ascending: true }),
    supabase.from('equipment_variants').select('id,equipment_id,rarity_id'),
    supabase.from('equipment_rarities').select('id,slug,name,color,rank').order('rank', { ascending: true }),
    supabase.from('equipment_sets').select('id,name,slug,description,image_path'),
    supabase.from('equipment_set_bonuses').select('id,set_id,required_pieces,title,description,display_order').order('required_pieces', { ascending: true }),
    supabase.from('equipment_tiers').select('id,slug,name,color,display_order').order('display_order', { ascending: true }),
    loadCalculationDataV2(supabase)
  ]);

  queryError(heroesResult, 'heróis');
  queryError(classesResult, 'classes');
  queryError(equipmentsResult, 'equipamentos');
  queryError(slotsResult, 'slots de equipamento');
  queryError(tiersResult, 'raridades das builds');
  queryError(variantsResult, 'variantes de equipamento');
  queryError(raritiesResult, 'raridades');
  queryError(setsResult, 'conjuntos', false);
  queryError(bonusesResult, 'bônus de conjunto', false);

  const classes = new Map((classesResult.data || []).map(item => [item.id, item]));
  const sets = new Map((setsResult.data || []).map(item => [item.id, item]));
  const slotsById = new Map((slotsResult.data || []).map(item => [item.id, item]));
  const raritiesById = new Map((raritiesResult.data || []).map(item => [item.id, item]));
  const tierSlugById = new Map((tiersResult.data || []).map(item => [item.id, item.slug]));

  const bonusesBySet = new Map();
  for (const bonus of bonusesResult.data || []) {
    if (!bonusesBySet.has(bonus.set_id)) bonusesBySet.set(bonus.set_id, []);
    bonusesBySet.get(bonus.set_id).push(bonus);
  }

  const levelsByEquipment = new Map();
  const addLevel = level => {
    if (!level?.equipment_id || !level?.rarity_slug) return;
    if (!levelsByEquipment.has(level.equipment_id)) levelsByEquipment.set(level.equipment_id, new Map());
    levelsByEquipment.get(level.equipment_id).set(level.rarity_slug, level);
  };

  for (const variant of variantsResult.data || []) {
    const rarity = raritiesById.get(variant.rarity_id);
    if (!rarity) continue;
    addLevel({
      equipment_id: variant.equipment_id,
      rarity_slug: rarity.slug,
      rarity_name: rarity.name,
      rarity_order: rarity.rank,
      rarity_color: rarity.color
    });
  }

  const slots = (slotsResult.data || []).filter(slot => slot.slug).map(slot => ({
    key: slot.slug,
    label: slot.name || slot.slug,
    slotId: slot.id
  }));

  const heroes = (heroesResult.data || []).map(hero => {
    const heroClass = classes.get(hero.class_id);
    return {
      ...hero,
      databaseId: hero.id,
      className: heroClass?.name || 'Sem classe',
      classSlug: heroClass?.slug || '',
      classColor: heroClass?.color || '#A855F7',
      media: resolveHeroMedia(hero)
    };
  });

  const equipments = (equipmentsResult.data || []).map(item => {
    const slot = slotsById.get(item.slot_id);
    const equipmentSet = sets.get(item.set_id) || null;
    const levels = [...(levelsByEquipment.get(item.id)?.values() || [])]
      .sort((a, b) => number(a.rarity_order, 999) - number(b.rarity_order, 999))
      .map(level => ({
        slug: level.rarity_slug,
        nome: level.rarity_name || level.rarity_slug,
        ordem: level.rarity_order,
        cor: level.rarity_color || '#8A93AD'
      }));
    return {
      databaseId: item.id,
      heroId: item.hero_id || null,
      classId: item.class_id || null,
      isPersonal: item.is_personal === true,
      enabled: item.enabled,
      nome: item.name,
      descricao: item.description || '',
      recommendation: item.recommendation_text || '',
      slot: slot?.slug || null,
      slotLabel: slot?.name || '',
      raridade: levels[0]?.slug || String(item.rarity || 'comum').toLowerCase(),
      levels,
      setId: item.set_id || null,
      set: equipmentSet ? {
        id: equipmentSet.id,
        nome: equipmentSet.name,
        slug: equipmentSet.slug,
        descricao: equipmentSet.description || '',
        bonus: bonusesBySet.get(equipmentSet.id) || []
      } : null,
      media: {
        src: resolveMediaUrl(item.image_path || item.image_url || ''),
        fit: 'contain', pos: '50% 50%', scale: 1, x: 0, y: 0
      }
    };
  });

  return {
    heroes,
    heroById: new Map(heroes.map(hero => [hero.id, hero])),
    equipments,
    equipmentById: new Map(equipments.map(item => [item.databaseId, item])),
    slots: slots.length ? slots : DEFAULT_SLOTS,
    tierSlugById,
    analysisData: calculationData
  };
}

function readLocalDraft() {
  try {
    const parsed = JSON.parse(localStorage.getItem('echo-arena-build-draft') || 'null');
    if (!parsed?.heroId || !Array.isArray(parsed.items)) return null;
    return {
      id: 'local-draft',
      user_id: state.session?.user?.id || null,
      hero_id: parsed.heroId,
      title: parsed.title || 'Build sem título',
      description: parsed.description || '',
      visibility: parsed.visibility || 'private',
      status: parsed.status || 'draft',
      likes: 0,
      views: 0,
      rating_average: null,
      rating_count: 0,
      updated_at: parsed.savedAt || null,
      source: 'draft',
      items: parsed.items
    };
  } catch (error) {
    console.warn('[comparar-build] Rascunho local inválido:', error.message);
    return null;
  }
}

async function fetchOneBuild(id) {
  if (!id) return null;
  const { data, error } = await supabase.from('builds').select(BUILD_FIELDS).eq('id', id).maybeSingle();
  if (error) throw new Error(`Não foi possível abrir a build indicada: ${error.message}`);
  return data ? { ...data, source: 'saved' } : null;
}

async function resolveMineBuild() {
  const params = new URLSearchParams(location.search);
  const localDraft = readLocalDraft();

  if (params.get('draft') === '1' && localDraft) return localDraft;

  const requested = await fetchOneBuild(params.get('build'));
  if (requested) return requested;

  if (localDraft) return localDraft;
  if (!state.session?.user?.id) return null;

  const { data, error } = await supabase.from('builds')
    .select(BUILD_FIELDS)
    .eq('user_id', state.session.user.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível localizar sua build mais recente: ${error.message}`);
  return data ? { ...data, source: 'saved' } : null;
}

async function fetchRankedBuilds(heroId, mineId) {
  let query = supabase.from('builds')
    .select(BUILD_FIELDS)
    .eq('hero_id', heroId)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .eq('is_public', true)
    .is('deleted_at', null)
    .order('rating_count', { ascending: false, nullsFirst: false })
    .order('rating_average', { ascending: false, nullsFirst: false })
    .order('likes', { ascending: false, nullsFirst: false })
    .order('views', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(12);
  if (mineId && mineId !== 'local-draft') query = query.neq('id', mineId);
  const { data, error } = await query;
  if (error) throw new Error(`Não foi possível carregar o ranking deste herói: ${error.message}`);
  return (data || []).map((build, index) => ({ ...build, source: 'saved', rank: index + 1 }));
}

async function fetchItemsForBuilds(buildIds) {
  const ids = [...new Set(buildIds.filter(id => id && id !== 'local-draft'))];
  const grouped = new Map(ids.map(id => [id, []]));
  if (!ids.length) return grouped;
  const { data, error } = await supabase.from('build_items')
    .select('build_id,equipment_id,tier_id,slot')
    .in('build_id', ids)
    .order('slot', { ascending: true });
  if (error) throw new Error(`Não foi possível carregar os equipamentos das builds: ${error.message}`);
  for (const row of data || []) {
    if (!grouped.has(row.build_id)) grouped.set(row.build_id, []);
    grouped.get(row.build_id).push(row);
  }
  return grouped;
}

async function fetchProfiles(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from('profiles')
    .select('id,username,display_name,avatar_url')
    .in('id', ids);
  if (error) {
    console.warn('[comparar-build] Perfis não puderam ser lidos:', error.message);
    return new Map();
  }
  return new Map((data || []).map(profile => [profile.id, profile]));
}

function contributorMap(analysis) {
  const contributors = new Map();
  const add = (key, label) => {
    if (!contributors.has(key)) contributors.set(key, new Set());
    contributors.get(key).add(label);
  };
  for (const effect of analysis?.core?.effects || []) {
    if (effect.status !== 'applied' || !effect.target) continue;
    add(effect.target, effect.equipmentName || 'Efeito publicado');
  }

  return new Map([...contributors].map(([key, labels]) => [key, [...labels]]));
}

async function materializeBuild(build, rows) {
  const hero = state.catalog.heroById.get(build.hero_id);
  if (!hero) throw new Error(`O herói da build “${build.title || 'sem título'}” não está disponível.`);

  const restored = restoreEquipmentLoadout({ rows: rows || [], hero,
    slots: state.catalog.slots, catalog: state.catalog.equipments,
    tierSlugById: state.catalog.tierSlugById });
  if (restored.issues.length) {
    throw new Error(`A build “${build.title || 'sem título'}” possui equipamentos indisponíveis ou incompatíveis. Revise os equipamentos e raridades na Mesa de Builds.`);
  }
  const equipped = restored.equipados;

  const analysis = analyzeBuildV2({
    heroi: { databaseId: hero.databaseId, classId: hero.class_id, classe: hero.className },
    slots: state.catalog.slots,
    equipados: equipped,
    dados: { calculationV2: state.catalog.analysisData },
    conditions: {}
  });

  if (['invalid', 'catalog-unavailable', 'waiting-hero'].includes(analysis.status)) {
    throw new Error(analysis.mensagem || `A build “${build.title || 'sem título'}” não possui dados suficientes para análise.`);
  }

  const gear = state.catalog.slots.map(slot => ({
    slot,
    item: equipped[slot.key] || null
  }));
  return {
    ...build,
    hero,
    equipped,
    gear,
    analysis,
    contributors: contributorMap(analysis)
  };
}

function profileName(build) {
  const profile = state.profiles.get(build.user_id);
  if (profile?.display_name) return profile.display_name;
  if (profile?.username) return `@${profile.username}`;
  if (state.session?.user?.id === build.user_id) {
    return state.session.user.user_metadata?.display_name
      || state.session.user.user_metadata?.username
      || state.session.user.email?.split('@')[0]
      || 'Você';
  }
  return 'Jogador';
}

function gearMarkup(gear, compact = false) {
  return gear.map(({ slot, item }) => {
    if (!item) {
      return `<div class="gear-item gear-empty ${compact ? 'gear-compact' : ''}" title="${esc(slot.label)} vazio">
        <div class="gear-hex gear-slot-empty"><span>+</span></div>
        ${compact ? '' : `<div class="gear-copy"><strong>Slot vazio</strong><small>${esc(slot.label)}</small></div>`}
      </div>`;
    }
    const level = nivelAtual(item);
    const color = corDoItem(item);
    const image = item.media?.src
      ? `<img src="${esc(item.media.src)}" alt="" loading="lazy">`
      : '<span aria-hidden="true">◇</span>';
    return `<div class="gear-item ${compact ? 'gear-compact' : ''}" title="${esc(slot.label)}: ${esc(item.nome)}" style="--rarity-color:${esc(color)}">
      <div class="gear-hex">${image}</div>
      ${compact ? '' : `<div class="gear-copy"><strong>${esc(item.nome)}</strong><small><i></i>${esc(level?.nome || item.raridade)} · ${esc(slot.label)}</small></div>`}
    </div>`;
  }).join('');
}

function setHeroImage(element, hero) {
  if (!element) return;
  if (!hero?.media?.art) {
    element.hidden = true;
    element.removeAttribute('src');
    element.removeAttribute('style');
    return;
  }
  element.src = hero.media.art;
  element.alt = hero.name || '';
  element.style.cssText = mediaStyle(hero.media);
  element.hidden = false;
}

function renderContext() {
  const hero = state.mine.hero;
  $('comparison-hero-name').textContent = String(hero.name || '—').toUpperCase();
  const thumb = $('comparison-hero-thumb');
  if (hero.media.thumb) {
    thumb.src = hero.media.thumb;
    thumb.alt = hero.name || '';
    thumb.hidden = false;
  } else {
    thumb.hidden = true;
    thumb.removeAttribute('src');
  }

  const accountName = state.session?.user?.user_metadata?.display_name
    || state.session?.user?.user_metadata?.username
    || state.session?.user?.email || 'Echo Arena';
  $('account-avatar').textContent = getInitials(accountName);
}

function renderMine() {
  const build = state.mine;
  const mineName = profileName(build);
  const isOwner = Boolean(state.session?.user?.id && build.user_id === state.session.user.id);
  const isDraft = build.source === 'draft' || build.status === 'draft';
  const changed = (build.analysis.linhas || []).filter(line =>
    typeof line.base === 'number' && Number.isFinite(line.base)
    && typeof line.valor === 'number' && Number.isFinite(line.valor)
    && Math.abs(line.valor - line.base) > 1e-9
  ).length;

  $('mine-owner-mark').textContent = isOwner || isDraft ? 'EU' : 'BASE';
  $('mine-context-label').textContent = isOwner || isDraft
    ? cms('my_build_context_label', 'BUILD DO USUÁRIO')
    : 'BUILD DE REFERÊNCIA';
  $('mine-card-label').textContent = build.title || cms('my_build_label', 'MINHA BUILD ATUAL');
  $('mine-owner-badge').textContent = isOwner || isDraft
    ? cms('my_build_owner_badge', 'VOCÊ')
    : 'BASE';
  $('mine-status-badge').textContent = isDraft
    ? cms('draft_label', 'RASCUNHO')
    : String(build.status || 'SALVA').toUpperCase();
  $('my-hero-meta').textContent = `${String(build.hero.name || '').toUpperCase()} · ${String(build.hero.className || '').toUpperCase()}`;
  $('my-build-name').textContent = build.title || 'Build sem título';
  $('my-build-style').textContent = build.analysis.estilo || 'Sem descrição calculada';
  $('my-gears').innerHTML = gearMarkup(build.gear, true);
  $('modal-my-gears').innerHTML = gearMarkup(build.gear);
  $('modal-my-name').textContent = build.title || mineName;
  $('my-metric-one').textContent = `${build.analysis.equipadosN}/${build.analysis.totalSlots}`;
  $('my-metric-two').textContent = format(changed);
  $('my-metric-three').textContent = build.analysis.status === 'pending' ? 'PENDENTE' : 'VERIFICADA';
  setHeroImage($('mine-hero-art'), build.hero);
}

function filteredRanked() {
  const query = normalizar(state.buildQuery).trim();
  if (!query) return state.ranked;
  return state.ranked.filter(build => normalizar(`${build.title} ${profileName(build)}`).includes(query));
}

function renderOptions() {
  const options = filteredRanked();
  $('build-options').innerHTML = `<div class="options-title"><span>RANKING REAL</span><small>Mesmo herói</small></div>` + (options.length
    ? options.map(build => {
      const selected = build.id === state.selected?.id;
      const votes = number(build.rating_count, 0);
      const rating = votes ? `★ ${format(build.rating_average, 1)}` : 'Sem votos';
      return `<button type="button" data-build="${esc(build.id)}" class="${selected ? 'selected' : ''}">
        <span class="option-rank">#${build.rank}</span>
        <span><strong>${esc(build.title || 'Build sem título')}</strong><small>${esc(profileName(build))} · ${format(votes)} voto(s)</small></span>
        <em>${rating}</em><b>${selected ? '✓' : ''}</b>
      </button>`;
    }).join('')
    : '<div class="option-empty">Nenhuma build corresponde à busca.</div>');
}

function renderCommunity() {
  const build = state.selected;
  if (!build) return;
  const author = profileName(build);
  const votes = number(build.rating_count, 0);
  $('rank-tag').textContent = `TOP #${build.rank}`;
  $('selector-rank').textContent = `#${build.rank}`;
  $('community-name').textContent = build.title || 'Build sem título';
  $('community-author').textContent = `${author} · ${votes ? `★ ${format(build.rating_average, 1)} (${format(votes)} voto(s))` : 'ainda sem votos'}`;
  $('community-hero-meta').textContent = `${String(build.hero.name || '').toUpperCase()} · ${String(build.hero.className || '').toUpperCase()}`;
  $('community-title').textContent = build.title || 'Build sem título';
  $('community-style').textContent = build.analysis.estilo || 'Sem descrição calculada';
  $('community-gears').innerHTML = gearMarkup(build.gear, true);
  $('community-power').textContent = votes ? format(build.rating_average, 1) : '—';
  $('community-win').textContent = format(votes);
  $('community-pick').textContent = format(number(build.likes, 0));
  $('modal-rank').textContent = `TOP #${build.rank}`;
  $('modal-name').textContent = build.title || 'Build sem título';
  $('modal-community-gears').innerHTML = gearMarkup(build.gear);
  /* Quando as duas builds usam o mesmo herói, os dois cards precisam usar
     exatamente a mesma mídia e o mesmo enquadramento do Editor de Herói. */
  const sameHero = String(build.hero?.databaseId || build.hero?.id || '')
    === String(state.mine.hero?.databaseId || state.mine.hero?.id || '');
  setHeroImage($('community-hero-art'), sameHero ? state.mine.hero : build.hero);
  renderOptions();
}

function comparisonRows() {
  const mineTotal = state.mine?.analysis?.total || {};
  const otherTotal = state.selected?.analysis?.total || {};
  const definitions = state.catalog?.analysisData?.catalog?.definitions || [];
  return definitions
    .filter(raw => Number.isFinite(mineTotal[raw.id]) && Number.isFinite(otherTotal[raw.id]))
    .map(raw => {
      const key = raw.id;
      const definition = {
        ...raw,
        nome: raw.label || raw.id,
        lowerBetter: raw.direction === 'lower'
      };
      const mineValue = mineTotal[key];
      const otherValue = otherTotal[key];
      const delta = otherValue - mineValue;
      const changed = Math.abs(delta) > 1e-9;
      const otherWins = changed && (definition.lowerBetter ? otherValue < mineValue : otherValue > mineValue);
      const mineWins = changed && !otherWins;
      const percent = mineValue === 0 ? null : delta / Math.abs(mineValue) * 100;
      return {
        key,
        definition,
        category: categoryFor(key),
        mineValue,
        otherValue,
        delta,
        percent,
        changed,
        otherWins,
        mineWins
      };
    });
}

function sourceSentence(row) {
  const mineSources = state.mine.contributors.get(row.key) || [];
  const otherSources = state.selected.contributors.get(row.key) || [];
  const mineText = mineSources.length ? mineSources.join(', ') : 'nenhum item modifica diretamente este atributo';
  const otherText = otherSources.length ? otherSources.join(', ') : 'nenhum item modifica diretamente este atributo';
  return `Sua build: ${mineText}. Top #${state.selected.rank}: ${otherText}.`;
}

function renderSummary(rows) {
  const mineWins = rows.filter(row => row.mineWins).length;
  const communityWins = rows.filter(row => row.otherWins).length;
  const ties = rows.length - mineWins - communityWins;
  const changed = rows.filter(row => row.changed).length;
  $('mine-wins').textContent = format(mineWins);
  $('community-wins').textContent = format(communityWins);
  $('ties').textContent = format(ties);
  $('community-score-label').textContent = String(cms('community_advantages_label', 'vantagens da Top #1'))
    .replace(/#\d+/g, `#${state.selected.rank}`);

  if (communityWins > mineWins) {
    $('result-title').textContent = `${state.selected.title || `Top #${state.selected.rank}`} leva vantagem geral`;
  } else if (mineWins > communityWins) {
    $('result-title').textContent = 'Sua build leva vantagem geral';
  } else {
    $('result-title').textContent = 'As builds estão equilibradas';
  }
  $('result-copy').innerHTML = `Comparação feita com <b>${format(rows.length)} atributos reais</b> do mesmo herói. `
    + `<b>${format(changed)}</b> apresentam valores diferentes entre os dois equipamentos.`;
}

function renderStats() {
  const rows = comparisonRows();
  renderSummary(rows);
  const query = normalizar(state.query).trim();
  const visible = rows.filter(row => {
    const filterMatches = state.filter === 'todos'
      || state.filter === 'alterados' && row.changed
      || row.category === state.filter;
    return filterMatches && (!query || normalizar(row.definition.nome).includes(query));
  });

  const changedButton = document.querySelector('[data-filter="alterados"]');
  if (changedButton) changedButton.textContent = `${cms('filter_changed', 'Alterados')} · ${rows.filter(row => row.changed).length}`;
  const rightHead = document.querySelector('.right-head');
  if (rightHead) rightHead.textContent = String(cms('header_top_build', 'TOP #1')).replace(/#\d+/g, `#${state.selected.rank}`);

  $('stats-rows').innerHTML = visible.length ? visible.map(row => {
    const definition = row.definition;
    const max = Math.max(Math.abs(row.mineValue), Math.abs(row.otherValue), 1);
    const open = state.expanded === row.key;
    const deltaClass = !row.changed ? 'neutral' : row.otherWins ? 'positive' : 'negative';
    const deltaText = row.changed
      ? `${row.delta > 0 ? '+' : ''}${formatStat(row.delta, { ...definition, prefix: '' })}`
      : '=';
    const percentText = row.changed && row.percent !== null
      ? `${row.percent > 0 ? '+' : ''}${format(row.percent, 1)}%`
      : row.changed ? 'variação absoluta' : 'sem alteração';
    return `<div class="stat-row-wrap ${open ? 'open' : ''}">
      <button type="button" class="stat-row" data-stat="${esc(row.key)}" aria-expanded="${open}">
        <span class="stat-name"><i class="stat-category-icon ${row.category}" aria-hidden="true">${categoryIcon(row.category)}</i><span><strong>${esc(definition.nome)}</strong><small>${row.category}${definition.lowerBetter ? ' · menor é melhor' : ''}</small></span></span>
        <span class="stat-value left ${row.mineWins ? 'winner' : row.otherWins ? 'loser' : ''}"><small class="mobile-col-label">SUA BUILD</small><strong>${formatStat(row.mineValue, definition)}</strong><i style="--bar:${Math.abs(row.mineValue) / max * 100}%"></i></span>
        <span class="delta-badge ${deltaClass}"><small class="mobile-col-label">DIFERENÇA</small><strong>${deltaText}</strong><small>${percentText}</small></span>
        <span class="stat-value right ${row.otherWins ? 'winner' : row.mineWins ? 'loser' : ''}"><small class="mobile-col-label">TOP #${state.selected.rank}</small><strong>${formatStat(row.otherValue, definition)}</strong><i style="--bar:${Math.abs(row.otherValue) / max * 100}%"></i></span>
        <span class="row-chevron ${open ? 'open' : ''}">⌄</span>
      </button>
      ${open ? `<div class="stat-detail">
        <div><small>O QUE ESTE NÚMERO SIGNIFICA</small><p>${esc(STAT_DESCRIPTIONS[row.key] || 'Valor final calculado a partir do atributo-base do herói e dos modificadores cadastrados.')}</p></div>
        <div><small>ORIGEM DOS MODIFICADORES</small><p>${esc(sourceSentence(row))}</p></div>
        <div class="detail-verdict ${row.otherWins ? 'community' : row.mineWins ? 'mine' : 'tie'}"><small>VANTAGEM</small><strong>${row.otherWins ? `Top #${state.selected.rank}` : row.mineWins ? 'Sua build' : 'Empate'}</strong></div>
      </div>` : ''}
    </div>`;
  }).join('') : '<div class="empty-state">Nenhum atributo real corresponde a este filtro.</div>';
}

function renderAll() {
  renderContext();
  renderMine();
  renderCommunity();
  renderStats();
  finishLoading();
}

function toast(message) {
  const toastElement = $('toast');
  toastElement.querySelector('span').textContent = message;
  toastElement.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toastElement.hidden = true; }, 2600);
}

function comparisonKey() {
  return `${state.mine?.id || 'draft'}:${state.selected?.id || ''}`;
}

function loadSavedComparisons() {
  try {
    return JSON.parse(localStorage.getItem('echo-arena-saved-comparisons') || '[]');
  } catch {
    return [];
  }
}

function saveComparison() {
  const button = $('save-comparison');
  const saved = loadSavedComparisons();
  const key = comparisonKey();
  const exists = saved.some(entry => entry.key === key);
  const next = exists
    ? saved.filter(entry => entry.key !== key)
    : [...saved, {
      key,
      mineBuildId: state.mine?.id === 'local-draft' ? null : state.mine?.id,
      draft: state.mine?.id === 'local-draft',
      opponentBuildId: state.selected?.id,
      heroId: state.mine?.hero_id,
      savedAt: new Date().toISOString()
    }];
  localStorage.setItem('echo-arena-saved-comparisons', JSON.stringify(next));
  button.classList.toggle('saved', !exists);
  button.querySelector('span').textContent = !exists
    ? cms('saved_button', 'Comparação salva')
    : cms('save_button', 'Salvar comparação');
  toast(!exists ? cms('saved_toast', 'Comparação salva') : cms('removed_toast', 'Comparação removida dos salvos'));
}

function bindEvents() {
  $('build-selector').addEventListener('click', () => {
    const options = $('build-options');
    const open = options.hidden;
    options.hidden = !open;
    $('build-selector').setAttribute('aria-expanded', String(open));
  });

  $('build-options').addEventListener('click', event => {
    const button = event.target.closest('[data-build]');
    if (!button) return;
    const selected = state.ranked.find(build => build.id === button.dataset.build);
    if (!selected) return;
    state.selected = selected;
    state.expanded = null;
    $('build-options').hidden = true;
    $('build-selector').setAttribute('aria-expanded', 'false');
    renderCommunity();
    renderStats();
  });

  $('build-search').addEventListener('input', event => {
    state.buildQuery = event.target.value;
    renderOptions();
    $('build-options').hidden = false;
    $('build-selector').setAttribute('aria-expanded', 'true');
  });

  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    state.filter = button.dataset.filter;
    renderStats();
  }));

  $('stat-search').addEventListener('input', event => {
    state.query = event.target.value;
    renderStats();
  });

  $('stats-rows').addEventListener('click', event => {
    const row = event.target.closest('[data-stat]');
    if (!row) return;
    state.expanded = state.expanded === row.dataset.stat ? null : row.dataset.stat;
    renderStats();
  });

  document.querySelectorAll('[data-open-modal]').forEach(button => button.addEventListener('click', () => {
    $('details-modal').hidden = false;
  }));
  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => {
    $('details-modal').hidden = true;
  }));
  $('details-modal').addEventListener('click', event => {
    if (event.target === $('details-modal')) $('details-modal').hidden = true;
  });

  $('save-comparison').addEventListener('click', saveComparison);
  $('share-comparison').addEventListener('click', async () => {
    const url = new URL(location.href);
    if (state.mine?.id === 'local-draft') url.searchParams.set('draft', '1');
    else if (state.mine?.id) url.searchParams.set('build', state.mine.id);
    if (state.selected?.id) url.searchParams.set('opponent', state.selected.id);
    try {
      await navigator.clipboard.writeText(url.href);
      toast(cms('shared_toast', 'Link da comparação copiado'));
    } catch {
      toast('Não foi possível copiar o link neste navegador.');
    }
  });
  $('change-my-build').addEventListener('click', () => { location.href = './criar-build.html'; });

  document.addEventListener('echo:content-applied', () => {
    if (state.ready) {
      showComparisonContent(true);
      renderMine();
      renderCommunity();
      renderStats();
    }
  });
}

async function init() {
  bindEvents();
  setSource('loading', 'SINCRONIZANDO', 'Dados reais');
  setPageState(
    'loading',
    'Preparando sua comparação',
    'Buscando sua build, o ranking deste herói e os atributos cadastrados.'
  );

  try {
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) throw new Error(`Não foi possível validar sua sessão: ${authError.message}`);
    state.session = authData.session || null;
    state.catalog = await loadCatalog();

    const mineSource = await resolveMineBuild();
    if (!mineSource) {
      setSource('empty', 'SEM BUILD', 'Crie ou salve uma build');
      setPageState(
        'empty',
        'Ainda não há uma build sua para comparar',
        'Monte uma build no construtor. O comparador também aceita um rascunho salvo neste dispositivo.',
        { label: 'Criar minha build', href: './criar-build.html' }
      );
      return;
    }

    const hero = state.catalog.heroById.get(mineSource.hero_id);
    if (!hero) throw new Error('O herói da sua build está desativado ou não foi encontrado.');

    const rankedSources = await fetchRankedBuilds(mineSource.hero_id, mineSource.id);
    if (!rankedSources.length) {
      setSource('empty', 'SEM RANKING', hero.name || 'Mesmo herói');
      setPageState(
        'empty',
        'Nenhuma build pública deste herói está disponível',
        'A comparação só usa builds publicadas, públicas e do mesmo herói. Nenhum dado demonstrativo será exibido.',
        { label: 'Voltar ao construtor', href: './criar-build.html' }
      );
      return;
    }

    const savedIds = [mineSource, ...rankedSources]
      .filter(build => build.source === 'saved')
      .map(build => build.id);
    const [itemsByBuild, profiles] = await Promise.all([
      fetchItemsForBuilds(savedIds),
      fetchProfiles([mineSource, ...rankedSources].map(build => build.user_id))
    ]);
    state.profiles = profiles;

    const mineRows = mineSource.source === 'draft'
      ? mineSource.items
      : itemsByBuild.get(mineSource.id) || [];
    state.mine = await materializeBuild(mineSource, mineRows);

    const materializedRanked = [];
    for (const source of rankedSources) {
      try {
        materializedRanked.push(await materializeBuild(source, itemsByBuild.get(source.id) || []));
      } catch (error) {
        console.warn(`[comparar-build] Build ${source.id} ignorada:`, error.message);
      }
    }

    if (!materializedRanked.length) {
      setSource('empty', 'SEM ANÁLISE', hero.name || 'Mesmo herói');
      setPageState(
        'empty',
        'As builds públicas não possuem dados completos para comparar',
        'Os registros existem, mas faltam atributos-base ou equipamentos válidos. Nenhum número foi estimado.',
        { label: 'Voltar ao construtor', href: './criar-build.html' }
      );
      return;
    }

    state.ranked = materializedRanked;
    const requestedOpponent = new URLSearchParams(location.search).get('opponent');
    state.selected = state.ranked.find(build => build.id === requestedOpponent) || state.ranked[0];
    state.ready = true;
    renderAll();
  } catch (error) {
    console.error('[comparar-build] Falha ao preparar comparação:', error);
    setSource('error', 'ERRO DE DADOS', 'Sem conteúdo fictício');
    setPageState(
      'error',
      'Não foi possível montar uma comparação confiável',
      error.message || 'Verifique a conexão e tente novamente.',
      { label: 'Tentar novamente', href: location.href }
    );
  }
}

init();
