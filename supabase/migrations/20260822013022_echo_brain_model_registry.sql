-- Echo Brain — memória permanente, registro de treinamento e controle operacional.
-- Nenhum treinamento é executado por esta migration. O estado inicial mantém
-- aprendizado desligado e automações desabilitadas.

create table if not exists public.composition_model_versions (
  id uuid primary key default gen_random_uuid(),
  brain_key text not null default 'composition' check (brain_key = 'composition'),
  version integer not null check (version > 0),
  status text not null default 'candidate' check (status in ('candidate','active','suspended','rejected','retired')),
  algorithm text not null,
  feature_schema_version text not null,
  season_id uuid references public.seasons(id) on delete set null,
  dataset_fingerprint text not null,
  dataset_rows integer not null default 0 check (dataset_rows >= 0),
  total_matches bigint not null default 0 check (total_matches >= 0),
  influence_weight numeric(6,5) not null default 0 check (influence_weight >= 0 and influence_weight <= 0.55),
  passed_validation boolean not null default false,
  weights jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  retired_at timestamptz,
  unique (brain_key, version)
);

create unique index if not exists composition_model_versions_one_active
  on public.composition_model_versions (brain_key)
  where status = 'active';

create index if not exists composition_model_versions_created_at
  on public.composition_model_versions (created_at desc);
create index if not exists composition_model_versions_season
  on public.composition_model_versions (season_id);

create table if not exists public.composition_training_runs (
  id uuid primary key default gen_random_uuid(),
  brain_key text not null default 'composition' check (brain_key = 'composition'),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','rejected','cancelled')),
  algorithm text not null,
  feature_schema_version text not null,
  season_id uuid references public.seasons(id) on delete set null,
  dataset_fingerprint text not null,
  dataset_rows integer not null default 0 check (dataset_rows >= 0),
  total_matches bigint not null default 0 check (total_matches >= 0),
  train_rows integer not null default 0 check (train_rows >= 0),
  validation_rows integer not null default 0 check (validation_rows >= 0),
  baseline_brier numeric,
  model_brier numeric,
  passed_validation boolean,
  candidate_model_id uuid references public.composition_model_versions(id) on delete set null,
  metrics jsonb not null default '{}'::jsonb,
  error_message text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists composition_training_runs_created_at
  on public.composition_training_runs (created_at desc);
create index if not exists composition_training_runs_status
  on public.composition_training_runs (status, created_at desc);
create index if not exists composition_training_runs_season
  on public.composition_training_runs (season_id);

create table if not exists public.echo_brain_settings (
  brain_key text primary key check (brain_key = 'composition'),
  learning_enabled boolean not null default false,
  max_influence numeric(6,5) not null default 0.35 check (max_influence >= 0 and max_influence <= 0.55),
  auto_training_enabled boolean not null default false,
  auto_promotion_enabled boolean not null default false,
  min_trios integer not null default 12 check (min_trios >= 3),
  min_matches integer not null default 120 check (min_matches >= 1),
  min_validation_rows integer not null default 3 check (min_validation_rows >= 1),
  active_model_id uuid references public.composition_model_versions(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.echo_brain_settings (
  brain_key, learning_enabled, max_influence, auto_training_enabled,
  auto_promotion_enabled, min_trios, min_matches, min_validation_rows
)
values ('composition', false, 0.35, false, false, 12, 120, 3)
on conflict (brain_key) do nothing;

drop trigger if exists echo_brain_settings_set_updated_at on public.echo_brain_settings;
create trigger echo_brain_settings_set_updated_at
before update on public.echo_brain_settings
for each row execute function public.set_updated_at();

alter table public.composition_model_versions enable row level security;
alter table public.composition_training_runs enable row level security;
alter table public.echo_brain_settings enable row level security;

-- Tabelas internas: nenhuma operação genérica do Data API para anon/authenticated.
revoke all on table public.composition_model_versions from anon, authenticated;
revoke all on table public.composition_training_runs from anon, authenticated;
revoke all on table public.echo_brain_settings from anon, authenticated;

-- Snapshot administrativo único. Dashboard e página completa leem a mesma memória.
create or replace function public.admin_echo_brain_registry_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings jsonb;
  v_models jsonb;
  v_runs jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select to_jsonb(s) into v_settings
  from public.echo_brain_settings s
  where s.brain_key = 'composition';

  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc), '[]'::jsonb)
  into v_models
  from (
    select id, brain_key, version, status, algorithm, feature_schema_version,
           season_id, dataset_fingerprint, dataset_rows, total_matches,
           influence_weight, passed_validation, metrics, notes,
           created_at, activated_at, retired_at
    from public.composition_model_versions
    where brain_key = 'composition'
    order by created_at desc
    limit 25
  ) m;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
  into v_runs
  from (
    select id, brain_key, status, algorithm, feature_schema_version, season_id,
           dataset_fingerprint, dataset_rows, total_matches, train_rows,
           validation_rows, baseline_brier, model_brier, passed_validation,
           candidate_model_id, metrics, error_message, notes,
           created_at, started_at, completed_at
    from public.composition_training_runs
    where brain_key = 'composition'
    order by created_at desc
    limit 25
  ) r;

  return jsonb_build_object(
    'settings', coalesce(v_settings, '{}'::jsonb),
    'models', coalesce(v_models, '[]'::jsonb),
    'trainingRuns', coalesce(v_runs, '[]'::jsonb)
  );
end;
$$;

-- Kill switch / limite de influência. Não cria nem promove modelos.
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
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select * into v_settings
  from public.echo_brain_settings
  where brain_key = 'composition'
  for update;

  if not found then
    raise exception 'brain_settings_missing';
  end if;

  v_next_influence := coalesce(p_max_influence, v_settings.max_influence);
  if v_next_influence < 0 or v_next_influence > 0.55 then
    raise exception 'invalid_max_influence';
  end if;

  if coalesce(p_learning_enabled, false) then
    if v_settings.active_model_id is null then
      raise exception 'active_model_required';
    end if;
    select * into v_model
    from public.composition_model_versions
    where id = v_settings.active_model_id;
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

  return to_jsonb(v_settings);
end;
$$;

revoke all on function public.admin_echo_brain_registry_snapshot() from public, anon;
revoke all on function public.admin_echo_brain_set_runtime(boolean, numeric) from public, anon;
grant execute on function public.admin_echo_brain_registry_snapshot() to authenticated;
grant execute on function public.admin_echo_brain_set_runtime(boolean, numeric) to authenticated;

comment on table public.composition_model_versions is 'Echo Brain: versões imutáveis/auditáveis de modelos de composição.';
comment on table public.composition_training_runs is 'Echo Brain: histórico de execuções de treinamento e validação.';
comment on table public.echo_brain_settings is 'Echo Brain: controle operacional singleton; aprendizado e automações começam desligados.';
