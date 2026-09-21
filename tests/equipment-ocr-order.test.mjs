import assert from 'node:assert/strict';
import test from 'node:test';

const { parseEquipmentOcr } = await import(
  new URL('../admin/js/admin-local-ocr-parser.js', import.meta.url)
);

const names = [
  ['Comum', 'comum'], ['Raro', 'raro'], ['Épico', 'epico'], ['Lendário', 'lendario'],
  ['Mítico', 'mitico'], ['Supremo', 'supremo'], ['Grandioso', 'grandioso'], ['Celestial', 'celestial'],
  ['Estelar', 'estelar'], ['Imortal', 'imortal'], ['Divino', 'divino']
];

function equipmentContext() {
  return {
    rarities: names.map(([name, slug], index) => ({ id: String(index), name, slug, rank: index + 1 })),
    slots: [],
    sets: []
  };
}

test('recognized rarity headers stay authoritative when iOS changes upload order', () => {
  const uploadOrder = [8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 10];
  const readings = uploadOrder.map((rarityIndex, sourceIndex) => ({
    name: `raridade-${rarityIndex + 1}.png`,
    sourceIndex,
    region: 'equipment-effects',
    confidence: 95,
    text: `EFEITOS POR CATEGORIA\n${names[rarityIndex][0].toUpperCase()}\n+${10 + rarityIndex} ALCANCE DE TIRO COM MIRA DO HERÓI\n${names[(rarityIndex + 1) % 11][0].toUpperCase()}`
  }));
  readings.push({
    name: 'item.png', sourceIndex: 11, region: 'equipment-identity', confidence: 97,
    text: 'BANDANA DE\nCOMBATE'
  });

  const parsed = parseEquipmentOcr(readings, equipmentContext(), {});
  assert.equal(parsed.name, 'BANDANA DE COMBATE');
  assert.equal(parsed.ocr.batch.mappingStrategy, 'rarity-header-first');
  assert.equal(parsed.ocr.batch.orderedByUpload, false);
  assert.equal(parsed.ocr.batch.uploadOrderReliable, false);
  assert.ok(parsed.ocr.batch.headerOrderConflictCount > 0);
  assert.equal(parsed.ocr.batch.rarityCount, 11);
  assert.deepEqual(parsed.ocr.batch.missingRarities, []);
  names.forEach(([, slug], rarityIndex) => {
    assert.equal(parsed.variants[slug][0].value, String(10 + rarityIndex));
  });
});

test('Bandana screenshots keep +24 in Estelar and +25 in Imortal', () => {
  const parsed = parseEquipmentOcr([
    {
      name: 'IMG_0713.jpeg',
      sourceIndex: 0,
      region: 'equipment-effects',
      confidence: 95,
      text: [
        'EFEITOS POR CATEGORIA',
        'SUPREMO',
        'GRANDIOSO',
        'CELESTIAL',
        'ESTELAR',
        '+24 AO ALCANCE DO TIRO COM MIRA DO HERÓI'
      ].join('\n')
    },
    {
      name: 'IMG_0714.jpeg',
      sourceIndex: 1,
      region: 'equipment-effects',
      confidence: 96,
      text: [
        'EFEITOS POR CATEGORIA',
        'IMORTAL',
        '+25 AO ALCANCE DO TIRO COM MIRA DO HERÓI',
        'DIVINO'
      ].join('\n')
    }
  ], equipmentContext(), {});

  assert.equal(parsed.variants.estelar[0].value, '24');
  assert.equal(parsed.variants.imortal[0].value, '25');
  assert.equal(parsed.variants.comum, undefined);
  assert.equal(parsed.variants.raro, undefined);
  assert.equal(parsed.ocr.batch.uploadOrderReliable, false);
  assert.ok(parsed.ocr.warnings.some(item => item.includes('posição foi ignorada')));
});

test('Bandana batch keeps the active header when broad OCR readings see neighboring rarities', () => {
  const expectedValues = [10, 12, 14, 16, 18, 20, 22, 23, 24, 25, 26];
  const broadHeaderOverrides = new Map([
    [3, 'SUPREMO'],
    [4, 'LENDÁRIO'],
    [6, 'ESTELAR'],
    [8, 'GRANDIOSO']
  ]);
  const readings = [];

  names.forEach(([name], sourceIndex) => {
    const value = expectedValues[sourceIndex];
    readings.push({
      name: `bandana-${sourceIndex + 1}.jpeg`,
      sourceIndex,
      region: 'equipment-effects',
      confidence: 91,
      text: `EFEITOS POR CATEGORIA\n${name.toUpperCase()}\n+${value} ALCANCE DE TIRO COM MIRA DO HERÓI`
    });

    const broadHeader = broadHeaderOverrides.get(sourceIndex);
    if (broadHeader) {
      readings.push({
        name: `bandana-${sourceIndex + 1}.jpeg`,
        sourceIndex,
        region: 'full',
        confidence: 99,
        text: `${broadHeader}\n+${value} ALCANCE DE TIRO COM MIRA DO HERÓI`
      });
    }
  });

  const parsed = parseEquipmentOcr(readings, equipmentContext(), {});

  names.forEach(([, slug], index) => {
    assert.equal(parsed.variants[slug][0].value, String(expectedValues[index]), slug);
  });
});

test('upload position only fills a missing header after other images confirm the order', () => {
  const parsed = parseEquipmentOcr([
    {
      name: 'common.png', sourceIndex: 0, region: 'equipment-effects', confidence: 95,
      text: 'COMUM\n+10 ALCANCE DE TIRO COM MIRA DO HERÓI'
    },
    {
      name: 'rare.png', sourceIndex: 1, region: 'equipment-effects', confidence: 95,
      text: 'RARO\n+11 ALCANCE DE TIRO COM MIRA DO HERÓI'
    },
    {
      name: 'epic.png', sourceIndex: 2, region: 'equipment-effects', confidence: 95,
      text: '+12 ALCANCE DE TIRO COM MIRA DO HERÓI'
    }
  ], equipmentContext(), {});

  assert.equal(parsed.variants.comum[0].value, '10');
  assert.equal(parsed.variants.raro[0].value, '11');
  assert.equal(parsed.variants.epico[0].value, '12');
  assert.equal(parsed.ocr.batch.uploadOrderReliable, true);
  assert.deepEqual(parsed.ocr.batch.uploadOrderFallbackRarities, ['Épico']);
});

test('equipment OCR preserves armor and health regeneration text without assigning engine keys', () => {
  const context = {
    rarities: [{ id: '1', name: 'Comum', slug: 'comum' }],
    slots: [], sets: []
  };
  const parsed = parseEquipmentOcr([{
    name: 'common.png', sourceIndex: 0, confidence: 95, region: 'equipment-effects',
    text: 'COMUM\n+3 ARMADURA POR SEGUNDO AO HERÓI\n+3% ARMADURA MÁXIMA DO HERÓI\n+4 VIDA POR SEGUNDO AO HERÓI'
  }], context, {});
  assert.equal(parsed.variants.comum.length, 3);
  assert.equal(parsed.variants.comum[0].key, undefined);
  assert.equal(parsed.variants.comum[1].key, undefined);
  assert.equal(parsed.variants.comum[2].key, undefined);
  assert.equal(parsed.variants.comum[0].label, 'ARMADURA POR SEGUNDO AO HERÓI');
  assert.equal(parsed.variants.comum[1].label, 'ARMADURA MÁXIMA DO HERÓI');
  assert.equal(parsed.variants.comum[2].label, 'VIDA POR SEGUNDO AO HERÓI');
});
