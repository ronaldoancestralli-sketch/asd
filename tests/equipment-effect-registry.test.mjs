import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_EQUIPMENT_EFFECT_REGISTRY_V1,
  EQUIPMENT_EFFECT_NUMERIC_AUTHORITY,
  EQUIPMENT_EFFECT_REGISTRY_VERSION,
  assessEquipmentEffectExecutionV1,
  createEquipmentEffectRegistryV1,
  inspectLegacyBonusTransitionV1,
  readEquipmentEffectDocument,
  serializeEquipmentEffectDocumentV1,
  summarizeEquipmentEffectDocument,
  validateEquipmentEffectDocumentV1
} from '../contracts/equipment-effect-contract-v1.js';
import { externalDataStatus } from '../js/equipment-data-limits.js';

const fixtures = JSON.parse(fs.readFileSync(
  new URL('./fixtures/equipment-effect-contract-v1.json', import.meta.url), 'utf8'
));
const copy = value => structuredClone(value);
const hasCode = (result, code) => result.errors.some(error => error.code === code);
const armor = () => copy(fixtures.valid_distinct_dimensions.effects[1]);
const documentFor = effects => ({
  ...copy(fixtures.valid_distinct_dimensions),
  document_id: 'fixture:collection-contract',
  expected_effect_count: effects.length,
  effects
});
const registryInput = () => ({
  registry_version: EQUIPMENT_EFFECT_REGISTRY_VERSION,
  revision: 'fixture:collection-registry:1',
  additional_units: [],
  definitions: [{
    target: 'weapon_recoil',
    dimension: 'weapon.recoil',
    operations: { relative_percent: ['percent'] },
    condition_kinds: ['always'],
    requires_base_for_absolute_total: true,
    source_references: ['game_screenshot:IMG_0913.png:common']
  }]
});
const optionsFor = (snapshot = registryInput()) => {
  const result = createEquipmentEffectRegistryV1(snapshot);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  return { registry: result.registry };
};
const externalContext = () => ({
  base_values: {},
  base_availability: {
    crate_open_duration: {
      status: 'not_public',
      source_reference: 'classification:crate_opening_time:v2',
      missing_data: 'Valor-base oficial do tempo de abertura de caixas.'
    }
  }
});
const crate = () => ({ ...armor(), target: 'crate_open_duration', value: -15 });

test('registro é aditivo, imutável e não altera nem aprova o snapshot de entrada', () => {
  const input = registryInput();
  const before = copy(input);
  const { registry } = optionsFor(input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(registry.capabilities.weapon_recoil.operations), true);
  assert.equal(registry.capabilities.weapon_recoil.numeric_runtime, 'not_implemented');
  assert.equal(DEFAULT_EQUIPMENT_EFFECT_REGISTRY_V1.capabilities.weapon_recoil, undefined);
  input.definitions[0].operations.relative_percent.push('second');
  assert.deepEqual(registry.capabilities.weapon_recoil.operations.relative_percent, ['percent']);
  assert.equal(EQUIPMENT_EFFECT_NUMERIC_AUTHORITY.enabled, false);
});

test('nova grandeza e unidade são cadastráveis sem editar o motor ou inferir texto', () => {
  const snapshot = registryInput();
  snapshot.additional_units = ['synthetic_charge'];
  snapshot.definitions = [{
    target: 'synthetic_charge_capacity', dimension: 'fixture.charge',
    operations: { add: ['synthetic_charge'], relative_percent: ['percent'] },
    condition_kinds: ['always'], requires_base_for_absolute_total: true,
    source_references: ['fixture:synthetic-not-a-game-fact']
  }];
  const options = optionsFor(snapshot);
  const effect = { ...armor(), target: 'synthetic_charge_capacity', operation: 'add',
    value: -2, unit: 'synthetic_charge' };
  const document = { ...documentFor([effect]), registry_revision: options.registry.revision };
  assert.equal(validateEquipmentEffectDocumentV1(document, options).valid, true);
  assert.equal(assessEquipmentEffectExecutionV1(effect, {}, options).mechanic_support, 'not_implemented');
  assert.equal(assessEquipmentEffectExecutionV1(effect, {}, options).execution_eligible, false);
});

for (const target of ['armor_capacity', 'constructor', '__proto__', 'prototype', 'Valor Novo']) {
  test('registro recusa alvo reservado, redefinido ou não canônico: ' + target, () => {
    const input = registryInput();
    input.definitions[0].target = target;
    assert.ok(hasCode(createEquipmentEffectRegistryV1(input), 'invalid_or_duplicate_registry_target'));
  });
}

