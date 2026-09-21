import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const [createBuild, createBuildEntry, compareBuild, editorHtml, createHtml, compareHtml] = await Promise.all([
  readFile(new URL('js/criar-build.js', root), 'utf8'),
  readFile(new URL('js/criar-build-entry.js', root), 'utf8'),
  readFile(new URL('js/comparar-build.js', root), 'utf8'),
  readFile(new URL('admin/equipment-editor.html', root), 'utf8'),
  readFile(new URL('criar-build.html', root), 'utf8'),
  readFile(new URL('comparar-build.html', root), 'utf8'),
]);

test('mesa e comparação usam apenas o runtime de cálculo v2', () => {
  for (const source of [createBuild, compareBuild]) {
    assert.match(source, /calculation-v2-build-adapter\.js/);
    assert.doesNotMatch(source, /build-analise|game-stat-engine|status-registry-v1|equipment-attribute-calculation/);
    assert.doesNotMatch(source, /equipment_rarity_levels|legacyLevelsResult|calculationSource/);
  }
  assert.match(createBuild, /effectRowsForEquipment/);
  assert.match(createBuildEntry, /calc=20260915-calculation-v2-1/);
  assert.match(compareHtml, /comparar-build\.js\?v=18[^"']*calc=20260915-calculation-v2-1/);
  assert.match(compareBuild, /Number\.isFinite\(mineTotal\[raw\.id\]\)/);
});

test('editor expõe uma única aba objetiva de cálculo v2', () => {
  assert.match(editorHtml, /data-tab="calculation"/);
  assert.match(editorHtml, /data-calculation-v2-mount/);
  assert.match(editorHtml, /equipment-calculation-v2\.js/);
  assert.match(editorHtml, /equipment-calculation-v2\.css/);
  assert.doesNotMatch(editorHtml, /data-tab="effect-central"|data-effect-central-mount/);
});

test('mesa oferece condições explícitas e apresentação v2', () => {
  assert.match(createHtml, /id="calculation-v2-conditions"/);
  assert.match(createHtml, /css\/calculation-v2\.css/);
  assert.match(createBuild, /Não informado/);
  assert.match(createBuild, /renderCalculationDetailsV2/);
});
