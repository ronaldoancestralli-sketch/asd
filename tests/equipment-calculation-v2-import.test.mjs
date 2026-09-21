import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createCalculationEffectsFromImport as createCalculationEffectsFromCatalog,
  DEFAULT_RARITIES
} from '../admin/js/equipment-calculation-v2-import.js';

const boina = JSON.parse(await readFile(
  new URL('./fixtures/boina-do-comandante-variants.json', import.meta.url),
  'utf8'
));
const catalog = JSON.parse(await readFile(
  new URL('./fixtures/calculation-semantic-catalog.json', import.meta.url),
  'utf8'
));

function createCalculationEffectsFromImport(draft, options = {}) {
  return createCalculationEffectsFromCatalog(draft, {
    ...options,
    definitions: options.definitions ?? catalog.definitions,
    aliases: options.aliases ?? catalog.aliases
  });
}

function ids() {
  let value = 0;
  return () => `00000000-0000-4000-8000-${String(++value).padStart(12, '0')}`;
}

test('OCR mantém expressão composta pendente, mas reconhece fórmula e origem sem campos manuais', () => {
  const variants = Object.fromEntries(DEFAULT_RARITIES.map((slug, index) => [slug, [{
    label: 'Dano à armadura e à vida do inimigo',
    value: String(index + 1),
    unit: '%',
    raw: `+${index + 1}% Dano à armadura e à vida do inimigo`
  }]]));
  const result = createCalculationEffectsFromImport({
    variants,
    ocr: { readings: [{ name: 'equipamento-comum.png' }, { name: 'equipamento-divino.png' }] }
  }, { idFactory: ids() });

  assert.equal(result.effects.length, 1);
  assert.equal(result.rarityCount, 11);
  assert.equal(result.importedValueCount, 11);
  assert.equal(result.effects[0].description, 'Dano à armadura e à vida do inimigo');
  assert.equal(result.effects[0].target, null);
  assert.equal(result.effects[0].operation, 'percent');
  assert.equal(result.effects[0].values.comum, 1);
  assert.equal(result.effects[0].values.divino, 11);
  assert.equal(result.effects[0].sourceKind, 'admin_observation');
  assert.match(result.effects[0].sourceReference, /^admin-entry:/);
  assert.equal(result.pendingEffectCount, 1);
  assert.match(result.warnings[0], /permanece\(m\) pendente/i);
});

test('descrições parecidas não são fundidas por aproximação', () => {
  const result = createCalculationEffectsFromImport({
    variants: {
      comum: [
        { label: 'Dispersão da mira parado', value: '-5', unit: '%' },
        { label: 'Dispersão da mira em movimento', value: '-8', unit: '%' }
      ],
      raro: [
        { label: 'Dispersão da mira parado', value: '-6', unit: '%' },
        { label: 'Dispersão da mira em movimento', value: '-9', unit: '%' }
      ]
    }
  }, { idFactory: ids() });

  assert.equal(result.effects.length, 2);
  assert.deepEqual(result.effects.map(effect => effect.description), [
    'Dispersão da mira parado',
    'Dispersão da mira em movimento'
  ]);
  assert.equal(result.effects[0].values.raro, -6);
  assert.equal(result.effects[1].values.raro, -9);
  assert.deepEqual(result.effects.map(effect => effect.target), [
    'weapon.spread',
    'weapon.moving_spread_modifier'
  ]);
  assert.equal(result.effects.every(effect => effect.operation === 'percent'), true);
});

test('campos ausentes continuam null e texto incompleto exige revisão', () => {
  const result = createCalculationEffectsFromImport({
    variants: {
      estelar: [{
        label: 'Dano à armadura e à',
        value: '10',
        unit: '%',
        textReview: 'Texto incompleto'
      }]
    }
  }, { idFactory: ids() });

  assert.equal(result.effects[0].values.estelar, 10);
  assert.equal(result.effects[0].values.comum, null);
  assert.equal(result.effects[0].values.divino, null);
  assert.equal(result.effects[0].needsTextReview, true);
  assert.ok(result.warnings.some(warning => /texto parece incompleto/i.test(warning)));
});

