import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { resolveMediaUrl } from './media-storage.js?v=20260823-security-supabase-pin-1';
import {
  buildHeroProfile,
  evaluateComposition,
  COMPOSITION_CAPABILITIES
} from './composition-synergy-engine-v2.js?v=20260821-synergy-2';
import {
  trainAdaptiveCompositionModel,
  evaluateAdaptiveComposition,
  learningStatusCopy,
  learnedInsight,
  rankAdaptiveCandidates
} from './composition-adaptive-learning-public-bridge.js?v=20260823-server-authority-2';
import {
  COMPOSITION_OPTIONS_EVENT,
  COMPOSITION_SELECTION_EVENT,
  normalizeCompositionSelection,
  resolveCompositionTarget
} from './composition-selection-state.mjs?v=20260822-selection-1';

const $ = id => document.getElementById(id);
const capabilityLabels = new Map(COMPOSITION_CAPABILITIES.map(item => [item.id, item.label]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  heroes: [],
  heroesById: new Map(),
  classes: [],
  selectedIds: ['', '', ''],
  activeSlot: 0,
  classFilter: '',
  search: '',
  publicCount: null,
  synergyCount: null,
  skillCount: null,
  sourceError: null,
  learningError: null,
  seasons: [],
  teamSynergies: [],
  heroSynergies: [],
  heroMetrics: [],
  model: null,
  evaluationCache: new Map(),
  adaptiveCache: new Map(),
  profileCache: new Map()
};

const APPROX_WEIGHTS = {
  team_sustain: 16, protection: 14, control: 12, damage_amp: 10, tempo_buff: 8,
  armor_pressure: 8, recon: 7, burst: 8, engage: 6, mobility_team: 5,
  ranged_pressure: 4, team_utility: 3
};
const APPROX_INTERACTIONS = [
  ['control', 'burst', 7], ['armor_pressure', 'burst', 6], ['damage_amp', 'burst', 6],
  ['tempo_buff', 'burst', 5], ['team_sustain', 'engage', 5], ['protection', 'engage', 5],
  ['mobility_team', 'engage', 4], ['recon', 'ranged_pressure', 5], ['control', 'damage_amp', 4]
];

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function heroMedia(hero) {
  return resolveMediaUrl(hero?.card_image_path || hero?.image_path || hero?.card_image_url || hero?.image_url || '');
}

function setMetric(id, value) {
  const node = $(id);
  if (!node) return;
  node.textContent = value === null || value === undefined ? '—' : Number(value).toLocaleString('pt-BR');
}

function uniqueSelectedIds() {
  const validIds = state.heroesById.size ? state.heroesById.keys() : null;
  return normalizeCompositionSelection(state.selectedIds, validIds).filter(Boolean);
}

function selectedHeroes() {
  return state.selectedIds.map(id => state.heroesById.get(id)).filter(Boolean);
}

function classFor(hero) {
  return state.classes.find(item => item.id === hero?.class_id) || null;
}

function teamKey(heroes) {
  return heroes.map(hero => hero?.id).filter(Boolean).sort().join('|');
}

function profileFor(hero) {
  if (!hero?.id) return buildHeroProfile(hero);
  if (!state.profileCache.has(hero.id)) state.profileCache.set(hero.id, buildHeroProfile(hero));
  return state.profileCache.get(hero.id);
}

function baseEvaluationFor(heroes) {
  const key = teamKey(heroes);
  if (!key || heroes.length !== 3) return evaluateComposition(heroes);
  if (!state.evaluationCache.has(key)) state.evaluationCache.set(key, evaluateComposition(heroes));
  return state.evaluationCache.get(key);
}

function adaptiveEvaluationFor(heroes, base = null) {
  const key = teamKey(heroes);
  if (!key || heroes.length !== 3) return null;
  if (!state.adaptiveCache.has(key)) {
    state.adaptiveCache.set(key, evaluateAdaptiveComposition({
      heroes,
      baseEvaluation: base || baseEvaluationFor(heroes),
      model: state.model,
      teamSynergies: state.teamSynergies,
      heroSynergies: state.heroSynergies,
      heroMetrics: state.heroMetrics
    }));
  }
  return state.adaptiveCache.get(key);
}

function clearEvaluationCaches() {
  state.evaluationCache.clear();
  state.adaptiveCache.clear();
}

function learningShortStatus() {
  if (state.learningError) return 'aprendizado indisponível';
  if (!state.model) return 'aprendizado carregando';
  if (state.model.mode === 'trained') return 'aprendizado ativo';
  if (state.model.mode === 'rejected') return 'aprendizado suspenso';
  if (state.model.mode === 'observing') return 'aprendizado observando';
  return 'aprendizado em cold start';
}

function statusCopy() {
  const node = $('composition-data-status');
  if (!node) return;
  if (state.sourceError) {
    node.className = 'composition-live empty';
    node.innerHTML = '<i></i><span>Habilidades indisponíveis — análise pausada para não inventar dados</span>';
    return;
  }
  if (state.skillCount === null) {
    node.className = 'composition-live empty';
    node.innerHTML = '<i></i><span>Sincronizando heróis e habilidades</span>';
    return;
  }
  let measuredCopy = 'sinergias medidas indisponíveis';
  if (state.synergyCount !== null && state.synergyCount !== undefined) {
    measuredCopy = Number(state.synergyCount) > 0
      ? `${Number(state.synergyCount).toLocaleString('pt-BR')} sinergia(s) medida(s)`
      : '0 sinergias medidas';
  }
  node.className = 'composition-live';
  node.innerHTML = `<i></i><span>${Number(state.skillCount).toLocaleString('pt-BR')} habilidades · ${measuredCopy} · Brain v4 servidor</span>`;
}

function renderSlot(index, hero) {
  const host = $(`strategy-slot-${index + 1}`);
  if (!host) return;
  host.classList.toggle('active-slot', state.activeSlot === index);
  if (!hero) {
    host.classList.add('empty');
    host.innerHTML = `<div class="slot-empty"><b>${index + 1}</b><span>${state.activeSlot === index ? 'Escolha abaixo' : 'Escolher herói'}</span></div>`;
    host.setAttribute('aria-label', `Escolher herói para a posição ${index + 1}`);
    return;
  }
  host.classList.remove('empty');
  const src = heroMedia(hero);
  const heroClass = classFor(hero);
  host.innerHTML = `${src ? `<img src="${esc(src)}" alt="">` : '<div class="strategy-fallback">◇</div>'}<div class="slot-label"><small>Posição ${index + 1}${heroClass?.name ? ` · ${esc(heroClass.name)}` : ''}</small><strong>${esc(hero.name)}</strong></div>`;
  host.setAttribute('aria-label', `Posição ${index + 1}: ${hero.name}. Toque para substituir.`);
}

function renderSlots() {
  state.selectedIds.forEach((id, index) => renderSlot(index, state.heroesById.get(id) || null));
  const progress = $('strategy-progress');
  if (progress) progress.textContent = `${uniqueSelectedIds().length} de 3 selecionados`;
}

function heroCapabilities(hero) {
  return [...profileFor(hero).capabilities]
    .filter(id => id !== 'team_utility')
    .map(id => capabilityLabels.get(id) || id)
    .slice(0, 2);
}

function skillEvidenceLabel(hero) {
  const skills = (hero?.skills || []).filter(skill => skill?.enabled !== false);
  if (!skills.length) return 'Conhecimento em revisão';
  const fullyVerified = skills.every(skill => normalize(skill?.verification_status) === 'verified' && skill?.needs_recheck === false);
  if (fullyVerified) return 'Conhecimento verificado';
  const corroborated = skills.some(skill => ['verified', 'corroborated'].includes(normalize(skill?.verification_status)));
  return corroborated ? 'Conhecimento corroborado' : 'Conhecimento em revisão';
}

function renderClassFilters() {
  const host = $('composition-class-filters');
  if (!host) return;
  host.innerHTML = `<button type="button" class="${state.classFilter ? '' : 'active'}" data-class="">Todos</button>${state.classes.map(item => `<button type="button" class="${state.classFilter === item.id ? 'active' : ''}" data-class="${esc(item.id)}">${esc(item.name)}</button>`).join('')}`;
}

function visibleHeroes() {
  const term = normalize(state.search);
  return state.heroes.filter(hero => {
    const heroClass = classFor(hero);
    return (!state.classFilter || hero.class_id === state.classFilter) &&
      (!term || normalize(`${hero.name} ${heroClass?.name || ''} ${(hero.skills || []).map(skill => skill.name).join(' ')}`).includes(term));
  });
}

function renderPicker() {
  const host = $('composition-hero-picker');
  if (!host) return;
  if (state.sourceError) {
    host.innerHTML = '<div class="composition-engine-error"><strong>Não foi possível carregar as habilidades</strong><p>O motor fica desativado para evitar recomendações sem evidência.</p></div>';
    return;
  }
  const heroes = visibleHeroes();
  if (!heroes.length) {
    host.innerHTML = '<div class="composition-engine-loading">Nenhum herói corresponde ao filtro.</div>';
    return;
  }
  const selected = new Set(uniqueSelectedIds());
  const teamFull = selected.size >= 3;
  host.innerHTML = heroes.map(hero => {
    const heroClass = classFor(hero);
    const src = heroMedia(hero);
    const isSelected = selected.has(hero.id);
    const action = isSelected ? 'Remover' : teamFull && state.activeSlot === null ? 'Escolha um slot' : 'Adicionar';
    return `<button type="button" class="composition-hero-option ${isSelected ? 'selected' : ''}" data-hero-id="${esc(hero.id)}" style="--hero-color:${esc(heroClass?.color || '#9367ff')}" aria-pressed="${String(isSelected)}">
      <span class="hero-option-media">${src ? `<img src="${esc(src)}" alt="">` : '◇'}</span>
      <span class="hero-option-copy"><b>${esc(hero.name)}</b><small>${esc(heroClass?.name || 'Sem classe')}</small><span><i>${esc(skillEvidenceLabel(hero))}</i></span></span>
      <em>${action}</em>
    </button>`;
  }).join('');
}

function fillSelectOptions() {
  const selects = [...document.querySelectorAll('.composition-hero-select')];
  if (!selects.length || !state.heroes.length) return;
  const options = state.heroes.map(hero => `<option value="${esc(hero.id)}">${esc(hero.name)}</option>`).join('');
  selects.forEach((select, index) => {
    const expected = state.selectedIds[index] || '';
    if (select.options.length !== state.heroes.length + 1) select.innerHTML = `<option value="">Escolha um herói</option>${options}`;
    select.value = expected;
    if (!select.dataset.engineBound) {
      select.dataset.engineBound = '1';
      select.addEventListener('change', () => {
        const newId = select.value;
        if (newId && state.selectedIds.some((id, otherIndex) => otherIndex !== index && id === newId)) {
          select.value = state.selectedIds[index] || '';
          showTransientNotice('Este herói já ocupa outra posição.');
          return;
        }
        state.selectedIds = normalizeCompositionSelection(
          state.selectedIds.map((id, slotIndex) => slotIndex === index ? newId : id),
          state.heroesById.keys()
        );
        const nextEmpty = state.selectedIds.findIndex(id => !id);
        state.activeSlot = nextEmpty >= 0 ? nextEmpty : null;
        renderAll();
      });
    }
  });
}

function syncFormSelections() {
  fillSelectOptions();
  [...document.querySelectorAll('.composition-hero-select')].forEach((select, index) => {
    const expected = state.selectedIds[index] || '';
    if (select.value !== expected) select.value = expected;
  });
  const form = $('composition-form');
  form?.dispatchEvent(new CustomEvent(COMPOSITION_SELECTION_EVENT, {
    bubbles: true,
    detail: {
      heroIds: [...state.selectedIds],
      selectedCount: uniqueSelectedIds().length
    }
  }));
}

let noticeTimer = null;
function showTransientNotice(message) {
  const host = $('composition-analysis');
  if (!host) return;
  host.dataset.notice = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    if (host.dataset.notice === message) delete host.dataset.notice;
    renderAnalysis();
  }, 2200);
  renderAnalysis();
}

