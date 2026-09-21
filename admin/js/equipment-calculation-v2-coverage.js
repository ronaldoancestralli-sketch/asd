import {
  canonicalCalculationUnit,
  normalizeCalculationEffectLabel,
  resolveCalculationAlias
} from './equipment-calculation-v2-recognition.js?v=20260920-resolution-authority-1';
import {
  equipmentAttributeOperation,
  parseEquipmentAttributeMagnitude
} from '../../js/equipment-attribute-calculation.js?v=2';

export const CALCULATION_RESOLUTION_STATUSES = Object.freeze([
  'resolved',
  'pending_alias',
  'alias_collision',
  'formula_unpublished',
  'unit_mismatch',
  'operation_mismatch',
  'context_mismatch',
  'invalid_value',
  'incomplete_source'
]);

const VALUE_PREFIX = /^\s*(?:[•·*›»]\s*)?[+−–-]?\s*\d+(?:[.,]\d+)?\s*(?:%|°|x\b|s\b|m\b)?\s*/i;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return String(value ?? '').trim();
}

function unwrapWorkspace(value) {
  let current = value;
  if (typeof current === 'string') {
    try {
      current = JSON.parse(current);
    } catch {
      return {};
    }
  }
  if (Array.isArray(current) && current.length === 1 && isRecord(current[0])) {
    return current[0];
  }
  return isRecord(current) ? current : {};
}

function normalizedEvidenceText(value = '') {
  return normalizeCalculationEffectLabel(text(value).replace(VALUE_PREFIX, ''));
}

export function normalizeCalculationEffectText(value = '') {
  return normalizedEvidenceText(value);
}

function publicationStatus(workspace, revision) {
  const publicationId = workspace.published?.id ?? null;
  const publishedRevision = Number(workspace.published?.workspaceRevision);
  const fingerprint = text(workspace.published?.fingerprint);
  if (publicationId !== null && Number.isSafeInteger(publishedRevision) && fingerprint) {
    return publishedRevision === revision ? 'published' : 'stale_publication';
  }
  return 'draft';
}

function normalizeEffect(effect = {}) {
  const target = text(effect.target || effect.target_stat_id) || null;
  const resolutionStatus = text(effect.resolutionStatus || effect.resolution_status)
    || (target && text(effect.resolvedAliasId || effect.resolved_alias_id) ? 'resolved' : 'pending_alias');
  return {
    ...effect,
    id: text(effect.id),
    kind: text(effect.kind),
    description: text(effect.description),
    originalText: text(effect.originalText || effect.original_text || effect.description),
    normalizedText: text(effect.normalizedText || effect.normalized_text)
      || normalizeCalculationEffectLabel(effect.description),
    target,
    operation: text(effect.operation) || null,
    observedUnit: text(effect.observedUnit || effect.observed_unit) || null,
    semanticContext: text(effect.semanticContext || effect.semantic_context) || null,
    resolvedAliasId: text(effect.resolvedAliasId || effect.resolved_alias_id) || null,
    definitionVersion: Number(effect.definitionVersion || effect.definition_version || 0) || null,
    resolutionStatus,
    rarityEvidence: isRecord(effect.rarityEvidence || effect.rarity_evidence)
      ? { ...(effect.rarityEvidence || effect.rarity_evidence) }
      : {},
    values: isRecord(effect.values) ? { ...effect.values } : {}
  };
}

function catalogCompatibility(workspace) {
  const fields = ['definitions', 'aliases', 'contexts', 'operations'];
  const missing = fields.filter(field => !Array.isArray(workspace[field]));
  if (missing.length) {
    return {
      compatible: false,
      status: 'catalog_incompatible',
      message: 'Catálogo semântico indisponível ou incompatível neste ambiente',
      missing
    };
  }
  if (!workspace.definitions.length || !workspace.operations.length) {
    return {
      compatible: false,
      status: 'catalog_incompatible',
      message: 'Catálogo semântico indisponível ou incompatível neste ambiente',
      missing: ['published_catalog']
    };
  }
  return { compatible: true, status: 'ready', message: '', missing: [] };
}

// Despite its historical name, this now describes three independent layers:
// semantic catalog coverage, the current workspace and the active publication.
export function publishedCalculationCoverage(payload = null, { source = 'backend' } = {}) {
  const workspace = unwrapWorkspace(payload);
  const revisionValue = Number(workspace.revision);
  const revision = Number.isSafeInteger(revisionValue) ? revisionValue : 0;
  const compatibility = catalogCompatibility(workspace);
  const status = publicationStatus(workspace, revision);
  const effects = (Array.isArray(workspace.effects) ? workspace.effects : [])
    .filter(effect => effect?.kind === 'numeric')
    .map(normalizeEffect);

  return {
    contract: text(workspace.contract),
    source,
    compatible: compatibility.compatible,
    infrastructureStatus: compatibility.status,
    infrastructureMessage: compatibility.message,
    missingCatalogFields: compatibility.missing,
    revision,
    workspaceStatus: text(workspace.state) || (effects.length ? 'draft' : 'empty'),
    publicationStatus: status,
    published: status === 'published',
    stalePublication: status === 'stale_publication',
    publicationId: workspace.published?.id ?? null,
    publishedRevision: Number.isSafeInteger(Number(workspace.published?.workspaceRevision))
      ? Number(workspace.published.workspaceRevision)
      : null,
    fingerprint: text(workspace.published?.fingerprint) || null,
    definitions: Array.isArray(workspace.definitions) ? workspace.definitions : [],
    aliases: Array.isArray(workspace.aliases) ? workspace.aliases : [],
    contexts: Array.isArray(workspace.contexts) ? workspace.contexts : [],
    operations: Array.isArray(workspace.operations) ? workspace.operations : [],
    effects
  };
}

