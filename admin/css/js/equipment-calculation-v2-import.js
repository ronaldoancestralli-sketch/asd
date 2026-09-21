import { equipmentEffectTextReview } from './equipment-effect-text.js?v=20260916-ocr-continuation-1&eq=20260907-effects-1';
import {
  canonicalCalculationUnit,
  normalizeCalculationEffectLabel,
  recognizeCalculationOperation,
  recognizeImportedCalculationEffect
} from './equipment-calculation-v2-recognition.js?v=20260920-resolution-authority-1';

const DEFAULT_RARITIES = Object.freeze([
  'comum', 'raro', 'epico', 'lendario', 'mitico', 'supremo',
  'grandioso', 'celestial', 'estelar', 'imortal', 'divino'
]);

const LEADING_VALUE = /^\s*(?:[•·*›»]\s*)?[+−–-]?\s*\d+(?:[.,]\d+)?\s*(?:%|°|x\b|s\b|m\b)?\s*/i;
const LEADING_ARTICLES = new Set(['a', 'ao', 'as', 'aos', 'o', 'os']);

function text(value) {
  return String(value ?? '').trim();
}

function normalizedText(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// This key only repairs mechanical OCR noise before semantic resolution.
// It never removes contextual words such as "mirando", "sem mirar" or
// "em movimento".
function ocrGroupingKey(value) {
  const stable = normalizeCalculationEffectLabel(value)
    .split(/\s+/)
    .filter(token => token.length > 1 && !/^\d+$/.test(token));
  while (stable.length && LEADING_ARTICLES.has(stable[0])) stable.shift();
  return stable.join(' ') || normalizedText(value);
}

function splitPercentValueFromRaw(value) {
  const match = text(value).match(
    /^\s*(?:[•·*›»]\s*)?([+−–-])\s*((?:\d\s+){1,3}\d)\s*%/u
  );
  if (!match) return null;
  const magnitude = Number(match[2].replace(/\s+/g, ''));
  if (!Number.isFinite(magnitude)) return null;
  return match[1] === '+' ? magnitude : -magnitude;
}

function preferredDescription(group) {
  return [...group.descriptions.values()]
    .sort((left, right) => (
      right.count - left.count
      || right.confidence - left.confidence
      || left.description.length - right.description.length
    ))[0]?.description || group.description;
}

function localizedNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = text(value).replace(/\s+/g, '').replace(',', '.');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowsForVariant(variant) {
  if (Array.isArray(variant)) return variant.filter(row => row && typeof row === 'object');
  if (!variant || typeof variant !== 'object') return [];
  return Object.entries(variant).map(([label, value]) => (
    value && typeof value === 'object' && !Array.isArray(value)
      ? { label, ...value }
      : { label, value }
  ));
}

function descriptionFor(attribute) {
  const explicit = text(attribute.label || attribute.name || attribute.description);
  if (explicit) return explicit;
  return text(attribute.raw).replace(LEADING_VALUE, '').trim();
}

function operationFor(attribute) {
  return recognizeCalculationOperation(attribute);
}

function valueFor(attribute) {
  const repairedRawValue = splitPercentValueFromRaw(attribute.raw);
  const value = repairedRawValue ?? localizedNumber(attribute.value);
  if (value === null) return null;
  const operator = normalizedText(attribute.operator).replace(/[\s-]+/g, '_');
  if (operator.startsWith('decrease') || operator.startsWith('subtract')) return -Math.abs(value);
  if (operator.startsWith('increase') || operator.startsWith('add')) return Math.abs(value);
  if (/^\s*(?:[•·*›»]\s*)?[−–-]/.test(text(attribute.raw))) return -Math.abs(value);
  if (/^\s*(?:[•·*›»]\s*)?\+/.test(text(attribute.raw))) return Math.abs(value);
  return value;
}

function raritySlugs(rarities) {
  const supplied = Array.isArray(rarities)
    ? rarities.map(rarity => text(rarity?.slug || rarity).toLowerCase()).filter(Boolean)
    : [];
  return supplied.length ? supplied : [...DEFAULT_RARITIES];
}

function imageReferenceFor(draft, slug, attribute) {
  const explicit = text(
    attribute.sourceImageReference
    || attribute.source_image_reference
    || attribute.image
    || attribute.filename
  );
  if (explicit) return explicit;
  const readings = Array.isArray(draft?.ocr?.readings) ? draft.ocr.readings : [];
  const match = readings.find(reading => normalizedText(reading?.name).includes(normalizedText(slug)))
    || readings[0];
  return text(match?.name || match?.url || match?.path) || null;
}

function hasValueOverlap(left, right, slugs) {
  return slugs.some(slug => (
    typeof left.values?.[slug] === 'number'
    && typeof right.values?.[slug] === 'number'
  ));
}

function semanticSignature(effect) {
  if (!effect.target || effect.resolutionStatus !== 'resolved') return null;
  return [
    effect.target,
    effect.semanticContext || 'general',
    effect.observedUnit || 'implicit',
    effect.operation
  ].join('\u0000');
}

function consolidateBySemanticSignature(effects, slugs, warnings) {
  const output = [];
  const bySignature = new Map();
  for (const effect of effects) {
    const signature = semanticSignature(effect);
    const candidates = signature ? bySignature.get(signature) || [] : [];
    const current = candidates.find(candidate => !hasValueOverlap(candidate, effect, slugs));
    if (!current) {
      output.push(effect);
      if (signature) {
        candidates.push(effect);
        bySignature.set(signature, candidates);
      }
      continue;
    }

    for (const slug of slugs) {
      if (current.values[slug] === null && effect.values[slug] !== null) {
        current.values[slug] = effect.values[slug];
      }
    }
    current.originalTexts = [...new Set([
      ...(current.originalTexts || [current.originalText]),
      ...(effect.originalTexts || [effect.originalText])
    ].filter(Boolean))];
    current.sourceImageReferences = [...new Set([
      ...(current.sourceImageReferences || [current.sourceImageReference]),
      ...(effect.sourceImageReferences || [effect.sourceImageReference])
    ].filter(Boolean))];
    current.rarityEvidence = {
      ...(current.rarityEvidence || {}),
      ...(effect.rarityEvidence || {})
    };
    current.needsTextReview ||= effect.needsTextReview;
    warnings.push(
      `“${effect.description}” foi reunido a “${current.description}” pela assinatura semântica publicada.`
    );
  }
  return output.map((effect, order) => ({ ...effect, order }));
}

export function createCalculationEffectsFromImport(draft, options = {}) {
  const slugs = raritySlugs(options.rarities);
  const idFactory = typeof options.idFactory === 'function'
    ? options.idFactory
    : () => crypto.randomUUID();
  const variants = draft?.variants && typeof draft.variants === 'object'
    ? draft.variants
    : {};
  const rowsBySlug = new Map(slugs.map(slug => [slug, rowsForVariant(variants[slug])]));
  const groups = new Map();
  const warnings = [];
  let importedValueCount = 0;
  let duplicateCount = 0;

  for (const slug of slugs) {
    const occurrences = new Map();
    for (const attribute of rowsBySlug.get(slug)) {
      const description = descriptionFor(attribute);
      const value = valueFor(attribute);
      if (!description || value === null) {
        warnings.push(`${slug}: uma linha sem descrição ou valor numérico foi mantida fora do cálculo.`);
        continue;
      }

      const operation = operationFor(attribute);
      const observedUnit = canonicalCalculationUnit({
        unit: attribute.unit,
        operation,
        raw: attribute.raw
      });
      const occurrenceBase = [
        ocrGroupingKey(description),
        observedUnit,
        operation || 'pending'
      ].join('\u0000');
      const occurrence = occurrences.get(occurrenceBase) || 0;
      occurrences.set(occurrenceBase, occurrence + 1);
      if (occurrence > 0) duplicateCount += 1;
      // The same occurrence index is shared across rarities. The rarity slug is
      // intentionally absent so 11 images never become 11 separate effects.
      const groupKey = `${occurrenceBase}\u0000${occurrence}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          description,
          descriptions: new Map(),
          operations: new Set(),
          units: new Set(),
          samples: [],
          originalTexts: [],
          sourceImageReferences: [],
          rarityEvidence: {},
          values: Object.fromEntries(slugs.map(rarity => [rarity, null])),
          needsTextReview: false
        });
      }

      const group = groups.get(groupKey);
      const exactDescriptionKey = normalizedText(description);
      const descriptionCandidate = group.descriptions.get(exactDescriptionKey) || {
        description,
        count: 0,
        confidence: 0
      };
      descriptionCandidate.count += 1;
      descriptionCandidate.confidence = Math.max(
        descriptionCandidate.confidence,
        Number(attribute.confidence) || 0
      );
      group.descriptions.set(exactDescriptionKey, descriptionCandidate);
      if (operation) group.operations.add(operation);
      group.units.add(observedUnit);
      group.samples.push(attribute);
      group.originalTexts.push(text(attribute.raw) || description);
      const imageReference = imageReferenceFor(draft, slug, attribute);
      if (imageReference) group.sourceImageReferences.push(imageReference);
      group.rarityEvidence[slug] = {
        originalText: text(attribute.raw) || description,
        sourceImageReference: imageReference,
        observedUnit
      };
      group.values[slug] = value;
      group.needsTextReview ||= Boolean(
        attribute.textReview
        || equipmentEffectTextReview(description)
        || (!attribute.textEdited && equipmentEffectTextReview(attribute.raw))
      );
      importedValueCount += 1;
    }
  }

  const groupedEffects = [];
  let consolidatedOcrVariantCount = 0;
  if (duplicateCount) {
    warnings.push('Descrições repetidas na mesma raridade foram pareadas pela ocorrência, unidade e operação.');
  }

  for (const group of groups.values()) {
    group.description = preferredDescription(group);
    consolidatedOcrVariantCount += Math.max(0, group.descriptions.size - 1);
    const effectId = idFactory();
    const operations = [...group.operations];
    const units = [...group.units];
    if (operations.length > 1) {
      warnings.push(`“${group.description}”: a leitura trouxe operações incompatíveis; a operação ficou pendente.`);
    }
    if (units.length > 1) {
      warnings.push(`“${group.description}”: a leitura trouxe unidades incompatíveis; o vínculo ficou pendente.`);
    }
    if (group.needsTextReview) {
      warnings.push(`“${group.description}”: o texto parece incompleto e precisa ser conferido na imagem.`);
    }
    const sample = group.samples[0] || {};
    const operation = operations.length === 1 ? operations[0] : null;
    const recognized = recognizeImportedCalculationEffect({
      description: group.description,
      operation,
      operator: sample.operator,
      unit: sample.unit,
      raw: sample.raw,
      definitions: options.definitions,
      aliases: options.aliases,
      evidence: draft?.ocr?.evidence,
      effectId
    });
    const unitConflict = units.length > 1;
    groupedEffects.push({
      id: effectId,
      kind: 'numeric',
      description: group.description,
      originalText: group.originalTexts[0] || group.description,
      originalTexts: [...new Set(group.originalTexts)],
      normalizedText: recognized.normalizedText,
      observedUnit: unitConflict ? null : recognized.unit,
      semanticContext: recognized.context,
      resolvedAliasId: recognized.aliasId,
      definitionVersion: recognized.definitionVersion,
      resolutionStatus: unitConflict ? 'unit_mismatch' : recognized.resolutionStatus,
      sourceImageReference: group.sourceImageReferences[0] || null,
      sourceImageReferences: [...new Set(group.sourceImageReferences)],
      rarityEvidence: group.rarityEvidence,
      target: unitConflict ? null : recognized.target,
      operation,
      scope: recognized.scope,
      condition: recognized.condition,
      conditionExpected: recognized.conditionExpected,
      evaluatedOn: recognized.evaluatedOn,
      sourceKind: recognized.sourceKind,
      sourceReference: recognized.sourceReference,
      order: groupedEffects.length,
      needsTextReview: group.needsTextReview,
      recognitionMethod: unitConflict ? 'unit_mismatch' : recognized.method,
      values: group.values
    });
  }

  const effects = consolidateBySemanticSignature(groupedEffects, slugs, warnings);

  if (consolidatedOcrVariantCount) {
    warnings.push(
      `${consolidatedOcrVariantCount} variação(ões) de artigo, letra ou número isolado do OCR `
      + 'foram reunidas sem aproximar descrições diferentes.'
    );
  }

  if (effects.length) {
    const pending = effects.filter(effect => (
      !effect.target
      || !effect.operation
      || effect.needsTextReview
      || effect.resolutionStatus !== 'resolved'
    )).length;
    warnings.unshift(pending
      ? `${effects.length - pending} efeito(s) reconhecido(s) automaticamente; ${pending} permanece(m) pendente(s).`
      : `${effects.length} efeito(s) reconhecido(s) automaticamente com as raridades disponíveis.`);
  }

  const recognizedEffectCount = effects.filter(effect => (
    effect.target
    && effect.operation
    && !effect.needsTextReview
    && effect.resolutionStatus === 'resolved'
  )).length;

  return {
    effects,
    warnings: [...new Set(warnings)],
    importedValueCount,
    rarityCount: slugs.filter(slug => rowsBySlug.get(slug).length > 0).length,
    recognizedEffectCount,
    pendingEffectCount: effects.length - recognizedEffectCount
  };
}

export { DEFAULT_RARITIES };