function evidenceText(items = []) {
  return items.slice(0, 2).map(item => `${item.heroName} · ${item.skillName}`).join(' + ');
}

function scoreLabel(score) {
  if (score >= 82) return 'Muito alta';
  if (score >= 68) return 'Alta';
  if (score >= 52) return 'Moderada';
  return 'Limitada';
}

function renderStrategyScore(base = null, adaptive = null) {
  const host = $('strategy-score');
  if (!host) return;
  if (!base || base.score === null) {
    host.innerHTML = '<span>Compatibilidade</span><strong>—</strong><small>Complete o trio para calcular</small>';
    return;
  }
  const score = adaptive?.adaptiveScore ?? base.score;
  const suffix = adaptive?.influence > 0 ? ' · adaptativa' : '';
  host.innerHTML = `<span>Compatibilidade</span><strong>${Number(score)}</strong><small>${esc(scoreLabel(score))}${suffix}</small>`;
}

function renderPartialAnalysis(heroes) {
  const host = $('composition-analysis');
  if (!host) return;
  const cards = heroes.map(hero => `<article class="partial-profile"><strong>${esc(hero.name)}</strong><span>${esc(classFor(hero)?.name || '')}</span><div><i>Selecionado</i></div></article>`).join('');
  host.innerHTML = `${host.dataset.notice ? `<div class="analysis-notice">${esc(host.dataset.notice)}</div>` : ''}<div class="analysis-step"><span>SELEÇÃO DO TRIO</span><strong>${heroes.length ? `${heroes.length}/3 escolhidos` : 'Escolha o primeiro herói'}</strong><p>${heroes.length ? 'Continue montando. A análise só começa no Semantic v4 do servidor quando o trio estiver completo.' : 'Comece por qualquer herói ou aguarde as sugestões do servidor.'}</p></div>${cards ? `<div class="partial-profiles">${cards}</div>` : ''}`;
  renderStrategyScore(null, null);
}

