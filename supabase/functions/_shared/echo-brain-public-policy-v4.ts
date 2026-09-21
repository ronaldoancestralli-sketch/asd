export const PUBLIC_SCORING_LIMITS = Object.freeze({
  maxBodyBytes: 32 * 1024,
  maxTeams: 24,
  heroesPerTeam: 3,
  maxHeroIdLength: 36,
  maxRequestIdLength: 80,
  maxRecommendationHeroes: 24,
  maxRecommendations: 4
});

export const PUBLIC_HERO_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function clampPolicy(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function finitePolicyNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function canonicalPolicyTeam(ids: string[]) {
  return [...ids].map(String).sort().join('|');
}

export function validHeroUuid(value: unknown) {
  return typeof value === 'string' && value.length <= PUBLIC_SCORING_LIMITS.maxHeroIdLength && PUBLIC_HERO_UUID_RE.test(value.trim());
}

function normalizeTeam(row: any, index: number) {
  const rawIds = Array.isArray(row?.heroIds) ? row.heroIds : null;
  if (!rawIds || rawIds.length !== PUBLIC_SCORING_LIMITS.heroesPerTeam) {
    return { ok: false as const, error: 'each_team_requires_three_unique_uuid_heroes' };
  }
  if (!rawIds.every(validHeroUuid)) {
    return { ok: false as const, error: 'each_team_requires_three_unique_uuid_heroes' };
  }
  const heroIds = rawIds.map((value: string) => value.trim());
  if (new Set(heroIds).size !== PUBLIC_SCORING_LIMITS.heroesPerTeam) {
    return { ok: false as const, error: 'each_team_requires_three_unique_uuid_heroes' };
  }
  const rawRequestId = row?.requestId ?? index;
  const requestId = String(rawRequestId).trim();
  if (!requestId || requestId.length > PUBLIC_SCORING_LIMITS.maxRequestIdLength) {
    return { ok: false as const, error: 'invalid_request_id' };
  }
  return { ok: true as const, value: { requestId, heroIds } };
}

export function normalizePublicScoringPayload(body: any) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false as const, error: 'invalid_payload' };
  }
  if (!Array.isArray(body.teams) || body.teams.length === 0) {
    return { ok: false as const, error: 'teams_required' };
  }
  if (body.teams.length > PUBLIC_SCORING_LIMITS.maxTeams) {
    return { ok: false as const, error: 'too_many_teams' };
  }

  const teams = [] as Array<{ requestId: string; heroIds: string[] }>;
  const requestIds = new Set<string>();
  for (let index = 0; index < body.teams.length; index += 1) {
    const normalized = normalizeTeam(body.teams[index], index);
    if (!normalized.ok) return normalized;
    if (requestIds.has(normalized.value.requestId)) {
      return { ok: false as const, error: 'duplicate_request_id' };
    }
    requestIds.add(normalized.value.requestId);
    teams.push(normalized.value);
  }

  let compareTo: { heroIds: string[] } | null = null;
  if (body.compareTo !== null && body.compareTo !== undefined) {
    const normalized = normalizeTeam({ requestId: '__compare__', heroIds: body.compareTo?.heroIds }, 0);
    if (!normalized.ok) return { ok: false as const, error: 'compare_team_requires_three_unique_uuid_heroes' };
    compareTo = { heroIds: normalized.value.heroIds };
  }

  return { ok: true as const, teams, compareTo };
}

export function normalizePublicRecommendationPayload(body: any) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.action !== 'recommendations') {
    return { ok: false as const, error: 'invalid_recommendation_payload' };
  }
  const rawIds = body.selectionHeroIds;
  if (!Array.isArray(rawIds) || rawIds.length > PUBLIC_SCORING_LIMITS.heroesPerTeam || !rawIds.every(validHeroUuid)) {
    return { ok: false as const, error: 'invalid_recommendation_selection' };
  }
  const selectionHeroIds = rawIds.map((value: string) => value.trim());
  if (new Set(selectionHeroIds).size !== selectionHeroIds.length) {
    return { ok: false as const, error: 'invalid_recommendation_selection' };
  }
  const requestedLimit = finitePolicyNumber(body.limit);
  if (requestedLimit === null || !Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > PUBLIC_SCORING_LIMITS.maxRecommendations) {
    return { ok: false as const, error: 'invalid_recommendation_limit' };
  }
  return { ok: true as const, selectionHeroIds, limit: requestedLimit };
}

