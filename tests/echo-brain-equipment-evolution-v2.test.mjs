import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { analyzeEquipmentEvolutionV2 } from '../js/echo-brain-equipment-evolution-v2.js';

test('trocar somente o operador altera o snapshot e solicita reavaliação do Brain', () => {
  for (const operator of ['decrease_flat', 'increase_percent', 'decrease_percent']) {
    const before = bundle();
    before.variants[0].attributes = [{ label: 'Vida', value: '3', operator: 'increase_flat' }];
    const after = structuredClone(before);
    after.variants[0].attributes[0].operator = operator;
    const result = analyzeEquipmentEvolutionV2(before, after);
    assert.equal(result.affectsBrain, true);
    assert.equal(result.requiresReevaluation, true);
    assert.equal(result.changeClass, 'behavior_change');
    assert.notDeepEqual(result.before, result.after);
    assert.equal(result.changes[0].type, 'attribute_operator_change');
    assert.equal(result.changes[0].before, 'increase_flat');
    assert.equal(result.changes[0].after, operator);
    assert.equal(analyzeEquipmentEvolutionV2(after, structuredClone(after)).affectsBrain, false);
  }
});

test('reconciliação reabre o snapshot com operadores e ordem original, sem criar mudanças falsas', () => {
  const original = bundle();
  original.variants[0].attributes = [
    { label: 'Vida', value: '3', operator: 'increase_percent' },
    { label: 'Armadura', value: '5', operator: 'decrease_flat' }
  ];
  const snapshot = analyzeEquipmentEvolutionV2(null, original).after;
  const source = fs.readFileSync(new URL('../admin/js/echo-brain-equipment-reconcile.js', import.meta.url), 'utf8');
  const start = source.indexOf('function rehydrateSnapshot(');
  const context = vm.createContext({});
  vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), context);
  const restored = JSON.parse(JSON.stringify(context.rehydrateSnapshot(snapshot)));
  assert.deepEqual(restored.variants[0].attributes, original.variants[0].attributes);
  const result = analyzeEquipmentEvolutionV2(restored, original);
  assert.equal(result.affectsBrain, false);
  assert.deepEqual(result.before, result.after);
});

function bundle({ description = '', recommendation = '', bonusDescription = '' } = {}) {
  return {
    equipment: {
      id: 'eq-semantic',
      name: 'Semântico',
      slug: 'semantico',
      slot_id: 'slot-1',
      set_id: bonusDescription ? 'set-1' : null,
      description,
      recommendation,
      enabled: true
    },
    variants: [{
      rarity_slug: 'divino',
      attributes: [{ label: 'Dano', value: '+10%' }]
    }],
    bonuses: bonusDescription ? [{
      required_pieces: 4,
      title: 'Sinergia',
      description: bonusDescription,
      stats: null
    }] : []
  };
}

test('mesmo gatilho com magnitude diferente continua sendo mudança semântica', () => {
  const result = analyzeEquipmentEvolutionV2(
    bundle({ description: 'Ao acertar um inimigo, concede +20% de dano por 3 s.' }),
    bundle({ description: 'Ao acertar um inimigo, concede +35% de dano por 3 s.' })
  );
  const change = result.changes.find(item => item.type === 'semantic_value_change');
  assert.ok(change);
  assert.equal(change.mechanicsChanged, false);
  assert.equal(change.numericChanged, true);
  assert.equal(result.affectsBrain, true);
  assert.equal(result.requiresReevaluation, true);
  assert.equal(result.requiresRetraining, true);
  assert.equal(result.severity, 'high');
});

test('mudança de alvo próprio para equipe é mudança de comportamento', () => {
  const result = analyzeEquipmentEvolutionV2(
    bundle({ description: 'Ao eliminar um inimigo, concede +20% de dano por 3 s.' }),
    bundle({ description: 'Ao eliminar um inimigo, concede +20% de dano à equipe por 3 s.' })
  );
  const change = result.changes.find(item => item.type === 'behavior_change');
  assert.ok(change);
  assert.equal(change.mechanicsChanged, true);
  assert.equal(change.after.scopes.includes('team'), true);
  assert.equal(result.requiresRetraining, true);
});

test('mudança de efeito dano para cura é detectada mesmo com mesmo valor', () => {
  const result = analyzeEquipmentEvolutionV2(
    bundle({ description: 'Ao acertar um inimigo, concede +20% de dano por 3 s.' }),
    bundle({ description: 'Ao acertar um inimigo, recupera 20% de vida por 3 s.' })
  );
  const change = result.changes.find(item => item.type === 'behavior_change');
  assert.ok(change);
  assert.equal(change.before.effects.includes('damage'), true);
  assert.equal(change.after.effects.includes('healing'), true);
  assert.equal(result.requiresRetraining, true);
});

test('mudança numérica em bônus de conjunto não passa como texto editorial', () => {
  const result = analyzeEquipmentEvolutionV2(
    bundle({ bonusDescription: 'Ao acertar um inimigo, concede +15% de cadência por 3 s.' }),
    bundle({ bonusDescription: 'Ao acertar um inimigo, concede +25% de cadência por 3 s.' })
  );
  const change = result.changes.find(item => item.type === 'set_bonus_semantic_value_change');
  assert.ok(change);
  assert.equal(change.numericChanged, true);
  assert.equal(result.requiresReevaluation, true);
  assert.equal(result.requiresRetraining, true);
});

test('edição puramente editorial sem efeito/número não invalida o Brain', () => {
  const result = analyzeEquipmentEvolutionV2(
    bundle({ description: 'Equipamento recomendado para jogadores experientes.' }),
    bundle({ description: 'Equipamento indicado para jogadores experientes.' })
  );
  assert.equal(result.affectsBrain, false);
  assert.equal(result.requiresReevaluation, false);
});
