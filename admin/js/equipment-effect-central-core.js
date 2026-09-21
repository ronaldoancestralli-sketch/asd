import {
  DEFAULT_EQUIPMENT_EFFECT_REGISTRY_V1,
  EQUIPMENT_EFFECT_CONTRACT_VERSION,
  EQUIPMENT_EFFECT_NUMERIC_AUTHORITY,
  EQUIPMENT_EFFECT_OPERATIONS,
  EQUIPMENT_EFFECT_SUPPORT_STATUSES,
  EQUIPMENT_EFFECT_UNITS,
  validateEquipmentEffectDocumentV1
} from '../../contracts/equipment-effect-contract-v1.js';

export const EQUIPMENT_EFFECT_CENTRAL_REVISION = 'phase2c1-collection-only';

/**
 * Operadores apresentados no editor. O sinal pertence ao bônus inteiro; os
 * campos de raridade recebem apenas a magnitude positiva. Assim, "+%" e "-%"
 * não precisam ser digitados e reinterpretados em cada célula.
 */
export const EFFECT_OPERATOR_OPTIONS = Object.freeze([
  Object.freeze({ id: 'increase_flat', symbol: '+', label: 'Somar', operation: 'add', direction: 1 }),
  Object.freeze({ id: 'decrease_flat', symbol: '−', label: 'Reduzir', operation: 'add', direction: -1 }),
  Object.freeze({ id: 'increase_percent', symbol: '+%', label: 'Aumentar em %', operation: 'relative_percent', direction: 1 }),
  Object.freeze({ id: 'decrease_percent', symbol: '−%', label: 'Reduzir em %', operation: 'relative_percent', direction: -1 })
]);

const EFFECT_OPERATORS_BY_ID = new Map(EFFECT_OPERATOR_OPTIONS.map(option => [option.id, option]));

export const EFFECT_TARGET_OPTIONS = Object.freeze(
  Object.keys(DEFAULT_EQUIPMENT_EFFECT_REGISTRY_V1.capabilities)
    .sort((left, right) => left.localeCompare(right, 'pt-BR'))
);

export const EFFECT_OPERATION_OPTIONS = EQUIPMENT_EFFECT_OPERATIONS;
export const EFFECT_UNIT_OPTIONS = EQUIPMENT_EFFECT_UNITS;
export const EFFECT_SUPPORT_OPTIONS = EQUIPMENT_EFFECT_SUPPORT_STATUSES;

function capabilityForTarget(target) {
  return DEFAULT_EQUIPMENT_EFFECT_REGISTRY_V1.capabilities[String(target || '').trim()] || null;
}

function absoluteSemanticsForTarget(target) {
  const capability = capabilityForTarget(target);
  if (!capability) return { operation: 'add', unit: null };
  if (Array.isArray(capability.operations.add) && capability.operations.add.length) {
    return { operation: 'add', unit: capability.operations.add[0] };
  }
  if (Array.isArray(capability.operations.percentage_points) &&
      capability.operations.percentage_points.length) {
    return { operation: 'percentage_points', unit: capability.operations.percentage_points[0] };
  }
  return { operation: 'add', unit: null };
}

export function operatorFromStoredEffect(effect = {}) {
  const value = Number(effect.value);
  const direction = Number.isFinite(value) && value < 0 ? -1 : 1;
  if (effect.operation === 'relative_percent') {
    return direction < 0 ? 'decrease_percent' : 'increase_percent';
  }
  if (effect.operation === 'add' || effect.operation === 'percentage_points') {
    return direction < 0 ? 'decrease_flat' : 'increase_flat';
  }
  return null;
}

export function effectSemanticsFromOperator({ target, operator, magnitude }) {
  const option = EFFECT_OPERATORS_BY_ID.get(String(operator || ''));
  if (!option) throw new TypeError('Escolha como o bônus será aplicado.');

  const parsedMagnitude = parseLocalizedEffectNumber(magnitude);
  if (parsedMagnitude < 0) {
    throw new TypeError('Informe somente a magnitude; o sinal já foi escolhido acima.');
  }

  if (option.operation === 'relative_percent') {
    const capability = capabilityForTarget(target);
    if (capability && !capability.operations.relative_percent?.includes('percent')) {
      throw new TypeError('Este atributo não aceita cálculo percentual no registro atual.');
    }
    return {
      operation: 'relative_percent',
      unit: 'percent',
      value: option.direction * parsedMagnitude
    };
  }

  const semantics = absoluteSemanticsForTarget(target);
  return {
    operation: semantics.operation,
    unit: semantics.unit,
    value: option.direction * parsedMagnitude
  };
}

