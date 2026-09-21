/*
 * Echo Arena — camada adaptativa de aprendizado de Composições.
 *
 * Objetivo: aprender padrões a partir de RESULTADOS OBSERVADOS de trios sem
 * confundir popularidade, cliques ou composições apenas salvas com desempenho.
 *
 * Fontes aceitas nesta camada:
 * - team_synergies: label supervisionado (wins / matches) por trio e temporada;
 * - hero_synergies: evidência observada secundária por pares;
 * - hero_metrics: evidência observada secundária por herói.
 *
 * analytics_events e team_compositions NÃO são labels de performance.
 *
 * O modelo supervisionado é uma regressão logística regularizada e
 * determinística. Não usa aleatoriedade, não hardcoda heróis e só influencia
 * recomendações quando há amostra mínima e validação temporal aceitável.
 */

import {
  buildHeroProfile,
  evaluateComposition
} from './composition-synergy-engine-v2.js?v=20260821-synergy-2';

const MIN_TRAIN_TRIOS = 12;
const MIN_TOTAL_MATCHES = 120;
const MIN_TRAIN_MATCHES = 80;
const MIN_VALIDATION_ROWS = 3;
const MAX_MODEL_INFLUENCE = 0.35;
const MAX_TOTAL_INFLUENCE = 0.55;
const PRIOR_MATCHES = 24;
const EPSILON = 1e-9;

const CAPABILITY_FEATURES = [
  'team_sustain', 'protection', 'control', 'damage_amp', 'tempo_buff',
  'armor_pressure', 'recon', 'burst', 'engage', 'mobility_team',
  'ranged_pressure', 'team_utility'
];

const INTERACTION_FEATURES = [
  ['control', 'burst'],
  ['armor_pressure', 'burst'],
  ['damage_amp', 'burst'],
  ['tempo_buff', 'burst'],
  ['team_sustain', 'engage'],
  ['protection', 'engage'],
  ['mobility_team', 'engage'],
  ['recon', 'ranged_pressure'],
  ['control', 'damage_amp']
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function sigmoid(value) {
  const safe = clamp(value, -30, 30);
  return 1 / (1 + Math.exp(-safe));
}

function canonicalTeamKey(ids = []) {
  return ids.filter(Boolean).map(String).sort().join('|');
}

function canonicalPairKey(first, second) {
  return [first, second].filter(Boolean).map(String).sort().join('|');
}

function validRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number > 1 && number <= 100) return number / 100;
  if (number >= 0 && number <= 1) return number;
  return null;
}

function rowWinRate(row) {
  const matches = Math.max(0, Number(row?.matches) || 0);
  const wins = Math.max(0, Number(row?.wins) || 0);
  if (matches > 0 && wins <= matches) return wins / matches;
  return validRate(row?.win_rate);
}

function rowTimestamp(row) {
  const raw = row?.updated_at || row?.created_at || '';
  const value = Date.parse(raw);
  return Number.isFinite(value) ? value : 0;
}

function capabilityConfidence(profile, capabilityId) {
  const evidence = profile?.evidence?.get?.(capabilityId) || [];
  if (!evidence.length) return 0;
  return clamp(Math.max(...evidence.map(item => Number(item?.confidence) || 0)), 0, 1);
}

function teamProfiles(heroes) {
  return heroes.filter(Boolean).slice(0, 3).map(buildHeroProfile);
}

function teamCapabilitySet(profiles) {
  return new Set(profiles.flatMap(profile => [...profile.capabilities]));
}

