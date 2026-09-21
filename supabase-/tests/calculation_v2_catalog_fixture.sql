-- Isolated CI database only. Never run this fixture in the live database.
\set ON_ERROR_STOP on

do $$
begin
  if current_database() <> 'calculation_v2_test' then
    raise exception 'DISPOSABLE_DATABASE_REQUIRED';
  end if;
end;
$$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
insert into auth.users values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.fixture_caps(
  capability text primary key,
  allowed boolean not null
);
insert into public.fixture_caps values
  ('equipment.view', true),
  ('equipment.edit', true),
  ('equipment.publish', true);

create function public.echo_has_admin_capability(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and coalesce((
      select c.allowed from public.fixture_caps c
      where c.capability = p_capability
    ), false)
$$;

create function public.echo_require_admin_capability(p_capability text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.echo_has_admin_capability(p_capability) then
    raise exception 'DENIED' using errcode = '42501';
  end if;
end;
$$;

create table public.fixture_audit(
  id bigint generated always as identity primary key,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  reason text not null
);

create function public.echo_write_admin_audit(
  p_module text,
  p_capability text,
  p_action text,
  p_type text,
  p_target text,
  p_reason text,
  p_before jsonb,
  p_after jsonb,
  p_actor_kind text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform public.echo_require_admin_capability(p_capability);
  insert into public.fixture_audit(action, before_data, after_data, reason)
  values (p_action, p_before, p_after, p_reason)
  returning id into v_id;
  return v_id;
end;
$$;

create table public.equipments(
  id uuid primary key,
  name text not null,
  enabled boolean not null default true
);

create table public.equipment_rarities(
  id uuid primary key,
  slug text not null unique,
  name text not null,
  rank integer not null unique
);

insert into public.equipments values
  ('22222222-2222-4222-8222-222222222222', 'Equipamento isolado', true),
  ('33333333-3333-4333-8333-333333333333', 'Sem publicação', true);

insert into public.equipment_rarities(id, slug, name, rank) values
  ('10000000-0000-4000-8000-000000000001', 'comum', 'Comum', 1),
  ('10000000-0000-4000-8000-000000000002', 'raro', 'Raro', 2),
  ('10000000-0000-4000-8000-000000000003', 'epico', 'Épico', 3),
  ('10000000-0000-4000-8000-000000000004', 'lendario', 'Lendário', 4),
  ('10000000-0000-4000-8000-000000000005', 'mitico', 'Mítico', 5),
  ('10000000-0000-4000-8000-000000000006', 'supremo', 'Supremo', 6),
  ('10000000-0000-4000-8000-000000000007', 'grandioso', 'Grandioso', 7),
  ('10000000-0000-4000-8000-000000000008', 'celestial', 'Celestial', 8),
  ('10000000-0000-4000-8000-000000000009', 'estelar', 'Estelar', 9),
  ('10000000-0000-4000-8000-000000000010', 'imortal', 'Imortal', 10),
  ('10000000-0000-4000-8000-000000000011', 'divino', 'Divino', 11);

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;

-- Reproduce permissive API defaults so the migration must explicitly close
-- every table, sequence and internal-function surface.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

\ir ../migrations/20260915150000_calculation_v2_catalog.sql

create function public.fixture_assert(ok boolean, message text)
returns void
language plpgsql
as $$
begin
  if ok is distinct from true then
    raise exception 'ASSERTION: %', message;
  end if;
end;
$$;

create function public.fixture_raises(command text, expected text)
returns void
language plpgsql
as $$
begin
  begin
    execute command;
  exception when others then
    if position(expected in sqlerrm) > 0 then return; end if;
    raise;
  end;
  raise exception 'Expected rejection: %', expected;
end;
$$;

select public.fixture_assert(
  (select count(*) = 17 from public.calculation_stat_definitions_v2),
  'Exactly 17 base-stat definitions must be registered'
);
select public.fixture_assert(
  jsonb_array_length(public.calculation_rarities_json_v2()) = 11,
  'Exactly 11 canonical rarities must be registered'
);

select public.fixture_assert(
  not has_table_privilege('anon', 'public.equipment_calculation_workspaces_v2', 'SELECT'),
  'Anonymous users cannot read drafts'
);
select public.fixture_assert(
  not has_table_privilege('authenticated', 'public.equipment_calculation_effects_v2', 'UPDATE'),
  'Authenticated users cannot bypass save RPC'
);
select public.fixture_assert(
  not has_table_privilege('service_role', 'public.equipment_calculation_publications_v2', 'TRUNCATE'),
  'Inherited service-role truncate must be revoked'
);
select public.fixture_assert(
  has_function_privilege('anon', 'public.get_calculation_catalog_v2()', 'EXECUTE'),
  'Public catalog RPC must be callable'
);
select public.fixture_assert(
  not has_function_privilege('anon', 'public.admin_get_equipment_calculation_v2(uuid)', 'EXECUTE'),
  'Admin drafts must not be callable anonymously'
);
select public.fixture_assert(
  not has_function_privilege('authenticated', 'public.calculation_validate_effects_v2(jsonb)', 'EXECUTE'),
  'Internal validator must not be an RPC'
);

set role anon;
select public.fixture_assert(
  jsonb_array_length(public.get_calculation_catalog_v2()->'equipment') = 2,
  'Public catalog lists enabled equipment explicitly'
);
select public.fixture_assert(
  (public.get_calculation_catalog_v2()->'equipment'->0->'effects') = '[]'::jsonb,
  'Unpublished equipment has no authoritative effects'
);
select public.fixture_raises(
  'select * from public.equipment_calculation_workspaces_v2',
  'permission denied'
);
reset role;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
set role authenticated;

select public.admin_save_equipment_calculation_v2(
  '22222222-2222-4222-8222-222222222222',
  0,
  $json$[{
    "id":"44444444-4444-4444-8444-444444444444",
    "kind":"numeric",
    "description":"Aumenta o carregador com vínculo exato.",
    "target":"weapon.magazine",
    "operation":"flat",
    "scope":"self",
    "condition":"always",
    "conditionExpected":null,
    "evaluatedOn":"source",
    "sourceKind":"official",
    "sourceReference":"fixture-developer-table",
    "order":0,
    "values":{"comum":1,"raro":2,"epico":3,"lendario":null,"mitico":5,"supremo":6,"grandioso":7,"celestial":8,"estelar":9,"imortal":10,"divino":11}
  }]$json$::jsonb,
  'Save fixture draft'
);

select public.fixture_assert(
  (public.admin_get_equipment_calculation_v2('22222222-2222-4222-8222-222222222222')->>'revision')::bigint = 1,
  'Draft revision increments once'
);
select public.fixture_assert(
  (
    select count(*) = 11
    from jsonb_object_keys(
      public.admin_get_equipment_calculation_v2(
        '22222222-2222-4222-8222-222222222222'
      )->'effects'->0->'values'
    )
  )
  and public.admin_get_equipment_calculation_v2(
    '22222222-2222-4222-8222-222222222222'
  )->'effects'->0->'values'->'lendario' = 'null'::jsonb,
  'All 11 rarity keys are persisted, including null'
);
select public.fixture_raises(
  $q$select public.admin_save_equipment_calculation_v2('22222222-2222-4222-8222-222222222222',0,'[]','Stale draft save')$q$,
  'CALCULATION_REVISION_CONFLICT'
);

-- Draft remains invisible until the explicit publication command.
select public.fixture_assert(
  (select x->'effects' = '[]'::jsonb
   from jsonb_array_elements(public.get_calculation_catalog_v2()->'equipment') x
   where x->>'id' = '22222222-2222-4222-8222-222222222222'),
  'Draft must not leak into the public catalog'
);

select public.admin_publish_equipment_calculation_v2(
  '22222222-2222-4222-8222-222222222222', 1, 0, 'Publish fixture snapshot'
);

select public.fixture_assert(
  (select x->'effects'->0->>'target' = 'weapon.magazine'
   from jsonb_array_elements(public.get_calculation_catalog_v2()->'equipment') x
   where x->>'id' = '22222222-2222-4222-8222-222222222222'),
  'Published snapshot preserves exact target'
);
select public.fixture_assert(
  (select x->'effects'->0->'values'->'lendario' = 'null'::jsonb
   from jsonb_array_elements(public.get_calculation_catalog_v2()->'equipment') x
   where x->>'id' = '22222222-2222-4222-8222-222222222222'),
  'Published null remains unknown and never becomes zero'
);

-- Publishing the already active revision is idempotent.
select public.admin_publish_equipment_calculation_v2(
  '22222222-2222-4222-8222-222222222222',
  1,
  (public.admin_get_equipment_calculation_v2('22222222-2222-4222-8222-222222222222')->'published'->>'id')::bigint,
  'Repeat fixture publication'
);

-- The application roles intentionally have no direct table privileges. The
-- physical idempotence count and trigger checks below run as database owner.
reset role;
select public.fixture_assert(
  (select count(*) = 1 from public.equipment_calculation_publications_v2),
  'Idempotent publish must not duplicate a snapshot'
);

select public.fixture_raises(
  $q$update public.equipment_calculation_publications_v2 set reason = 'Changed fixture reason'$q$,
  'CALCULATION_PUBLICATION_IMMUTABLE'
);
select public.fixture_raises(
  $q$update public.calculation_stat_definitions_v2 set source_key = 'other_key' where id = 'hero.health'$q$,
  'CALCULATION_PUBLICATION_IMMUTABLE'
);
select public.fixture_raises(
  $q$delete from public.calculation_conditions_v2 where id = 'moving'$q$,
  'CALCULATION_PUBLICATION_IMMUTABLE'
);

-- A numeric draft with every rarity unknown is valid as a draft, but cannot
-- be published as a numeric rule; it must be classified unresolved instead.
set role authenticated;
select public.admin_save_equipment_calculation_v2(
  '22222222-2222-4222-8222-222222222222',
  1,
  $json$[{
    "id":"55555555-5555-4555-8555-555555555555",
    "kind":"numeric",
    "description":"Valor ainda não coletado.",
    "target":"weapon.magazine",
    "operation":"flat",
    "scope":"self",
    "condition":"always",
    "conditionExpected":null,
    "evaluatedOn":"source",
    "sourceKind":"official",
    "sourceReference":"fixture-pending-table",
    "order":0,
    "values":{"comum":null,"raro":null,"epico":null,"lendario":null,"mitico":null,"supremo":null,"grandioso":null,"celestial":null,"estelar":null,"imortal":null,"divino":null}
  }]$json$::jsonb,
  'Save all unknown values'
);
select public.fixture_raises(
  format(
    'select public.admin_publish_equipment_calculation_v2(%L,2,%s,%L)',
    '22222222-2222-4222-8222-222222222222',
    (public.admin_get_equipment_calculation_v2('22222222-2222-4222-8222-222222222222')->'published'->>'id')::bigint,
    'Reject all unknown numeric'
  ),
  'CALCULATION_PUBLICATION_INCOMPLETE'
);

-- The old public snapshot remains active after the rejected draft.
select public.fixture_assert(
  (select x->'publication'->>'workspaceRevision' = '1'
   from jsonb_array_elements(public.get_calculation_catalog_v2()->'equipment') x
   where x->>'id' = '22222222-2222-4222-8222-222222222222'),
  'Rejected publication cannot move the public head'
);

reset role;
update public.fixture_caps set allowed = false where capability = 'equipment.edit';
set role authenticated;
select public.fixture_raises(
  $q$select public.admin_save_equipment_calculation_v2('22222222-2222-4222-8222-222222222222',2,'[]','Unauthorized fixture save')$q$,
  'DENIED'
);
reset role;

select public.fixture_assert(
  (select count(*) = 3 from public.fixture_audit),
  'Only confirmed draft saves and first publication are audited'
);

select 'Calculation v2 database fixture passed: closed privileges, exact links, optimistic revisions, null safety and immutable publication.' as result;
