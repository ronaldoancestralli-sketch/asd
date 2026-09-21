import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import {
  SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION,
  SUPPORTED_FEATURE_SCHEMA_VERSIONS_V4,
  brier,
  canonicalTeam,
  featureMeans,
  featureNamesForSchemaV4 as featureNamesForSchema,
  featureVectorV4 as featureVector,
  isSupportedFeatureSchemaV4 as isSupportedFeatureSchema,
  meanAbsoluteDrift,
  predict,
  sha256
} from './composition-brain.ts';
import { validateModelSpecV4 } from '../_shared/echo-brain-public-policy-v4.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
});

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

async function authorize(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !SUPABASE_ANON_KEY) return null;
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) return null;
  const claims = decodeJwtPayload(token);
  if (!claims || claims.sub !== data.user.id || claims.aal !== 'aal2') return null;
  const { data: profile, error: profileError } = await service.from('profiles')
    .select('id,is_blocked').eq('id', data.user.id).maybeSingle();
  if (profileError || !profile || profile.is_blocked === true) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: isAdmin, error: adminError } = await userClient.rpc('echo_is_admin');
  return !adminError && isAdmin === true ? data.user.id : null;
}

async function fetchObservations(seasonId: string | null, after: string) {
  const rows: any[] = [], pageSize = 1000;
  let from = 0;
  while (from < 20000) {
    let query = service.from('composition_match_observations')
      .select('id,season_id,hero_1_id,hero_2_id,hero_3_id,outcome,trust_level,recommended_by_brain,observation_provenance,occurred_at,created_at')
      .eq('trust_level', 'verified')
      .gt('occurred_at', after)
      .order('occurred_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    query = query.eq('recommended_by_brain', false).eq('observation_provenance', 'organic');
    if (seasonId) query = query.eq('season_id', seasonId);
    const { data, error } = await query;
    if (error) return { rows: [], error };
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return { rows, error: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const userId = await authorize(req);
  if (!userId) return json({ error: 'admin_required' }, 403);

  const { data: settings, error: settingsError } = await service.from('echo_brain_settings').select('*').eq('brain_key', 'composition').single();
  if (settingsError) return json({ error: 'settings_unavailable', detail: settingsError.message }, 500);
  if (settings?.emergency_enabled === true) return json({ error: 'brain_emergency_active', reason: settings.emergency_reason || null }, 423);
  if (!settings.active_model_id) return json({ error: 'active_model_required' }, 409);
  const organicOnly = true;

  const [
    { data: model, error: modelError },
    { data: activation, error: activationError },
    { data: heroes, error: heroesError },
    { data: skills, error: skillsError }
  ] = await Promise.all([
    service.from('composition_model_versions').select('*').eq('id', settings.active_model_id).single(),
    service.from('composition_model_activations').select('*').eq('brain_key', 'composition').eq('model_id', settings.active_model_id).is('deactivated_at', null).maybeSingle(),
    service.from('heroes').select('id,name,class_id,enabled').eq('enabled', true),
    service.from('hero_skills').select('id,hero_id,name,description,skill_type,cooldown,duration,enabled,verification_status,needs_recheck').eq('enabled', true)
  ]);
  const sourceError = modelError || activationError || heroesError || skillsError;
  if (sourceError) return json({ error: 'source_unavailable', detail: sourceError.message }, 500);
  if (!activation) return json({ error: 'active_activation_required' }, 409);
  if (model.status !== 'active' || model.passed_validation !== true) return json({ error: 'validated_active_model_required' }, 409);

  const schema = String(model.feature_schema_version || '');
  if (!isSupportedFeatureSchema(schema)) {
    return json({ error: 'unsupported_feature_schema', supported: SUPPORTED_FEATURE_SCHEMA_VERSIONS_V4, received: schema }, 409);
  }
  const expectedNames = featureNamesForSchema(schema);
  const spec = validateModelSpecV4(model, schema, expectedNames);
  if (!spec) return json({ error: 'invalid_model_weights' }, 409);
  const weights = spec.weights;
  const globalRate = Number(model.metrics?.globalRate);
  if (!Number.isFinite(globalRate)) return json({ error: 'training_baseline_missing' }, 409);

  const observationsResult = await fetchObservations(model.season_id || null, activation.activated_at);
  if (observationsResult.error) return json({ error: 'observations_unavailable', detail: observationsResult.error.message }, 500);

  const skillsByHero = new Map<string, any[]>();
  for (const skill of skills || []) {
    if (!skillsByHero.has(skill.hero_id)) skillsByHero.set(skill.hero_id, []);
    skillsByHero.get(skill.hero_id)!.push(skill);
  }
  const heroesById = new Map((heroes || []).map(hero => [hero.id, { ...hero, skills: skillsByHero.get(hero.id) || [] }]));

  const rows: any[] = [];
  for (const observation of observationsResult.rows || []) {
    const ids = [observation.hero_1_id, observation.hero_2_id, observation.hero_3_id];
    const team = ids.map(id => heroesById.get(id)).filter(Boolean);
    if (team.length !== 3 || new Set(ids).size !== 3) continue;
    rows.push({
      id: observation.id,
      key: canonicalTeam(ids),
      matches: 1,
      wins: observation.outcome === 'win' ? 1 : 0,
      target: observation.outcome === 'win' ? 1 : 0,
      features: featureVector(team, schema),
      recommendedByBrain: observation.recommended_by_brain === true,
      provenance: observation.observation_provenance,
      occurred_at: observation.occurred_at
    });
  }

  const totalMatches = rows.length;
  const distinctTrios = new Set(rows.map(row => row.key)).size;
  const minMatches = Math.max(1, Number(settings.min_evaluation_matches) || 60);
  const minTrios = Math.max(3, Number(settings.min_validation_rows) || 3);
  if (totalMatches < minMatches || distinctTrios < minTrios) {
    return json({ error: 'not_ready', readiness: { observedTrios: distinctTrios, minTrios, newMatches: totalMatches, minMatches, source: 'verified_observations', provenance: 'explicit_organic_only', since: activation.activated_at } }, 409);
  }

  const modelBrier = brier(rows, features => predict(weights, features));
  const baselineBrier = brier(rows, () => globalRate);
  if (modelBrier === null || baselineBrier === null) return json({ error: 'evaluation_metric_unavailable' }, 409);

  const currentFeatureMeans = featureMeans(rows);
  const rawTrainingFeatureMeans = model.metrics?.trainingFeatureMeans;
  const trainingFeatureMeans = Array.isArray(rawTrainingFeatureMeans)
    ? rawTrainingFeatureMeans.map((value: any) => Number(value))
    : null;
  if (!trainingFeatureMeans || trainingFeatureMeans.length !== expectedNames.length || trainingFeatureMeans.some((value: number) => !Number.isFinite(value))) {
    return json({ error: 'training_feature_means_invalid' }, 409);
  }
  const featureDriftScore = meanAbsoluteDrift(currentFeatureMeans, trainingFeatureMeans);
  const performanceGap = modelBrier - baselineBrier;
  const warn = Number(settings.drift_feature_warn) || .12;
  const critical = Number(settings.drift_feature_critical) || .22;
  const tolerance = Number(settings.drift_brier_tolerance) || .02;
  const status = (performanceGap > tolerance || (featureDriftScore !== null && featureDriftScore >= critical))
    ? 'drift'
    : (performanceGap > 0 || (featureDriftScore !== null && featureDriftScore >= warn)) ? 'watch' : 'healthy';

  const driftFeatures = trainingFeatureMeans
    ? expectedNames.map((name, index) => ({
        name,
        current: currentFeatureMeans[index],
        training: trainingFeatureMeans[index],
        delta: Math.abs(currentFeatureMeans[index] - trainingFeatureMeans[index])
      })).sort((a, b) => b.delta - a.delta).slice(0, 10)
    : [];
  const newWins = rows.reduce((total, row) => total + row.wins, 0);
  const brainInfluencedMatches = rows.filter(row => row.recommendedByBrain || row.provenance === 'brain_exposed').length;
  const fingerprint = await sha256(rows.map(row => `${row.id}:${row.target}:${row.occurred_at}:${schema}`).join('\n'));
  const details = {
    evaluatorVersion: 7,
    dataSource: 'composition_match_observations',
    sourceTrust: 'verified',
    organicOnly,
    observationProvenance: 'organic',
    featureSchemaVersion: schema,
    semanticContextV4: schema === SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION,
    activationStartedAt: activation.activated_at,
    globalRate,
    trainingFeatureMeans,
    currentFeatureMeans,
    topFeatureDrift: driftFeatures,
    datasetFingerprint: fingerprint,
    brainInfluencedMatches,
    organicMatches: rows.filter(row => row.provenance === 'organic' && !row.recommendedByBrain).length,
    thresholds: { warn, critical, brierTolerance: tolerance }
  };

  const { data: evaluation, error: evaluationError } = await service.from('composition_model_evaluations').insert({
    brain_key: 'composition',
    activation_id: activation.id,
    model_id: model.id,
    season_id: model.season_id,
    status,
    observed_trios: distinctTrios,
    new_matches: totalMatches,
    new_wins: newWins,
    model_brier: modelBrier,
    baseline_brier: baselineBrier,
    performance_gap: performanceGap,
    feature_drift_score: featureDriftScore,
    details,
    created_by: userId
  }).select('id,status,evaluated_at').single();

  if (evaluationError) {
    const detail = evaluationError.message || '';
    if (detail.includes('brain_emergency_')) return json({ error: 'brain_emergency_active', detail }, 423);
    return json({ error: 'evaluation_write_failed', detail }, 500);
  }

  await service.from('echo_brain_actions').insert({
    brain_key: 'composition',
    action_type: 'evaluate',
    model_id: model.id,
    actor_id: userId,
    details: {
      evaluation_id: evaluation.id,
      status,
      new_matches: totalMatches,
      performance_gap: performanceGap,
      feature_drift_score: featureDriftScore,
      brain_influenced_matches: brainInfluencedMatches,
      provenance: 'explicit_organic_only',
      feature_schema: schema
    }
  });

  return json({
    ok: true,
    evaluation: {
      ...evaluation,
      featureSchema: schema,
      observedTrios: distinctTrios,
      newMatches: totalMatches,
      newWins,
      modelBrier,
      baselineBrier,
      performanceGap,
      featureDriftScore,
      brainInfluencedMatches,
      provenance: 'explicit_organic_only',
      topFeatureDrift: driftFeatures
    }
  });
});
