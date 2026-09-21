/*
 * Public bridge for the legacy browser-side composition learner.
 *
 * The legacy module remains available as a deterministic diagnostic and keeps
 * its regression tests. Public scoring authority, however, belongs exclusively
 * to the server-side Echo Brain Semantic v4 policy. This bridge guarantees that
 * a network/model-policy failure can never make the browser learner silently
 * become the public ranker again.
 */

import * as legacy from './composition-adaptive-learning.js?core=20260823-server-authority-2';

export const PUBLIC_COMPOSITION_LEARNING_AUTHORITY = 'echo-brain-score';
export const LOCAL_ADAPTIVE_PUBLIC_INFLUENCE = 0;

function finiteScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function publicBaseline(options = {}, diagnostic = null) {
  return finiteScore(options?.baseEvaluation?.score) ?? finiteScore(diagnostic?.baselineScore);
}

export function trainAdaptiveCompositionModel(options = {}) {
  let model;
  try {
    model = legacy.trainAdaptiveCompositionModel(options);
  } catch (error) {
    return {
      mode: 'diagnostic-unavailable',
      influence: LOCAL_ADAPTIVE_PUBLIC_INFLUENCE,
      publicAuthority: PUBLIC_COMPOSITION_LEARNING_AUTHORITY,
      publicInfluence: LOCAL_ADAPTIVE_PUBLIC_INFLUENCE,
      diagnosticMode: 'unavailable',
      diagnosticError: error?.message || 'local_diagnostic_unavailable'
    };
  }
  return {
    ...model,
    publicAuthority: PUBLIC_COMPOSITION_LEARNING_AUTHORITY,
    publicInfluence: LOCAL_ADAPTIVE_PUBLIC_INFLUENCE,
    diagnosticMode: model?.mode || 'cold-start'
  };
}

export function evaluateAdaptiveComposition(options = {}) {
  let diagnostic = null;
  let diagnosticError = null;
  try {
    diagnostic = legacy.evaluateAdaptiveComposition(options);
  } catch (error) {
    diagnosticError = error?.message || 'local_diagnostic_unavailable';
  }
  const baselineScore = publicBaseline(options, diagnostic);

  return {
    ...(diagnostic || {}),
    mode: diagnostic?.mode || 'diagnostic-unavailable',
    baselineScore,
    adaptiveScore: baselineScore,
    influence: LOCAL_ADAPTIVE_PUBLIC_INFLUENCE,
    adjustment: 0,
    confidence: 0,
    publicAuthority: PUBLIC_COMPOSITION_LEARNING_AUTHORITY,
    diagnostic: {
      mode: diagnostic?.mode || diagnostic?.model?.mode || 'cold-start',
      learnedScore: diagnostic?.learnedScore ?? null,
      adaptiveScore: diagnostic?.adaptiveScore ?? baselineScore,
      influence: Number(diagnostic?.influence || 0),
      adjustment: Number(diagnostic?.adjustment || 0),
      confidence: Number(diagnostic?.confidence || 0),
      error: diagnosticError
    }
  };
}

export function learningStatusCopy(adaptive = {}) {
  const diagnostic = adaptive?.diagnostic || {};
  const model = adaptive?.model || {};
  const sample = Number(model?.totalMatches || 0);
  const detailParts = [
    '0% de influência pública',
    'o Echo Brain Semantic v4 no servidor é o único árbitro do aprendizado'
  ];
  if (diagnostic.error || model?.diagnosticMode === 'unavailable') detailParts.push('diagnóstico local indisponível; baseline preservada');
  if (sample > 0) detailParts.push(`${sample.toLocaleString('pt-BR')} partida(s) disponíveis para diagnóstico local`);
  if (diagnostic.influence > 0) detailParts.push(`sinal local preservado para auditoria (${Math.round(diagnostic.influence * 100)}%)`);
  return {
    label: 'Histórico local · diagnóstico',
    detail: detailParts.join(' · '),
    tone: 'idle'
  };
}

export function learnedInsight() {
  // A leitura local nunca injeta força/fraqueza no conteúdo público. O servidor
  // v4 devolve strengths/risks após policy, debt e modelo validado.
  return null;
}

export function rankAdaptiveCandidates(candidates = [], context = {}) {
  return (candidates || []).map(candidate => ({
    ...candidate,
    adaptive: evaluateAdaptiveComposition({
      ...context,
      heroes: candidate?.heroes || [],
      baseEvaluation: candidate
    }),
    rankingScore: Number(candidate?.score || 0)
  })).sort((a, b) =>
    Number(b.rankingScore || 0) - Number(a.rankingScore || 0) ||
    String((a.heroes || []).map(hero => hero?.id).filter(Boolean).sort().join('|'))
      .localeCompare(String((b.heroes || []).map(hero => hero?.id).filter(Boolean).sort().join('|')))
  );
}
