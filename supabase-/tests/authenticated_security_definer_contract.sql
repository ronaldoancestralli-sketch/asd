-- EchoArena — contrato read-only da superfície SECURITY DEFINER autenticada.
-- Este teste não cria fixtures e não altera dados, privilégios ou schema.
-- Baseline observada em produção (2026-08-22): 36 funções e 0 anon.
-- O SNV restaurado acrescenta 8 RPCs auditadas à baseline histórica (44).
-- Semantic v4 adiciona 9 e Echo Identity V1–V5 adiciona 15: catálogo completo 68.
-- O contrato aceita Semantic v4 ausente por inteiro (59), mas nunca parcial.
do $$
declare
  v_expected text[] := array[
    'public.admin_change_master_password(text,text)',
    'public.admin_echo_brain_ingest_observations(text,text,text,text,uuid,jsonb)',
    'public.admin_echo_brain_investigation_snapshot(text[],text[])',
    'public.admin_echo_brain_knowledge_snapshot()',
    'public.admin_echo_brain_promote_model(uuid)',
    'public.admin_echo_brain_reconcile_knowledge(integer)',
    'public.admin_echo_brain_record_counterfactual(text,text,text,numeric,numeric,jsonb,jsonb,text,uuid)',
    'public.admin_echo_brain_record_equipment_change(text,text,jsonb)',
    'public.admin_echo_brain_registry_snapshot()',
    'public.admin_echo_brain_replace_semantic_edges(jsonb)',
    'public.admin_echo_brain_rollback_model(uuid,text)',
    'public.admin_echo_brain_set_emergency(boolean,text)',
    'public.admin_echo_brain_set_runtime(boolean,numeric)',
    'public.admin_echo_brain_set_shadow_mode(boolean)',
    'public.admin_echo_brain_simulation_readiness()',
    'public.admin_identity_founder_status_v1()',
    'public.admin_confirm_research_review_v1(uuid,bigint,text,text)',
    'public.admin_research_review_queue_v5(text,integer)',
    'public.admin_profiles_page(text,text,text,integer,integer)',
    'public.admin_review_creator_claim_v1(uuid,text,text)',
    'public.admin_review_research_contribution_v1(uuid,text,text,boolean)',
    'public.admin_set_build_flag(uuid,text,boolean)',
    'public.admin_set_comment_flag(uuid,text,boolean)',
    'public.admin_set_identity_badge_v1(uuid,text,boolean,text,text)',
    'public.admin_set_identity_rollout_v1(boolean,boolean,boolean,boolean,boolean,boolean,text,text)',
    'public.admin_set_maintenance(boolean,text)',
    'public.admin_set_pulse_item_status(uuid,text)',
    'public.admin_set_user_blocked(uuid,boolean,text)',
    'public.admin_set_user_role(uuid,text)',
    'public.admin_sync_hero_media(uuid)',
    'public.clone_build(uuid)',
    'public.current_user_is_admin()',
    'public.echo_admin_identity()',
    'public.echo_admin_module_health()',
    'public.echo_admin_system_health()',
    'public.echo_brain_equipment_freshness(text[])',
    'public.echo_brain_register_recommendation_exposure(text,text,text,uuid,integer,numeric,text)',
    'public.echo_can_preview_pulse()',
    'public.echo_current_user_access_state()',
    'public.echo_identity_rollout_status_v1()',
    'public.echo_my_research_guardrails_v5()',
    'public.echo_my_research_missions_v5()',
    'public.echo_is_admin()',
    'public.echo_public_identity_cards_v1(uuid[])',
    'public.echo_public_profile_v1(text)',
    'public.echo_pulse_private_preview_feed()',
    'public.echo_request_creator_verification_v1(text,text)',
    'public.echo_set_my_public_identity_v1(text,text,text,text,text,boolean)',
    'public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text)',
    'public.export_database()',
    'public.export_user_data(uuid)',
    'public.is_admin()',
    'public.is_blocked()',
    'public.log_admin(text,text,jsonb)',
    'public.log_admin_action(text,text,uuid,jsonb)',
    'public.mark_notification_read(uuid)',
    'public.promo_admin_delete(uuid)',
    'public.promo_admin_list()',
    'public.promo_admin_save(uuid,text,text,text,text,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,boolean,text)',
    'public.promo_like_and_reveal(uuid)',
    'public.promo_reveal_if_liked(uuid)',
    'public.record_analytics_event(text,text,text,uuid,text,jsonb)',
    'public.refresh_hero_statistics()',
    'public.refresh_materialized_views()',
    'public.save_team_composition(text,text,boolean,uuid[])',
    'public.save_user_build(uuid,uuid,text,text,text,text,jsonb,text[])',
    'public.set_user_build_deleted(uuid,boolean)',
    'public.toggle_saved_build_comparison(uuid,uuid,text)'
  ];
  v_semantic_optional text[] := array[
    'public.admin_echo_brain_investigation_snapshot(text[],text[])',
    'public.admin_echo_brain_knowledge_snapshot()',
    'public.admin_echo_brain_reconcile_knowledge(integer)',
    'public.admin_echo_brain_record_counterfactual(text,text,text,numeric,numeric,jsonb,jsonb,text,uuid)',
    'public.admin_echo_brain_record_equipment_change(text,text,jsonb)',
    'public.admin_echo_brain_replace_semantic_edges(jsonb)',
    'public.admin_echo_brain_simulation_readiness()',
    'public.echo_brain_equipment_freshness(text[])',
    'public.echo_brain_register_recommendation_exposure(text,text,text,uuid,integer,numeric,text)'
  ];
  v_admin text[] := array[
    'public.admin_change_master_password(text,text)',
    'public.admin_echo_brain_ingest_observations(text,text,text,text,uuid,jsonb)',
    'public.admin_echo_brain_investigation_snapshot(text[],text[])',
    'public.admin_echo_brain_knowledge_snapshot()',
    'public.admin_echo_brain_promote_model(uuid)',
    'public.admin_echo_brain_reconcile_knowledge(integer)',
    'public.admin_echo_brain_record_counterfactual(text,text,text,numeric,numeric,jsonb,jsonb,text,uuid)',
    'public.admin_echo_brain_record_equipment_change(text,text,jsonb)',
    'public.admin_echo_brain_registry_snapshot()',
    'public.admin_echo_brain_replace_semantic_edges(jsonb)',
    'public.admin_echo_brain_rollback_model(uuid,text)',
    'public.admin_echo_brain_set_emergency(boolean,text)',
    'public.admin_echo_brain_set_runtime(boolean,numeric)',
    'public.admin_echo_brain_set_shadow_mode(boolean)',
    'public.admin_echo_brain_simulation_readiness()',
    'public.admin_identity_founder_status_v1()',
    'public.admin_confirm_research_review_v1(uuid,bigint,text,text)',
    'public.admin_research_review_queue_v5(text,integer)',
    'public.admin_profiles_page(text,text,text,integer,integer)',
    'public.admin_review_creator_claim_v1(uuid,text,text)',
    'public.admin_review_research_contribution_v1(uuid,text,text,boolean)',
    'public.admin_set_build_flag(uuid,text,boolean)',
    'public.admin_set_comment_flag(uuid,text,boolean)',
    'public.admin_set_identity_badge_v1(uuid,text,boolean,text,text)',
    'public.admin_set_identity_rollout_v1(boolean,boolean,boolean,boolean,boolean,boolean,text,text)',
    'public.admin_set_maintenance(boolean,text)',
    'public.admin_set_pulse_item_status(uuid,text)',
    'public.admin_set_user_blocked(uuid,boolean,text)',
    'public.admin_set_user_role(uuid,text)',
    'public.admin_sync_hero_media(uuid)',
    'public.echo_admin_module_health()',
    'public.echo_admin_system_health()',
    'public.export_database()',
    'public.log_admin(text,text,jsonb)',
    'public.log_admin_action(text,text,uuid,jsonb)',
    'public.promo_admin_delete(uuid)',
    'public.promo_admin_list()',
    'public.promo_admin_save(uuid,text,text,text,text,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,boolean,text)',
    'public.refresh_hero_statistics()',
    'public.refresh_materialized_views()'
  ];
  v_user text[] := array[
    'public.clone_build(uuid)',
    'public.echo_current_user_access_state()',
    'public.echo_my_research_guardrails_v5()',
    'public.echo_my_research_missions_v5()',
    'public.echo_request_creator_verification_v1(text,text)',
    'public.echo_set_my_public_identity_v1(text,text,text,text,text,boolean)',
    'public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text)',
    'public.export_user_data(uuid)',
    'public.mark_notification_read(uuid)',
    'public.promo_like_and_reveal(uuid)',
    'public.promo_reveal_if_liked(uuid)',
    'public.save_team_composition(text,text,boolean,uuid[])',
    'public.save_user_build(uuid,uuid,text,text,text,text,jsonb,text[])',
    'public.set_user_build_deleted(uuid,boolean)',
    'public.toggle_saved_build_comparison(uuid,uuid,text)'
  ];
  v_helpers text[] := array[
    'public.current_user_is_admin()',
    'public.echo_admin_identity()',
    'public.echo_is_admin()',
    'public.is_admin()',
    'public.is_blocked()'
  ];
  v_public_narrow text[] := array[
    'public.echo_brain_equipment_freshness(text[])',
    'public.echo_brain_register_recommendation_exposure(text,text,text,uuid,integer,numeric,text)',
    'public.echo_identity_rollout_status_v1()',
    'public.echo_public_identity_cards_v1(uuid[])',
    'public.echo_public_profile_v1(text)',
    'public.record_analytics_event(text,text,text,uuid,text,jsonb)'
  ];
  v_active_expected text[];
  v_actual text[];
  v_missing text[];
  v_unexpected text[];
  v_signature text;
  v_proc regprocedure;
  v_definition text;
  v_settings text;
  v_count integer;
  v_semantic_present integer;
