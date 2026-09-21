
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const parserSource = await readFile(
  new URL('../admin/js/admin-local-ocr-parser.js', import.meta.url),
  'utf8'
);
const {
  parseHeroOcr,
  parseEquipmentOcr
} = await import(
  'data:text/javascript;base64,' +
  Buffer.from(parserSource, 'utf8').toString('base64')
);

const heroContext = {
  classes: [
    { id: '1', name: 'Tanque', slug: 'tanque' },
    { id: '2', name: 'Tropas', slug: 'tropas' }
  ],
  rarities: [
    { id: 'r1', name: 'Supremo', slug: 'supremo' },
    { id: 'r2', name: 'Divino', slug: 'divino' }
  ]
};

test('hero OCR only maps values that are visible beside known labels', () => {
  const parsed = parseHeroOcr([{
    name: 'status.png',
    confidence: 91,
    text: [
      'RAMSAY',
      'TANQUE',
      'SUPREMO',
      'PODER 476',
      'VIDA 2032',
      'ARMADURA 323',
      'ALCANCE DE VISÃO DO HERÓI 700',
      'DANO DA ARMA POR TIRO 332',
      'TIROS POR SEGUNDO 2,1',
      'TEMPO DE RECARGA DA ARMA 1,8',
      'TAMANHO DO PENTE 12'
    ].join('\n')
  }], heroContext, {});

  assert.equal(parsed.hero.name, 'RAMSAY');
  assert.equal(parsed.hero.class, 'tanque');
  assert.equal(parsed.meta.rarity, 'supremo');
  assert.equal(parsed.status.power, 476);
  assert.equal(parsed.status.health, 2032);
  assert.equal(parsed.status.armor, 323);
  assert.equal(parsed.status.visionRange, 700);
  assert.equal(parsed.weaponDetails.damagePerShot, 332);
  assert.equal(parsed.weaponDetails.shotsPerSecond, 2.1);
  assert.equal(parsed.weaponDetails.reloadTime, 1.8);
  assert.equal(parsed.weaponDetails.magazineSize, 12);
  assert.equal(parsed.weaponDetails.aimedRange, null);
  assert.equal(parsed.hero.active, null);
});

test('hero OCR keeps the current identity while editing', () => {
  const parsed = parseHeroOcr([{
    name: 'screen.png',
    confidence: 88,
    text: 'PODER 500\nVIDA 2100'
  }], heroContext, { id: 'h1', name: 'Ramsay', slug: 'ramsay' });

  assert.equal(parsed.hero.name, 'Ramsay');
  assert.equal(parsed.status.power, 500);
  assert.equal(parsed.status.health, 2100);
});

const equipmentContext = {
  rarities: [
    { id: '1', name: 'Lendário', slug: 'lendario' },
    { id: '2', name: 'Mítico', slug: 'mitico' }
  ],
  slots: [
    { id: 's1', name: 'Perna', slug: 'pernas' }
  ],
  sets: [
    { id: 'set1', name: 'Conjunto Guardião', slug: 'guardiao' }
  ]
};

test('equipment OCR groups visible rarity attributes and bonus effects', () => {
  const parsed = parseEquipmentOcr([{
    name: 'equipment.png',
    confidence: 89,
    text: [
      'Implante E.Y.E.',
      'Perna',
      'Conjunto Guardião',
      'LENDÁRIO',
      '+10% Dano da arma à vida do inimigo',
      'MÍTICO',
      '+12% Dano da arma à vida do inimigo',
      '2 peças',
      '+5% Alcance de visão do herói'
    ].join('\n')
  }], equipmentContext, {});

  assert.equal(parsed.name, 'Implante E.Y.E.');
  assert.equal(parsed.slot, 'pernas');
  assert.equal(parsed.setName, 'Conjunto Guardião');
  assert.equal(parsed.variants.lendario[0].value, '10');
  assert.equal(parsed.variants.lendario[0].unit, '%');
  assert.equal(parsed.variants.mitico[0].value, '12');
  assert.equal(parsed.bonuses[0].required_pieces, 2);
  assert.equal(parsed.bonuses[0].stats.effects[0].value, '5');
  assert.equal(parsed.enabled, null);
});

