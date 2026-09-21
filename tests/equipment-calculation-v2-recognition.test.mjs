import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  adminObservationSource,
  canonicalCalculationUnit,
  gameCaptureSource,
  normalizeCalculationEffectLabel,
  recognizeCalculationOperation,
  recognizeCalculationTarget,
  recognizeImportedCalculationEffect,
  resolveCalculationAlias
} from '../admin/js/equipment-calculation-v2-recognition.js';

const catalog = JSON.parse(await readFile(
  new URL('./fixtures/calculation-semantic-catalog.json', import.meta.url),
  'utf8'
));
const { definitions, aliases } = catalog;
const target = (description, options = {}) => (
  recognizeCalculationTarget(description, definitions, aliases, options)
);

test('normaliza acentos e reconhece somente aliases exatos do catálogo', () => {
  assert.equal(normalizeCalculationEffectLabel('À ARMADURA MÁXIMA DO HERÓI'), 'a armadura maxima do heroi');
  assert.equal(target('À ARMADURA MÁXIMA DO HERÓI'), 'hero.armor');
  assert.equal(normalizeCalculationEffectLabel('10% Armadura máxima do herói'), '10% armadura maxima do heroi');
  assert.equal(target('10% Armadura máxima do herói'), null);
  assert.equal(target('Dano à armadura e à vida do inimigo'), null);
  assert.equal(target('Alcance da arma com mira'), null);
});

test('reconhece descrições reais de recarregamento e cadência da arma', () => {
  assert.equal(
    target('Tempo de recarregamento da arma'),
    'weapon.reload_time'
  );
  assert.equal(
    target('Cadência de tiro da arma do herói'),
    'weapon.fire_rate'
  );
});

test('alcance do tiro com mira usa o status mecânico específico', () => {
  assert.equal(
    target('AO ALCANCE DO TIRO COM MIRA DO HERÓI'),
    'weapon.aimed_range'
  );
  assert.equal(
    target('Alcance de tiro com mira do herói'),
    'weapon.aimed_range'
  );
  assert.equal(target('Alcance da arma com mira'), null);
});

test('recuo observado usa o fator de dispersão comprovado, nunca o índice artificial', () => {
  assert.equal(
    target('AO RECUO DA ARMA DO HERÓI'),
    'weapon.spread_factor'
  );
  assert.equal(target('Recuo do armamento'), 'weapon.spread_factor');
  assert.equal(target('Fator de dispersão'), 'weapon.spread_factor');
  assert.notEqual(target('AO RECUO DA ARMA DO HERÓI'), 'weapon.recoil');
  assert.notEqual(target('AO RECUO DA ARMA DO HERÓI'), 'weapon.spread');
});

test('Boina aponta o barulho da corrida para o status heroico exato', () => {
  assert.equal(
    normalizeCalculationEffectLabel('AO BARULHO DA CORRIDA DO HERÓI'),
    'ao barulho da corrida do heroi'
  );
  assert.equal(
    target('AO BARULHO DA CORRIDA DO HERÓI'),
    'hero.movement_noise_radius'
  );
  assert.equal(
    target('À VELOCIDADE DO HERÓI AO MIRAR'),
    'hero.aimed_movement_speed'
  );
  assert.equal(
    target('À RESISTÊNCIA DE ARMADURA DO HERÓI'),
    'hero.armor_resistance'
  );
});

test('dispersão parada e em movimento permanecem destinos distintos', () => {
  assert.equal(target('Dispersão parado'), 'weapon.spread');
  assert.equal(target('Dispersão da mira parado'), 'weapon.spread');
  assert.equal(
    target('Dispersão em movimento'),
    'weapon.moving_spread_modifier'
  );
  assert.equal(
    target('Dispersão da mira em movimento'),
    'weapon.moving_spread_modifier'
  );
  assert.equal(
    target('Dispersão da mira parado e em movimento'),
    null
  );
});

test('operação usa operador explícito e depois a unidade objetiva', () => {
  assert.equal(recognizeCalculationOperation({ operator: 'decrease_percent' }), 'percent');
  assert.equal(recognizeCalculationOperation({ operator: 'increase_flat', unit: '%' }), 'flat');
  assert.equal(recognizeCalculationOperation({ unit: '%' }), 'percent');
  assert.equal(recognizeCalculationOperation({ unit: 's' }), 'flat');
  assert.equal(canonicalCalculationUnit({ unit: 'graus', operation: 'flat' }), 'degree');
  assert.equal(canonicalCalculationUnit({ unit: '%', operation: 'percent' }), 'percent');
});

test('contexto e unidade participam da resolução sem aproximação', () => {
  const hip = resolveCalculationAlias({
    description: 'Dispersão sem mira', operation: 'percent', unit: '%'
  }, catalog);
  const aimed = resolveCalculationAlias({
    description: 'Dispersão ao mirar', operation: 'percent', unit: '%'
  }, catalog);
  assert.equal(hip.target, 'weapon.spread');
  assert.equal(hip.context, 'hip_fire');
  assert.equal(aimed.target, 'weapon.aimed_spread');
  assert.equal(aimed.context, 'aiming');

  const incompatible = resolveCalculationAlias({
    description: 'Dispersão sem mira', operation: 'flat', unit: 'segundos'
  }, catalog);
  assert.equal(incompatible.target, null);
  assert.equal(incompatible.status, 'unit_mismatch');
});

test('captura válida produz origem Master e entrada manual não simula captura', () => {
  const digest = `sha256:${'a'.repeat(64)}`;
  assert.deepEqual(gameCaptureSource({ kind: 'game_capture', digest }), {
    sourceKind: 'game_capture',
    sourceReference: `game-capture:${digest}`
  });
  assert.equal(gameCaptureSource({ kind: 'game_capture', digest: 'sha256:curto' }), null);
  assert.deepEqual(adminObservationSource('ABC'), {
    sourceKind: 'admin_observation',
    sourceReference: 'admin-entry:abc'
  });
});

test('reconhecimento importado preenche o contrato completo sem fuzzy match', () => {
  const result = recognizeImportedCalculationEffect({
    description: 'Tempo de recarga',
    unit: '%',
    definitions,
    aliases,
    evidence: { kind: 'game_capture', digest: `sha256:${'b'.repeat(64)}` },
    effectId: '00000000-0000-4000-8000-000000000001'
  });
  assert.equal(result.target, 'weapon.reload_time');
  assert.equal(result.operation, 'percent');
  assert.equal(result.sourceKind, 'game_capture');
  assert.equal(result.recognized, true);
  assert.equal(result.method, 'exact_alias');
});