function sameNumber(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * scale * 8;
}

function operationFromAttribute(attribute) {
  const operator = equipmentAttributeOperation(attribute?.operator);
  if (!operator) return null;
  return {
    id: operator.percent ? 'percent' : 'flat',
    sign: operator.sign
  };
}

function evidenceLabels(effect, raritySlug) {
  const evidence = isRecord(effect.rarityEvidence?.[raritySlug])
    ? effect.rarityEvidence[raritySlug]
    : {};
  return new Set([
    effect.description,
    effect.originalText,
    effect.normalizedText,
    evidence.originalText,
    evidence.original_text
  ].map(normalizedEvidenceText).filter(Boolean));
}

function effectMatchesAttribute(effect, {
  normalizedDescription,
  operation,
  raritySlug,
  signedValue
}) {
  return effect.operation === operation
    && sameNumber(effect.values?.[raritySlug], signedValue)
    && evidenceLabels(effect, raritySlug).has(normalizedDescription);
}

export function semanticEffectSignature({
  target = null,
  normalizedText = '',
  context = null,
  observedUnit = null,
  operation = null
} = {}) {
  return [
    text(target) || normalizeCalculationEffectLabel(normalizedText) || 'unknown',
    text(context) || 'general',
    text(observedUnit) || 'implicit',
    text(operation) || 'unknown'
  ].join('\u0000');
}

function resultFromEffect(effect, coverage, details) {
  let resolutionStatus = CALCULATION_RESOLUTION_STATUSES.includes(effect.resolutionStatus)
    ? effect.resolutionStatus
    : effect.target ? 'resolved' : 'pending_alias';
  const alias = coverage.aliases.find(item => text(item.id) === effect.resolvedAliasId);
  const definition = coverage.definitions.find(item => (
    text(item.id) === effect.target
    && Number(item.version || 0) === Number(effect.definitionVersion || 0)
  ));
  if (resolutionStatus === 'resolved') {
    if (!effect.target || !effect.resolvedAliasId || !effect.definitionVersion
      || !alias || text(alias.state) !== 'published') {
      resolutionStatus = 'pending_alias';
    } else if (!definition || text(definition.state) !== 'published'
      || text(definition.formulaState || definition.formula_state || definition.policy?.state) !== 'published') {
      resolutionStatus = 'formula_unpublished';
    } else if (text(alias.target || alias.target_stat_id) !== effect.target
      || text(alias.context || alias.context_key || 'general') !== text(effect.semanticContext || 'general')) {
      resolutionStatus = 'context_mismatch';
    } else if ((Array.isArray(alias.allowedOperations || alias.allowed_operations)
        && !(alias.allowedOperations || alias.allowed_operations).includes(details.operation))
      || (Array.isArray(definition.allowedOperations || definition.allowed_operations)
        && !(definition.allowedOperations || definition.allowed_operations).includes(details.operation))) {
      resolutionStatus = 'operation_mismatch';
    } else if ((Array.isArray(alias.allowedUnits || alias.allowed_units)
        && !(alias.allowedUnits || alias.allowed_units).includes(effect.observedUnit || details.observedUnit))
      || (Array.isArray(definition.acceptedUnits || definition.accepted_units)
        && !(definition.acceptedUnits || definition.accepted_units).includes(effect.observedUnit || details.observedUnit))) {
      resolutionStatus = 'unit_mismatch';
    }
  }
  const resolved = resolutionStatus === 'resolved';
  const status = resolved ? 'resolved' : resolutionStatus;
  return {
    status,
    resolutionStatus: status,
    contentIssue: status !== 'resolved',
    infrastructureIssue: false,
    source: `calculation_v2_${coverage.source}_workspace`,
    publicationStatus: coverage.publicationStatus,
    publicationId: coverage.publicationId,
    workspaceRevision: coverage.revision,
    publishedRevision: coverage.publishedRevision,
    effect,
    target: resolved ? effect.target : null,
    candidateTarget: resolved ? null : effect.target,
    context: effect.semanticContext,
    observedUnit: effect.observedUnit || details.observedUnit,
    operation: details.operation,
    aliasId: effect.resolvedAliasId,
    definitionVersion: effect.definitionVersion,
    normalizedText: details.normalizedDescription,
    raritySlug: details.raritySlug,
    value: details.signedValue,
    signature: semanticEffectSignature({
      target: resolved ? effect.target : null,
      normalizedText: effect.normalizedText || details.normalizedDescription,
      context: effect.semanticContext,
      observedUnit: effect.observedUnit || details.observedUnit,
      operation: details.operation
    })
  };
}

