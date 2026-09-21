import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PUBLIC_SCORING_LIMITS,
  effectiveTeamInfluenceV4,
  learningPreflightV4,
  normalizePublicScoringPayload,
  readJsonBodyLimited,
  resolveLearningInfluenceV4,
  teamVerificationInfluenceFactorV4,
  validateModelSpecV4
} from '../supabase/functions/_shared/echo-brain-public-policy-v4.ts';

const U = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000006'
];

const uuidFor = (group, index) => `00000000-0000-4000-${String(8000 + group).padStart(4, '0')}-${String(index + 1).padStart(12, '0')}`;
const features = ['a', 'b', 'c'];
const model = (overrides = {}) => ({
  id: 'model-v4',
  status: 'active',
  passed_validation: true,
  feature_schema_version: 'composition-semantic-context-v4',
  influence_weight: .40,
  weights: { featureNames: features, coefficients: [.1, -.2, .3], intercept: .05 },
  ...overrides
});

const settings = (overrides = {}) => ({
  emergency_enabled: false,
  learning_enabled: true,
  active_model_id: 'model-v4',
  max_influence: .35,
  ...overrides
});

const freshDebt = { fresh: true, pending: 0, unknown: false };

test('payload público aceita apenas lote UUID explícito dentro do limite', () => {
  const ok = normalizePublicScoringPayload({
    teams: [{ requestId: 'r1', heroIds: U.slice(0, 3) }],
    compareTo: { heroIds: U.slice(3, 6) }
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.teams[0], { requestId: 'r1', heroIds: U.slice(0, 3) });
  assert.deepEqual(ok.compareTo, { heroIds: U.slice(3, 6) });

  const tooMany = normalizePublicScoringPayload({
    teams: Array.from({ length: PUBLIC_SCORING_LIMITS.maxTeams + 1 }, (_, index) => ({
      requestId: `r${index}`,
      heroIds: [uuidFor(index, 0), uuidFor(index, 1), uuidFor(index, 2)]
    }))
  });
  assert.deepEqual(tooMany, { ok: false, error: 'too_many_teams' });
});

test('payload rejeita trio duplicado, id não UUID, requestId duplicado e compare inválido', () => {
  assert.equal(normalizePublicScoringPayload({ teams: [{ heroIds: [U[0], U[0], U[1]] }] }).error, 'each_team_requires_three_unique_uuid_heroes');
  assert.equal(normalizePublicScoringPayload({ teams: [{ heroIds: [U[0], 'not-a-uuid', U[2]] }] }).error, 'each_team_requires_three_unique_uuid_heroes');
  assert.equal(normalizePublicScoringPayload({ teams: [
    { requestId: 'same', heroIds: U.slice(0, 3) },
    { requestId: 'same', heroIds: U.slice(3, 6) }
  ] }).error, 'duplicate_request_id');
  assert.equal(normalizePublicScoringPayload({
    teams: [{ heroIds: U.slice(0, 3) }],
    compareTo: { heroIds: [U[0], U[0], U[2]] }
  }).error, 'compare_team_requires_three_unique_uuid_heroes');
});

test('leitura HTTP é limitada por bytes antes de JSON virar payload do scorer', async () => {
  const small = new Request('https://example.test/score', {
    method: 'POST',
    body: JSON.stringify({ teams: [{ heroIds: U.slice(0, 3) }] }),
    headers: { 'content-type': 'application/json' }
  });
  const parsed = await readJsonBodyLimited(small, 512);
  assert.equal(parsed.ok, true);

  const oversized = new Request('https://example.test/score', {
    method: 'POST',
    body: JSON.stringify({ value: 'x'.repeat(1024) }),
    headers: { 'content-type': 'application/json' }
  });
  const blocked = await readJsonBodyLimited(oversized, 128);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'payload_too_large');
  assert.equal(blocked.status, 413);
});