test('equipment OCR never creates an unknown set implicitly', () => {
  const parsed = parseEquipmentOcr([{
    name: 'equipment.png',
    confidence: 90,
    text: 'Novo Implante\nConjunto Inventado\nLENDÁRIO\n+10% Dano da arma à vida do inimigo'
  }], equipmentContext, {});

  assert.equal(parsed.setName, 'Inventado');
  assert.ok(parsed.ocr.warnings.some(item => item.includes('não existe no catálogo')));
});

test('equipment OCR recompõe percentual com algarismos separados sem deixar número no rótulo', () => {
  const parsed = parseEquipmentOcr([{
    name: 'bornal-lendario.png',
    confidence: 92,
    text: 'LENDÁRIO\n-3 1% AO RECUO DA A ARMA DO HERÓI'
  }], equipmentContext, { name: 'BORNAL DA SPECNAZ DO SLAYER' });

  assert.equal(parsed.variants.lendario[0].value, '-31');
  assert.equal(parsed.variants.lendario[0].unit, '%');
  assert.equal(parsed.variants.lendario[0].label, 'AO RECUO DA A ARMA DO HERÓI');
  assert.equal(parsed.variants.lendario[0].raw, '-3 1% AO RECUO DA A ARMA DO HERÓI');
});

test('equipment OCR preserves every rarity when repeated headers come from many images', () => {
  const rarityNames = [
    ['Comum', 'comum'],
    ['Raro', 'raro'],
    ['Épico', 'epico'],
    ['Lendário', 'lendario'],
    ['Mítico', 'mitico'],
    ['Supremo', 'supremo'],
    ['Grandioso', 'grandioso'],
    ['Celestial', 'celestial'],
    ['Estelar', 'estelar'],
    ['Imortal', 'imortal'],
    ['Divino', 'divino']
  ];
  const context = {
    rarities: rarityNames.map(([name, slug], index) => ({
      id: `r${index + 1}`,
      name,
      slug,
      rank: index + 1
    })),
    slots: [],
    sets: []
  };

  const readings = rarityNames.flatMap(([activeName], activeIndex) => {
    const lines = [
      'EFEITOS POR CATEGORIA',
      ...rarityNames.flatMap(([name], index) => (
        index === activeIndex
          ? [name.toUpperCase(), `+${10 + index} ALCANCE DE TIRO COM MIRA DO HERÓI`]
          : [name.toUpperCase()]
      ))
    ];

    return [
      {
        name: `raridade-${activeIndex + 1}.jpeg`,
        region: 'equipment-effects',
        method: 'efeitos do equipamento',
        confidence: 94,
        text: lines.join('\n')
      },
      {
        name: `raridade-${activeIndex + 1}.jpeg`,
        region: 'full',
        method: 'painel completo',
        confidence: 90,
        text: lines.join('\n')
      }
    ];
  });

  readings.push({
    name: 'item-final.jpeg',
    region: 'equipment-identity',
    method: 'identidade do equipamento',
    confidence: 96,
    text: 'BANDANA DE\nCOMBATE'
  });

  const parsed = parseEquipmentOcr(readings, context, {});

  assert.equal(parsed.name, 'BANDANA DE COMBATE');
  assert.deepEqual(Object.keys(parsed.variants), rarityNames.map(([, slug]) => slug));
  rarityNames.forEach(([, slug], index) => {
    assert.equal(parsed.variants[slug].length, 1);
    assert.equal(parsed.variants[slug][0].value, String(10 + index));
  });
  assert.equal(parsed.ocr.batch.sourceCount, 12);
  assert.equal(parsed.ocr.batch.mappedSourceCount, 11);
  assert.equal(parsed.ocr.batch.rarityCount, 11);
  assert.equal(parsed.ocr.batch.incomplete, false);
  assert.deepEqual(parsed.ocr.batch.missingRarities, []);
});

