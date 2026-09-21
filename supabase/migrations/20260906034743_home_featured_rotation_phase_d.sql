begin;

-- Echo Arena — etapa D da rotação do herói em destaque.
-- Esta migration cria o contrato e o executor, mas não agenda nenhum job.
create schema if not exists private;

create table private.home_featured_rotation_config (
  singleton_id smallint primary key default 1 check (singleton_id = 1),
  mode text not null default 'manual' check (mode in ('manual', 'automatic')),
  automation_enabled boolean not null default false,
  cadence text not null default 'weekly' check (cadence in ('daily', 'weekly')),
  timezone_name text not null default 'America/Sao_Paulo',
  local_time time without time zone not null default time '00:00',
  weekday smallint not null default 1 check (weekday between 0 and 6),
  current_hero_id uuid references public.heroes(id) on delete set null,
  anchor_hero_id uuid references public.heroes(id) on delete set null,
  anchor_position integer check (anchor_position is null or anchor_position > 0),
  anchor_period_start_at timestamptz,
  period_start_at timestamptz,
  period_end_at timestamptz,
  next_rotation_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  last_evaluated_at timestamptz,
  last_rotation_at timestamptz,
  last_status text not null default 'inactive',
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid,
  check (not automation_enabled or mode = 'automatic'),
  check (period_end_at is null or period_start_at is not null),
  check (period_end_at is null or period_end_at > period_start_at),
  check (next_rotation_at is null or period_end_at is null or next_rotation_at >= period_end_at)
);

create table private.home_featured_rotation_queue (
  singleton_id smallint not null default 1
    references private.home_featured_rotation_config(singleton_id) on delete cascade,
  position integer not null check (position > 0),
  hero_id uuid not null references public.heroes(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (singleton_id, position),
  unique (singleton_id, hero_id)
);

create table private.home_featured_rotation_history (
  id bigint generated always as identity primary key,
  execution_key text not null unique,
  revision bigint not null check (revision > 0),
  event_type text not null check (event_type in (
    'seed', 'automatic_period', 'manual_override', 'schedule_changed', 'paused', 'resumed'
  )),
  previous_hero_id uuid,
  hero_id uuid,
  period_start_at timestamptz,
  period_end_at timestamptz,
  changed boolean not null default false,
  source text not null check (source in ('migration', 'scheduler', 'admin', 'system')),
  actor_user_id uuid,
  details jsonb not null default '{}'::jsonb,
  executed_at timestamptz not null default clock_timestamp(),
  check (period_end_at is null or period_start_at is not null),
  check (period_end_at is null or period_end_at > period_start_at)
);

-- Tabela pública deliberadamente mínima. Configuração, fila e histórico
-- permanecem fora do Data API; esta linha é a única fonte da vitrine.
create table public.home_featured_state (
  singleton_id smallint primary key default 1 check (singleton_id = 1),
  hero_id uuid references public.heroes(id) on delete set null,
  automation_enabled boolean not null default false,
  period_start_at timestamptz,
  period_end_at timestamptz,
  next_rotation_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default clock_timestamp(),
  check (period_end_at is null or period_start_at is not null),
  check (period_end_at is null or period_end_at > period_start_at),
  check (next_rotation_at is null or period_end_at is null or next_rotation_at >= period_end_at)
);

create index home_featured_rotation_config_current_hero_idx
  on private.home_featured_rotation_config(current_hero_id);
create index home_featured_rotation_config_anchor_hero_idx
  on private.home_featured_rotation_config(anchor_hero_id);
create index home_featured_rotation_queue_hero_idx
  on private.home_featured_rotation_queue(hero_id);
create index home_featured_rotation_history_hero_time_idx
  on private.home_featured_rotation_history(hero_id, executed_at desc);
create index home_featured_rotation_history_period_idx
  on private.home_featured_rotation_history(revision, period_start_at desc);
create index home_featured_state_hero_idx
  on public.home_featured_state(hero_id);

alter table private.home_featured_rotation_config enable row level security;
alter table private.home_featured_rotation_queue enable row level security;
alter table private.home_featured_rotation_history enable row level security;
alter table public.home_featured_state enable row level security;

create policy home_featured_rotation_config_no_client_access
on private.home_featured_rotation_config as restrictive for all
to anon, authenticated, service_role using (false) with check (false);
create policy home_featured_rotation_queue_no_client_access
on private.home_featured_rotation_queue as restrictive for all
to anon, authenticated, service_role using (false) with check (false);
create policy home_featured_rotation_history_no_client_access
on private.home_featured_rotation_history as restrictive for all
to anon, authenticated, service_role using (false) with check (false);
create policy home_featured_state_public_read
on public.home_featured_state for select
to anon, authenticated using (true);

revoke all on table private.home_featured_rotation_config from public, anon, authenticated, service_role;
revoke all on table private.home_featured_rotation_queue from public, anon, authenticated, service_role;
revoke all on table private.home_featured_rotation_history from public, anon, authenticated, service_role;
revoke all on table public.home_featured_state from public, anon, authenticated, service_role;
grant select on table public.home_featured_state to anon, authenticated, service_role;

create or replace function private.validate_home_featured_rotation_config_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names tz where tz.name = new.timezone_name
  ) then
    raise exception 'HOME_FEATURED_TIMEZONE_INVALID:%', new.timezone_name using errcode = '22023';
  end if;

  if new.automation_enabled then
    if new.mode <> 'automatic' then
      raise exception 'HOME_FEATURED_AUTOMATIC_MODE_REQUIRED' using errcode = '23514';
    end if;
    if new.current_hero_id is null or new.anchor_hero_id is null
       or new.anchor_position is null or new.anchor_period_start_at is null then
      raise exception 'HOME_FEATURED_AUTOMATIC_ANCHOR_REQUIRED' using errcode = '23514';
    end if;
    if not exists (
      select 1
      from private.home_featured_rotation_queue q
      join public.heroes h on h.id = q.hero_id and h.enabled is true
      where q.singleton_id = new.singleton_id
        and q.position = new.anchor_position
        and q.hero_id = new.anchor_hero_id
    ) then
      raise exception 'HOME_FEATURED_ANCHOR_NOT_ELIGIBLE' using errcode = '23514';
    end if;
    if not exists (
      select 1
      from private.home_featured_rotation_queue q
      join public.heroes h on h.id = q.hero_id and h.enabled is true
      where q.singleton_id = new.singleton_id
        and q.hero_id = new.current_hero_id
    ) then
      raise exception 'HOME_FEATURED_CURRENT_NOT_ELIGIBLE' using errcode = '23514';
    end if;
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create trigger home_featured_rotation_config_validate_v1
before insert or update of mode, automation_enabled, cadence, timezone_name,
  local_time, weekday, current_hero_id, anchor_hero_id, anchor_position,
  anchor_period_start_at, revision
