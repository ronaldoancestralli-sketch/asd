import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const context = vm.createContext({ console });
const modules = new Map();

async function loadModule(url) {
  const target = url instanceof URL ? url : new URL(url);
  if (modules.has(target.href)) return modules.get(target.href);

  const source = readFileSync(fileURLToPath(target), 'utf8');
  const module = new vm.SourceTextModule(source, {
    context,
    identifier: target.href,
    initializeImportMeta(meta) { meta.url = target.href; }
  });
  modules.set(target.href, module);
  await module.link((specifier, referencingModule) => (
    loadModule(new URL(specifier, referencingModule.identifier))
  ));
  return module;
}

const adaptiveModule = await loadModule(new URL('../js/composition-adaptive-learning.js', import.meta.url));
await adaptiveModule.evaluate();

const { evaluateAdaptiveComposition } = adaptiveModule.namespace;
const heroes = [
  { id: 'hero-a', name: 'A', skills: [] },
  { id: 'hero-b', name: 'B', skills: [] },
  { id: 'hero-c', name: 'C', skills: [] },
];
const result = evaluateAdaptiveComposition({
  heroes,
  baseEvaluation: { score: 50 },
  model: { mode: 'cold-start', globalRate: 0.5, seasonId: null, influence: 0 },
  teamSynergies: [],
  heroSynergies: [],
  heroMetrics: [],
});

assert.equal(result.adaptiveScore, 50, 'cold start sem histórico deve preservar a nota-base');
assert.equal(result.influence, 0, 'histórico ausente não pode ganhar influência');
assert.equal(result.direct, null, 'trio sem observação direta deve continuar válido');
assert.equal(result.pair, null, 'trio sem observação de pares deve continuar válido');
assert.equal(result.hero, null, 'trio sem métricas individuais deve continuar válido');

console.log('Composições adaptativas: cold start sem histórico executa sem exceção e preserva a nota-base.');