function featureVector(heroes) {
  const team = heroes.filter(Boolean).slice(0, 3);
  if (team.length !== 3) return null;

  const base = evaluateComposition(team);
  if (base.score === null) return null;

  const profiles = teamProfiles(team);
  const capabilities = teamCapabilitySet(profiles);
  const values = [clamp(base.score / 100, 0, 1)];

  for (const capabilityId of CAPABILITY_FEATURES) {
    const confidences = profiles.map(profile => capabilityConfidence(profile, capabilityId));
    values.push(clamp(Math.max(...confidences, 0), 0, 1));
  }

  for (const [left, right] of INTERACTION_FEATURES) {
    const leftConfidence = Math.max(...profiles.map(profile => capabilityConfidence(profile, left)), 0);
    const rightConfidence = Math.max(...profiles.map(profile => capabilityConfidence(profile, right)), 0);
    values.push(clamp(Math.min(leftConfidence, rightConfidence), 0, 1));
  }

  const uniqueCapabilities = capabilities.size;
  values.push(clamp(uniqueCapabilities / CAPABILITY_FEATURES.length, 0, 1));
  values.push(clamp(new Set(team.map(hero => hero?.class_id).filter(Boolean)).size / 3, 0, 1));

  return {
    values,
    base,
    profiles,
    capabilities
  };
}

function makeTrainingRows(teamSynergies, heroesById) {
  const rows = [];
  for (const row of teamSynergies || []) {
    const heroIds = [row?.hero_1_id, row?.hero_2_id, row?.hero_3_id];
    const heroes = heroIds.map(id => heroesById.get(id)).filter(Boolean);
    const matches = Math.max(0, Number(row?.matches) || 0);
    const target = rowWinRate(row);
    if (heroes.length !== 3 || new Set(heroIds).size !== 3 || matches < 1 || target === null) continue;
    const features = featureVector(heroes);
    if (!features) continue;
    rows.push({
      key: canonicalTeamKey(heroIds),
      seasonId: row?.season_id || null,
      matches,
      wins: Math.max(0, Number(row?.wins) || Math.round(target * matches)),
      target,
      timestamp: rowTimestamp(row),
      features: features.values,
      source: row
    });
  }
  rows.sort((a, b) => a.timestamp - b.timestamp || a.key.localeCompare(b.key));
  return rows;
}

function chooseSeason(rows, seasons = []) {
  if (!rows.length) return { seasonId: null, rows: [] };

  const activeIds = new Set((seasons || []).filter(item => item?.active === true).map(item => item.id));
  const activeRows = rows.filter(row => activeIds.has(row.seasonId));
  if (activeRows.length) {
    const totals = new Map();
    for (const row of activeRows) totals.set(row.seasonId, (totals.get(row.seasonId) || 0) + row.matches);
    const seasonId = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    return { seasonId, rows: activeRows.filter(row => row.seasonId === seasonId) };
  }

  const latestBySeason = new Map();
  for (const row of rows) {
    const key = row.seasonId || '__no_season__';
    const current = latestBySeason.get(key) || 0;
    latestBySeason.set(key, Math.max(current, row.timestamp));
  }
  const latestKey = [...latestBySeason.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const seasonId = latestKey === '__no_season__' ? null : latestKey;
  return {
    seasonId,
    rows: rows.filter(row => (row.seasonId || null) === seasonId)
  };
}

function weightedGlobalRate(rows) {
  let wins = 0;
  let matches = 0;
  for (const row of rows) {
    wins += row.target * row.matches;
    matches += row.matches;
  }
  return matches > 0 ? clamp(wins / matches, 0.05, 0.95) : 0.5;
}

function brierScore(rows, predictor) {
  if (!rows.length) return null;
  let weighted = 0;
  let totalWeight = 0;
  for (const row of rows) {
    const predicted = clamp(predictor(row.features), 0.001, 0.999);
    const weight = Math.max(1, Math.sqrt(row.matches));
    weighted += weight * Math.pow(predicted - row.target, 2);
    totalWeight += weight;
  }
  return totalWeight > 0 ? weighted / totalWeight : null;
}

function trainLogistic(rows, featureCount, epochs = 140) {
  const weights = Array(featureCount + 1).fill(0);
  const learningRate = 0.055;
  const l2 = 0.025;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradient = Array(weights.length).fill(0);
    let totalWeight = 0;

    for (const row of rows) {
      const sampleWeight = Math.min(12, Math.max(1, Math.sqrt(row.matches)));
      let linear = weights[0];
      for (let index = 0; index < featureCount; index += 1) linear += weights[index + 1] * row.features[index];
      const error = sigmoid(linear) - row.target;
      gradient[0] += error * sampleWeight;
      for (let index = 0; index < featureCount; index += 1) gradient[index + 1] += error * row.features[index] * sampleWeight;
      totalWeight += sampleWeight;
    }

    if (!totalWeight) break;
    weights[0] -= learningRate * gradient[0] / totalWeight;
    for (let index = 1; index < weights.length; index += 1) {
      const regularized = gradient[index] / totalWeight + l2 * weights[index];
      weights[index] = clamp(weights[index] - learningRate * regularized, -4, 4);
    }
  }

  return weights;
}

