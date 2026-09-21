import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEchoBrainSemanticGraph,
  explainSemanticPath,
  semanticGraphFingerprint
} from '../js/echo-brain-semantic-graph-v1.js';

const hero = {
  id: 'slayer',
  name: 'Slayer',
  skills: [{
    id: 'thermal',
    name: 'Visão Térmica',
    description: 'Permite atirar através de paredes por 9 s, concede +10 de poder de perfuração e reduz a velocidade de movimento do herói. Ao eliminar um inimigo restaura 1 carga.',
    skill_type: 'Ativa',
    enabled: true,
    verification_status: 'verified',
    needs_recheck: false
  }]
};

const equipment = {
  id: 'penetrator',
  name: 'Lente Perfurante',
  description: 'Ao acertar, melhora a pressão através de cobertura.',
  variants: [{ rarity_slug: 'divino', attributes: { penetration_power: 10, damage_per_shot: 5 } }]
};

const setBonus = {
  id: 'set-2',
  set_id: 'sniper-set',
  required_pieces: 2,
  title: 'Precisão de conjunto',
  description: 'Aumenta o alcance de tiro e o dano.',
  stats: { aimed_range: 15 }
};

test('grafo conecta herói -> habilidade -> efeito -> atributo', () => {
  const graph = buildEchoBrainSemanticGraph({ heroes: [hero], equipments: [equipment], setBonuses: [setBonus] });
  assert.ok(graph.edges.length > 8);
  const path = explainSemanticPath(graph, { type: 'hero', id: 'slayer' }, { type: 'stat', id: 'penetration_power' }, 4);
  assert.ok(path.length >= 3, `caminho semântico inesperado: ${JSON.stringify(path)}`);
  assert.equal(path[0].relation, 'has_skill');
  assert.equal(path.at(-1).relation, 'maps_to_stat');
});

test('item e herói convergem no mesmo atributo sem criar causalidade falsa', () => {
  const graph = buildEchoBrainSemanticGraph({ heroes: [hero], equipments: [equipment] });
  const heroValues = graph.edges.filter(edge => edge.sourceType === 'hero' && edge.sourceId === 'slayer' && edge.relation === 'values_stat').map(edge => edge.targetId);
  const itemStats = graph.edges.filter(edge => edge.sourceType === 'equipment' && edge.sourceId === 'penetrator' && edge.relation === 'modifies_stat').map(edge => edge.targetId);
  assert.ok(heroValues.includes('penetration_power'));
  assert.ok(itemStats.includes('penetration_power'));
  assert.equal(graph.edges.some(edge => edge.sourceType === 'hero' && edge.targetType === 'equipment'), false);
});

test('gatilhos e bônus de conjunto ficam explícitos no grafo', () => {
  const graph = buildEchoBrainSemanticGraph({ heroes: [hero], equipments: [equipment], setBonuses: [setBonus] });
  assert.ok(graph.edges.some(edge => edge.sourceType === 'skill' && edge.relation === 'uses_trigger' && edge.targetId === 'on_kill'));
  assert.ok(graph.edges.some(edge => edge.sourceType === 'equipment' && edge.relation === 'uses_trigger' && edge.targetId === 'on_hit'));
  assert.ok(graph.edges.some(edge => edge.sourceType === 'set' && edge.relation === 'unlocks_bonus'));
});

test('fingerprint do grafo é determinístico para a mesma entrada', () => {
  const a = buildEchoBrainSemanticGraph({ heroes: [hero], equipments: [equipment], setBonuses: [setBonus] });
  const b = buildEchoBrainSemanticGraph({ heroes: [hero], equipments: [equipment], setBonuses: [setBonus] });
  assert.equal(semanticGraphFingerprint(a), semanticGraphFingerprint(b));
});
