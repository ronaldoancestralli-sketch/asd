import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  EQUIPMENT_EFFECT_CAPABILITIES_V1,
  EQUIPMENT_EFFECT_CONTRACT_VERSION,
  EQUIPMENT_EFFECT_NUMERIC_AUTHORITY,
  LEGACY_BONUS_STAT_TRANSITION_V1,
  assessEquipmentEffectExecutionV1,
  inspectLegacyBonusTransitionV1,
  normalizeEquipmentEffectDocumentV1,
  readEquipmentEffectDocument,
  serializeEquipmentEffectDocumentV1,
  summarizeEquipmentEffectDocument,
  validateEquipmentEffectDocumentV1
} from '../contracts/equipment-effect-contract-v1.js';

const fixtures = JSON.parse(fs.readFileSync(
  new URL('./fixtures/equipment-effect-contract-v1.json', import.meta.url),
  'utf8'
));

const copy = value => structuredClone(value);
const codes = result => result.errors.map(error => error.code);

test('contrato v1 nasce com autoridade numérica fechada e registro somente descritivo', () => {
  assert.equal(EQUIPMENT_EFFECT_CONTRACT_VERSION, 'echo-equipment-effects/v1');
  assert.deepEqual(EQUIPMENT_EFFECT_NUMERIC_AUTHORITY, {
    enabled: false,
    phase: '2B',
    reason: 'numeric_authority_requires_phase_2c_and_phase_3_gates'
  });
  assert.equal(EQUIPMENT_EFFECT_CAPABILITIES_V1.armor_regeneration_rate.dimension,
    'rate.armor_regeneration');
  assert.equal(EQUIPMENT_EFFECT_CAPABILITIES_V1.armor_capacity.dimension,
    'capacity.armor');
  assert.equal(EQUIPMENT_EFFECT_CAPABILITIES_V1.fire_interval.dimension,
    'duration.between_shots');
  assert.equal(EQUIPMENT_EFFECT_CAPABILITIES_V1.shots_per_second.dimension,
    'rate.weapon_fire');
  assert.equal(Object.isFrozen(EQUIPMENT_EFFECT_CAPABILITIES_V1), true);
});

test('capacidade e recuperação por segundo permanecem grandezas distintas', () => {
  const result = validateEquipmentEffectDocumentV1(fixtures.valid_distinct_dimensions);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.document.effects.map(effect => [
    effect.target,
    effect.operation,
    effect.unit
  ]), [
    ['armor_regeneration_rate', 'add', 'armor_point_per_second'],
    ['armor_capacity', 'relative_percent', 'percent']
  ]);
});

test('cura de Bandagem e poder de perfuração mantêm habilidade, alvo e condição', () => {
  const result = validateEquipmentEffectDocumentV1(fixtures.valid_conditional_ability_effects);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  const [heal, penetration] = result.document.effects;
  assert.equal(heal.target, 'ability_heal_amount');
  assert.equal(heal.condition.ability_id, 'ability:bandage');
  assert.ok(heal.scope.ability_ids.includes('ability:bandage'));
  assert.notEqual(heal.target, 'health_capacity');
  assert.equal(penetration.target, 'penetration_power');
  assert.equal(penetration.condition.ability_id, 'ability:thermal-vision');
  assert.notEqual(penetration.target, 'armor_penetration');
});

test('escopo do efeito da Lince é mais estreito que a origem de conjunto', () => {
  const result = validateEquipmentEffectDocumentV1(fixtures.valid_lynx_effect_scope);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  const effect = result.document.effects[0];
  assert.equal(effect.origin.kind, 'set_bonus');
  assert.equal(effect.origin.required_pieces, 6);
  assert.deepEqual(effect.scope.hero_ids, ['hero:lynx']);
  assert.deepEqual(effect.scope.class_ids, []);
});

