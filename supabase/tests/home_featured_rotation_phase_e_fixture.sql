\set ON_ERROR_STOP on

-- Fixture isolada da etapa E. Mantém o agendador ausente e reproduz somente
-- heróis, autoridade administrativa e auditoria exigidos pelas duas migrations.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
$$;

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

create table public.fixture_admin_capabilities (
  capability text primary key,
  allowed boolean not null
);

create table public.fixture_admin_audit (
  id bigint generated always as identity primary key,
  module text not null,
  capability text not null,
  action text not null,
  target_type text,
  target_id text,
  reason text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb,
  created_at timestamptz not null default clock_timestamp()
);

insert into public.heroes (id, name, slug, display_order, enabled) values
  ('11111111-1111-1111-1111-111111111111', 'Alpha', 'alpha', 10, true),
  ('22222222-2222-2222-2222-222222222222', 'Bravo', 'bravo', 20, true),
  ('33333333-3333-3333-3333-333333333333', 'Charlie', 'charlie', 30, true),
  ('44444444-4444-4444-4444-444444444444', 'Disabled', 'disabled', 40, false);

insert into public.site_pages (page_key, published, content) values (
  'home', true,
  jsonb_build_object('featured_hero_id', '22222222-2222-2222-2222-222222222222')
);

insert into public.fixture_admin_capabilities (capability, allowed) values
  ('publishing.view', true),
  ('publishing.edit', true),
  ('publishing.publish', true);

create or replace function public.echo_has_admin_capability(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.allowed
    from public.fixture_admin_capabilities c
    where c.capability = p_capability
  ), false)
$$;

