import { compareCounterfactual, rankCounterfactuals } from './echo-brain-counterfactual-v1.js?v=1';

function scoreCard(result = {}, key = null) {
  const brain = result?.echoBrain || {};
  const fit = Number(brain.buildFitScore);
  const confidence = Number(brain.explanationConfidence);
  const coverage = Number(brain.calculationCoverage);
  const penaltyCount = Array.isArray(brain.conflicts) ? brain.conflicts.length : 0;
  const synergyCount = Array.isArray(brain.strongestSynergies) ? brain.strongestSynergies.length : 0;
  return {
    key,
    finalScore: Number.isFinite(fit) ? fit : null,
    functionalSynergy: Number.isFinite(coverage) ? coverage * 100 : null,
    semanticSynergy: Number.isFinite(fit) ? fit : null,
    observedPerformance: null,
    mechanicalDemand: penaltyCount * 8,
    confidence: { overall: Number.isFinite(confidence) ? confidence : null },
    components: { coverage, penaltyCount, synergyCount }
  };
}

function cloneContext(context = {}) {
  return {
    ...context,
    equipados: { ...(context.equipados || {}) },
    dados: context.dados
  };
}

export function compareBuildResultsV1(baselineResult, candidateResult, keys = {}) {
  const baseline = scoreCard(baselineResult, keys.baselineKey || 'baseline');
  const candidate = scoreCard(candidateResult, keys.candidateKey || 'candidate');
  const comparison = compareCounterfactual(baseline, candidate);
  return {
    ...comparison,
    calculationCoverage: {
      baseline: baseline.components.coverage,
      candidate: candidate.components.coverage
    },
    conflictDelta: candidate.components.penaltyCount - baseline.components.penaltyCount,
    synergyDelta: candidate.components.synergyCount - baseline.components.synergyCount
  };
}

export async function evaluateEquipmentSwapCounterfactualsV1({
  context,
  slotKey,
  candidates = [],
  evaluateBuild
} = {}) {
  if (!context || !slotKey || typeof evaluateBuild !== 'function') throw new Error('counterfactual_context_slot_and_evaluator_required');
  const baselineContext = cloneContext(context);
  const baselineResult = await evaluateBuild(baselineContext);
  const baselineItem = baselineContext.equipados?.[slotKey] || null;
  const baselineCard = scoreCard(baselineResult, baselineItem?.databaseId || `slot:${slotKey}:empty`);
  const rows = [];

  for (const candidate of candidates.filter(Boolean)) {
    const nextContext = cloneContext(context);
    nextContext.equipados[slotKey] = candidate;
    const result = await evaluateBuild(nextContext);
    const candidateCard = scoreCard(result, candidate.databaseId || candidate.id || candidate.nome || 'candidate');
    rows.push({
      item: candidate,
      result,
      candidate: candidateCard,
      comparison: compareCounterfactual(baselineCard, candidateCard)
    });
  }

  const ranked = rankCounterfactuals(baselineCard, rows.map(row => row.candidate));
  const rankByKey = new Map(ranked.map((row, index) => [row.candidate.key, index + 1]));
  rows.sort((a, b) => (rankByKey.get(a.candidate.key) || 999) - (rankByKey.get(b.candidate.key) || 999));

  return {
    schemaVersion: 'echo-brain-build-counterfactual-v1',
    slotKey,
    baselineItem,
    baselineResult,
    baseline: baselineCard,
    alternatives: rows
  };
}

export function oneChangeAtATimeInvariantV1(beforeContext = {}, afterContext = {}) {
  const before = beforeContext.equipados || {};
  const after = afterContext.equipados || {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed = [];
  for (const key of keys) {
    const a = before[key]?.databaseId || before[key]?.id || null;
    const b = after[key]?.databaseId || after[key]?.id || null;
    if (String(a || '') !== String(b || '')) changed.push(key);
  }
  return { valid: changed.length <= 1, changedSlots: changed };
}
