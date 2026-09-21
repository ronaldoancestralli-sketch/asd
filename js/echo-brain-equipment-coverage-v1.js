import {
  STAT_DEFINITIONS,
  applyEquipmentStats,
  canonicalKey,
  resolverChavePT
} from './game-stat-engine.js?v=15&sc=20260906-1&eq=20260907-effects-1';
import { statusAttributeRows, stableStatusJson, statusMagnitude } from './status-registry-v1.js?sc=20260906-1&eq=20260907-effects-1';
import {
  canonicalItemStat,
  evaluateAppliedModifiersForHeroV3
} from './echo-brain-item-fit-v3.js?sc=20260906-1';
import { buildEchoBrainSemanticGraph } from './echo-brain-semantic-graph-v1.js';

const EXTRA_NUMERIC_BASES = [
  'penetration_resistance',
  'fire_interval',
  'aim_time',
  'dispersion',
  'moving_dispersion',
  'aimed_dispersion'
];

const SYNTHETIC_BASE = Object.fromEntries(
  [...new Set([...Object.keys(STAT_DEFINITIONS), ...EXTRA_NUMERIC_BASES])]
    .map(key => [key, 100])
);

function finiteProbeValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return 1;
  return numeric;
}

function semanticProbe(rawKey, rawValue) {
  const canonical = canonicalItemStat(rawKey);
  const result = evaluateAppliedModifiersForHeroV3({
    hero: { id: 'coverage-probe' },
    skills: [],
    baseStats: {},
    applied: [],
    unknown: [canonical],
    rawModifiers: [{ [rawKey]: rawValue }]
  });
  return result.unresolvedModifiers?.find(row => row.stat === canonical) || null;
}

export function classifyEquipmentAttributeV1(rawKey, rawValue = 1, source = {}) {
  const label = String(rawKey || '').trim();
  const binding = source.registry?.payload.bindings.find(b => b.source_kind === source.kind && b.source_id === source.id && b.attribute_key === source.key);
  if (binding) {
    const unchanged = stableStatusJson(binding.source_snapshot) === stableStatusJson(source.raw);
    const numeric = unchanged && statusMagnitude(rawValue, binding.unit) !== null;
    return { rawKey:label, canonicalKey:binding.target, target:binding.target, classification:numeric?'numeric_mapping_known':'unmapped', numeric, semantic:numeric,
      operation:binding.operator.endsWith('_percent')?'percent':'add', registryRevision:source.registry.revision, bindingId:binding.id,
      reason:!unchanged?'status_source_changed':!numeric?'status_invalid_value':'published_status_binding_requires_base_proof' };
  }
  if (source.registry) return { rawKey: label, canonicalKey: '', target: null, classification: 'unmapped', numeric: false, semantic: false, registryRevision: source.registry.revision, reason: 'status_binding_required' };
  if (!label) return {
    rawKey: label,
    canonicalKey: '',
    classification: 'unmapped',
    numeric: false,
    semantic: false,
    reason: 'empty_attribute_key'
  };

  const probeValue = finiteProbeValue(rawValue);
  const numericResult = applyEquipmentStats(SYNTHETIC_BASE, [{ [label]: probeValue }]);
  const applied = numericResult.applied?.find(row => String(row.sourceKey) === label) || numericResult.applied?.[0] || null;
  if (applied && !(numericResult.unknown || []).length) {
    return {
      rawKey: label,
      canonicalKey: canonicalKey(label),
      classification: 'numeric_mapping_known',
      numeric: true,
      semantic: true,
      target: applied.target || null,
      operation: applied.operation || null,
      ptRule: resolverChavePT(label),
      reason: 'canonical_numeric_engine'
    };
  }

  const semantic = semanticProbe(label, rawValue);
  if (semantic && semantic.kind !== 'unmapped') {
    return {
      rawKey: label,
      canonicalKey: canonicalItemStat(label),
      classification: 'semantic_only',
      numeric: false,
      semantic: true,
      semanticKind: semantic.kind,
      combat: semantic.combat,
      calculableWithoutBase: semantic.calculableWithoutBase === true,
      reason: semantic.reasons?.[0] || 'known_semantic_effect_without_safe_numeric_formula'
    };
  }

  return {
    rawKey: label,
    canonicalKey: canonicalItemStat(label),
    classification: 'unmapped',
    numeric: false,
    semantic: false,
    semanticKind: semantic?.kind || 'unmapped',
    reason: semantic?.reasons?.[0] || 'no_numeric_or_semantic_mapping'
  };
}

