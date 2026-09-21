import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  EFFECT_OPERATOR_OPTIONS,
  buildEquipmentVariantEffectDocument,
  buildPersistentEvidence,
  centralWorkflowLabel,
  effectSemanticsFromOperator,
  inspectPersistentEvidence,
  operatorFormula,
  operatorFromStoredEffect,
  parseLocalizedEffectNumber,
  previewEffectCalculation,
  validateCentralEffectDraft
} from '../admin/js/equipment-effect-central-core.js';
import {
  EQUIPMENT_EFFECT_SOURCE_RULES_V1,
  EQUIPMENT_EFFECT_SOURCE_RULESET_REVISION,
  findEquipmentSourceRule,
  sourceRuleCoverage
} from '../admin/js/equipment-effect-source-rules-v1.js';

import { EQUIPMENT_EFFECT_NUMERIC_AUTHORITY } from '../contracts/equipment-effect-contract-v1.js';

const EQUIPMENT_ID = '11111111-1111-4111-8111-111111111111';
const VARIANT_ID = '22222222-2222-4222-8222-222222222222';
const SHA = 'a'.repeat(64);

const baseEffect = overrides => ({
  effectId: 'effect:body-armor:common:armor-capacity',
  target: 'armor_capacity',
  operation: 'relative_percent',
  value: '3',
  unit: 'percent',
  originalText: '+3% à armadura máxima do herói',
  conditionKind: 'always',
  durationKind: 'not_applicable',
  stackingRule: 'additive',
  tierSemantics: 'not_applicable',
  maxStacks: '1',
  verificationStatus: 'confirmed',
  verifiedAt: '2026-09-02T00:00:00Z',
  sourceKind: 'game_screenshot',
  sourceReference: 'evidence:IMG_0946.png:common',
  observedAt: '2026-09-02',
  supportStatus: 'supported',
  supportDetails: 'Representação contratual; execução numérica fechada.',
  ...overrides
});

test('normalização localizada acontece somente na fronteira explícita do formulário', () => {
  assert.equal(parseLocalizedEffectNumber('3,5'), 3.5);
  assert.equal(parseLocalizedEffectNumber('-25'), -25);
  for (const invalid of ['', '3%', '1.000,5', 'NaN', Infinity]) {
    assert.throws(() => parseLocalizedEffectNumber(invalid));
  }
});

test('cada bônus escolhe um dos quatro sinais explícitos uma única vez', () => {
  assert.deepEqual(
    EFFECT_OPERATOR_OPTIONS.map(option => [option.id, option.symbol]),
    [
      ['increase_flat', '+'],
      ['decrease_flat', '−'],
      ['increase_percent', '+%'],
      ['decrease_percent', '−%']
    ]
  );
  assert.equal(operatorFormula('increase_flat'), 'resultado = base + bônus');
  assert.equal(operatorFormula('decrease_percent'), 'resultado = base × (1 − bônus ÷ 100)');
});

test('operadores de bônus independentes geram sinal, operação e unidade sem repetir % por raridade', () => {
  assert.deepEqual(effectSemanticsFromOperator({
    target: 'armor_capacity', operator: 'increase_percent', magnitude: '3'
  }), { operation: 'relative_percent', unit: 'percent', value: 3 });
  assert.deepEqual(effectSemanticsFromOperator({
    target: 'weapon_recoil', operator: 'decrease_percent', magnitude: '25'
  }), { operation: 'relative_percent', unit: 'percent', value: -25 });
  assert.deepEqual(effectSemanticsFromOperator({
    target: 'aimed_range', operator: 'increase_flat', magnitude: '10'
  }), { operation: 'add', unit: 'distance_unit', value: 10 });
  assert.deepEqual(effectSemanticsFromOperator({
    target: 'aimed_range', operator: 'decrease_flat', magnitude: '10'
  }), { operation: 'add', unit: 'distance_unit', value: -10 });
  assert.throws(() => effectSemanticsFromOperator({
    target: 'armor_capacity', operator: 'increase_percent', magnitude: '-3'
  }), /magnitude/);
});

test('prévia declarativa cobre +, −, +% e −% sem ativar o motor de produção', () => {
  assert.equal(previewEffectCalculation({ base: 100, magnitude: 10, operator: 'increase_flat' }).result, 110);
  assert.equal(previewEffectCalculation({ base: 100, magnitude: 10, operator: 'decrease_flat' }).result, 90);
  assert.equal(previewEffectCalculation({ base: 100, magnitude: 3, operator: 'increase_percent' }).result, 103);
  assert.equal(previewEffectCalculation({ base: 100, magnitude: 25, operator: 'decrease_percent' }).result, 75);
});

