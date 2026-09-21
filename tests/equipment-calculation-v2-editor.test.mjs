import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const moduleUrl = new URL('../admin/js/equipment-calculation-v2.js', import.meta.url);
const cssUrl = new URL('../admin/css/equipment-calculation-v2.css', import.meta.url);
const htmlUrl = new URL('../admin/equipment-editor.html', import.meta.url);
const [source, css, html] = await Promise.all([
  readFile(moduleUrl, 'utf8'),
  readFile(cssUrl, 'utf8'),
  readFile(htmlUrl, 'utf8')
]);

test('usa somente o cliente Supabase compartilhado e o kernel v2', () => {
  assert.match(source, /from '\.\.\/\.\.\/js\/supabase\.js\?/);
  assert.match(source, /from '\.\.\/\.\.\/js\/calculation-v2-engine\.js\?/);
  assert.doesNotMatch(source, /echo-brain|effect-central/i);
});

test('monta exclusivamente no hook explícito e aceita o ID criado pelo editor principal', () => {
  assert.match(source, /document\.querySelector\('\[data-calculation-v2-mount\]'\)/);
  assert.match(source, /new URLSearchParams\(location\.search\)\.get\('id'\)/);
  assert.match(source, /equipment:save-success/);
  assert.match(source, /event\.detail\?\.savedId/);
  assert.match(html, /initEquipmentCalculationV2Editor\(\{\s*importedDraft\s*\}\)/);
  assert.doesNotMatch(source, /if \(document\.querySelector\('\[data-calculation-v2-mount\]'\)\)/);
});

test('um efeito tem UUID estável e não deriva identidade da posição ou descrição', () => {
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /id: fallback\.id/);
  assert.doesNotMatch(source, /id:\s*`[^`]*\$\{index\}/);
});

test('a tabela contém exatamente as onze raridades canônicas', () => {
  const block = source.match(/const RARITIES = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
  const slugs = [...block.matchAll(/slug: '([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(slugs, [
    'comum', 'raro', 'epico', 'lendario', 'mitico', 'supremo',
    'grandioso', 'celestial', 'estelar', 'imortal', 'divino'
  ]);
  assert.match(source, /state\.rarities\.map\(rarity =>/);
  assert.match(source, /function ensureStarterEffect\(\)/);
  assert.match(source, /ensureStarterEffect\(\);\s*host\.replaceChildren\(\)/);
  assert.doesNotMatch(source, /Nenhum efeito v2 cadastrado/);
});

test('leitura reconhece vínculos exatos, mantém divergências pendentes e só confirma após salvar o equipamento', () => {
  const importBlock = source.match(/function applyImportedDraft\([\s\S]*?\n\}\n\nfunction applyPendingImport/)?.[0] || '';
  assert.match(source, /createCalculationEffectsFromImport/);
  assert.match(source, /echoarena:image-import-result/);
  assert.match(source, /definitions:\s*state\.definitions/);
  assert.match(source, /state\.dirty = true/);
  assert.match(source, /state\.autoConfirmAfterEquipmentSave/);
  assert.match(source, /effect\.sourceKind === 'game_capture'/);
  assert.match(source, /event\.detail\?\.attributesConfirmed !== true/);
  assert.match(source, /data-action="apply-import"/);
  assert.doesNotMatch(importBlock, /admin_publish_equipment_calculation_v2/);
  assert.match(source, /state\.ocrTextReviewIds\.has\(effect\.id\)/);
  assert.match(source, /confira e confirme o texto completo na imagem antes de salvar/);
  assert.match(source, /equipmentEffectTextReview\(next\.description\)/);
});

test('campo numérico vazio permanece null e zero digitado continua zero', () => {
  const parser = source.match(/function parseNullableNumber\(value\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(parser, /if \(raw === ''\) return null;/);
  assert.match(parser, /Number\(raw\)/);
  assert.doesNotMatch(parser, /\|\|\s*0|\?\?\s*0/);
});

test('salvamento usa revisão otimista e só confirma após releitura semântica', () => {
  assert.match(source, /admin_save_equipment_calculation_v2/);
  assert.match(source, /p_expected_revision: expectedRevision/);
  assert.match(source, /const readback = await readWorkspace\(\)/);
  assert.match(source, /sameSemantics\(effects, readback\.effects/);
  assert.match(source, /Nada foi marcado como confirmado/);
});

test('confirmação salva e publica em uma ação, mantendo as duas releituras', () => {
  assert.match(source, /data-action="save">Salvar para depois/);
  assert.match(source, /data-action="confirm">Confirmar cálculo no site/);
  assert.match(source, /async function confirmCalculation\(\)/);
  assert.match(source, /await saveDraft\(\{ quiet: true \}\)/);
  assert.match(source, /admin_publish_equipment_calculation_v2/);
  assert.match(source, /p_expected_publication: expectedPublication/);
  assert.match(source, /Boolean\(text\(readback\.published\?\.fingerprint\)\)/);
  assert.match(source, /falso sucesso/);
});

test('regra guarda destino, operação, alcance, condição esperada e fonte', () => {
  for (const field of [
    'description', 'kind', 'target', 'operation', 'scope', 'condition',
    'conditionExpected', 'evaluatedOn', 'sourceKind', 'sourceReference'
  ]) {
    assert.match(source, new RegExp(`data-effect-field=.?["']?\\$?\\{?${field}|'${field}'`));
  }
  assert.match(source, /effect\.conditionExpected/);
  assert.match(source, /scope === 'self' \? 'source'/);
});

test('rascunho e simulação local passam pelo mesmo calculateBuild', () => {
  assert.match(source, /const publicResult = calculateBuild\(publicInput\)/);
  assert.match(source, /const localResult = calculateBuild\(localInput\)/);
  assert.match(source, /localSimulation \|\| publicReviewed \? 'reviewed' : 'draft'/);
  assert.match(source, /não publica nem aprova a regra/);
});

test('prévia usa heróis públicos e a view de bases reais', () => {
  assert.match(source, /from\('heroes'\)/);
  assert.match(source, /eq\('enabled', true\)/);
  assert.match(source, /from\('hero_complete_base_stats'\)/);
  assert.match(source, /hero_stats,weapon_stats/);
  assert.match(source, /const sourceBase = key \? sourceValue\(bucket, key\) : null/);
  assert.match(source, /sourceBase \?\? finiteOrNull\(definition\.defaultBase\)/);
});

test('efeito sem vínculo permanece visível e não bloqueia resultados parciais', () => {
  assert.match(source, /effect\.kind === 'unresolved'/);
  assert.match(source, /nenhum número foi inventado/);
  assert.match(source, /\['pending', 'invalid'\]\.includes\(trace\.status\)/);
  assert.match(source, /title\.textContent = 'Não calculado'/);
  assert.match(source, /trace\.rawLabel \|\| trace\.description/);
  assert.match(source, /if \(effect\.target && !definitionIds\.has\(effect\.target\)\)/);
  assert.match(source, /typeof value !== 'number' \|\| !Number\.isFinite\(value\)\) return '—'/);
});

test('layout mantém tabela compacta e adaptação para telas estreitas', () => {
  assert.match(css, /\.calculation-v2-rarity-table/);
  assert.match(css, /min-width:\s*920px/);
  assert.match(css, /@media \(max-width:\s*760px\)/);
  assert.match(css, /\.calculation-v2-table-scroll\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(source, /dataCorrectionPanel|correction\.dataset\.correctionPanel|dataset\.correctionPanel/);
  assert.match(source, /Corrigir reconhecimento/);
  assert.match(source, /td\.dataset\.rarity = rarity\.name/);
});
