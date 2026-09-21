-- Echo Brain final — pipeline de observações, Shadow Mode e Replay/Backtest.
-- Nenhum resultado, modelo, previsão ou backtest é criado por esta migration.

alter table public.echo_brain_settings
  add column if not exists shadow_mode_enabled boolean not null default false,
  add column if not exists organic_training_only boolean not null default true,
  add column if not exists min_shadow_matches integer not null default 60 check (min_shadow_matches >= 1),
  add column if not exists min_backtest_matches integer not null default 30 check (min_backtest_matches >= 1);

create table if not exists public.composition_observation_batches (
  id uuid primary key default gen_random_uuid(),
  brain_key text not null default 'composition' check (brain_key = 'composition'),
  source_name text not null check (length(trim(source_name)) >= 2),
  source_type text not null check (source_type in ('official','partner','admin_import','manual_verified')),
  source_ref text,
  trust_level text not null check (trust_level in ('verified','corroborated','review')),
  season_id uuid not null references public.seasons(id) on delete restrict,
  batch_fingerprint text not null unique,
  rows_received integer not null default 0 check (rows_received >= 0),
  rows_accepted integer not null default 0 check (rows_accepted >= 0),
  rows_duplicate integer not null default 0 check (rows_duplicate >= 0),
  imported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.composition_match_observations (
  id uuid primary key default gen_random_uuid(),
  brain_key text not null default 'composition' check (brain_key = 'composition'),
  batch_id uuid not null references public.composition_observation_batches(id) on delete restrict,
  source_name text not null,
  external_match_key text not null check (length(trim(external_match_key)) >= 1),
  trust_level text not null check (trust_level in ('verified','corroborated','review')),
  season_id uuid not null references public.seasons(id) on delete restrict,
  hero_1_id uuid not null references public.heroes(id) on delete restrict,
  hero_2_id uuid not null references public.heroes(id) on delete restrict,
  hero_3_id uuid not null references public.heroes(id) on delete restrict,
  opponent_1_id uuid references public.heroes(id) on delete restrict,
  opponent_2_id uuid references public.heroes(id) on delete restrict,
  opponent_3_id uuid references public.heroes(id) on delete restrict,
  outcome text not null check (outcome in ('win','loss')),
  recommended_by_brain boolean not null default false,
  recommendation_model_id uuid references public.composition_model_versions(id) on delete set null,
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_name, external_match_key),
  check (hero_1_id <> hero_2_id and hero_1_id <> hero_3_id and hero_2_id <> hero_3_id),
  check (hero_1_id::text < hero_2_id::text and hero_2_id::text < hero_3_id::text),
  check (not recommended_by_brain or recommendation_model_id is not null)
);
create index if not exists composition_match_observations_season_time on public.composition_match_observations(season_id, occurred_at, id);
create index if not exists composition_match_observations_training on public.composition_match_observations(trust_level, recommended_by_brain, season_id, occurred_at);
create index if not exists composition_match_observations_team on public.composition_match_observations(hero_1_id,hero_2_id,hero_3_id,season_id);

create table if not exists public.composition_shadow_predictions (
  id uuid primary key default gen_random_uuid(),
  brain_key text not null default 'composition' check (brain_key = 'composition'),
  observation_id uuid not null references public.composition_match_observations(id) on delete cascade,
  model_id uuid not null references public.composition_model_versions(id) on delete cascade,
  model_role text not null check (model_role in ('champion','challenger')),
  predicted_win_probability numeric(8,7) not null check (predicted_win_probability >= 0 and predicted_win_probability <= 1),
  functional_score numeric(8,7) check (functional_score is null or (functional_score >= 0 and functional_score <= 1)),
  created_at timestamptz not null default now(),
  unique (observation_id, model_id)
);
create index if not exists composition_shadow_predictions_model on public.composition_shadow_predictions(model_id, created_at desc);