test('operador explícito preserva o sinal sem depender do texto', () => {
  const result = createCalculationEffectsFromImport({
    variants: {
      comum: [{ label: 'Tempo de recarga', value: '12,5', operator: 'decrease_percent' }],
      raro: [{ label: 'Tempo de recarga', value: '15', operator: 'decrease_percent' }]
    }
  }, { idFactory: ids() });

  assert.equal(result.effects[0].operation, 'percent');
  assert.equal(result.effects[0].values.comum, -12.5);
  assert.equal(result.effects[0].values.raro, -15);
});

test('unidade percentual define a fórmula e o destino conhecido automaticamente', () => {
  const result = createCalculationEffectsFromImport({
    variants: { comum: [{ label: 'Armadura máxima', value: '3', unit: '%' }] }
  }, { idFactory: ids() });
  assert.equal(result.effects[0].values.comum, 3);
  assert.equal(result.effects[0].operation, 'percent');
  assert.equal(result.effects[0].target, 'hero.armor');
});

test('Boina vincula as 11 raridades a hero.movement_noise_radius', () => {
  const result = createCalculationEffectsFromImport(boina, {
    idFactory: ids()
  });

  assert.equal(result.effects.length, 1);
  assert.equal(result.rarityCount, 11);
  assert.equal(result.importedValueCount, 11);
  assert.equal(result.recognizedEffectCount, 1);
  assert.equal(result.pendingEffectCount, 0);
  assert.equal(result.effects[0].description, 'AO BARULHO DA CORRIDA DO HERÓI');
  assert.equal(result.effects[0].target, 'hero.movement_noise_radius');
  assert.equal(result.effects[0].operation, 'percent');
  assert.deepEqual(result.effects[0].values, {
    comum: -5,
    raro: -8,
    epico: -11,
    lendario: -14,
    mitico: -17,
    supremo: -20,
    grandioso: -23,
    celestial: -24,
    estelar: -25,
    imortal: -26,
    divino: -27
  });
});

