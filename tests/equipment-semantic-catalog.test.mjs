import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { calculateBuild, POLICY_ID } from '../js/calculation-v2-engine.js';
import { eligiblePreviewHeroes } from '../admin/js/equipment-calculation-v2-eligibility.js';
import { createCalculationEffectsFromImport, DEFAULT_RARITIES } from '../admin/js/equipment-calculation-v2-import.js';
import {
  normalizeCalculationEffectLabel,
  resolveCalculationAlias
} from '../admin/js/equipment-calculation-v2-recognition.js';

const catalog = JSON.parse(await readFile(
  new URL('./fixtures/calculation-semantic-catalog.json', import.meta.url),
  'utf8'
));
const schemaMigration = await readFile(
  new URL('../supabase/migrations/20260919161722_equipment_semantic_catalog_v2.sql', import.meta.url),
  'utf8'
);
const workflowMigration = await readFile(
  new URL('../supabase/migrations/20260919161723_equipment_semantic_admin_workflow_v2.sql', import.meta.url),
  'utf8'
);
const editorSource = await readFile(
  new URL('../admin/js/equipment-calculation-v2.js', import.meta.url),
  'utf8'
);

function ids() {
  let value = 0;
  return () => `10000000-0000-4000-8000-${String(++value).padStart(12, '0')}`;
}

function importDraft(draft, extra = {}) {
  return createCalculationEffectsFromImport(draft, {
    definitions: catalog.definitions,
    aliases: catalog.aliases,
    idFactory: ids(),
    ...extra
  });
}

test('1. equipamento novo com atributos conhecidos funciona sem alterar código', () => {
  const futureEquipment = {
    name: 'EQUIPAMENTO DE 2030',
    variants: {
      comum: [{
        label: 'À ARMADURA MÁXIMA DO HERÓI',
        value: '12',
        unit: '%',
        raw: '+12% À ARMADURA MÁXIMA DO HERÓI'
      }]
    }
  };
  const result = importDraft(futureEquipment);
  assert.equal(result.effects.length, 1);
  assert.equal(result.effects[0].target, 'hero.armor');
  assert.equal(result.effects[0].resolutionStatus, 'resolved');
  assert.equal(result.effects[0].values.comum, 12);
  assert.doesNotMatch(editorSource, /equipment\.(?:slug|name)\s*===|equipment\.name\.includes/);
});

test('2. nova variação textual pode ser vinculada pelo painel', () => {
  const phrase = 'PROTEÇÃO CORPORAL MÁXIMA DO HERÓI';
  assert.equal(resolveCalculationAlias({
    description: phrase,
    operation: 'percent',
    unit: '%'
  }, catalog).target, null);

  const approvedAlias = {
    ...catalog.aliases[0],
    id: '20000000-0000-4000-8000-000000000001',
    rawAlias: phrase,
    normalizedAlias: normalizeCalculationEffectLabel(phrase),
    target: 'hero.armor',
    context: 'general',
    allowedUnits: ['percent'],
    allowedOperations: ['percent'],
    state: 'published'
  };
  const resolved = resolveCalculationAlias({
    description: phrase,
    operation: 'percent',
    unit: '%'
  }, { definitions: catalog.definitions, aliases: [...catalog.aliases, approvedAlias] });
  assert.equal(resolved.target, 'hero.armor');
  assert.equal(resolved.status, 'resolved');
  assert.match(editorSource, /admin_publish_calculation_alias_v2/);
  assert.match(editorSource, /admin_save_calculation_alias_draft_v2/);
});

test('3. alias aprovado funciona em importações futuras', () => {
  const phrase = 'PROTEÇÃO CORPORAL MÁXIMA DO HERÓI';
  const alias = {
    id: '20000000-0000-4000-8000-000000000002',
    rawAlias: phrase,
    normalizedAlias: normalizeCalculationEffectLabel(phrase),
    target: 'hero.armor',
    context: 'general',
    allowedUnits: ['percent'],
    allowedOperations: ['percent'],
    definitionVersion: 1,
    version: 1,
    state: 'published'
  };
  const aliases = [...catalog.aliases, alias];
  for (const name of ['Equipamento futuro A', 'Equipamento futuro B']) {
    const result = createCalculationEffectsFromImport({
      name,
      variants: {
        comum: [{ label: phrase, value: '-8', unit: '%' }]
      }
    }, {
      definitions: catalog.definitions,
      aliases,
      idFactory: ids()
    });
    assert.equal(result.effects[0].target, 'hero.armor');
  }
});

test('4. mecânica inédita permanece pendente sem cálculo inventado', () => {
  const result = importDraft({
    variants: {
      comum: [{
        label: 'RESSONÂNCIA QUÂNTICA DA ARMA',
        value: '4',
        unit: 'x',
        raw: '+4x RESSONÂNCIA QUÂNTICA DA ARMA',
        image: 'quantum-common.png'
      }]
    }
  });
  assert.equal(result.effects[0].target, null);
  assert.equal(result.effects[0].resolutionStatus, 'pending_alias');
  assert.equal(result.effects[0].originalText, '+4x RESSONÂNCIA QUÂNTICA DA ARMA');
  assert.equal(result.effects[0].sourceImageReference, 'quantum-common.png');
  assert.deepEqual(result.effects[0].rarityEvidence.comum, {
    originalText: '+4x RESSONÂNCIA QUÂNTICA DA ARMA',
    sourceImageReference: 'quantum-common.png',
    observedUnit: 'factor'
  });
  assert.match(workflowMigration, /calculation_definition_drafts_v2/);
  assert.match(schemaMigration, /policy_id text,/);
  assert.match(workflowMigration, /calculation_definition_draft_created/);
});

