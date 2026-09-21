import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { resolveMediaUrl } from './media-storage.js?v=20260823-security-supabase-pin-1';
import {
  buildHeroProfile,
  evaluateComposition,
  recommendCompositions,
  COMPOSITION_CAPABILITIES
} from './composition-synergy-engine.js';

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
  sourceError: null
};

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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
  return [...new Set(state.selectedIds.filter(Boolean))];
}

function selectedHeroes() {
  return state.selectedIds.map(id => state.heroesById.get(id)).filter(Boolean);
}

function classFor(hero) {
  return state.classes.find(item => item.id === hero?.class_id) || null;
}

function statusCopy() {
  const node = $('composition-data-status');
  if (!node) return;
  if (state.sourceError) {
    node.className = 'composition-live empty';
    node.innerHTML = '<i></i><span>Habilidades indisponíveis nesta leitura — o motor não calcula sem fonte</span>';
    return;
  }
  if (state.skillCount === null) {
    node.className = 'composition-live empty';
    node.innerHTML = '<i></i><span>Sincronizando heróis e habilidades</span>';
    return;
  }
  node.className = 'composition-live';
  let measuredCopy = 'sinergias medidas indisponíveis';
  if (state.synergyCount !== null && state.synergyCount !== undefined) {
    const measured = Number(state.synergyCount);
    measuredCopy = measured > 0
      ? `${measured.toLocaleString('pt-BR')} sinergia(s) medida(s)`
      : '0 sinergias medidas';
  }
  node.innerHTML = `<i></i><span>Motor pronto · ${Number(state.skillCount).toLocaleString('pt-BR')} habilidades · ${measuredCopy}</span>`;
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
  const total = uniqueSelectedIds().length;
  const progress = $('strategy-progress');
  if (progress) progress.textContent = `${total} de 3 selecionados`;
}

function heroCapabilities(hero) {
  const profile = buildHeroProfile(hero);
  return [...profile.capabilities]
    .filter(id => id !== 'team_utility')
    .map(id => capabilityLabels.get(id) || id)
    .slice(0, 3);
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
    const matchesClass = !state.classFilter || hero.class_id === state.classFilter;
    const matchesSearch = !term || normalize(`${hero.name} ${heroClass?.name || ''} ${(hero.skills || []).map(skill => skill.name).join(' ')}`).includes(term);
    return matchesClass && matchesSearch;
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
    const capabilities = heroCapabilities(hero);
    const isSelected = selected.has(hero.id);
    const canAdd = !teamFull || isSelected || state.activeSlot !== null;
    return `<button type="button" class="composition-hero-option ${isSelected ? 'selected' : ''} ${!canAdd ? 'locked' : ''}" data-hero-id="${esc(hero.id)}" style="--hero-color:${esc(heroClass?.color || '#9367ff')}" aria-pressed="${String(isSelected)}">
      <span class="hero-option-media">${src ? `<img src="${esc(src)}" alt="">` : '◇'}</span>
      <span class="hero-option-copy"><b>${esc(hero.name)}</b><small>${esc(heroClass?.name || 'Sem classe')}</small><span>${capabilities.length ? capabilities.map(item => `<i>${esc(item)}</i>`).join('') : '<i>Perfil em análise</i>'}</span></span>
      <em>${isSelected ? 'Remover' : teamFull && state.activeSlot === null ? 'Escolha um slot' : 'Adicionar'}</em>
    </button>`;
  }).join('');
}

