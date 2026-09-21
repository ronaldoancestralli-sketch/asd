import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareCounterfactual,
  rankCounterfactuals,
  explainCounterfactual
} from '../js/echo-brain-counterfactual-v1.js';
import {
  evaluateEquipmentSwapCounterfactualsV1,
  oneChangeAtATimeInvariantV1
} from '../js/echo-brain-build-counterfactual-v1.js';

test('contrafactual separa ganho de score de custo mecânico', () => {
  const result = compareCounterfactual(
    { key: 'A', finalScore: 70, functionalSynergy: 68, semanticSynergy: 72, observedPerformance: 71, mechanicalDemand: 40, confidence: { overall: .9 } },
    { key: 'B', finalScore: 78, functionalSynergy: 76, semanticSynergy: 82, observedPerformance: 75, mechanicalDemand: 55, confidence: { overall: .88 } }
  );
  assert.equal(result.delta, 8);
  assert.equal(result.verdict, 'improves');
  const demand = result.changedComponents.find(item => item.key === 'mechanicalDemand');
  assert.equal(demand.delta, 15);
  assert.equal(demand.utilityDelta, -15);
  assert.equal(demand.worsened, true);
  assert.match(explainCounterfactual(result), /melhora 8\.0 pontos/);
});

test('ranking não inventa valores ausentes', () => {
  const baseline = { key: 'A', finalScore: 60 };
  const ranked = rankCounterfactuals(baseline, [
    { key: 'unknown', finalScore: null },
    { key: 'better', finalScore: 64 },
    { key: 'worse', finalScore: 52 }
  ]);
  assert.equal(ranked[0].candidate.key, 'better');
  assert.equal(ranked[1].candidate.key, 'worse');
  assert.equal(ranked[2].candidate.key, 'unknown');
  assert.equal(ranked[2].comparison.delta, null);
});

test('invariante one-change bloqueia comparação com duas trocas simultâneas', () => {
  const before = { equipados: { a: { id: '1' }, b: { id: '2' } } };
  const one = { equipados: { a: { id: '3' }, b: { id: '2' } } };
  const two = { equipados: { a: { id: '3' }, b: { id: '4' } } };
  assert.equal(oneChangeAtATimeInvariantV1(before, one).valid, true);
  assert.deepEqual(oneChangeAtATimeInvariantV1(before, one).changedSlots, ['a']);
  assert.equal(oneChangeAtATimeInvariantV1(before, two).valid, false);
});

test('swap de equipamento reavalia cada alternativa isoladamente', async () => {
  const context = { equipados: { head: { databaseId: 'old', fit: 60 }, chest: { databaseId: 'same', fit: 50 } } };
  const evaluator = async ctx => {
    const item = ctx.equipados.head;
    const fit = item.fit;
    return {
      echoBrain: {
        buildFitScore: fit,
        explanationConfidence: .9,
        calculationCoverage: 1,
        conflicts: fit < 60 ? [{ stat: 'x' }] : [],
        strongestSynergies: fit >= 70 ? [{ stat: 'y' }] : []
      }
    };
  };
  const result = await evaluateEquipmentSwapCounterfactualsV1({
    context,
    slotKey: 'head',
    candidates: [
      { databaseId: 'better', fit: 80 },
      { databaseId: 'worse', fit: 45 }
    ],
    evaluateBuild: evaluator
  });
  assert.equal(result.alternatives[0].item.databaseId, 'better');
  assert.equal(result.alternatives[0].comparison.delta, 20);
  assert.equal(result.alternatives[1].comparison.delta, -15);
  assert.equal(context.equipados.head.databaseId, 'old', 'contexto original não pode ser mutado');
});