test('efeito persistido volta ao operador visual correspondente sem reinterpretar multiplicador', () => {
  assert.equal(operatorFromStoredEffect({ operation: 'add', value: -7 }), 'decrease_flat');
  assert.equal(operatorFromStoredEffect({ operation: 'percentage_points', value: 7 }), 'increase_flat');
  assert.equal(operatorFromStoredEffect({ operation: 'relative_percent', value: -25 }), 'decrease_percent');
  assert.equal(operatorFromStoredEffect({ operation: 'multiply', value: 1.2 }), null);
});

test('snapshot da Faixa de Combate usa somente valores visíveis e deixa Divino vazio', () => {
  const rule = findEquipmentSourceRule('Bandana de Combate');
  assert.ok(rule);
  assert.equal(rule.id, 'combat_headband');
  assert.equal(rule.effects[0].target, 'aimed_range');
  assert.equal(rule.effects[0].operator, 'increase_flat');
  assert.deepEqual(Object.values(rule.effects[0].values), [
    10, 12, 14, 16, 18, 20, 22, 23, 24, 25, null
  ]);
  assert.deepEqual(sourceRuleCoverage(rule), {
    effectCount: 1, valueCount: 10, complete: false
  });
  assert.match(EQUIPMENT_EFFECT_SOURCE_RULESET_REVISION, /^bullet-echo-fandom-gears\//);
});

test('regras da wiki preservam semântica sem importar números do catálogo deficiente', () => {
  const bodyArmor = findEquipmentSourceRule('Armadura Corporal');
  const optics = findEquipmentSourceRule('Tactical Optics');
  assert.equal(bodyArmor.effects[0].direction, 'increase');
  assert.equal(bodyArmor.effects[0].operator, null);
  assert.deepEqual(bodyArmor.effects[0].values, {});
  assert.equal(optics.effects[0].target, 'unaimed_fire_spread');
  assert.equal(optics.effects[0].direction, 'decrease');
  assert.equal(optics.effects[0].operator, null);
  assert.equal(optics.coverage, 'target_requires_registry');
  assert.equal(EQUIPMENT_EFFECT_SOURCE_RULES_V1
    .filter(rule => rule.id !== 'combat_headband')
    .every(rule => rule.effects.every(effect => effect.operator === null)), true,
  'a página geral não deve escolher absoluto ou percentual sem a tabela específica');
  assert.equal(EQUIPMENT_EFFECT_SOURCE_RULES_V1.some(rule =>
    JSON.stringify(rule).includes('attributes')
  ), false);
});

test('Armadura Corporal comum preserva +3% e não soma três pontos', () => {
  const document = buildEquipmentVariantEffectDocument({
    equipmentId: EQUIPMENT_ID,
    variantId: VARIANT_ID,
    effects: [baseEffect()]
  });
  const result = validateCentralEffectDraft(document);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual([
    result.document.effects[0].value,
    result.document.effects[0].operation,
    result.document.effects[0].unit
  ], [3, 'relative_percent', 'percent']);
  assert.equal(result.numeric_authority.enabled, false);
});

test('Bornal comum mantém alcance absoluto e recuo percentual como efeitos independentes', () => {
  const document = buildEquipmentVariantEffectDocument({
    equipmentId: EQUIPMENT_ID,
    variantId: VARIANT_ID,
    expectedEffectCount: 2,
    effects: [
      baseEffect({
        effectId: 'effect:slayer-pouch:common:aimed-range',
        target: 'aimed_range', operation: 'add', value: '+17', unit: 'distance_unit',
        originalText: '+17 ao alcance do tiro com mira do herói',
        sourceReference: 'evidence:IMG_0913.png:common', heroIds: 'hero:slayer'
      }),
      baseEffect({
        effectId: 'effect:slayer-pouch:common:weapon-recoil',
        target: 'weapon_recoil', operation: 'relative_percent', value: '-25', unit: 'percent',
        originalText: '-25% ao recuo da arma do herói',
        sourceReference: 'evidence:IMG_0913.png:common', heroIds: 'hero:slayer',
        supportStatus: 'pending', supportReason: 'registry_extension_requires_review'
      })
    ]
  });
  const result = validateCentralEffectDraft(document);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.document.effects.map(effect => [
    effect.target, effect.value, effect.operation, effect.unit
  ]), [
    ['aimed_range', 17, 'add', 'distance_unit'],
    ['weapon_recoil', -25, 'relative_percent', 'percent']
  ]);
  assert.deepEqual(result.document.effects[1].scope.hero_ids, ['hero:slayer']);
});

test('fonte incompleta é preservada como rascunho, mas não fica pronta para revisão', () => {
  const evidence = inspectPersistentEvidence({
    sourceKind: 'game_screenshot',
    sourceReference: 'IMG_0946.png:common',
    fileSha256: ''
  });
  assert.equal(evidence.valid, false);
  assert.deepEqual(evidence.issues, ['evidence_sha256_required']);
  assert.equal(evidence.evidence.source_reference, 'IMG_0946.png:common');
});

