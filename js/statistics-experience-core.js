import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { resolveMediaUrl } from './media-storage.js?v=20260823-security-supabase-pin-1';

const $ = id => document.getElementById(id);
const state = {
  heroes: null,
  builds: null,
  equipments: null,
  slots: null,
  compositionCount: null,
  errors: [],
  sources: {
    heroes: false,
    builds: false,
    equipments: false,
    slots: false,
    compositions: false
  }
};

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function hasNumber(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function compact(value) {
  if (!hasNumber(value)) return '—';
  const number = Number(value);
  return new Intl.NumberFormat('pt-BR', {
    notation: Math.abs(number) >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(number);
}

function safeColor(value, fallback = '#9367ff') {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function heroMedia(hero = {}) {
  return resolveMediaUrl(hero.card_source || hero.main_source || hero.media_source || hero.gif_source || '');
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

function metricCard(id, value, available = true) {
  const node = $(id);
  if (!node) return;
  const strong = node.querySelector('strong');
  if (strong) strong.textContent = available ? compact(value) : '—';
  node.classList.toggle('error', !available);
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Data não informada';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(date)
    .replace('.', '');
}

function heroLookup() {
  const byId = new Map();
  const byName = new Map();
  for (const hero of Array.isArray(state.heroes) ? state.heroes : []) {
    if (hero.id) byId.set(String(hero.id), hero);
    if (hero.name) byName.set(String(hero.name).trim().toLowerCase(), hero);
  }
  return { byId, byName };
}

function buildActivityRows() {
  if (!Array.isArray(state.builds)) return null;
  const groups = new Map();

  for (const build of state.builds) {
    const key = build.hero_id ? `id:${build.hero_id}` : `name:${String(build.hero_name || 'Sem herói').toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, {
        heroId: build.hero_id || null,
        heroName: build.hero_name || 'Sem herói',
        builds: 0,
        views: 0,
        likes: 0
      });
    }
    const row = groups.get(key);
    row.builds += 1;
    row.views += Number(build.views || 0);
    row.likes += Number(build.likes || 0);
  }

  const lookup = heroLookup();
  return [...groups.values()].map(row => {
    const hero = (row.heroId && lookup.byId.get(String(row.heroId))) || lookup.byName.get(String(row.heroName).trim().toLowerCase()) || null;
    return { ...row, hero };
  }).sort((a, b) => b.builds - a.builds || b.views - a.views || b.likes - a.likes || a.heroName.localeCompare(b.heroName, 'pt-BR'));
}

function renderHeroActivity() {
  const target = $('hero-ranking');
  if (!target) return;

  const rows = buildActivityRows();
  if (!rows) {
    target.innerHTML = '<div class="stats-empty">Atividade por herói indisponível nesta leitura. Nenhuma posição foi estimada.</div>';
    return;
  }
  if (!rows.length) {
    target.innerHTML = '<div class="stats-empty">Nenhuma build pública foi retornada para distribuir atividade entre os heróis.</div>';
    return;
  }

  const maxBuilds = Math.max(...rows.map(row => row.builds), 1);
  target.innerHTML = rows.slice(0, 8).map((row, index) => {
    const hero = row.hero || {};
    const src = heroMedia(hero);
    const color = safeColor(hero.class_color);
    const width = Math.max(6, (row.builds / maxBuilds) * 100);
    const href = hero.slug ? `./herois.html?heroi=${encodeURIComponent(hero.slug)}` : './herois.html';
    return `<a class="stats-rank-row" href="${href}" style="--rank-color:${color};--activity-width:${width.toFixed(2)}%">
      <span class="rank">#${index + 1}</span>
      <span class="stats-rank-hero">
        <span class="stats-rank-avatar">${src ? `<img src="${esc(src)}" alt="${esc(row.heroName)}" loading="lazy">` : ''}</span>
        <span><b>${esc(hero.name || row.heroName)}</b><small>${esc(hero.class_name || 'Classe não informada')}</small></span>
      </span>
      <span class="stats-rank-value"><span>Builds</span><strong>${compact(row.builds)}</strong></span>
      <span class="stats-rank-value"><span>Views</span><strong>${compact(row.views)}</strong></span>
      <span class="stats-rank-value"><span>Curtidas</span><strong>${compact(row.likes)}</strong></span>
    </a>`;
  }).join('');
}

function renderDistribution(targetId, rows, emptyText) {
  const target = $(targetId);
  if (!target) return;
  if (!Array.isArray(rows)) {
    target.innerHTML = `<div class="stats-empty compact">${esc(emptyText)}</div>`;
    return;
  }
  if (!rows.length) {
    target.innerHTML = '<div class="stats-empty compact">Nenhum registro disponível para esta distribuição.</div>';
    return;
  }

  const max = Math.max(...rows.map(row => Number(row.count || 0)), 1);
  target.innerHTML = rows.map(row => {
    const width = Math.max(5, (Number(row.count || 0) / max) * 100);
    return `<div class="stats-distribution-row">
      <span class="stats-distribution-label">${esc(row.label)}</span>
      <span class="stats-distribution-track"><i class="stats-distribution-fill" style="--bar-width:${width.toFixed(2)}%;--bar-color:${safeColor(row.color, '#35d9ee')}"></i></span>
      <strong class="stats-distribution-value">${compact(row.count)}</strong>
    </div>`;
  }).join('');
}

function renderClassDistribution() {
  if (!Array.isArray(state.heroes)) {
    setText('class-total', '—');
    renderDistribution('class-distribution', null, 'Classes indisponíveis nesta leitura.');
    return;
  }

  const groups = new Map();
  for (const hero of state.heroes) {
    const label = hero.class_name || 'Sem classe';
    if (!groups.has(label)) groups.set(label, { label, count: 0, color: hero.class_color || '#9367ff' });
    groups.get(label).count += 1;
  }
  const rows = [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
  setText('class-total', compact(rows.length));
  renderDistribution('class-distribution', rows, 'Classes indisponíveis nesta leitura.');
}

function renderSlotDistribution() {
  if (!Array.isArray(state.equipments) || !Array.isArray(state.slots)) {
    setText('slot-total', '—');
    renderDistribution('slot-distribution', null, 'Distribuição por slot indisponível nesta leitura.');
    return;
  }

  const slotMap = new Map(state.slots.map(slot => [String(slot.id), slot]));
  const palette = ['#35d9ee', '#9367ff', '#48e1a4', '#f4c451', '#c084fc', '#fb7185', '#4cc7e8'];
  const groups = new Map();
  for (const item of state.equipments) {
    const slot = item.slot_id ? slotMap.get(String(item.slot_id)) : null;
    const label = slot?.name || 'Sem slot';
    if (!groups.has(label)) groups.set(label, { label, count: 0 });
    groups.get(label).count += 1;
  }
  const rows = [...groups.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
    .map((row, index) => ({ ...row, color: palette[index % palette.length] }));
  setText('slot-total', compact(rows.length));
  renderDistribution('slot-distribution', rows, 'Distribuição por slot indisponível nesta leitura.');
}

function renderBuilds() {
  const target = $('build-ranking');
  if (!target) return;
  if (!Array.isArray(state.builds)) {
    target.innerHTML = '<div class="stats-empty">Builds públicas indisponíveis nesta leitura.</div>';
    return;
  }

  const rows = state.builds.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 8);
  if (!rows.length) {
    target.innerHTML = '<div class="stats-empty">Nenhuma build pública está disponível para este feed.</div>';
    return;
  }

  target.innerHTML = rows.map(build => {
    const title = build.title || 'Build sem título';
    const author = build.display_name || build.username || 'Jogador';
    const hero = build.hero_name || 'Herói não informado';
    const views = Number(build.views || 0);
    const likes = Number(build.likes || 0);
    const engagement = views > 0 || likes > 0
      ? `<span>${compact(views)} views</span><span>${compact(likes)} curtidas</span>`
      : '<span>Sem interação registrada</span>';
    return `<article class="stats-build-row">
      <small>${esc(hero)}</small>
      <b>${esc(title)}</b>
      <p>por ${esc(author)}</p>
      <div class="meta"><span>${esc(formatDate(build.created_at))}</span>${engagement}</div>
    </article>`;
  }).join('');
}

function updateEngagement() {
  if (!Array.isArray(state.builds)) {
    setText('engagement-state', 'Indisponível');
    setText('engagement-note', 'A fonte de builds não respondeu nesta leitura. Nenhum sinal foi estimado.');
    setText('engagement-views', '—');
    setText('engagement-likes', '—');
    return;
  }

  const views = state.builds.reduce((sum, build) => sum + Number(build.views || 0), 0);
  const likes = state.builds.reduce((sum, build) => sum + Number(build.likes || 0), 0);
  setText('engagement-views', compact(views));
  setText('engagement-likes', compact(likes));

  if (views === 0 && likes === 0) {
    setText('engagement-state', 'Sem sinal ainda');
    setText('engagement-note', 'As builds estão publicadas, mas a view atual ainda não registra views ou curtidas acima de zero. Por isso a página não cria um ranking de popularidade.');
    setText('stats-activity-reading', 'A atividade atual é lida pela quantidade de builds publicadas por herói. Views e curtidas continuam visíveis, mas não são usadas como sinal enquanto permanecerem zeradas.');
  } else {
    setText('engagement-state', 'Sinal disponível');
    setText('engagement-note', 'Há interação registrada na superfície pública. Views e curtidas podem ser lidas como contexto adicional, sem virar win rate ou desempenho competitivo.');
    setText('stats-activity-reading', 'A quantidade de builds continua sendo o primeiro sinal de atividade; views e curtidas entram como contexto adicional porque existem registros mensuráveis nesta leitura.');
  }
}

function updateSummary() {
  const heroesOk = Array.isArray(state.heroes);
  const buildsOk = Array.isArray(state.builds);
  const equipmentsOk = Array.isArray(state.equipments);
  const compositionsOk = hasNumber(state.compositionCount);

  metricCard('metric-heroes', heroesOk ? state.heroes.length : null, heroesOk);
  metricCard('metric-builds', buildsOk ? state.builds.length : null, buildsOk);
  metricCard('metric-equipments', equipmentsOk ? state.equipments.length : null, equipmentsOk);
  metricCard('metric-compositions', state.compositionCount, compositionsOk);

  const available = [heroesOk, buildsOk, equipmentsOk, compositionsOk].filter(Boolean).length;
  setText('stats-source-health', `${available}/4 fontes`);

  const status = $('stats-sync-status');
  if (status) {
    status.classList.toggle('partial', available < 4);
    status.innerHTML = available === 4
      ? '<i></i><span>4/4 fontes públicas disponíveis nesta leitura</span>'
      : `<i></i><span>${available}/4 fontes disponíveis — blocos ausentes não são estimados</span>`;
  }

  if (available < 4) {
    setText('stats-command-note', 'Há fonte indisponível nesta leitura. Os blocos afetados permanecem com “—” em vez de receber estimativas.');
  } else if (Number(state.compositionCount) === 0) {
    setText('stats-command-note', 'Catálogo e atividade pública carregados. Nenhuma composição pública foi retornada nesta leitura.');
  } else {
    setText('stats-command-note', 'As quatro superfícies públicas responderam; os blocos abaixo usam somente os registros retornados nesta leitura.');
  }
}

async function load() {
  const [heroesResult, buildsResult, equipmentResult, slotsResult, compositionResult] = await Promise.all([
    supabase.from('v_heroes_complete')
      .select('id,name,slug,enabled,display_order,class_name,class_color,media_source,main_source,card_source,gif_source,total_builds,total_views,total_likes,total_favorites')
      .eq('enabled', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name'),
    supabase.from('v_popular_builds')
      .select('id,title,hero_id,hero_name,username,display_name,likes,views,created_at')
      .limit(60),
    supabase.from('equipments')
      .select('id,slot_id,enabled')
      .eq('enabled', true),
    supabase.from('equipment_slots')
      .select('id,name,display_order')
      .order('display_order'),
    supabase.from('team_compositions')
      .select('id', { count: 'exact', head: true })
      .eq('is_public', true)
  ]);

  if (heroesResult.error) state.errors.push(`heróis: ${heroesResult.error.message}`);
  else { state.heroes = heroesResult.data || []; state.sources.heroes = true; }

  if (buildsResult.error) state.errors.push(`builds: ${buildsResult.error.message}`);
  else { state.builds = buildsResult.data || []; state.sources.builds = true; }

  if (equipmentResult.error) state.errors.push(`equipamentos: ${equipmentResult.error.message}`);
  else { state.equipments = equipmentResult.data || []; state.sources.equipments = true; }

  if (slotsResult.error) state.errors.push(`slots: ${slotsResult.error.message}`);
  else { state.slots = slotsResult.data || []; state.sources.slots = true; }

  if (compositionResult.error) state.errors.push(`composições: ${compositionResult.error.message}`);
  else { state.compositionCount = compositionResult.count ?? 0; state.sources.compositions = true; }

  updateSummary();
  renderHeroActivity();
  renderClassDistribution();
  renderSlotDistribution();
  renderBuilds();
  updateEngagement();

  if (state.errors.length) console.warn('[estatisticas] fontes parcialmente indisponíveis:', state.errors);
}

load().catch(error => {
  console.error('[estatisticas] falha geral:', error);
  state.errors.push(error.message || String(error));
  updateSummary();
  renderHeroActivity();
  renderClassDistribution();
  renderSlotDistribution();
  renderBuilds();
  updateEngagement();
});
