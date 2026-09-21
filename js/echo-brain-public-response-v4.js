export const PUBLIC_COMPOSITION_SCORE_SCHEMA_V4 = 'composition-semantic-context-v4';
export const PUBLIC_COMPOSITION_EQUIPMENT_SCHEMA_V1 = 'composition-equipment-context-v1';

const invalid = detail => ({ ok: false, error: 'invalid_score_response', detail, results: [] });

function canonical(ids = []) {
  return [...ids].map(String).sort().join('|');
}

function finiteInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function nullableScore(value) {
  return value === null || finiteInRange(value, 0, 100);
}

function validConfidence(confidence) {
  if (!confidence || typeof confidence !== 'object' || Array.isArray(confidence)) return false;
  return [
    'rules', 'verification', 'knowledgeFreshness', 'equipmentContext',
    'model', 'observedEvidence', 'overall'
  ].every(key => finiteInRange(confidence[key], 0, 1));
}

function validKnowledge(knowledge) {
  return Boolean(
    knowledge && typeof knowledge === 'object' && !Array.isArray(knowledge)
    && typeof knowledge.fresh === 'boolean'
    && typeof knowledge.unknown === 'boolean'
    && Number.isInteger(knowledge.pending) && knowledge.pending >= 0
    && typeof knowledge.equipmentContextAvailable === 'boolean'
    && typeof knowledge.seasonId === 'string' && knowledge.seasonId.length > 0
    && typeof knowledge.gameVersion === 'string' && knowledge.gameVersion.length > 0
    && Array.isArray(knowledge.heroes) && knowledge.heroes.length === 3
    && knowledge.heroes.every(row => row && typeof row.id === 'string'
      && Number.isInteger(row.version) && row.version > 0
      && typeof row.fingerprint === 'string' && /^(?:[0-9a-f]{32}|[0-9a-f]{64})$/i.test(row.fingerprint))
    && typeof knowledge.equipmentCatalogueFingerprint === 'string'
    && /^[0-9a-f]{64}$/i.test(knowledge.equipmentCatalogueFingerprint)
  );
}

function validEquipmentContext(context, adjustment) {
  return Boolean(
    context && typeof context === 'object' && !Array.isArray(context)
    && context.schemaVersion === PUBLIC_COMPOSITION_EQUIPMENT_SCHEMA_V1
    && typeof context.sourceAvailable === 'boolean'
    && typeof context.complete === 'boolean'
    && typeof context.applied === 'boolean'
    && finiteInRange(context.adjustment, -4, 4)
    && context.adjustment === adjustment
    && finiteInRange(context.confidence, 0, 1)
    && (context.supportAffinity === null || finiteInRange(context.supportAffinity, 0, 1))
  );
}

function validLearning(learning) {
  if (!learning || typeof learning !== 'object' || Array.isArray(learning)) return false;
  if (!finiteInRange(learning.influence, 0, .55) || !finiteInRange(learning.maxInfluence, 0, .55)) return false;
  const debt = learning.debt;
  return Boolean(
    debt && typeof debt === 'object' && !Array.isArray(debt)
    && typeof debt.fresh === 'boolean'
    && typeof debt.unknown === 'boolean'
    && Number.isInteger(debt.pending) && debt.pending >= 0
  );
}

function validResult(result, expected) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  if (result.requestId !== expected.requestId) return false;
  if (!Array.isArray(result.heroIds) || result.heroIds.length !== 3) return false;
  if (canonical(result.heroIds) !== canonical(expected.heroIds)) return false;
  if (result.key !== canonical(expected.heroIds)) return false;
  if (result.semanticSchema !== PUBLIC_COMPOSITION_SCORE_SCHEMA_V4) return false;
  if (result.equipmentContextSchema !== PUBLIC_COMPOSITION_EQUIPMENT_SCHEMA_V1) return false;
  if (!finiteInRange(result.finalScore, 0, 100) || !Number.isInteger(result.finalScore)) return false;
  for (const key of ['functionalSynergy', 'heroSkillSemanticSynergy', 'semanticSynergy', 'mechanicalDemand']) {
    if (!finiteInRange(result[key], 0, 100)) return false;
  }
  if (!finiteInRange(result.equipmentAdjustment, -4, 4)) return false;
  if (!nullableScore(result.observedPerformance)) return false;
  if (!finiteInRange(result.influence, 0, .55)) return false;
  if (!validConfidence(result.confidence) || !validKnowledge(result.knowledge)) return false;
  if (canonical(result.knowledge.heroes.map(row => row.id)) !== canonical(result.heroIds)) return false;
  if (!Array.isArray(result.heroDisplay) || result.heroDisplay.length !== 3
      || canonical(result.heroDisplay.map(row => row?.id)) !== canonical(result.heroIds)
      || result.heroDisplay.some(row => typeof row?.name !== 'string' || !row.name.trim())) return false;
  if (!validEquipmentContext(result.equipmentContext, result.equipmentAdjustment)) return false;
  if (!Array.isArray(result.strengths) || !Array.isArray(result.risks)) return false;
  if (result.model !== null) {
    if (!result.model || typeof result.model !== 'object' || Array.isArray(result.model)) return false;
    if (!String(result.model.id || '') || !Number.isFinite(Number(result.model.version))) return false;
    if (result.model.schema !== PUBLIC_COMPOSITION_SCORE_SCHEMA_V4) return false;
  }
  return true;
}

