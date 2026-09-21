-- Echo Identity V5 — missões orientativas sem recompensa paralela.
-- Executar somente no SNV após 20260825112000.
begin;

do $$
declare
  v_missions text;
  v_guardrails text;
begin
  if (select count(*) from public.echo_research_mission_catalog where active and policy_version='missions-v5-shadow')<>6 then
    raise exception 'V5 mission catalog count mismatch';
  end if;
  if not exists(select 1 from public.echo_research_mission_catalog where mission_key='first_signal' and metric_key='accepted_knowledge' and target_value=1)
     or not exists(select 1 from public.echo_research_mission_catalog where mission_key='verified_trio' and metric_key='verified_knowledge' and target_value=3)
     or not exists(select 1 from public.echo_research_mission_catalog where mission_key='two_fronts' and metric_key='active_specialties' and target_value=2)
     or not exists(select 1 from public.echo_research_mission_catalog where mission_key='first_discovery' and metric_key='first_discoveries' and target_value=1) then
    raise exception 'V5 mission targets mismatch';
  end if;

  if not exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='echo_research_mission_catalog' and c.relrowsecurity
  ) then raise exception 'V5 mission catalog RLS missing'; end if;
  if not has_table_privilege('authenticated','public.echo_research_mission_catalog','SELECT')
     or has_table_privilege('authenticated','public.echo_research_mission_catalog','INSERT,UPDATE,DELETE')
     or has_table_privilege('anon','public.echo_research_mission_catalog','SELECT') then
    raise exception 'V5 mission catalog privileges are unsafe';
  end if;

  if not has_function_privilege('authenticated','public.echo_my_research_missions_v5()','EXECUTE')
     or not has_function_privilege('service_role','public.echo_my_research_missions_v5()','EXECUTE')
     or not has_function_privilege('authenticated','public.echo_my_research_guardrails_v5()','EXECUTE')
     or not has_function_privilege('service_role','public.echo_my_research_guardrails_v5()','EXECUTE')
     or has_function_privilege('anon','public.echo_my_research_missions_v5()','EXECUTE')
     or has_function_privilege('anon','public.echo_my_research_guardrails_v5()','EXECUTE') then
    raise exception 'V5 mission RPC privileges are unsafe';
  end if;

  select lower(pg_get_functiondef('public.echo_my_research_missions_v5()'::regprocedure::oid)) into v_missions;
  select lower(pg_get_functiondef('public.echo_my_research_guardrails_v5()'::regprocedure::oid)) into v_guardrails;
  if position('echo_community_reputation' in v_missions)=0
     or position('echo_community_specialty_stats' in v_missions)=0
     or position($needle$'missions-v5-shadow'$needle$ in v_missions)=0
     or position('p.value_now>=p.target_value' in replace(v_missions,' ',''))=0
     or position('false' in v_missions)=0 then
    raise exception 'V5 missions are not derived from confirmed snapshots';
  end if;
  if position('insert into public.echo_community_reputation' in v_missions)>0
     or position('update public.echo_community_reputation' in v_missions)>0
     or position('echo_identity_badges' in v_missions)>0
     or position('insert into public.echo_research_contributions' in v_missions)>0 then
    raise exception 'V5 missions can mutate reputation, badges or research';
  end if;
  if position('missions_award_reputation' in v_guardrails)=0
     or position($needle$'missions_award_reputation',false$needle$ in replace(v_guardrails,' ',''))=0
     or position('awaiting_independent_confirmation' in v_guardrails)=0
     or position('max_pending_per_member' in v_guardrails)=0 then
    raise exception 'V5 personal guardrail summary contract incomplete';
  end if;
end $$;

rollback;
