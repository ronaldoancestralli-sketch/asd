import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import {
  brier,
  featureNamesForSchemaV4 as featureNamesForSchema,
  featureVectorV4 as featureVector,
  isSupportedFeatureSchemaV4 as isSupportedFeatureSchema,
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

async function fetchObservations(seasonId: string | null, createdBefore: string) {
  const rows: any[] = [], pageSize = 1000;
  let from = 0;
  while (from < 20000) {
    let query = service.from('composition_match_observations')
      .select('id,season_id,hero_1_id,hero_2_id,hero_3_id,outcome,trust_level,recommended_by_brain,observation_provenance,occurred_at,created_at')
      .eq('trust_level', 'verified')
      .lte('created_at', createdBefore)
      .order('occurred_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
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

function weightsFor(model: any) {
  const schema = String(model?.feature_schema_version || '');
  if (!isSupportedFeatureSchema(schema)) return null;
  const expected = featureNamesForSchema(schema);
  return validateModelSpecV4(model, schema, expected);
}

function evaluateModel(model: any, rows: any[]) {
  const spec = weightsFor(model);
  if (!spec) return null;
  const materialized = rows.map(row => ({ ...row, features: featureVector(row.team, spec.schema) }));
  const score = brier(materialized, features => predict(spec.weights, features));
  let correct = 0, sumPred = 0, sumObs = 0;
  for (const row of materialized) {
    const pred = predict(spec.weights, row.features), target = row.target;
    if ((pred >= .5) === (target === 1)) correct++;
    sumPred += pred;
    sumObs += target;
  }
  const meanPrediction = materialized.length ? sumPred / materialized.length : 0;
  const observedRate = materialized.length ? sumObs / materialized.length : 0;
  return {
    modelId: model.id,
    version: model.version,
    featureSchema: spec.schema,
    matches: materialized.length,
    brier: score,
    accuracy: materialized.length ? correct / materialized.length : null,
    calibrationGap: Math.abs(meanPrediction - observedRate),
    meanPrediction,
    observedRate
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const userId = await authorize(req);
  if (!userId) return json({ error: 'admin_required' }, 403);

  let body: any = {};
  try { body = await req.json(); } catch {}

  const { data: settings, error: settingsError } = await service.from('echo_brain_settings').select('*').eq('brain_key', 'composition').single();
  if (settingsError) return json({ error: 'settings_unavailable', detail: settingsError.message }, 500);
  if (settings?.emergency_enabled === true) return json({ error: 'brain_emergency_active', reason: settings.emergency_reason || null }, 423);

  let targetQuery = service.from('composition_model_versions').select('*').eq('passed_validation', true);
  if (body?.targetModelId) targetQuery = targetQuery.eq('id', body.targetModelId);
  else targetQuery = targetQuery.eq('status', 'candidate').order('version', { ascending: false }).limit(1);
  const { data: targetRows, error: targetError } = await targetQuery;
  if (targetError) return json({ error: 'model_unavailable', detail: targetError.message }, 500);
  const target = Array.isArray(targetRows) ? targetRows[0] : targetRows;
  if (!target) return json({ error: 'validated_candidate_required' }, 409);
  if (!isSupportedFeatureSchema(String(target.feature_schema_version || ''))) {
    return json({ error: 'unsupported_target_schema', received: target.feature_schema_version }, 409);
  }

  const championId = settings.active_model_id && settings.active_model_id !== target.id ? settings.active_model_id : null;
  let champion: any = null;
  if (championId) {
    const { data, error } = await service.from('composition_model_versions').select('*').eq('id', championId).eq('passed_validation', true).maybeSingle();
    if (error) return json({ error: 'champion_unavailable', detail: error.message }, 500);
    champion = data || null;
  }

  const validationRows = Math.max(0, Number(target.metrics?.validationRows) || 0);
  const organicOnly = true;
  if (validationRows < 1) return json({ error: 'model_validation_window_missing' }, 409);

  const observationsResult = await fetchObservations(target.season_id || null, target.created_at);
  if (observationsResult.error) return json({ error: 'observations_unavailable', detail: observationsResult.error.message }, 500);
  let source = (observationsResult.rows || []) as any[];
  source = source.filter(row => row.recommended_by_brain !== true && row.observation_provenance === 'organic');

  const fingerprintSchema = String(target.feature_schema_version || '');
  const reconstructedFingerprint = await sha256(source.map(row => `${row.id}:${row.outcome === 'win' ? 1 : 0}:${row.occurred_at}:${fingerprintSchema}`).join('\n'));
  const legacyFingerprint = await sha256(source.map(row => `${row.id}:${row.outcome === 'win' ? 1 : 0}:${row.occurred_at}`).join('\n'));
  if (reconstructedFingerprint !== target.dataset_fingerprint && legacyFingerprint !== target.dataset_fingerprint) {
    return json({ error: 'dataset_reconstruction_mismatch', expected: target.dataset_fingerprint, received: reconstructedFingerprint, observations: source.length, provenance: 'explicit_organic_only' }, 409);
  }

  const replay = source.slice(Math.max(0, source.length - validationRows));
  const minMatches = Math.max(1, Number(settings.min_backtest_matches) || 30);
  if (replay.length < minMatches) return json({ error: 'not_ready', readiness: { matches: replay.length, minMatches, validationRows, provenance: 'explicit_organic_only' } }, 409);

  const [
    { data: heroes, error: heroesError },
    { data: skills, error: skillsError }
  ] = await Promise.all([
    service.from('heroes').select('id,name,class_id,enabled').eq('enabled', true),
    service.from('hero_skills').select('id,hero_id,name,description,skill_type,cooldown,duration,enabled,verification_status,needs_recheck').eq('enabled', true)
  ]);
  if (heroesError || skillsError) return json({ error: 'feature_sources_unavailable', detail: (heroesError || skillsError)!.message }, 500);

  const skillsByHero = new Map<string, any[]>();
  for (const skill of skills || []) {
    if (!skillsByHero.has(skill.hero_id)) skillsByHero.set(skill.hero_id, []);
    skillsByHero.get(skill.hero_id)!.push(skill);
  }
  const heroesById = new Map((heroes || []).map((hero: any) => [hero.id, { ...hero, skills: skillsByHero.get(hero.id) || [] }]));

  const rows: any[] = [];
  for (const observation of replay) {
    const ids = [observation.hero_1_id, observation.hero_2_id, observation.hero_3_id];
    const team = ids.map(id => heroesById.get(id)).filter(Boolean);
    if (team.length !== 3 || new Set(ids).size !== 3) continue;
    rows.push({ matches: 1, target: observation.outcome === 'win' ? 1 : 0, team, source: observation });
  }
  if (rows.length < minMatches) return json({ error: 'not_ready', reason: 'feature_eligible_matches_below_minimum', readiness: { matches: rows.length, minMatches, provenance: 'explicit_organic_only' } }, 409);

  const windowStart = rows[0]?.source?.occurred_at || null;
  const windowEnd = rows.at(-1)?.source?.occurred_at || null;
  const datasetFingerprint = await sha256(rows.map(row => `${row.source.id}:${row.target}:${row.source.occurred_at}:${fingerprintSchema}`).join('\n'));
  const { data: run, error: runError } = await service.from('composition_backtest_runs').insert({
    brain_key: 'composition',
    target_model_id: target.id,
    champion_model_id: champion?.id || null,
    season_id: target.season_id || null,
    status: 'running',
    window_start: windowStart,
    window_end: windowEnd,
    observation_count: rows.length,
    dataset_fingerprint: datasetFingerprint,
    created_by: userId
  }).select('id').single();

  if (runError) {
    const detail = runError.message || '';
    if (detail.includes('brain_emergency_')) return json({ error: 'brain_emergency_active', detail }, 423);
    return json({ error: 'backtest_run_create_failed', detail }, 500);
  }

  try {
    const targetResult = evaluateModel(target, rows);
    if (!targetResult) throw new Error('target_model_incompatible');
    const results: any[] = [{ ...targetResult, role: target.id === settings.active_model_id ? 'champion' : 'challenger' }];
    if (champion) {
      const championResult = evaluateModel(champion, rows);
      if (championResult) results.push({ ...championResult, role: 'champion' });
    }

    for (const result of results) {
      const { error } = await service.from('composition_backtest_results').insert({
        run_id: run.id,
        model_id: result.modelId,
        model_role: result.role,
        matches: result.matches,
        brier: result.brier,
        accuracy: result.accuracy,
        calibration_gap: result.calibrationGap,
        mean_prediction: result.meanPrediction
      });
      if (error) throw error;
    }

    const observedRate = results[0]?.observedRate ?? null;
    const metrics = {
      executorVersion: 5,
      historicalReplay: true,
      exactTrainingFingerprint: true,
      organicOnly,
      observationProvenance: 'organic',
      observedRate,
      crossSchemaComparison: true,
      models: results.map(({ observedRate: _o, ...rest }) => rest)
    };
    const { error: finishError } = await service.from('composition_backtest_runs').update({
      status: 'succeeded', metrics, completed_at: new Date().toISOString()
    }).eq('id', run.id);
    if (finishError) throw finishError;

    await service.from('echo_brain_actions').insert({
      brain_key: 'composition',
      action_type: 'backtest',
      model_id: target.id,
      previous_model_id: champion?.id || null,
      actor_id: userId,
      details: { run_id: run.id, matches: rows.length, historical_replay: true, zero_public_influence: true, cross_schema_comparison: true, provenance: 'explicit_organic_only' }
    });

    return json({ ok: true, status: 'succeeded', runId: run.id, window: { start: windowStart, end: windowEnd, matches: rows.length }, provenance: 'explicit_organic_only', results });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await service.from('composition_backtest_runs').update({
      status: 'failed', error_message: detail, completed_at: new Date().toISOString()
    }).eq('id', run.id);
    if (detail.includes('brain_emergency_')) return json({ error: 'brain_emergency_active', detail, runId: run.id }, 423);
    return json({ error: 'backtest_failed', detail, runId: run.id }, 500);
  }
});
