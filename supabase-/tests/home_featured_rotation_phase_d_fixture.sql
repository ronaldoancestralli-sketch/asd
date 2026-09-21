\set ON_ERROR_STOP on

-- Fixture isolada da etapa D. Reproduz apenas as dependências que a migration
-- consome e executa o contrato em um PostgreSQL descartável do pipeline.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create table public.heroes (
  id uuid primary key,
  name text not null,
  slug text not null unique,
  display_order integer not null,
  enabled boolean not null default true
);

create table public.site_pages (
  page_key text primary key,
  published boolean not null default false,
  content jsonb not null default '{}'::jsonb
);

insert into public.heroes (id, name, slug, display_order, enabled) values
  ('11111111-1111-1111-1111-111111111111', 'Alpha', 'alpha', 10, true),
  ('22222222-2222-2222-2222-222222222222', 'Bravo', 'bravo', 20, true),
  ('33333333-3333-3333-3333-333333333333', 'Charlie', 'charlie', 30, true),
  ('44444444-4444-4444-4444-444444444444', 'Disabled', 'disabled', 40, false);

insert into public.site_pages (page_key, published, content) values (
  'home',
  true,
  jsonb_build_object(
    'featured_hero_id', '22222222-2222-2222-2222-222222222222'
  )
);

grant usage on schema public to anon, authenticated, service_role;
grant select on table public.heroes to anon, authenticated, service_role;

\ir ../migrations/20260906034743_home_featured_rotation_phase_d.sql

do $fixture$
declare
  v_config private.home_featured_rotation_config%rowtype;
  v_result jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_public_hero uuid;