test('valor -10 sem unidade fica pendente e não ganha percentual por texto', () => {
  const read = readEquipmentEffectDocument(fixtures.pending_ambiguous_aim_time);
  assert.equal(read.status, 'pending');
  assert.equal(read.errors.length, 0);
  assert.equal(read.document.effects[0].operation, null);
  assert.equal(read.document.effects[0].unit, null);
  assert.equal(read.document.effects[0].value, -10);
  const readiness = assessEquipmentEffectExecutionV1(read.document.effects[0], {
    base_values: { aim_duration: 1 }
  });
  assert.equal(readiness.execution_eligible, false);
  assert.ok(readiness.reasons.includes('support_pending'));
  assert.ok(readiness.reasons.includes(EQUIPMENT_EFFECT_NUMERIC_AUTHORITY.reason));
});

test('mecânica ainda não registrada conserva o alvo bruto como pendência', () => {
  const fixture = copy(fixtures.pending_ambiguous_aim_time);
  fixture.document_id = 'fixture:unknown-mechanic';
  fixture.effects[0].target = 'unmodeled_quantum';
  fixture.effects[0].support.reason_code = 'mechanic_not_modeled';
  const read = readEquipmentEffectDocument(fixture);
  assert.equal(read.status, 'pending');
  assert.equal(read.errors.length, 0);
  assert.ok(read.warnings.some(warning => warning.code === 'unknown_target'));
  assert.equal(read.document.effects[0].target, 'unmodeled_quantum');
  assert.equal(read.preserved.effects[0].original_text,
    fixture.effects[0].original_text);
});

test('duração desconhecida após evento impede prontidão permanente presumida', () => {
  const read = readEquipmentEffectDocument(fixtures.pending_unknown_duration);
  assert.equal(read.status, 'pending');
  assert.equal(read.errors.length, 0);
  const readiness = assessEquipmentEffectExecutionV1(read.document.effects[0], {
    base_values: { movement_noise: 100 },
    occurred_event_ids: ['event:bandage-used']
  });
  assert.equal(readiness.execution_eligible, false);
  assert.ok(readiness.reasons.includes('duration_unknown'));
  assert.ok(readiness.reasons.includes('support_pending'));
});

test('cenário ativo não abre o gate numérico da Fase 2B', () => {
  const effect = fixtures.valid_conditional_ability_effects.effects[1];
  const inactive = assessEquipmentEffectExecutionV1(effect, {
    base_values: { penetration_power: 4 },
    active_ability_ids: []
  });
  assert.ok(inactive.reasons.includes('condition_inactive'));

  const active = assessEquipmentEffectExecutionV1(effect, {
    base_values: { penetration_power: 4 },
    active_ability_ids: ['ability:thermal-vision']
  });
  assert.equal(active.contract_valid, true);
  assert.equal(active.declared_value_visible, true);
  assert.equal(active.relative_effect_visible, false);
  assert.equal(active.execution_eligible, false);
  assert.ok(active.reasons.includes(EQUIPMENT_EFFECT_NUMERIC_AUTHORITY.reason));
  assert.equal(active.reasons.includes('condition_inactive'), false);
});

test('bônus relativo conhecido continua visível quando falta a base, sem calcular total', () => {
  const effect = fixtures.valid_distinct_dimensions.effects[1];
  const readiness = assessEquipmentEffectExecutionV1(effect, { base_values: {} });
  assert.equal(readiness.contract_valid, true);
  assert.equal(readiness.declared_value_visible, true);
  assert.equal(readiness.relative_effect_visible, true);
  assert.equal(readiness.execution_eligible, false);
  assert.ok(readiness.reasons.includes('base_missing'));
  assert.ok(readiness.reasons.includes(EQUIPMENT_EFFECT_NUMERIC_AUTHORITY.reason));
});

test('normalizador não converte vírgula decimal nem aceita NaN ou infinito', () => {
  const fixture = copy(fixtures.invalid_numeric_string);
  const normalized = normalizeEquipmentEffectDocumentV1(fixture);
  assert.equal(normalized.effects[0].value, '3,5');
  let result = validateEquipmentEffectDocumentV1(normalized);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes('value_must_be_finite_number'));

  for (const invalidValue of [Number.NaN, Number.POSITIVE_INFINITY]) {
    fixture.effects[0].value = invalidValue;
    result = validateEquipmentEffectDocumentV1(fixture);
    assert.equal(result.valid, false);
    assert.ok(codes(result).includes('value_must_be_finite_number'));
  }
});

