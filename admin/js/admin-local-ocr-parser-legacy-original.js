import { joinEquipmentEffectLines } from './equipment-effect-text.js?v=20260916-ocr-continuation-1&eq=20260907-effects-1';


function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[|]/g, 'i')
    .replace(/[•●▪]/g, ' ')
    .replace(/[^a-z0-9%+\-.,/()x\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lineScore(line, aliases) {
  const text = normalize(line);
  let best = 0;

  for (const alias of aliases) {
    const expected = normalize(alias);
    if (!expected) continue;
    if (text === expected) {
      best = Math.max(best, 1);
      continue;
    }
    if (text.includes(expected)) {
      best = Math.max(best, 0.96);
      continue;
    }

    const words = expected.split(' ').filter(word => word.length > 2);
    if (!words.length) continue;
    const hits = words.filter(word => text.includes(word)).length;
    const ratio = hits / words.length;
    if (ratio >= 0.75) {
      best = Math.max(best, 0.68 + ratio * 0.22);
    }
  }

  return best;
}

function numberCandidates(value = '') {
  const original = String(value);
  const splitPercent = original.match(
    /^\s*(?:[•●▪]\s*)?([+−–-])\s*((?:\d\s+){1,3}\d)\s*%/u
  );

  // O Paddle pode separar os algarismos de um percentual ("-3 1%"). A
  // correção só vale no começo da linha, com sinal e %, para não concatenar
  // números independentes de uma descrição.
  if (splitPercent) {
    const magnitude = Number(splitPercent[2].replace(/\s+/g, ''));
    if (Number.isFinite(magnitude)) {
      return [{
        value: splitPercent[1] === '+' ? magnitude : -magnitude,
        unit: '%',
        raw: splitPercent[0],
        index: Number(splitPercent.index) || 0
      }];
    }
  }

  const fixed = original
    .replace(/(\d)[oO](?=\d)/g, '$10')
    .replace(/(\d)[lI](?=\d)/g, '$11');

  const matches = [
    ...fixed.matchAll(
      /([+\-]?\s*\d+(?:[.,]\d+)?)\s*(%|x\b|°|s\b|m\b)?/gi
    )
  ];

  return matches
    .map(match => {
      const numeric = Number(
        String(match[1])
          .replace(/\s/g, '')
          .replace(',', '.')
      );
      if (!Number.isFinite(numeric)) return null;

      return {
        value: numeric,
        unit:
          (match[2] || '').toLowerCase() ||
          (fixed.includes('%') ? '%' : null),
        raw: match[0],
        index: Number(match.index) || 0
      };
    })
    .filter(Boolean);
}

function numberFrom(value = '', options = {}) {
  const candidates = numberCandidates(value);
  if (!candidates.length) return null;

  let selected = null;

  if (options.preferUnit) {
    const expectedUnits = Array.isArray(options.preferUnit)
      ? options.preferUnit
      : [options.preferUnit];

    for (const candidate of candidates) {
      if (expectedUnits.includes(candidate.unit)) {
        selected = candidate;
        break;
      }
    }
  }

  if (!selected && options.preferFirst) {
    selected = candidates[0];
  }

  if (!selected) {
    selected = candidates[candidates.length - 1];
  }

  return {
    value: selected.value,
    unit:
      Object.prototype.hasOwnProperty.call(options, 'forceUnit')
        ? options.forceUnit
        : selected.unit,
    raw: selected.raw
  };
}

function buildLines(readings = []) {
  const rows = [];
  const sourceIndexes = new Map();

  for (const [readingIndex, reading] of readings.entries()) {
    const source = reading && reading.name || 'imagem';
    if (!sourceIndexes.has(source)) {
      sourceIndexes.set(source, sourceIndexes.size);
    }
    const sourceIndex = Number.isInteger(reading?.sourceIndex)
      ? reading.sourceIndex
      : sourceIndexes.get(source);
    const sourceKey = Number.isInteger(reading?.sourceIndex)
      ? 'index:' + reading.sourceIndex
      : 'name:' + source;

    String(reading && reading.text || '')
      .split(/\r?\n/)
      .map(text => text.trim())
      .filter(Boolean)
      .forEach((text, lineIndex) => rows.push({
        text,
        clean: normalize(text),
        source,
        sourceIndex,
        sourceKey,
        readingIndex,
        lineIndex,
        region: reading && reading.region || 'full',
        method: reading && reading.method || null,
        ocrConfidence: Number(reading && reading.confidence) || 0
      }));
  }

  const seen = new Set();
  return rows.filter(row => {
    const key = row.sourceKey + '|' + (row.region || 'full') + '|' + row.clean;
    if (!row.clean || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function containsExcludedTerm(text, term) {
  const cleanText = normalize(text);
  const cleanTerm = normalize(term);
  if (!cleanText || !cleanTerm) return false;

  if (cleanTerm.includes(' ')) {
    return cleanText.includes(cleanTerm);
  }

  return cleanText
    .split(/\s+/)
    .includes(cleanTerm);
}

function findNumber(
  lines,
  aliases,
  excluded = [],
  preferredRegions = [],
  allowedSources = null,
  numberOptions = {}
) {
  let best = null;
  const preferred = new Set(preferredRegions || []);

  for (let index = 0; index < lines.length; index += 1) {
    const row = lines[index];
    if (allowedSources && !allowedSources.has(row.source)) continue;
    if (excluded.some(term => containsExcludedTerm(row.clean, term))) continue;

    const preferredRegion = preferred.size === 0 || preferred.has(row.region);
    const score = lineScore(row.text, aliases);
    const threshold = preferredRegion ? 0.62 : 0.76;
    if (score < threshold) continue;

    let parsed = numberFrom(row.text, numberOptions);
    let rawLine = row.text;

    if (!parsed) {
      for (const offset of [1, -1]) {
        const neighbor = lines[index + offset];
        if (
          !neighbor ||
          neighbor.region !== row.region ||
          neighbor.source !== row.source ||
          (allowedSources && !allowedSources.has(neighbor.source))
        ) continue;
        const candidate = numberFrom(neighbor.text, numberOptions);
        if (!candidate) continue;
        if (normalize(neighbor.text).length > 24) continue;
        parsed = candidate;
        rawLine = row.text + ' | ' + neighbor.text;
        break;
      }
    }

    if (!parsed) continue;

    const regionAdjustment = preferred.size
      ? (preferredRegion ? 0.08 : -0.08)
      : 0;

    const candidate = {
      value: parsed.value,
      unit: parsed.unit,
      score: Math.max(
        0,
        Math.min(0.995, score * 0.82 + 0.16 + regionAdjustment)
      ),
      raw: rawLine,
      source: row.source,
      region: row.region
    };

    if (!best || candidate.score > best.score) best = candidate;
  }

  return best;
}

function matchCatalog(text, rows = [], threshold = 0.78) {
  const full = normalize(text);
  let best = null;

  for (const row of rows) {
    for (const value of [row && row.name, row && row.slug]) {
      if (!value) continue;
      const expected = normalize(value);
      if (!expected) continue;

      let score = 0;
      if (full.includes(expected)) {
        score = 0.98;
      } else {
        const expectedWords = expected.split(' ').filter(word => word.length > 2);
        const hits = expectedWords.filter(word => full.includes(word)).length;
        if (expectedWords.length) score = 0.55 + (hits / expectedWords.length) * 0.35;
      }

      if (!best || score > best.score) best = { row, score };
    }
  }

  return best && best.score >= threshold ? best : null;
}

function confidence(readings, fieldScores) {
  const ocr = readings
    .map(item => Number(item && item.confidence) || 0)
    .filter(Boolean)
    .map(value => Math.max(0, Math.min(1, value / 100)));

  const ocrAverage = ocr.length
    ? ocr.reduce((sum, value) => sum + value, 0) / ocr.length
    : 0;

  const fieldAverage = fieldScores.length
    ? fieldScores.reduce((sum, value) => sum + value, 0) / fieldScores.length
    : 0;

  if (!fieldAverage) return Math.round(ocrAverage * 100) / 100;
  if (!ocrAverage) return Math.round(fieldAverage * 100) / 100;
  return Math.round((fieldAverage * 0.72 + ocrAverage * 0.28) * 100) / 100;
}

const HERO_FIELDS = [
  ['status', 'power', ['poder', 'poder do heroi'], ['fogo', 'perfuracao', 'carga'], ['hero-summary'], 'summary'],
  ['status', 'health', ['vida', 'vida do heroi', 'pontos de vida'], ['dano', 'modificador'], ['hero-summary'], 'summary'],
  ['status', 'damage', ['dano do heroi', 'dano'], ['arma', 'vida', 'armadura', 'drone'], ['hero-summary'], 'summary'],
  ['status', 'armor', ['armadura', 'armadura do heroi'], ['arma', 'perfuracao', 'dano', 'quebra', 'drone'], ['hero-summary'], 'summary'],
  ['status', 'visionRange', ['alcance de visao do heroi', 'alcance de visao'], [], ['hero-parameters'], 'detail'],
  ['status', 'movementNoiseRadius', ['raio maximo do barulho de movimentacao do heroi', 'barulho de movimentacao'], [], ['hero-parameters'], 'detail'],
  ['status', 'maxMovementSpeed', ['velocidade maxima de movimentacao do heroi', 'velocidade de movimento'], ['ao mirar'], ['hero-parameters'], 'detail'],
  ['status', 'aimedMovementSpeed', ['velocidade maxima de movimentacao do heroi ao mirar', 'velocidade ao mirar'], [], ['hero-parameters'], 'detail'],
  ['status', 'penetrationResistance', ['resistencia a perfuracao do heroi', 'resistencia a perfuracao'], [], ['hero-parameters'], 'detail'],
  ['status', 'armorValue', ['valor de armadura', 'valor da armadura'], [], ['hero-parameters'], 'detail'],
  ['status', 'armorResistance', ['resistencia de armadura', 'resistencia da armadura'], [], ['hero-parameters'], 'detail'],

  ['weaponSummary', 'firepower', ['poder de fogo'], [], ['weapon-summary'], 'summary'],
  ['weaponSummary', 'armorBreak', ['quebra de armadura'], [], ['weapon-summary'], 'summary'],
  ['weaponSummary', 'fireRate', ['cadencia de tiro'], ['por segundo', 'tiros por segundo'], ['weapon-summary'], 'summary'],
  ['weaponSummary', 'magazineCapacity', ['capacidade de municao'], [], ['weapon-summary'], 'summary'],
  ['weaponSummary', 'effectiveRange', ['alcance efetivo'], [], ['weapon-summary'], 'summary'],
  ['weaponSummary', 'aimingStability', ['estabilidade de mira'], [], ['weapon-summary'], 'summary'],

  ['weaponDetails', 'damagePerShot', ['dano da arma por tiro', 'dano por tiro'], [], ['weapon-details'], 'detail'],
  ['weaponDetails', 'healthDamageMultiplier', ['modificador de dano a vida', 'modificador de dano contra vida'], [], ['weapon-details'], 'detail', { forceUnit: null }],
  ['weaponDetails', 'armorPenetration', ['perfuracao de armadura da arma', 'perfuracao de armadura'], [], ['weapon-details'], 'detail'],
  ['weaponDetails', 'penetrationPower', ['poder de perfuracao da arma', 'poder de perfuracao'], [], ['weapon-details'], 'detail'],
  ['weaponDetails', 'armorDroneMultiplier', ['dano contra armadura e drones', 'modificador contra armadura e drones', 'modificador de dano por armas a armaduras e drones'], [], ['weapon-details'], 'detail', { forceUnit: null }],
  ['weaponDetails', 'shotsPerSecond', ['cadencia de tiro da arma por segundo', 'cadencia de tiro por segundo', 'tiros por segundo'], [], ['weapon-details'], 'detail'],
  ['weaponDetails', 'reloadTime', ['tempo de recarga da arma', 'tempo de recarga'], [], ['weapon-details'], 'detail'],
  ['weaponDetails', 'magazineSize', ['tamanho do pente da arma', 'tamanho do pente'], [], ['weapon-details'], 'detail'],
  ['weaponDetails', 'hipFireRange', ['alcance do tiro da arma', 'alcance sem mira'], ['ao mirar', 'com mira'], ['weapon-details'], 'detail'],
  ['weaponDetails', 'aimedRange', ['alcance do tiro da arma ao mirar', 'alcance com mira', 'alcance ao mirar'], [], ['weapon-details'], 'detail'],
  ['weaponDetails', 'dispersion', ['dispersao de tiro da arma', 'dispersao da arma'], ['ao se movimentar', 'em movimento', 'ao mirar'], ['weapon-details'], 'detail', { preferUnit: '°' }],
  ['weaponDetails', 'movingDispersion', ['dispersao de tiro da arma ao se movimentar', 'dispersao em movimento'], [], ['weapon-details'], 'detail', { preferUnit: '°' }],
  ['weaponDetails', 'aimedDispersion', ['dispersao de tiro da arma ao mirar', 'dispersao ao mirar'], [], ['weapon-details'], 'detail', { preferUnit: '°' }],
  ['weaponDetails', 'aimTime', ['tempo de mira da arma', 'tempo de mira'], [], ['weapon-details'], 'detail'],
  ['weaponDetails', 'dispersionFactor', ['fator de dispersao da arma', 'fator de dispersao'], [], ['weapon-details'], 'detail', { preferFirst: true, forceUnit: null }]
];

function heroSkeleton() {
  return {
    schemaVersion: 2,
    hero: {
      name: null,
      class: null,
      description: null,
      displayOrder: null,
      active: null
    },
    status: {
      power: null,
      health: null,
      damage: null,
      armor: null,
      visionRange: null,
      movementNoiseRadius: null,
      maxMovementSpeed: null,
      aimedMovementSpeed: null,
      penetrationResistance: null,
      armorValue: null,
      armorResistance: null
    },
    weaponSummary: {
      name: null,
      firepower: null,
      armorBreak: null,
      fireRate: null,
      magazineCapacity: null,
      effectiveRange: null,
      aimingStability: null
    },
    weaponDetails: {
      damagePerShot: null,
      healthDamageMultiplier: null,
      armorPenetration: null,
      penetrationPower: null,
      armorDroneMultiplier: null,
      shotsPerSecond: null,
      reloadTime: null,
      magazineSize: null,
      hipFireRange: null,
      aimedRange: null,
      dispersion: null,
      movingDispersion: null,
      aimedDispersion: null,
      aimTime: null,
      dispersionFactor: null
    },
    meta: {
      rarity: null,
      faction: null,
      level: null,
      detectedClassLabel: null
    },
    ocr: {
      confidence: 0,
      coverage: 0,
      warnings: [],
      fields: {},
      readings: [],
      screens: []
    }
  };
}

function sanitizeOcrTitle(value = '') {
  const tokens = String(value)
    .replace(/[|:;,.·•\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  while (
    tokens.length >= 3 &&
    /^[A-ZÀ-Ý]$/i.test(tokens[tokens.length - 1]) &&
    ['A', 'H', 'I', 'L', 'T'].includes(tokens[tokens.length - 1].toUpperCase())
  ) {
    tokens.pop();
  }

  return tokens.join(' ').trim();
}

function dedicatedRegionNumber(lines, region, allowedSources = null) {
  const rows = rowsForRegion(lines, region)
    .filter(row => !allowedSources || allowedSources.has(row.source));
  if (!rows.length) return null;

  const values = [];
  for (const row of rows) {
    const parsed = numberFrom(row.text);
    if (!parsed) continue;
    values.push({
      value: parsed.value,
      unit: parsed.unit,
      raw: row.text,
      source: row.source,
      region,
      score: Math.max(
        0.9,
        Math.min(0.995, (Number(row.ocrConfidence) || 0) / 100)
      )
    });
  }

  if (!values.length) return null;

  const counts = new Map();
  for (const item of values) {
    const key = String(item.value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  values.sort((a, b) => {
    const countDiff = (counts.get(String(b.value)) || 0) - (counts.get(String(a.value)) || 0);
    if (countDiff) return countDiff;
    return b.score - a.score;
  });

  return values[0];
}

const HERO_DEDICATED_REGIONS = {
  power: 'hero-power',
  health: 'hero-health',
  damage: 'hero-damage',
  armor: 'hero-armor'
};

function rowsForRegion(lines, region) {
  return lines.filter(row => row.region === region);
}

function classifyHeroSources(readings = []) {
  const bySource = new Map();

  for (const reading of readings) {
    const source = reading?.name || 'imagem';
    const clean = normalize(reading?.text || '');
    const current = bySource.get(source) || {
      detailScore: 0,
      summaryScore: 0,
      specialized: false
    };

    if (
      reading?.region &&
      !['full', 'editor'].includes(reading.region)
    ) {
      current.specialized = true;
    }

    if (
      clean.includes('parametros do heroi') ||
      clean.includes('dano da arma por tiro') ||
      clean.includes('tempo de recarga da arma') ||
      clean.includes('fator de dispersao da arma')
    ) {
      current.detailScore += 3;
    }

    if (
      clean.includes('classe de heroi') ||
      clean.includes('carga de poder')
    ) {
      current.summaryScore += 2;
    }

    bySource.set(source, current);
  }

  const classified = new Map();
  for (const [source, score] of bySource.entries()) {
    if (!score.specialized) {
      classified.set(source, 'unknown');
    } else if (score.detailScore > 0) {
      classified.set(source, 'detail');
    } else if (score.summaryScore > 0) {
      classified.set(source, 'summary');
    } else {
      classified.set(source, 'unknown');
    }
  }

  return classified;
}

function sourcesForKind(sourceKinds, kind) {
  const exact = new Set(
    [...sourceKinds.entries()]
      .filter(([, value]) => value === kind)
      .map(([source]) => source)
  );

  if (exact.size) return exact;

  return new Set(
    [...sourceKinds.entries()]
      .filter(([, value]) => value === 'unknown')
      .map(([source]) => source)
  );
}

function normalizeFactionLabel(value = '') {
  return String(value)
    .replace(/([A-ZÀ-Ý]\.)\s+(?=[A-ZÀ-Ý]\.)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function textForRegions(lines, regions) {
  const wanted = new Set(regions);
  return lines
    .filter(row => wanted.has(row.region))
    .map(row => row.text)
    .join('\n');
}

function detectMaximumRarity(lines, rarities) {
  const identityRows = rowsForRegion(lines, 'hero-identity');

  for (let index = 0; index < identityRows.length; index += 1) {
    const row = identityRows[index];
    if (!row.clean.includes('nivel') || !row.clean.includes('maximo')) continue;

    const sameLine = matchCatalog(row.text, rarities || [], 0.7);
    if (sameLine) {
      return {
        row: sameLine.row,
        score: Math.max(0.98, sameLine.score),
        raw: row.text,
        source: row.source,
        region: row.region
      };
    }

    const neighbor = identityRows[index + 1];
    if (neighbor) {
      const nextLine = matchCatalog(neighbor.text, rarities || [], 0.72);
      if (nextLine) {
        return {
          row: nextLine.row,
          score: Math.max(0.95, nextLine.score),
          raw: row.text + ' | ' + neighbor.text,
          source: row.source,
          region: row.region
        };
      }
    }
  }

  return null;
}

function extractHeroClassLabel(readings, heroName = '') {
  const cleanHeroName = normalize(sanitizeOcrTitle(heroName));
  for (const reading of readings) {
    if (!reading || reading.region !== 'hero-identity') continue;

    const lines = String(reading.text || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const clean = normalize(line);
      if (!clean.includes('classe de heroi') && !clean.includes('classe heroi')) continue;

      const inline = line
        .replace(/classe\s+de\s+her[oó]i\s*/i, '')
        .replace(/^[:|\-–—\s]+/, '')
        .trim();

      if (inline.length >= 3 && inline.length <= 40) {
        return {
          value: inline,
          score: 0.97,
          raw: line,
          source: reading.name || 'imagem',
          region: reading.region
        };
      }

      const neighbor = lines[index + 1];
      if (
        neighbor &&
        neighbor.length >= 3 &&
        neighbor.length <= 40 &&
        !/\d/.test(neighbor)
      ) {
        return {
          value: neighbor,
          score: 0.96,
          raw: line + ' | ' + neighbor,
          source: reading.name || 'imagem',
          region: reading.region
        };
      }
    }

    const fallback = lines
      .map(line => line.trim())
      .filter(line => {
        const clean = normalize(line);
        if (line.length < 4 || line.length > 36 || /\d/.test(line)) return false;
        if (/nivel|maximo|classe|heroi/.test(clean)) return false;
        if (cleanHeroName && normalize(sanitizeOcrTitle(line)) === cleanHeroName) return false;

        const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, '');
        if (letters.length < 4) return false;
        const upperRatio = [...letters]
          .filter(char => char === char.toUpperCase()).length / letters.length;
        return upperRatio >= 0.72;
      })
      .sort((a, b) => b.length - a.length)[0];

    if (fallback) {
      return {
        value: sanitizeOcrTitle(fallback),
        score: 0.88,
        raw: fallback,
        source: reading.name || 'imagem',
        region: reading.region
      };
    }
  }

  return null;
}

function extractFaction(readings) {
  for (const reading of readings) {
    if (reading && reading.region !== 'hero-faction') continue;
    for (const rawLine of String(reading && reading.text || '').split(/\r?\n/)) {
      const clean = normalize(rawLine);
      if (!clean.includes('faccao') && !clean.includes('faction')) continue;

      const value = rawLine
        .replace(/fac[cç][aã]o\s*/i, '')
        .replace(/faction\s*/i, '')
        .replace(/^[:|\-–—\s]+/, '')
        .trim();

      if (value.length >= 2 && value.length <= 40) {
        return {
          value: normalizeFactionLabel(value),
          score: 0.97,
          raw: rawLine.trim(),
          source: reading.name || 'imagem',
          region: reading.region
        };
      }
    }
  }

  return null;
}

function extractWeaponName(readings, heroName, sourceKinds = new Map()) {
  const candidates = [];
  const heroClean = normalize(heroName || '');

  for (const reading of readings) {
    if (!['weapon-summary', 'weapon-details'].includes(reading && reading.region)) continue;

    const lines = String(reading.text || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 8);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const clean = normalize(line);

      if (line.length < 5 || line.length > 70 || /\d/.test(line)) continue;
      if (
        /poder de fogo|quebra de armadura|cadencia|capacidade|alcance|estabilidade|ajuste de arma|dano da arma|perfuracao|tempo de recarga|tamanho do pente|dispersao|fator de dispersao/.test(clean)
      ) continue;

      const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, '');
      if (letters.length < 5) continue;
      const upperRatio = [...letters]
        .filter(char => char === char.toUpperCase()).length / letters.length;
      if (upperRatio < 0.68) continue;

      let score = 0.72 + Math.max(0, (8 - index) * 0.015);
      if (/metralhadora|rifle|fuzil|pistola|escopeta|espingarda|lan[cç]ador|arco|canh[aã]o/.test(clean)) {
        score += 0.12;
      }
      if (reading.region === 'weapon-summary') score += 0.08;
      if (reading.region === 'weapon-details') score += 0.02;

      const cleanTitle = sanitizeOcrTitle(line);
      if (!cleanTitle) continue;

      const source = reading.name || 'imagem';
      candidates.push({
        value: cleanTitle,
        score: Math.min(0.98, score),
        raw: line,
        source,
        sourceKind: sourceKinds.get(source) || 'unknown',
        region: reading.region
      });
    }
  }

  const summaryCandidates = candidates.filter(
    candidate => candidate.sourceKind === 'summary'
  );
  const pool = summaryCandidates.length
    ? summaryCandidates
    : candidates;

  return pool.sort((a, b) => b.score - a.score)[0] || null;
}

function extractHeroDescription(readings) {
  for (const reading of readings) {
    if (!reading || reading.region !== 'hero-parameters') continue;

    const lines = String(reading.text || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    const start = lines.findIndex(line =>
      normalize(line).includes('resistencia de armadura')
    );
    if (start < 0) continue;

    const description = [];
    for (const line of lines.slice(start + 1)) {
      const clean = normalize(line);
      if (clean.includes('faccao') || clean.includes('faction')) break;
      if (!clean || /\d/.test(line)) continue;
      if (
        /parametros do heroi|alcance de visao|raio maximo|velocidade maxima|resistencia a perfuracao|valor de armadura/.test(clean)
      ) continue;
      if (line.length < 12) continue;
      description.push(line);
    }

    const value = description.join(' ').replace(/\s+/g, ' ').trim();
    if (value.length >= 70) {
      return {
        value,
        score: 0.88,
        raw: value,
        source: reading.name || 'imagem',
        region: reading.region
      };
    }
  }

  return null;
}

function heroCoverage(result, sourceKinds) {
  const sourceTypes = new Set(sourceKinds.values());
  const hasSummary = sourceTypes.has('summary');
  const hasDetails = sourceTypes.has('detail');

  let expected = 0;
  if (hasSummary && hasDetails) expected = 31;
  else if (hasSummary) expected = 14;
  else if (hasDetails) expected = 24;

  const groups = [
    result.hero,
    result.status,
    result.weaponSummary,
    result.weaponDetails
  ];

  let recognized = groups.reduce(
    (sum, group) =>
      sum +
      Object.values(group || {}).filter(
        value => value !== null && value !== undefined && value !== ''
      ).length,
    0
  );

  recognized += ['rarity', 'faction', 'level']
    .map(key => result.meta?.[key])
    .filter(value => value !== null && value !== undefined && value !== '')
    .length;

  if (!expected) expected = Math.max(1, recognized);
  return Math.max(0, Math.min(1, recognized / expected));
}

function probableName(lines, identity) {
  if (identity && identity.name) {
    return { value: identity.name, score: 1, source: 'editor', region: 'editor' };
  }

  const forbidden = [
    'parametros', 'heroi', 'ajuste de arma', 'arma', 'selecionar',
    'poder', 'vida', 'armadura', 'dano', 'alcance', 'velocidade',
    'resistencia', 'capacidade', 'estabilidade', 'cadencia', 'tempo',
    'perfuracao', 'dispersao', 'nivel', 'equipamento', 'classe'
  ];

  const ordered = [
    ...rowsForRegion(lines, 'hero-identity'),
    ...lines.filter(row => row.region !== 'hero-identity')
  ];

  for (const row of ordered.slice(0, 40)) {
    if (row.text.length < 3 || row.text.length > 28) continue;
    if (/\d/.test(row.text)) continue;
    if (forbidden.some(term => row.clean.includes(term))) continue;

    const letters = row.text.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (letters.length < 3) continue;
    const uppercase = [...letters].filter(char => char === char.toUpperCase()).length / letters.length;
    if (uppercase >= 0.75) {
      const cleanTitle = sanitizeOcrTitle(row.text);
      if (!cleanTitle) continue;

      return {
        value: cleanTitle,
        score: row.region === 'hero-identity' ? 0.97 : 0.78,
        source: row.source,
        region: row.region,
        raw: row.text
      };
    }
  }

  return null;
}

export function parseHeroOcr(readings = [], context = {}, identity = {}) {
  const result = heroSkeleton();
  const lines = buildLines(readings);
  const combined = lines.map(row => row.text).join('\n');
  const identityText =
    textForRegions(lines, ['hero-identity']) ||
    combined;
  const scores = [];
  const sourceKinds = classifyHeroSources(readings);
  const summarySources = sourcesForKind(sourceKinds, 'summary');
  const detailSources = sourcesForKind(sourceKinds, 'detail');

  const name = probableName(lines, identity);
  if (name) {
    result.hero.name = name.value;
    result.ocr.fields['hero.name'] = name;
    scores.push(name.score);
  }

  const detectedClass = extractHeroClassLabel(readings, result.hero.name);
  const classMatch =
    matchCatalog(identityText, context.classes || [], 0.76) ||
    matchCatalog(combined, context.classes || [], 0.84);

  if (classMatch) {
    result.hero.class = classMatch.row.slug || classMatch.row.name;
    result.ocr.fields['hero.class'] = {
      confidence: classMatch.score,
      raw: detectedClass?.raw || classMatch.row.name,
      region: 'hero-identity'
    };
    scores.push(classMatch.score);
  } else if (detectedClass) {
    result.meta.detectedClassLabel = detectedClass.value;
    result.ocr.fields['meta.detectedClassLabel'] = detectedClass;
    scores.push(detectedClass.score);
    result.ocr.warnings.push(
      'Classe lida como "' + detectedClass.value +
      '", mas ela não possui correspondência canônica no catálogo do Supabase. Selecione a classe manualmente.'
    );
  }

  const maximumRarity = detectMaximumRarity(lines, context.rarities || []);
  const rarityMatch =
    maximumRarity ||
    matchCatalog(identityText, context.rarities || [], 0.78) ||
    matchCatalog(combined, context.rarities || [], 0.88);

  if (rarityMatch) {
    const rarityRow = rarityMatch.row;
    result.meta.rarity = rarityRow.slug || rarityRow.name;
    result.ocr.fields['meta.rarity'] = {
      confidence: rarityMatch.score,
      raw: rarityMatch.raw || rarityRow.name,
      region: rarityMatch.region || 'hero-identity'
    };
    scores.push(rarityMatch.score);
  }

  const level = findNumber(
    lines,
    ['nivel', 'nível', 'level'],
    ['maximo', 'máximo'],
    ['hero-identity']
  );
  if (
    level &&
    Number.isInteger(level.value) &&
    level.value > 0 &&
    level.value < 1000
  ) {
    result.meta.level = level.value;
    result.ocr.fields['meta.level'] = level;
    scores.push(level.score);
  }

  const faction = extractFaction(readings);
  if (faction) {
    result.meta.faction = faction.value;
    result.ocr.fields['meta.faction'] = faction;
    scores.push(faction.score);
  }

  const weaponName = extractWeaponName(
    readings,
    result.hero.name,
    sourceKinds
  );
  if (weaponName) {
    result.weaponSummary.name = weaponName.value;
    result.ocr.fields['weaponSummary.name'] = weaponName;
    scores.push(weaponName.score);
  }

  const description = extractHeroDescription(readings);
  if (description) {
    result.hero.description = description.value;
    result.ocr.fields['hero.description'] = description;
    scores.push(description.score);
  }

  for (const field of HERO_FIELDS) {
    const group = field[0];
    const key = field[1];
    const screenKind = field[5] || null;
    const allowedSources =
      screenKind === 'summary'
        ? summarySources
        : screenKind === 'detail'
          ? detailSources
          : null;

    if (screenKind && !allowedSources.size) continue;

    const dedicatedRegion =
      group === 'status' && screenKind === 'summary'
        ? HERO_DEDICATED_REGIONS[key]
        : null;
    const candidate =
      (dedicatedRegion
        ? dedicatedRegionNumber(lines, dedicatedRegion, allowedSources)
        : null) ||
      findNumber(
        lines,
        field[2],
        field[3],
        field[4],
        allowedSources,
        field[6] || {}
      );
    if (!candidate) continue;

    result[group][key] = candidate.value;
    result.ocr.fields[group + '.' + key] = candidate;
    scores.push(candidate.score);

    if (candidate.score < 0.78) {
      result.ocr.warnings.push(
        'Revise ' + field[2][0] + ': leitura aproximada em "' + candidate.raw + '".'
      );
    }
  }

  result.ocr.readings = readings.map(item => ({
    name: item.name || 'imagem',
    confidence: Math.round(Number(item.confidence) || 0),
    method: item.method || null,
    region: item.region || 'full'
  }));
  result.ocr.confidence = confidence(readings, scores);
  result.ocr.coverage = heroCoverage(result, sourceKinds);

  result.ocr.screens = [...new Set(sourceKinds.values())]
    .filter(kind => kind !== 'unknown');

  if (!result.hero.name) {
    result.ocr.warnings.push('Nome do herói não foi confirmado automaticamente.');
  }
  if (!result.hero.class && !result.meta.detectedClassLabel) {
    result.ocr.warnings.push('Classe não foi confirmada contra o catálogo real.');
  }
  if (!scores.length) {
    result.ocr.warnings.push('Nenhum campo confiável foi reconhecido.');
  }
  if (result.ocr.confidence < 0.72 && scores.length) {
    result.ocr.warnings.push(
      'Confiança de leitura baixa: confira os valores antes de aplicar.'
    );
  }
  if (result.ocr.coverage < 0.55 && scores.length) {
    result.ocr.warnings.push(
      'Poucos campos esperados foram encontrados nesta imagem. Para cadastro completo, envie também a tela de parâmetros detalhados do herói e da arma.'
    );
  }

  return result;
}

const EQUIPMENT_STATS = [
  ['Alcance de visão do herói', ['alcance de visao do heroi', 'alcance de visao']],
  ['Dano da arma à armadura do inimigo', ['dano da arma a armadura do inimigo', 'dano da arma contra armadura']],
  ['Dano da arma à vida do inimigo', ['dano da arma a vida do inimigo', 'dano da arma contra vida']],
  ['Alcance de tiro com mira do herói', ['alcance de tiro com mira do heroi', 'alcance de tiro com mira']],
  ['Tempo de recarregamento da arma', ['tempo de recarregamento da arma', 'tempo de recarga da arma']],
  ['Tempo de troca de modo da arma', ['tempo de troca de modo da arma', 'troca de modo da arma']],
  ['Tempo de abertura de caixa', ['tempo de abertura de caixa', 'abertura de caixa']]
];

function equipmentStatLabel(line) {
  let best = null;

  for (const stat of EQUIPMENT_STATS) {
    const score = lineScore(line, stat[1]);
    if (!best || score > best.score) best = { label: stat[0], score };
  }

  return best && best.score >= 0.62 ? best : null;
}

function rarityForLine(line, rarities) {
  const text = normalize(line);
  let best = null;

  for (const rarity of rarities || []) {
    for (const value of [rarity.name, rarity.slug]) {
      if (!value) continue;
      const expected = normalize(value);
      let score = 0;
      if (text === expected) score = 1;
      else if (text.includes(expected)) score = 0.95;
      else score = lineScore(line, [value]);
      if (!best || score > best.score) best = { rarity, score };
    }
  }

  return best && best.score >= 0.68 ? best : null;
}

function bonusPieces(line) {
  const clean = normalize(line);
  if (!clean.includes('peca') && !clean.includes('equipamento')) return null;
  const parsed = numberFrom(line);
  if (!parsed || !Number.isInteger(parsed.value) || parsed.value < 1 || parsed.value > 20) return null;
  return parsed.value;
}

function equipmentAttribute(line, ocrConfidence) {
  const parsed = numberFrom(line);
  if (!parsed) return null;

  const labelMatch = equipmentStatLabel(line);
  const label = String(line).replace(parsed.raw, ' ').replace(/^[\s:;,+\-–—]+|[\s:;,+\-–—]+$/g, '').trim();

  if (!label || label.length < 3) return null;

  return {
    label,
    value: String(parsed.value),
    unit: parsed.unit,
    raw: String(line).trim(),
    confidence: Math.round(
      Math.max(0.5, Math.min(0.99, (labelMatch ? labelMatch.score : 0.58) * 0.72 + ocrConfidence * 0.28)) * 100
    ) / 100
  };
}

function setName(lines, context) {
  const full = lines.map(row => row.text).join('\n');
  const known = matchCatalog(full, context.sets || [], 0.82);
  if (known) return { value: known.row.name, known: true, score: known.score };

  for (const row of lines) {
    if (!row.clean.includes('conjunto')) continue;
    const value = row.text
      .replace(/conjunto\s*(de\s*equipamento[s]?)?/i, '')
      .replace(/\(\s*\d+\s*\/\s*\d+\s*\)/, '')
      .replace(/^[:\-\s]+/, '')
      .trim();

    if (value.length >= 3) return { value, known: false, score: 0.62 };
  }

  return null;
}

const EQUIPMENT_NAME_EXCLUSIONS = [
  'efeitos por categoria',
  'bonus do conjunto',
  'bonus de conjunto',
  'equipar',
  'melhorar',
  'voltar',
  'novo equipamento',
  'nivel maximo'
];

function isEquipmentNameRow(row, context) {
  if (!row || row.text.length < 3 || row.text.length > 60) return false;
  if (/\d/.test(row.text)) return false;
  if (/conjunto|efeitos|categoria|equipamento|b[oô]nus/i.test(row.clean)) return false;
  if (EQUIPMENT_NAME_EXCLUSIONS.some(value => row.clean === value)) return false;
  if (rarityForLine(row.text, context.rarities || [])) return false;
  if ((context.slots || []).some(slot => (
    [slot?.name, slot?.slug].some(value => normalize(value) === row.clean)
  ))) return false;
  return true;
}

function equipmentName(lines, context) {
  const candidates = [];
  const readingGroups = new Map();

  for (const row of lines) {
    const key = row.sourceKey + '|' + row.readingIndex;
    if (!readingGroups.has(key)) readingGroups.set(key, []);
    readingGroups.get(key).push(row);
  }

  for (const group of readingGroups.values()) {
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const maximum = Math.min(3, run.length);
      for (let size = 1; size <= maximum; size += 1) {
        for (let start = 0; start + size <= run.length; start += 1) {
          const rows = run.slice(start, start + size);
          const value = rows.map(row => row.text).join(' ').replace(/\s+/g, ' ').trim();
          if (value.length < 3 || value.length > 80) continue;
          const words = normalize(value).split(/\s+/).filter(Boolean).length;
          const identityRegion = rows.every(row => row.region === 'equipment-identity');
          candidates.push({
            value,
            score:
              (identityRegion ? 100 : 0) +
              Math.min(words, 8) * 4 +
              Math.min(value.length, 80) / 10 +
              (Number(rows[0].sourceIndex) || 0) / 1000
          });
        }
      }
      run = [];
    };

    for (const row of group) {
      if (!isEquipmentNameRow(row, context)) {
        flush();
        continue;
      }

      const previous = run.at(-1);
      if (previous && row.lineIndex !== previous.lineIndex + 1) flush();
      run.push(row);
    }
    flush();
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.value || null;
}

function equipmentSourceGroups(lines) {
  const groups = new Map();
  for (const row of lines) {
    if (!groups.has(row.sourceKey)) {
      groups.set(row.sourceKey, {
        name: row.source,
        sourceIndex: row.sourceIndex,
        rows: []
      });
    }
    groups.get(row.sourceKey).rows.push(row);
  }
  return [...groups.values()].sort((left, right) => left.sourceIndex - right.sourceIndex);
}

function sameEquipmentLabel(left, right) {
  const leftClean = normalize(left);
  const rightClean = normalize(right);
  if (!leftClean || !rightClean) return false;
  return leftClean === rightClean;
}

function mergeEquipmentAttribute(list, attribute) {
  const exactIndex = list.findIndex(item => (
    sameEquipmentLabel(item.label, attribute.label) &&
    String(item.value) === String(attribute.value) &&
    String(item.unit || '') === String(attribute.unit || '')
  ));

  if (exactIndex >= 0) {
    if (attribute.confidence > list[exactIndex].confidence) {
      list[exactIndex] = attribute;
    }
    return { added: false, conflict: false };
  }

  const labelIndex = list.findIndex(item => sameEquipmentLabel(item.label, attribute.label));
  if (labelIndex >= 0) {
    const previous = list[labelIndex];
    if (attribute.confidence > previous.confidence) list[labelIndex] = attribute;
    return {
      added: false,
      conflict: true,
      kept: attribute.confidence > previous.confidence ? attribute : previous,
      discarded: attribute.confidence > previous.confidence ? previous : attribute
    };
  }

  list.push(attribute);
  return { added: true, conflict: false };
}

export function parseEquipmentOcr(readings = [], context = {}, identity = {}) {
  const lines = buildLines(readings.map(reading => ({ ...reading,
    text: joinEquipmentEffectLines(reading.text, context.rarities || [])
  })));
  const combined = lines.map(row => row.text).join('\n');
  const variants = {};
  const bonuses = [];
  const sources = {};
  const warnings = [];
  const scores = [];
  const sourceStats = new Map();

  const slot = matchCatalog(combined, context.slots || [], 0.8);
  const set = setName(lines, context);
  const name = identity.name || equipmentName(lines, context);

  for (const sourceGroup of equipmentSourceGroups(lines)) {
    let currentRarity = null;
    let currentBonus = null;
    const stats = {
      name: sourceGroup.name,
      rarities: new Set(),
      attributeKeys: new Set(),
      bonusEffects: 0
    };
    sourceStats.set(sourceGroup.sourceIndex, stats);

    for (const row of sourceGroup.rows) {
      const rarity = rarityForLine(row.text, context.rarities || []);
      if (rarity) {
        currentRarity = rarity.rarity.slug;
        currentBonus = null;
        if (!variants[currentRarity]) variants[currentRarity] = [];
        scores.push(rarity.score);
        continue;
      }

      const pieces = bonusPieces(row.text);
      if (pieces) {
        currentBonus = bonuses.find(item => item.required_pieces === pieces) || null;
        if (!currentBonus) {
          currentBonus = {
            required_pieces: pieces,
            title: 'Bônus de ' + pieces + ' peças',
            description: '',
            stats: { effects: [] },
            display_order: bonuses.length + 1
          };
          bonuses.push(currentBonus);
        }
        currentRarity = null;
        continue;
      }

      const attribute = equipmentAttribute(row.text, Math.max(0, Math.min(1, row.ocrConfidence / 100)));
      if (!attribute) continue;

      if (currentBonus) {
        const effect = { ...attribute };
        const duplicate = currentBonus.stats.effects.some(item => (
          sameEquipmentLabel(item.label, effect.label) &&
          String(item.value) === String(effect.value) &&
          String(item.unit || '') === String(effect.unit || '')
        ));
        if (!duplicate) {
          currentBonus.stats.effects.push(effect);
          currentBonus.description = currentBonus.description
            ? currentBonus.description + ' · ' + attribute.raw
            : attribute.raw;
          stats.bonusEffects += 1;
          scores.push(attribute.confidence);
        }
        continue;
      }

      if (currentRarity) {
        const merge = mergeEquipmentAttribute(variants[currentRarity], attribute);
        stats.rarities.add(currentRarity);
        stats.attributeKeys.add(currentRarity + '|' + normalize(attribute.label));
        sources[currentRarity] = row.source;

        if (merge.conflict) {
          warnings.push(
            'Leituras diferentes para "' + attribute.label + '" em ' +
            currentRarity + ': foi mantido o valor mais confiável (' +
            merge.kept.value + (merge.kept.unit || '') + ').'
          );
        }
        if (merge.added) scores.push(attribute.confidence);
      }
    }
  }

  for (const slug of Object.keys(variants)) {
    if (!variants[slug].length) delete variants[slug];
  }

  const attributeCount = Object.values(variants).reduce((sum, list) => sum + list.length, 0);
  const sourceCount = sourceStats.size;
  const mappedSourceCount = [...sourceStats.values()].filter(item => (
    item.attributeKeys.size > 0 || item.bonusEffects > 0
  )).length;
  const rarityCount = Object.keys(variants).length;
  const expectedRarityCount = (context.rarities || []).length;
  const expectedFromImages = Math.min(
    expectedRarityCount || Math.max(0, sourceCount - 1),
    Math.max(0, sourceCount - 1)
  );
  const minimumExpectedRarityCount = sourceCount >= 4
    ? Math.max(2, Math.ceil(expectedFromImages * 0.65))
    : 0;
  const missingRarities = (context.rarities || [])
    .filter(item => !variants[item.slug])
    .map(item => item.name || item.slug);
  const incompleteBatch = sourceCount >= 4 && rarityCount < minimumExpectedRarityCount;

  if (incompleteBatch) {
    warnings.unshift(
      'Leitura em massa incompleta: somente ' + rarityCount +
      ' raridade(s) com atributos foram reconhecidas em ' + sourceCount +
      ' imagem(ns). Revise as raridades faltantes antes de aplicar.'
    );
  }
  if (!attributeCount) warnings.push('Nenhum atributo de raridade foi reconhecido com segurança.');
  if (!name) warnings.push('Nome do equipamento não foi confirmado automaticamente.');
  if (!slot) warnings.push('Slot não foi confirmado contra o catálogo real.');
  if (set && !set.known) warnings.push('O conjunto "' + set.value + '" não existe no catálogo e não será criado automaticamente.');

  return {
    schemaVersion: 2,
    name,
    slug: identity.slug || null,
    slot: slot && slot.row ? slot.row.slug : null,
    slotSlug: slot && slot.row ? slot.row.slug : null,
    setName: set ? set.value : null,
    description: null,
    recommendation: null,
    displayOrder: null,
    enabled: null,
    variants,
    bonuses,
    sources,
    ocr: {
      confidence: confidence(readings, scores),
      warnings,
      fields: {},
      batch: {
        sourceCount,
        mappedSourceCount,
        rarityCount,
        expectedRarityCount,
        minimumExpectedRarityCount,
        missingRarities,
        incomplete: incompleteBatch
      },
      readings: readings.map(item => ({
        name: item.name || 'imagem',
        sourceIndex: Number.isInteger(item.sourceIndex) ? item.sourceIndex : null,
        confidence: Math.round(Number(item.confidence) || 0),
        method: item.method || null
      }))
    }
  };
}

export function parseLocalOcr(options = {}) {
  if (options.entityType === 'hero') {
    return parseHeroOcr(options.readings || [], options.context || {}, options.identity || {});
  }
  if (options.entityType === 'equipment') {
    return parseEquipmentOcr(options.readings || [], options.context || {}, options.identity || {});
  }
  throw new Error('Tipo de conteúdo não suportado pelo OCR local.');
}