test('registro recusa duplicatas de alvos/unidades e revisão reservada', () => {
  const input = registryInput();
  input.definitions.push(copy(input.definitions[0]));
  input.additional_units = ['percent', 'synthetic', 'synthetic'];
  input.revision = DEFAULT_EQUIPMENT_EFFECT_REGISTRY_V1.revision;
  const result = createEquipmentEffectRegistryV1(input);
  assert.equal(result.registry, null);
  assert.ok(hasCode(result, 'invalid_or_duplicate_registry_target'));
  assert.ok(hasCode(result, 'invalid_or_duplicate_registry_unit'));
  assert.ok(hasCode(result, 'invalid_registry_revision'));
});

for (const [operation, units] of [
  ['execute_script', ['percent']], ['relative_percent', ['second']],
  ['add', ['percent']], ['percentage_points', ['percent']], ['multiply', ['percent']]
]) {
  test('registro recusa operação/unidade incompatível: ' + operation + '/' + units, () => {
    const input = registryInput();
    input.definitions[0].operations = { [operation]: units };
    assert.equal(createEquipmentEffectRegistryV1(input).valid, false);
  });
}

test('registro não aceita fórmulas, código, unidade inexistente ou fonte vazia', () => {
  for (const mutate of [
    input => { input.formula = 'arbitrary()'; },
    input => { input.definitions[0].formula = 'value * base'; },
    input => { input.definitions[0].numeric_runtime = 'implemented'; },
    input => { input.definitions[0].operations.relative_percent = ['unregistered']; },
    input => { input.definitions[0].source_references = []; },
    input => { input.definitions[0].condition_kinds = ['new_event']; },
    input => { input.definitions[0].requires_base_for_absolute_total = 'false'; }
  ]) {
    const input = registryInput();
    mutate(input);
    assert.equal(createEquipmentEffectRegistryV1(input).valid, false);
  }
});

test('versão futura de registro é preservada sem compilação ou downgrade', () => {
  const input = { ...registryInput(), registry_version: 'echo-equipment-effect-registry/v99',
    future_extension: { preserve: true } };
  const result = createEquipmentEffectRegistryV1(input);
  assert.equal(result.registry, null);
  assert.ok(hasCode(result, 'unknown_registry_version'));
  assert.deepEqual(result.preserved, input);
});

test('registro exige opções validadas e não pode ser falsificado por JSON ou cópia', () => {
  for (const registry of [null, {}, copy(DEFAULT_EQUIPMENT_EFFECT_REGISTRY_V1)]) {
    const result = validateEquipmentEffectDocumentV1(documentFor([armor()]), { registry });
    assert.equal(result.valid, false);
    assert.ok(hasCode(result, 'unvalidated_registry'));
    const diagnostic = assessEquipmentEffectExecutionV1(armor(), {}, { registry });
    assert.equal(diagnostic.declared_value_visible, false);
    assert.equal(diagnostic.data_quality.status, 'invalid');
  }
});

test('revisão carregada precisa corresponder ao documento em todas as entradas', () => {
  const options = optionsFor();
  const doc = documentFor([armor()]);
  assert.ok(hasCode(validateEquipmentEffectDocumentV1(doc, options), 'registry_revision_mismatch'));
  doc.registry_revision = options.registry.revision;
  assert.equal(readEquipmentEffectDocument(doc, options).status, 'valid');
  assert.equal(summarizeEquipmentEffectDocument(doc, options).contract_complete, true);
  assert.deepEqual(JSON.parse(serializeEquipmentEffectDocumentV1(doc, options)).registry_revision,
    options.registry.revision);
  doc.registry_revision += ':changed';
  assert.equal(readEquipmentEffectDocument(doc, options).status, 'unknown_registry');
  assert.deepEqual(readEquipmentEffectDocument(doc, options).preserved, doc);
  assert.equal(summarizeEquipmentEffectDocument(doc, options).contract_complete, false);
  assert.throws(() => serializeEquipmentEffectDocumentV1(doc, options),
    { code: 'invalid_equipment_effect_contract' });
  assert.equal(validateEquipmentEffectDocumentV1(documentFor([armor()])).valid, true);
});

test('fotos da Armadura Corporal preservam +3% sem convertê-lo em +3 pontos', () => {
  const effect = armor();
  effect.original_text = '+3% à armadura máxima do herói';
  effect.provenance.sources = [{ kind: 'game_screenshot', reference: 'IMG_0946.png:common' }];
  const doc = JSON.parse(serializeEquipmentEffectDocumentV1(documentFor([effect])));
  assert.deepEqual([doc.effects[0].value, doc.effects[0].unit, doc.effects[0].operation],
    [3, 'percent', 'relative_percent']);
  doc.effects[0].operation = 'add';
  assert.ok(hasCode(validateEquipmentEffectDocumentV1(doc), 'unit_incompatible_with_target_operation'));
});

