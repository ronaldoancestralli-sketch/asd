import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { resolveMediaUrl } from './media-storage.js?v=20260823-security-supabase-pin-1';
import {
  buildHeroProfile,
  evaluateComposition,
  recommendCompositions,
  COMPOSITION_CAPABILITIES
} from './composition-synergy-engine-v2.js?v=20260821-synergy-2';

const $ = id => document.getElementById(id);
const capabilityLabels = new Map(COMPOSITION_CAPABILITIES.map(item => [item.id, item.label]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  heroes: [], heroesById: new Map(), classes: [], selectedIds: ['', '', ''], activeSlot: 0,
  classFilter: '', search: '', publicCount: null, synergyCount: null, skillCount: null, sourceError: null
};

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}
function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function heroMedia(hero) {
  return resolveMediaUrl(hero?.card_image_path || hero?.image_path || hero?.card_image_url || hero?.image_url || '');
}
function setMetric(id, value) {
  const node = $(id); if (!node) return;
  node.textContent = value === null || value === undefined ? '—' : Number(value).toLocaleString('pt-BR');
}
function uniqueSelectedIds() { return [...new Set(state.selectedIds.filter(Boolean))]; }
function selectedHeroes() { return state.selectedIds.map(id => state.heroesById.get(id)).filter(Boolean); }
function classFor(hero) { return state.classes.find(item => item.id === hero?.class_id) || null; }

function statusCopy() {
  const node = $('composition-data-status'); if (!node) return;
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
    const measured = Number(state.synergyCount);
    measuredCopy = measured > 0 ? `${measured.toLocaleString('pt-BR')} sinergia(s) medida(s)` : '0 sinergias medidas';
  }
  node.className = 'composition-live';
  node.innerHTML = `<i></i><span>${Number(state.skillCount).toLocaleString('pt-BR')} habilidades analisáveis · ${measuredCopy}</span>`;
}

function renderSlot(index, hero) {
  const host = $(`strategy-slot-${index + 1}`); if (!host) return;
  host.classList.toggle('active-slot', state.activeSlot === index);
  if (!hero) {
    host.classList.add('empty');
    host.innerHTML = `<div class="slot-empty"><b>${index + 1}</b><span>${state.activeSlot === index ? 'Escolha abaixo' : 'Escolher herói'}</span></div>`;
    host.setAttribute('aria-label', `Escolher herói para a posição ${index + 1}`);
    return;
  }
  host.classList.remove('empty');
  const src = heroMedia(hero); const heroClass = classFor(hero);
  host.innerHTML = `${src ? `<img src="${esc(src)}" alt="">` : '<div class="strategy-fallback">◇</div>'}<div class="slot-label"><small>Posição ${index + 1}${heroClass?.name ? ` · ${esc(heroClass.name)}` : ''}</small><strong>${esc(hero.name)}</strong></div>`;
  host.setAttribute('aria-label', `Posição ${index + 1}: ${hero.name}. Toque para substituir.`);
}
function renderSlots() {
  state.selectedIds.forEach((id,index)=>renderSlot(index,state.heroesById.get(id)||null));
  const progress = $('strategy-progress'); if (progress) progress.textContent = `${uniqueSelectedIds().length} de 3 selecionados`;
}

function heroCapabilities(hero) {
  return [...buildHeroProfile(hero).capabilities]
    .filter(id => id !== 'team_utility')
    .map(id => capabilityLabels.get(id) || id)
    .slice(0, 2);
}