test('modelo v4 exige nomes, tamanhos e todos os pesos finitos', () => {
  const valid = validateModelSpecV4(model(), 'composition-semantic-context-v4', features);
  assert.deepEqual(valid, { schema: 'composition-semantic-context-v4', weights: [.05, .1, -.2, .3] });
  assert.equal(validateModelSpecV4(model({ weights: { featureNames: features, coefficients: [.1, NaN, .3], intercept: .05 } }), 'composition-semantic-context-v4', features), null);
  assert.equal(validateModelSpecV4(model({ weights: { featureNames: ['x', 'b', 'c'], coefficients: [.1, -.2, .3], intercept: .05 } }), 'composition-semantic-context-v4', features), null);
  assert.equal(validateModelSpecV4(model({ feature_schema_version: 'composition-semantic-context-v3' }), 'composition-semantic-context-v4', features), null);
});

test('preflight bloqueia aprendizado em settings ausentes, emergência, dívida, runtime off e configuração inválida', () => {
  assert.equal(learningPreflightV4(null, freshDebt).reason, 'settings_unavailable');
  assert.equal(learningPreflightV4(settings({ emergency_enabled: true }), freshDebt).reason, 'emergency');
  assert.equal(learningPreflightV4(settings(), { fresh: false, pending: 1 }).reason, 'knowledge_or_patch_debt');
  assert.equal(learningPreflightV4(settings({ learning_enabled: false }), freshDebt).reason, 'learning_disabled');
  assert.equal(learningPreflightV4(settings({ active_model_id: null }), freshDebt).reason, 'active_model_not_configured');
  assert.equal(learningPreflightV4(settings({ max_influence: 'oops' }), freshDebt).reason, 'invalid_influence_config');
  assert.equal(learningPreflightV4(settings({ max_influence: 0 }), freshDebt).reason, 'learning_influence_zero');
  assert.equal(learningPreflightV4(settings(), freshDebt).loadModel, true);
});

test('resolução exige exatamente o modelo configurado e validado', () => {
  const preflight = learningPreflightV4(settings(), freshDebt);
  const spec = validateModelSpecV4(model(), 'composition-semantic-context-v4', features);
  assert.deepEqual(resolveLearningInfluenceV4({ preflight, model: model(), spec }), { influence: .35, reason: null });
  assert.equal(resolveLearningInfluenceV4({ preflight, model: null, spec: null }).reason, 'active_model_unavailable');
  assert.equal(resolveLearningInfluenceV4({ preflight, model: model({ id: 'other' }), spec }).reason, 'active_model_mismatch');
  assert.equal(resolveLearningInfluenceV4({ preflight, model: model({ passed_validation: false }), spec }).reason, 'no_validated_active_model');
  assert.equal(resolveLearningInfluenceV4({ preflight, model: model(), spec: null }).reason, 'semantic_v4_active_model_required');
  assert.equal(resolveLearningInfluenceV4({ preflight, model: null, spec: null, modelLoadError: new Error('db') }).reason, 'active_model_unavailable');
});

test('influência global nunca ultrapassa 55%', () => {
  const preflight = learningPreflightV4(settings({ max_influence: .99 }), freshDebt);
  const highModel = model({ influence_weight: .80 });
  const spec = validateModelSpecV4(highModel, 'composition-semantic-context-v4', features);
  const resolved = resolveLearningInfluenceV4({ preflight, model: highModel, spec });
  assert.equal(resolved.influence, .55);
});

test('cobertura verificada reduz influência por trio de forma monotônica e conservadora', () => {
  assert.equal(teamVerificationInfluenceFactorV4(.50), 0);
  assert.equal(teamVerificationInfluenceFactorV4(.75), .5);
  assert.equal(teamVerificationInfluenceFactorV4(1), 1);
  assert.deepEqual(effectiveTeamInfluenceV4(.40, .50), { factor: 0, influence: 0 });
  assert.deepEqual(effectiveTeamInfluenceV4(.40, .75), { factor: .5, influence: .2 });
  assert.deepEqual(effectiveTeamInfluenceV4(.40, 1), { factor: 1, influence: .4 });
});
