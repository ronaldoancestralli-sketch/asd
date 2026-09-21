-- Isolated CI database only. Never run this fixture in the live database.
\set ON_ERROR_STOP on

select current_database() = 'equipment_effect_central_test' as isolated_database \gset
\if :isolated_database
\else
  \echo Refusing to run outside equipment_effect_central_test.
  \quit 1
\endif

create schema if not exists public;
create schema if not exists auth;
create schema if not exists extensions;
grant all on schema public to postgres;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end;
$$;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;
grant execute on all functions in schema extensions to authenticated, service_role;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('test.user_id', true), '')::uuid,
    '99999999-9999-4999-8999-999999999999'::uuid
  );
$$;
grant execute on function auth.uid() to authenticated, service_role;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(nullif(current_setting('test.equipment_admin', true), '')::boolean, false);
$$;
grant execute on function public.current_user_is_admin() to authenticated, service_role;

create table public.equipment_sets(
  id uuid primary key,
  name text not null
);
create table public.equipment_rarities(
  id uuid primary key,
  name text not null,
  slug text not null,
  rank integer not null
);
create table public.equipments(
  id uuid primary key,
  name text not null,
  set_id uuid references public.equipment_sets(id)
);
create table public.equipment_variants(
  id uuid primary key,
  equipment_id uuid not null references public.equipments(id) on delete cascade,
  rarity_id uuid not null references public.equipment_rarities(id),
  unique(equipment_id, rarity_id)
);
create table public.equipment_set_bonuses(
  id uuid primary key,
  set_id uuid not null references public.equipment_sets(id),
  required_pieces integer not null
);

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'equipment_sets', 'equipment_rarities', 'equipments',
    'equipment_variants', 'equipment_set_bonuses'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format(
      'create policy test_admin_read on public.%I for select to authenticated, service_role using ((select public.current_user_is_admin()) is true)',
      v_table
    );
  end loop;
end;
$$;

grant select on public.equipment_sets, public.equipment_rarities, public.equipments,
  public.equipment_variants, public.equipment_set_bonuses to authenticated, service_role;

-- Reproduce the permissive defaults observed in SNV, not clean PostgreSQL roles.
-- Keep these fixture-only defaults away from the already-created catalog tables.
alter default privileges for role postgres in schema public
  grant all privileges on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;

\ir ../migrations/20260902173201_equipment_effect_central_phase2c1.sql

create function pg_temp.assert_central_minimum_privileges()
returns void language plpgsql as $$
declare
  v_role text;
  v_table text;
  v_privilege text;
  v_function text;
  v_expected boolean;
  v_privileges text[] := array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
begin
  if current_setting('server_version_num')::integer >= 170000 then
    v_privileges := array_append(v_privileges, 'MAINTAIN');
  end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    foreach v_table in array array[
      'equipment_effect_documents', 'equipment_effect_document_revisions',
      'equipment_effect_evidence', 'equipment_effect_revision_evidence',
      'equipment_effect_review_queue'
    ] loop
      assert (select relrowsecurity from pg_class
              where oid = ('public.' || v_table)::regclass), 'RLS must remain enabled';
      foreach v_privilege in array v_privileges loop
        v_expected := v_role <> 'anon' and (
          v_privilege in ('SELECT','INSERT') or (
            v_privilege = 'UPDATE' and v_table in (
              'equipment_effect_documents','equipment_effect_review_queue'
            )
          )
        );
        assert has_table_privilege(v_role, 'public.' || v_table, v_privilege) = v_expected,
          format('Unexpected %s privilege for %s on %s', v_privilege, v_role, v_table);
        assert not has_table_privilege(v_role, 'public.' || v_table,
          v_privilege || ' WITH GRANT OPTION'), 'API roles must not delegate privileges';
      end loop;
    end loop;
    foreach v_function in array array[
      'equipment_effect_central_write_guard_v1()',
      'equipment_effect_central_immutable_guard_v1()'
    ] loop
      assert not has_function_privilege(v_role, 'public.' || v_function, 'EXECUTE'),
        'Trigger-only guards must not be callable as RPCs';
    end loop;
    foreach v_function in array array[
      'equipment_effect_payload_has_forbidden_key_v1(jsonb)',
      'equipment_effect_builtin_capability_v1(text)',
      'equipment_effect_issue_v1(text,text,text,text)',
      'validate_equipment_effect_document_draft_v1(jsonb,text,uuid)',
      'admin_save_equipment_effect_draft_v1(text,uuid,jsonb,jsonb,uuid,text)',
      'admin_request_equipment_effect_review_v1(uuid,text,text,text)',
      'admin_review_equipment_effect_revision_v1(uuid,text,text)',
      'admin_list_equipment_effect_drafts_v1(uuid)'
    ] loop
      assert has_function_privilege(v_role, 'public.' || v_function, 'EXECUTE') = (v_role <> 'anon'),
        'Invoker RPC/helper execution matrix must remain intact';
    end loop;
  end loop;
end;
$$;

-- Prove this test detects the original defect, without any destructive command.
do $$
declare v_failed boolean := false;
begin
  assert has_table_privilege('authenticated', 'public.equipment_effect_documents', 'TRUNCATE'),
    'The permissive-default regression must be present before the correction';
  begin
    perform pg_temp.assert_central_minimum_privileges();
  exception when assert_failure then
    v_failed := true;
    raise notice 'Expected baseline privilege-matrix failure: %', sqlerrm;
  end;
  assert v_failed, 'Original migration must fail the effective privilege matrix';
end;
$$;

\ir ../migrations/20260902185123_equipment_effect_central_privileges_v1.sql
select pg_temp.assert_central_minimum_privileges();
-- ACL correction is idempotent; this is an isolated test, not a live reapply.
\ir ../migrations/20260902185123_equipment_effect_central_privileges_v1.sql
select pg_temp.assert_central_minimum_privileges();

\ir equipment_effect_central_phase2c1_cases.sql
