const EXPLICIT_OPERATIONS = Object.freeze({
  increase_percent: 'percent',
  decrease_percent: 'percent',
  add_percent: 'percent',
  subtract_percent: 'percent',
  increase_flat: 'flat',
  decrease_flat: 'flat',
  add_flat: 'flat',
  subtract_flat: 'flat'
});

function text(value) {
  return String(value ?? '').trim();
}

function normalizedToken(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%°]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// This is deliberately conservative. It does not remove articles, infer a
// synonym or collapse contextual words. The importer extracts the numeric
// prefix first; this function only makes the remaining phrase comparable.
export function normalizeCalculationEffectLabel(value) {
  return normalizedToken(value);
}

export function recognizeCalculationOperation({ operator, unit, raw } = {}) {
  const explicit = normalizedToken(operator).replace(/\s+/g, '_');
  if (EXPLICIT_OPERATIONS[explicit]) return EXPLICIT_OPERATIONS[explicit];
  const unitText = text(unit).toLowerCase();
  return unitText.includes('%') || /%/.test(text(raw)) ? 'percent' : 'flat';
}

export function canonicalCalculationUnit({ unit, operation, raw } = {}) {
  const explicit = normalizedToken(unit);
  if (explicit === '%' || /^(percent|percentage|percentual|porcentagem)$/.test(explicit)) return 'percent';
  if (explicit === '°' || /^(degree|degrees|grau|graus)$/.test(explicit)) return 'degree';
  if (/^(s|sec|second|seconds|segundo|segundos)$/.test(explicit)) return 'second';
  if (/^(x|factor|fator|multiplier|multiplicador)$/.test(explicit)) return 'factor';
  if (/^(point|points|ponto|pontos|pt|pts)$/.test(explicit)) return 'point';
  if (!explicit && /%/.test(text(raw))) return 'percent';
  if (!explicit && /°/.test(text(raw))) return 'degree';
  if (!explicit) return operation === 'percent' ? 'percent' : 'implicit';
  return explicit.replace(/\s+/g, '_');
}