export function classifySetBonusTextV1(bonus = {}) {
  const text = `${bonus?.title || ''} ${bonus?.description || ''}`.trim();
  if (!text) return {
    classification: 'empty',
    semantic: false,
    effects: [],
    triggers: []
  };
  const graph = buildEchoBrainSemanticGraph({ setBonuses: [bonus] });
  const bonusEdges = (graph.edges || []).filter(edge => edge.sourceType === 'set_bonus');
  const effects = [...new Set(bonusEdges.filter(edge => edge.relation === 'produces_effect').map(edge => edge.targetId))];
  const stats = [...new Set(bonusEdges.filter(edge => edge.relation === 'modifies_stat').map(edge => edge.targetId))];
  return {
    classification: effects.length || stats.length ? 'semantic_text_known' : 'unmapped_text',
    semantic: effects.length > 0 || stats.length > 0,
    effects,
    stats,
    text
  };
}

function equipmentName(bundle = {}) {
  const equipment = bundle?.equipment || bundle || {};
  return equipment.name || equipment.slug || equipment.id || 'equipment';
}

function equipmentId(bundle = {}) {
  const equipment = bundle?.equipment || bundle || {};
  return String(equipment.id || equipment.databaseId || equipment.slug || equipmentName(bundle));
}

export function auditEquipmentBundlesCoverageV1(bundles = [], registry = null, { completeCatalogue = false } = {}) {
  const attributes = new Map();
  const bonusTexts = new Map();
  const seenBonuses = new Set();
  const sourceReferences = new Map();
  const seenLines = new Set();

  for (const bundle of bundles || []) {
    if (!bundle) continue;
    const id = equipmentId(bundle);
    const name = equipmentName(bundle);
    for (const variant of bundle.variants || bundle.levels || []) {
      const rarity = variant?.equipment_rarities?.slug || variant?.rarity_slug || variant?.rarity_id || 'unknown';
      const sourceKey = `equipment_variant:${variant.id}`;
      sourceReferences.set(sourceKey, { equipmentId:id, equipmentName:name, rarity });
      for (const line of statusAttributeRows(variant?.attributes ?? variant?.stats)) {
        seenLines.add(`${sourceKey}:${line.key}`);
        const [rawKey, rawValue] = [line.label,line.value];
        const result = classifyEquipmentAttributeV1(rawKey, rawValue, {registry,kind:'equipment_variant',id:variant.id,key:line.key,raw:line.raw});
        const key = `${result.classification}:${result.canonicalKey}:${result.target || result.semanticKind || ''}:${result.reason}`;
        if (!attributes.has(key)) attributes.set(key, { ...result, occurrences: 0, references: [] });
        const row = attributes.get(key);
        row.occurrences += 1;
        if (row.references.length < 12) row.references.push({ equipmentId: id, equipmentName: name, rarity, rawKey, rawValue });
      }
    }

    for (const bonus of bundle.bonuses || []) {
      const bonusId = String(bonus?.id || `${bonus?.set_id || 'set'}:${bonus?.required_pieces || bonus?.requiredPieces || 0}`);
      if (seenBonuses.has(bonusId)) continue;
      seenBonuses.add(bonusId);
      const sourceKey = `set_bonus:${bonus.id}`;
      sourceReferences.set(sourceKey, { equipmentId:id, equipmentName:name, rarity:`set:${bonus?.required_pieces || bonus?.requiredPieces || '?'}` });
      for (const line of statusAttributeRows(bonus?.stats)) {
        seenLines.add(`${sourceKey}:${line.key}`);
        const [rawKey, rawValue] = [line.label,line.value];
        const result = classifyEquipmentAttributeV1(rawKey, rawValue, {registry,kind:'set_bonus',id:bonus.id,key:line.key,raw:line.raw});
        const key = `${result.classification}:${result.canonicalKey}:${result.target || result.semanticKind || ''}:${result.reason}`;
        if (!attributes.has(key)) attributes.set(key, { ...result, occurrences: 0, references: [] });
        const row = attributes.get(key);
        row.occurrences += 1;
        if (row.references.length < 12) row.references.push({ equipmentId: id, equipmentName: name, rarity: `set:${bonus?.required_pieces || bonus?.requiredPieces || '?'}`, rawKey, rawValue });
      }
      const textResult = classifySetBonusTextV1(bonus);
      if (textResult.classification !== 'empty') bonusTexts.set(bonusId, {
        bonusId,
        setId: bonus?.set_id || null,
        requiredPieces: bonus?.required_pieces ?? bonus?.requiredPieces ?? null,
        title: bonus?.title || '',
        ...textResult
      });
    }
  }

  for (const binding of registry?.payload.bindings || []) {
    if (!['equipment_variant', 'set_bonus'].includes(binding.source_kind)) continue;
    const sourceKey = `${binding.source_kind}:${binding.source_id}`;
    if (seenLines.has(`${sourceKey}:${binding.attribute_key}`)) continue;
    // A partial read cannot establish that an entire source was deleted.
    if (!completeCatalogue && !sourceReferences.has(sourceKey)) continue;
    const reference = sourceReferences.get(sourceKey);
    const rawKey = binding.source_snapshot?.label || binding.attribute_key;
    attributes.set(`missing:${binding.id}`, {
      rawKey, canonicalKey:binding.target, target:binding.target,
      classification:'unmapped', numeric:false, semantic:false,
      reason:'status_source_missing', registryRevision:registry.revision,
      bindingId:binding.id, occurrences:1,
      references:reference ? [{...reference,rawKey}] : []
    });
  }

  const attributeRows = [...attributes.values()].sort((a, b) =>
    a.classification.localeCompare(b.classification) || a.canonicalKey.localeCompare(b.canonicalKey)
  );
  const textRows = [...bonusTexts.values()];
  const numeric = attributeRows.filter(row => row.classification === 'numeric_mapping_known');
  const semanticOnly = attributeRows.filter(row => row.classification === 'semantic_only');
  const unmapped = attributeRows.filter(row => row.classification === 'unmapped');
  const unmappedText = textRows.filter(row => row.classification === 'unmapped_text');

  return {
    schemaVersion: 'echo-brain-equipment-coverage-v1',
    bundlesScanned: (bundles || []).filter(Boolean).length,
    uniqueAttributeMappings: attributeRows.length,
    numericMappings: numeric.length,
    semanticOnlyMappings: semanticOnly.length,
    unmappedMappings: unmapped.length,
    setBonusTexts: textRows.length,
    unmappedSetBonusTexts: unmappedText.length,
    complete: unmapped.length === 0 && unmappedText.length === 0,
    attributes: attributeRows,
    setBonusTextResults: textRows,
    blockers: [
      ...unmapped.map(row => ({ type: 'attribute', key: row.rawKey, canonicalKey: row.canonicalKey, reason:row.reason, bindingId:row.bindingId, references: row.references })),
      ...unmappedText.map(row => ({ type: 'set_bonus_text', key: row.bonusId, title: row.title, text: row.text }))
    ]
  };
}

export { SYNTHETIC_BASE as EQUIPMENT_COVERAGE_SYNTHETIC_BASE_V1 };