export function validateCompositionScoreResponseV4(value, teams = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.ok !== true) return invalid('response_not_ok');
  if (value.authority !== 'server' || value.fallback !== 'none' || value.localInfluence !== 0) return invalid('authority_contract_invalid');
  if (value.mode !== 'score') return invalid('response_mode_invalid');
  if (value.schemaVersion !== PUBLIC_COMPOSITION_SCORE_SCHEMA_V4) return invalid('semantic_schema_mismatch');
  if (value.equipmentContextSchemaVersion !== PUBLIC_COMPOSITION_EQUIPMENT_SCHEMA_V1) return invalid('equipment_schema_mismatch');
  if (!validLearning(value.learning)) return invalid('learning_contract_invalid');
  if (!Array.isArray(value.results) || value.results.length !== teams.length) return invalid('result_cardinality_mismatch');

  const expected = new Map(teams.map(team => [String(team.requestId), {
    requestId: String(team.requestId),
    heroIds: (team.heroIds || []).map(String)
  }]));
  if (expected.size !== teams.length) return invalid('duplicate_expected_request_id');
  const received = new Set();
  for (const result of value.results) {
    const requestId = String(result?.requestId ?? '');
    const team = expected.get(requestId);
    if (!team || received.has(requestId) || !validResult(result, team)) return invalid('result_contract_invalid');
    received.add(requestId);
  }
  if (received.size !== expected.size) return invalid('result_identity_mismatch');
  return value;
}

export function validateCompositionRecommendationResponseV4(value, selectionHeroIds = [], limit = 4) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.ok !== true) return invalid('response_not_ok');
  if (value.authority !== 'server' || value.fallback !== 'none' || value.localInfluence !== 0) return invalid('authority_contract_invalid');
  if (value.mode !== 'recommendations') return invalid('response_mode_invalid');
  if (value.schemaVersion !== PUBLIC_COMPOSITION_SCORE_SCHEMA_V4) return invalid('semantic_schema_mismatch');
  if (value.equipmentContextSchemaVersion !== PUBLIC_COMPOSITION_EQUIPMENT_SCHEMA_V1) return invalid('equipment_schema_mismatch');
  if (!validLearning(value.learning)) return invalid('learning_contract_invalid');
  if (!Array.isArray(value.selectionHeroIds)
      || canonical(value.selectionHeroIds) !== canonical(selectionHeroIds)
      || value.selectionHeroIds.length !== selectionHeroIds.length) return invalid('selection_identity_mismatch');
  if (!Array.isArray(value.results) || value.results.length < 1 || value.results.length > limit) return invalid('result_cardinality_mismatch');

  const selected = new Set(selectionHeroIds.map(String));
  const receivedKeys = new Set();
  for (const result of value.results) {
    const expected = { requestId: String(result?.requestId ?? ''), heroIds: result?.heroIds || [] };
    if (!expected.requestId || !validResult(result, expected) || receivedKeys.has(result.key)) return invalid('result_contract_invalid');
    if (![...selected].every(id => result.heroIds.includes(id)) && selected.size < 3) return invalid('selection_not_preserved');
    if (selected.size === 3 && result.heroIds.filter(id => selected.has(id)).length !== 2) return invalid('counterfactual_scope_invalid');
    receivedKeys.add(result.key);
  }
  for (let index = 1; index < value.results.length; index += 1) {
    const previous = value.results[index - 1];
    const current = value.results[index];
    if (previous.finalScore < current.finalScore) return invalid('server_rank_invalid');
    if (previous.finalScore === current.finalScore && previous.key.localeCompare(current.key) > 0) return invalid('server_rank_invalid');
  }
  return value;
}