test('equipment OCR flags a large batch before one recognized rarity can be applied silently', () => {
  const context = {
    rarities: [
      ['Comum', 'comum'],
      ['Raro', 'raro'],
      ['Épico', 'epico'],
      ['Lendário', 'lendario'],
      ['Mítico', 'mitico'],
      ['Supremo', 'supremo'],
      ['Grandioso', 'grandioso'],
      ['Celestial', 'celestial'],
      ['Estelar', 'estelar'],
      ['Imortal', 'imortal'],
      ['Divino', 'divino']
    ].map(([name, slug], index) => ({ id: `r${index}`, name, slug })),
    slots: [],
    sets: []
  };
  const readings = Array.from({ length: 13 }, (_, index) => ({
    name: `IMG_${index + 1}.jpeg`,
    sourceIndex: index,
    region: index === 12 ? 'equipment-identity' : 'equipment-effects',
    confidence: 92,
    text: index === 0
      ? 'COMUM\n+10 ALCANCE DE TIRO COM MIRA DO HERÓI'
      : index === 12
        ? 'BANDANA DE\nCOMBATE'
        : 'EFEITOS POR CATEGORIA'
  }));

  const parsed = parseEquipmentOcr(readings, context, {});

  assert.equal(parsed.name, 'BANDANA DE COMBATE');
  assert.equal(parsed.ocr.batch.sourceCount, 13);
  assert.equal(parsed.ocr.batch.rarityCount, 1);
  assert.equal(parsed.ocr.batch.incomplete, true);
  assert.ok(parsed.ocr.warnings[0].includes('Leitura em massa incompleta'));
});


test('weapon labels do not leak into general hero fields', () => {
  const parsed = parseHeroOcr([{
    name: 'weapon.png',
    confidence: 93,
    text: [
      'PODER DE FOGO 700',
      'MODIFICADOR DE DANO A VIDA 1,5x',
      'PERFURAÇÃO DE ARMADURA DA ARMA 80'
    ].join('\n')
  }], heroContext, { name: 'Ramsay' });

  assert.equal(parsed.status.power, null);
  assert.equal(parsed.status.health, null);
  assert.equal(parsed.status.armor, null);
  assert.equal(parsed.weaponSummary.firepower, 700);
  assert.equal(parsed.weaponDetails.healthDamageMultiplier, 1.5);
  assert.equal(parsed.weaponDetails.armorPenetration, 80);
});


test('Ramsay summary layout reads the visible hero and weapon values precisely', () => {
  const liveLikeContext = {
    classes: [
      { id: 'c1', name: 'Tanques', slug: 'tanques' },
      { id: 'c2', name: 'Soldados', slug: 'soldados' },
      { id: 'c3', name: 'Franco-Atirador', slug: 'franco-atirador' },
      { id: 'c4', name: 'Escoteiros', slug: 'escoteiros' },
      { id: 'c5', name: 'Emboscadores', slug: 'emboscadores' }
    ],
    rarities: heroContext.rarities
  };

  const parsed = parseHeroOcr([
    {
      name: 'ramsay-summary.png',
      region: 'hero-identity',
      method: 'identidade do herói',
      confidence: 96,
      text: [
        'RAMSAY',
        'NÍVEL MÁXIMO | DIVINO',
        'CLASSE DE HERÓI',
        'ARTILHEIRO'
      ].join('\n')
    },
    {
      name: 'ramsay-summary.png',
      region: 'hero-summary',
      method: 'resumo do herói',
      confidence: 95,
      text: [
        'PODER 2032',
        'VIDA 3323',
        'DANO 231',
        'ARMADURA 1502'
      ].join('\n')
    },
    {
      name: 'ramsay-summary.png',
      region: 'weapon-summary',
      method: 'resumo da arma',
      confidence: 94,
      text: [
        'METRALHADORA DE RAMSAY',
        'PODER DE FOGO 765',
        'QUEBRA DE ARMADURA 712',
        'CADÊNCIA DE TIRO 1326',
        'CAPACIDADE DE MUNIÇÃO 338',
        'ALCANCE EFETIVO 872',
        'ESTABILIDADE DE MIRA 137'
      ].join('\n')
    }
  ], liveLikeContext, {});

  assert.equal(parsed.hero.name, 'RAMSAY');
  assert.equal(parsed.meta.rarity, 'divino');
  assert.equal(parsed.meta.level, null);
  assert.equal(parsed.meta.detectedClassLabel, 'ARTILHEIRO');
  assert.equal(parsed.hero.class, null);
  assert.equal(parsed.status.power, 2032);
  assert.equal(parsed.status.health, 3323);
  assert.equal(parsed.status.damage, 231);
  assert.equal(parsed.status.armor, 1502);
  assert.equal(parsed.weaponSummary.name, 'METRALHADORA DE RAMSAY');
  assert.equal(parsed.weaponSummary.firepower, 765);
  assert.equal(parsed.weaponSummary.armorBreak, 712);
  assert.equal(parsed.weaponSummary.fireRate, 1326);
  assert.equal(parsed.weaponSummary.magazineCapacity, 338);
  assert.equal(parsed.weaponSummary.effectiveRange, 872);
  assert.equal(parsed.weaponSummary.aimingStability, 137);
  assert.ok(parsed.ocr.coverage >= 0.8);
  assert.ok(parsed.ocr.warnings.some(item => item.includes('ARTILHEIRO')));
});

