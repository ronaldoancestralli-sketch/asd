import { parseHeroOcr, parseEquipmentOcr as parseOrderedEquipmentOcr } from './admin-local-ocr-parser-legacy.js?v=20260916-ocr-continuation-1&eq=20260907-effects-1';
import { parseEquipmentOcr as parseUnindexedEquipmentOcr } from './admin-local-ocr-parser-legacy-original.js?v=20260916-ocr-continuation-1&bornal=20260917-ocr-grouping-1&eq=20260907-effects-1';
import { equipmentAttributeWithSource } from './equipment-effect-text.js?v=20260916-ocr-continuation-1&eq=20260907-effects-1';

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

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[|]/g, 'i').replace(/\s+/g, ' ').trim();
}

function orderedRarities(context = {}) {
  return (context.rarities || [])
    .map((rarity, index) => ({ rarity, index }))
    .sort((left, right) => {
      const leftRank = Number(left.rarity?.rank);
      const rightRank = Number(right.rarity?.rank);
      const leftHasRank = left.rarity?.rank !== null && left.rarity?.rank !== undefined && Number.isFinite(leftRank);
      const rightHasRank = right.rarity?.rank !== null && right.rarity?.rank !== undefined && Number.isFinite(rightRank);
      if (leftHasRank && rightHasRank && leftRank !== rightRank) return leftRank - rightRank;
      if (leftHasRank !== rightHasRank) return leftHasRank ? -1 : 1;
      return left.index - right.index;
    })
    .map(item => item.rarity)
    .slice(0, 11);
}

function stripRarityHeaders(text, context) {
  const rarities = context.rarities || [];
  return String(text || '').split(/\r?\n/).filter(line => {
    const clean = normalize(line);
    if (!clean) return false;
    return !rarities.some(rarity => {
      const name = normalize(rarity.name);
      const slug = normalize(rarity.slug);
      return clean === name || clean === slug || clean.includes(name) || clean.includes(slug);
    });
  }).join('\n');
}

function orderedReadings(readings, context) {
  const rarities = orderedRarities(context);
  const indexed = new Map();
  const result = [];

  for (const reading of readings) {
    const index = Number.isInteger(reading?.sourceIndex) ? reading.sourceIndex : null;
    if (index === null) {
      result.push(reading);
      continue;
    }
    if (!indexed.has(index)) indexed.set(index, []);
    indexed.get(index).push(reading);
  }

  for (let index = 0; index < rarities.length; index += 1) {
    const rarity = rarities[index];
    for (const reading of indexed.get(index) || []) {
      result.push({
        ...reading,
        text: `${rarity.name || rarity.slug}\n${stripRarityHeaders(reading.text, context)}`,
        forcedRarity: rarity.slug,
        region: reading.region || 'equipment-effects'
      });
    }
  }

  // A 12th/13th image is reference/identity material, never another rarity.
  for (const [index, group] of indexed.entries()) {
    if (index < rarities.length) continue;
    for (const reading of group) {
      result.push({ ...reading, text: stripRarityHeaders(reading.text, context), forcedRarity: null });
    }
  }

  return result;
}