function renderStrengthCard(item) {
  return `<article class="insight-card strength"><span>PONTO FORTE</span><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p>${item.evidence?.length ? `<small>${esc(evidenceText(item.evidence))}</small>` : ''}</article>`;
}

function renderWeaknessCard(item) {
  return `<article class="insight-card weakness"><span>PONTO FRACO</span><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p></article>`;
}

function learningStrip(adaptive) {
  const status = learningStatusCopy(adaptive);
  const adjustment = Number(adaptive?.adjustment || 0);
  const direct = adaptive?.direct;
  const delta = adaptive?.influence > 0 && adjustment !== 0
    ? `<b class="learning-delta ${adjustment > 0 ? 'positive' : 'negative'}">${adjustment > 0 ? '+' : ''}${adjustment}</b>`
    : '';
  const directCopy = direct?.matches
    ? `<small>Este trio: ${(direct.rawRate * 100).toFixed(1).replace('.', ',')}% em ${direct.matches.toLocaleString('pt-BR')} partida(s)</small>`
    : '';
  return `<div class="analysis-learning-strip ${esc(status.tone)}"><div><span>${esc(status.label)}</span><p>${esc(status.detail)}</p>${directCopy}</div>${delta}</div>`;
}

function renderAnalysis() {
  const host = $('composition-analysis');
  if (!host) return;
  if (state.sourceError) {
    host.innerHTML = '<div class="analysis-empty"><span>MOTOR PAUSADO</span><strong>Sem habilidades, sem recomendação</strong><p>A leitura falhou. O salvamento manual continua disponível, mas o motor não calcula.</p></div>';
    renderStrategyScore(null, null);
    return;
  }
  const heroes = selectedHeroes();
  if (heroes.length !== 3 || uniqueSelectedIds().length !== 3) {
    renderPartialAnalysis(heroes);
    return;
  }
  renderStrategyScore(null, null);
  host.innerHTML = `${host.dataset.notice ? `<div class="analysis-notice">${esc(host.dataset.notice)}</div>` : ''}<div class="analysis-empty"><span>ECHO BRAIN · SEMANTIC V4</span><strong>Validando no servidor</strong><p>A nota e as razões só aparecem depois que a autoridade pública confirma conhecimento, versão e proveniência.</p></div>`;
}