function predictWithWeights(weights, features) {
  if (!weights?.length || !features?.length) return null;
  let linear = weights[0];
  for (let index = 0; index < features.length; index += 1) linear += (weights[index + 1] || 0) * features[index];
  return sigmoid(linear);
}

function readiness(rows, trainRows, validationRows, modelBrier, baselineBrier) {
  const totalMatches = rows.reduce((sum, row) => sum + row.matches, 0);
  const trainMatches = trainRows.reduce((sum, row) => sum + row.matches, 0);
  const distinctTeams = new Set(rows.map(row => row.key)).size;

  if (!rows.length) return { mode: 'cold-start', influence: 0, totalMatches, distinctTeams, reason: 'Nenhum trio observado ainda.' };
  if (distinctTeams < MIN_TRAIN_TRIOS || totalMatches < MIN_TOTAL_MATCHES || trainMatches < MIN_TRAIN_MATCHES) {
    return { mode: 'observing', influence: 0, totalMatches, distinctTeams, reason: 'Histórico ainda pequeno para influenciar a nota.' };
  }
  if (validationRows.length < MIN_VALIDATION_ROWS || modelBrier === null || baselineBrier === null) {
    return { mode: 'observing', influence: 0, totalMatches, distinctTeams, reason: 'Falta uma janela de validação suficiente.' };
  }
  if (modelBrier > baselineBrier * 1.02) {
    return { mode: 'rejected', influence: 0, totalMatches, distinctTeams, reason: 'O modelo não superou a baseline na validação mais recente.' };
  }

  const dataConfidence = clamp((distinctTeams / 40) * 0.5 + (totalMatches / 1000) * 0.5, 0, 1);
  const validationGain = baselineBrier > EPSILON ? clamp((baselineBrier - modelBrier) / baselineBrier, 0, 0.5) : 0;
  const validationFactor = 0.7 + validationGain * 0.6;
  const influence = clamp(MAX_MODEL_INFLUENCE * dataConfidence * validationFactor, 0.05, MAX_MODEL_INFLUENCE);
  return { mode: 'trained', influence, totalMatches, distinctTeams, reason: 'Modelo validado no histórico mais recente.' };
}