create table if not exists public.composition_backtest_runs (
  id uuid primary key default gen_random_uuid(),
  brain_key text not null default 'composition' check (brain_key = 'composition'),
  target_model_id uuid not null references public.composition_model_versions(id) on delete restrict,
  champion_model_id uuid references public.composition_model_versions(id) on delete restrict,
  season_id uuid references public.seasons(id) on delete set null,
  status text not null check (status in ('running','succeeded','not_ready','failed')),
  window_start timestamptz,
  window_end timestamptz,
  observation_count integer not null default 0 check (observation_count >= 0),
  dataset_fingerprint text,
  metrics jsonb not null default '{}'::jsonb,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists composition_backtest_runs_created on public.composition_backtest_runs(created_at desc);

create table if not exists public.composition_backtest_results (
  run_id uuid not null references public.composition_backtest_runs(id) on delete cascade,
  model_id uuid not null references public.composition_model_versions(id) on delete cascade,
  model_role text not null check (model_role in ('champion','challenger')),
  matches integer not null check (matches >= 0),
  brier numeric,
  accuracy numeric,
  calibration_gap numeric,
  mean_prediction numeric,
  created_at timestamptz not null default now(),
  primary key (run_id, model_id)
);

alter table public.composition_observation_batches enable row level security;
alter table public.composition_match_observations enable row level security;
alter table public.composition_shadow_predictions enable row level security;
alter table public.composition_backtest_runs enable row level security;
alter table public.composition_backtest_results enable row level security;
revoke all on table public.composition_observation_batches from anon, authenticated;
revoke all on table public.composition_match_observations from anon, authenticated;
revoke all on table public.composition_shadow_predictions from anon, authenticated;
revoke all on table public.composition_backtest_runs from anon, authenticated;
revoke all on table public.composition_backtest_results from anon, authenticated;

alter table public.echo_brain_actions drop constraint if exists echo_brain_actions_action_type_check;
alter table public.echo_brain_actions add constraint echo_brain_actions_action_type_check
  check (action_type in ('promote','rollback','runtime_update','evaluate','suspend','emergency_on','emergency_off','ingest','shadow','backtest'));

create or replace function public.admin_echo_brain_ingest_observations(
  p_source_name text,
  p_source_type text,
  p_source_ref text,
  p_trust_level text,
  p_season_id uuid,
  p_observations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch_id uuid;
  v_fingerprint text;
  v_rows_received integer;
  v_rows_accepted integer := 0;
  v_rows_duplicate integer := 0;
  v_item jsonb;
  v_heroes uuid[];
  v_sorted uuid[];
  v_opponents uuid[];
  v_sorted_opponents uuid[];
  v_match_key text;
  v_outcome text;
  v_occurred_at timestamptz;
  v_recommended boolean;
  v_recommendation_model uuid;
  v_inserted uuid;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if coalesce(length(trim(p_source_name)),0) < 2 then raise exception 'source_name_required'; end if;
  if p_source_type not in ('official','partner','admin_import','manual_verified') then raise exception 'invalid_source_type'; end if;
  if p_trust_level not in ('verified','corroborated','review') then raise exception 'invalid_trust_level'; end if;
  if p_season_id is null or not exists(select 1 from public.seasons where id=p_season_id) then raise exception 'valid_season_required'; end if;
  if jsonb_typeof(p_observations) <> 'array' then raise exception 'observations_array_required'; end if;
  v_rows_received := jsonb_array_length(p_observations);
  if v_rows_received < 1 or v_rows_received > 5000 then raise exception 'observation_batch_size_invalid'; end if;

  v_fingerprint := encode(digest(concat_ws('|',trim(p_source_name),coalesce(trim(p_source_ref),''),p_season_id::text,p_observations::text),'sha256'),'hex');
  select id into v_batch_id from public.composition_observation_batches where batch_fingerprint=v_fingerprint;
  if found then return jsonb_build_object('status','duplicate_batch','batch_id',v_batch_id,'rows_received',v_rows_received); end if;

  insert into public.composition_observation_batches(source_name,source_type,source_ref,trust_level,season_id,batch_fingerprint,rows_received,imported_by)
  values(trim(p_source_name),p_source_type,nullif(trim(coalesce(p_source_ref,'')),''),p_trust_level,p_season_id,v_fingerprint,v_rows_received,auth.uid())
  returning id into v_batch_id;

  for v_item in select value from jsonb_array_elements(p_observations)
  loop
    v_match_key := trim(coalesce(v_item->>'matchKey',''));
    v_outcome := lower(trim(coalesce(v_item->>'outcome','')));
    if length(v_match_key)<1 then raise exception 'match_key_required'; end if;
    if v_outcome not in ('win','loss') then raise exception 'invalid_outcome:%',v_match_key; end if;
    begin v_occurred_at := (v_item->>'occurredAt')::timestamptz; exception when others then raise exception 'invalid_occurred_at:%',v_match_key; end;
    if v_occurred_at > now() + interval '5 minutes' then raise exception 'future_observation:%',v_match_key; end if;

    select array_agg(value::uuid order by value) into v_sorted
    from jsonb_array_elements_text(v_item->'heroes') as x(value);
    if coalesce(array_length(v_sorted,1),0)<>3 or v_sorted[1]=v_sorted[2] or v_sorted[1]=v_sorted[3] or v_sorted[2]=v_sorted[3] then raise exception 'three_distinct_heroes_required:%',v_match_key; end if;
    if (select count(*) from public.heroes where id=any(v_sorted) and enabled=true)<>3 then raise exception 'active_heroes_required:%',v_match_key; end if;

    v_sorted_opponents := null;
    if v_item ? 'opponents' and jsonb_typeof(v_item->'opponents')='array' and jsonb_array_length(v_item->'opponents')>0 then
      select array_agg(value::uuid order by value) into v_sorted_opponents from jsonb_array_elements_text(v_item->'opponents') as x(value);
      if array_length(v_sorted_opponents,1)<>3 or v_sorted_opponents[1]=v_sorted_opponents[2] or v_sorted_opponents[1]=v_sorted_opponents[3] or v_sorted_opponents[2]=v_sorted_opponents[3] then raise exception 'three_distinct_opponents_required:%',v_match_key; end if;
      if (select count(*) from public.heroes where id=any(v_sorted_opponents) and enabled=true)<>3 then raise exception 'active_opponents_required:%',v_match_key; end if;
    end if;

    v_recommended := coalesce((v_item->>'recommendedByBrain')::boolean,false);
    v_recommendation_model := nullif(v_item->>'recommendationModelId','')::uuid;
    if v_recommended and v_recommendation_model is null then raise exception 'recommendation_model_required:%',v_match_key; end if;
    if v_recommendation_model is not null and not exists(select 1 from public.composition_model_versions where id=v_recommendation_model) then raise exception 'recommendation_model_unknown:%',v_match_key; end if;

    v_inserted := null;
    insert into public.composition_match_observations(batch_id,source_name,external_match_key,trust_level,season_id,hero_1_id,hero_2_id,hero_3_id,opponent_1_id,opponent_2_id,opponent_3_id,outcome,recommended_by_brain,recommendation_model_id,occurred_at,metadata)
    values(v_batch_id,trim(p_source_name),v_match_key,p_trust_level,p_season_id,v_sorted[1],v_sorted[2],v_sorted[3],v_sorted_opponents[1],v_sorted_opponents[2],v_sorted_opponents[3],v_outcome,v_recommended,v_recommendation_model,v_occurred_at,coalesce(v_item->'metadata','{}'::jsonb))
    on conflict(source_name,external_match_key) do nothing returning id into v_inserted;
    if v_inserted is null then v_rows_duplicate:=v_rows_duplicate+1; else v_rows_accepted:=v_rows_accepted+1; end if;
  end loop;

  update public.composition_observation_batches set rows_accepted=v_rows_accepted,rows_duplicate=v_rows_duplicate where id=v_batch_id;
  insert into public.echo_brain_actions(action_type,actor_id,reason,details)
  values('ingest',auth.uid(),trim(p_source_name),jsonb_build_object('batch_id',v_batch_id,'trust_level',p_trust_level,'rows_received',v_rows_received,'rows_accepted',v_rows_accepted,'rows_duplicate',v_rows_duplicate,'season_id',p_season_id));
  return jsonb_build_object('status','ingested','batch_id',v_batch_id,'rows_received',v_rows_received,'rows_accepted',v_rows_accepted,'rows_duplicate',v_rows_duplicate);
end;
$$;

-- Snapshot final: acrescenta pipeline, Shadow Mode e Replay/Backtest sem expor tabelas diretamente.
create or replace function public.admin_echo_brain_registry_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings jsonb; v_models jsonb; v_runs jsonb; v_activations jsonb; v_evaluations jsonb; v_actions jsonb;
  v_pipeline jsonb; v_shadow jsonb; v_backtests jsonb; v_backtest_results jsonb;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  select to_jsonb(s) into v_settings from public.echo_brain_settings s where s.brain_key='composition';
  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc),'[]'::jsonb) into v_models from (select id,brain_key,version,status,algorithm,feature_schema_version,season_id,dataset_fingerprint,dataset_rows,total_matches,influence_weight,passed_validation,weights,metrics,notes,created_at,activated_at,retired_at from public.composition_model_versions where brain_key='composition' order by created_at desc limit 25)m;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb) into v_runs from (select id,brain_key,status,algorithm,feature_schema_version,season_id,dataset_fingerprint,dataset_rows,total_matches,train_rows,validation_rows,baseline_brier,model_brier,passed_validation,candidate_model_id,metrics,error_message,notes,created_at,started_at,completed_at from public.composition_training_runs where brain_key='composition' order by created_at desc limit 25)r;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.activated_at desc),'[]'::jsonb) into v_activations from (select id,model_id,previous_model_id,activation_kind,reason,activated_at,deactivated_at from public.composition_model_activations where brain_key='composition' order by activated_at desc limit 25)a;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.evaluated_at desc),'[]'::jsonb) into v_evaluations from (select id,activation_id,model_id,season_id,status,observed_trios,new_matches,new_wins,model_brier,baseline_brier,performance_gap,feature_drift_score,details,evaluated_at from public.composition_model_evaluations where brain_key='composition' order by evaluated_at desc limit 25)e;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_actions from (select id,action_type,model_id,previous_model_id,actor_id,reason,details,created_at from public.echo_brain_actions where brain_key='composition' order by created_at desc limit 40)x;

  select jsonb_build_object(
    'batches',(select count(*) from public.composition_observation_batches),
    'observations',(select count(*) from public.composition_match_observations),
    'verifiedObservations',(select count(*) from public.composition_match_observations where trust_level='verified'),
    'organicVerifiedObservations',(select count(*) from public.composition_match_observations where trust_level='verified' and recommended_by_brain=false),
    'brainInfluencedObservations',(select count(*) from public.composition_match_observations where recommended_by_brain=true),
    'distinctOrganicTrios',(select count(distinct concat_ws('|',season_id::text,hero_1_id::text,hero_2_id::text,hero_3_id::text)) from public.composition_match_observations where trust_level='verified' and recommended_by_brain=false),
    'latestBatch',(select to_jsonb(b) from (select id,source_name,source_type,trust_level,season_id,rows_received,rows_accepted,rows_duplicate,created_at from public.composition_observation_batches order by created_at desc limit 1)b)
  ) into v_pipeline;

  select jsonb_build_object(
    'total',(select count(*) from public.composition_shadow_predictions),
    'champion',(select count(*) from public.composition_shadow_predictions where model_role='champion'),
    'challenger',(select count(*) from public.composition_shadow_predictions where model_role='challenger'),
    'byModel',coalesce((select jsonb_agg(to_jsonb(s) order by s.matches desc) from (select p.model_id,p.model_role,count(*)::int matches,avg(power(p.predicted_win_probability-(case when o.outcome='win' then 1 else 0 end),2)) brier,avg(p.predicted_win_probability) mean_prediction,avg(case when o.outcome='win' then 1.0 else 0.0 end) observed_rate from public.composition_shadow_predictions p join public.composition_match_observations o on o.id=p.observation_id group by p.model_id,p.model_role)s),'[]'::jsonb)
  ) into v_shadow;

  select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc),'[]'::jsonb) into v_backtests from (select id,target_model_id,champion_model_id,season_id,status,window_start,window_end,observation_count,dataset_fingerprint,metrics,error_message,created_at,completed_at from public.composition_backtest_runs order by created_at desc limit 20)b;
  select coalesce(jsonb_agg(to_jsonb(br) order by br.created_at desc),'[]'::jsonb) into v_backtest_results from (select run_id,model_id,model_role,matches,brier,accuracy,calibration_gap,mean_prediction,created_at from public.composition_backtest_results order by created_at desc limit 50)br;

  return jsonb_build_object('settings',v_settings,'models',v_models,'trainingRuns',v_runs,'activations',v_activations,'evaluations',v_evaluations,'actions',v_actions,'pipeline',v_pipeline,'shadow',v_shadow,'backtests',v_backtests,'backtestResults',v_backtest_results);