on private.home_featured_rotation_config
for each row execute function private.validate_home_featured_rotation_config_v1();

create or replace function private.protect_home_featured_rotation_history_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'HOME_FEATURED_HISTORY_APPEND_ONLY' using errcode = '42501';
  return old;
end;
$$;

create trigger home_featured_rotation_history_append_only_v1
before update or delete on private.home_featured_rotation_history
for each row execute function private.protect_home_featured_rotation_history_v1();

create or replace function private.home_featured_rotation_window_v1(
  p_at timestamptz,
  p_cadence text,
  p_timezone_name text,
  p_local_time time without time zone,
  p_weekday smallint
)
returns table(period_start_at timestamptz, period_end_at timestamptz)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_local timestamp without time zone;
  v_start_date date;
  v_candidate timestamptz;
  v_delta integer;
begin
  if p_at is null or p_cadence not in ('daily', 'weekly')
     or p_local_time is null or p_weekday not between 0 and 6
     or not exists (
       select 1 from pg_catalog.pg_timezone_names tz where tz.name = p_timezone_name
     ) then
    raise exception 'HOME_FEATURED_WINDOW_ARGUMENT_INVALID' using errcode = '22023';
  end if;

  v_local := p_at at time zone p_timezone_name;
  if p_cadence = 'daily' then
    v_start_date := v_local::date;
    v_candidate := (v_start_date + p_local_time) at time zone p_timezone_name;
    if v_candidate > p_at then
      v_start_date := v_start_date - 1;
    end if;
    period_start_at := (v_start_date + p_local_time) at time zone p_timezone_name;
    period_end_at := ((v_start_date + 1) + p_local_time) at time zone p_timezone_name;
  else
    v_delta := (extract(dow from v_local)::integer - p_weekday + 7) % 7;
    v_start_date := v_local::date - v_delta;
    v_candidate := (v_start_date + p_local_time) at time zone p_timezone_name;
    if v_candidate > p_at then
      v_start_date := v_start_date - 7;
    end if;
    period_start_at := (v_start_date + p_local_time) at time zone p_timezone_name;
    period_end_at := ((v_start_date + 7) + p_local_time) at time zone p_timezone_name;
  end if;
  return next;
end;
$$;