export function trainAdaptiveCompositionModel({ teamSynergies = [], heroesById = new Map(), seasons = [] } = {}) {
  const allRows = makeTrainingRows(teamSynergies, heroesById);
  const selected = chooseSeason(allRows, seasons);
  const rows = selected.rows;
  const total = rows.length;
  const validationCount = total >= 6 ? Math.max(MIN_VALIDATION_ROWS, Math.floor(total * 0.2)) : 0;
  const splitIndex = validationCount ? Math.max(1, total - validationCount) : total;
  const trainRows = rows.slice(0, splitIndex);
  const validationRows = rows.slice(splitIndex);
  const globalRate = weightedGlobalRate(trainRows.length ? trainRows : rows);
  const featureCount = rows[0]?.features?.length || 0;
  const weights = featureCount && trainRows.length ? trainLogistic(trainRows, featureCount) : [];
  const predictor = features => predictWithWeights(weights, features) ?? globalRate;
  const modelBrier = validationRows.length ? brierScore(validationRows, predictor) : null;
  const baselineBrier = validationRows.length ? brierScore(validationRows, () => globalRate) : null;
  const state = readiness(rows, trainRows, validationRows, modelBrier, baselineBrier);

  return {
    ...state,
    seasonId: selected.seasonId,
    weights,
    globalRate,
    modelBrier,
    baselineBrier,
    trainingRows: trainRows.length,
    validationRows: validationRows.length,
    featureCount,
    predict(heroes) {
      const features = featureVector(heroes);
      if (!features || state.mode !== 'trained') return null;
      return clamp(predictor(features.values), 0.05, 0.95);
    }
  };
}

function shrinkRate(rate, matches, priorRate, priorMatches = PRIOR_MATCHES) {
  if (rate === null || !Number.isFinite(matches) || matches <= 0) return null;
  return clamp((rate * matches + priorRate * priorMatches) / (matches + priorMatches), 0.02, 0.98);
}

function confidenceFromMatches(matches, scale = 35) {
  return clamp(1 - Math.exp(-Math.max(0, Number(matches) || 0) / scale), 0, 1);
}

function directTeamObservation(heroes, teamSynergies, seasonId, priorRate) {
  const key = canonicalTeamKey(heroes.map(hero => hero.id));
  const rows = (teamSynergies || []).filter(row => {
    if ((row?.season_id || null) !== (seasonId || null)) return false;
    return canonicalTeamKey([row?.hero_1_id, row?.hero_2_id, row?.hero_3_id]) === key;
  });
  if (!rows.length) return null;
  const matches = rows.reduce((sum, row) => sum + Math.max(0, Number(row?.matches) || 0), 0);
  const wins = rows.reduce((sum, row) => {
    const rowMatches = Math.max(0, Number(row?.matches) || 0);
    const rate = rowWinRate(row);
    return sum + (rate === null ? 0 : rate * rowMatches);
  }, 0);
  if (!matches) return null;
  const rawRate = clamp(wins / matches, 0, 1);
  return {
    matches,
    rawRate,
    adjustedRate: shrinkRate(rawRate, matches, priorRate),
    confidence: confidenceFromMatches(matches, 28)
  };
}

function pairObservation(heroes, heroSynergies, seasonId, priorRate) {
  const ids = heroes.map(hero => hero.id);
  const pairKeys = [canonicalPairKey(ids[0], ids[1]), canonicalPairKey(ids[0], ids[2]), canonicalPairKey(ids[1], ids[2])];
  const rowsByPair = new Map();
  for (const row of heroSynergies || []) {
    if ((row?.season_id || null) !== (seasonId || null)) continue;
    const key = canonicalPairKey(row?.hero_a_id, row?.hero_b_id);
    if (!pairKeys.includes(key)) continue;
    rowsByPair.set(key, row);
  }
  if (!rowsByPair.size) return null;

  let weightedRate = 0;
  let weight = 0;
  let totalMatches = 0;
  for (const key of pairKeys) {
    const row = rowsByPair.get(key);
    if (!row) continue;
    const matches = Math.max(0, Number(row?.matches) || 0);
    const rate = rowWinRate(row);
    if (!matches || rate === null) continue;
    const adjusted = shrinkRate(rate, matches, priorRate);
    const rowWeight = Math.sqrt(matches);
    weightedRate += adjusted * rowWeight;
    weight += rowWeight;
    totalMatches += matches;
  }
  if (!weight) return null;
  return {
    adjustedRate: clamp(weightedRate / weight, 0.02, 0.98),
    matches: totalMatches,
    pairs: rowsByPair.size,
    confidence: confidenceFromMatches(totalMatches, 70) * clamp(rowsByPair.size / 3, 0, 1)
  };
}

