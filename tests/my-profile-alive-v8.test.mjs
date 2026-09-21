import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IDENTITY_SIMULATION_LIMIT,
  projectedIdentityPoints,
  showroomPreviewState
} from '../js/my-profile-alive-v8.js';

const serverPolicy = {
  corroborated_points: 4,
  verified_points: 10,
  first_discovery_bonus: 15
};

test('simulador vivo calcula somente com pesos recebidos do servidor', () => {
  assert.deepEqual(projectedIdentityPoints({ corroborated: 1, verified: 1, first: 1 }, serverPolicy), {
    corroborated: 1,
    verified: 1,
    first: 1,
    corroboratedPoints: 4,
    verifiedPoints: 10,
    firstPoints: 25,
    total: 39,
    weights: {
      corroborated: 4,
      verified: 10,
      firstBonus: 15,
      firstTotal: 25
    }
  });
});

test('simulador falha fechado sem política ou com contagens manipuladas', () => {
  assert.equal(projectedIdentityPoints({ corroborated: 1, verified: 1, first: 1 }, null), null);
  assert.equal(projectedIdentityPoints({ corroborated: -1, verified: 1, first: 1 }, serverPolicy), null);
  assert.equal(projectedIdentityPoints({ corroborated: 1.5, verified: 1, first: 1 }, serverPolicy), null);
  assert.equal(projectedIdentityPoints({ corroborated: IDENTITY_SIMULATION_LIMIT + 1, verified: 1, first: 1 }, serverPolicy), null);
});

test('primeira descoberta não soma a verificação duas vezes', () => {
  const result = projectedIdentityPoints({ corroborated: 0, verified: 0, first: 2 }, serverPolicy);
  assert.equal(result.firstPoints, 50);
  assert.equal(result.total, 50);
});

test('showroom diferencia nível real de uma prévia bloqueada', () => {
  assert.deepEqual(showroomPreviewState('tracker', 'tracker'), {
    tier: 'tracker',
    label: 'Rastreador',
    glyph: '◎',
    state: 'current',
    status: 'SEU NÍVEL ATUAL'
  });
  assert.deepEqual(showroomPreviewState('tracker', 'arena_legend'), {
    tier: 'arena_legend',
    label: 'Lenda da Arena',
    glyph: '★',
    state: 'locked',
    status: 'PRÉVIA BLOQUEADA'
  });
  assert.equal(showroomPreviewState('tracker', 'admin'), null);
});