test('5. dois efeitos válidos continuam calculando com um terceiro pendente', () => {
  const policy = {
    id: POLICY_ID,
    reference: 'fixture/additive-base-v1',
    rounding: 'none'
  };
  const common = {
    scope: 'self',
    condition: 'always',
    conditionExpected: null,
    evaluatedOn: 'source',
    publicationStatus: 'published',
    source: { kind: 'official', reference: 'fixture' },
    values: { comum: 10 }
  };
  const result = calculateBuild({
    definitions: [
      { id: 'hero.armor', policy },
      { id: 'weapon.magazine', policy }
    ],
    equipment: [{
      id: 'future-equipment',
      name: 'Equipamento futuro',
      effects: [
        { ...common, id: 'known-one', kind: 'numeric', target: 'hero.armor', operation: 'percent' },
        { ...common, id: 'known-two', kind: 'numeric', target: 'weapon.magazine', operation: 'flat', values: { comum: 2 } },
        { ...common, id: 'unknown', kind: 'numeric', description: 'Mecânica nova', target: null, operation: 'percent' }
      ]
    }],
    build: {
      hero: { id: 'hero-one', base: { 'hero.armor': 100, 'weapon.magazine': 5 } },
      slots: [
        { equipmentId: 'future-equipment', rarity: 'comum' },
        null, null, null, null, null
      ],
      conditions: {}
    }
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.summary.applied, 2);
  assert.equal(result.summary.pending, 1);
  assert.equal(result.stats['hero.armor'].final, 110);
  assert.equal(result.stats['weapon.magazine'].final, 7);
});

test('6. aliases de dispersão com contextos diferentes não colidem', () => {
  const hip = resolveCalculationAlias({
    description: 'DISPERSÃO SEM MIRA',
    operation: 'percent',
    unit: '%'
  }, catalog);
  const aimed = resolveCalculationAlias({
    description: 'DISPERSÃO AO MIRAR',
    operation: 'percent',
    unit: '%'
  }, catalog);
  const moving = resolveCalculationAlias({
    description: 'DISPERSÃO EM MOVIMENTO',
    operation: 'percent',
    unit: '%'
  }, catalog);
  assert.deepEqual(
    [hip.target, hip.context, aimed.target, aimed.context, moving.target, moving.context],
    ['weapon.spread', 'hip_fire', 'weapon.aimed_spread', 'aiming', 'weapon.moving_spread_modifier', 'moving']
  );
  assert.equal(resolveCalculationAlias({
    description: 'DISPERSÃO',
    operation: 'percent',
    unit: '%'
  }, catalog).target, null);
});

test('7. reprocessamento cria prévia antes de qualquer alteração', () => {
  const publishBody = workflowMigration.match(
    /create function public\.admin_publish_calculation_alias_v2[\s\S]*?\nend;\n\$\$;/
  )?.[0] || '';
  assert.match(publishBody, /calculation_reprocess_plans_v2/);
  assert.match(publishBody, /affectedEffectCount/);
  assert.match(publishBody, /equipmentNames/);
  assert.match(publishBody, /resultPreview/);
  assert.doesNotMatch(publishBody, /update public\.equipment_calculation_effects_v2/);
  assert.match(editorSource, /Confirmar atualização retroativa/);
});

test('8. atualização retroativa é auditável e reversível', () => {
  assert.match(workflowMigration, /calculation_reprocess_applied/);
  assert.match(workflowMigration, /calculation_reprocess_reverted/);
  assert.match(workflowMigration, /CALCULATION_REPROCESS_PREVIEW_STALE/);
  assert.match(workflowMigration, /CALCULATION_REPROCESS_REVERT_CONFLICT/);
  assert.match(workflowMigration, /admin_revert_calculation_reprocess_v2/);
  assert.match(schemaMigration, /before_effect jsonb not null/);
  assert.match(schemaMigration, /after_effect jsonb not null/);
});

test('9. onze raridades e dois bônus continuam sendo dois efeitos e 22 valores', () => {
  const variants = Object.fromEntries(DEFAULT_RARITIES.map((rarity, index) => [rarity, [
    {
      label: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI',
      value: String(10 + index),
      unit: null
    },
    {
      label: 'AO RECUO DA ARMA DO HERÓI',
      value: String(-(20 + index)),
      unit: '%'
    }
  ]]));
  const result = importDraft({ variants });
  assert.equal(result.effects.length, 2);
  assert.equal(result.rarityCount, 11);
  assert.equal(result.importedValueCount, 22);
  assert.equal(result.effects.every(effect => (
    Object.values(effect.values).filter(value => value !== null).length === 11
  )), true);
  assert.equal(result.effects.every(effect => (
    Object.keys(effect.rarityEvidence).length === 11
  )), true);
});

test('10. restrições de classe e herói continuam obrigatórias', () => {
  const heroes = [
    { id: 'slayer', class_id: 'sniper', enabled: true },
    { id: 'bastion', class_id: 'tank', enabled: true },
    { id: 'raven', class_id: 'sniper', enabled: true }
  ];
  assert.deepEqual(
    eligiblePreviewHeroes({
      id: 'sniper-item',
      class_id: 'sniper',
      enabled: true
    }, heroes).map(hero => hero.id),
    ['slayer', 'raven']
  );
  assert.deepEqual(
    eligiblePreviewHeroes({
      id: 'slayer-only',
      class_id: 'sniper',
      hero_id: 'slayer',
      is_personal: true,
      enabled: true
    }, heroes).map(hero => hero.id),
    ['slayer']
  );
});
