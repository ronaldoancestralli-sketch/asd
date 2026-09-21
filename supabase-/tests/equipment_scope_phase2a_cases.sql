\set ON_ERROR_STOP on
begin;

do $$
begin
  assert not has_function_privilege(
    'anon',
    'public.admin_save_equipment_bundle_v2(uuid,jsonb,jsonb,jsonb,boolean,boolean,text)',
    'execute'
  ), 'anon must not execute the Admin write RPC';
  assert has_function_privilege(
    'authenticated',
    'public.admin_save_equipment_bundle_v2(uuid,jsonb,jsonb,jsonb,boolean,boolean,text)',
    'execute'
  ), 'authenticated Admin role needs RPC execution';
  assert not (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_save_equipment_bundle_v2'
  ), 'RPC must remain security invoker';
end;
$$;

set local role authenticated;
select set_config('test.equipment_admin', 'true', true);

do $$
declare
  sniper uuid := gen_random_uuid();
  slayer uuid := gen_random_uuid();
  generic_id uuid;
  class_item_id uuid;
  personal_item_id uuid;
  response jsonb;
  failed boolean;
  invalid_payload jsonb;
  failed_constraint text;
  saved_version_id uuid;
begin
  insert into public.hero_classes(id, name, slug) values(sniper, 'Franco-Atirador', 'franco-atirador');
  insert into public.heroes(id, class_id, name, slug) values(slayer, sniper, 'Slayer', 'slayer');

  failed := false;
  begin
    perform public.admin_save_equipment_bundle_v2(
      null,
      jsonb_build_object('name', 'Sem escopo', 'slug', 'sem-escopo')
    );
  exception when invalid_parameter_value then
    failed := sqlerrm like 'scope_type é obrigatório%';
  end;
  assert failed, 'new equipment without explicit scope must fail';

  response := public.admin_save_equipment_bundle_v2(
    null,
    jsonb_build_object(
      'name', 'Item genérico',
      'slug', 'item-generico',
      'scope_type', 'generic',
      'hero_id', null,
      'class_id', null,
      'is_personal', false
    )
  );
  generic_id := (response->'equipment'->>'id')::uuid;
  assert exists (
    select 1 from public.equipments
    where id = generic_id and hero_id is null and class_id is null and is_personal is false
  ), 'generic scope must clear every restriction';

  response := public.admin_save_equipment_bundle_v2(
    null,
    jsonb_build_object(
      'name', 'Item de classe',
      'slug', 'item-de-classe',
      'scope_type', 'class',
      'class_id', sniper,
      'hero_id', null,
      'is_personal', false
    )
  );
  class_item_id := (response->'equipment'->>'id')::uuid;
  assert exists (
    select 1 from public.equipments
    where id = class_item_id and hero_id is null and class_id = sniper and is_personal is false
  ), 'class scope must persist class only';

  response := public.admin_save_equipment_bundle_v2(
    null,
    jsonb_build_object(
      'name', 'Item do Slayer',
      'slug', 'item-do-slayer',
      'scope_type', 'hero',
      'hero_id', slayer,
      'class_id', null,
      'is_personal', true
    )
  );
  personal_item_id := (response->'equipment'->>'id')::uuid;
  assert exists (
    select 1 from public.equipments
    where id = personal_item_id and hero_id = slayer and class_id is null and is_personal is true
  ), 'hero scope must persist the owner as its only authority';

  perform public.admin_save_equipment_bundle_v2(
    personal_item_id,
    jsonb_build_object('description', 'Atualização parcial')
  );
  assert exists (
    select 1 from public.equipments
    where id = personal_item_id and hero_id = slayer and class_id is null and is_personal is true
  ), 'partial update must preserve scope when scope_type is omitted';

  failed := false;
  begin
    perform public.admin_save_equipment_bundle_v2(
      personal_item_id,
      jsonb_build_object('class_id', sniper)
    );
  exception when invalid_parameter_value then
    failed := sqlerrm like 'scope_type é obrigatório%';
  end;
  assert failed, 'individual scope fields without scope_type must fail';

  perform public.admin_save_equipment_bundle_v2(
    personal_item_id,
    jsonb_build_object(
      'scope_type', 'generic',
      'hero_id', null,
      'class_id', null,
      'is_personal', false
    )
  );
  assert exists (
    select 1 from public.equipments
    where id = personal_item_id and hero_id is null and class_id is null and is_personal is false
  ), 'explicit transition to generic must clear owner';

  assert exists (
    select 1 from public.equipment_scope_test_snapshots
    where payload->>'id' = personal_item_id::text and payload->>'hero_id' = slayer::text
      and payload->>'is_personal' = 'true'
  ), 'backup must preserve the previous owner';

  insert into public.admin_content_versions(entity_type, entity_id, snapshot)
  values ('equipment', personal_item_id, jsonb_build_object('equipment', jsonb_build_object(
    'hero_id', slayer, 'class_id', null, 'is_personal', true
  ))) returning id into saved_version_id;
  perform public.admin_restore_content_version_v2(saved_version_id);
  assert exists (
    select 1 from public.equipments where id = personal_item_id and hero_id = slayer and is_personal is true
  ), 'legacy snapshot must restore the owner without a stored scope_type';

  update public.admin_content_versions
  set snapshot = '{"equipment":{"description":"Snapshot anterior ao escopo"}}'
  where id = saved_version_id;
  perform public.admin_restore_content_version_v2(saved_version_id);
  assert exists (
    select 1 from public.equipments where id = personal_item_id and hero_id = slayer and is_personal is true
  ), 'snapshot without any scope fields must preserve the current owner';

  update public.admin_content_versions
  set snapshot = jsonb_build_object('equipment', jsonb_build_object(
    'hero_id', slayer, 'class_id', sniper, 'is_personal', true
  )) where id = saved_version_id;
  failed := false;
  begin
    perform public.admin_restore_content_version_v2(saved_version_id);
  exception when check_violation then failed := true;
  end;
  assert failed, 'contradictory historical snapshot must fail without guessing';

  update public.admin_content_versions
  set snapshot = jsonb_build_object('equipment', jsonb_build_object('hero_id', slayer))
  where id = saved_version_id;
  failed := false;
  begin
    perform public.admin_restore_content_version_v2(saved_version_id);
  exception when check_violation then failed := true;
  end;
  assert failed, 'partial historical scope must require review';

  foreach invalid_payload in array array[
    '{"scope_type":"class"}'::jsonb,
    '{"scope_type":"hero"}'::jsonb,
    '{"scope_type":"unsupported"}'::jsonb,
    '{"scope_type":null}'::jsonb,
    '{"scope_type":"generic","is_personal":null}'::jsonb,
    '{"scope_type":"generic","is_personal":"false"}'::jsonb,
    '{"scope_type":"hero","hero_id":"not-a-uuid"}'::jsonb,
    jsonb_build_object('scope_type', 'generic', 'hero_id', slayer),
    jsonb_build_object('scope_type', 'class', 'class_id', sniper, 'hero_id', slayer),
    jsonb_build_object('scope_type', 'class', 'class_id', sniper, 'is_personal', true),
    jsonb_build_object('scope_type', 'hero', 'hero_id', slayer, 'class_id', sniper),
    jsonb_build_object('scope_type', 'hero', 'hero_id', slayer, 'is_personal', false)
  ] loop
    failed := false;
    begin
      perform public.admin_save_equipment_bundle_v2(generic_id, invalid_payload);
    exception when invalid_parameter_value then failed := true;
    end;
    assert failed, format('invalid scope payload must fail: %s', invalid_payload);
  end loop;

  failed := false;
  begin
    perform public.admin_save_equipment_bundle_v2(
      generic_id, jsonb_build_object('scope_type', 'hero', 'hero_id', gen_random_uuid())
    );
  exception when foreign_key_violation then failed := true;
  end;
  assert failed, 'unknown hero must fail';

  failed := false;
  begin
    perform public.admin_save_equipment_bundle_v2(
      generic_id, jsonb_build_object('scope_type', 'class', 'class_id', gen_random_uuid())
    );
  exception when foreign_key_violation then failed := true;
  end;
  assert failed, 'unknown class must fail';

  failed := false;
  begin
    perform public.admin_save_equipment_bundle_v2(
      generic_id, jsonb_build_object('scope_type', 'hero', 'hero_id', slayer),
      '[{"rarity_id":null}]'::jsonb
    );
  exception when foreign_key_violation then failed := true;
  end;
  assert failed, 'invalid variant must abort the entire bundle';
  assert exists (
    select 1 from public.equipments where id = generic_id and hero_id is null and is_personal is false
  ), 'variant failure must roll back the scope change';

  failed := false;
  begin
    update public.equipments
    set hero_id = slayer, class_id = sniper, is_personal = true
    where id = generic_id;
  exception when check_violation then
    failed := true;
  end;
  assert failed, 'table constraint must reject contradictory raw writes';

  -- Remove the hero reference so only the equipment FK can block this deletion.
  update public.heroes set class_id = null where id = slayer;
  failed := false;
  begin
    delete from public.hero_classes where id = sniper;
  exception when foreign_key_violation then
    get stacked diagnostics failed_constraint = constraint_name;
    failed := failed_constraint = 'equipments_class_id_fkey';
  end;
  assert failed, 'referenced class deletion must not make equipment generic';
  assert exists (
    select 1 from public.equipments where id = class_item_id and class_id = sniper
  ), 'class link must remain intact after rejected deletion';

  perform set_config('test.equipment_admin', 'false', true);
  failed := false;
  begin
    perform public.admin_save_equipment_bundle_v2(generic_id, '{"description":"forbidden"}');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'authenticated non-admin must be rejected';
  assert not exists(select 1 from public.equipments), 'RLS must hide equipment from this test non-admin';

  perform set_config('test.equipment_admin', '', true);
  failed := false;
  begin
    perform public.admin_save_equipment_bundle_v2(generic_id, '{"description":"forbidden"}');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'null admin authorization must fail closed';
end;
$$;

reset role;
rollback;
\echo Equipment scope phase 2A: all database assertions passed.
