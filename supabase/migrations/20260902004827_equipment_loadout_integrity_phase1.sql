-- Phase 1: guard new writes without rewriting existing builds or game data.
-- Deployment target: the project's existing SNV database only.

create or replace function public.equipment_matches_hero_v1(
  p_owner uuid, p_class uuid, p_personal boolean, p_hero uuid, p_hero_class uuid
) returns boolean
language sql immutable security invoker
set search_path = public, pg_temp
as $$
  select p_hero is not null
    and (not coalesce(p_personal, false) or p_owner is not null)
    and (p_owner is null or p_owner = p_hero)
    and (p_class is null or coalesce(p_class = p_hero_class, false));
$$;

create or replace function public.validate_build_loadout_v1(p_build uuid)
returns void language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  v_hero uuid;
  v_class uuid;
  v_enabled boolean;
  v_item record;
begin
  select b.hero_id into v_hero from public.builds b where b.id = p_build;
  -- A deleted/cascaded build no longer needs validation.
  if not found then return; end if;
  select h.class_id, h.enabled into v_class, v_enabled from public.heroes h where h.id = v_hero;
  if not found or v_enabled is distinct from true then
    raise exception 'build_hero_unavailable' using errcode = '23503';
  end if;

  if exists (select 1 from public.build_items where build_id = p_build
             group by equipment_id having count(*) > 1) then
    raise exception 'duplicate_build_equipment' using errcode = '23505';
  end if;

  for v_item in
    select bi.*, e.enabled as equipment_enabled, e.hero_id as owner_id,
      e.class_id, e.is_personal, s.position as expected_slot,
      t.id as available_tier, coalesce(t.slug, 'comum') as rarity_slug
    from public.build_items bi
    left join public.equipments e on e.id = bi.equipment_id
    left join (select id, row_number() over (order by display_order, id) as position
               from public.equipment_slots) s on s.id = e.slot_id
    left join public.equipment_tiers t on t.id = bi.tier_id and t.enabled = true
    where bi.build_id = p_build
  loop
    if v_item.equipment_enabled is distinct from true or not public.equipment_matches_hero_v1(
      v_item.owner_id, v_item.class_id, v_item.is_personal, v_hero, v_class
    ) then
      raise exception 'build_equipment_incompatible' using errcode = '23503';
    end if;
    if v_item.expected_slot is null or v_item.slot is distinct from v_item.expected_slot then
      raise exception 'build_equipment_slot_incompatible' using errcode = '23503';
    end if;
    if v_item.tier_id is not null and v_item.available_tier is null then
      raise exception 'build_tier_unavailable' using errcode = '23503';
    end if;
    if not exists (
      select 1 from public.equipment_variants ev
      join public.equipment_rarities r on r.id = ev.rarity_id
      where ev.equipment_id = v_item.equipment_id and r.slug = v_item.rarity_slug
    ) then
      raise exception 'build_equipment_variant_incompatible' using errcode = '23503';
    end if;
  end loop;
end;
$$;

create or replace function public.enforce_build_loadout_v1()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'builds' then
    perform public.validate_build_loadout_v1(new.id);
  else
    perform public.validate_build_loadout_v1(new.build_id);
  end if;
  return new;
end;
$$;

-- Deferred checks allow save_user_build to change the hero and then replace
-- all items atomically. They also cover clone_build and administrative writes.
create constraint trigger build_items_loadout_integrity_v1
after insert or update on public.build_items
deferrable initially deferred for each row
execute function public.enforce_build_loadout_v1();

create constraint trigger builds_hero_loadout_integrity_v1
after update on public.builds
deferrable initially deferred for each row
when (old.hero_id is distinct from new.hero_id)
execute function public.enforce_build_loadout_v1();

create unique index build_items_unique_equipment_v1
on public.build_items(build_id, equipment_id);

alter table public.equipments add constraint equipment_personal_owner_required_v1
check (is_personal is not true or hero_id is not null) not valid;

revoke all on function public.equipment_matches_hero_v1(uuid, uuid, boolean, uuid, uuid) from public, anon;
revoke all on function public.validate_build_loadout_v1(uuid) from public, anon;
revoke all on function public.enforce_build_loadout_v1() from public, anon;
grant execute on function public.equipment_matches_hero_v1(uuid, uuid, boolean, uuid, uuid) to authenticated, service_role;
grant execute on function public.validate_build_loadout_v1(uuid) to authenticated, service_role;
grant execute on function public.enforce_build_loadout_v1() to authenticated, service_role;