function renderClassFilters() {
  const host = $('composition-class-filters'); if (!host) return;
  host.innerHTML = `<button type="button" class="${state.classFilter ? '' : 'active'}" data-class="">Todos</button>${state.classes.map(item => `<button type="button" class="${state.classFilter === item.id ? 'active' : ''}" data-class="${esc(item.id)}">${esc(item.name)}</button>`).join('')}`;
}
function visibleHeroes() {
  const term = normalize(state.search);
  return state.heroes.filter(hero => {
    const heroClass = classFor(hero);
    return (!state.classFilter || hero.class_id === state.classFilter) && (!term || normalize(`${hero.name} ${heroClass?.name || ''} ${(hero.skills || []).map(skill=>skill.name).join(' ')}`).includes(term));
  });
}
function renderPicker() {
  const host = $('composition-hero-picker'); if (!host) return;
  if (state.sourceError) {
    host.innerHTML = '<div class="composition-engine-error"><strong>Não foi possível carregar as habilidades</strong><p>O motor fica desativado para evitar recomendações sem evidência.</p></div>';
    return;
  }
  const heroes = visibleHeroes();
  if (!heroes.length) { host.innerHTML = '<div class="composition-engine-loading">Nenhum herói corresponde ao filtro.</div>'; return; }
  const selected = new Set(uniqueSelectedIds()); const teamFull = selected.size >= 3;
  host.innerHTML = heroes.map(hero => {
    const heroClass = classFor(hero); const src = heroMedia(hero); const caps = heroCapabilities(hero); const isSelected = selected.has(hero.id);
    const action = isSelected ? 'Remover' : teamFull && state.activeSlot === null ? 'Escolha um slot' : 'Adicionar';
    return `<button type="button" class="composition-hero-option ${isSelected ? 'selected' : ''}" data-hero-id="${esc(hero.id)}" style="--hero-color:${esc(heroClass?.color || '#9367ff')}" aria-pressed="${String(isSelected)}">
      <span class="hero-option-media">${src ? `<img src="${esc(src)}" alt="">` : '◇'}</span>
      <span class="hero-option-copy"><b>${esc(hero.name)}</b><small>${esc(heroClass?.name || 'Sem classe')}</small><span>${caps.map(item=>`<i>${esc(item)}</i>`).join('')}</span></span>
      <em>${action}</em>
    </button>`;
  }).join('');
}

function fillSelectOptions() {
  const selects = [...document.querySelectorAll('.composition-hero-select')];
  if (!selects.length || !state.heroes.length) return;
  const options = state.heroes.map(hero=>`<option value="${esc(hero.id)}">${esc(hero.name)}</option>`).join('');
  selects.forEach((select,index)=>{
    const expected = state.selectedIds[index] || '';
    if (select.options.length !== state.heroes.length + 1) select.innerHTML = `<option value="">Escolha um herói</option>${options}`;
    select.value = expected;
    if (!select.dataset.engineBound) {
      select.dataset.engineBound = '1';
      select.addEventListener('change',()=>{
        const newId = select.value;
        if (newId && state.selectedIds.some((id,otherIndex)=>otherIndex!==index && id===newId)) {
          select.value = state.selectedIds[index] || '';
          showTransientNotice('Este herói já ocupa outra posição.');
          return;
        }
        state.selectedIds[index] = newId;
        const nextEmpty = state.selectedIds.findIndex(id=>!id);
        state.activeSlot = nextEmpty >= 0 ? nextEmpty : null;
        renderAll();
      });
    }
  });
}
function syncFormSelections() {
  fillSelectOptions();
  [...document.querySelectorAll('.composition-hero-select')].forEach((select,index)=>{
    const expected = state.selectedIds[index] || ''; if (select.value !== expected) select.value = expected;
  });
}

let noticeTimer = null;
function showTransientNotice(message) {
  const host = $('composition-analysis'); if (!host) return;
  host.dataset.notice = message; clearTimeout(noticeTimer);
  noticeTimer = setTimeout(()=>{ if (host.dataset.notice === message) delete host.dataset.notice; renderAnalysis(); },2200);
  renderAnalysis();
}
function evidenceText(items = []) {
  return items.slice(0,2).map(item=>`${item.heroName} · ${item.skillName}`).join(' + ');
}
function scoreLabel(score) {
  if (score >= 82) return 'Muito alta'; if (score >= 68) return 'Alta'; if (score >= 52) return 'Moderada'; return 'Limitada';
}
function renderStrategyScore(evaluation = null) {
  const host = $('strategy-score'); if (!host) return;
  if (!evaluation || evaluation.score === null) {
    host.innerHTML = '<span>Compatibilidade</span><strong>—</strong><small>Complete o trio para calcular</small>';
    return;
  }
  host.innerHTML = `<span>Compatibilidade</span><strong>${Number(evaluation.score)}</strong><small>${esc(scoreLabel(evaluation.score))}</small>`;
}