function prioritizeDedicatedVariantReadings(readings = []) {
  const groups = new Map();

  readings.forEach((reading, index) => {
    const key = Number.isInteger(reading?.sourceIndex)
      ? `index:${reading.sourceIndex}`
      : `reading:${index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ reading, index });
  });

  const selectedIndexes = new Set();
  let suppressedBroadReadingCount = 0;

  for (const group of groups.values()) {
    const dedicated = group.filter(item => (
      item.reading?.region === 'equipment-effects' &&
      String(item.reading?.text || '').trim()
    ));
    const selected = dedicated.length ? dedicated : group;
    selected.forEach(item => selectedIndexes.add(item.index));
    if (dedicated.length) suppressedBroadReadingCount += group.length - dedicated.length;
  }

  return {
    readings: readings.filter((reading, index) => selectedIndexes.has(index)),
    suppressedBroadReadingCount
  };
}

function mergeEquipmentMetadata(parsed, metadata) {
  for (const key of ['name', 'slot', 'slotSlug', 'setName']) {
    if (!parsed[key] && metadata?.[key]) parsed[key] = metadata[key];
  }
  if (!(parsed.bonuses || []).length && (metadata?.bonuses || []).length) {
    parsed.bonuses = metadata.bonuses;
  }
  return parsed;
}

function auditUploadOrder(parsed, readings, context) {
  const rarities = orderedRarities(context);
  const sourceIndexes = new Map();

  for (const reading of readings) {
    if (!reading?.name || !Number.isInteger(reading?.sourceIndex)) continue;
    if (!sourceIndexes.has(reading.name)) sourceIndexes.set(reading.name, new Set());
    sourceIndexes.get(reading.name).add(reading.sourceIndex);
  }

  const confirmed = [];
  const conflicts = [];

  for (const [detectedSlug, sourceName] of Object.entries(parsed.sources || {})) {
    const indexes = sourceIndexes.get(sourceName);
    if (!indexes || indexes.size !== 1) continue;
    const sourceIndex = [...indexes][0];
    const expected = rarities[sourceIndex];
    if (!expected) continue;

    const expectedSlug = expected.slug || expected.name;
    const row = {
      sourceIndex,
      sourceName,
      detectedSlug,
      detectedName: rarities.find(item => normalize(item.slug || item.name) === normalize(detectedSlug))?.name || detectedSlug,
      expectedSlug,
      expectedName: expected.name || expectedSlug
    };

    if (normalize(expectedSlug) === normalize(detectedSlug)) confirmed.push(row);
    else conflicts.push(row);
  }

  return {
    confirmed,
    conflicts,
    // A posição só pode preencher um cabeçalho ausente depois que pelo menos
    // duas imagens reais confirmarem que o navegador preservou a ordem.
    reliable: conflicts.length === 0 && confirmed.length >= 2
  };
}

function mergeOrderFallback(parsed, orderedParsed, rarities) {
  const filled = [];
  parsed.variants = parsed.variants || {};
  parsed.sources = parsed.sources || {};

  for (const rarity of rarities) {
    const slug = rarity.slug;
    if (!slug || (parsed.variants[slug] || []).length) continue;
    const fallback = orderedParsed.variants?.[slug] || [];
    if (!fallback.length) continue;
    parsed.variants[slug] = fallback;
    if (orderedParsed.sources?.[slug]) parsed.sources[slug] = orderedParsed.sources[slug];
    filled.push(rarity.name || slug);
  }

  return filled;
}

function remapAttribute(attribute) {
  if (!attribute) return attribute;
  return equipmentAttributeWithSource(attribute);
}

function remapParsed(parsed) {
  for (const [slug, attributes] of Object.entries(parsed.variants || {})) {
    parsed.variants[slug] = attributes.map(remapAttribute);
  }
  for (const bonus of parsed.bonuses || []) {
    if (bonus.stats?.effects) bonus.stats.effects = bonus.stats.effects.map(remapAttribute);
  }
  return parsed;
}

function isIdentityNameLine(line, context) {
  const value = String(line || '').trim();
  const clean = normalize(value);
  if (!value || value.length < 2 || value.length > 60 || /\d/.test(value)) return false;
  if (/conjunto|efeitos|categoria|equipamento|bonus|bônus/.test(clean)) return false;
  if (EQUIPMENT_NAME_EXCLUSIONS.some(item => clean === item)) return false;
  if ((context.rarities || []).some(item => [item?.name, item?.slug].some(name => normalize(name) === clean))) return false;
  if ((context.slots || []).some(item => [item?.name, item?.slug].some(name => normalize(name) === clean))) return false;
  const letters = value.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < 2) return false;
  const upperRatio = [...letters].filter(char => char === char.toUpperCase()).length / letters.length;
  return upperRatio >= 0.62;
}

function recoverIdentityName(readings, context, identity) {
  if (identity?.name) return identity.name;
  const candidates = [];

  for (const reading of readings) {
    if (reading?.region !== 'equipment-identity') continue;
    const rawLines = String(reading.text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 10);
    let run = [];

    const flush = () => {
      if (!run.length) return;
      const maximum = Math.min(3, run.length);
      for (let size = 1; size <= maximum; size += 1) {
        for (let start = 0; start + size <= run.length; start += 1) {
          const value = run.slice(start, start + size).join(' ').replace(/\s+/g, ' ').trim();
          if (value.length < 3 || value.length > 80) continue;
          const words = normalize(value).split(/\s+/).filter(Boolean).length;
          candidates.push({ value, score: words * 4 + Math.min(value.length, 80) / 10 });
        }
      }
      run = [];
    };

    for (const line of rawLines) {
      if (!isIdentityNameLine(line, context)) {
        flush();
        continue;
      }
      run.push(line);
    }
    flush();
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.value || null;
}

function finalizeWarnings(parsed) {
  parsed.ocr = parsed.ocr || {};
  parsed.ocr.warnings = [...new Set(Array.isArray(parsed.ocr.warnings) ? parsed.ocr.warnings : [])];
  for (const [rarity, rows] of Object.entries(parsed.variants || {})) {
    for (const row of rows) if (row.textReview) parsed.ocr.warnings.push(`${rarity}: ${row.textReview} (${row.raw || row.label})`);
  }
  return parsed;
}

export function parseEquipmentOcr(readings = [], context = {}, identity = {}) {
  const indexedBatch = readings.some(item => Number.isInteger(item?.sourceIndex));

  // Legacy/manual JSON and single-screen OCR can contain several rarity headers in one image.
  // Preserve that parser whenever upload order was not explicitly supplied by the importer.
  if (!indexedBatch) {
    const parsed = remapParsed(parseUnindexedEquipmentOcr(readings, context, identity));
    parsed.schemaVersion = 3;
    parsed.ocr = parsed.ocr || {};
    parsed.ocr.batch = {
      ...(parsed.ocr.batch || {}),
      orderedByUpload: false,
      orderRule: 'Sem sourceIndex explícito, as raridades são associadas pelos cabeçalhos realmente reconhecidos na imagem.'
    };
    return finalizeWarnings(parsed);
  }

  // O texto visível no painel do jogo é a fonte de verdade. A ordem recebida
  // pelo FileList varia entre navegadores (principalmente no seletor do iOS),
  // portanto nunca pode sobrescrever um cabeçalho de raridade reconhecido.
  const variantSelection = prioritizeDedicatedVariantReadings(readings);
  const parsed = remapParsed(parseUnindexedEquipmentOcr(variantSelection.readings, context, identity));
  if (variantSelection.suppressedBroadReadingCount) {
    const metadata = remapParsed(parseUnindexedEquipmentOcr(readings, context, identity));
    mergeEquipmentMetadata(parsed, metadata);
  }
  const rarities = orderedRarities(context);
  const orderAudit = auditUploadOrder(parsed, readings, context);
  let orderFallbackRarities = [];

  // A posição continua útil quando um único cabeçalho ficou ilegível, mas só
  // depois que outros cabeçalhos confirmaram que o lote realmente está em
  // Comum → Divino. Havendo qualquer conflito, o fallback fica bloqueado.
  if (orderAudit.reliable) {
    const ordered = orderedReadings(readings, context);
    const orderedParsed = remapParsed(parseOrderedEquipmentOcr(ordered, context, identity));
    orderFallbackRarities = mergeOrderFallback(parsed, orderedParsed, rarities);
  }

  const recoveredName = recoverIdentityName(readings, context, identity);
  if (recoveredName) parsed.name = recoveredName;

  const missing = rarities.filter(rarity => !(parsed.variants?.[rarity.slug] || []).length).map(rarity => rarity.name || rarity.slug);
  const rarityCount = rarities.length - missing.length;
  const sourceIndexes = new Set(readings.map(item => item?.sourceIndex).filter(Number.isInteger));

  parsed.schemaVersion = 3;
  parsed.ocr = parsed.ocr || {};
  parsed.ocr.batch = {
    ...(parsed.ocr.batch || {}),
    sourceCount: sourceIndexes.size || parsed.ocr.batch?.sourceCount || 0,
    mappedSourceCount: rarities.filter(rarity => (parsed.variants?.[rarity.slug] || []).length).length,
    rarityCount,
    expectedRarityCount: rarities.length,
    minimumExpectedRarityCount: rarities.length,
    missingRarities: missing,
    incomplete: missing.length > 0,
    orderedByUpload: orderFallbackRarities.length > 0,
    mappingStrategy: 'rarity-header-first',
    variantRegionPriority: 'equipment-effects',
    suppressedBroadVariantReadingCount: variantSelection.suppressedBroadReadingCount,
    headerMappingCount: orderAudit.confirmed.length + orderAudit.conflicts.length,
    headerOrderConflictCount: orderAudit.conflicts.length,
    headerOrderConflicts: orderAudit.conflicts,
    uploadOrderReliable: orderAudit.reliable,
    uploadOrderFallbackRarities: orderFallbackRarities,
    orderRule: 'O cabeçalho visível da raridade é autoritativo. A posição do arquivo só preenche cabeçalhos ausentes quando pelo menos duas imagens confirmam a ordem e nenhuma a contradiz.'
  };

  const warnings = (Array.isArray(parsed.ocr.warnings) ? [...parsed.ocr.warnings] : [])
    .filter(item => !String(item).startsWith('Leitura em massa incompleta:'));
  if (orderAudit.conflicts.length) {
    const example = orderAudit.conflicts[0];
    warnings.unshift(
      `A ordem dos arquivos divergiu dos cabeçalhos lidos (imagem ${example.sourceIndex + 1}: ${example.detectedName}; a posição sugeria ${example.expectedName}). ` +
      'Os cabeçalhos visíveis foram preservados e a posição foi ignorada para impedir troca de status.'
    );
  } else if (missing.length && !orderAudit.reliable) {
    warnings.unshift(
      'A ordem do lote não pôde ser confirmada por cabeçalhos suficientes. Campos sem raridade reconhecida ficaram vazios para impedir associação incorreta.'
    );
  }
  if (missing.length) {
    warnings.unshift(`Leitura em massa incompleta: ${rarityCount}/${rarities.length} raridades possuem atributos. Faltando: ${missing.join(', ')}.`);
  }
  parsed.ocr.warnings = warnings;
  return finalizeWarnings(parsed);
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

export { parseHeroOcr };