export function matchCalculationAttribute(attribute = {}, {
  coverage,
  raritySlug,
  context = null
} = {}) {
  const normalizedDescription = normalizeCalculationEffectText(attribute.label);
  const slug = text(raritySlug).toLowerCase();
  if (!coverage?.compatible) {
    return {
      status: 'catalog_incompatible',
      resolutionStatus: 'catalog_incompatible',
      contentIssue: false,
      infrastructureIssue: true,
      message: coverage?.infrastructureMessage
        || 'Catálogo semântico indisponível ou incompatível neste ambiente',
      signature: 'infrastructure\u0000catalog_incompatible'
    };
  }

  if (attribute.textReview) {
    return {
      status: 'incomplete_source',
      resolutionStatus: 'incomplete_source',
      contentIssue: true,
      infrastructureIssue: false,
      normalizedText: normalizedDescription,
      signature: semanticEffectSignature({ normalizedText: normalizedDescription })
    };
  }

  const operation = operationFromAttribute(attribute);
  if (!operation) {
    return {
      status: 'operation_mismatch',
      resolutionStatus: 'operation_mismatch',
      contentIssue: true,
      infrastructureIssue: false,
      normalizedText: normalizedDescription,
      signature: semanticEffectSignature({ normalizedText: normalizedDescription })
    };
  }

  const magnitude = parseEquipmentAttributeMagnitude(attribute.value);
  if (magnitude === null) {
    return {
      status: 'invalid_value',
      resolutionStatus: 'invalid_value',
      contentIssue: true,
      infrastructureIssue: false,
      normalizedText: normalizedDescription,
      operation: operation.id,
      signature: semanticEffectSignature({
        normalizedText: normalizedDescription,
        operation: operation.id
      })
    };
  }

  const signedValue = operation.sign * magnitude;
  const observedUnit = canonicalCalculationUnit({
    unit: attribute.unit,
    operation: operation.id,
    raw: attribute.raw
  });
  const details = {
    normalizedDescription,
    operation: operation.id,
    observedUnit,
    raritySlug: slug,
    signedValue
  };

  if (slug) {
    const matches = coverage.effects.filter(effect => effectMatchesAttribute(effect, details));
    if (matches.length === 1) return resultFromEffect(matches[0], coverage, details);
    if (matches.length > 1) {
      return {
        status: 'alias_collision',
        resolutionStatus: 'alias_collision',
        contentIssue: true,
        infrastructureIssue: false,
        publicationStatus: coverage.publicationStatus,
        workspaceRevision: coverage.revision,
        normalizedText: normalizedDescription,
        observedUnit,
        operation: operation.id,
        signature: semanticEffectSignature({
          normalizedText: normalizedDescription,
          context,
          observedUnit,
          operation: operation.id
        })
      };
    }
  }

  const resolution = resolveCalculationAlias({
    description: attribute.label,
    operation: operation.id,
    unit: attribute.unit,
    raw: attribute.raw,
    context
  }, {
    definitions: coverage.definitions,
    aliases: coverage.aliases
  });
  const resolved = resolution.status === 'resolved' && Boolean(resolution.target);
  return {
    ...resolution,
    resolutionStatus: resolution.status,
    contentIssue: !resolved,
    infrastructureIssue: false,
    source: 'calculation_v2_semantic_catalog',
    publicationStatus: coverage.publicationStatus,
    publicationId: coverage.publicationId,
    workspaceRevision: coverage.revision,
    publishedRevision: coverage.publishedRevision,
    operation: operation.id,
    normalizedText: resolution.normalized,
    raritySlug: slug || null,
    value: signedValue,
    signature: semanticEffectSignature({
      target: resolved ? resolution.target : null,
      normalizedText: resolution.normalized,
      context: resolution.context || context,
      observedUnit: resolution.observedUnit || observedUnit,
      operation: operation.id
    })
  };
}

export function matchPublishedCalculationAttribute(attribute = {}, options = {}) {
  const result = matchCalculationAttribute(attribute, options);
  if (result.status !== 'resolved' || result.publicationStatus !== 'published') return null;
  return result;
}

export function groupCalculationResolutionOccurrences(occurrences = []) {
  const groups = new Map();
  for (const occurrence of occurrences) {
    const match = occurrence?.match || occurrence;
    const signature = text(match?.signature) || semanticEffectSignature(match);
    if (!groups.has(signature)) {
      groups.set(signature, {
        signature,
        status: match?.status || 'pending_alias',
        target: match?.target || match?.candidateTarget || null,
        context: match?.context || null,
        observedUnit: match?.observedUnit || null,
        operation: match?.operation || null,
        occurrences: [],
        rarities: new Set()
      });
    }
    const group = groups.get(signature);
    group.occurrences.push(occurrence);
    const rarity = text(occurrence?.raritySlug || match?.raritySlug);
    if (rarity) group.rarities.add(rarity);
  }
  return [...groups.values()].map(group => ({
    ...group,
    occurrenceCount: group.occurrences.length,
    rarityCount: group.rarities.size,
    rarities: [...group.rarities]
  }));
}