function heroObservation(heroes, heroMetrics, seasonId, priorRate) {
  const ids = new Set(heroes.map(hero => hero.id));
  const rows = (heroMetrics || []).filter(row => ids.has(row?.hero_id) && (row?.season_id || null) === (seasonId || null));
  if (!rows.length) return null;
  let weightedRate = 0;
  let weight = 0;
  let totalMatches = 0;
  for (const row of rows) {
    const matches = Math.max(0, Number(row?.matches) || 0);
    const rate = rowWinRate(row);
    if (!matches || rate === null) continue;
    const adjusted = shrinkRate(rate, matches, priorRate, 40);
    const rowWeight = Math.sqrt(matches);
    weightedRate += adjusted * rowWeight;
    weight += rowWeight;
    totalMatches += matches;
  }
  if (!weight) return null;
  return {
    adjustedRate: clamp(weightedRate / weight, 0.02, 0.98),
    matches: totalMatches,
    heroes: rows.length,
    confidence: confidenceFromMatches(totalMatches, 120) * clamp(rows.length / 3, 0, 1)
  };
}

function combineHistoricalSignals({ modelRate, modelInfluence, direct, pair, hero }) {
  const signals = [];
  if (modelRate !== null && modelInfluence > 0) signals.push({ rate: modelRate, weight: modelInfluence, type: 'model' });
  if (direct?.adjustedRate != null) signals.push({ rate: direct.adjustedRate, weight: direct.confidence * 0.26, type: 'direct' });
  if (pair?.adjustedRate != null) signals.push({ rate: pair.adjustedRate, weight: pair.confidence * 0.14, type: 'pair' });
  if (hero?.adjustedRate != null) signals.push({ rate: hero.adjustedRate, weight: hero.confidence * 0.08, type: 'hero' });
  const totalWeight = signals.reduce((sum, item) => sum + item.weight, 0);
  if (!signals.length || totalWeight <= EPSILON) return { rate: null, influence: 0, signals: [] };
  const rate = signals.reduce((sum, item) => sum + item.rate * item.weight, 0) / totalWeight;
  return {
    rate: clamp(rate, 0.02, 0.98),
    influence: clamp(totalWeight, 0, MAX_TOTAL_INFLUENCE),
    signals
  };
}

export function evaluateAdaptiveComposition({
  heroes = [],
  baseEvaluation = null,
  model = null,
  teamSynergies = [],
  heroSynergies = [],
  heroMetrics = []
} = {}) {
  const team = heroes.filter(Boolean).slice(0, 3);
  const base = baseEvaluation || evaluateComposition(team);
  if (team.length !== 3 || base?.score === null) {
    return {
      mode: model?.mode || 'cold-start',
      baselineScore: base?.score ?? null,
      adaptiveScore: base?.score ?? null,
      learnedScore: null,
      influence: 0,
      adjustment: 0,
      confidence: 0,
      model
    };
  }

  const priorRate = Number.isFinite(model?.globalRate) ? model.globalRate : 0.5;
  const seasonId = model?.seasonId ?? null;
  const modelRate = model?.mode === 'trained' ? model.predict(team) : null;
  const direct = directTeamObservation(team, teamSynergies, seasonId, priorRate);
  const pair = pairObservation(team, heroSynergies, seasonId, priorRate);
  const hero = heroObservation(team, heroMetrics, seasonId, priorRate);
  const combined = combineHistoricalSignals({
    modelRate,
    modelInfluence: Number(model?.influence) || 0,
    direct,
    pair,
    hero
  });

  if (combined.rate === null || combined.influence <= 0) {
    return {
      mode: model?.mode || 'cold-start',
      baselineScore: Number(base.score),
      adaptiveScore: Number(base.score),
      learnedScore: null,
      influence: 0,
      adjustment: 0,
      confidence: 0,
      direct,
      pair,
      hero,
      model
    };
  }

  const learnedScore = combined.rate * 100;
  const adaptiveScore = Math.round(
    Number(base.score) * (1 - combined.influence) + learnedScore * combined.influence
  );
  const adjustment = adaptiveScore - Number(base.score);

  return {
    mode: model?.mode || 'observing',
    baselineScore: Number(base.score),
    adaptiveScore: clamp(adaptiveScore, 0, 100),
    learnedScore: Math.round(learnedScore),
    influence: combined.influence,
    adjustment,
    confidence: combined.influence / MAX_TOTAL_INFLUENCE,
    direct,
    pair,
    hero,
    model,
    signals: combined.signals
  };
}