test('Bornal reúne ruídos isolados do OCR em dois efeitos completos sem perder o -31% lendário', () => {
  const draft = { variants: {
    comum: [
      { label: 'AO ALCANCE DO TIRO O COM MIRA DO HERÓI', value: '17', unit: null, raw: '+17 AO ALCANCE DO TIRO O COM MIRA DO HERÓI', confidence: 0.93 },
      { label: 'AO RECUO DA ARMA DO HERÓI', value: '-25', unit: '%', raw: '-25% AO RECUO DA ARMA DO HERÓI', confidence: 0.7 }
    ],
    raro: [
      { label: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI', value: '17', unit: null, raw: '+17 AO ALCANCE DO TIRO COM MIRA DO HERÓI', confidence: 0.93 },
      { label: 'A AO RECUO DA ARMA DO HERÓI', value: '-28', unit: '%', raw: '-28% A AO RECUO DA ARMA DO HERÓI', confidence: 0.7 }
    ],
    epico: [
      { label: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI', value: '19', unit: null, raw: '+ 19 AO ALCANCE DO TIRO COM MIRA DO HERÓI', confidence: 0.93 },
      { label: 'AO R RECUO DA ARMA DO HERÓI', value: '-28', unit: '%', raw: '-28% AO R RECUO DA ARMA DO HERÓI', confidence: 0.7 }
    ],
    lendario: [
      { label: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI', value: '19', unit: null, raw: '+19 AO ALCANCE DO TIRO COM MIRA DO HERÓI', confidence: 0.92 },
      { label: '3   AO RECUO DA A ARMA DO HERÓI', value: '1', unit: '%', raw: '-3 1% AO RECUO DA A ARMA DO HERÓI', confidence: 0.69 }
    ],
    mitico: [
      { label: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI', value: '21', unit: null, raw: '+21 AO ALCANCE DO TIRO COM MIRA DO HERÓI', confidence: 0.93 },
      { label: 'AO RECUO DA ARMA DO HERÓI', value: '-31', unit: '%', raw: '-31% AO RECUO DA ARMA DO HERÓI', confidence: 0.7 }
    ],
    supremo: [
      { label: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI', value: '21', unit: null, raw: '+21 AO ALCANCE DO TIRO COM MIRA DO HERÓI', confidence: 0.9 },
      { label: 'AO RECUO DA ARMA DO HERÓI', value: '-34', unit: '%', raw: '-34% AO RECUO DA ARMA DO HERÓI', confidence: 0.67 }
    ],
    grandioso: [
      { label: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI', value: '23', unit: null, raw: '+23 AO ALCANCE DO TIRO COM MIRA DO HERÓI', confidence: 0.9 },
      { label: 'AO RECUO DA ARMA DO HERÓI', value: '-34', unit: '%', raw: '-34% AO RECUO DA ARMA DO HERÓI', confidence: 0.67 }
    ],
    celestial: [
      { label: 'AO ALCANCE DO TIRO  COM MIRA DO HERÓI', value: '23', unit: null, raw: '+23 AO ALCANCE DO TIRO  COM MIRA DO HERÓI', confidence: 0.91 },
      { label: 'AO RECUO DA ARMA DO HERÓI', value: '-37', unit: '%', raw: '-37% AO RECUO DA ARMA DO HERÓI', confidence: 0.67 }
    ],
    estelar: [
      { label: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI', value: '25', unit: null, raw: '+25 AO ALCANCE DO TIRO COM MIRA DO HERÓI', confidence: 0.9 },
      { label: 'AO RECUO DA ARMA DO HERÓI', value: '-37', unit: '%', raw: '-37% AO RECUO DA ARMA DO HERÓI', confidence: 0.67 }
    ],
    imortal: [
      { label: 'AO ALCANCE DO TIRO O COM MIRA DO HERÓI', value: '25', unit: null, raw: '+25 AO ALCANCE DO TIRO O COM MIRA DO HERÓI', confidence: 0.91 },
      { label: 'AO RECUO DA ARMA DO HERÓI', value: '-38', unit: '%', raw: '-38% AO RECUO DA ARMA DO HERÓI', confidence: 0.68 }
    ],
    divino: [
      { label: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI', value: '26', unit: null, raw: '+26 AO ALCANCE DO TIRO COM MIRA DO HERÓI', confidence: 0.91 },
      { label: 'AO RECUO DA ARMA DO HERÓI', value: '-38', unit: '%', raw: '-38% AO RECUO DA ARMA DO HERÓI', confidence: 0.68 }
    ]
  } };

  const result = createCalculationEffectsFromImport(draft, {
    idFactory: ids()
  });

  assert.equal(result.effects.length, 2);
  assert.equal(result.importedValueCount, 22);
  assert.equal(result.rarityCount, 11);
  assert.equal(result.recognizedEffectCount, 2);
  assert.equal(result.pendingEffectCount, 0);
  assert.deepEqual(result.effects.map(effect => [effect.description, effect.target, effect.operation]), [
    ['AO ALCANCE DO TIRO COM MIRA DO HERÓI', 'weapon.aimed_range', 'flat'],
    ['AO RECUO DA ARMA DO HERÓI', 'weapon.spread_factor', 'percent']
  ]);
  assert.deepEqual(Object.values(result.effects[0].values), [17, 17, 19, 19, 21, 21, 23, 23, 25, 25, 26]);
  assert.deepEqual(Object.values(result.effects[1].values), [-25, -28, -28, -31, -31, -34, -34, -37, -37, -38, -38]);
  assert.equal(Object.keys(result.effects[0].rarityEvidence).length, 11);
  assert.equal(Object.keys(result.effects[1].rarityEvidence).length, 11);
  assert.equal(
    result.effects[1].rarityEvidence.lendario.originalText,
    '-3 1% AO RECUO DA A ARMA DO HERÓI'
  );
  assert.equal(result.effects[1].values.lendario, -31);
  assert.ok(result.warnings.some(warning => /reunidas sem aproximar descrições diferentes/.test(warning)));
});

test('descrição repetida ou unidade distinta não cria pareamento ambíguo', () => {
  const result = createCalculationEffectsFromImport({ variants: {
    comum: [
      { label: 'Dispersão da arma', value: '5', unit: '%' },
      { label: 'Dispersão da arma', value: '6', unit: '°' }
    ],
    raro: [{ label: 'Dispersão da arma', value: '7', unit: '%' }]
  } }, { idFactory: ids() });
  assert.equal(result.effects.length, 2);
  assert.equal(result.effects[0].values.comum, 5);
  assert.equal(result.effects[0].values.raro, 7);
  assert.equal(result.effects[1].values.comum, 6);
  assert.equal(result.effects[1].values.raro, null);
});