function approximateTeamScore(heroes) {
  const profiles = heroes.map(profileFor);
  const capabilities = new Set(profiles.flatMap(profile => [...profile.capabilities]));
  let score = 0;
  for (const id of capabilities) score += APPROX_WEIGHTS[id] || 0;
  for (const [left, right, points] of APPROX_INTERACTIONS) {
    if (capabilities.has(left) && capabilities.has(right)) score += points;
  }
  score += Math.max(0, new Set(heroes.map(hero => hero.class_id).filter(Boolean)).size - 1) * 2;
  return score;
}

function makeCandidate(heroes) {
  const base = baseEvaluationFor(heroes);
  return { heroes, ...base };
}

function candidatePoolForSelection(selectedIds) {
  const selected = selectedIds.map(id => state.heroesById.get(id)).filter(Boolean);
  const selectedSet = new Set(selected.map(hero => hero.id));
  const pool = state.heroes.filter(hero => !selectedSet.has(hero.id));
  const approximate = new Map();

  if (selected.length === 0) {
    const pairs = [];
    for (let left = 0; left < state.heroes.length; left += 1) {
      for (let right = left + 1; right < state.heroes.length; right += 1) {
        const heroes = [state.heroes[left], state.heroes[right]];
        pairs.push({ heroes, score: approximateTeamScore(heroes) });
      }
    }
    pairs.sort((a, b) => b.score - a.score || teamKey(a.heroes).localeCompare(teamKey(b.heroes)));
    for (const pair of pairs.slice(0, 72)) {
      const pairIds = new Set(pair.heroes.map(hero => hero.id));
      for (const hero of state.heroes) {
        if (pairIds.has(hero.id)) continue;
        const trio = [...pair.heroes, hero];
        const key = teamKey(trio);
        const score = approximateTeamScore(trio);
        if (!approximate.has(key) || score > approximate.get(key).score) approximate.set(key, { heroes: trio, score });
      }
    }
  } else if (selected.length === 1) {
    for (let left = 0; left < pool.length; left += 1) {
      for (let right = left + 1; right < pool.length; right += 1) {
        const trio = [...selected, pool[left], pool[right]];
        approximate.set(teamKey(trio), { heroes: trio, score: approximateTeamScore(trio) });
      }
    }
  } else if (selected.length === 2) {
    for (const hero of pool) {
      const trio = [...selected, hero];
      approximate.set(teamKey(trio), { heroes: trio, score: approximateTeamScore(trio) });
    }
  } else {
    const pairs = [[selected[0], selected[1]], [selected[0], selected[2]], [selected[1], selected[2]]];
    for (const pair of pairs) {
      const pairIds = new Set(pair.map(hero => hero.id));
      for (const hero of state.heroes) {
        if (pairIds.has(hero.id) || selectedSet.has(hero.id) && !pairIds.has(hero.id)) continue;
        const trio = [...pair, hero];
        if (teamKey(trio) === teamKey(selected)) continue;
        const key = teamKey(trio);
        const score = approximateTeamScore(trio);
        if (!approximate.has(key) || score > approximate.get(key).score) approximate.set(key, { heroes: trio, score });
      }
    }
  }

  const shortlist = [...approximate.values()]
    .sort((a, b) => b.score - a.score || teamKey(a.heroes).localeCompare(teamKey(b.heroes)))
    .slice(0, selected.length === 2 ? 60 : 48)
    .map(item => makeCandidate(item.heroes));

  shortlist.sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || teamKey(a.heroes).localeCompare(teamKey(b.heroes)));
  return shortlist.slice(0, 24);
}