function renderPartialAnalysis(heroes) {
  const host = $('composition-analysis'); if (!host) return;
  const profiles = heroes.map(buildHeroProfile);
  const cards = profiles.map(profile => {
    const caps = [...profile.capabilities].filter(id=>id!=='team_utility').slice(0,3);
    return `<article class="partial-profile"><strong>${esc(profile.hero.name)}</strong><span>${esc(classFor(profile.hero)?.name || '')}</span><div>${caps.map(id=>`<i>${esc(capabilityLabels.get(id)||id)}</i>`).join('')}</div></article>`;
  }).join('');
  host.innerHTML = `${host.dataset.notice ? `<div class="analysis-notice">${esc(host.dataset.notice)}</div>` : ''}<div class="analysis-step"><span>ANÁLISE AO VIVO</span><strong>${heroes.length ? `${heroes.length}/3 escolhidos` : 'Escolha o primeiro herói'}</strong><p>${heroes.length ? 'Continue montando. O motor já procura complementos sem assumir que existe um trio “certo”.' : 'Comece por qualquer herói ou teste as sugestões do motor.'}</p></div>${cards ? `<div class="partial-profiles">${cards}</div>` : ''}`;
  renderStrategyScore(null);
}

function renderStrengthCard(item) {
  return `<article class="insight-card strength"><span>PONTO FORTE</span><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p>${item.evidence?.length ? `<small>${esc(evidenceText(item.evidence))}</small>` : ''}</article>`;
}
function renderWeaknessCard(item) {
  return `<article class="insight-card weakness"><span>PONTO FRACO</span><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p></article>`;
}

function renderAnalysis() {
  const host = $('composition-analysis'); if (!host) return;
  if (state.sourceError) {
    host.innerHTML = '<div class="analysis-empty"><span>MOTOR PAUSADO</span><strong>Sem habilidades, sem recomendação</strong><p>A leitura falhou. O salvamento manual continua disponível, mas o motor não calcula.</p></div>';
    renderStrategyScore(null); return;
  }
  const heroes = selectedHeroes();
  if (heroes.length !== 3 || uniqueSelectedIds().length !== 3) { renderPartialAnalysis(heroes); return; }

  const evaluation = evaluateComposition(heroes); renderStrategyScore(evaluation);
  const strengths = evaluation.strengths.slice(0,3).map(renderStrengthCard).join('');
  const weaknesses = evaluation.weaknesses.length ? evaluation.weaknesses.slice(0,2).map(renderWeaknessCard).join('') : '<article class="insight-card neutral"><span>PONTO FRACO</span><strong>Sem lacuna principal</strong><p>O modelo não encontrou uma deficiência evidente entre os eixos principais analisados.</p></article>';
  const coverage = evaluation.coverage.slice(0,4).map(item=>`<span>${esc(item.label)}</span>`).join('');
  const technical = evaluation.factors.slice(0,4).map(item=>`<li><b>+${Number(item.points)} · ${esc(item.title)}</b>${evidenceText(item.evidence) ? `<small>${esc(evidenceText(item.evidence))}</small>` : ''}</li>`).join('');

  host.innerHTML = `${host.dataset.notice ? `<div class="analysis-notice">${esc(host.dataset.notice)}</div>` : ''}
    <header class="analysis-score-head compact"><div><span>COMPATIBILIDADE</span><strong>${Number(evaluation.score)}<small>/100</small></strong><p>${esc(scoreLabel(evaluation.score))}</p></div><div class="analysis-verdict"><b>Leitura rápida</b><p>${esc(evaluation.summary)}</p></div></header>
    <div class="analysis-coverage">${coverage}</div>
    <section class="analysis-insights"><div><h3>O que funciona</h3>${strengths}</div><div><h3>O que pede atenção</h3>${weaknesses}</div></section>
    <details class="analysis-details"><summary>Ver como o motor chegou nisso</summary><ul>${technical}</ul><p>Compatibilidade funcional calculada pelas habilidades cadastradas. Não representa desempenho real em partidas.</p></details>`;
}