create or replace function private.run_home_featured_rotation_v1(
  p_at timestamptz default pg_catalog.clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config private.home_featured_rotation_config%rowtype;
  v_heroes uuid[];
  v_count integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_days integer;
  v_steps bigint;
  v_target_index integer;
  v_target uuid;
  v_previous uuid;
  v_event_id bigint;
  v_changed boolean;
  v_execution_key text;
begin
  if p_at is null then
    raise exception 'HOME_FEATURED_RUN_TIME_REQUIRED' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('echo_home_featured_rotation_v1', 0)
  );

  select * into v_config
  from private.home_featured_rotation_config
  where singleton_id = 1
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('status', 'missing_configuration');
  end if;
  if not v_config.automation_enabled or v_config.mode <> 'automatic' then
    return pg_catalog.jsonb_build_object(
      'status', 'inactive',
      'hero_id', v_config.current_hero_id,
      'revision', v_config.revision
    );
  end if;

  select pg_catalog.array_agg(
    q.hero_id order by
      case when q.position >= v_config.anchor_position then 0 else 1 end,
      q.position
  )
  into v_heroes
  from private.home_featured_rotation_queue q
  join public.heroes h on h.id = q.hero_id and h.enabled is true
  where q.singleton_id = 1;

  v_count := coalesce(pg_catalog.array_length(v_heroes, 1), 0);
  if v_count = 0 then
    update private.home_featured_rotation_config
    set last_evaluated_at = p_at,
        last_status = 'no_eligible_heroes',
        next_rotation_at = null,
        updated_at = pg_catalog.clock_timestamp()
    where singleton_id = 1;
    update public.home_featured_state
    set hero_id = null,
        automation_enabled = true,
        period_start_at = null,
        period_end_at = null,
        next_rotation_at = null,
        revision = v_config.revision,
        updated_at = pg_catalog.clock_timestamp()
    where singleton_id = 1;
    return pg_catalog.jsonb_build_object(
      'status', 'no_eligible_heroes', 'revision', v_config.revision
    );
  end if;

  select w.period_start_at, w.period_end_at
  into v_period_start, v_period_end
  from private.home_featured_rotation_window_v1(
    p_at, v_config.cadence, v_config.timezone_name,
    v_config.local_time, v_config.weekday
  ) w;

  if v_period_start < v_config.anchor_period_start_at then
    return pg_catalog.jsonb_build_object(
      'status', 'before_anchor',
      'hero_id', v_config.current_hero_id,
      'revision', v_config.revision,
      'next_rotation_at', v_config.anchor_period_start_at
    );
  end if;

  v_days := (v_period_start at time zone v_config.timezone_name)::date
    - (v_config.anchor_period_start_at at time zone v_config.timezone_name)::date;
  v_steps := case when v_config.cadence = 'daily'
    then v_days::bigint else (v_days / 7)::bigint end;
  v_target_index := 1 + (v_steps % v_count)::integer;
  v_target := v_heroes[v_target_index];
  v_previous := v_config.current_hero_id;
  v_changed := v_previous is distinct from v_target;
  v_execution_key := 'automatic:' || v_config.revision::text || ':'
    || extract(epoch from v_period_start)::bigint::text;

  insert into private.home_featured_rotation_history (
    execution_key, revision, event_type, previous_hero_id, hero_id,
    period_start_at, period_end_at, changed, source, details, executed_at
  ) values (
    v_execution_key, v_config.revision, 'automatic_period', v_previous, v_target,
    v_period_start, v_period_end, v_changed, 'scheduler',
    pg_catalog.jsonb_build_object(
      'cadence', v_config.cadence,
      'timezone', v_config.timezone_name,
      'eligible_count', v_count,
      'period_steps_from_anchor', v_steps
    ), p_at
  )
  on conflict (execution_key) do nothing
  returning id into v_event_id;

  update private.home_featured_rotation_config
  set current_hero_id = v_target,
      period_start_at = v_period_start,
      period_end_at = v_period_end,
      next_rotation_at = v_period_end,
      last_evaluated_at = p_at,
      last_rotation_at = case when v_changed then p_at else last_rotation_at end,
      last_status = case
        when v_event_id is null then 'already_applied'
        when v_changed then 'rotated'
        else 'confirmed'
      end,
      updated_at = pg_catalog.clock_timestamp()
  where singleton_id = 1;

  update public.home_featured_state
  set hero_id = v_target,
      automation_enabled = true,
      period_start_at = v_period_start,
      period_end_at = v_period_end,
      next_rotation_at = v_period_end,
      revision = v_config.revision,
      updated_at = pg_catalog.clock_timestamp()
  where singleton_id = 1;

  return pg_catalog.jsonb_build_object(
    'status', case
      when v_event_id is null then 'already_applied'
      when v_changed then 'rotated'
      else 'confirmed'
    end,
    'hero_id', v_target,
    'previous_hero_id', v_previous,
    'changed', v_changed,
    'revision', v_config.revision,
    'period_start_at', v_period_start,
    'period_end_at', v_period_end,
    'next_rotation_at', v_period_end
  );