begin
  select * into strict v_config
  from private.home_featured_rotation_config
  where singleton_id = 1;

  if v_config.mode <> 'manual'
     or v_config.automation_enabled
     or v_config.cadence <> 'weekly'
     or v_config.timezone_name <> 'America/Sao_Paulo'
     or v_config.current_hero_id <> '22222222-2222-2222-2222-222222222222'::uuid
     or v_config.last_status <> 'inactive' then
    raise exception 'seed manual/inativo divergiu: %', row_to_json(v_config);
  end if;

  if (select count(*) from private.home_featured_rotation_queue) <> 3
     or (select min(position) from private.home_featured_rotation_queue) <> 1
     or (select max(position) from private.home_featured_rotation_queue) <> 3 then
    raise exception 'fila inicial deve conter somente os três heróis habilitados';
  end if;

  if (select count(*) from private.home_featured_rotation_history) <> 1
     or (select event_type from private.home_featured_rotation_history limit 1) <> 'seed' then
    raise exception 'histórico inicial deve conter um único seed';
  end if;

  if not has_table_privilege('anon', 'public.home_featured_state', 'SELECT')
     or has_table_privilege('anon', 'public.home_featured_state', 'INSERT')
     or has_schema_privilege('anon', 'private', 'USAGE')
     or not has_function_privilege(
       'anon', 'public.echo_home_featured_state_v1()', 'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'private.run_home_featured_rotation_v1(timestamp with time zone)',
       'EXECUTE'
     ) then
    raise exception 'privilégios públicos/privados divergiram do contrato';
  end if;

  if (select not c.relrowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'home_featured_state') then
    raise exception 'RLS da leitura pública precisa permanecer habilitada';
  end if;

  if (select p.prosecdef
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'echo_home_featured_state_v1') then
    raise exception 'RPC público precisa permanecer security invoker';
  end if;

  if not (select p.prosecdef
          from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'private' and p.proname = 'run_home_featured_rotation_v1') then
    raise exception 'executor privado precisa permanecer security definer';
  end if;

  update private.home_featured_rotation_config
  set mode = 'automatic',
      automation_enabled = true,
      cadence = 'daily',
      timezone_name = 'America/Sao_Paulo',
      local_time = time '00:00',
      weekday = 1,
      current_hero_id = '22222222-2222-2222-2222-222222222222',
      anchor_hero_id = '22222222-2222-2222-2222-222222222222',
      anchor_position = 2,
      anchor_period_start_at = '2026-01-05 03:00:00+00',
      period_start_at = null,
      period_end_at = null,
      next_rotation_at = null,
      revision = 2
  where singleton_id = 1;

  v_result := private.run_home_featured_rotation_v1('2026-01-05 12:00:00+00');
  if v_result ->> 'status' <> 'confirmed'
     or v_result ->> 'hero_id' <> '22222222-2222-2222-2222-222222222222' then
    raise exception 'primeiro período diário divergiu: %', v_result;
  end if;

  v_result := private.run_home_featured_rotation_v1('2026-01-05 18:00:00+00');
  if v_result ->> 'status' <> 'already_applied' then
    raise exception 'segunda execução do mesmo período não foi idempotente: %', v_result;
  end if;

  v_result := private.run_home_featured_rotation_v1('2026-01-09 12:00:00+00');
  if v_result ->> 'status' <> 'rotated'
     or v_result ->> 'hero_id' <> '33333333-3333-3333-3333-333333333333' then
    raise exception 'execução diária atrasada divergiu: %', v_result;
  end if;

  if (select count(*) from private.home_featured_rotation_history
      where revision = 2 and event_type = 'automatic_period') <> 2 then
    raise exception 'execução atrasada criou backfill ou duplicata no histórico';
  end if;

  select period_start_at, period_end_at into v_start, v_end
  from private.home_featured_rotation_window_v1(
    '2026-01-07 12:00:00+00', 'weekly', 'America/Sao_Paulo', time '00:00', 1::smallint
  );
  if v_start <> '2026-01-05 03:00:00+00'::timestamptz
     or v_end <> '2026-01-12 03:00:00+00'::timestamptz then
    raise exception 'janela semanal em São Paulo divergiu: % → %', v_start, v_end;
  end if;

  update private.home_featured_rotation_config
  set cadence = 'weekly',
      current_hero_id = '22222222-2222-2222-2222-222222222222',
      anchor_hero_id = '22222222-2222-2222-2222-222222222222',
      anchor_position = 2,
      anchor_period_start_at = '2026-01-05 03:00:00+00',
      revision = 3
  where singleton_id = 1;

  v_result := private.run_home_featured_rotation_v1('2026-01-12 12:00:00+00');
  if v_result ->> 'status' <> 'rotated'
     or v_result ->> 'hero_id' <> '33333333-3333-3333-3333-333333333333'
     or (v_result ->> 'period_start_at')::timestamptz
        <> '2026-01-12 03:00:00+00'::timestamptz
     or (v_result ->> 'period_end_at')::timestamptz
        <> '2026-01-19 03:00:00+00'::timestamptz then
    raise exception 'rotação semanal divergiu: %', v_result;
  end if;

  delete from private.home_featured_rotation_queue
  where hero_id <> '22222222-2222-2222-2222-222222222222';

  update private.home_featured_rotation_config
  set cadence = 'daily',
      current_hero_id = '22222222-2222-2222-2222-222222222222',
      anchor_hero_id = '22222222-2222-2222-2222-222222222222',
      anchor_position = 2,
      anchor_period_start_at = '2026-01-05 03:00:00+00',
      revision = 4
  where singleton_id = 1;

  v_result := private.run_home_featured_rotation_v1('2026-01-07 12:00:00+00');
  if v_result ->> 'status' <> 'confirmed'
     or v_result ->> 'hero_id' <> '22222222-2222-2222-2222-222222222222' then
    raise exception 'fila com um herói divergiu: %', v_result;
  end if;

  delete from private.home_featured_rotation_queue;
  v_result := private.run_home_featured_rotation_v1('2026-01-08 12:00:00+00');
  if v_result ->> 'status' <> 'no_eligible_heroes'
     or (select hero_id is not null from public.home_featured_state where singleton_id = 1) then
    raise exception 'fila vazia não neutralizou o destaque: %', v_result;
  end if;

  begin
    update private.home_featured_rotation_config
    set timezone_name = 'Invalid/Timezone'
    where singleton_id = 1;
    raise exception 'timezone inválido foi aceito';
  exception
    when sqlstate '22023' then
      if position('HOME_FEATURED_TIMEZONE_INVALID' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  begin
    update private.home_featured_rotation_history
    set details = details
    where id = (select min(id) from private.home_featured_rotation_history);
    raise exception 'histórico deixou de ser append-only';
  exception
    when sqlstate '42501' then
      if position('HOME_FEATURED_HISTORY_APPEND_ONLY' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  update public.home_featured_state
  set hero_id = '22222222-2222-2222-2222-222222222222',
      automation_enabled = true,
      period_start_at = '2026-01-01 03:00:00+00',
      period_end_at = '2026-01-02 03:00:00+00',
      next_rotation_at = '2026-01-02 03:00:00+00'
  where singleton_id = 1;

  select hero_id into v_public_hero
  from public.echo_home_featured_state_v1();
  if v_public_hero is not null then
    raise exception 'RPC público expôs um destaque automático vencido';
  end if;
end;
$fixture$;

-- A chamada precisa funcionar com os privilégios reais do visitante público.
set role anon;
select * from public.echo_home_featured_state_v1();
reset role;

select 'home_featured_rotation_phase_d_fixture_ok' as result;