test('percentual relativo e pontos percentuais não são intercambiáveis', () => {
  const result = validateEquipmentEffectDocumentV1(fixtures.invalid_percentage_unit);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes('unit_incompatible_with_target_operation'));

  const fixed = copy(fixtures.invalid_percentage_unit);
  fixed.effects[0].operation = 'percentage_points';
  assert.equal(validateEquipmentEffectDocumentV1(fixed).valid, true);
});

test('shots_per_second não pode ser anexado a fire_interval como alias', () => {
  const result = validateEquipmentEffectDocumentV1(fixtures.invalid_shots_interval_alias);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes('unit_incompatible_with_target_operation'));
});

test('versão desconhecida é preservada integralmente e não sofre downgrade', () => {
  const input = copy(fixtures.future_version);
  const read = readEquipmentEffectDocument(input);
  assert.equal(read.status, 'unknown_version');
  assert.equal(read.document, null);
  assert.deepEqual(read.preserved, input);
  assert.equal(read.preserved.future_extension.must_survive, true);
  assert.equal(read.numeric_authority.enabled, false);
});

test('inventário de cinco efeitos com somente quatro não pode parecer completo', () => {
  const validation = validateEquipmentEffectDocumentV1(fixtures.partial_inventory);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  const summary = summarizeEquipmentEffectDocument(fixtures.partial_inventory);
  assert.deepEqual({
    expected: summary.expected,
    represented: summary.represented,
    supported: summary.supported,
    pending: summary.pending
  }, {
    expected: 5,
    represented: 4,
    supported: 4,
    pending: 0
  });
  assert.equal(summary.contract_complete, false);
  assert.equal(summary.numeric_complete, false);
});

test('contrato completo continua sem autoridade para calcular na Fase 2B', () => {
  const summary = summarizeEquipmentEffectDocument(fixtures.valid_distinct_dimensions);
  assert.equal(summary.contract_complete, true);
  assert.equal(summary.numeric_complete, false);
  assert.equal(summary.numeric_authority.enabled, false);
});

test('patamar incremental e total cumulativo sobrevivem como contratos distintos', () => {
  const incremental = copy(fixtures.valid_lynx_effect_scope);
  const cumulative = copy(fixtures.valid_lynx_effect_scope);
  cumulative.document_id = 'fixture:lynx-effect-scope-cumulative';
  cumulative.effects[0].stacking.tier_semantics = 'cumulative_total';
  assert.equal(validateEquipmentEffectDocumentV1(incremental).valid, true);
  assert.equal(validateEquipmentEffectDocumentV1(cumulative).valid, true);
  assert.notEqual(
    serializeEquipmentEffectDocumentV1(incremental),
    serializeEquipmentEffectDocumentV1(cumulative)
  );
});

test('cadastro não pode declarar que um efeito já foi aplicado', () => {
  const fixture = copy(fixtures.valid_lynx_effect_scope);
  fixture.effects[0].applied = true;
  const result = validateEquipmentEffectDocumentV1(fixture);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes('execution_result_forbidden_in_catalog'));
});

test('efeito suportado exige proveniência confirmada; incerteza vira pendência', () => {
  const invalid = copy(fixtures.valid_lynx_effect_scope);
  invalid.effects[0].provenance.verification_status = 'unverified';
  let result = validateEquipmentEffectDocumentV1(invalid);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes('supported_effect_requires_confirmed_source'));

  invalid.effects[0].support = {
    status: 'pending',
    reason_code: 'source_unverified',
    details: 'Aguardando fonte.'
  };
  result = validateEquipmentEffectDocumentV1(invalid);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(readEquipmentEffectDocument(invalid).status, 'pending');

  const missingDate = copy(fixtures.valid_lynx_effect_scope);
  missingDate.effects[0].provenance.verified_at = null;
  result = validateEquipmentEffectDocumentV1(missingDate);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes('supported_effect_requires_verification_date'));
});

test('datas impossíveis de proveniência são recusadas', () => {
  const fixture = copy(fixtures.valid_lynx_effect_scope);
  fixture.effects[0].provenance.verified_at = '2026-02-30';
  const result = validateEquipmentEffectDocumentV1(fixture);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes('invalid_verified_at'));
});