export function operatorFormula(operator) {
  return {
    increase_flat: 'resultado = base + bônus',
    decrease_flat: 'resultado = base − bônus',
    increase_percent: 'resultado = base × (1 + bônus ÷ 100)',
    decrease_percent: 'resultado = base × (1 − bônus ÷ 100)'
  }[operator] || 'Escolha um operador para definir o cálculo.';
}

export function previewEffectCalculation({ base, magnitude, operator }) {
  const parsedBase = parseLocalizedEffectNumber(base);
  const option = EFFECT_OPERATORS_BY_ID.get(String(operator || ''));
  if (!option) throw new TypeError('Escolha como o bônus será aplicado.');
  const parsedMagnitude = parseLocalizedEffectNumber(magnitude);
  if (parsedMagnitude < 0) {
    throw new TypeError('A magnitude da prévia não pode ser negativa.');
  }
  const result = option.operation === 'relative_percent'
    ? parsedBase * (1 + (option.direction * parsedMagnitude) / 100)
    : parsedBase + option.direction * parsedMagnitude;
  return { base: parsedBase, magnitude: parsedMagnitude, operator: option.id, result };
}

export const EFFECT_VERIFICATION_OPTIONS = Object.freeze([
  'unverified',
  'partially_confirmed',
  'confirmed',
  'disputed'
]);

export const EFFECT_SOURCE_KIND_OPTIONS = Object.freeze([
  'official',
  'game_screenshot',
  'catalog',
  'historical_audit',
  'admin_entry',
  'migration',
  'unknown'
]);

export const EFFECT_CONDITION_OPTIONS = Object.freeze([
  'always',
  'ability_active',
  'after_event',
  'mode_active',
  'state_active',
  'unknown',
  'unsupported'
]);

export const EFFECT_DURATION_OPTIONS = Object.freeze([
  'not_applicable',
  'while_condition',
  'known',
  'unknown'
]);

export const EFFECT_STACKING_OPTIONS = Object.freeze([
  'independent',
  'additive',
  'multiplicative',
  'highest',
  'lowest',
  'replace',
  'unknown'
]);

export const EFFECT_TIER_OPTIONS = Object.freeze([
  'not_applicable',
  'incremental',
  'cumulative_total',
  'unknown'
]);

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function textOrNull(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function requireIdentifier(value, field) {
  const normalized = textOrNull(value);
  if (!normalized || !IDENTIFIER_PATTERN.test(normalized)) {
    const error = new Error(`${field} precisa ter um identificador estável.`);
    error.code = 'invalid_effect_identifier';
    error.field = field;
    throw error;
  }
  return normalized;
}

export function parseLocalizedEffectNumber(value) {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    throw new TypeError('O valor do efeito precisa ser finito.');
  }

  const raw = String(value ?? '').trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(raw)) {
    throw new TypeError('Use somente um número, com vírgula ou ponto decimal.');
  }

  const parsed = Number(raw.replace(',', '.'));
  if (!Number.isFinite(parsed)) {
    throw new TypeError('O valor do efeito precisa ser finito.');
  }
  return parsed;
}

