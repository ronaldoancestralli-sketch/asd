\set ON_ERROR_STOP on
begin;
do $$
declare
  sniper uuid := gen_random_uuid(); tank uuid := gen_random_uuid();
  slayer uuid := gen_random_uuid(); other_sniper uuid := gen_random_uuid(); other_class uuid := gen_random_uuid();
  head_slot uuid := gen_random_uuid(); chest_slot uuid := gen_random_uuid();
  common uuid := gen_random_uuid(); divine uuid := gen_random_uuid();
  personal uuid := gen_random_uuid(); class_item uuid := gen_random_uuid(); generic uuid := gen_random_uuid();
  build uuid := gen_random_uuid(); failed boolean;
begin
  insert into heroes values(slayer,sniper,true),(other_sniper,sniper,true),(other_class,tank,true);
  insert into equipment_slots values(head_slot,1),(chest_slot,2);
  insert into equipment_tiers values(common,'comum',true),(divine,'divino',true);
  insert into equipment_rarities values(common,'comum'),(divine,'divino');
  insert into equipments values(personal,head_slot,slayer,sniper,true,true),
    (class_item,chest_slot,null,sniper,false,true),(generic,head_slot,null,null,false,true);
  insert into equipment_variants values(personal,common),(class_item,common),(generic,common);
  insert into builds values(build,slayer);

  assert equipment_matches_hero_v1(slayer,sniper,true,slayer,sniper);
  assert not equipment_matches_hero_v1(slayer,sniper,true,other_sniper,sniper), 'class must not override owner';
  assert not equipment_matches_hero_v1(null,null,true,slayer,sniper), 'personal without owner must fail';
  assert not equipment_matches_hero_v1(null,sniper,false,other_class,tank), 'class mismatch';
  assert not equipment_matches_hero_v1(slayer,tank,true,slayer,sniper), 'contradictory scopes must fail';

  insert into build_items(build_id,equipment_id,tier_id,slot) values(build,personal,common,1),(build,class_item,common,2);
  set constraints all immediate;
  set constraints all deferred;

  failed := false;
  begin
    update builds set hero_id = other_sniper where id = build;
    set constraints all immediate;
  exception when foreign_key_violation then
    failed := sqlerrm = 'build_equipment_incompatible';
  end;
  assert failed, 'changing hero without replacing personal gear must fail';

  -- A valid atomic hero + loadout replacement remains possible.
  update builds set hero_id = other_class where id = build;
  delete from build_items where build_id = build;
  insert into build_items(build_id,equipment_id,tier_id,slot) values(build,generic,common,1);
  set constraints all immediate;
  set constraints all deferred;

  failed := false;
  begin
    insert into build_items(build_id,equipment_id,tier_id,slot) values(build,generic,common,2);
  exception when unique_violation then failed := true;
  end;
  assert failed, 'duplicate piece must fail even in another slot';

  failed := false;
  begin
    update build_items set slot = 99 where build_id = build;
    set constraints all immediate;
  exception when foreign_key_violation then failed := sqlerrm = 'build_equipment_slot_incompatible';
  end;
  assert failed, 'unknown slot must fail';

  failed := false;
  begin
    update build_items set tier_id = divine where build_id = build;
    set constraints all immediate;
  exception when foreign_key_violation then failed := sqlerrm = 'build_equipment_variant_incompatible';
  end;
  assert failed, 'existing tier without equipment variant must fail';

  update build_items set tier_id = null where build_id = build;
  set constraints all immediate;
  set constraints all deferred;

  failed := false;
  begin
    insert into equipments(id,slot_id,is_personal,enabled) values(gen_random_uuid(),head_slot,true,true);
  exception when check_violation then failed := true;
  end;
  assert failed, 'personal item requires an owner';

  -- A clone must undergo the same checks as a newly submitted loadout.
  failed := false;
  begin
    insert into builds values(gen_random_uuid(),other_sniper) returning id into build;
    insert into build_items(build_id,equipment_id,tier_id,slot) values(build,personal,common,1);
    set constraints all immediate;
  exception when foreign_key_violation then failed := sqlerrm = 'build_equipment_incompatible';
  end;
  assert failed, 'cloned incompatible gear must fail';
end;
$$;
rollback;
\echo Equipment loadout phase 1: all database assertions passed.