test('foto do Bornal preserva +17 absoluto e −25% recuo no mesmo equipamento', () => {
  const options = optionsFor();
  const aimed = { ...armor(), effect_id: 'fixture:pouch:aimed', target: 'aimed_range',
    operation: 'add', unit: 'distance_unit', value: 17,
    original_text: '+17 ao alcance do tiro com mira do herói' };
  const recoil = { ...armor(), effect_id: 'fixture:pouch:recoil', target: 'weapon_recoil',
    value: -25, original_text: '-25% ao recuo da arma do herói' };
  for (const effect of [aimed, recoil]) {
    effect.scope = { kind: 'restricted', hero_ids: ['hero:slayer'] };
    effect.origin = { kind: 'equipment_variant', id: 'fixture:pouch:common',
      equipment_id: 'fixture:pouch', variant_id: 'fixture:pouch:common' };
    effect.provenance.sources = [{ kind: 'game_screenshot', reference: 'IMG_0913.png:common' }];
  }
  const doc = { ...documentFor([aimed, recoil]), registry_revision: options.registry.revision };
  const roundTrip = JSON.parse(serializeEquipmentEffectDocumentV1(doc, options));
  assert.deepEqual(roundTrip.effects.map(effect => [effect.target, effect.value, effect.operation, effect.unit]), [
    ['aimed_range', 17, 'add', 'distance_unit'], ['weapon_recoil', -25, 'relative_percent', 'percent']
  ]);
  assert.deepEqual(roundTrip.effects[1].scope.hero_ids, ['hero:slayer']);
  assert.equal(assessEquipmentEffectExecutionV1(recoil, {}, options).execution_status, 'not_executed');
  assert.equal(readEquipmentEffectDocument(doc).status, 'unknown_registry');
});

test('mecânica não registrada conserva fonte e texto sem equiparar recuo a dispersão', () => {
  const effect = { ...armor(), target: 'weapon_recoil', value: -25,
    support: { status: 'pending', reason_code: 'mechanic_unregistered' } };
  const read = readEquipmentEffectDocument(documentFor([effect]));
  assert.equal(read.status, 'pending');
  const state = assessEquipmentEffectExecutionV1(effect);
  assert.equal(state.mechanic_support, 'unregistered');
  assert.equal(state.data_quality.status, 'confirmed');
  assert.equal(state.data_quality.authority, 'declared_evidence_not_server_approval');
  assert.equal(state.execution_eligible, false);
});

test('dado externo real mantém classificação já existente sem inventar tempo-base', () => {
  const existing = externalDataStatus('crate_opening_cooldown_pct');
  assert.equal(existing.kind, 'awaiting_official_data');
  assert.equal(existing.actionable, false);
  const context = externalContext();
  const before = copy(context);
  const state = assessEquipmentEffectExecutionV1(crate(), context);
  assert.equal(state.contract_valid, true);
  assert.equal(state.data_quality.status, 'confirmed');
  assert.equal(state.base_availability.status, 'not_public');
  assert.equal(state.external_data_status, existing.kind);
  assert.equal(state.relative_effect_visible, true);
  assert.equal(state.execution_eligible, false);
  assert.equal(state.execution_status, 'not_executed');
  assert.equal(state.errors.length, 0);
  assert.deepEqual(context, before);
  assert.equal(Object.hasOwn(state, 'final_value'), false);
});

test('dado externo não oculta string numérica ou unidade incorreta no cadastro', () => {
  for (const change of [{ value: '-15%' }, { unit: 'second' }]) {
    const state = assessEquipmentEffectExecutionV1({ ...crate(), ...change }, externalContext());
    assert.equal(state.base_availability.status, 'not_public');
    assert.equal(state.contract_valid, false);
    assert.equal(state.data_quality.status, 'invalid');
    assert.equal(state.external_data_status, null);
    assert.ok(state.errors.length > 0);
  }
});

test('falta de base, fonte não pública e falha de carga são estados distintos', () => {
  const context = externalContext();
  context.base_availability.crate_open_duration.status = 'load_error';
  let state = assessEquipmentEffectExecutionV1(crate(), context);
  assert.equal(state.base_availability.status, 'load_error');
  assert.equal(state.external_data_status, null);
  assert.ok(state.reasons.includes('base_load_error'));
  state = assessEquipmentEffectExecutionV1(crate());
  assert.equal(state.base_availability.status, 'unconfirmed');
  assert.equal(state.external_data_status, null);
  assert.ok(state.reasons.includes('base_missing'));
});