export function parseEffectIdList(value) {
  const ids = String(value ?? '')
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

function conditionFromInput(input) {
  const kind = textOrNull(input.conditionKind) || 'always';
  const reference = textOrNull(input.conditionReference);
  return {
    kind,
    ability_id: kind === 'ability_active' ? reference : null,
    event_id: kind === 'after_event' ? reference : null,
    mode_id: kind === 'mode_active' ? reference : null,
    state_id: kind === 'state_active' ? reference : null,
    raw_text: textOrNull(input.conditionText)
  };
}

function durationFromInput(input) {
  const kind = textOrNull(input.durationKind) || 'not_applicable';
  const hasValue = String(input.durationValue ?? '').trim() !== '';
  return {
    kind,
    value: hasValue ? parseLocalizedEffectNumber(input.durationValue) : null,
    unit: textOrNull(input.durationUnit),
    raw_text: textOrNull(input.durationText)
  };
}

function scopeFromInput(input) {
  const heroIds = parseEffectIdList(input.heroIds);
  const classIds = parseEffectIdList(input.classIds);
  const abilityIds = parseEffectIdList(input.abilityIds);
  const modeIds = parseEffectIdList(input.modeIds);
  const restricted = [heroIds, classIds, abilityIds, modeIds].some(list => list.length);
  return {
    kind: restricted ? 'restricted' : 'global',
    hero_ids: heroIds,
    class_ids: classIds,
    ability_ids: abilityIds,
    mode_ids: modeIds
  };
}

export function buildEquipmentVariantEffect(input, context) {
  const equipmentId = requireIdentifier(context.equipmentId, 'equipmentId');
  const variantId = requireIdentifier(context.variantId, 'variantId');
  const effectId = requireIdentifier(input.effectId, 'effectId');
  const sourceReference = textOrNull(input.sourceReference);
  const operation = textOrNull(input.operation);
  const unit = textOrNull(input.unit);
  const supportStatus = textOrNull(input.supportStatus) || 'pending';
  const rawValue = String(input.value ?? '').trim();

  return {
    effect_id: effectId,
    effect_revision: Number.isInteger(Number(input.effectRevision)) && Number(input.effectRevision) > 0
      ? Number(input.effectRevision)
      : 1,
    origin: {
      kind: 'equipment_variant',
      id: `equipment-variant:${variantId}`,
      equipment_id: equipmentId,
      variant_id: variantId,
      set_id: null,
      required_pieces: null
    },
    target: textOrNull(input.target),
    operation,
    value: supportStatus === 'pending' && rawValue === ''
      ? null
      : parseLocalizedEffectNumber(input.value),
    unit,
    condition: conditionFromInput(input),
    duration: durationFromInput(input),
    scope: scopeFromInput(input),
    stacking: {
      group: textOrNull(input.stackingGroup) || `equipment:${equipmentId}:${effectId}`,
      rule: textOrNull(input.stackingRule) || 'unknown',
      tier_semantics: textOrNull(input.tierSemantics) || 'unknown',
      max_stacks: String(input.maxStacks ?? '').trim() === '' ? null : Number(input.maxStacks)
    },
    provenance: {
      verification_status: textOrNull(input.verificationStatus) || 'unverified',
      verified_at: textOrNull(input.verifiedAt),
      sources: [{
        kind: textOrNull(input.sourceKind) || 'unknown',
        reference: sourceReference,
        observed_at: textOrNull(input.observedAt),
        game_revision: textOrNull(input.gameRevision)
      }]
    },
    original_text: textOrNull(input.originalText),
    support: {
      status: supportStatus,
      reason_code: supportStatus === 'pending'
        ? textOrNull(input.supportReason) || 'awaiting_review'
        : null,
      details: textOrNull(input.supportDetails)
    }
  };
}

export function buildEquipmentVariantEffectDocument(input) {
  const equipmentId = requireIdentifier(input.equipmentId, 'equipmentId');
  const variantId = requireIdentifier(input.variantId, 'variantId');
  const effects = (input.effects || []).map(effect =>
    buildEquipmentVariantEffect(effect, { equipmentId, variantId })
  );

  return {
    contract_version: EQUIPMENT_EFFECT_CONTRACT_VERSION,
    document_id: textOrNull(input.documentId) || `equipment-variant:${variantId}`,
    registry_revision: textOrNull(input.registryRevision) || DEFAULT_EQUIPMENT_EFFECT_REGISTRY_V1.revision,
    data_revision: textOrNull(input.dataRevision) || `draft:${variantId}`,
    ruleset_revision: textOrNull(input.rulesetRevision) || EQUIPMENT_EFFECT_CENTRAL_REVISION,
    subject: {
      kind: 'equipment_variant',
      id: variantId
    },
    expected_effect_count: Number.isInteger(Number(input.expectedEffectCount))
      ? Number(input.expectedEffectCount)
      : effects.length,
    effects
  };
}

export function buildPersistentEvidence(input) {
  return {
    source_kind: textOrNull(input.sourceKind) || 'unknown',
    source_reference: textOrNull(input.sourceReference),
    source_uri: textOrNull(input.sourceUri),
    file_sha256: textOrNull(input.fileSha256)?.toLowerCase() || null,
    observed_at: textOrNull(input.observedAt),
    game_revision: textOrNull(input.gameRevision),
    excerpt: textOrNull(input.excerpt),
    metadata: input.metadata && typeof input.metadata === 'object' ? structuredClone(input.metadata) : {}
  };
}

export function inspectPersistentEvidence(input) {
  const evidence = buildPersistentEvidence(input || {});
  const issues = [];
  if (!evidence.source_reference) issues.push('source_reference_required');
  if (!evidence.file_sha256 || !SHA256_PATTERN.test(evidence.file_sha256)) {
    issues.push('evidence_sha256_required');
  }
  return { valid: issues.length === 0, evidence, issues };
}

export function validateCentralEffectDraft(document) {
  const validation = validateEquipmentEffectDocumentV1(document);
  return {
    ...validation,
    numeric_authority: EQUIPMENT_EFFECT_NUMERIC_AUTHORITY
  };
}

export function centralWorkflowLabel(status) {
  return ({
    draft: 'Rascunho',
    in_review: 'Em revisão',
    reviewed: 'Revisão aprovada — ainda não publicado',
    changes_requested: 'Ajustes solicitados'
  })[status] || 'Sem rascunho';
}
