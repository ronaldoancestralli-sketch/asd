import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOCAL_ADAPTIVE_PUBLIC_INFLUENCE,
  PUBLIC_COMPOSITION_LEARNING_AUTHORITY,
  evaluateAdaptiveComposition,
  learnedInsight,
  learningStatusCopy,
  rankAdaptiveCandidates,
  trainAdaptiveCompositionModel
} from '../js/composition-adaptive-learning-public-bridge.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'composicoes.html'), 'utf8');
const publicUi = fs.readFileSync(path.join(ROOT, 'js/compositions-experience-v3.js'), 'utf8');
const bridgeSource = fs.readFileSync(path.join(ROOT, 'js/composition-adaptive-learning-public-bridge.js'), 'utf8');

const heroes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const observed = [{
  hero_1_id: 'a', hero_2_id: 'b', hero_3_id: 'c',
  season_id: null, matches: 120, wins: 108, win_rate: .9
}];

test('public page imports the bridge directly and keeps importmap as a second fail-closed barrier', () => {
  const bridgeSpecifier = './composition-adaptive-learning-public-' + 'bridge.js?v=20260823-server-authority-2';
  assert.ok(publicUi.includes(`from '${bridgeSpecifier}'`));
  assert.doesNotMatch(publicUi, /from '\.\/composition-adaptive-learning\.js/);
  assert.match(html, /"\.\/js\/composition-adaptive-learning\.js\?v=20260822-null-safe-1":"\.\/js\/composition-adaptive-learning-public-bridge\.js\?v=20260823-server-authority-2"/);
  assert.match(html, /\.\/js\/compositions-experience-v3\.js\?v=20260827-brain-runtime-1/);
  assert.match(html, /\.\/js\/compositions-semantic-v4\.js\?v=20260827-brain-runtime-1/);
});

test('strong local observed signal remains diagnostic and cannot alter public score', () => {
  const result = evaluateAdaptiveComposition({
    heroes,
    baseEvaluation: { score: 40 },
    teamSynergies: observed,
    heroSynergies: [],
    heroMetrics: [],
    model: null
  });
  assert.equal(PUBLIC_COMPOSITION_LEARNING_AUTHORITY, 'echo-brain-score');
  assert.equal(LOCAL_ADAPTIVE_PUBLIC_INFLUENCE, 0);
  assert.equal(result.baselineScore, 40);
  assert.equal(result.adaptiveScore, 40);
  assert.equal(result.influence, 0);
  assert.equal(result.adjustment, 0);
  assert.ok(result.diagnostic.influence > 0, 'o sinal local deve continuar disponível para diagnóstico');
  assert.notEqual(result.diagnostic.adaptiveScore, 40, 'o teste precisa provar que havia uma alternativa local que foi bloqueada');
});

test('legacy learned insight can never inject a public strength/weakness through the bridge', () => {
  const result = evaluateAdaptiveComposition({ heroes, baseEvaluation: { score: 40 }, teamSynergies: observed });
  assert.equal(learnedInsight(result), null);
});

test('legacy candidate rank is reduced to deterministic base ordering', () => {
  const candidates = [
    { score: 35, heroes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
    { score: 82, heroes: [{ id: 'd' }, { id: 'e' }, { id: 'f' }] },
    { score: 58, heroes: [{ id: 'g' }, { id: 'h' }, { id: 'i' }] }
  ];
  const ranked = rankAdaptiveCandidates(candidates, { teamSynergies: observed });
  assert.deepEqual(ranked.map(row => row.score), [82, 58, 35]);
  assert.ok(ranked.every(row => row.adaptive.influence === 0 && row.adaptive.adjustment === 0));
});

test('candidate context cannot replace the deterministic public baseline', () => {
  const candidates = [
    { score: 82, heroes: [{ id: 'd' }, { id: 'e' }, { id: 'f' }] },
    { score: 35, heroes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }
  ];
  const ranked = rankAdaptiveCandidates(candidates, { baseEvaluation: { score: 100 }, teamSynergies: observed });
  assert.deepEqual(ranked.map(row => row.score), [82, 35]);
  assert.deepEqual(ranked.map(row => row.adaptive.adaptiveScore), [82, 35]);
});

test('local diagnostic exception fails closed and preserves the public baseline', () => {
  const result = evaluateAdaptiveComposition({
    heroes,
    baseEvaluation: { score: 61 },
    model: { mode: 'trained', globalRate: .5, influence: .35, predict() { throw new Error('diagnostic exploded'); } }
  });
  assert.equal(result.baselineScore, 61);
  assert.equal(result.adaptiveScore, 61);
  assert.equal(result.influence, 0);
  assert.equal(result.adjustment, 0);
  assert.equal(result.diagnostic.error, 'diagnostic exploded');
});

test('local training exception cannot abort the public page', () => {
  const model = trainAdaptiveCompositionModel({ teamSynergies: {} });
  assert.equal(model.mode, 'diagnostic-unavailable');
  assert.equal(model.publicAuthority, 'echo-brain-score');
  assert.equal(model.publicInfluence, 0);
  assert.equal(model.influence, 0);
  assert.match(model.diagnosticError, /map|iterable|function/i);
});

test('bridge source cannot use a local adaptive score as public ranking authority', () => {
  assert.match(bridgeSource, /adaptiveScore: baselineScore/);
  assert.match(bridgeSource, /rankingScore: Number\(candidate\?\.score \|\| 0\)/);
  assert.doesNotMatch(bridgeSource, /rankingScore:\s*adaptive/);
});

test('local learning status explicitly declares zero public influence', () => {
  const copy = learningStatusCopy({ diagnostic: { influence: .35 }, model: { totalMatches: 500 } });
  assert.match(copy.label, /diagnóstico/i);
  assert.match(copy.detail, /0% de influência pública/i);
  assert.match(copy.detail, /Semantic v4 no servidor é o único árbitro/i);
});
