import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseEquipmentAttributeMagnitude,
  normalizeEquipmentAttributesForCalculation
} from '../js/equipment-attribute-calculation.js';
import { applyEquipmentStats, EQUIPMENT_ATTRIBUTE_CATALOG } from '../js/game-stat-engine.js';
import { previewEquipmentAttribute } from '../admin/js/equipment-attribute-preview.js';

test('o operador explícito transforma o valor coletado em magnitude', () => {
  assert.equal(parseEquipmentAttributeMagnitude('-12'), 12);
  assert.equal(parseEquipmentAttributeMagnitude('−12'), 12);
  assert.equal(parseEquipmentAttributeMagnitude('+3,5%'), 3.5);

  assert.deepEqual(
    normalizeEquipmentAttributesForCalculation([
      { label: 'Vida', value: '-10', operator: 'increase_flat' },
      { label: 'Armadura', value: '+8', operator: 'decrease_flat' },
      { label: 'Velocidade de movimento', value: '-5%', operator: 'increase_percent' },
      { label: 'Tempo de recarga', value: '+20', operator: 'decrease_percent' }
    ]),
    {
      'Vida absoluto': 10,
      'Armadura absoluto': -8,
      'Velocidade de movimento percentual': 5,
      'Tempo de recarga percentual': -20
    }
  );
});

test('cada posição mantém sua própria base em todas as raridades', () => {
  const rarities = [
    { aimedRange: '10', reload: '5' },
    { aimedRange: '12', reload: '10' },
    { aimedRange: '14', reload: '20' }
  ];

  const results = rarities.map(({ aimedRange, reload }) => {
    const stats = normalizeEquipmentAttributesForCalculation([
      {
        label: 'Alcance do tiro com mira do herói',
        value: aimedRange,
        operator: 'increase_flat'
      },
      {
        label: 'Tempo de recarga',
        value: reload,
        operator: 'decrease_percent'
      }
    ]);

    return applyEquipmentStats(
      { aimed_range: 100, reload_time: 100 },
      [stats]
    ).final;
  });

  assert.deepEqual(results.map(row => row.aimed_range), [110, 112, 114]);
  assert.deepEqual(results.map(row => row.reload_time), [95, 90, 80]);
});

test('registro legado sem operador não recebe direção inventada', () => {
  assert.deepEqual(
    normalizeEquipmentAttributesForCalculation([
      { label: 'Vida', value: '-10' },
      { label: 'Tempo de recarga %', value: '5' }
    ]),
    {
      Vida: '-10',
      'Tempo de recarga %': '5'
    }
  );

  assert.deepEqual(
    normalizeEquipmentAttributesForCalculation({ Vida: -10 }),
    { Vida: -10 }
  );
});

test('operador explícito define também se a operação é flat ou percentual', () => {
  const flat = normalizeEquipmentAttributesForCalculation([
    { label: 'Vida %', value: '10', operator: 'increase_flat' }
  ]);
  const percent = normalizeEquipmentAttributesForCalculation([
    { label: 'Vida', value: '10', operator: 'increase_percent' }
  ]);

  assert.deepEqual(flat, { 'Vida % absoluto': 10 });
  assert.deepEqual(percent, { 'Vida percentual': 10 });
});

const OPERATOR_RESULTS = [
  ['increase_flat', 203, 'add'], ['decrease_flat', 197, 'add'],
  ['increase_percent', 206, 'percent'], ['decrease_percent', 194, 'percent']
];

for (const concept of EQUIPMENT_ATTRIBUTE_CATALOG) {
  test(`${concept.label}: os quatro operadores prevalecem sobre os defaults do catálogo`, () => {
    for (const [operator, expected, operation] of OPERATOR_RESULTS) {
      const attribute = { label: concept.label, value: '3', operator };
      const normalized = normalizeEquipmentAttributesForCalculation([attribute]);
      const result = applyEquipmentStats({ [concept.target]: 200 }, [JSON.parse(JSON.stringify(normalized))]);
      assert.equal(result.final[concept.target], expected, operator);
      assert.equal(result.applied[0]?.operation, operation, operator);
      const preview = previewEquipmentAttribute(attribute);
      assert.equal(preview.status, 'registry_unavailable');
      assert.equal(preview.rule, undefined); // no authority inferred from the legacy diagnostic
    }
  });
}

test('aliases com default percentual e chaves estruturadas preservam alvo e operador', () => {
  for (const label of ['Vida máxima do herói', 'À VIDA A MÁXIMA DO HERÓI A', 'health_max_pct', 'Vida %', 'Vida percentual']) {
    for (const [operator, expected] of OPERATOR_RESULTS) {
      const stats = normalizeEquipmentAttributesForCalculation([{ label, value: '−3%', operator }]);
      assert.equal(applyEquipmentStats({ health: 200 }, [stats]).final.health, expected, `${label} ${operator}`);
    }
  }
  for (const [operator, expected] of OPERATOR_RESULTS) {
    const stats = normalizeEquipmentAttributesForCalculation([{ label: 'Velocidade de recarga', value: '3', operator }]);
    assert.equal(applyEquipmentStats({ reload_time: 200 }, [stats]).final.reload_time, expected);
  }
});

test('prévia distingue seleção ausente, decimal com vírgula e valor inválido', () => {
  assert.equal(previewEquipmentAttribute({ label: 'Vida', value: '3' }).status, 'operator_required');
  assert.equal(previewEquipmentAttribute({ label: 'Vida', value: '3', operator: 'inventado' }).status, 'operator_required');
  const preview = previewEquipmentAttribute({ label: 'Vida', value: '+3,5%', operator: 'decrease_percent' });
  assert.equal(preview.status, 'registry_unavailable');
  assert.equal(parseEquipmentAttributeMagnitude('+3,5%'), 3.5);
  for (const value of ['', '0x10', '3.5.6', 'Infinity', '3abc']) {
    const attribute = { label: 'Vida', value, operator: 'increase_flat' };
    assert.equal(previewEquipmentAttribute(attribute).status, 'invalid');
    const result = applyEquipmentStats({ health: 200 }, [normalizeEquipmentAttributesForCalculation([attribute])]);
    assert.equal(result.final.health, 200);
    assert.equal(result.applied.length, 0);
  }
});

test('percentuais sequenciais e ordem de peças continuam exatos', () => {
  const n = operator => normalizeEquipmentAttributesForCalculation([{ label: 'Vida', value: '10', operator }]);
  assert.ok(Math.abs(applyEquipmentStats({ health: 200 }, [n('increase_percent'), n('increase_percent')]).final.health - 242) < 1e-9);
  assert.equal(applyEquipmentStats({ health: 200 }, [n('increase_flat'), n('decrease_percent')]).final.health, 189);
  assert.equal(applyEquipmentStats({ health: 200 }, [n('decrease_percent'), n('increase_flat')]).final.health, 190);
});