end;
$$;

-- Emergência também bloqueia processamento shadow/backtest, mas não interrompe ingestão de fatos observacionais.
create or replace function public.echo_brain_guard_processing_during_emergency()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if coalesce((select emergency_enabled from public.echo_brain_settings where brain_key='composition'),false) then raise exception 'brain_emergency_active'; end if;
  return new;
end;$$;
drop trigger if exists echo_brain_emergency_shadow_guard on public.composition_shadow_predictions;
create trigger echo_brain_emergency_shadow_guard before insert on public.composition_shadow_predictions for each row execute function public.echo_brain_guard_processing_during_emergency();
drop trigger if exists echo_brain_emergency_backtest_guard on public.composition_backtest_runs;
create trigger echo_brain_emergency_backtest_guard before insert on public.composition_backtest_runs for each row execute function public.echo_brain_guard_processing_during_emergency();
drop trigger if exists echo_brain_emergency_backtest_result_guard on public.composition_backtest_results;
create trigger echo_brain_emergency_backtest_result_guard before insert on public.composition_backtest_results for each row execute function public.echo_brain_guard_processing_during_emergency();

revoke all on function public.admin_echo_brain_ingest_observations(text,text,text,text,uuid,jsonb) from public,anon;
grant execute on function public.admin_echo_brain_ingest_observations(text,text,text,text,uuid,jsonb) to authenticated;
