-- Isolated CI database only. Never run this fixture in the live database.
\set ON_ERROR_STOP on

select current_database() = 'equipment_scope_test' as isolated_scope_database \gset
\if :isolated_scope_database
\else
  \echo Refusing to run outside equipment_scope_test.
  \quit 1
\endif

create schema if not exists public;
grant all on schema public to postgres;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;

create table public.hero_classes(
  id uuid primary key,
  name text not null,
  slug text not null unique
);
create table public.heroes(
  id uuid primary key,
  class_id uuid references public.hero_classes(id),
  name text not null,
  slug text not null unique,
  enabled boolean default true
);
create table public.equipment_slots(id uuid primary key);
create table public.equipment_sets(id uuid primary key);
create table public.equipment_rarities(id uuid primary key);
create table public.equipments(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  slot_id uuid references public.equipment_slots(id),
  set_id uuid references public.equipment_sets(id),
  hero_id uuid constraint equipments_hero_id_fkey references public.heroes(id),
  class_id uuid constraint equipments_class_id_fkey references public.hero_classes(id) on delete set null,
  is_personal boolean default false,
  description text,
  recommendation text,
  recommendation_text text,
  image_path text,
  image_url text,
  image_fit text default 'contain',
  image_position text default '50% 50%',
  image_scale numeric default 1,
  image_offset_x integer default 0,
  image_offset_y integer default 0,
  display_order integer default 0,
  enabled boolean default true,
  updated_at timestamptz default now(),
  constraint equipment_personal_owner_required_v1 check (is_personal is not true or hero_id is not null)
);
create table public.equipment_variants(
  equipment_id uuid references public.equipments(id) on delete cascade,
  rarity_id uuid references public.equipment_rarities(id),
  attributes jsonb default '[]'::jsonb,
  updated_at timestamptz default now(),
  unique(equipment_id, rarity_id)
);
create table public.equipment_set_bonuses(
  set_id uuid references public.equipment_sets(id) on delete cascade,
  required_pieces integer,
  title text,
  description text,
  stats jsonb default '{}'::jsonb,
  display_order integer default 0,
  updated_at timestamptz default now(),
  unique(set_id, required_pieces)
);

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$ select nullif(current_setting('test.equipment_admin', true), '')::boolean $$;

create table public.equipment_scope_test_snapshots(payload jsonb);
create table public.admin_content_versions(
  id uuid primary key default gen_random_uuid(),
  entity_type text,
  entity_id uuid,
  version integer,
  snapshot jsonb
);

create or replace function public.admin_snapshot_content_v2(p_entity text, p_id uuid, p_source text)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  insert into public.equipment_scope_test_snapshots(payload)
  select to_jsonb(e) from public.equipments e where e.id = p_id;
  return 1;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'hero_classes', 'heroes', 'equipment_slots', 'equipment_sets', 'equipment_rarities',
    'equipments', 'equipment_variants', 'equipment_set_bonuses', 'equipment_scope_test_snapshots',
    'admin_content_versions'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy scope_test_admin on public.%I to authenticated, service_role using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()))',
      table_name
    );
  end loop;
end;
$$;

grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant execute on function public.current_user_is_admin() to authenticated, service_role;
grant execute on function public.admin_snapshot_content_v2(text, uuid, text) to authenticated, service_role;

\ir ../migrations/20260902061709_equipment_scope_admin_phase2a.sql
\ir equipment_scope_phase2a_cases.sql
