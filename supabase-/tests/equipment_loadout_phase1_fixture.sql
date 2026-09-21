-- Isolated CI database only. Never run this fixture in the live database.
\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role;
create table public.heroes(id uuid primary key, class_id uuid, enabled boolean);
create table public.equipment_slots(id uuid primary key, display_order integer);
create table public.equipment_tiers(id uuid primary key, slug text, enabled boolean);
create table public.equipment_rarities(id uuid primary key, slug text);
create table public.equipments(id uuid primary key, slot_id uuid references equipment_slots,
  hero_id uuid references heroes, class_id uuid, is_personal boolean default false, enabled boolean);
create table public.equipment_variants(equipment_id uuid references equipments, rarity_id uuid references equipment_rarities);
create table public.builds(id uuid primary key, hero_id uuid references heroes);
create table public.build_items(id uuid primary key default gen_random_uuid(), build_id uuid references builds,
  equipment_id uuid references equipments, tier_id uuid references equipment_tiers, slot integer,
  unique(build_id,slot));
\ir ../migrations/20260902004827_equipment_loadout_integrity_phase1.sql
\ir equipment_loadout_phase1_cases.sql
