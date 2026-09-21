import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import {
  featureNamesForSchemaV4 as featureNamesForSchema,
  featureVectorV4 as featureVector,
  isSupportedFeatureSchemaV4 as isSupportedFeatureSchema,
  predict
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

async function fetchPaged(table: string, select: string, configure: (q: any) => any, max = 20000) {
  const rows: any[] = [], pageSize = 1000;
  let from = 0;
  while (from < max) {
    let q = service.from(table).select(select).order('created_at', { ascending: true }).range(from, from + pageSize - 1);
    q = configure(q);
    const { data, error } = await q;
    if (error) return { rows: [], error };
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return { rows, error: null };
}

function modelWeights(model: any) {
  const schema = String(model?.feature_schema_version || '');
  if (!isSupportedFeatureSchema(schema)) return null;
  const expected = featureNamesForSchema(schema);
  return validateModelSpecV4(model, schema, expected);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const userId = await authorize(req);
  if (!userId) return json({ error: 'admin_required' }, 403);

  const [
    { data: settings, error: settingsError },
    { data: models, error: modelsError },
    { data: heroes, error: heroesError },
    { data: skills, error: skillsError }
  ] = await Promise.all([
    service.from('echo_brain_settings').select('*').eq('brain_key', 'composition').single(),
    service.from('composition_model_versions').select('*').eq('passed_validation', true).in('status', ['active', 'candidate']).order('version', { ascending: false }).limit(10),
    service.from('heroes').select('id,name,class_id,enabled').eq('enabled', true),
    service.from('hero_skills').select('id,hero_id,name,description,skill_type,cooldown,duration,enabled,verification_status,needs_recheck').eq('enabled', true)
  ]);
  const sourceError = settingsError || modelsError || heroesError || skillsError;
  if (sourceError) return json({ error: 'source_unavailable', detail: sourceError.message }, 500);
  if (settings?.emergency_enabled === true) return json({ error: 'brain_emergency_active', reason: settings.emergency_reason || null }, 423);
  if (settings?.shadow_mode_enabled !== true) return json({ error: 'shadow_mode_disabled' }, 409);

  const champion = (models || []).find((m: any) => m.id === settings.active_model_id) || null;
  const candidates = (models || []).filter((m: any) => m.status === 'candidate').slice(0, 3);
  const selected = [...(champion ? [champion] : []), ...candidates.filter((m: any) => m.id !== champion?.id)];
  if (!selected.length) return json({ error: 'shadow_models_required' }, 409);

  const organicOnly = true;
  const observationsResult = await fetchPaged(
    'composition_match_observations',
    'id,season_id,hero_1_id,hero_2_id,hero_3_id,outcome,trust_level,recommended_by_brain,observation_provenance,occurred_at,created_at',
    q => {
      return q.eq('trust_level', 'verified')
        .eq('recommended_by_brain', false).eq('observation_provenance', 'organic');
    }
  );
  if (observationsResult.error) return json({ error: 'observations_unavailable', detail: observationsResult.error.message }, 500);

  const skillsByHero = new Map<string, any[]>();
  for (const skill of skills || []) {
    if (!skillsByHero.has(skill.hero_id)) skillsByHero.set(skill.hero_id, []);
    skillsByHero.get(skill.hero_id)!.push(skill);
  }
  const heroesById = new Map((heroes || []).map((hero: any) => [hero.id, { ...hero, skills: skillsByHero.get(hero.id) || [] }]));

  let totalInserted = 0;
  const modelResults: any[] = [];
  for (const model of selected) {
    const spec = modelWeights(model);
    if (!spec) {
      modelResults.push({ modelId: model.id, status: 'unsupported_model', featureSchema: model.feature_schema_version });
      continue;
    }

    const existingResult = await fetchPaged('composition_shadow_predictions', 'id,observation_id,model_id,created_at', q => q.eq('model_id', model.id));
    if (existingResult.error) return json({ error: 'shadow_history_unavailable', detail: existingResult.error.message }, 500);
    const existing = new Set(existingResult.rows.map((row: any) => row.observation_id));
    const eligible = (observationsResult.rows || []).filter((o: any) =>
      !existing.has(o.id) &&
      new Date(o.occurred_at).getTime() > new Date(model.created_at).getTime() &&
      (!model.season_id || o.season_id === model.season_id)
    ).slice(0, 5000);

    const inserts: any[] = [];
    for (const observation of eligible) {
      const ids = [observation.hero_1_id, observation.hero_2_id, observation.hero_3_id];
      const team = ids.map(id => heroesById.get(id)).filter(Boolean);
      if (team.length !== 3 || new Set(ids).size !== 3) continue;
      const features = featureVector(team, spec.schema);
      inserts.push({
        brain_key: 'composition',
        observation_id: observation.id,
        model_id: model.id,
        model_role: model.id === settings.active_model_id ? 'champion' : 'challenger',
        predicted_win_probability: predict(spec.weights, features),
        functional_score: features[0] ?? null
      });
    }

    let inserted = 0;
    for (let i = 0; i < inserts.length; i += 500) {
      const chunk = inserts.slice(i, i + 500);
      if (!chunk.length) continue;
      const { error } = await service.from('composition_shadow_predictions')
        .upsert(chunk, { onConflict: 'observation_id,model_id', ignoreDuplicates: true });
      if (error) {
        const detail = error.message || '';
        if (detail.includes('brain_emergency_')) return json({ error: 'brain_emergency_active', detail }, 423);
        return json({ error: 'shadow_write_failed', detail }, 500);
      }
      inserted += chunk.length;
    }

    totalInserted += inserted;
    modelResults.push({
      modelId: model.id,
      version: model.version,
      featureSchema: spec.schema,
      role: model.id === settings.active_model_id ? 'champion' : 'challenger',
      eligible: eligible.length,
      inserted
    });
  }

  await service.from('echo_brain_actions').insert({
    brain_key: 'composition',
    action_type: 'shadow',
    model_id: settings.active_model_id || selected[0]?.id || null,
    actor_id: userId,
    details: { inserted: totalInserted, models: modelResults, organicOnly, zero_public_influence: true, versioned_semantic_schema_compatible: true, provenance: 'explicit_organic_only' }
  });

  return json({ ok: true, status: 'shadow_processed', inserted: totalInserted, models: modelResults, organicOnly, learningEnabled: settings.learning_enabled === true, provenance: 'explicit_organic_only' });
});