end;
$$;

create or replace function public.echo_home_featured_state_v1()
returns table (
  hero_id uuid,
  hero_slug text,
  automation_enabled boolean,
  period_start_at timestamptz,
  period_end_at timestamptz,
  next_rotation_at timestamptz,
  revision bigint,
  server_now timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    case when h.enabled is true and (
      not s.automation_enabled
      or (s.period_start_at <= pg_catalog.statement_timestamp()
          and s.period_end_at > pg_catalog.statement_timestamp())
    ) then s.hero_id else null end,
    case when h.enabled is true and (
      not s.automation_enabled
      or (s.period_start_at <= pg_catalog.statement_timestamp()
          and s.period_end_at > pg_catalog.statement_timestamp())
    ) then h.slug else null end,
    s.automation_enabled,
    s.period_start_at,
    s.period_end_at,
    s.next_rotation_at,
    s.revision,
    pg_catalog.statement_timestamp()
  from public.home_featured_state s
  left join public.heroes h on h.id = s.hero_id
  where s.singleton_id = 1;
$$;

revoke all on function private.validate_home_featured_rotation_config_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.protect_home_featured_rotation_history_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.home_featured_rotation_window_v1(
  timestamptz, text, text, time without time zone, smallint
) from public, anon, authenticated, service_role;
revoke all on function private.run_home_featured_rotation_v1(timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.echo_home_featured_state_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.echo_home_featured_state_v1()
  to anon, authenticated, service_role;

-- Preserva a seleção editorial anterior quando válida. Como o CMS atual não
-- possui um destaque, usa o primeiro herói ativo apenas como estado manual.
insert into private.home_featured_rotation_config (
  singleton_id, current_hero_id, anchor_hero_id, last_status
)
select 1, selected.hero_id, selected.hero_id, 'inactive'
from (
  select coalesce(
    (
      select h.id
      from public.site_pages p
      join public.heroes h
        on h.id::text = p.content ->> 'featured_hero_id'
       and h.enabled is true
      where p.page_key = 'home' and p.published is true
      limit 1
    ),
    (
      select h.id from public.heroes h
      where h.enabled is true
      order by h.display_order, h.name, h.id
      limit 1
    )
  ) as hero_id
) selected
on conflict (singleton_id) do nothing;

insert into private.home_featured_rotation_queue (singleton_id, position, hero_id)
select 1, row_number() over (order by h.display_order, h.name, h.id)::integer, h.id
from public.heroes h
where h.enabled is true
on conflict (singleton_id, hero_id) do nothing;

insert into public.home_featured_state (
  singleton_id, hero_id, automation_enabled, revision
)
select 1, c.current_hero_id, false, c.revision
from private.home_featured_rotation_config c
where c.singleton_id = 1
on conflict (singleton_id) do nothing;

insert into private.home_featured_rotation_history (
  execution_key, revision, event_type, hero_id, changed, source, details
)
select 'seed:' || c.revision::text, c.revision, 'seed', c.current_hero_id,
       c.current_hero_id is not null, 'migration',
       pg_catalog.jsonb_build_object('automation_enabled', false)
from private.home_featured_rotation_config c
where c.singleton_id = 1 and c.current_hero_id is not null
on conflict (execution_key) do nothing;

comment on table private.home_featured_rotation_config is
  'Canonical singleton configuration for the home featured hero. Not exposed through the Data API.';
comment on table private.home_featured_rotation_queue is
  'Ordered hero queue for daily or weekly rotation. Disabled heroes are skipped by the executor.';
comment on table private.home_featured_rotation_history is
  'Append-only record of schedule revisions and resolved periods.';
comment on table public.home_featured_state is
  'Minimal read model for the public home. Configuration and history remain private.';
comment on function private.run_home_featured_rotation_v1(timestamptz) is
  'Resolves only the current anchored period, is idempotent by revision/period and has no cron job in phase D.';
comment on function public.echo_home_featured_state_v1() is
  'Public security-invoker read. Returns no hero when an automatic period is expired or invalid.';

commit;
