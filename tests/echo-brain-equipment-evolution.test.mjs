import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEquipmentEvolution } from '../js/echo-brain-equipment-evolution-v1.js';

function bundle({
  id = 'eq-1',
  description = '',
  recommendation = '',
  attributes = [{ label: 'Dano', value: '+10%' }],
  rarity = 'divino',
  bonuses = []
} = {}) {
  return {
    equipment: {
      id,
      name: 'Equipamento Teste',
      slug: 'equipamento-teste',
      slot_id: 'slot-1',
      set_id: bonuses.length ? 'set-1' : null,
      description,
      recommendation,
      enabled: true
    },
    variants: [{
      rarity_id: rarity,
      rarity_slug: rarity,
      attributes
    }],
    bonuses
  };
}

function firstNumeric(result) {
  return result.changes.find(change => change.category === 'numeric');
}

test('aumento de dano é reconhecido como buff', () => {
  const result = analyzeEquipmentEvolution(
    bundle({ attributes: [{ label: 'Dano', value: '+10%' }] }),
    bundle({ attributes: [{ label: 'Dano', value: '+15%' }] })
  );
  const change = firstNumeric(result);
  assert.equal(change.type, 'buff');
  assert.equal(change.delta, 5);
  assert.equal(result.requiresReevaluation, true);
  assert.equal(result.requiresRetraining, false);
});

test('redução de tempo de recarga é buff porque menor é melhor', () => {
  const result = analyzeEquipmentEvolution(
    bundle({ attributes: [{ label: 'Tempo de recarga da arma', value: '10%' }] }),
    bundle({ attributes: [{ label: 'Tempo de recarga da arma', value: '8%' }] })
  );
  const change = firstNumeric(result);
  assert.equal(change.type, 'buff');
  assert.equal(change.semanticDirection, 'lower_better');
  assert.equal(change.delta, -2);
});

test('redução de dano é reconhecida como nerf', () => {
  const result = analyzeEquipmentEvolution(
    bundle({ attributes: [{ label: 'Dano', value: '+15%' }] }),
    bundle({ attributes: [{ label: 'Dano', value: '+12%' }] })
  );
  assert.equal(firstNumeric(result).type, 'nerf');
  assert.equal(result.summary.nerfs, 1);
});

test('atributo desconhecido não é inventado como buff ou nerf', () => {
  const result = analyzeEquipmentEvolution(
    bundle({ attributes: [{ label: 'Eco quântico', value: '10' }] }),
    bundle({ attributes: [{ label: 'Eco quântico', value: '12' }] })
  );
  const change = firstNumeric(result);
  assert.equal(change.type, 'numeric_change');
  assert.equal(change.semanticDirection, 'unknown');
  assert.equal(change.confidence, 0.45);
});

test('números pt-BR com ponto de milhar são comparados corretamente', () => {
  const result = analyzeEquipmentEvolution(
    bundle({ attributes: [{ label: 'Dano', value: '1.455' }] }),
    bundle({ attributes: [{ label: 'Dano', value: '1.743' }] })
  );
  const change = firstNumeric(result);
  assert.equal(change.before, 1455);
  assert.equal(change.after, 1743);
  assert.equal(change.delta, 288);
  assert.equal(change.type, 'buff');
});

test('mudança de gatilho on-hit para on-kill força reaprendizado semântico', () => {
  const result = analyzeEquipmentEvolution(
    bundle({ description: 'Ao acertar um inimigo, concede +20% de dano por 3 s.' }),
    bundle({ description: 'Ao eliminar um inimigo, concede +20% de dano por 3 s.' })
  );
  const change = result.changes.find(item => item.type === 'behavior_change');
  assert.ok(change);
  assert.deepEqual(change.before.mechanics.includes('on_hit'), true);
  assert.deepEqual(change.after.mechanics.includes('on_kill'), true);
  assert.equal(result.requiresRetraining, true);
  assert.equal(result.severity, 'high');
});

test('atributo adicionado em uma raridade invalida apenas com raridade identificada', () => {
  const result = analyzeEquipmentEvolution(
    bundle({ rarity: 'mitico', attributes: [{ label: 'Dano', value: '+10%' }] }),
    bundle({ rarity: 'mitico', attributes: [{ label: 'Dano', value: '+10%' }, { label: 'Vida máxima', value: '+8%' }] })
  );
  assert.equal(result.changes.some(change => change.type === 'attribute_added'), true);
  assert.deepEqual(result.affectedRarities, ['mitico']);
  assert.equal(result.requiresReevaluation, true);
});

test('mudança de comportamento em bônus de conjunto força reavaliação e treino', () => {
  const beforeBonus = [{
    required_pieces: 4,
    title: 'Predador',
    description: 'Ao acertar um inimigo, concede +10% de dano.',
    stats: null
  }];
  const afterBonus = [{
    required_pieces: 4,
    title: 'Predador',
    description: 'Ao eliminar um inimigo, concede +10% de dano à equipe em um raio de 400.',
    stats: null
  }];
  const result = analyzeEquipmentEvolution(
    bundle({ bonuses: beforeBonus }),
    bundle({ bonuses: afterBonus })
  );
  assert.equal(result.changes.some(change => change.type === 'set_bonus_behavior_change'), true);
  assert.equal(result.requiresReevaluation, true);
  assert.equal(result.requiresRetraining, true);
});

test('mudança apenas de nome não invalida conhecimento de combate', () => {
  const before = bundle();
  const after = bundle();
  after.equipment.name = 'Equipamento Renomeado';
  const result = analyzeEquipmentEvolution(before, after);
  assert.equal(result.affectsBrain, false);
  assert.equal(result.requiresReevaluation, false);
  assert.equal(result.changeClass, 'no_brain_change');
});
