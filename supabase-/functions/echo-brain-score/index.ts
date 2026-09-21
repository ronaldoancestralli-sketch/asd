import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import {
  SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION,
  featureNamesForSchemaV4,
  featureVectorV4,
  isSupportedFeatureSchemaV4,
  semanticCompositionAssessmentV4
} from '../_shared/echo-brain-semantic-v4.ts';
import { clamp, predict } from '../_shared/echo-brain-semantic.ts';
import {
  COMPOSITION_EQUIPMENT_CONTEXT_V1_SCHEMA,
  assessCompositionEquipmentContextV1
} from '../_shared/echo-brain-equipment-context-v1.ts';
import {
  PUBLIC_SCORING_LIMITS,
  canonicalPolicyTeam,
  effectiveTeamInfluenceV4,
  finitePolicyNumber,
  learningPreflightV4,
  normalizePublicRecommendationPayload,
  normalizePublicScoringPayload,
  readJsonBodyLimited,
  resolveLearningInfluenceV4,
  validateModelSpecV4
} from '../_shared/echo-brain-public-policy-v4.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAX_TEAMS = PUBLIC_SCORING_LIMITS.maxTeams;
const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

const finite = finitePolicyNumber;
const canonicalTeam = canonicalPolicyTeam;
const VERSION_FINGERPRINT_RE = /^(?:[0-9a-f]{32}|[0-9a-f]{64})$/i;

function decodeJwtPayload(token: string) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as { sub?: string; aal?: string };
  } catch {
    return null;
  }
}

