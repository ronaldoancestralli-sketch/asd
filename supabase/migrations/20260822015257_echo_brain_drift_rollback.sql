-- Echo Brain — ativações auditáveis, baseline pós-ativação, drift e rollback real.
-- Nenhum modelo é ativado por esta migration e nenhuma avaliação sintética é criada.

alter table public.echo_brain_settings
  add column if not exists min_evaluation_matches integer not null default 60 check (min_evaluation_matches >= 1),
  add column if not exists drift_feature_warn numeric(6,5) not null default 0.12 check (drift_feature_warn >= 0 and drift_feature_warn <= 1),
  add column if not exists drift_feature_critical numeric(6,5) not null default 0.22 check (drift_feature_critical >= 0 and drift_feature_critical <= 1),
  add column if not exists drift_brier_tolerance numeric(6,5) not null default 0.02 check (drift_brier_tolerance >= 0 and drift_brier_tolerance <= 1);

create table if not exists public.composition_model_activations (
  id uuid primary key default gen_random_uuid(),
  brain_key text not null default 'composition' check (brain_key = 'composition'),
  model_id uuid not null references public.composition_model_versions(id) on delete cascade,
  previous_model_id uuid references public.composition_model_versions(id) on delete set null,
  activation_kind text not null check (activation_kind in ('promotion','rollback','recovery')),
  reason text,
  activated_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz not null default now(),
  deactivated_at timestamptz
);

create unique index if not exists composition_model_activations_one_open
  on public.composition_model_activations (brain_key)
  where deactivated_at is null;
create index if not exists composition_model_activations_model
  on public.composition_model_activations (model_id, activated_at desc);

