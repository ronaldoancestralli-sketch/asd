-- EchoArena — Build write boundary regression test.
-- Usa identidades/dados existentes e reverte todos os dados de cenário.

begin;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select p.id::text from public.profiles p where coalesce(p.is_admin,false)=false order by p.created_at limit 1),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $$
declare
  v_user uuid := auth.uid();
  v_hero uuid;
  v_equipment uuid;
  v_tier uuid;
  v_result jsonb;
  v_build uuid;
  v_public_build uuid;
  v_direct_insert_blocked boolean := false;
  v_direct_item_blocked boolean := false;
  v_rows integer;
begin
  select h.id into v_hero
  from public.heroes h
  where h.enabled = true
  order by h.name limit 1;

  select e.id into v_equipment
  from public.equipments e
  where e.enabled = true
    and e.hero_id is null
    and e.class_id is null
  order by e.display_order, e.name limit 1;

  select t.id into v_tier
  from public.equipment_tiers t
  where t.enabled = true
  order by t.display_order limit 1;

  if v_user is null or v_hero is null or v_equipment is null or v_tier is null then
    raise exception 'build_write_boundary_fixture_missing';
  end if;

  begin
    insert into public.builds(user_id, hero_id, title, visibility, status, is_public)
    values(v_user, v_hero, '__direct_insert_must_fail__', 'private', 'draft', false);
  exception when insufficient_privilege then
    v_direct_insert_blocked := true;
  end;
  if not v_direct_insert_blocked then
    raise exception 'build_write_boundary_failed: direct build insert was allowed';
  end if;

  v_result := public.save_user_build(
    null,
    v_hero,
    '__rpc_build_boundary_test__',
    null,
    'private',
    'draft',
    jsonb_build_array(jsonb_build_object(
      'equipment_id', v_equipment,
      'tier_id', v_tier,
      'slot', 1
    )),
    array['boundary-test']
  );
  v_build := (v_result ->> 'id')::uuid;

  if v_build is null then
    raise exception 'build_write_boundary_failed: save_user_build returned no id';
  end if;

  update public.builds
  set likes = coalesce(likes, 0) + 9999
  where id = v_build;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'build_write_boundary_failed: owner directly updated protected build columns';
  end if;

  begin
    insert into public.build_items(build_id, equipment_id, tier_id, slot)
    values(v_build, v_equipment, v_tier, 2);
  exception when insufficient_privilege then
    v_direct_item_blocked := true;
  end;
  if not v_direct_item_blocked then
    raise exception 'build_write_boundary_failed: direct build item insert was allowed';
  end if;

  v_result := public.set_user_build_deleted(v_build, true);
  if coalesce((v_result ->> 'deleted')::boolean, false) is not true
     or coalesce((v_result ->> 'is_public')::boolean, true) is not false then
    raise exception 'build_write_boundary_failed: soft delete mismatch %', v_result;
  end if;

  v_result := public.set_user_build_deleted(v_build, false);
  if coalesce((v_result ->> 'deleted')::boolean, true) is not false then
    raise exception 'build_write_boundary_failed: restore mismatch %', v_result;
  end if;

  v_result := public.save_user_build(
    null, v_hero, '__rpc_public_admin_test__', null,
    'public', 'published', '[]'::jsonb, '{}'::text[]
  );
  v_public_build := (v_result ->> 'id')::uuid;
  if coalesce((v_result ->> 'is_public')::boolean, false) is not true then
    raise exception 'build_write_boundary_failed: canonical public save mismatch %', v_result;
  end if;

  perform set_config('echoarena.test_public_build', v_public_build::text, true);
end $$;

reset role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select p.id::text from public.profiles p where coalesce(p.is_admin,false)=true order by p.created_at limit 1),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $$
declare
  v_build uuid := current_setting('echoarena.test_public_build')::uuid;
  v_row public.builds%rowtype;
begin
  if not public.is_admin() then
    raise exception 'build_write_boundary_fixture_missing: admin identity unavailable';
  end if;

  perform public.admin_set_build_flag(v_build, 'is_public', false);
  select * into v_row from public.builds where id = v_build;
  if v_row.is_public or v_row.visibility <> 'private' then
    raise exception 'build_admin_flag_failed: unpublish state invalid';
  end if;

  perform public.admin_set_build_flag(v_build, 'is_public', true);
  select * into v_row from public.builds where id = v_build;
  if not v_row.is_public
     or v_row.visibility <> 'public'
     or v_row.status <> 'published'
     or v_row.deleted_at is not null then
    raise exception 'build_admin_flag_failed: publish state invalid';
  end if;

  perform public.admin_set_build_flag(v_build, 'deleted', true);
  select * into v_row from public.builds where id = v_build;
  if v_row.deleted_at is null or v_row.is_public then
    raise exception 'build_admin_flag_failed: delete state invalid';
  end if;

  perform public.admin_set_build_flag(v_build, 'deleted', false);
  select * into v_row from public.builds where id = v_build;
  if v_row.deleted_at is not null or not v_row.is_public then
    raise exception 'build_admin_flag_failed: restore state invalid';
  end if;
end $$;

reset role;
set local role anon;

select 1 / (
  case when (
    select count(*) from public.builds
    where id = current_setting('echoarena.test_public_build')::uuid
  ) = 1 then 1 else 0 end
) as restored_public_build_visible_to_anon;

reset role;
rollback;

select
  true as direct_user_insert_blocked,
  true as direct_metric_update_blocked,
  true as direct_item_insert_blocked,
  true as transactional_save_worked,
  true as owner_soft_delete_restore_worked,
  true as admin_publication_delete_restore_worked,
  true as all_changes_rolled_back;