test('pendência pode preservar semântica ainda incompleta sem inventar valor', () => {
  const document = buildEquipmentVariantEffectDocument({
    equipmentId: EQUIPMENT_ID,
    variantId: VARIANT_ID,
    effects: [baseEffect({
      supportStatus: 'pending',
      supportReason: 'numeric_value_requires_review',
      verificationStatus: 'unverified',
      verifiedAt: '',
      value: ''
    })]
  });
  const result = validateCentralEffectDraft(document);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.document.effects[0].value, null);
  assert.equal(result.document.effects[0].support.status, 'pending');
});

test('evidência persistente normaliza hash sem declarar aprovação', () => {
  const evidence = buildPersistentEvidence({
    sourceKind: 'game_screenshot', sourceReference: 'library:file:body-armor-common',
    sourceUri: 'https://example.invalid/reference-only', fileSha256: SHA.toUpperCase(),
    observedAt: '2026-09-02', excerpt: '+3% à armadura máxima'
  });
  assert.equal(evidence.file_sha256, SHA);
  assert.equal(Object.hasOwn(evidence, 'approved'), false);
});

test('estado aprovado continua explicitamente separado de publicação', () => {
  assert.equal(centralWorkflowLabel('reviewed'), 'Revisão aprovada — ainda não publicado');
  assert.equal(EQUIPMENT_EFFECT_NUMERIC_AUTHORITY.enabled, false);
});

test('Calculation V2 substitui a Central antiga sem reativar o motor legado', () => {
  const runtime = fs.readFileSync(
    new URL('../admin/js/equipment-calculation-v2.js', import.meta.url), 'utf8'
  );
  const html = fs.readFileSync(
    new URL('../admin/equipment-editor.html', import.meta.url), 'utf8'
  );
  const migration = fs.readFileSync(
    new URL('../supabase/migrations/20260915150000_calculation_v2_catalog.sql', import.meta.url),
    'utf8'
  );
  assert.equal(runtime.includes('game-stat-engine'), false);
  assert.equal(runtime.includes('equipment-effect-central'), false);
  assert.doesNotMatch(html, /equipment-effect-central\.(?:js|css)/);
  assert.match(html, /equipment-calculation-v2\.js\?v=20260920-resolution-authority-1/);
  assert.match(html, /equipment-calculation-v2\.css\?v=20260919-semantic-catalog-1/);
  assert.match(html, /data-calculation-v2-mount/);
  assert.match(migration, /admin_save_equipment_calculation_v2/);
  assert.match(migration, /admin_publish_equipment_calculation_v2/);
  assert.doesNotMatch(migration, /(?:insert\s+into|update)\s+public\.equipment_variants/i);
});

test('Raridades persiste um operador explícito por posição em todas as variantes', () => {
  const editor = fs.readFileSync(
    new URL('../admin/js/equipment-editor-core.js', import.meta.url), 'utf8'
  );
  const html = fs.readFileSync(
    new URL('../admin/equipment-editor.html', import.meta.url), 'utf8'
  );
  const migration = fs.readFileSync(
    new URL('../supabase/migrations/20260902061709_equipment_scope_admin_phase2a.sql', import.meta.url),
    'utf8'
  );

  for (const operatorId of [
    'increase_flat',
    'decrease_flat',
    'increase_percent',
    'decrease_percent'
  ]) {
    assert.match(editor, new RegExp(`id: '${operatorId}'`));
  }

  assert.match(editor, /Operador por posição da linha/);
  assert.match(editor, /data-rarity-row-operator/);
  assert.match(editor, /row\.dataset\.rowIndex/);
  assert.match(editor, /validateRarityRowOperators\(\);/);
  assert.match(
    editor,
    /operator:\s*rarityRowOperators\[\s*rowIndex\s*\]/,
    'cada atributo salvo precisa receber o operador da posição da linha'
  );
  assert.match(editor, /function inferRarityAttributeOperator\(attribute\)/);
  assert.match(editor, /decrease' : 'increase[^]*percent \? 'percent' : 'flat'/);
  assert.match(html, /equipment-editor\.js\?v=20260920-resolution-authority-1/);
  assert.match(
    migration,
    /attributes, updated_at\)[^]*v_variant->'attributes'[^]*do update set attributes = excluded\.attributes/,
    'o RPC precisa persistir o documento JSONB completo sem remover operator'
  );
});