test('Ramsay detailed layout separates hero parameters, faction, description and weapon details', () => {
  const parsed = parseHeroOcr([
    {
      name: 'ramsay-details.png',
      region: 'hero-identity',
      method: 'identidade do herói',
      confidence: 96,
      text: 'RAMSAY\nNÍVEL MÁXIMO | DIVINO'
    },
    {
      name: 'ramsay-details.png',
      region: 'hero-parameters',
      method: 'parâmetros do herói',
      confidence: 94,
      text: [
        'PARÂMETROS DO HERÓI',
        'ALCANCE DE VISÃO DO HERÓI 430',
        'RAIO MÁXIMO DO BARULHO DE MOVIMENTAÇÃO DO HERÓI 500',
        'VELOCIDADE MÁXIMA DE MOVIMENTAÇÃO DO HERÓI 150',
        'VELOCIDADE MÁXIMA DE MOVIMENTAÇÃO DO HERÓI AO MIRAR 15',
        'RESISTÊNCIA À PERFURAÇÃO DO HERÓI 11',
        'VALOR DE ARMADURA 1502',
        'RESISTÊNCIA DE ARMADURA 10',
        'A METRALHADORA DE RAMSAY TEM UM PENTE',
        'ILIMITADO, MAS SUPERAQUECE QUANDO DISPARADA POR',
        'MUITO TEMPO. A HABILIDADE DE RAMSAY DE EMPURRAR',
        'INIMIGOS O TORNA UM OPONENTE MUITO PERIGOSO,',
        'MESMO QUANDO DESARMADO.'
      ].join('\n')
    },
    {
      name: 'ramsay-details.png',
      region: 'hero-faction',
      method: 'facção do herói',
      confidence: 97,
      text: 'FACÇÃO - P.Y.R.O.'
    },
    {
      name: 'ramsay-details.png',
      region: 'weapon-details',
      method: 'detalhes da arma',
      confidence: 95,
      text: [
        'METRALHADORA SUPERAQUECIDA',
        'DANO DA ARMA POR TIRO 231',
        'MODIFICADOR DE DANO DA ARMA À VIDA X1.00',
        'PERFURAÇÃO DE ARMADURA DA ARMA 55',
        'PODER DE PERFURAÇÃO DA ARMA 4',
        'MODIFICADOR DE DANO POR ARMAS A ARMADURAS E DRONES X1.50',
        'CADÊNCIA DE TIRO DA ARMA (POR SEGUNDO) 14.0 S',
        'TEMPO DE RECARGA DA ARMA 1.5 S',
        'TAMANHO DO PENTE DA ARMA 45',
        'ALCANCE DO TIRO DA ARMA 250',
        'ALCANCE DO TIRO DA ARMA AO MIRAR 250',
        'DISPERSÃO DE TIRO DA ARMA 28°',
        'DISPERSÃO DE TIRO DA ARMA AO SE MOVIMENTAR +10° 1',
        'DISPERSÃO DE TIRO DA ARMA AO MIRAR 28°',
        'TEMPO DE MIRA DA ARMA 4.0 S',
        'FATOR DE DISPERSÃO DA ARMA 0.5'
      ].join('\n')
    }
  ], {
    classes: [],
    rarities: heroContext.rarities
  }, {});

  assert.equal(parsed.meta.rarity, 'divino');
  assert.equal(parsed.meta.level, null);
  assert.equal(parsed.meta.faction, 'P.Y.R.O.');
  assert.equal(parsed.status.power, null);
  assert.equal(parsed.status.health, null);
  assert.equal(parsed.status.damage, null);
  assert.equal(parsed.status.armor, null);
  assert.equal(parsed.weaponSummary.firepower, null);
  assert.equal(parsed.weaponSummary.armorBreak, null);
  assert.equal(parsed.weaponSummary.fireRate, null);
  assert.equal(parsed.weaponSummary.magazineCapacity, null);
  assert.equal(parsed.weaponSummary.effectiveRange, null);
  assert.equal(parsed.weaponSummary.aimingStability, null);
  assert.equal(parsed.status.visionRange, 430);
  assert.equal(parsed.status.movementNoiseRadius, 500);
  assert.equal(parsed.status.maxMovementSpeed, 150);
  assert.equal(parsed.status.aimedMovementSpeed, 15);
  assert.equal(parsed.status.penetrationResistance, 11);
  assert.equal(parsed.status.armorValue, 1502);
  assert.equal(parsed.status.armorResistance, 10);
  assert.equal(parsed.weaponSummary.name, 'METRALHADORA SUPERAQUECIDA');
  assert.equal(parsed.weaponDetails.damagePerShot, 231);
  assert.equal(parsed.weaponDetails.healthDamageMultiplier, 1);
  assert.equal(parsed.weaponDetails.armorPenetration, 55);
  assert.equal(parsed.weaponDetails.penetrationPower, 4);
  assert.equal(parsed.weaponDetails.armorDroneMultiplier, 1.5);
  assert.equal(
    parsed.ocr.fields['weaponDetails.armorDroneMultiplier'].unit,
    null
  );
  assert.equal(parsed.weaponDetails.shotsPerSecond, 14);
  assert.equal(parsed.weaponDetails.reloadTime, 1.5);
  assert.equal(parsed.weaponDetails.magazineSize, 45);
  assert.equal(parsed.weaponDetails.hipFireRange, 250);
  assert.equal(parsed.weaponDetails.aimedRange, 250);
  assert.equal(parsed.weaponDetails.dispersion, 28);
  assert.equal(parsed.weaponDetails.movingDispersion, 10);
  assert.equal(parsed.weaponDetails.aimedDispersion, 28);
  assert.equal(parsed.weaponDetails.aimTime, 4);
  assert.equal(parsed.weaponDetails.dispersionFactor, 0.5);
  assert.ok(parsed.hero.description.includes('METRALHADORA DE RAMSAY'));
  assert.ok(parsed.hero.description.includes('MESMO QUANDO DESARMADO'));
});