test('base não pública exige referência explícita, não apenas um rótulo reconhecível', () => {
  const context = externalContext();
  delete context.base_availability.crate_open_duration.source_reference;
  const state = assessEquipmentEffectExecutionV1(crate(), context);
  assert.equal(state.base_availability.status, 'invalid');
  assert.equal(state.external_data_status, null);
  assert.equal(state.data_quality.status, 'confirmed');
});

test('base finita zero é preservada; null, string e valores não finitos não contam como disponíveis', () => {
  for (const value of [null, '1', NaN, Infinity, -Infinity]) {
    const state = assessEquipmentEffectExecutionV1(crate(), { base_values: { crate_open_duration: value } });
    assert.equal(state.base_availability.status, 'invalid');
    assert.ok(state.reasons.includes('base_missing'));
  }
  const state = assessEquipmentEffectExecutionV1(crate(), { base_values: { crate_open_duration: 0 } });
  assert.equal(state.base_availability.status, 'available');
  assert.equal(state.execution_eligible, false);
});

test('declarações contraditórias de disponibilidade não viram dado externo válido', () => {
  const context = externalContext();
  context.base_values.crate_open_duration = 1;
  const state = assessEquipmentEffectExecutionV1(crate(), context);
  assert.equal(state.base_availability.status, 'invalid');
  assert.equal(state.external_data_status, null);
});

test('fonte não revisada não recebe selo de efeito externo confirmado', () => {
  const effect = crate();
  effect.provenance.verification_status = 'unverified';
  effect.support = { status: 'pending', reason_code: 'source_unverified' };
  const state = assessEquipmentEffectExecutionV1(effect, externalContext());
  assert.equal(state.contract_valid, true);
  assert.equal(state.data_quality.status, 'unverified');
  assert.equal(state.base_availability.status, 'not_public');
  assert.equal(state.external_data_status, null);
});

test('identificadores herdados não são grandezas ou chaves legadas registradas', () => {
  const effect = { ...armor(), target: 'constructor' };
  assert.equal(validateEquipmentEffectDocumentV1(documentFor([effect])).valid, false);
  assert.equal(assessEquipmentEffectExecutionV1(effect).target_registered, false);
  const transition = inspectLegacyBonusTransitionV1({ mode: 'constructor', stats: { constructor: 3 } });
  assert.equal(transition.recognized_mode, false);
  assert.equal(transition.stat_diagnostics[0].contract_candidate, null);
});

test('extensões JSON com __proto__ são preservadas como dados sem poluir protótipos', () => {
  const doc = documentFor([armor()]);
  doc.extension = JSON.parse('{"__proto__":{"must_survive":true}}');
  const serialized = JSON.parse(serializeEquipmentEffectDocumentV1(doc));
  assert.equal(Object.hasOwn(serialized.extension, '__proto__'), true);
  assert.deepEqual(serialized.extension.__proto__, { must_survive: true });
  assert.equal({}.must_survive, undefined);
});

test('efeitos e alvos malformados são diagnosticados, não quebram o resumo', () => {
  const malformed = JSON.parse('{"toString":null}');
  for (const effect of [null, 0, 'invalid', { ...armor(), target: malformed }]) {
    const state = assessEquipmentEffectExecutionV1(effect);
    assert.equal(state.contract_valid, false);
    assert.equal(state.execution_eligible, false);
    assert.equal(summarizeEquipmentEffectDocument(documentFor([effect])).contract_complete, false);
  }
  assert.equal(inspectLegacyBonusTransitionV1({ mode: malformed }).recognized_mode, false);
});

test('arquivos ativos não importam o contrato novo e o módulo não executa rede/DOM', () => {
  for (const path of ['js/game-stat-engine.js', 'js/runtime-compat.js', 'js/build-analise.js',
    'admin/js/equipment-editor-core.js', 'supabase/functions/echo-brain-item-fit/index.ts',
    'supabase/functions/echo-brain-score/index.ts']) {
    const source = fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
    assert.equal(source.includes('equipment-effect-contract-v1'), false, path);
  }
  const source = fs.readFileSync(new URL('../contracts/equipment-effect-contract-v1.js', import.meta.url), 'utf8');
  assert.equal(/\b(?:fetch|eval)\s*\(|\bnew\s+Function\s*\(|document\.(?:createElement|querySelector)/.test(source), false);
});
