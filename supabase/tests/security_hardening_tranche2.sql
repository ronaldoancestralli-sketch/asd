-- EchoArena — Security hardening tranche 2
-- Executar no projeto conectado. Todas as gravações de cenário ficam em rollback.

begin;

do $$
declare
  v_count integer;
  v_schema text;
  v_user uuid;
  v_other_user uuid;
  v_hero uuid;
  v_equipment uuid;
  v_tier uuid;
  v_private_source uuid;
  v_result jsonb;
  v_blocked boolean := false;
begin
  -- Nenhuma função RETURNS trigger do schema public deve ser RPC direta de anon/authenticated.
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prorettype = 'trigger'::regtype
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
    );
  if v_count <> 0 then
    raise exception 'trigger_functions_exposed_to_data_api: %', v_count;
  end if;

  -- Helpers públicos de leitura endurecidos devem ser SECURITY INVOKER.
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'export_build','export_hero','export_site','feature_is_enabled',
      'feature_requires_login','get_build','get_hero','get_site_settings','site_status'
    )
    and p.prosecdef;
  if v_count <> 0 then
    raise exception 'public_read_helpers_still_security_definer: %', v_count;
  end if;

  -- Operações sensíveis não são chamáveis por anon.
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'clone_build','export_database','export_user_data','log_admin','log_admin_action',
      'mark_notification_read','refresh_hero_statistics','refresh_materialized_views',
      'save_user_build','upsert_hero_media','echo_is_admin','current_user_is_admin','is_blocked'
    )
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_count <> 0 then
    raise exception 'sensitive_functions_executable_by_anon: %', v_count;
  end if;

  -- As MVs permanecem internas: service_role pode ler; Data API público não.
  select count(*) into v_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('mv_popular_builds','mv_hero_ranking','mv_equipment_ranking')
    and (
      has_table_privilege('anon', c.oid, 'SELECT')
      or has_table_privilege('authenticated', c.oid, 'SELECT')
      or not has_table_privilege('service_role', c.oid, 'SELECT')
    );
  if v_count <> 0 then
    raise exception 'materialized_view_privilege_mismatch: %', v_count;
  end if;

  select extnamespace::regnamespace::text into v_schema
  from pg_extension where extname = 'pg_trgm';
  if v_schema is distinct from 'extensions' then
    raise exception 'pg_trgm_wrong_schema: %', v_schema;
  end if;

  -- hero_class_aliases deve ser legível por anon, sem escrita anônima.
  if not has_table_privilege('anon', 'public.hero_class_aliases', 'SELECT') then
    raise exception 'hero_class_aliases_not_public_readable';
  end if;
  if has_table_privilege('anon', 'public.hero_class_aliases', 'INSERT')
     or has_table_privilege('anon', 'public.hero_class_aliases', 'UPDATE')
     or has_table_privilege('anon', 'public.hero_class_aliases', 'DELETE') then
    raise exception 'hero_class_aliases_public_write_exposed';
  end if;

  -- Cenário real de save_user_build com dados existentes, sempre revertido.
  select b.user_id into v_user
  from public.builds b
  where b.user_id is not null
  limit 1;

  select b.user_id into v_other_user
  from public.builds b
  where b.user_id is not null
    and b.user_id <> v_user
  limit 1;

  select h.id into v_hero
  from public.heroes h
  where h.enabled = true
  order by h.name
  limit 1;

  select e.id into v_equipment
  from public.equipments e
  where e.enabled = true
    and e.hero_id is null
    and e.class_id is null
  order by e.display_order, e.name
  limit 1;

  select t.id into v_tier
  from public.equipment_tiers t
  where t.enabled = true
  order by t.display_order
  limit 1;

  if v_user is null or v_other_user is null or v_hero is null or v_equipment is null or v_tier is null then
    raise exception 'build_test_fixture_missing';
  end if;

  insert into public.builds(
    user_id, hero_id, title, is_public, visibility, status, version, updated_at
  ) values (
    v_other_user, v_hero, 'fixture-private-source-rollback', false, 'private', 'draft', 1, now()
  ) returning id into v_private_source;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  v_result := public.save_user_build(
    null,
    v_hero,
    'fixture-unlisted-rollback',
    null,
    'unlisted',
    'published',
    jsonb_build_array(jsonb_build_object(
      'equipment_id', v_equipment,
      'tier_id', v_tier,
      'slot', 1
    )),
    array['fixture-rollback']
  );

  if coalesce(v_result ->> 'visibility', '') <> 'unlisted'
     or coalesce((v_result ->> 'is_public')::boolean, true) then
    raise exception 'unlisted_save_integrity_failed: %', v_result;
  end if;

  begin
    perform public.save_user_build(
      v_private_source,
      v_hero,
      'fixture-private-fork-rollback',
      null,
      'private',
      'draft',
      '[]'::jsonb,
      '{}'::text[]
    );
  exception when sqlstate '42501' then
    v_blocked := position('build_source_not_accessible' in sqlerrm) > 0;
  end;

  if not v_blocked then
    raise exception 'private_foreign_build_was_forkable';
  end if;

  reset role;
end $$;

select
  0 as trigger_rpc_exposure_expected,
  0 as sensitive_anon_exec_expected,
  'extensions' as pg_trgm_schema_expected,
  true as unlisted_save_preserved,
  true as private_foreign_fork_blocked,
  true as all_changes_rolled_back;

rollback;
