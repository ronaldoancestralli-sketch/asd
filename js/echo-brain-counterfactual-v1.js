/* Echo Brain counterfactual v1
 * Compares already-computed score cards. It never invents a missing score and
 * keeps difficulty independent from quality/performance.
 */

const DEFAULT_DIRECTIONS = {
  finalScore: 1,
  functionalSynergy: 1,
  semanticSynergy: 1,
  observedPerformance: 1,
  confidence: 1,
  mechanicalDemand: -1
};

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, digits = 2) {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function componentsOf(card = {}) {
  return {
    finalScore: finite(card.finalScore ?? card.score),
    functionalSynergy: finite(card.functionalSynergy ?? card.components?.functionalScore),
    semanticSynergy: finite(card.semanticSynergy ?? card.components?.semanticAdjustment),
    observedPerformance: finite(card.observedPerformance ?? card.learnedScore),
    mechanicalDemand: finite(card.mechanicalDemand ?? card.difficulty),
    confidence: finite(card.confidence?.overall ?? card.confidence)
  };
}

function changedComponent(key, before, after, direction) {
  if (before === null || after === null) return null;
  const rawDelta = after - before;
  const utilityDelta = rawDelta * (direction || 1);
  return {
    key,
    before: round(before),
    after: round(after),
    delta: round(rawDelta),
    utilityDelta: round(utilityDelta),
    improved: utilityDelta > .0001,
    worsened: utilityDelta < -.0001,
    unchanged: Math.abs(utilityDelta) <= .0001
  };
}

export function compareCounterfactual(baseline = {}, candidate = {}, options = {}) {
  const directions = { ...DEFAULT_DIRECTIONS, ...(options.directions || {}) };
  const before = componentsOf(baseline);
  const after = componentsOf(candidate);
  const changed = Object.keys(directions)
    .map(key => changedComponent(key, before[key], after[key], directions[key]))
    .filter(Boolean);
  const final = changed.find(item => item.key === 'finalScore') || null;
  const meaningful = changed
    .filter(item => item.key !== 'finalScore' && !item.unchanged)
    .sort((a, b) => Math.abs(b.utilityDelta) - Math.abs(a.utilityDelta));
  const improved = meaningful.filter(item => item.improved);
  const worsened = meaningful.filter(item => item.worsened);

  return {
    schemaVersion: 'echo-brain-counterfactual-v1',
    baselineKey: baseline.key || baseline.entityKey || null,
    candidateKey: candidate.key || candidate.entityKey || null,
    baselineScore: final?.before ?? before.finalScore,
    candidateScore: final?.after ?? after.finalScore,
    delta: final?.delta ?? null,
    verdict: final === null ? 'unknown' : final.improved ? 'improves' : final.worsened ? 'worsens' : 'neutral',
    changedComponents: changed,
    strongestImprovement: improved[0] || null,
    strongestTradeoff: worsened[0] || null,
    confidence: {
      baseline: before.confidence,
      candidate: after.confidence,
      delta: before.confidence !== null && after.confidence !== null ? round(after.confidence - before.confidence, 3) : null
    }
  };
}

export function rankCounterfactuals(baseline = {}, candidates = [], options = {}) {
  return candidates.map(candidate => ({
    candidate,
    comparison: compareCounterfactual(baseline, candidate, options)
  })).sort((a, b) => {
    const da = finite(a.comparison.delta);
    const db = finite(b.comparison.delta);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return db - da;
  });
}

export function explainCounterfactual(comparison = {}) {
  if (!comparison || comparison.delta === null || comparison.delta === undefined) {
    return 'Não há dados suficientes para comparar as duas alternativas sem estimar valores ausentes.';
  }
  const delta = Number(comparison.delta);
  const direction = delta > 0 ? `melhora ${Math.abs(delta).toFixed(1)} pontos`
    : delta < 0 ? `reduz ${Math.abs(delta).toFixed(1)} pontos`
      : 'mantém a nota final';
  const parts = [`A troca ${direction}`];
  const gain = comparison.strongestImprovement;
  const tradeoff = comparison.strongestTradeoff;
  if (gain) parts.push(`principal ganho: ${gain.key} (${gain.utilityDelta > 0 ? '+' : ''}${gain.utilityDelta})`);
  if (tradeoff) parts.push(`principal custo: ${tradeoff.key} (${tradeoff.utilityDelta})`);
  if (comparison.confidence?.delta !== null && comparison.confidence?.delta < 0) parts.push('a confiança da leitura diminui');
  return `${parts.join(' · ')}.`;
}

export { DEFAULT_DIRECTIONS as COUNTERFACTUAL_COMPONENT_DIRECTIONS };