test('local OCR modal keeps an iOS-safe scroll container after results render', async () => {
  const importerSource = await readFile(
    new URL('../admin/js/admin-ai-image-import.js', import.meta.url),
    'utf8'
  );

  assert.ok(importerSource.includes('overflow-y:auto;-webkit-overflow-scrolling:touch'));
  assert.ok(importerSource.includes('max-height:calc(100dvh - 16px)'));
  assert.ok(importerSource.includes("resultHost.scrollIntoView"));
});

test('equipment OCR uses dedicated game-panel crops and requires confirmation for incomplete batches', async () => {
  const [importerSource, equipmentWrapper, equipmentHtml] = await Promise.all([
    readFile(new URL('../admin/js/admin-ai-image-import.js', import.meta.url), 'utf8'),
    readFile(new URL('../admin/js/equipment-editor.js', import.meta.url), 'utf8'),
    readFile(new URL('../admin/equipment-editor.html', import.meta.url), 'utf8')
  ]);

  assert.ok(importerSource.includes("'equipment-identity'"));
  assert.ok(importerSource.includes("'equipment-effects'"));
  assert.ok(importerSource.includes('sourceIndex: fileIndex'));
  assert.ok(importerSource.includes('Revisar leitura incompleta'));
  assert.ok(importerSource.includes('Aplicar mesmo assim'));
  assert.ok(importerSource.includes('20260916-ocr-continuation-1'));
  assert.ok(equipmentWrapper.includes('20260916-ocr-continuation-1'));
  assert.ok(equipmentHtml.includes('20260916-ocr-continuation-1'));
});


test('power charge is never accepted as the hero power stat', () => {
  const parsed = parseHeroOcr([{
    name: 'summary.png',
    region: 'hero-summary',
    method: 'resumo do herói',
    confidence: 96,
    text: 'CARGA DE PODER 1\n0/40'
  }], heroContext, { name: 'Ramsay' });

  assert.equal(parsed.status.power, null);
});