test('Calculation V2 organiza uma regra por efeito e onze valores por raridade', () => {
  const runtime = fs.readFileSync(
    new URL('../admin/js/equipment-calculation-v2.js', import.meta.url), 'utf8'
  );
  const html = fs.readFileSync(
    new URL('../admin/equipment-editor.html', import.meta.url), 'utf8'
  );
  const css = fs.readFileSync(
    new URL('../admin/css/equipment-calculation-v2.css', import.meta.url), 'utf8'
  );

  assert.match(
    html,
    /data-tab="calculation"[^]*Cálculo[^]*data-tab="bonuses"[^]*Bônus de conjunto/,
    'o cálculo deve ter uma área própria antes dos bônus de conjunto'
  );
  assert.match(html, /data-calculation-v2-mount/);
  assert.doesNotMatch(html, /data-tab="effect-central"|Central auditada/);
  assert.match(runtime, /const RARITIES = Object\.freeze\(\[/);
  assert.equal((runtime.match(/slug: '(?:comum|raro|epico|lendario|mitico|supremo|grandioso|celestial|estelar|imortal|divino)'/g) || []).length, 11);
  assert.match(runtime, /labelledField\('O que este efeito altera\?', 'target'/);
  assert.match(runtime, /labelledField\('Como aplicar\?', 'operation'/);
  assert.match(runtime, /input\.dataset\.rarityValue = rarity\.slug/);
  assert.match(runtime, /data-action="save">Salvar para depois/);
  assert.match(runtime, /data-action="confirm">Confirmar cálculo no site/);
  assert.match(runtime, /Corrigir reconhecimento/);
  assert.match(runtime, /const publicResult = calculateBuild\(publicInput\)/);
  assert.match(runtime, /const localResult = calculateBuild\(localInput\)/);
  assert.match(css, /calculation-v2-rarity-table/);
  assert.match(css, /calculation-v2-table-scroll[^]*overflow-x:\s*auto/);
});

test('falha ao iniciar o editor V2 fica explícita e não produz falso sucesso', () => {
  const html = fs.readFileSync(
    new URL('../admin/equipment-editor.html', import.meta.url), 'utf8'
  );
  const bootstrap = html.match(/try \{\s*await initEquipmentCalculationV2Editor[\s\S]*?Nenhuma regra foi salva ou publicada\.';/)?.[0] || '';
  assert.match(bootstrap, /await initEquipmentCalculationV2Editor\(\{/);
  assert.match(bootstrap, /calculationMount\.setAttribute\('role', 'alert'\)/);
  assert.match(bootstrap, /Não foi possível iniciar o editor de cálculo v2/);
  assert.match(bootstrap, /Nenhuma regra foi salva ou publicada/);
  assert.doesNotMatch(bootstrap, /sucesso|publicado com sucesso/i);
});

test('SQL já aplicado permanece byte a byte igual ao histórico do SNV', () => {
  const sql = fs.readFileSync(new URL(
    '../supabase/migrations/20260902173201_equipment_effect_central_phase2c1.sql', import.meta.url
  ));
  assert.equal(createHash('sha256').update(sql).digest('hex'),
    '17945f4c4f435237383141288a9894604776bee20ae320759168aa5b46bd506a');
  const migrationNames = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url));
  assert.deepEqual(migrationNames.filter(name => name.endsWith('_equipment_effect_central_phase2c1.sql')),
    ['20260902173201_equipment_effect_central_phase2c1.sql'],
    'não manter um segundo identificador aplicável para o mesmo SQL');
});

test('corretiva da Central contém apenas ACLs dos objetos explicitamente autorizados', () => {
  const rawSql = fs.readFileSync(new URL(
    '../supabase/migrations/20260902185123_equipment_effect_central_privileges_v1.sql', import.meta.url
  ), 'utf8');
  assert.equal(createHash('sha256').update(rawSql).digest('hex'),
    '6f1975c7e2c6ab8f6b99132117b6c030dca058b60020152a0cbb966d54d19f98');
  const sql = rawSql.replace(/--[^\n]*/g, '');
  const statements = sql.split(';').map(value => value.trim()).filter(Boolean);
  assert.equal(statements.length, 4);
  assert.ok(statements.every(statement => /^(revoke|grant)\s/i.test(statement)));
  assert.doesNotMatch(sql, /alter\s+default|all\s+(?:tables|functions)\s+in\s+schema/i);
  const targets = [...sql.matchAll(/public\.([a-z_0-9]+)/g)].map(match => match[1]);
  const allowed = new Set([
    'equipment_effect_documents', 'equipment_effect_document_revisions',
    'equipment_effect_evidence', 'equipment_effect_revision_evidence',
    'equipment_effect_review_queue', 'equipment_effect_central_write_guard_v1',
    'equipment_effect_central_immutable_guard_v1'
  ]);
  assert.ok(targets.every(target => allowed.has(target)));
  assert.deepEqual(new Set(targets), allowed);
});
