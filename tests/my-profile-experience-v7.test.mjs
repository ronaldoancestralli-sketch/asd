import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMUNITY_TIER_GLYPHS,
  COMMUNITY_TIER_ORDER,
  communityTierState,
  missionProgress,
  pointPreviewValues,
  tierRequirementParts
} from '../js/my-profile-experience-v7.js';

test('prévia de pontos deriva o total da política do servidor', () => {
  assert.deepEqual(pointPreviewValues({
    corroborated_points: 4,
    verified_points: 10,
    first_discovery_bonus: 15
  }), {
    corroborated: 4,
    verified: 10,
    firstBonus: 15,
    firstTotal: 25
  });
});

test('prévia falha fechada quando a política não traz números válidos', () => {
  assert.equal(pointPreviewValues(null), null);
  assert.equal(pointPreviewValues({ corroborated_points: 4, verified_points: 'x', first_discovery_bonus: 15 }), null);
  assert.equal(pointPreviewValues({ corroborated_points: -1, verified_points: 10, first_discovery_bonus: 15 }), null);
});

test('coleção distingue insígnias conquistadas, atual e bloqueadas', () => {
  assert.equal(COMMUNITY_TIER_ORDER.length, 7);
  assert.equal(communityTierState('cartographer', 'echo_scout'), 'reached');
  assert.equal(communityTierState('cartographer', 'cartographer'), 'current');
  assert.equal(communityTierState('cartographer', 'analyst'), 'locked');
  assert.equal(communityTierState('unknown', 'member'), 'unknown');
  assert.equal(COMMUNITY_TIER_GLYPHS.arena_legend, '★');
});

test('requisitos da insígnia usam somente thresholds recebidos', () => {
  assert.deepEqual(tierRequirementParts({
    min_points: 8000,
    min_verified: 400,
    min_first_discoveries: 10,
    min_acceptance_rate: 0.85
  }), ['8.000 pts', '400 verificadas', '10 descobertas', '85% aceitação']);
  assert.deepEqual(tierRequirementParts({ min_points: 'inválido' }), []);
});

test('missão informa progresso sem conceder reputação paralela', () => {
  assert.deepEqual(missionProgress(2, 5, false), {
    current: 2,
    target: 5,
    value: 2,
    percent: 40,
    state: 'active',
    isComplete: false
  });
  assert.equal(missionProgress(5, 5, false).isComplete, false);
  assert.equal(missionProgress(5, 5, true).isComplete, true);
  assert.equal(missionProgress(8, 5, true).value, 5);
  assert.equal(missionProgress(1, 0, false), null);
});
