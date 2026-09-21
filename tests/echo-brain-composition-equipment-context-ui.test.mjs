import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'composicoes.html'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'js/compositions-semantic-v4.js'), 'utf8');

test('Composições publica a versão nova do orquestrador e explica o limite conceitual', () => {
  assert.match(html, /compositions-semantic-v4\.js\?v=20260827-brain-runtime-1/);
  assert.match(html, /potencial do catálogo atual/i);
  assert.match(html, /nunca é tratado como uma build equipada/i);
  assert.match(html, /Não é win rate nem sinergia medida/i);
});

test('strip semântico mostra influência do catálogo separadamente', () => {
  assert.match(ui, /function equipmentContextLabel\(result = \{\}\)/);
  assert.match(ui, /potencial do catálogo \$\{signed\(result\.equipmentAdjustment\)\}/);
  assert.match(ui, /confidence\.equipmentContext/);
  assert.match(ui, /heróis\/habilidades · \$\{esc\(equipmentLabel\)\}/);
});

test('cards contrafactuais não descrevem potencial como item equipado', () => {
  assert.match(ui, /Potencial do catálogo:/);
  assert.match(ui, /sem presumir uma build equipada/);
  assert.equal(ui.includes('equipamento selecionado pelo jogador'), false);
});

test('UI preserva a ordenação recebida do servidor sem rank ou equipamento local', () => {
  assert.match(ui, /recommendCompositionTeamsV4/);
  assert.match(ui, /response\.results\.map\(recommendationCard\)/);
  assert.equal(ui.includes('response.results.sort('), false);
  assert.equal(ui.includes('assessCompositionEquipmentContextV1'), false);
  assert.equal(ui.includes("from('equipments')"), false);
});