function teamKey(heroes) { return heroes.map(hero=>hero.id).sort().join('|'); }
function recommendationCandidates() {
  const selected = uniqueSelectedIds();
  if (selected.length < 3) return recommendCompositions(state.heroes, selected, 4);
  const currentKey = [...selected].sort().join('|');
  const pairs = [[selected[0],selected[1]],[selected[0],selected[2]],[selected[1],selected[2]]];
  const map = new Map();
  for (const pair of pairs) {
    for (const result of recommendCompositions(state.heroes,pair,4)) {
      const key = teamKey(result.heroes); if (key===currentKey) continue;
      if (!map.has(key) || Number(result.score||0) > Number(map.get(key)?.score||0)) map.set(key,result);
    }
  }
  return [...map.values()].sort((a,b)=>Number(b.score||0)-Number(a.score||0)||teamKey(a.heroes).localeCompare(teamKey(b.heroes))).slice(0,4);
}
function renderRecommendations() {
  const host = $('composition-recommendation-grid'); const copy = $('composition-recommendations-copy'); const scope = $('composition-recommendation-scope');
  if (!host) return;
  if (state.sourceError || !state.heroes.length) { host.innerHTML='<div class="analysis-empty compact"><strong>Sugestões indisponíveis</strong><p>O motor precisa das habilidades para recomendar.</p></div>'; return; }
  const selected = uniqueSelectedIds();
  if (copy) copy.textContent = selected.length===3 ? 'Teste variações trocando apenas um herói por vez.' : 'Escolha seus favoritos e deixe o motor completar os espaços.';
  if (scope) scope.textContent = selected.length===0 ? 'Experimente livremente' : selected.length===3 ? 'Troca de 1 herói' : `Mantendo ${selected.length} escolhido${selected.length===1?'':'s'}`;
  const rows = recommendationCandidates();
  host.innerHTML = rows.map((row,index)=>{
    const strength = row.strengths?.[0]; const weakness = row.weaknesses?.[0];
    return `<article class="recommendation-card"><header><span>Experimento ${index+1}</span><strong>${Number(row.score||0)}<small>/100</small></strong></header><div class="recommendation-team">${row.heroes.map(hero=>{const src=heroMedia(hero);return `<div>${src?`<img src="${esc(src)}" alt="">`:'<span>◇</span>'}<b>${esc(hero.name)}</b></div>`;}).join('')}</div><div class="recommendation-reason"><b>${esc(strength?.title || 'Cobertura funcional')}</b><p>${esc(weakness ? `Atenção: ${weakness.title}.` : 'Sem lacuna principal identificada.')}</p></div><button type="button" data-apply-team="${esc(row.heroes.map(hero=>hero.id).join(','))}">Testar este trio</button></article>`;
  }).join('');
}

function renderAll() { renderSlots(); renderClassFilters(); renderPicker(); syncFormSelections(); renderAnalysis(); renderRecommendations(); }
function chooseHero(heroId) {
  if (!state.heroesById.has(heroId)) return;
  const existingIndex = state.selectedIds.indexOf(heroId);
  if (existingIndex >= 0) { state.selectedIds[existingIndex]=''; state.activeSlot=existingIndex; renderAll(); return; }
  let target = state.activeSlot;
  if (target===null || target<0 || target>2) target = state.selectedIds.findIndex(id=>!id);
  if (target<0) { showTransientNotice('Trio completo. Toque em um slot acima para escolher quem substituir.'); return; }
  state.selectedIds[target]=heroId;
  const nextEmpty = state.selectedIds.findIndex(id=>!id); state.activeSlot = nextEmpty>=0 ? nextEmpty : null; renderAll();
}
function applyTeam(ids) {
  const clean = ids.filter(id=>state.heroesById.has(id)).slice(0,3);
  if (clean.length!==3 || new Set(clean).size!==3) return;
  state.selectedIds=clean; state.activeSlot=null; renderAll();
  $('strategy-board')?.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'center'});
}