create table if not exists public.composition_model_activation_baselines (
  activation_id uuid not null references public.composition_model_activations(id) on delete cascade,
  team_synergy_id uuid not null references public.team_synergies(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete set null,
  baseline_matches integer not null default 0 check (baseline_matches >= 0),
  baseline_wins integer not null default 0 check (baseline_wins >= 0 and baseline_wins <= baseline_matches),
  captured_at timestamptz not null default now(),
  primary key (activation_id, team_synergy_id)
);
create index if not exists composition_model_activation_baselines_season
  on public.composition_model_activation_baselines (season_id);

create table if not exists public.composition_model_evaluations (
  id uuid primary key default gen_random_uuid(),
  brain_key text not null default 'composition' check (brain_key = 'composition'),
  activation_id uuid not null references public.composition_model_activations(id) on delete cascade,
  model_id uuid not null references public.composition_model_versions(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete set null,
  status text not null check (status in ('healthy','watch','drift')),
  observed_trios integer not null default 0 check (observed_trios >= 0),
  new_matches bigint not null default 0 check (new_matches >= 0),
  new_wins bigint not null default 0 check (new_wins >= 0 and new_wins <= new_matches),
  model_brier numeric,
  baseline_brier numeric,
  performance_gap numeric,
  feature_drift_score numeric,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  evaluated_at timestamptz not null default now()
);
create index if not exists composition_model_evaluations_model
  on public.composition_model_evaluations (model_id, evaluated_at desc);
create index if not exists composition_model_evaluations_status
  on public.composition_model_evaluations (status, evaluated_at desc);

create table if not exists public.echo_brain_actions (
  id uuid primary key default gen_random_uuid(),
  brain_key text not null default 'composition' check (brain_key = 'composition'),
  action_type text not null check (action_type in ('promote','rollback','runtime_update','evaluate','suspend')),
  model_id uuid references public.composition_model_versions(id) on delete set null,
  previous_model_id uuid references public.composition_model_versions(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists echo_brain_actions_created_at
  on public.echo_brain_actions (created_at desc);

alter table public.composition_model_activations enable row level security;
alter table public.composition_model_activation_baselines enable row level security;
alter table public.composition_model_evaluations enable row level security;
alter table public.echo_brain_actions enable row level security;

revoke all on table public.composition_model_activations from anon, authenticated;
revoke all on table public.composition_model_activation_baselines from anon, authenticated;
revoke all on table public.composition_model_evaluations from anon, authenticated;
revoke all on table public.echo_brain_actions from anon, authenticated;

-- Runtime passa a gerar trilha de auditoria, sem criar/promover modelos.
create or replace function public.admin_echo_brain_set_runtime(
  p_learning_enabled boolean,
  p_max_influence numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.echo_brain_settings%rowtype;
  v_model public.composition_model_versions%rowtype;
  v_next_influence numeric;
  v_before_enabled boolean;
  v_before_influence numeric;
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select * into v_settings
  from public.echo_brain_settings
  where brain_key = 'composition'
  for update;
  if not found then raise exception 'brain_settings_missing'; end if;

  v_before_enabled := v_settings.learning_enabled;
  v_before_influence := v_settings.max_influence;
  v_next_influence := coalesce(p_max_influence, v_settings.max_influence);
  if v_next_influence < 0 or v_next_influence > 0.55 then raise exception 'invalid_max_influence'; end if;

  if coalesce(p_learning_enabled, false) then
    if v_settings.active_model_id is null then raise exception 'active_model_required'; end if;
    select * into v_model from public.composition_model_versions where id = v_settings.active_model_id;
    if not found or v_model.status <> 'active' or v_model.passed_validation is not true then
      raise exception 'validated_active_model_required';
    end if;
  end if;

  update public.echo_brain_settings
  set learning_enabled = coalesce(p_learning_enabled, false),
      max_influence = v_next_influence,
      updated_by = auth.uid()
  where brain_key = 'composition'
  returning * into v_settings;

  insert into public.echo_brain_actions(action_type, model_id, actor_id, details)
  values ('runtime_update', v_settings.active_model_id, auth.uid(), jsonb_build_object(
    'learning_enabled_before', v_before_enabled,
    'learning_enabled_after', v_settings.learning_enabled,
    'max_influence_before', v_before_influence,
    'max_influence_after', v_settings.max_influence
  ));

  return to_jsonb(v_settings);
end;
$$;

-- Promoção agora abre uma ativação e captura os contadores que servirão de baseline de drift.
create or replace function public.admin_echo_brain_promote_model(p_model_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_model public.composition_model_versions%rowtype;
  v_run public.composition_training_runs%rowtype;
  v_settings public.echo_brain_settings%rowtype;
  v_previous uuid;
  v_activation_id uuid;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;

  select * into v_model from public.composition_model_versions where id = p_model_id for update;
  if not found then raise exception 'model_not_found'; end if;
  if v_model.status <> 'candidate' then raise exception 'candidate_required'; end if;
  if v_model.passed_validation is not true then raise exception 'validated_candidate_required'; end if;

  select * into v_run
  from public.composition_training_runs
  where candidate_model_id = p_model_id and status = 'succeeded' and passed_validation is true
  order by completed_at desc nulls last, created_at desc limit 1;
  if not found then raise exception 'successful_training_run_required'; end if;

  select * into v_settings from public.echo_brain_settings where brain_key = 'composition' for update;
  v_previous := v_settings.active_model_id;

  update public.composition_model_activations
  set deactivated_at = now()
  where brain_key = 'composition' and deactivated_at is null;

  update public.composition_model_versions
  set status = 'retired', retired_at = now()
  where brain_key = v_model.brain_key and status = 'active' and id <> p_model_id;

  update public.composition_model_versions
  set status = 'active', activated_at = now(), retired_at = null
  where id = p_model_id returning * into v_model;

  insert into public.composition_model_activations(model_id, previous_model_id, activation_kind, reason, activated_by)
  values (p_model_id, v_previous, 'promotion', 'Promoção manual de candidato validado.', auth.uid())
  returning id into v_activation_id;

  insert into public.composition_model_activation_baselines(activation_id, team_synergy_id, season_id, baseline_matches, baseline_wins)
  select v_activation_id, t.id, t.season_id, greatest(0, coalesce(t.matches,0)), greatest(0, coalesce(t.wins,0))
  from public.team_synergies t
  where v_model.season_id is null or t.season_id is not distinct from v_model.season_id;

  update public.echo_brain_settings
  set active_model_id = p_model_id, learning_enabled = false, updated_by = auth.uid()
  where brain_key = v_model.brain_key;

  insert into public.echo_brain_actions(action_type, model_id, previous_model_id, actor_id, details)
  values ('promote', p_model_id, v_previous, auth.uid(), jsonb_build_object('activation_id',v_activation_id,'learning_enabled',false));

  return jsonb_build_object('model',to_jsonb(v_model)-'weights','activation_id',v_activation_id,'learning_enabled',false,'message','model_promoted_with_kill_switch_off');
end;
$$;

-- Rollback só aceita uma versão previamente ativa e validada. A influência volta desligada.
create or replace function public.admin_echo_brain_rollback_model(p_target_model_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.composition_model_versions%rowtype;
  v_current public.composition_model_versions%rowtype;
  v_settings public.echo_brain_settings%rowtype;
  v_activation_id uuid;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  if coalesce(length(trim(p_reason)),0) < 6 then raise exception 'rollback_reason_required'; end if;

  select * into v_settings from public.echo_brain_settings where brain_key = 'composition' for update;
  if not found then raise exception 'brain_settings_missing'; end if;
  if v_settings.active_model_id = p_target_model_id then raise exception 'target_already_active'; end if;

  select * into v_target from public.composition_model_versions where id = p_target_model_id for update;
  if not found then raise exception 'model_not_found'; end if;
  if v_target.passed_validation is not true then raise exception 'validated_model_required'; end if;
  if v_target.status not in ('retired','suspended') then raise exception 'previously_active_model_required'; end if;
  if not exists(select 1 from public.composition_model_activations a where a.model_id = p_target_model_id) then
    raise exception 'activation_history_required';
  end if;

  if v_settings.active_model_id is not null then
    select * into v_current from public.composition_model_versions where id = v_settings.active_model_id for update;
  end if;

  update public.composition_model_activations set deactivated_at = now()
  where brain_key = 'composition' and deactivated_at is null;

  if v_settings.active_model_id is not null then
    update public.composition_model_versions set status='retired', retired_at=now()
    where id=v_settings.active_model_id;
  end if;

  update public.composition_model_versions
  set status='active', activated_at=now(), retired_at=null
  where id=p_target_model_id returning * into v_target;

  insert into public.composition_model_activations(model_id, previous_model_id, activation_kind, reason, activated_by)
  values (p_target_model_id, v_settings.active_model_id, 'rollback', trim(p_reason), auth.uid())
  returning id into v_activation_id;

  insert into public.composition_model_activation_baselines(activation_id, team_synergy_id, season_id, baseline_matches, baseline_wins)
  select v_activation_id, t.id, t.season_id, greatest(0,coalesce(t.matches,0)), greatest(0,coalesce(t.wins,0))
  from public.team_synergies t
  where v_target.season_id is null or t.season_id is not distinct from v_target.season_id;

  update public.echo_brain_settings
  set active_model_id=p_target_model_id, learning_enabled=false, updated_by=auth.uid()
  where brain_key='composition';

  insert into public.echo_brain_actions(action_type, model_id, previous_model_id, actor_id, reason, details)
  values ('rollback',p_target_model_id,v_settings.active_model_id,auth.uid(),trim(p_reason),jsonb_build_object('activation_id',v_activation_id,'learning_enabled',false));

  return jsonb_build_object('model',to_jsonb(v_target)-'weights','activation_id',v_activation_id,'learning_enabled',false,'message','rollback_completed_with_kill_switch_off');
end;
$$;

-- Snapshot administrativo v3: inclui pesos para explicabilidade e histórico operacional.
create or replace function public.admin_echo_brain_registry_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings jsonb; v_models jsonb; v_runs jsonb; v_activations jsonb; v_evaluations jsonb; v_actions jsonb;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;

  select to_jsonb(s) into v_settings from public.echo_brain_settings s where s.brain_key='composition';
  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc),'[]'::jsonb) into v_models
  from (select id,brain_key,version,status,algorithm,feature_schema_version,season_id,dataset_fingerprint,dataset_rows,total_matches,influence_weight,passed_validation,weights,metrics,notes,created_at,activated_at,retired_at from public.composition_model_versions where brain_key='composition' order by created_at desc limit 25) m;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb) into v_runs
  from (select id,brain_key,status,algorithm,feature_schema_version,season_id,dataset_fingerprint,dataset_rows,total_matches,train_rows,validation_rows,baseline_brier,model_brier,passed_validation,candidate_model_id,metrics,error_message,notes,created_at,started_at,completed_at from public.composition_training_runs where brain_key='composition' order by created_at desc limit 25) r;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.activated_at desc),'[]'::jsonb) into v_activations
  from (select id,model_id,previous_model_id,activation_kind,reason,activated_at,deactivated_at from public.composition_model_activations where brain_key='composition' order by activated_at desc limit 25) a;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.evaluated_at desc),'[]'::jsonb) into v_evaluations
  from (select id,activation_id,model_id,season_id,status,observed_trios,new_matches,new_wins,model_brier,baseline_brier,performance_gap,feature_drift_score,details,evaluated_at from public.composition_model_evaluations where brain_key='composition' order by evaluated_at desc limit 25) e;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_actions
  from (select id,action_type,model_id,previous_model_id,reason,details,created_at from public.echo_brain_actions where brain_key='composition' order by created_at desc limit 40) x;

  return jsonb_build_object('settings',coalesce(v_settings,'{}'::jsonb),'models',coalesce(v_models,'[]'::jsonb),'trainingRuns',coalesce(v_runs,'[]'::jsonb),'activations',coalesce(v_activations,'[]'::jsonb),'evaluations',coalesce(v_evaluations,'[]'::jsonb),'actions',coalesce(v_actions,'[]'::jsonb));
end;
$$;

revoke all on function public.admin_echo_brain_rollback_model(uuid,text) from public, anon;
grant execute on function public.admin_echo_brain_rollback_model(uuid,text) to authenticated;

comment on table public.composition_model_activations is 'Echo Brain: cada promoção/rollback abre uma ativação auditável.';
comment on table public.composition_model_activation_baselines is 'Echo Brain: contadores capturados na ativação para medir somente observações posteriores.';
comment on table public.composition_model_evaluations is 'Echo Brain: reavaliações pós-ativação para saúde, performance e drift.';
comment on table public.echo_brain_actions is 'Echo Brain: trilha administrativa de promoção, rollback, runtime e avaliações.';