test('dedicated Ramsay field crops override the exact broad OCR drift seen on iPhone', () => {
  const liveLikeContext = {
    classes: [
      { id: 'c1', name: 'Tanques', slug: 'tanques' },
      { id: 'c2', name: 'Soldados', slug: 'soldados' },
      { id: 'c3', name: 'Franco-Atirador', slug: 'franco-atirador' },
      { id: 'c4', name: 'Escoteiros', slug: 'escoteiros' },
      { id: 'c5', name: 'Emboscadores', slug: 'emboscadores' }
    ],
    rarities: heroContext.rarities
  };

  const parsed = parseHeroOcr([
    {
      name: 'ramsay-real-test.png',
      region: 'hero-identity',
      method: 'identidade do herói',
      confidence: 94,
      text: [
        'RAMSAY DEMÔNIO A',
        'NÍVEL MÁXIMO | DIVINO',
        'CLASSE DE HERÓI',
        'ARTILHEIRO'
      ].join('\n')
    },
    {
      name: 'ramsay-real-test.png',
      region: 'hero-summary',
      method: 'resumo do herói',
      confidence: 90,
      text: [
        'PODER 2032',
        'VIDA 2032',
        'ARMADURA 3323'
      ].join('\n')
    },
    {
      name: 'ramsay-real-test.png',
      region: 'hero-power',
      method: 'valor de poder',
      confidence: 97,
      text: '2032'
    },
    {
      name: 'ramsay-real-test.png',
      region: 'hero-health',
      method: 'valor de vida',
      confidence: 97,
      text: '3323'
    },
    {
      name: 'ramsay-real-test.png',
      region: 'hero-damage',
      method: 'valor de dano',
      confidence: 96,
      text: '231'
    },
    {
      name: 'ramsay-real-test.png',
      region: 'hero-armor',
      method: 'valor de armadura',
      confidence: 96,
      text: '1502'
    },
    {
      name: 'ramsay-real-test.png',
      region: 'weapon-summary',
      method: 'resumo da arma',
      confidence: 95,
      text: [
        'METRALHADORA DE RAMSAY H I',
        'PODER DE FOGO 765',
        'QUEBRA DE ARMADURA 712',
        'CADÊNCIA DE TIRO 1326',
        'CAPACIDADE DE MUNIÇÃO 338',
        'ALCANCE EFETIVO 872',
        'ESTABILIDADE DE MIRA 137'
      ].join('\n')
    }
  ], liveLikeContext, {});

  assert.equal(parsed.hero.name, 'RAMSAY DEMÔNIO');
  assert.equal(parsed.meta.rarity, 'divino');
  assert.equal(parsed.meta.detectedClassLabel, 'ARTILHEIRO');
  assert.equal(parsed.status.power, 2032);
  assert.equal(parsed.status.health, 3323);
  assert.equal(parsed.status.damage, 231);
  assert.equal(parsed.status.armor, 1502);
  assert.equal(parsed.weaponSummary.name, 'METRALHADORA DE RAMSAY');
  assert.equal(parsed.weaponSummary.firepower, 765);
  assert.equal(parsed.weaponSummary.armorBreak, 712);
  assert.equal(parsed.weaponSummary.fireRate, 1326);
  assert.equal(parsed.weaponSummary.magazineCapacity, 338);
  assert.equal(parsed.weaponSummary.effectiveRange, 872);
  assert.equal(parsed.weaponSummary.aimingStability, 137);
});