function recommendationCandidates() {
  const baseCandidates = candidatePoolForSelection(uniqueSelectedIds());
  return rankAdaptiveCandidates(baseCandidates, {
    model: state.model,
    teamSynergies: state.teamSynergies,
    heroSynergies: state.heroSynergies,
    heroMetrics: state.heroMetrics
  }).slice(0, 4);
}

function renderRecommendations() {
  const host = $('composition-recommendation-grid');
  const copy = $('composition-recommendations-copy');
  const scope = $('composition-recommendation-scope');
  if (!host) return;
  if (state.sourceError || !state.heroes.length) {
    host.innerHTML = '<div class="analysis-empty compact"><strong>Sugestões indisponíveis</strong><p>O motor precisa das habilidades para recomendar.</p></div>';
    return;
  }
  const selected = uniqueSelectedIds();
  if (copy) copy.textContent = selected.length === 3 ? 'Teste variações trocando apenas um herói por vez.' : 'Escolha seus favoritos e deixe o motor completar os espaços.';
  if (scope) scope.textContent = selected.length === 0 ? 'Experimente livremente' : selected.length === 3 ? 'Troca de 1 herói' : `Mantendo ${selected.length} escolhido${selected.length === 1 ? '' : 's'}`;

  host.innerHTML = '<div class="analysis-empty compact"><strong>Consultando o Semantic v4</strong><p>O servidor está gerando e ranqueando os trios com conhecimento versionado.</p></div>';
}

