export const COMMUNITY_TIER_ORDER = Object.freeze([
  'member',
  'echo_scout',
  'tracker',
  'cartographer',
  'analyst',
  'vanguard',
  'arena_legend'
]);

export const COMMUNITY_TIER_GLYPHS = Object.freeze({
  member: '•',
  echo_scout: '⌁',
  tracker: '◎',
  cartographer: '✦',
  analyst: '◇',
  vanguard: '◆',
  arena_legend: '★'
});

function nonNegativeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function pointPreviewValues(policy) {
  if (!policy || typeof policy !== 'object') return null;
  const corroborated = nonNegativeNumber(policy.corroborated_points);
  const verified = nonNegativeNumber(policy.verified_points);
  const firstBonus = nonNegativeNumber(policy.first_discovery_bonus);
  if ([corroborated, verified, firstBonus].some((value) => value === null)) return null;
  return Object.freeze({
    corroborated,
    verified,
    firstBonus,
    firstTotal: verified + firstBonus
  });
}

export function communityTierState(currentTier, candidateTier) {
  const currentIndex = COMMUNITY_TIER_ORDER.indexOf(String(currentTier || ''));
  const candidateIndex = COMMUNITY_TIER_ORDER.indexOf(String(candidateTier || ''));
  if (currentIndex < 0 || candidateIndex < 0) return 'unknown';
  if (candidateIndex === currentIndex) return 'current';
  return candidateIndex < currentIndex ? 'reached' : 'locked';
}

export function tierRequirementParts(rule) {
  if (!rule || typeof rule !== 'object') return [];
  const points = nonNegativeNumber(rule.min_points);
  const verified = nonNegativeNumber(rule.min_verified);
  const discoveries = nonNegativeNumber(rule.min_first_discoveries);
  const acceptance = nonNegativeNumber(rule.min_acceptance_rate);
  if ([points, verified, discoveries, acceptance].some((value) => value === null)) return [];

  const parts = [];
  if (points > 0) parts.push(`${points.toLocaleString('pt-BR')} pts`);
  if (verified > 0) parts.push(`${verified.toLocaleString('pt-BR')} verificadas`);
  if (discoveries > 0) parts.push(`${discoveries.toLocaleString('pt-BR')} descobertas`);
  if (acceptance > 0) parts.push(`${Math.round(acceptance * 100)}% aceitação`);
  return parts;
}

export function missionProgress(currentValue, targetValue, completed = false) {
  const current = nonNegativeNumber(currentValue);
  const target = nonNegativeNumber(targetValue);
  if (current === null || target === null || !Number.isInteger(current) || !Number.isInteger(target) || target < 1) return null;
  const value = Math.min(current, target);
  const isComplete = completed === true && current >= target;
  return Object.freeze({
    current,
    target,
    value,
    percent: Math.min(100, Math.round((value / target) * 100)),
    state: isComplete ? 'complete' : 'active',
    isComplete
  });
}