test('real second Ramsay screen never contaminates summary stats with detailed values', () => {
  const parsed = parseHeroOcr([
    {
      name: 'IMG_0498.jpeg',
      region: 'hero-identity',
      method: 'identidade do herói',
      confidence: 97,
      text: 'RAMSAY\nNÍVEL MÁXIMO | DIVINO'
    },
    {
      name: 'IMG_0498.jpeg',
      region: 'hero-parameters',
      method: 'parâmetros do herói',
      confidence: 96,
      text: [
        'PARÂMETROS DO HERÓI',
        'ALCANCE DE VISÃO DO HERÓI 430',
        'RAIO MÁXIMO DO BARULHO DE MOVIMENTAÇÃO DO HERÓI 500',
        'VELOCIDADE MÁXIMA DE MOVIMENTAÇÃO DO HERÓI 150',
        'VELOCIDADE MÁXIMA DE MOVIMENTAÇÃO DO HERÓI AO MIRAR 15',
        'RESISTÊNCIA À PERFURAÇÃO DO HERÓI 11',
        'VALOR DE ARMADURA 1502',
        'RESISTÊNCIA DE ARMADURA 10'
      ].join('\n')
    },
    {
      name: 'IMG_0498.jpeg',
      region: 'hero-faction',
      method: 'facção do herói',
      confidence: 98,
      text: 'FACÇÃO - P. Y. R. O.'
    },
    {
      name: 'IMG_0498.jpeg',
      region: 'hero-damage',
      method: 'valor de dano',
      confidence: 91,
      text: '1.5'
    },
    {
      name: 'IMG_0498.jpeg',
      region: 'hero-armor',
      method: 'valor de armadura',
      confidence: 96,
      text: '1502'
    },
    {
      name: 'IMG_0498.jpeg',
      region: 'weapon-summary',
      method: 'resumo da arma',
      confidence: 90,
      text: 'ALCANCE EFETIVO 2'
    },
    {
      name: 'IMG_0498.jpeg',
      region: 'weapon-details',
      method: 'detalhes da arma',
      confidence: 97,
      text: [
        'METRALHADORA SUPERAQUECIDA',
        'DANO DA ARMA POR TIRO 231',
        'MODIFICADOR DE DANO DA ARMA À VIDA X1.00',
        'PERFURAÇÃO DE ARMADURA DA ARMA 55',
        'PODER DE PERFURAÇÃO DA ARMA 4',
        'MODIFICADOR DE DANO POR ARMAS A ARMADURAS E DRONES X1.50',
        'CADÊNCIA DE TIRO DA ARMA (POR SEGUNDO) 14.0 S',
        'TEMPO DE RECARGA DA ARMA 1.5 S',
        'TAMANHO DO PENTE DA ARMA 45',
        'ALCANCE DO TIRO DA ARMA 250',
        'ALCANCE DO TIRO DA ARMA AO MIRAR 250',
        'DISPERSÃO DE TIRO DA ARMA 28°',
        'DISPERSÃO DE TIRO DA ARMA AO SE MOVIMENTAR +10°',
        'DISPERSÃO DE TIRO DA ARMA AO MIRAR 28°',
        'TEMPO DE MIRA DA ARMA 4.0 S',
        'FATOR DE DISPERSÃO DA ARMA 0.5'
      ].join('\n')
    }
  ], {
    classes: [],
    rarities: heroContext.rarities
  }, {});

  assert.equal(parsed.meta.rarity, 'divino');
  assert.equal(parsed.meta.faction, 'P.Y.R.O.');
  assert.equal(parsed.status.power, null);
  assert.equal(parsed.status.health, null);
  assert.equal(parsed.status.damage, null);
  assert.equal(parsed.status.armor, null);
  assert.equal(parsed.status.visionRange, 430);
  assert.equal(parsed.status.movementNoiseRadius, 500);
  assert.equal(parsed.status.maxMovementSpeed, 150);
  assert.equal(parsed.status.aimedMovementSpeed, 15);
  assert.equal(parsed.status.penetrationResistance, 11);
  assert.equal(parsed.status.armorValue, 1502);
  assert.equal(parsed.status.armorResistance, 10);
  assert.equal(parsed.weaponSummary.effectiveRange, null);
  assert.equal(parsed.weaponDetails.damagePerShot, 231);
  assert.equal(parsed.weaponDetails.healthDamageMultiplier, 1);
  assert.equal(parsed.weaponDetails.armorPenetration, 55);
  assert.equal(parsed.weaponDetails.penetrationPower, 4);
  assert.equal(parsed.weaponDetails.armorDroneMultiplier, 1.5);
  assert.equal(parsed.weaponDetails.shotsPerSecond, 14);
  assert.equal(parsed.weaponDetails.reloadTime, 1.5);
  assert.equal(parsed.weaponDetails.magazineSize, 45);
  assert.equal(parsed.weaponDetails.hipFireRange, 250);
  assert.equal(parsed.weaponDetails.aimedRange, 250);
  assert.equal(parsed.weaponDetails.dispersion, 28);
  assert.equal(parsed.weaponDetails.movingDispersion, 10);
  assert.equal(parsed.weaponDetails.aimedDispersion, 28);
  assert.equal(parsed.weaponDetails.aimTime, 4);
  assert.equal(parsed.weaponDetails.dispersionFactor, 0.5);
  assert.deepEqual(parsed.ocr.screens, ['detail']);
});