function renderAll() {
  renderSlots();
  renderClassFilters();
  renderPicker();
  syncFormSelections();
  renderAnalysis();
  renderRecommendations();
}

function chooseHero(heroId) {
  if (!state.heroesById.has(heroId)) return;
  const existingIndex = state.selectedIds.indexOf(heroId);
  if (existingIndex >= 0) {
    state.selectedIds[existingIndex] = '';
    state.activeSlot = existingIndex;
    renderAll();
    return;
  }
  const target = resolveCompositionTarget(state.selectedIds, state.activeSlot);
  if (target === null) {
    showTransientNotice('Trio completo. Toque em um slot acima para escolher quem substituir.');
    return;
  }
  state.selectedIds[target] = heroId;
  state.selectedIds = normalizeCompositionSelection(state.selectedIds, state.heroesById.keys());
  const nextEmpty = state.selectedIds.findIndex(id => !id);
  state.activeSlot = nextEmpty >= 0 ? nextEmpty : null;
  renderAll();
}

function applyTeam(ids) {
  const clean = normalizeCompositionSelection(ids, state.heroesById.keys());
  if (clean.some(id => !id) || new Set(clean).size !== 3) return;
  state.selectedIds = clean;
  state.activeSlot = null;
  renderAll();
  $('strategy-board')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
}

function bindInteractions() {
  $('composition-create-cta')?.addEventListener('click', () => $('composition-lab')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }));
  $('composition-back-to-lab')?.addEventListener('click', () => $('composition-lab')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }));
  $('composition-clear-team')?.addEventListener('click', () => {
    state.selectedIds = ['', '', ''];
    state.activeSlot = 0;
    renderAll();
  });
  $('composition-hero-search')?.addEventListener('input', event => {
    state.search = event.target.value;
    renderPicker();
  });
  $('composition-class-filters')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-class]');
    if (!button) return;
    state.classFilter = button.dataset.class || '';
    renderClassFilters();
    renderPicker();
  });
  $('composition-hero-picker')?.addEventListener('click', event => {
    const button = event.target.closest('[data-hero-id]');
    if (button) chooseHero(button.dataset.heroId);
  });
  $('strategy-board')?.addEventListener('click', event => {
    const slot = event.target.closest('.strategy-slot[data-position]');
    if (!slot) return;
    const requestedSlot = Number(slot.dataset.position) - 1;
    const firstEmpty = state.selectedIds.findIndex(id => !id);
    state.activeSlot = firstEmpty >= 0 && state.selectedIds[requestedSlot]
      ? firstEmpty
      : requestedSlot;
    renderSlots();
    renderPicker();
    $('composition-lab')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });
  $('composition-recommendation-grid')?.addEventListener('click', event => {
    const button = event.target.closest('[data-apply-team]');
    if (button) applyTeam(String(button.dataset.applyTeam || '').split(',').filter(Boolean));
  });
}