create or replace function public.echo_require_admin_capability(p_capability text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.echo_has_admin_capability(p_capability) then
    raise exception 'ADMIN_CAPABILITY_DENIED:%', p_capability using errcode = '42501';
  end if;
end;
$$;

create or replace function public.echo_write_admin_audit(
  p_module text,
  p_capability text,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_reason text,
  p_before_state jsonb,
  p_after_state jsonb,
  p_metadata jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.fixture_admin_audit (
    module, capability, action, target_type, target_id, reason,
    before_state, after_state, metadata
  ) values (
    p_module, p_capability, p_action, p_target_type, p_target_id, p_reason,
    p_before_state, p_after_state, p_metadata
  ) returning id into v_id;
  return v_id;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant select on table public.heroes to anon, authenticated, service_role;

\ir ../migrations/20260906034743_home_featured_rotation_phase_d.sql
\ir ../migrations/20260906041241_home_featured_rotation_admin_phase_e.sql

do $fixture$
declare
  v_snapshot jsonb;
  v_plan jsonb;
  v_publish jsonb;
  v_revision bigint;
  v_audit_count bigint;
  v_history_count bigint;
begin
  if has_function_privilege(
       'anon', 'public.echo_admin_home_featured_rotation_v1()', 'EXECUTE'
     )
     or has_function_privilege(
       'service_role', 'public.echo_admin_home_featured_rotation_v1()', 'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated', 'public.echo_admin_home_featured_rotation_v1()', 'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.echo_admin_save_home_featured_plan_v1(text,text,time without time zone,smallint,uuid[],bigint)',
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.echo_admin_set_home_featured_hero_v1(uuid,bigint,text)',
       'EXECUTE'
     ) then
    raise exception 'privilégios das RPCs administrativas divergiram';
  end if;

  if (select count(*)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'echo_admin_home_featured_rotation_v1',
          'echo_admin_save_home_featured_plan_v1',
          'echo_admin_set_home_featured_hero_v1'
        )
        and p.prosecdef
        and coalesce(pg_catalog.array_to_string(p.proconfig, ','), '') like '%search_path=""%'
     ) <> 3 then
    raise exception 'RPCs administrativas precisam ser security definer com search_path vazio';
  end if;

  v_snapshot := public.echo_admin_home_featured_rotation_v1();
  if v_snapshot ->> 'phase' <> 'E'
     or (v_snapshot ->> 'automation_available')::boolean
     or (v_snapshot #>> '{config,automation_enabled}')::boolean
     or v_snapshot #>> '{config,mode}' <> 'manual'
     or v_snapshot #>> '{config,current_hero_name}' <> 'Bravo'
     or (v_snapshot #>> '{config,revision}')::bigint <> 1
     or pg_catalog.jsonb_array_length(v_snapshot -> 'heroes') <> 3
     or pg_catalog.jsonb_array_length(v_snapshot -> 'queue') <> 3
     or not (v_snapshot #>> '{permissions,view}')::boolean
     or not (v_snapshot #>> '{permissions,edit}')::boolean
     or not (v_snapshot #>> '{permissions,publish}')::boolean then
    raise exception 'snapshot administrativo inicial divergiu: %', v_snapshot;
  end if;

  v_plan := public.echo_admin_save_home_featured_plan_v1(
    'daily', 'America/Sao_Paulo', time '09:30', 4::smallint,
    array[
      '33333333-3333-3333-3333-333333333333'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid,
      '11111111-1111-1111-1111-111111111111'::uuid
    ],
    1
  );
  if v_plan ->> 'operation' <> 'saved'
     or v_plan #>> '{config,cadence}' <> 'daily'
     or v_plan #>> '{config,local_time}' <> '09:30:00'
     or (v_plan #>> '{config,revision}')::bigint <> 2
     or (v_plan #>> '{config,automation_enabled}')::boolean
     or v_plan #>> '{queue,0,hero_id}' <> '33333333-3333-3333-3333-333333333333' then
    raise exception 'salvamento do planejamento divergiu: %', v_plan;
  end if;

  select count(*) into v_audit_count from public.fixture_admin_audit;
  select count(*) into v_history_count
  from private.home_featured_rotation_history
  where event_type = 'schedule_changed';
  if v_audit_count <> 1 or v_history_count <> 1 then
    raise exception 'planejamento precisa gerar histórico e auditoria uma única vez';
  end if;

  v_plan := public.echo_admin_save_home_featured_plan_v1(
    'daily', 'America/Sao_Paulo', time '09:30', 4::smallint,
    array[
      '33333333-3333-3333-3333-333333333333'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid,
      '11111111-1111-1111-1111-111111111111'::uuid
    ],
    2
  );
  if v_plan ->> 'operation' <> 'unchanged'
     or (select count(*) from public.fixture_admin_audit) <> v_audit_count
     or (select count(*) from private.home_featured_rotation_history
         where event_type = 'schedule_changed') <> v_history_count then
    raise exception 'salvamento idêntico não permaneceu idempotente';
  end if;

  begin
    perform public.echo_admin_save_home_featured_plan_v1(
      'weekly', 'UTC', time '12:00', 1::smallint,
      array[
        '33333333-3333-3333-3333-333333333333'::uuid,
        '22222222-2222-2222-2222-222222222222'::uuid,
        '11111111-1111-1111-1111-111111111111'::uuid
      ],
      1
    );
    raise exception 'revisão obsoleta foi aceita';
  exception
    when sqlstate '40001' then
      if position('HOME_FEATURED_REVISION_CONFLICT' in sqlerrm) = 0 then raise; end if;
  end;

  v_publish := public.echo_admin_set_home_featured_hero_v1(
    '11111111-1111-1111-1111-111111111111'::uuid,
    2,
    'Destaque editorial da semana'
  );
  if v_publish ->> 'operation' <> 'published'
     or v_publish #>> '{config,current_hero_name}' <> 'Alpha'
     or (v_publish #>> '{config,revision}')::bigint <> 3
     or (v_publish #>> '{config,automation_enabled}')::boolean
     or (select hero_id from public.home_featured_state where singleton_id = 1)
        <> '11111111-1111-1111-1111-111111111111'::uuid
     or (select count(*) from public.fixture_admin_audit) <> 2
     or (select count(*) from private.home_featured_rotation_history
         where event_type = 'manual_override' and changed) <> 1 then
    raise exception 'publicação manual divergiu: %', v_publish;
  end if;

  begin
    perform public.echo_admin_save_home_featured_plan_v1(
      'daily', 'America/Sao_Paulo', time '09:30', 4::smallint,
      array[
        '33333333-3333-3333-3333-333333333333'::uuid,
        '22222222-2222-2222-2222-222222222222'::uuid
      ],
      3
    );
    raise exception 'remoção do destaque atual foi aceita';
  exception
    when sqlstate '22023' then
      if position('HOME_FEATURED_CURRENT_MUST_REMAIN_IN_QUEUE' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    perform public.echo_admin_save_home_featured_plan_v1(
      'daily', 'America/Sao_Paulo', time '09:30', 4::smallint,
      array[
        '11111111-1111-1111-1111-111111111111'::uuid,
        '11111111-1111-1111-1111-111111111111'::uuid
      ],
      3
    );
    raise exception 'fila duplicada foi aceita';
  exception
    when sqlstate '22023' then
      if position('HOME_FEATURED_QUEUE_INVALID' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    perform public.echo_admin_save_home_featured_plan_v1(
      'daily', 'America/Sao_Paulo', time '09:30', 4::smallint,
      array[
        '11111111-1111-1111-1111-111111111111'::uuid,
        '44444444-4444-4444-4444-444444444444'::uuid
      ],
      3
    );
    raise exception 'herói desabilitado foi aceito';
  exception
    when sqlstate '22023' then
      if position('HOME_FEATURED_QUEUE_HAS_INELIGIBLE_HERO' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    perform public.echo_admin_set_home_featured_hero_v1(
      '22222222-2222-2222-2222-222222222222'::uuid, 3, 'x'
    );
    raise exception 'motivo curto foi aceito';
  exception
    when sqlstate '22023' then
      if position('HOME_FEATURED_REASON_REQUIRED' in sqlerrm) = 0 then raise; end if;
  end;

  update public.fixture_admin_capabilities
  set allowed = false where capability = 'publishing.publish';
  begin
    perform public.echo_admin_set_home_featured_hero_v1(
      '22222222-2222-2222-2222-222222222222'::uuid,
      3,
      'Tentativa sem autorização'
    );
    raise exception 'publicação sem capacidade foi aceita';
  exception
    when sqlstate '42501' then
      if position('ADMIN_CAPABILITY_DENIED' in sqlerrm) = 0 then raise; end if;
  end;
  update public.fixture_admin_capabilities
  set allowed = true where capability = 'publishing.publish';

  select revision into v_revision
  from private.home_featured_rotation_config where singleton_id = 1;
  if v_revision <> 3
     or (select automation_enabled from private.home_featured_rotation_config where singleton_id = 1)
     or (select count(*) from public.fixture_admin_audit) <> 2
     or pg_catalog.to_regnamespace('cron') is not null then
    raise exception 'falhas rejeitadas alteraram estado ou a etapa criou dependência de cron';
  end if;
end;
$fixture$;

-- A leitura precisa funcionar com o papel real do painel e falhar nos papéis
-- deliberadamente excluídos pelo contrato de privilégios.
set role authenticated;
select public.echo_admin_home_featured_rotation_v1();
reset role;

select 'home_featured_rotation_phase_e_fixture_ok' as result;