test('escopo global com seletor residual e bônus de conjunto sem semântica de patamar falham', () => {
  const scope = copy(fixtures.valid_lynx_effect_scope);
  scope.effects[0].scope.kind = 'global';
  let result = validateEquipmentEffectDocumentV1(scope);
  assert.ok(codes(result).includes('global_scope_cannot_have_selectors'));

  const tier = copy(fixtures.valid_lynx_effect_scope);
  tier.effects[0].stacking.tier_semantics = 'not_applicable';
  result = validateEquipmentEffectDocumentV1(tier);
  assert.ok(codes(result).includes('set_bonus_requires_tier_semantics'));
});

test('ponte legada preserva os três modos sem gerar efeitos ou ler a descrição', () => {
  for (const mode of ['legacy', 'calculated', 'informational']) {
    const input = {
      mode,
      description: 'Texto com +999% que não pode ser autoridade.',
      stats: { arbitrary_key: '3,5', __echo_mode: mode }
    };
    const result = inspectLegacyBonusTransitionV1(input);
    assert.equal(result.recognized_mode, true);
    assert.equal(result.requires_phase_2c, true);
    assert.deepEqual(result.generated_effects, []);
    assert.equal(result.stat_diagnostics[0].transition_status, 'unregistered_legacy_key');
    assert.equal(result.stat_diagnostics[0].value_status, 'requires_review');
    assert.equal(result.stat_diagnostics[0].executable, false);
    assert.equal(result.all_stats_registered, false);
    assert.deepEqual(result.preserved, {
      description: input.description,
      stats: input.stats
    });
  }
});

test('inventário 2B cobre cada chave fixa do editor atual sem converter valores', () => {
  const editorSource = fs.readFileSync(
    new URL('../admin/js/equipment-bonus-structure.js', import.meta.url),
    'utf8'
  );
  const editorKeys = [...editorSource.matchAll(/key:\s*'([^']+)'/g)]
    .map(match => match[1])
    .sort();
  assert.deepEqual(Object.keys(LEGACY_BONUS_STAT_TRANSITION_V1).sort(), editorKeys);
  for (const candidate of Object.values(LEGACY_BONUS_STAT_TRANSITION_V1)) {
    const capability = EQUIPMENT_EFFECT_CAPABILITIES_V1[candidate.target];
    assert.ok(capability, `alvo legado sem capacidade: ${candidate.target}`);
    assert.ok(
      capability.operations[candidate.operation]?.includes(candidate.unit),
      `candidato legado incompatível: ${candidate.target}/${candidate.operation}/${candidate.unit}`
    );
  }

  const stats = Object.fromEntries(editorKeys.map((key, index) => [key, index + 1]));
  const result = inspectLegacyBonusTransitionV1({ mode: 'calculated', stats });
  assert.equal(result.all_stats_registered, true);
  assert.equal(result.stat_diagnostics.length, editorKeys.length);
  assert.ok(result.stat_diagnostics.every(entry =>
    entry.transition_status === 'candidate_requires_phase_2c_validation' &&
    entry.value_status === 'finite_number' &&
    entry.executable === false
  ));
  assert.deepEqual(result.generated_effects, []);
  assert.deepEqual(result.preserved.stats, stats);
});

test('serialização é determinística e a ida e volta mantém o contrato', () => {
  const first = copy(fixtures.valid_lynx_effect_scope);
  first.effects[0].scope.hero_ids = ['hero:zeta', 'hero:lynx'];
  const second = copy(first);
  second.effects[0].scope.hero_ids.reverse();
  const serializedFirst = serializeEquipmentEffectDocumentV1(first);
  const serializedSecond = serializeEquipmentEffectDocumentV1(second);
  assert.equal(serializedFirst, serializedSecond);
  const roundTrip = JSON.parse(serializedFirst);
  assert.equal(validateEquipmentEffectDocumentV1(roundTrip).valid, true);
  assert.deepEqual(roundTrip.effects[0].scope.hero_ids, ['hero:lynx', 'hero:zeta']);
});