export function learningStatusCopy(adaptive) {
  const model = adaptive?.model;
  if (!model || model.mode === 'cold-start') {
    return {
      label: 'Aprendizado em cold start',
      detail: 'Ainda não há resultados de composições para treinar o modelo.',
      tone: 'idle'
    };
  }
  if (model.mode === 'observing') {
    return {
      label: 'Aprendizado observando',
      detail: `${model.distinctTeams || 0} trio(s) · ${(model.totalMatches || 0).toLocaleString('pt-BR')} partida(s) · 0% de influência até atingir amostra segura.`,
      tone: 'idle'
    };
  }
  if (model.mode === 'rejected') {
    return {
      label: 'Aprendizado suspenso',
      detail: 'O modelo não superou a baseline na validação recente e não influencia a nota.',
      tone: 'warn'
    };
  }
  const percent = Math.round((adaptive?.influence || model.influence || 0) * 100);
  return {
    label: 'Aprendizado ativo',
    detail: `${model.distinctTeams || 0} trio(s) · ${(model.totalMatches || 0).toLocaleString('pt-BR')} partida(s) · até ${percent}% de influência nesta leitura.`,
    tone: 'active'
  };
}

export function learnedInsight(adaptive) {
  if (!adaptive || adaptive.influence <= 0 || adaptive.learnedScore === null) return null;
  if (adaptive.adjustment >= 3) {
    return {
      type: 'strength',
      title: 'Histórico favorece este perfil',
      detail: `Padrões observados em outras composições elevam a leitura em ${adaptive.adjustment} ponto(s).`
    };
  }
  if (adaptive.adjustment <= -3) {
    return {
      type: 'weakness',
      title: 'Histórico pede cautela',
      detail: `Padrões observados em outras composições reduzem a leitura em ${Math.abs(adaptive.adjustment)} ponto(s).`
    };
  }
  return {
    type: 'neutral',
    title: 'Histórico confirma a leitura',
    detail: 'Os padrões observados ficam próximos do que as habilidades já indicam.'
  };
}

export function rankAdaptiveCandidates(candidates, context = {}) {
  return (candidates || []).map(candidate => {
    const adaptive = evaluateAdaptiveComposition({
      heroes: candidate.heroes,
      baseEvaluation: candidate,
      ...context
    });
    return {
      ...candidate,
      adaptive,
      rankingScore: adaptive.adaptiveScore ?? candidate.score ?? 0
    };
  }).sort((a, b) =>
    Number(b.rankingScore || 0) - Number(a.rankingScore || 0) ||
    canonicalTeamKey(a.heroes.map(hero => hero.id)).localeCompare(canonicalTeamKey(b.heroes.map(hero => hero.id)))
  );
}

export const COMPOSITION_LEARNING_LIMITS = Object.freeze({
  minTrainTrios: MIN_TRAIN_TRIOS,
  minTotalMatches: MIN_TOTAL_MATCHES,
  minTrainMatches: MIN_TRAIN_MATCHES,
  maxModelInfluence: MAX_MODEL_INFLUENCE,
  maxTotalInfluence: MAX_TOTAL_INFLUENCE
});