function arrayOf(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function definitionId(definition) {
  return text(definition?.id ?? definition);
}

function definitionState(definition) {
  return text(definition?.state || definition?.lifecycleState || definition?.lifecycle_state);
}

function definitionFormulaState(definition) {
  return text(definition?.formulaState || definition?.formula_state || definition?.policy?.state);
}

function definitionIsPublished(definition) {
  if (!definition || typeof definition !== 'object') return false;
  const state = definitionState(definition);
  const formula = definitionFormulaState(definition);
  return (state === 'published' || (!state && Boolean(definition.policy?.id)))
    && (formula === 'published' || (!formula && Boolean(definition.policy?.id)));
}

function aliasValue(alias, camel, snake) {
  return alias?.[camel] ?? alias?.[snake];
}

function normalizedAlias(alias) {
  return text(aliasValue(alias, 'normalizedAlias', 'normalized_alias'))
    || normalizeCalculationEffectLabel(aliasValue(alias, 'rawAlias', 'raw_alias'));
}

function aliasTarget(alias) {
  return text(aliasValue(alias, 'target', 'target_stat_id') || alias?.definitionId || alias?.definition_id);
}

function aliasContext(alias) {
  return text(aliasValue(alias, 'context', 'context_key')) || 'general';
}

function aliasState(alias) {
  return text(alias?.state || alias?.lifecycleState || alias?.lifecycle_state);
}

function allowedValues(alias, camel, snake) {
  return arrayOf(aliasValue(alias, camel, snake));
}

export function resolveCalculationAlias({
  description,
  operation,
  unit,
  raw,
  context = null
} = {}, { aliases = [], definitions = [] } = {}) {
  const normalized = normalizeCalculationEffectLabel(description);
  const observedUnit = canonicalCalculationUnit({ unit, operation, raw });
  if (!normalized) {
    return { target: null, context: null, aliasId: null, normalized, observedUnit, status: 'pending_alias' };
  }

  const labelCandidates = (Array.isArray(aliases) ? aliases : []).filter(alias => (
    aliasState(alias) === 'published'
    && normalizedAlias(alias) === normalized
  ));
  if (!labelCandidates.length) {
    return { target: null, context: null, aliasId: null, normalized, observedUnit, status: 'pending_alias' };
  }

  const candidates = context
    ? labelCandidates.filter(alias => aliasContext(alias) === context)
    : labelCandidates;
  if (!candidates.length) {
    const contexts = [...new Set(labelCandidates.map(aliasContext))];
    return {
      target: null,
      context,
      aliasId: null,
      normalized,
      observedUnit,
      availableContexts: contexts,
      status: 'context_mismatch'
    };
  }

  const semanticKeys = new Set(candidates.map(alias => `${aliasTarget(alias)}\u0000${aliasContext(alias)}`));
  if (semanticKeys.size !== 1) {
    return { target: null, context: null, aliasId: null, normalized, observedUnit, status: 'alias_collision' };
  }

  const alias = [...candidates].sort((left, right) => Number(right.version || 0) - Number(left.version || 0))[0];
  const target = aliasTarget(alias);
  const semanticContext = aliasContext(alias);
  const definition = (Array.isArray(definitions) ? definitions : [])
    .find(item => definitionId(item) === target);
  const common = {
    target: null,
    candidateTarget: target || null,
    context: semanticContext,
    aliasId: text(alias.id) || null,
    normalized,
    observedUnit,
    definitionVersion: Number(alias.definitionVersion || alias.definition_version || definition?.version || 0) || null
  };

  if (!definition || !definitionIsPublished(definition)) {
    return { ...common, status: 'formula_unpublished' };
  }

  const aliasOperations = allowedValues(alias, 'allowedOperations', 'allowed_operations');
  const definitionOperations = arrayOf(definition.allowedOperations || definition.allowed_operations);
  if (!operation
    || (aliasOperations.length && !aliasOperations.includes(operation))
    || (definitionOperations.length && !definitionOperations.includes(operation))) {
    return { ...common, status: 'operation_mismatch' };
  }

  const aliasUnits = allowedValues(alias, 'allowedUnits', 'allowed_units');
  const definitionUnits = arrayOf(definition.acceptedUnits || definition.accepted_units);
  if ((aliasUnits.length && !aliasUnits.includes(observedUnit))
    || (definitionUnits.length && !definitionUnits.includes(observedUnit))) {
    return { ...common, status: 'unit_mismatch' };
  }

  return { ...common, target, status: 'resolved' };
}

export function recognizeCalculationTarget(description, definitions = [], aliases = [], options = {}) {
  const operation = options.operation || recognizeCalculationOperation(options);
  return resolveCalculationAlias({
    description,
    operation,
    unit: options.unit,
    raw: options.raw,
    context: options.context
  }, { definitions, aliases }).target;
}

export function gameCaptureSource(evidence) {
  const digest = text(evidence?.digest);
  if (evidence?.kind !== 'game_capture' || !/^sha256:[a-f0-9]{64}$/i.test(digest)) return null;
  return {
    sourceKind: 'game_capture',
    sourceReference: `game-capture:${digest.toLowerCase()}`
  };
}

export function adminObservationSource(effectId) {
  const id = text(effectId).toLowerCase();
  return {
    sourceKind: 'admin_observation',
    sourceReference: `admin-entry:${id || 'pending'}`
  };
}

export function recognizeImportedCalculationEffect({
  description,
  operation: suppliedOperation,
  operator,
  unit,
  raw,
  definitions = [],
  aliases = [],
  context = null,
  evidence = null,
  effectId = ''
} = {}) {
  const operation = suppliedOperation || recognizeCalculationOperation({ operator, unit, raw });
  const resolution = resolveCalculationAlias({ description, operation, unit, raw, context }, { aliases, definitions });
  const source = gameCaptureSource(evidence) || adminObservationSource(effectId);
  const resolved = resolution.status === 'resolved' && Boolean(resolution.target);
  return {
    target: resolution.target,
    operation,
    unit: resolution.observedUnit,
    context: resolution.context,
    // Candidate metadata may be shown during review, but it cannot be stored
    // as an approved binding until unit, operation and formula all validate.
    aliasId: resolved ? resolution.aliasId : null,
    definitionVersion: resolved ? resolution.definitionVersion : null,
    candidateAliasId: resolved ? null : resolution.aliasId,
    candidateTarget: resolved ? null : resolution.candidateTarget,
    resolutionStatus: resolution.status,
    normalizedText: resolution.normalized,
    scope: 'self',
    condition: 'always',
    conditionExpected: null,
    evaluatedOn: 'source',
    ...source,
    recognized: Boolean(resolved && operation),
    method: resolution.status === 'resolved' ? 'exact_alias' : resolution.status
  };
}
