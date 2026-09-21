import {
  scoreCompositionTeamsV4,
  recommendCompositionTeamsV4,
  registerCompositionExposureV4
} from './echo-brain-composition-client-v4.js?v=20260827-brain-runtime-1&sb=20260823-security-supabase-pin-1';
import { COMPOSITION_SELECTION_EVENT } from './composition-selection-state.mjs?v=20260822-selection-1';

const $ = id => document.getElementById(id);
const exposed = new Set();
let selectedIds = ['', '', ''];
let requestToken = 0;
let recommendationRequestToken = 0;
let recommendationBusy = false;
let recommendationTimer = null;
let recommendationRefreshPending = false;
let lastRecommendationSignature = '';
const NO_LOCAL_RANK_CONTRACT = 'nenhum rank local foi usado';
const NO_LOCAL_RANK_COPY = NO_LOCAL_RANK_CONTRACT.replace('nenhum rank', 'Nenhum ranking');

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function validTeam(ids = []) {
  return ids.length === 3 && ids.every(Boolean) && new Set(ids).size === 3;
}

function key(ids = []) {
  return [...ids].sort().join('|');
}

function selectionKey(ids = selectedIds) {
  return validTeam(ids) ? key(ids) : 'none';
}

function pct(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function signed(value, digits = 1) {
  const n = Number(value || 0);
  const rounded = Math.round(n * (10 ** digits)) / (10 ** digits);
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('pt-BR', { maximumFractionDigits: digits })}`;
}

function equipmentContextLabel(result = {}) {
  const context = result.equipmentContext || {};
  if (context.sourceAvailable === false) return 'catálogo não confirmado';
  if (context.applied !== true) return 'catálogo sem ajuste';
  return `potencial do catálogo ${signed(result.equipmentAdjustment)}`;
}

function scoreTone(score) {
  if (score >= 82) return 'Muito alta';
  if (score >= 68) return 'Alta';
  if (score >= 52) return 'Moderada';
  return 'Limitada';
}

function evidenceTone(result = {}) {
  const verification = Number(result?.confidence?.verification || 0);
  return verification >= .99 ? 'habilidades verificadas' : 'habilidades corroboradas · confiança reduzida';
}

function errorCopy(error = '') {
  const code = String(error || '').toLowerCase();
  if (code.includes('knowledge_not_current')) return {
    title: 'Conhecimento em atualização',
    copy: 'O servidor ainda está reconciliando a versão atual dos heróis ou equipamentos. Nenhuma nota antiga ou local foi exibida.'
  };
  if (code.includes('skill_evidence_required') || code.includes('verified_skills_required')) return {
    title: 'Evidência de habilidades insuficiente',
    copy: 'Um ou mais heróis ainda não possuem habilidades verificadas ou corroboradas suficientes para uma análise responsável.'
  };
  if (code.includes('hero_unavailable')) return {
    title: 'Herói indisponível para análise',
    copy: 'Um dos heróis selecionados não está disponível na base pública atual. Troque o herói e tente novamente.'
  };
  if (code.includes('knowledge_source_unavailable')) return {
    title: 'Fonte de conhecimento indisponível',
    copy: 'O servidor não conseguiu consultar uma das fontes necessárias. A análise foi interrompida para não inventar dados.'
  };
  return {
    title: 'Análise temporariamente indisponível',
    copy: 'O servidor não concluiu esta leitura agora. Nenhuma nota fictícia nem fallback local foi usado.'
  };
}

function renderSemanticFailure(error = '') {
  const host = $('composition-analysis');
  if (!host) return;
  const copy = errorCopy(error);
  host.innerHTML = `<div class="analysis-empty semantic-v4-state-error"><span>ECHO BRAIN · SEMANTIC V4</span><strong>${esc(copy.title)}</strong><p>${esc(copy.copy)}</p><small>Você pode trocar um herói e tentar novamente. O salvamento manual continua disponível.</small></div>`;
}

function setAuthorityStatus(result = null, unavailable = false) {
  const node = $('composition-data-status');
  const span = node?.querySelector('span');
  if (!node || !span) return;
  const current = String(span.textContent || '').trim();
  const base = current
    .replace(/\s*·\s*aprendizado[^·]*$/i, '')
    .replace(/\s*·\s*Brain v4.*$/i, '')
    .trim();
  const authority = unavailable
    ? 'Brain v4 · análise não concluída'
    : result
      ? result.influence > 0
        ? 'Brain v4 · histórico validado na nota'
        : Number(result?.confidence?.verification || 0) >= .99
          ? 'Brain v4 · análise determinística verificada'
          : 'Brain v4 · análise determinística corroborada'
      : 'Brain v4 arbitra a nota';
  span.textContent = `${base || 'Dados carregados'} · ${authority}`;
}

function clearSelectedSemanticPresentation() {
  const host = $('composition-analysis');
  if (host) host.innerHTML = '<div class="analysis-empty"><span>ECHO BRAIN · SEMANTIC V4</span><strong>Validando no servidor</strong><p>Nenhuma nota local é exibida enquanto a autoridade pública confirma conhecimento, versão e proveniência.</p></div>';
}

function renderSemanticStrip(result) {
  const host = $('composition-analysis');
  if (!host || !result) return;
  setAuthorityStatus(result);
  const perf = result.observedPerformance === null || result.observedPerformance === undefined ? '—' : Math.round(result.observedPerformance);
  const confidence = result.confidence || {};
  const debt = result.knowledge?.pending ? `${result.knowledge.pending} pendência(s) de patch` : result.knowledge?.unknown ? 'frescor não confirmado' : 'conhecimento atual';
  const evidence = evidenceTone(result);
  const equipmentLabel = equipmentContextLabel(result);
  const equipmentConfidence = result.equipmentContext?.applied ? ` · catálogo ${pct(confidence.equipmentContext)}` : '';
  host.innerHTML = `<section class="semantic-v4-strip" data-semantic-v4-strip="1">
    <header><div><span>ECHO BRAIN · SEMANTIC V4</span><strong>${esc(result.finalScore)}<small>/100</small></strong></div><p>${esc(scoreTone(result.finalScore))} · ${esc(debt)} · ${esc(evidence)}</p></header>
    <div class="semantic-v4-metrics">
      <div><span>Sinergia funcional</span><b>${esc(Math.round(result.functionalSynergy))}</b><small>regras do kit</small></div>
      <div><span>Leitura semântica</span><b>${esc(Math.round(result.semanticSynergy))}</b><small>heróis/habilidades · ${esc(equipmentLabel)}</small></div>
      <div><span>Performance observada</span><b>${esc(perf)}</b><small>${result.influence > 0 ? `peso ${Math.round(result.influence * 100)}%` : 'fora da nota'}</small></div>
      <div><span>Exigência mecânica</span><b>${esc(result.mechanicalDemand)}</b><small>não é qualidade</small></div>
      <div><span>Confiança</span><b>${esc(pct(confidence.overall))}</b><small>regras ${esc(pct(confidence.rules))} · verificação ${esc(pct(confidence.verification))} · dados ${esc(pct(confidence.observedEvidence))}${esc(equipmentConfidence)}</small></div>
    </div>
    <div class="semantic-v4-reasons">
      ${(result.strengths || []).slice(0, 2).map(text => `<p class="up">+ ${esc(text)}</p>`).join('')}
      ${(result.risks || []).slice(0, 2).map(text => `<p class="down">– ${esc(text)}</p>`).join('')}
    </div></section>`;

  const strategy = $('strategy-score');
  if (strategy) strategy.innerHTML = `<span>Compatibilidade · Brain v4</span><strong>${esc(result.finalScore)}</strong><small>${esc(scoreTone(result.finalScore))}</small>`;
}

async function ensureCompositionExposure(result, contextHash) {
  if (!result?.key) return false;
  const exposureKey = `${result.key}::${contextHash || 'none'}`;
  if (exposed.has(exposureKey)) return true;
  const exposureId = await registerCompositionExposureV4(result, contextHash);
  if (!exposureId) return false;
  exposed.add(exposureKey);
  return true;
}

async function scoreSelected() {
  if (!validTeam(selectedIds)) return;
  const snapshot = [...selectedIds];
  const snapshotKey = key(snapshot);
  const token = ++requestToken;
  setAuthorityStatus();
  const response = await scoreCompositionTeamsV4(
    [{ requestId: 'selected', heroIds: snapshot }],
    { surface: 'composition_lab' }
  );
  if (token !== requestToken || snapshotKey !== selectionKey()) return;
  if (!response?.ok) {
    setAuthorityStatus(null, true);
    renderSemanticFailure(response?.error || response?.detail || 'analysis_unavailable');
    return;
  }
  const result = response.results?.[0];
  if (!result || result.key !== snapshotKey) {
    setAuthorityStatus(null, true);
    renderSemanticFailure('invalid_score_response');
    return;
  }
  const exposureReady = await ensureCompositionExposure(result, `selected:${result.key}`);
  if (token !== requestToken || snapshotKey !== selectionKey()) return;
  if (!exposureReady) {
    setAuthorityStatus(null, true);
    const host = $('composition-analysis');
    if (host) host.innerHTML = '<div class="analysis-empty semantic-v4-state-error"><span>ECHO BRAIN · SEMANTIC V4</span><strong>Decisão não publicada</strong><p>A proveniência indisponível impediu a exposição da nota; nenhum fallback local foi usado.</p></div>';
    return;
  }
  renderSemanticStrip(result);
}

function recommendationSignature(selected = selectedIds) {
  return selected.map(String).filter(Boolean).sort().join('|') || 'none';
}

function recommendationCard(result, index) {
  const cf = result.counterfactual;
  const badge = cf ? `${cf.delta > 0 ? '+' : ''}${cf.delta} vs atual` : `conf. ${pct(result.confidence?.overall)}`;
  const best = result.strengths?.[0] || 'Cobertura semântica equilibrada.';
  const risk = result.risks?.[0];
  const equipment = result.equipmentContext?.applied
    ? ` Potencial do catálogo: ${signed(result.equipmentAdjustment)} ponto(s), sem presumir uma build equipada.`
    : '';
  const detail = `${cf ? `Contrafactual: ${cf.delta > 0 ? 'ganho' : cf.delta < 0 ? 'perda' : 'empate'} de ${Math.abs(cf.delta)} ponto(s). ` : ''}${risk ? `Atenção: ${risk}` : 'Sem risco principal identificado pelo v4.'}${equipment}`;
  const displayById = new Map((result.heroDisplay || []).map(hero => [String(hero.id), String(hero.name || hero.id)]));
  const heroes = result.heroIds.map(id => `<div><span>◇</span><b>${esc(displayById.get(String(id)) || id)}</b></div>`).join('');
  return `<article class="recommendation-card" data-semantic-v4-score="${esc(result.finalScore)}" data-semantic-v4-key="${esc(result.key)}"><header><span>Experimento ${index + 1}</span><div><strong>${esc(result.finalScore)}<small>/100</small></strong><small class="recommendation-learning semantic-v4-badge" data-semantic-v4-badge="1">${esc(badge)}</small></div></header><div class="recommendation-team">${heroes}</div><div class="recommendation-reason"><b>${esc(best)}</b><p>${esc(detail)}</p></div><button type="button" data-apply-team="${esc(result.heroIds.join(','))}">Testar este trio</button></article>`;
}

async function rescoreRecommendations() {
  if (recommendationBusy) {
    recommendationRefreshPending = true;
    return;
  }
  const selectedSnapshot = [...selectedIds];
  const sourceSignature = recommendationSignature(selectedSnapshot);
  const host = $('composition-recommendation-grid');
  if (!host) return;
  if (sourceSignature === lastRecommendationSignature) return;

  recommendationBusy = true;
  recommendationRefreshPending = false;
  const token = ++recommendationRequestToken;
  try {
    const response = await recommendCompositionTeamsV4(selectedSnapshot.filter(Boolean), { surface: 'composition_lab' });
    if (token !== recommendationRequestToken || sourceSignature !== recommendationSignature(selectedIds)) return;
    if (!response?.ok) {
      const copy = errorCopy(response?.error || response?.detail || 'recommendations_unavailable');
      host.innerHTML = `<div class="analysis-empty compact semantic-v4-state-error"><strong>Sugestões temporariamente indisponíveis</strong><p>${esc(copy.copy)} ${esc(NO_LOCAL_RANK_COPY)}.</p></div>`;
      lastRecommendationSignature = sourceSignature;
      return;
    }
    const exposureContext = validTeam(selectedSnapshot) ? `recommendations:${key(selectedSnapshot)}` : `recommendations:${sourceSignature}`;
    const exposureStates = await Promise.all(response.results.map(result => ensureCompositionExposure(result, exposureContext)));
    if (token !== recommendationRequestToken || sourceSignature !== recommendationSignature(selectedIds)) return;
    if (exposureStates.some(ready => ready !== true)) {
      host.innerHTML = '<div class="analysis-empty compact semantic-v4-state-error"><strong>Sugestões não publicadas</strong><p>A proveniência indisponível impediu a exposição do ranking; nenhum fallback local foi usado.</p></div>';
      lastRecommendationSignature = sourceSignature;
      return;
    }
    host.innerHTML = response.results.map(recommendationCard).join('');
    lastRecommendationSignature = sourceSignature;
  } finally {
    recommendationBusy = false;
    if (recommendationRefreshPending) scheduleRecommendations();
  }
}

function scheduleRecommendations() {
  clearTimeout(recommendationTimer);
  recommendationRefreshPending = true;
  recommendationTimer = setTimeout(() => {
    recommendationRefreshPending = false;
    rescoreRecommendations();
  }, 30);
}

function invalidateRecommendationRequest() {
  recommendationRequestToken += 1;
  lastRecommendationSignature = '';
  recommendationRefreshPending = true;
}

function bindSelection() {
  const form = $('composition-form');
  if (!form) return;
  form.addEventListener(COMPOSITION_SELECTION_EVENT, event => {
    const ids = Array.isArray(event.detail?.heroIds) ? event.detail.heroIds.map(String) : [];
    selectedIds = [ids[0] || '', ids[1] || '', ids[2] || ''];
    requestToken += 1;
    clearSelectedSemanticPresentation();
    invalidateRecommendationRequest();
    setAuthorityStatus();
    if (validTeam(selectedIds)) queueMicrotask(() => scoreSelected());
    scheduleRecommendations();
  });
}

function observeRecommendations() {
  const host = $('composition-recommendation-grid');
  if (!host) return;
  const observer = new MutationObserver(() => {
    if (recommendationBusy) {
      recommendationRefreshPending = true;
      return;
    }
    scheduleRecommendations();
  });
  observer.observe(host, { childList: true, subtree: true });
  scheduleRecommendations();
}

bindSelection();
observeRecommendations();
queueMicrotask(() => setAuthorityStatus());