test('summary and detail screenshots merge without cross-contaminating their field families', () => {
  const parsed = parseHeroOcr([
    {
      name: 'summary.jpeg',
      region: 'hero-identity',
      confidence: 98,
      text: 'RAMSAY DEMÔNIO\nNÍVEL MÁXIMO | DIVINO\nCLASSE DE HERÓI\nARTILHEIRO'
    },
    {
      name: 'summary.jpeg',
      region: 'hero-summary',
      confidence: 98,
      text: 'PODER 2032\nVIDA 3323\nDANO 231\nARMADURA 1502'
    },
    {
      name: 'summary.jpeg',
      region: 'weapon-summary',
      confidence: 98,
      text: 'METRALHADORA DE RAMSAY\nPODER DE FOGO 765\nQUEBRA DE ARMADURA 712\nCADÊNCIA DE TIRO 1326\nCAPACIDADE DE MUNIÇÃO 338\nALCANCE EFETIVO 872\nESTABILIDADE DE MIRA 137'
    },
    {
      name: 'details.jpeg',
      region: 'hero-parameters',
      confidence: 98,
      text: 'PARÂMETROS DO HERÓI\nALCANCE DE VISÃO DO HERÓI 430\nVALOR DE ARMADURA 1502\nRESISTÊNCIA DE ARMADURA 10'
    },
    {
      name: 'details.jpeg',
      region: 'weapon-details',
      confidence: 98,
      text: 'METRALHADORA SUPERAQUECIDA\nDANO DA ARMA POR TIRO 231\nALCANCE DO TIRO DA ARMA 250\nALCANCE DO TIRO DA ARMA AO MIRAR 250\nFATOR DE DISPERSÃO DA ARMA 0.5'
    }
  ], {
    classes: [],
    rarities: heroContext.rarities
  }, {});

  assert.equal(parsed.status.power, 2032);
  assert.equal(parsed.status.health, 3323);
  assert.equal(parsed.status.damage, 231);
  assert.equal(parsed.status.armor, 1502);
  assert.equal(parsed.weaponSummary.effectiveRange, 872);
  assert.equal(parsed.weaponSummary.name, 'METRALHADORA DE RAMSAY');
  assert.equal(parsed.status.visionRange, 430);
  assert.equal(parsed.status.armorValue, 1502);
  assert.equal(parsed.weaponDetails.damagePerShot, 231);
  assert.equal(parsed.weaponDetails.hipFireRange, 250);
  assert.equal(parsed.weaponDetails.aimedRange, 250);
  assert.equal(parsed.weaponDetails.dispersionFactor, 0.5);
  assert.deepEqual(new Set(parsed.ocr.screens), new Set(['summary', 'detail']));
});


test('real PaddleOCR weapon detail noise keeps +10 degrees and rejects fake M unit', () => {
  const parsed = parseHeroOcr([{
    name: 'IMG_0498.jpeg',
    region: 'weapon-details',
    method: 'detalhes da arma',
    confidence: 97,
    text: [
      'DANO DA ARMA POR TIRO 231',
      'X1.50 MODIFICADOR DE DANO POR ARMAS A ARMADURAS E DRONES',
      'DISPERSÃO DE TIRO DA ARMA AO SE MOVIMENTAR +10° 1',
      'FATOR DE DISPERSÃO DA ARMA 0.5'
    ].join('\n')
  }], {
    classes: [],
    rarities: heroContext.rarities
  }, { name: 'Ramsay' });

  assert.equal(parsed.weaponDetails.armorDroneMultiplier, 1.5);
  assert.equal(
    parsed.ocr.fields['weaponDetails.armorDroneMultiplier'].unit,
    null
  );
  assert.equal(parsed.weaponDetails.movingDispersion, 10);
  assert.equal(
    parsed.ocr.fields['weaponDetails.movingDispersion'].unit,
    '°'
  );
  assert.equal(parsed.weaponDetails.dispersionFactor, 0.5);
});