function attachFormObserver() {
  const form = $('composition-form');
  if (!form) return;
  fillSelectOptions();
  form.addEventListener(COMPOSITION_OPTIONS_EVENT, syncFormSelections);
  const observer = new MutationObserver(() => syncFormSelections());
  form.querySelectorAll('.composition-hero-select').forEach(select => {
    observer.observe(select, { childList: true });
  });
}

async function load() {
  statusCopy();
  const [heroesResult, classesResult, skillsResult, compositionsResult, seasonsResult, teamResult, pairResult, heroMetricsResult] = await Promise.all([
    supabase.from('heroes').select('id,name,slug,class_id,enabled,display_order,card_image_path,image_path,card_image_url,image_url').eq('enabled', true).order('display_order', { ascending: true }).order('name'),
    supabase.from('hero_classes').select('id,name,slug,color,icon').order('name', { ascending: true }),
    supabase.from('hero_skills').select('id,hero_id,name,description,skill_type,cooldown,duration,enabled,verification_status,needs_recheck').eq('enabled', true).order('display_order', { ascending: true }),
    supabase.from('team_compositions').select('id', { count: 'exact', head: true }).eq('is_public', true),
    supabase.from('seasons').select('id,name,slug,game_version,starts_at,ends_at,active,created_at').order('created_at', { ascending: false }),
    supabase.from('team_synergies').select('id,season_id,hero_1_id,hero_2_id,hero_3_id,matches,wins,win_rate,synergy_score,created_at,updated_at', { count: 'exact' }),
    supabase.from('hero_synergies').select('id,season_id,hero_a_id,hero_b_id,synergy_score,win_rate,matches,created_at,updated_at'),
    supabase.from('hero_metrics').select('id,season_id,hero_id,matches,wins,losses,win_rate,pick_rate,survival_rate,avg_damage,avg_healing,avg_kills,avg_assists,avg_deaths,updated_at')
  ]);

  state.publicCount = compositionsResult.error ? null : compositionsResult.count;
  state.synergyCount = teamResult.error ? null : teamResult.count;
  setMetric('composition-public-count', state.publicCount);
  setMetric('composition-synergy-count', state.synergyCount);

  if (heroesResult.error || classesResult.error || skillsResult.error) {
    state.sourceError = heroesResult.error || classesResult.error || skillsResult.error;
    console.error('[compositions-experience-v3] Fonte obrigatória indisponível:', state.sourceError);
    setMetric('composition-hero-count', null);
    statusCopy();
    renderAll();
    return;
  }

  state.classes = classesResult.data || [];
  const skillsByHero = new Map();
  for (const skill of skillsResult.data || []) {
    if (!skillsByHero.has(skill.hero_id)) skillsByHero.set(skill.hero_id, []);
    skillsByHero.get(skill.hero_id).push(skill);
  }
  state.heroes = (heroesResult.data || []).map(hero => ({ ...hero, skills: skillsByHero.get(hero.id) || [] }));
  state.heroesById = new Map(state.heroes.map(hero => [hero.id, hero]));
  state.skillCount = (skillsResult.data || []).length;

  const observationalErrors = [seasonsResult, teamResult, pairResult, heroMetricsResult].filter(result => result.error).map(result => result.error);
  state.learningError = observationalErrors[0] || null;
  if (state.learningError) console.warn('[compositions-experience-v3] Aprendizado histórico indisponível; baseline por habilidades preservada.', state.learningError);

  state.seasons = seasonsResult.error ? [] : (seasonsResult.data || []);
  state.teamSynergies = teamResult.error ? [] : (teamResult.data || []);
  state.heroSynergies = pairResult.error ? [] : (pairResult.data || []);
  state.heroMetrics = heroMetricsResult.error ? [] : (heroMetricsResult.data || []);
  state.model = trainAdaptiveCompositionModel({
    teamSynergies: state.teamSynergies,
    heroesById: state.heroesById,
    seasons: state.seasons
  });

  clearEvaluationCaches();
  setMetric('composition-hero-count', state.heroes.filter(hero => hero.skills.length > 0).length);
  statusCopy();
  renderAll();
}

bindInteractions();
attachFormObserver();
await load();