export async function readJsonBodyLimited(request: Request, maxBytes = PUBLIC_SCORING_LIMITS.maxBodyBytes) {
  const contentLength = finitePolicyNumber(request.headers.get('content-length'));
  if (contentLength !== null && (contentLength < 0 || contentLength > maxBytes)) {
    return { ok: false as const, error: 'payload_too_large', status: 413 };
  }

  if (!request.body) return { ok: false as const, error: 'invalid_json', status: 400 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel('payload_too_large'); } catch { /* noop */ }
      return { ok: false as const, error: 'payload_too_large', status: 413 };
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true as const, value: JSON.parse(new TextDecoder().decode(combined)) };
  } catch {
    return { ok: false as const, error: 'invalid_json', status: 400 };
  }
}

export function validateModelSpecV4(model: any, expectedSchema: string, expectedFeatureNames: string[]) {
  const schema = String(model?.feature_schema_version || '');
  if (!schema || schema !== expectedSchema) return null;
  const names = model?.weights?.featureNames;
  const coefficients = model?.weights?.coefficients;
  const intercept = finitePolicyNumber(model?.weights?.intercept);
  if (!Array.isArray(names) || !Array.isArray(coefficients)) return null;
  if (names.length !== expectedFeatureNames.length || coefficients.length !== expectedFeatureNames.length) return null;
  if (names.some((name: unknown, index: number) => String(name) !== expectedFeatureNames[index])) return null;
  if (intercept === null) return null;
  const numericCoefficients = coefficients.map((value: unknown) => finitePolicyNumber(value));
  if (numericCoefficients.some((value: number | null) => value === null)) return null;
  return { schema, weights: [intercept, ...(numericCoefficients as number[])] };
}

export function learningPreflightV4(settings: any, debt: any) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { loadModel: false, reason: 'settings_unavailable', activeModelId: '', maxInfluence: 0 };
  }
  const emergency = settings.emergency_enabled === true;
  const activeModelId = String(settings.active_model_id || '').trim();
  const maxInfluence = finitePolicyNumber(settings.max_influence);

  if (emergency) return { loadModel: false, reason: 'emergency', activeModelId, maxInfluence: 0 };
  if (!debt?.fresh) return { loadModel: false, reason: 'knowledge_or_patch_debt', activeModelId, maxInfluence: 0 };
  if (settings.learning_enabled !== true) return { loadModel: false, reason: 'learning_disabled', activeModelId, maxInfluence: 0 };
  if (!activeModelId) return { loadModel: false, reason: 'active_model_not_configured', activeModelId, maxInfluence: 0 };
  if (maxInfluence === null || maxInfluence < 0) return { loadModel: false, reason: 'invalid_influence_config', activeModelId, maxInfluence: 0 };
  if (maxInfluence === 0) return { loadModel: false, reason: 'learning_influence_zero', activeModelId, maxInfluence: 0 };
  return { loadModel: true, reason: null, activeModelId, maxInfluence };
}

export function resolveLearningInfluenceV4(options: {
  preflight: ReturnType<typeof learningPreflightV4>;
  model: any;
  spec: any;
  modelLoadError?: unknown;
}) {
  const { preflight, model, spec, modelLoadError } = options;
  if (!preflight.loadModel) return { influence: 0, reason: preflight.reason };
  if (modelLoadError || !model) return { influence: 0, reason: 'active_model_unavailable' };
  if (String(model.id || '') !== preflight.activeModelId) return { influence: 0, reason: 'active_model_mismatch' };
  if (model.status !== 'active' || model.passed_validation !== true) return { influence: 0, reason: 'no_validated_active_model' };
  if (!spec) return { influence: 0, reason: 'semantic_v4_active_model_required' };
  const modelWeight = finitePolicyNumber(model.influence_weight);
  if (modelWeight === null || modelWeight < 0) return { influence: 0, reason: 'invalid_influence_config' };
  if (modelWeight === 0) return { influence: 0, reason: 'learning_influence_zero' };
  return {
    influence: clampPolicy(Math.min(preflight.maxInfluence, modelWeight), 0, .55),
    reason: null
  };
}

export function teamVerificationInfluenceFactorV4(verifiedSkillCoverage: unknown) {
  const coverage = clampPolicy(finitePolicyNumber(verifiedSkillCoverage) ?? 0, 0, 1);
  return clampPolicy((coverage - .50) / .50, 0, 1);
}

export function effectiveTeamInfluenceV4(baseInfluence: unknown, verifiedSkillCoverage: unknown) {
  const base = clampPolicy(finitePolicyNumber(baseInfluence) ?? 0, 0, .55);
  const factor = teamVerificationInfluenceFactorV4(verifiedSkillCoverage);
  return {
    factor,
    influence: Number((base * factor).toFixed(6))
  };
}