function bindInteractions() {
  $('composition-create-cta')?.addEventListener('click',()=> $('composition-lab')?.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'start'}));
  $('composition-back-to-lab')?.addEventListener('click',()=> $('composition-lab')?.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'start'}));
  $('composition-clear-team')?.addEventListener('click',()=>{state.selectedIds=['','',''];state.activeSlot=0;renderAll();});
  $('composition-hero-search')?.addEventListener('input',event=>{state.search=event.target.value;renderPicker();});
  $('composition-class-filters')?.addEventListener('click',event=>{const button=event.target.closest('button[data-class]');if(!button)return;state.classFilter=button.dataset.class||'';renderClassFilters();renderPicker();});
  $('composition-hero-picker')?.addEventListener('click',event=>{const button=event.target.closest('[data-hero-id]');if(button)chooseHero(button.dataset.heroId);});
  $('strategy-board')?.addEventListener('click',event=>{const slot=event.target.closest('.strategy-slot[data-position]');if(!slot)return;state.activeSlot=Number(slot.dataset.position)-1;renderSlots();renderPicker();$('composition-lab')?.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'start'});});
  $('composition-recommendation-grid')?.addEventListener('click',event=>{const button=event.target.closest('[data-apply-team]');if(button)applyTeam(String(button.dataset.applyTeam||'').split(',').filter(Boolean));});
}
function attachFormObserver() {
  const form=$('composition-form'); if(!form)return; fillSelectOptions(); new MutationObserver(()=>syncFormSelections()).observe(form,{childList:true,subtree:true});
}

async function load() {
  statusCopy();
  const [heroesResult,classesResult,skillsResult,compositionsResult,synergyResult]=await Promise.all([
    supabase.from('heroes').select('id,name,slug,class_id,enabled,display_order,card_image_path,image_path,card_image_url,image_url').eq('enabled',true).order('display_order',{ascending:true}).order('name'),
    supabase.from('hero_classes').select('id,name,slug,color,icon').order('name',{ascending:true}),
    supabase.from('hero_skills').select('id,hero_id,name,description,skill_type,cooldown,duration,enabled,verification_status,needs_recheck').eq('enabled',true).order('display_order',{ascending:true}),
    supabase.from('team_compositions').select('id',{count:'exact',head:true}).eq('is_public',true),
    supabase.from('team_synergies').select('id',{count:'exact',head:true})
  ]);
  state.publicCount=compositionsResult.error?null:compositionsResult.count; state.synergyCount=synergyResult.error?null:synergyResult.count;
  setMetric('composition-public-count',state.publicCount); setMetric('composition-synergy-count',state.synergyCount);
  if (heroesResult.error || classesResult.error || skillsResult.error) {
    state.sourceError=heroesResult.error||classesResult.error||skillsResult.error; console.error('[compositions-experience-v2] Fonte obrigatória indisponível:',state.sourceError);
    setMetric('composition-hero-count',null); statusCopy(); renderAll(); return;
  }
  state.classes=classesResult.data||[];
  const skillsByHero=new Map(); for(const skill of skillsResult.data||[]){if(!skillsByHero.has(skill.hero_id))skillsByHero.set(skill.hero_id,[]);skillsByHero.get(skill.hero_id).push(skill);}
  state.heroes=(heroesResult.data||[]).map(hero=>({...hero,skills:skillsByHero.get(hero.id)||[]})); state.heroesById=new Map(state.heroes.map(hero=>[hero.id,hero])); state.skillCount=(skillsResult.data||[]).length;
  setMetric('composition-hero-count',state.heroes.filter(hero=>hero.skills.length>0).length); statusCopy(); renderAll();
}

bindInteractions();
attachFormObserver();
await load();