begin
  select count(*) into v_semantic_present
  from unnest(v_semantic_optional) signature
  where to_regprocedure(signature) is not null;

  if v_semantic_present not in (0,cardinality(v_semantic_optional)) then
    raise exception 'authenticated_security_definer_contract: Semantic v4 parcialmente instalada: %/%',
      v_semantic_present,cardinality(v_semantic_optional);
  end if;

  if v_semantic_present=0 then
    select array_agg(item order by item) into v_active_expected
    from (
      select unnest(v_expected) as item
      except
      select unnest(v_semantic_optional)
    ) required;
  else
    v_active_expected:=v_expected;
  end if;

  select array_agg(
    format('%I.%s',n.nspname,regexp_replace(p.oid::regprocedure::text,'^public\.',''))
    order by p.oid::regprocedure::text
  )
  into v_actual
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and has_function_privilege('authenticated',p.oid,'EXECUTE');

  select array_agg(item order by item) into v_missing
  from (
    select unnest(v_active_expected) as item
    except
    select unnest(coalesce(v_actual,array[]::text[]))
  ) missing;

  select array_agg(item order by item) into v_unexpected
  from (
    select unnest(coalesce(v_actual,array[]::text[])) as item
    except
    select unnest(v_active_expected)
  ) unexpected;

  if cardinality(v_missing)>0 then
    raise exception 'authenticated_security_definer_contract: funções esperadas ausentes: %',v_missing;
  end if;
  if cardinality(v_unexpected)>0 then
    raise exception 'authenticated_security_definer_contract: nova exposição fora da allowlist: %',v_unexpected;
  end if;

  foreach v_signature in array v_active_expected loop
    v_proc:=to_regprocedure(v_signature);
    if v_proc is null then raise exception 'authenticated_security_definer_contract: função ausente: %',v_signature; end if;
    if v_signature=any(v_public_narrow) then
      if not has_function_privilege('anon',v_proc,'EXECUTE') then
        raise exception 'authenticated_security_definer_contract: RPC pública estreita perdeu anon: %',v_signature;
      end if;
    elsif has_function_privilege('anon',v_proc,'EXECUTE') then
      raise exception 'authenticated_security_definer_contract: anon executa função não pública: %',v_signature;
    end if;
    if not has_function_privilege('authenticated',v_proc,'EXECUTE') then
      raise exception 'authenticated_security_definer_contract: authenticated perdeu %',v_signature;
    end if;
    if not has_function_privilege('service_role',v_proc,'EXECUTE') then
      raise exception 'authenticated_security_definer_contract: service_role perdeu acesso %',v_signature;
    end if;

    select coalesce(array_to_string(p.proconfig,','),'') into v_settings from pg_proc p where p.oid=v_proc::oid;
    if v_settings not like '%search_path=%' then
      raise exception 'authenticated_security_definer_contract: search_path não fixo em %',v_signature;
    end if;
  end loop;

  foreach v_signature in array v_admin loop
    continue when not v_signature=any(v_active_expected);
    v_proc:=to_regprocedure(v_signature);
    select lower(pg_get_functiondef(v_proc::oid)) into v_definition;
    if position('is_admin' in v_definition)=0 then
      raise exception 'authenticated_security_definer_contract: barreira Admin ausente em %',v_signature;
    end if;
  end loop;

  foreach v_signature in array v_user loop
    v_proc:=to_regprocedure(v_signature);
    select lower(pg_get_functiondef(v_proc::oid)) into v_definition;
    if position('auth.uid' in v_definition)=0 then
      raise exception 'authenticated_security_definer_contract: vínculo de identidade ausente em %',v_signature;
    end if;
  end loop;

  foreach v_signature in array v_helpers loop
    v_proc:=to_regprocedure(v_signature);
    select lower(pg_get_functiondef(v_proc::oid)) into v_definition;
    if position('auth.uid' in v_definition)=0
       and position('public.echo_is_admin' in v_definition)=0
       and position('public.echo_admin_identity' in v_definition)=0 then
      raise exception 'authenticated_security_definer_contract: helper sem identidade em %',v_signature;
    end if;
  end loop;

  if v_semantic_present=cardinality(v_semantic_optional) then
    select lower(pg_get_functiondef('public.echo_brain_equipment_freshness(text[])'::regprocedure::oid)) into v_definition;
    if position('equipment_brain_versions' in v_definition)=0
       or position('equipment_brain_invalidations' in v_definition)=0
       or position('before_snapshot' in v_definition)>0
       or position('after_snapshot' in v_definition)>0 then
      raise exception 'authenticated_security_definer_contract: freshness público expõe/ignora contrato incorreto';
    end if;

    select lower(pg_get_functiondef('public.echo_brain_register_recommendation_exposure(text,text,text,uuid,integer,numeric,text)'::regprocedure::oid)) into v_definition;
    if position('context_hash_required' in v_definition)=0
       or position('5 minutes' in v_definition)=0
       or position('pg_advisory_xact_lock' in v_definition)=0
       or position('echo_brain_recommendation_exposures' in v_definition)=0 then
      raise exception 'authenticated_security_definer_contract: exposure público sem deduplicação/limites';
    end if;
  end if;

  select lower(pg_get_functiondef('public.record_analytics_event(text,text,text,uuid,text,jsonb)'::regprocedure::oid)) into v_definition;
  if position('analytics_rate_limits' in v_definition)=0
     or position('5 minutes' in v_definition)=0
     or position('v_event_count > 120' in v_definition)=0
     or position('octet_length(v_metadata::text) > 4096' in v_definition)=0
     or position('auth.uid()' in v_definition)=0 then
    raise exception 'authenticated_security_definer_contract: analytics público sem limites/identidade esperados';
  end if;

  select lower(pg_get_functiondef('public.echo_identity_rollout_status_v1()'::regprocedure::oid)) into v_definition;
  if position('public_identity_enabled' in v_definition)=0
     or position('last_change_reason' in v_definition)>0
     or position('updated_by' in v_definition)>0 then
    raise exception 'authenticated_security_definer_contract: status público de Identity expõe/omite contrato incorreto';
  end if;

  select lower(pg_get_functiondef('public.echo_public_identity_cards_v1(uuid[])'::regprocedure::oid)) into v_definition;
  if position('identity_cards_enabled' in v_definition)=0
     or position('public_profiles_enabled' in v_definition)=0
     or position('p.email' in v_definition)>0
     or position($needle$'email'$needle$ in v_definition)>0 then
    raise exception 'authenticated_security_definer_contract: cards públicos de Identity fora do gate/superfície mínima';
  end if;

  select lower(pg_get_functiondef('public.echo_public_profile_v1(text)'::regprocedure::oid)) into v_definition;
  if position('echo_public_identity_cards_v1' in v_definition)=0
     or position('identity_cards_enabled' in v_definition)=0
     or position('email' in v_definition)>0 then
    raise exception 'authenticated_security_definer_contract: perfil público de Identity contorna composição segura';
  end if;

  select lower(pg_get_functiondef('public.echo_can_preview_pulse()'::regprocedure::oid)) into v_definition;
  if position('auth.uid' in v_definition)=0 or position('is_admin' in v_definition)=0 then
    raise exception 'authenticated_security_definer_contract: autorização do preview privado incompleta';
  end if;

  select lower(pg_get_functiondef('public.echo_pulse_private_preview_feed()'::regprocedure::oid)) into v_definition;
  if position('echo_can_preview_pulse' in v_definition)=0 then
    raise exception 'authenticated_security_definer_contract: feed privado não delega a autorização';
  end if;

  select count(*) into v_count from pg_policies where schemaname='public'
    and (coalesce(qual,'') like '%current_user_is_admin(%' or coalesce(with_check,'') like '%current_user_is_admin(%');
  if v_count=0 then raise exception 'authenticated_security_definer_contract: current_user_is_admin sem consumidor RLS'; end if;

  select count(*) into v_count from pg_policies where schemaname='public'
    and (coalesce(qual,'') like '%echo_is_admin(%' or coalesce(with_check,'') like '%echo_is_admin(%');
  if v_count=0 then raise exception 'authenticated_security_definer_contract: echo_is_admin sem consumidor RLS'; end if;

  select count(*) into v_count from pg_policies where schemaname='public'
    and (coalesce(qual,'') like '%is_admin(%' or coalesce(with_check,'') like '%is_admin(%');
  if v_count=0 then raise exception 'authenticated_security_definer_contract: is_admin sem consumidor RLS'; end if;

  select count(*) into v_count from pg_policies where schemaname='public'
    and (coalesce(qual,'') like '%is_blocked(%' or coalesce(with_check,'') like '%is_blocked(%');
  if v_count=0 then raise exception 'authenticated_security_definer_contract: is_blocked sem consumidor RLS'; end if;
end $$;

select jsonb_build_object(
  'authenticated_security_definer_total',count(*),
  'anon_executable',count(*) filter(where has_function_privilege('anon',p.oid,'EXECUTE')),
  'fixed_search_path',count(*) filter(where coalesce(array_to_string(p.proconfig,','),'') like '%search_path=%')
) as authenticated_security_definer_contract
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.prosecdef
  and has_function_privilege('authenticated',p.oid,'EXECUTE');
