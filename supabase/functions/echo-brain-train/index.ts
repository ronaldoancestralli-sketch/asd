import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import {
  SEMANTIC_CONTEXT_V4_FEATURE_NAMES,
  SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION,
  brier,
  canonicalTeam,
  clamp,
  featureMeans,
  semanticContextV4FeatureVector,
  predict,
  sha256,
  trainLogistic,
  weightedRate
} from './composition-brain.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// The legacy organic_training_only setting remains readable for compatibility,
// but it can no longer disable this permanent anti-feedback invariant.
const ORGANIC_TRAINING_ONLY = true;
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

async function fetchObservations() {
  const rows: any[] = [], pageSize = 1000;
  let from = 0;
  while (from < 20000) {
    const { data, error } = await service
      .from('composition_match_observations')
      .select('id,season_id,hero_1_id,hero_2_id,hero_3_id,outcome,trust_level,recommended_by_brain,observation_provenance,occurred_at,created_at')
      .eq('trust_level', 'verified')
      .order('occurred_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
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

  const observationsPromise = fetchObservations();
  const [
    { data: settings, error: settingsError },
    { data: heroes, error: heroesError },
    { data: skills, error: skillsError },
    { data: seasons, error: seasonsError },
    observationsResult
  ] = await Promise.all([
    service.from('echo_brain_settings').select('*').eq('brain_key', 'composition').single(),
    service.from('heroes').select('id,name,class_id,enabled').eq('enabled', true),
    service.from('hero_skills').select('id,hero_id,name,description,skill_type,cooldown,duration,enabled,verification_status,needs_recheck').eq('enabled', true),
    service.from('seasons').select('id,name,active,starts_at,ends_at').order('starts_at', { ascending: false }),
    observationsPromise
  ]);

  const sourceError = settingsError || heroesError || skillsError || seasonsError || observationsResult.error;
  if (sourceError) return json({ error: 'source_unavailable', detail: sourceError.message }, 500);
  if (settings?.emergency_enabled === true) return json({ error: 'brain_emergency_active', reason: settings.emergency_reason || null }, 423);

  const skillsByHero = new Map<string, any[]>();
  for (const skill of skills || []) {
    if (!skillsByHero.has(skill.hero_id)) skillsByHero.set(skill.hero_id, []);
    skillsByHero.get(skill.hero_id)!.push(skill);
  }
  const heroesById = new Map((heroes || []).map(hero => [hero.id, { ...hero, skills: skillsByHero.get(hero.id) || [] }]));

  let observations = (observationsResult.rows || []) as any[];
  observations = observations.filter(row =>
    row.recommended_by_brain !== true && row.observation_provenance === 'organic'
  );
  const activeSeason = (seasons || []).find((season: any) => season.active === true);
  if (activeSeason && observations.some(row => row.season_id === activeSeason.id)) {
    observations = observations.filter(row => row.season_id === activeSeason.id);
  } else if (observations.length) {
    const latestSeason = observations[observations.length - 1]?.season_id;
    observations = observations.filter(row => row.season_id === latestSeason);
  }

  const rows: any[] = [];
  for (const observation of observations) {
    const ids = [observation.hero_1_id, observation.hero_2_id, observation.hero_3_id];
    const team = ids.map(id => heroesById.get(id)).filter(Boolean);
    if (team.length !== 3 || new Set(ids).size !== 3) continue;
    rows.push({
      id: observation.id,
      key: canonicalTeam(ids),
      matches: 1,
      wins: observation.outcome === 'win' ? 1 : 0,
      target: observation.outcome === 'win' ? 1 : 0,
      features: semanticContextV4FeatureVector(team),
      occurred_at: observation.occurred_at,
      season_id: observation.season_id
    });
  }

  const distinctTrios = new Set(rows.map(row => row.key)).size;
  const minTrios = Number(settings.min_trios) || 12;
  const minMatches = Number(settings.min_matches) || 120;
  const minValidation = Number(settings.min_validation_rows) || 3;
  const totalMatches = rows.length;
  const validationCount = Math.max(minValidation, Math.ceil(rows.length * .2));
  const minTrainRows = Math.max(120, SEMANTIC_CONTEXT_V4_FEATURE_NAMES.length * 2);

  if (distinctTrios < minTrios || totalMatches < minMatches || validationCount >= rows.length) {
    return json({
      error: 'not_ready',
      readiness: {
        trios: distinctTrios,
        minTrios,
        totalMatches,
        minMatches,
        validationRows: Math.min(validationCount, Math.max(0, rows.length - 1)),
        minValidation,
        minTrainRows,
        source: 'verified_observations',
        provenance: 'explicit_organic_only',
        organicOnly: ORGANIC_TRAINING_ONLY,
        featureSchema: SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION
      }
    }, 409);
  }

  const train = rows.slice(0, rows.length - validationCount);
  const validation = rows.slice(rows.length - validationCount);
  if (train.length < minTrainRows) {
    return json({
      error: 'not_ready',
      reason: 'train_matches_below_semantic_v4_safety_floor',
      readiness: { trainMatches: train.length, minTrainRows, totalMatches, featureCount: SEMANTIC_CONTEXT_V4_FEATURE_NAMES.length }
    }, 409);
  }

  const fingerprint = await sha256(rows.map(row => `${row.id}:${row.target}:${row.occurred_at}:${SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION}`).join('\n'));
  const seasonId = activeSeason?.id || rows[0]?.season_id || null;
  const { data: run, error: runError } = await service
    .from('composition_training_runs')
    .insert({
      brain_key: 'composition',
      status: 'running',
      algorithm: 'logistic-regression-l2-semantic-context-v4',
      feature_schema_version: SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION,
      season_id: seasonId,
      dataset_fingerprint: fingerprint,
      dataset_rows: rows.length,
      total_matches: totalMatches,
      train_rows: train.length,
      validation_rows: validation.length,
      created_by: userId,
      started_at: new Date().toISOString()
    })
    .select('id')
    .single();

  if (runError) {
    const detail = runError.message || '';
    if (detail.includes('brain_emergency_')) return json({ error: 'brain_emergency_active', detail }, 423);
    if (runError.code === '23505') return json({ error: 'training_already_running' }, 409);
    return json({ error: 'run_create_failed', detail }, 500);
  }

  try {
    const weights = trainLogistic(train, SEMANTIC_CONTEXT_V4_FEATURE_NAMES.length);
    const globalRate = weightedRate(train);
    const baselineBrier = brier(validation, () => globalRate);
    const modelBrier = brier(validation, features => predict(weights, features));
    if (baselineBrier === null || modelBrier === null) throw new Error('validation_metric_unavailable');

    const trainingFeatureMeans = featureMeans(train);
    const validationFeatureMeans = featureMeans(validation);
    const passed = modelBrier < baselineBrier;
    const improvement = baselineBrier > 0 ? (baselineBrier - modelBrier) / baselineBrier : 0;
    const metrics = {
      executorVersion: 8,
      dataSource: 'composition_match_observations',
      sourceTrust: 'verified',
      observationProvenance: 'organic',
      organicTrainingOnly: ORGANIC_TRAINING_ONLY,
      featureSchemaVersion: SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION,
      semanticInterpreter: 'deterministic-ptbr-context-v4',
      featureCount: SEMANTIC_CONTEXT_V4_FEATURE_NAMES.length,
      minTrainRows,
      baselineBrier,
      modelBrier,
      globalRate,
      relativeImprovement: improvement,
      distinctTrios,
      trainRows: train.length,
      validationRows: validation.length,
      trainObservedUntil: train.at(-1)?.occurred_at || null,
      validationObservedFrom: validation[0]?.occurred_at || null,
      validationObservedUntil: validation.at(-1)?.occurred_at || null,
      featureNames: SEMANTIC_CONTEXT_V4_FEATURE_NAMES,
      trainingFeatureMeans,
      validationFeatureMeans
    };

    if (!passed) {
      await service.from('composition_training_runs').update({
        status: 'rejected',
        passed_validation: false,
        baseline_brier: baselineBrier,
        model_brier: modelBrier,
        metrics,
        completed_at: new Date().toISOString(),
        notes: 'Candidato Semantic Context v4 rejeitado: não superou a baseline no holdout temporal verificado e explicitamente orgânico.'
      }).eq('id', run.id).eq('status', 'running');
      return json({ ok: true, status: 'rejected', runId: run.id, metrics });
    }

    const { data: lastModel, error: lastError } = await service
      .from('composition_model_versions')
      .select('version')
      .eq('brain_key', 'composition')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) throw lastError;

    const version = (Number(lastModel?.version) || 0) + 1;
    const maxInfluence = clamp(Number(settings.max_influence) || .35, 0, .55);
    const recommendedInfluence = Math.min(maxInfluence, clamp(.10 + improvement, .10, .35));
    const { data: model, error: modelError } = await service
      .from('composition_model_versions')
      .insert({
        brain_key: 'composition',
        version,
        status: 'candidate',
        algorithm: 'logistic-regression-l2-semantic-context-v4',
        feature_schema_version: SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION,
        season_id: seasonId,
        dataset_fingerprint: fingerprint,
        dataset_rows: rows.length,
        total_matches: totalMatches,
        influence_weight: recommendedInfluence,
        passed_validation: true,
        weights: { featureNames: SEMANTIC_CONTEXT_V4_FEATURE_NAMES, intercept: weights[0], coefficients: weights.slice(1) },
        metrics,
        created_by: userId,
        notes: 'Echo Brain Semantic Context v4: fonte explicitamente orgânica, sem feedback-loop; preserva schemas anteriores e exige Shadow, Replay e promoção manual.'
      })
      .select('id,version,status,influence_weight,feature_schema_version')
      .single();
    if (modelError) throw modelError;

    const { error: finishError } = await service.from('composition_training_runs').update({
      status: 'succeeded',
      passed_validation: true,
      baseline_brier: baselineBrier,
      model_brier: modelBrier,
      candidate_model_id: model.id,
      metrics,
      completed_at: new Date().toISOString(),
      notes: 'Candidato Semantic Context v4 validado em holdout temporal orgânico; aguarda backtest, shadow e promoção manual.'
    }).eq('id', run.id).eq('status', 'running');
    if (finishError) throw finishError;

    return json({ ok: true, status: 'candidate', runId: run.id, model, metrics });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await service.from('composition_training_runs').update({
      status: 'failed', error_message: message, completed_at: new Date().toISOString()
    }).eq('id', run.id).eq('status', 'running');
    if (message.includes('brain_emergency_')) return json({ error: 'brain_emergency_active', detail: message, runId: run.id }, 423);
    return json({ error: 'training_failed', detail: message, runId: run.id }, 500);
  }
});