function fillSelectOptions() {
  const selects = [...document.querySelectorAll('.composition-hero-select')];
  if (!selects.length || !state.heroes.length) return;
  const options = state.heroes.map(hero => `<option value="${esc(hero.id)}">${esc(hero.name)}</option>`).join('');
  selects.forEach((select, index) => {
    const expected = state.selectedIds[index] || '';
    const currentValues = [...select.options].map(option => option.value);
    if (currentValues.length !== state.heroes.length + 1 || !currentValues.includes(expected)) {
      select.innerHTML = `<option value="">Escolha um herói</option>${options}`;
    }
    select.value = expected;
    if (!select.dataset.engineBound) {
      select.dataset.engineBound = '1';
      select.addEventListener('change', () => {
        const newId = select.value;
        if (newId && state.selectedIds.some((id, otherIndex) => otherIndex !== index && id === newId)) {
          select.value = state.selectedIds[index] || '';
          showTransientNotice('Este herói já ocupa outra posição. Escolha três heróis diferentes.');
          return;
        }
        state.selectedIds[index] = newId;
        state.activeSlot = state.selectedIds.findIndex(id => !id);
        if (state.activeSlot < 0) state.activeSlot = null;
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
  }, 2600);
  renderAnalysis();
}

function evidenceText(factor) {
  const evidence = Array.isArray(factor?.evidence) ? factor.evidence : [];
  if (!evidence.length) return '';
  return evidence.slice(0, 2).map(item => `${item.heroName} · ${item.skillName}`).join(' + ');
}

function scoreLabel(score) {
  if (score >= 82) return 'Compatibilidade calculada muito alta';
  if (score >= 68) return 'Compatibilidade calculada alta';
  if (score >= 52) return 'Compatibilidade calculada moderada';
  return 'Compatibilidade calculada limitada';
}

function renderStrategyScore(evaluation = null) {
  const host = $('strategy-score');
  if (!host) return;
  if (!evaluation || evaluation.score === null) {
    host.innerHTML = '<span>Compatibilidade</span><strong>—</strong><small>Complete o trio para calcular</small>';
    return;
  }
  host.innerHTML = `<span>Compatibilidade</span><strong>${Number(evaluation.score)}</strong><small>${esc(scoreLabel(evaluation.score))}</small>`;
}

function renderPartialAnalysis(heroes) {
  const host = $('composition-analysis');
  if (!host) return;
  const notice = host.dataset.notice;
  const profiles = heroes.map(buildHeroProfile);
  const selectedCards = profiles.map(profile => {
    const caps = [...profile.capabilities].filter(id => id !== 'team_utility').slice(0, 5);
    return `<article class="partial-profile"><div><strong>${esc(profile.hero.name)}</strong><span>${esc(classFor(profile.hero)?.name || '')}</span></div><div>${caps.length ? caps.map(id => `<i>${esc(capabilityLabels.get(id) || id)}</i>`).join('') : '<i>Sem capacidade classificada</i>'}</div></article>`;
  }).join('');
  host.innerHTML = `${notice ? `<div class="analysis-notice">${esc(notice)}</div>` : ''}<div class="analysis-step"><span>2 · ANÁLISE AO VIVO</span><strong>${heroes.length ? `${heroes.length}/3 heróis escolhidos` : 'Selecione o primeiro herói'}</strong><p>${heroes.length ? 'O motor já usa estes perfis para procurar complementos. Complete o trio para receber o score e a explicação completa.' : 'Use a lista ao lado. Você pode começar por qualquer herói ou deixar o motor sugerir trios sem seleção prévia.'}</p></div>${selectedCards ? `<div class="partial-profiles">${selectedCards}</div>` : ''}`;
  renderStrategyScore(null);
}

function renderAnalysis() {
  const host = $('composition-analysis');
  if (!host) return;
  if (state.sourceError) {
    host.innerHTML = '<div class="analysis-empty"><span>MOTOR BLOQUEADO</span><strong>Sem habilidades, sem recomendação</strong><p>A consulta das habilidades falhou. A página mantém o salvamento manual disponível, mas não calcula compatibilidade.</p></div>';
    renderStrategyScore(null);
    return;
  }
  const heroes = selectedHeroes();
  if (heroes.length !== 3 || uniqueSelectedIds().length !== 3) {
    renderPartialAnalysis(heroes);
    return;
  }
  const evaluation = evaluateComposition(heroes);
  renderStrategyScore(evaluation);
  const notice = host.dataset.notice;
  const coverage = evaluation.coverage.slice(0, 8).map(item => `<span>${esc(item.label)}</span>`).join('');
  const factors = evaluation.factors.map(item => `<article class="analysis-factor"><div><b>+${Number(item.points)}</b><strong>${esc(item.title)}</strong></div><p>${esc(item.detail)}</p>${evidenceText(item) ? `<small>${esc(evidenceText(item))}</small>` : ''}</article>`).join('');
  const warnings = evaluation.warnings.length
    ? `<div class="analysis-gaps"><b>Pontos de atenção</b>${evaluation.warnings.map(item => `<p>${esc(item)}</p>`).join('')}</div>`
    : '<div class="analysis-gaps ok"><b>Cobertura ampla</b><p>O modelo não identificou uma lacuna principal entre sustentação, proteção, controle e pressão.</p></div>';
  host.innerHTML = `${notice ? `<div class="analysis-notice">${esc(notice)}</div>` : ''}<header class="analysis-score-head"><div><span>COMPATIBILIDADE CALCULADA</span><strong>${Number(evaluation.score)}<small>/100</small></strong><p>${esc(scoreLabel(evaluation.score))}</p></div><div class="analysis-model"><b>skill-compatibility-v1</b><span>Baseado nas habilidades cadastradas</span></div></header><div class="analysis-coverage">${coverage}</div><div class="analysis-factor-list">${factors}</div>${warnings}<footer class="analysis-disclaimer">Este score compara cobertura e interações funcionais das habilidades; não representa desempenho real em partidas.</footer>`;
}

function teamKey(heroes) {
  return heroes.map(hero => hero.id).sort().join('|');
}

function recommendationCandidates() {
  const selected = uniqueSelectedIds();
  if (selected.length < 3) return recommendCompositions(state.heroes, selected, 6);
  const currentKey = [...selected].sort().join('|');
  const pairs = [[selected[0], selected[1]], [selected[0], selected[2]], [selected[1], selected[2]]];
  const map = new Map();
  for (const pair of pairs) {
    for (const result of recommendCompositions(state.heroes, pair, 5)) {
      const key = teamKey(result.heroes);
      if (key === currentKey) continue;
      if (!map.has(key) || Number(result.score || 0) > Number(map.get(key)?.score || 0)) map.set(key, result);
    }
  }
  return [...map.values()].sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || teamKey(a.heroes).localeCompare(teamKey(b.heroes))).slice(0, 6);
}

function renderRecommendations() {
  const host = $('composition-recommendation-grid');
  const copy = $('composition-recommendations-copy');
  const scope = $('composition-recommendation-scope');
  if (!host) return;
  if (state.sourceError || !state.heroes.length) {
    host.innerHTML = '<div class="analysis-empty compact"><strong>Sugestões indisponíveis</strong><p>O motor precisa das habilidades para recomendar um trio.</p></div>';
    return;
  }
  const selected = uniqueSelectedIds();
  if (copy) {
    copy.textContent = selected.length === 3
      ? 'Com o trio completo, o motor sugere trocas preservando dois dos três heróis para facilitar a comparação.'
      : 'O motor completa os slots restantes e ordena as combinações pela compatibilidade funcional calculada.';
  }
  if (scope) scope.textContent = selected.length === 0 ? 'Comparando todas as combinações' : selected.length === 3 ? 'Alternativas com troca de 1 herói' : `Mantendo ${selected.length} herói${selected.length === 1 ? '' : 's'} escolhido${selected.length === 1 ? '' : 's'}`;
  const rows = recommendationCandidates();
  if (!rows.length) {
    host.innerHTML = '<div class="analysis-empty compact"><strong>Nenhuma alternativa calculável</strong><p>Revise a seleção ou os dados carregados.</p></div>';
    return;
  }
  host.innerHTML = rows.map((row, index) => {
    const topFactor = row.factors?.[0];
    return `<article class="recommendation-card" data-team="${esc(teamKey(row.heroes))}"><header><span>Opção ${index + 1}</span><strong>${Number(row.score || 0)}<small>/100</small></strong></header><div class="recommendation-team">${row.heroes.map(hero => { const src = heroMedia(hero); return `<div>${src ? `<img src="${esc(src)}" alt="">` : '<span>◇</span>'}<b>${esc(hero.name)}</b><small>${esc(classFor(hero)?.name || '')}</small></div>`; }).join('')}</div><div class="recommendation-reason"><b>${esc(topFactor?.title || 'Cobertura funcional')}</b><p>${esc(topFactor?.detail || 'Trio ordenado pela compatibilidade das habilidades cadastradas.')}</p></div><button type="button" data-apply-team="${esc(row.heroes.map(hero => hero.id).join(','))}">Usar este trio</button></article>`;
  }).join('');
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
  let target = state.activeSlot;
  if (target === null || target < 0 || target > 2) target = state.selectedIds.findIndex(id => !id);
  if (target < 0) {
    showTransientNotice('O trio já está completo. Toque em um dos três slots acima para escolher qual posição substituir.');
    return;
  }
  state.selectedIds[target] = heroId;
  const nextEmpty = state.selectedIds.findIndex(id => !id);
  state.activeSlot = nextEmpty >= 0 ? nextEmpty : null;
  renderAll();
}

function applyTeam(ids) {
  const clean = ids.filter(id => state.heroesById.has(id)).slice(0, 3);
  if (clean.length !== 3 || new Set(clean).size !== 3) return;
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
    if (!button) return;
    chooseHero(button.dataset.heroId);
  });
  $('strategy-board')?.addEventListener('click', event => {
    const slot = event.target.closest('.strategy-slot[data-position]');
    if (!slot) return;
    state.activeSlot = Number(slot.dataset.position) - 1;
    renderSlots();
    renderPicker();
    $('composition-hero-search')?.focus({ preventScroll: true });
    $('composition-lab')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });
  $('composition-recommendation-grid')?.addEventListener('click', event => {
    const button = event.target.closest('[data-apply-team]');
    if (!button) return;
    applyTeam(String(button.dataset.applyTeam || '').split(',').filter(Boolean));
  });
}