function norm(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function fingerprintValid(value: unknown) {
  return typeof value === 'string' && VERSION_FINGERPRINT_RE.test(value);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function recommendationCandidatesFromCatalog(catalogHeroIds: string[], selectionHeroIds: string[]) {
  const catalog = [...new Set(catalogHeroIds.map(String))].sort();
  const selected = [...new Set(selectionHeroIds.map(String))];
  const selectedSet = new Set(selected);
  const pool = catalog.filter(id => !selectedSet.has(id));
  const candidates = new Map<string, string[]>();
  const add = (ids: string[]) => {
    if (ids.length !== 3 || new Set(ids).size !== 3) return;
    candidates.set(canonicalTeam(ids), ids);
  };

  if (selected.length === 0) {
    for (let first = 0; first < catalog.length; first += 1) {
      for (let second = first + 1; second < catalog.length; second += 1) {
        for (let third = second + 1; third < catalog.length; third += 1) add([catalog[first], catalog[second], catalog[third]]);
      }
    }
  } else if (selected.length === 1) {
    for (let first = 0; first < pool.length; first += 1) {
      for (let second = first + 1; second < pool.length; second += 1) add([selected[0], pool[first], pool[second]]);
    }
  } else if (selected.length === 2) {
    for (const heroId of pool) add([selected[0], selected[1], heroId]);
  } else {
    const pairs = [[selected[0], selected[1]], [selected[0], selected[2]], [selected[1], selected[2]]];
    for (const pair of pairs) for (const heroId of pool) add([pair[0], pair[1], heroId]);
  }
  return [...candidates.entries()].map(([key, heroIds], index) => ({ requestId: `server-rec-${index}`, key, heroIds }));
}

async function adminAuditAllowed(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) return false;
  const claims = decodeJwtPayload(token);
  if (!claims || claims.sub !== data.user.id || claims.aal !== 'aal2') return false;
  const { data: profile, error: profileError } = await service.from('profiles')
    .select('role,is_admin,is_blocked')
    .eq('id', data.user.id)
    .maybeSingle();
  return Boolean(!profileError && profile && (profile.role === 'admin' || profile.is_admin === true) && profile.is_blocked !== true);
}

function modelSpec(model: any) {
  const schema = String(model?.feature_schema_version || '');
  if (!isSupportedFeatureSchemaV4(schema)) return null;
  if (schema !== SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION) return null;
  return validateModelSpecV4(model, schema, featureNamesForSchemaV4(schema));
}

function mechanicalDemand(heroes: any[]) {
  let active = 0, conditional = 0, penalties = 0, coordination = 0, precision = 0, totalSkills = 0;
  for (const hero of heroes) {
    for (const skill of hero?.skills || []) {
      if (skill?.enabled === false) continue;
      totalSkills += 1;
      const text = norm(`${skill?.name || ''} ${skill?.description || ''} ${skill?.skill_type || ''}`);
      if (/\bativa\b|ao ativar|apos ativar/.test(text)) active += 1;
      if (/ao acertar|ao eliminar|ao receber dano|acerto direto|ao sair da invisibilidade/.test(text)) conditional += 1;
      if (/nao pode atirar|sem poder atirar|reduz.{0,60}velocidade de movimento do heroi|heroi para e dispara/.test(text)) penalties += 1;
      if (/equipe|aliad|raio de \d+/.test(text)) coordination += 1;
      if (/atraves de paredes|tempo de mira|dispersao|acerto direto|invisibilidade/.test(text)) precision += 1;
    }
  }
  if (!totalSkills) return 0;
  const raw = active * 5 + conditional * 6 + penalties * 9 + coordination * 2.5 + precision * 3.5;
  return Math.round(clamp(raw / Math.max(1, totalSkills * 8), 0, 1) * 100);
}

function modelEvidence(model: any) {
  if (!model) return { modelConfidence: 0, observedEvidence: 0 };
  const metrics = model.metrics || {};
  const validationRows = Math.max(0, finite(metrics.validationRows ?? model.validation_rows) ?? 0);
  const totalMatches = Math.max(0, finite(model.total_matches) ?? 0);
  const improvement = Math.max(0, finite(metrics.relativeImprovement) ?? 0);
  const observedEvidence = clamp(Math.log10(1 + totalMatches) / Math.log10(1001), 0, 1);
  const validationCoverage = clamp(validationRows / 120, 0, 1);
  const modelConfidence = clamp(.35 + validationCoverage * .35 + clamp(improvement / .2, 0, 1) * .30, 0, 1);
  return { modelConfidence, observedEvidence };
}

async function competitiveDebt() {
  const results = await Promise.all([
    service.from('equipment_brain_invalidations').select('id', { count: 'exact', head: true }).eq('status', 'pending').in('scope', ['composition_recommendations', 'training']),
    service.from('echo_brain_knowledge_invalidations').select('id', { count: 'exact', head: true }).eq('status', 'pending').in('scope', ['composition_recommendations', 'training']),
    service.from('equipment_brain_change_queue').select('equipment_id', { count: 'exact', head: true }).in('status', ['pending', 'processing']),
    service.from('echo_brain_knowledge_change_queue').select('entity_id', { count: 'exact', head: true }).in('status', ['pending', 'processing'])
  ]);
  let unknown = false, pending = 0;
  for (const result of results) {
    if (result.error) unknown = true;
    else pending += Number(result.count || 0);
  }
  return { pending, unknown, fresh: !unknown && pending === 0 };
}

function confidenceComponents(assessment: any, debt: any, model: any, influence: number, equipmentContext: any) {
  const rules = clamp(Number(assessment?.confidence || 0), 0, 1);
  const verification = clamp(Number(assessment?.components?.verifiedSkillCoverage || 0), 0, 1);
  const knowledgeFreshness = debt.unknown ? .60 : debt.pending > 0 ? .35 : 1;
  const equipment = equipmentContext?.applied === true ? clamp(Number(equipmentContext?.confidence || 0), 0, 1) : 0;
  const { modelConfidence, observedEvidence } = modelEvidence(model);
  const overall = equipmentContext?.applied === true
    ? influence > 0
      ? clamp(rules * .29 + verification * .16 + knowledgeFreshness * .17 + equipment * .12 + modelConfidence * .13 + observedEvidence * .13, 0, 1)
      : clamp(rules * .45 + verification * .22 + knowledgeFreshness * .18 + equipment * .15, 0, 1)
    : influence > 0
      ? clamp(rules * .32 + verification * .18 + knowledgeFreshness * .18 + modelConfidence * .16 + observedEvidence * .16, 0, 1)
      : clamp(rules * .52 + verification * .26 + knowledgeFreshness * .22, 0, 1);
  return {
    rules: Number(rules.toFixed(3)),
    verification: Number(verification.toFixed(3)),
    knowledgeFreshness: Number(knowledgeFreshness.toFixed(3)),
    equipmentContext: Number(equipment.toFixed(3)),
    model: Number(modelConfidence.toFixed(3)),
    observedEvidence: Number(observedEvidence.toFixed(3)),
    overall: Number(overall.toFixed(3))
  };
}

function publicEquipmentContext(context: any, sourceAvailable: boolean) {
  return {
    schemaVersion: COMPOSITION_EQUIPMENT_CONTEXT_V1_SCHEMA,
    sourceAvailable,
    complete: context?.complete === true,
    applied: context?.applied === true,
    adjustment: Number(context?.adjustment || 0),
    confidence: Number(context?.confidence || 0),
    supportAffinity: finite(context?.supportAffinity),
    assumptions: context?.assumptions || {
      mode: 'available-equipment-support-potential',
      selectedLoadoutAssumed: false,
      setBonusesAssumed: false,
      catalogueSizeDoesNotDirectlyIncreaseScore: true,
      bestSemanticSupportPerSlotOnly: true
    },
    heroes: (context?.heroes || []).map((row: any) => ({
      heroId: row.heroId || null,
      eligibleItems: Number(row.eligibleItems || 0),
      semanticItems: Number(row.semanticItems || 0),
      coveredSlots: Number(row.coveredSlots || 0),
      semanticCoverage: Number(row.semanticCoverage || 0),
      verifiedSkillCoverage: Number(row.verifiedSkillCoverage || 0),
      supportAffinity: Number(row.supportAffinity || 0),
      confidence: Number(row.confidence || 0),
      sufficient: row.sufficient === true
    })),
    reasons: context?.reasons || []
  };
}

function counterfactual(base: any, candidate: any) {
  if (!base || !candidate) return null;
  const fields: [string, number][] = [
    ['functionalSynergy', 1], ['semanticSynergy', 1], ['equipmentAdjustment', 1], ['observedPerformance', 1], ['mechanicalDemand', -1]
  ];
  const changedComponents = fields.map(([key, direction]) => {
    const before = finite(base[key]);
    const after = finite(candidate[key]);
    if (before === null || after === null) return null;
    const delta = after - before;
    return { key, before, after, delta: Number(delta.toFixed(2)), utilityDelta: Number((delta * direction).toFixed(2)) };
  }).filter(Boolean);
  const baselineScore = finite(base.finalScore);
  const candidateScore = finite(candidate.finalScore);
  if (baselineScore === null || candidateScore === null) return {
    baselineKey: base.key,
    candidateKey: candidate.key,
    baselineScore,
    candidateScore,
    delta: null,
    verdict: 'unknown',
    changedComponents
  };
  const delta = Number((candidateScore - baselineScore).toFixed(2));
  return {
    baselineKey: base.key,
    candidateKey: candidate.key,
    baselineScore,
    candidateScore,
    delta,
    verdict: delta > 0 ? 'improves' : delta < 0 ? 'worsens' : 'neutral',
    changedComponents
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const parsedBody = await readJsonBodyLimited(req);
  if (!parsedBody.ok) return json({ error: parsedBody.error }, parsedBody.status);
  const body: any = parsedBody.value;
  const recommendationMode = body?.action === 'recommendations';
  const recommendationPayload = recommendationMode ? normalizePublicRecommendationPayload(body) : null;
  const payload = normalizePublicScoringPayload(body);
  const validation = recommendationPayload || payload;
  if (!validation?.ok) {
    return json(
      validation?.error === 'too_many_teams' ? { error: validation.error, maxTeams: MAX_TEAMS } : { error: validation?.error || 'invalid_payload' },
      validation?.error === 'too_many_teams' ? 413 : 400
    );
  }

  let normalized: Array<{ requestId: string; heroIds: string[] }> = !recommendationMode && payload.ok ? payload.teams : [];
  const selectionHeroIds: string[] = recommendationPayload?.ok ? recommendationPayload.selectionHeroIds : [];
  const compareIds: string[] = !recommendationMode && payload.ok
    ? payload.compareTo?.heroIds || []
    : selectionHeroIds.length === 3 ? selectionHeroIds : [];
  const auditRequested = body?.recordAudit === true;
  const auditAllowed = auditRequested ? await adminAuditAllowed(req) : false;
  const allIds: string[] = [...new Set<string>(normalized.flatMap(row => row.heroIds))];

  const heroesQuery = recommendationMode
    ? service.from('heroes').select('id,name,class_id,enabled').eq('enabled', true).order('id').limit(PUBLIC_SCORING_LIMITS.maxRecommendationHeroes + 1)
    : service.from('heroes').select('id,name,class_id,enabled').in('id', allIds).eq('enabled', true);
  // Deterministic Semantic V4 accepts corroborated evidence with reduced confidence.
  // Learned influence remains separately gated by verifiedSkillCoverage, so this
  // does not promote corroborated data to verified data or unlock the model.
  const skillsQuery = recommendationMode
    ? service.from('hero_skills').select('id,hero_id,name,description,skill_type,cooldown,duration,enabled,verification_status,needs_recheck')
      .eq('enabled', true).in('verification_status', ['verified', 'corroborated'])
    : service.from('hero_skills').select('id,hero_id,name,description,skill_type,cooldown,duration,enabled,verification_status,needs_recheck')
      .in('hero_id', allIds).eq('enabled', true).in('verification_status', ['verified', 'corroborated']);
  const heroVersionsQuery = recommendationMode
    ? service.from('echo_brain_knowledge_versions')
      .select('id,entity_id,version,season_id,game_version,semantic_fingerprint').eq('entity_type', 'hero_profile').order('version', { ascending: false })
    : service.from('echo_brain_knowledge_versions')
      .select('id,entity_id,version,season_id,game_version,semantic_fingerprint').eq('entity_type', 'hero_profile').in('entity_id', allIds).order('version', { ascending: false });

  const [
    settingsResult, heroesResult, skillsResult, equipmentResult, equipmentVariantsResult,
    seasonResult, heroVersionsResult, equipmentVersionsResult, debt
  ] = await Promise.all([
    service.from('echo_brain_settings').select('*').eq('brain_key', 'composition').maybeSingle(),
    heroesQuery,
    skillsQuery,
    service.from('equipments').select('id,name,description,slot_id,hero_id,class_id,is_personal,enabled').eq('enabled', true),
    service.from('equipment_variants').select('equipment_id,attributes'),
    service.from('seasons').select('id,game_version').eq('active', true).order('starts_at', { ascending: false }).limit(1).maybeSingle(),
    heroVersionsQuery,
    service.from('equipment_brain_versions').select('id,equipment_id,version,season_id,game_version,semantic_fingerprint').order('version', { ascending: false }),
    competitiveDebt()
  ]);

  const sourceError = [heroesResult, skillsResult, equipmentResult, equipmentVariantsResult, seasonResult, heroVersionsResult, equipmentVersionsResult]
    .find(result => result.error)?.error;
  if (sourceError) return json({ error: 'knowledge_source_unavailable', detail: sourceError.message }, 500);
  if (!seasonResult.data || !String(seasonResult.data.game_version || '') || !debt.fresh) return json({ error: 'knowledge_not_current' }, 409);
  if (recommendationMode && (heroesResult.data || []).length > PUBLIC_SCORING_LIMITS.maxRecommendationHeroes) {
    return json({ error: 'recommendation_catalog_too_large' }, 409);
  }
  const settings = settingsResult.error ? null : settingsResult.data;
  const emergency = settings?.emergency_enabled === true;
  const preflight = learningPreflightV4(settings, debt);
  const configuredActiveModelId = preflight.activeModelId;
  const shouldLoadModel = Boolean(preflight.loadModel && debt.fresh);

  let activeModel: any = null;
  let modelLoadError: any = null;
  if (shouldLoadModel) {
    const modelResult = await service.from('composition_model_versions')
      .select('id,version,status,feature_schema_version,influence_weight,passed_validation,weights,metrics,total_matches,activated_at,created_at')
      .eq('id', configuredActiveModelId)
      .eq('status', 'active')
      .eq('passed_validation', true)
      .maybeSingle();
    modelLoadError = modelResult.error || null;
    activeModel = modelLoadError ? null : modelResult.data;
  }

  const spec = modelSpec(activeModel);
  const activeModelMatchesSettings = Boolean(configuredActiveModelId && String(activeModel?.id || '') === configuredActiveModelId);
  const policyResolution = resolveLearningInfluenceV4({ preflight, model: activeModel, spec, modelLoadError });
  const learnedAllowed = Boolean(policyResolution.reason === null && policyResolution.influence > 0 && activeModelMatchesSettings);
  const influence = learnedAllowed ? policyResolution.influence : 0;

  const skillsByHero = new Map<string, any[]>();
  for (const skill of skillsResult.data || []) {
    if (!skillsByHero.has(skill.hero_id)) skillsByHero.set(skill.hero_id, []);
    skillsByHero.get(skill.hero_id)!.push(skill);
  }
  const heroesById = new Map<string, any>((heroesResult.data || []).map((hero: any) => [String(hero.id), { ...hero, skills: skillsByHero.get(hero.id) || [] }]));
  if (!recommendationMode && allIds.some(id => !heroesById.has(id))) return json({ error: 'hero_unavailable' }, 409);

  const season = seasonResult.data;
  const latestHeroVersions = new Map<string, any>();
  for (const row of heroVersionsResult.data || []) {
    if (!latestHeroVersions.has(String(row.entity_id))) latestHeroVersions.set(String(row.entity_id), row);
  }
  const currentHeroVersion = (heroId: string) => {
    const version = latestHeroVersions.get(String(heroId));
    return version
      && String(version.season_id || '') === String(season.id)
      && String(version.game_version || '') === String(season.game_version)
      && fingerprintValid(version.semantic_fingerprint)
      ? version
      : null;
  };
  const eligibleHeroIds: string[] = [...heroesById.keys()].filter(heroId => currentHeroVersion(heroId) && (skillsByHero.get(heroId) || []).length > 0);
  const requiredHeroIds: string[] = recommendationMode ? selectionHeroIds : allIds;
  if (requiredHeroIds.some(id => !heroesById.has(id))) return json({ error: 'hero_unavailable' }, 409);
  if (requiredHeroIds.some(id => !currentHeroVersion(id))) return json({ error: 'knowledge_not_current' }, 409);
  if (requiredHeroIds.some(id => !(skillsByHero.get(id) || []).length)) return json({ error: 'skill_evidence_required' }, 409);

  if (recommendationMode) {
    const generated = recommendationCandidatesFromCatalog(eligibleHeroIds, selectionHeroIds);
    if (!generated.length) return json({ error: 'recommendations_unavailable' }, 409);
    normalized = generated.map(row => ({ requestId: row.requestId, heroIds: row.heroIds }));
    if (selectionHeroIds.length === 3) normalized.unshift({ requestId: '__baseline__', heroIds: selectionHeroIds });
  }

  const latestEquipmentVersions = new Map<string, any>();
  for (const row of equipmentVersionsResult.data || []) {
    if (!latestEquipmentVersions.has(String(row.equipment_id))) latestEquipmentVersions.set(String(row.equipment_id), row);
  }
  const equipmentKnowledgeRows = (equipmentResult.data || []).map((item: any) => {
    const version = latestEquipmentVersions.get(String(item.id));
    return version
      && String(version.season_id || '') === String(season.id)
      && String(version.game_version || '') === String(season.game_version)
      && fingerprintValid(version.semantic_fingerprint)
      ? { id: String(item.id), version: Number(version.version), fingerprint: String(version.semantic_fingerprint) }
      : null;
  });
  if (equipmentKnowledgeRows.some(row => !row)) return json({ error: 'knowledge_not_current' }, 409);
  const equipmentCatalogueFingerprint = await sha256((equipmentKnowledgeRows as any[])
    .map(row => `${row.id}:${row.version}:${row.fingerprint}`).sort().join('|'));

  const equipmentContextSourceAvailable = !equipmentResult.error && !equipmentVariantsResult.error;
  const variantsByEquipment = new Map<string, any[]>();
  if (equipmentContextSourceAvailable) {
    for (const variant of equipmentVariantsResult.data || []) {
      if (!variantsByEquipment.has(variant.equipment_id)) variantsByEquipment.set(variant.equipment_id, []);
      variantsByEquipment.get(variant.equipment_id)!.push(variant);
    }
  }
  const equipmentCatalogue = equipmentContextSourceAvailable
    ? (equipmentResult.data || []).map((item: any) => ({ ...item, variants: variantsByEquipment.get(item.id) || [] }))
    : [];

  const scored: any[] = [];
  for (const row of normalized) {
    const heroes = row.heroIds.map((id: string) => heroesById.get(id));
    const assessment = semanticCompositionAssessmentV4(heroes);
    if (!assessment.complete || assessment.score === null) continue;

    const rawEquipmentContext = assessCompositionEquipmentContextV1(heroes, equipmentCatalogue);
    const equipmentContext = publicEquipmentContext(rawEquipmentContext, equipmentContextSourceAvailable);
    const equipmentAdjustment = equipmentContextSourceAvailable && equipmentContext.applied
      ? Number(equipmentContext.adjustment || 0)
      : 0;

    const teamInfluence = effectiveTeamInfluenceV4(influence, assessment?.components?.verifiedSkillCoverage);
    const effectiveInfluence = teamInfluence.influence;
    // Learned Semantic v4 intentionally receives the historical v4 feature vector
    // unchanged. Equipment context is deterministic and bounded; it is NOT a fake v5 model.
    const learnedProbability = effectiveInfluence > 0 && spec ? predict(spec.weights, featureVectorV4(heroes, spec.schema)) : null;
    const observedPerformance = learnedProbability === null ? null : Number((learnedProbability * 100).toFixed(1));
    const heroSkillSemanticScore = Number(assessment.score);
    const semanticScore = Number(clamp(heroSkillSemanticScore + equipmentAdjustment, 0, 100).toFixed(2));
    const finalScore = Math.round(clamp(
      observedPerformance === null ? semanticScore : semanticScore * (1 - effectiveInfluence) + observedPerformance * effectiveInfluence,
      0, 100
    ));
    const confidence = confidenceComponents(assessment, debt, activeModel, effectiveInfluence, equipmentContext);
    const strengths = [...(assessment.strengths || [])];
    const risks = [...(assessment.risks || [])];
    if (equipmentContext.applied && equipmentAdjustment >= 1 && equipmentContext.reasons?.[0]) strengths.push(equipmentContext.reasons[0]);
    if (equipmentContext.applied && equipmentAdjustment <= -1 && equipmentContext.reasons?.[0]) risks.push(equipmentContext.reasons[0]);

    scored.push({
      requestId: row.requestId,
      key: canonicalTeam(row.heroIds),
      heroIds: row.heroIds,
      heroDisplay: heroes.map((hero: any) => ({ id: hero.id, name: hero.name })),
      semanticSchema: SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION,
      equipmentContextSchema: COMPOSITION_EQUIPMENT_CONTEXT_V1_SCHEMA,
      finalScore,
      functionalSynergy: Number(assessment.components.functionalScore || 0),
      heroSkillSemanticSynergy: heroSkillSemanticScore,
      semanticSynergy: semanticScore,
      equipmentAdjustment: Number(equipmentAdjustment.toFixed(2)),
      equipmentContext,
      observedPerformance,
      mechanicalDemand: mechanicalDemand(heroes),
      confidence,
      influence: Number(effectiveInfluence.toFixed(4)),
      influenceEvidence: {
        verifiedSkillCoverage: Number(assessment.components.verifiedSkillCoverage || 0),
        factor: Number(teamInfluence.factor.toFixed(3))
      },
      strengths: strengths.slice(0, 5),
      risks: risks.slice(0, 5),
      components: {
        ...(assessment.components || {}),
        equipmentContextAdjustment: Number(equipmentAdjustment.toFixed(2)),
        equipmentSupportAffinity: equipmentContext.supportAffinity,
        equipmentContextConfidence: Number(equipmentContext.confidence || 0)
      },
      knowledge: {
        fresh: true,
        pending: 0,
        unknown: false,
        equipmentContextAvailable: true,
        seasonId: season.id,
        gameVersion: season.game_version,
        heroes: row.heroIds.map((heroId: string) => {
          const version = currentHeroVersion(heroId);
          return { id: heroId, version: Number(version.version), fingerprint: version.semantic_fingerprint };
        }),
        equipmentCatalogueFingerprint
      },
      model: activeModel && effectiveInfluence > 0 ? { id: activeModel.id, version: activeModel.version, schema: activeModel.feature_schema_version } : null,
      learnedSuppressedReason: effectiveInfluence > 0
        ? null
        : influence > 0 && teamInfluence.factor <= 0
          ? 'insufficient_team_verification'
          : policyResolution.reason
    });
  }

  const baselineKey = compareIds.length === 3 ? canonicalTeam(compareIds) : null;
  const baseline = baselineKey ? scored.find(row => row.key === baselineKey) || null : null;
  for (const row of scored) row.counterfactual = baseline && row.key !== baseline.key ? counterfactual(baseline, row) : null;
  const responseResults = recommendationMode
    ? scored.filter(row => row.requestId !== '__baseline__')
      .sort((a, b) => b.finalScore - a.finalScore || a.key.localeCompare(b.key))
      .slice(0, recommendationPayload!.limit)
    : scored;

  // Recommendation exposures are never written with service-role from this public
  // endpoint. Public provenance uses the narrow RPC echo_brain_register_recommendation_exposure.
  if (auditAllowed && responseResults.length) {
    const auditRows = responseResults.slice(0, MAX_TEAMS).map(row => ({
      decision_type: row.counterfactual ? 'counterfactual' : 'composition',
      entity_key: row.key,
      semantic_schema: row.semanticSchema,
      model_id: row.model?.id || null,
      model_version: row.model?.version || null,
      scores: {
        finalScore: row.finalScore,
        functionalSynergy: row.functionalSynergy,
        heroSkillSemanticSynergy: row.heroSkillSemanticSynergy,
        semanticSynergy: row.semanticSynergy,
        equipmentAdjustment: row.equipmentAdjustment,
        observedPerformance: row.observedPerformance,
        mechanicalDemand: row.mechanicalDemand,
        influence: row.influence
      },
      confidence: row.confidence,
      explanation: {
        strengths: row.strengths,
        risks: row.risks,
        counterfactual: row.counterfactual,
        influenceEvidence: row.influenceEvidence,
        equipmentContext: row.equipmentContext
      },
      provenance: { knowledge: row.knowledge, learnedSuppressedReason: row.learnedSuppressedReason, requestContext: String(body?.auditContext || '').slice(0, 120) || null }
    }));
    const { error: auditError } = await service.from('echo_brain_decision_audits').insert(auditRows);
    if (auditError) console.warn('[echo-brain-score] decision audit write failed', auditError.message);

    const cfRows = responseResults.filter(row => row.counterfactual).slice(0, MAX_TEAMS - 1).map(row => ({
      domain: 'composition',
      baseline_key: row.counterfactual.baselineKey,
      candidate_key: row.counterfactual.candidateKey,
      baseline_score: row.counterfactual.baselineScore,
      candidate_score: row.counterfactual.candidateScore,
      delta: row.counterfactual.delta,
      changed_components: row.counterfactual.changedComponents,
      confidence: { baseline: baseline?.confidence || null, candidate: row.confidence },
      semantic_schema: row.semanticSchema,
      model_id: row.model?.id || null
    }));
    if (cfRows.length) {
      const { error: cfError } = await service.from('echo_brain_counterfactual_audits').insert(cfRows);
      if (cfError) console.warn('[echo-brain-score] counterfactual audit write failed', cfError.message);
    }
  }

  const maxInfluence = Number(influence.toFixed(4));
  return json({
    ok: true,
    mode: recommendationMode ? 'recommendations' : 'score',
    authority: 'server',
    fallback: 'none',
    localInfluence: 0,
    schemaVersion: SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION,
    equipmentContextSchemaVersion: COMPOSITION_EQUIPMENT_CONTEXT_V1_SCHEMA,
    learning: { influence: maxInfluence, maxInfluence, emergency, debt, activeModel: activeModel && influence > 0 ? { id: activeModel.id, version: activeModel.version } : null },
    audit: { requested: auditRequested, recorded: auditAllowed },
    ...(recommendationMode ? {
      selectionHeroIds,
      catalogue: {
        total: heroesById.size,
        eligible: eligibleHeroIds.length,
        excluded: heroesById.size - eligibleHeroIds.length
      }
    } : {}),
    results: responseResults
  });
});