function attachFormObserver() {
  const form = $('composition-form');
  if (!form) return;
  fillSelectOptions();
  new MutationObserver(() => syncFormSelections()).observe(form, { childList: true, subtree: true });
}

async function load() {
  statusCopy();
  const [heroesResult, classesResult, skillsResult, compositionsResult, synergyResult] = await Promise.all([
    supabase.from('heroes').select('id,name,slug,class_id,enabled,display_order,card_image_path,image_path,card_image_url,image_url').eq('enabled', true).order('display_order', { ascending: true }).order('name'),
    supabase.from('hero_classes').select('id,name,slug,color,icon').order('name', { ascending: true }),
    supabase.from('hero_skills').select('id,hero_id,name,description,skill_type,cooldown,duration,enabled,verification_status,needs_recheck').eq('enabled', true).order('display_order', { ascending: true }),
    supabase.from('team_compositions').select('id', { count: 'exact', head: true }).eq('is_public', true),
    supabase.from('team_synergies').select('id', { count: 'exact', head: true })
  ]);

  state.publicCount = compositionsResult.error ? null : compositionsResult.count;
  state.synergyCount = synergyResult.error ? null : synergyResult.count;
  setMetric('composition-public-count', state.publicCount);
  setMetric('composition-synergy-count', state.synergyCount);

  if (heroesResult.error || classesResult.error || skillsResult.error) {
    state.sourceError = heroesResult.error || classesResult.error || skillsResult.error;
    console.error('[compositions-experience] Fonte obrigatória indisponível:', state.sourceError);
    state.skillCount = null;
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

  setMetric('composition-hero-count', state.heroes.filter(hero => hero.skills.length > 0).length);
  statusCopy();
  renderAll();
}

bindInteractions();
attachFormObserver();
await load();
