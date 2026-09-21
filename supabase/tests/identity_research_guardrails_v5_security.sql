-- Echo Identity V5 — limites anti-spam, imutabilidade e privilégios.
-- Executar somente no SNV após 20260825110000.
begin;

do $$
declare
  v_policy public.echo_research_guardrail_policy%rowtype;
  v_submit text;
  v_immutable text;
begin
  select * into v_policy from public.echo_research_guardrail_policy where singleton=true;
  if not found
     or v_policy.policy_version<>'research-hardening-v5-shadow'
     or v_policy.submission_window_minutes<>1440
     or v_policy.max_submissions_per_window<>30
     or v_policy.max_pending_per_member<>12
     or v_policy.max_pending_per_member_knowledge<>2
     or v_policy.max_pending_per_knowledge_global<>12
     or v_policy.knowledge_cooldown_minutes<>360
     or v_policy.max_review_revisions_per_window<>6
     or v_policy.independent_confirmation_required is not true then
    raise exception 'V5 guardrail policy mismatch';
  end if;

  if not exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='echo_research_guardrail_policy' and c.relrowsecurity
  ) then raise exception 'V5 guardrail policy RLS missing'; end if;

  if not has_table_privilege('authenticated','public.echo_research_guardrail_policy','SELECT')
     or has_table_privilege('authenticated','public.echo_research_guardrail_policy','INSERT,UPDATE,DELETE')
     or has_table_privilege('anon','public.echo_research_guardrail_policy','SELECT') then
    raise exception 'V5 guardrail policy privileges are unsafe';
  end if;

  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='echo_research_contributions'
      and column_name='guardrail_policy_version' and is_nullable='NO'
  ) then raise exception 'V5 contribution policy version missing'; end if;

  select pg_get_functiondef('public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text)'::regprocedure::oid)
  into v_submit;
  if position('echo-research-member:' in v_submit)=0
     or position('echo-research-knowledge:' in v_submit)=0
     or position('research_pending_queue_full' in v_submit)=0
     or position('research_knowledge_pending_limit' in v_submit)=0
     or position('research_knowledge_queue_saturated' in v_submit)=0
     or position('research_knowledge_cooldown' in v_submit)=0
     or position($needle$'pending',false$needle$ in replace(v_submit,' ',''))=0
     or position('none_until_independent_confirmation' in v_submit)=0 then
    raise exception 'V5 submission guardrails incomplete';
  end if;

  select pg_get_functiondef('public.echo_research_submission_immutable_v5()'::regprocedure::oid)
  into v_immutable;
  if position('research_submission_is_immutable' in v_immutable)=0
     or position('new.contributor_id is distinct from old.contributor_id' in lower(v_immutable))=0
     or position('new.payload is distinct from old.payload' in lower(v_immutable))=0
     or position('new.evidence_reference is distinct from old.evidence_reference' in lower(v_immutable))=0
     or position('new.knowledge_fingerprint is distinct from old.knowledge_fingerprint' in lower(v_immutable))=0 then
    raise exception 'V5 immutable submission contract incomplete';
  end if;

  if not exists(
    select 1 from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='echo_research_contributions'
      and t.tgname='zz_echo_research_submission_immutable_v5' and not t.tgisinternal
  ) then raise exception 'V5 immutable submission trigger missing'; end if;

  if not has_function_privilege('authenticated','public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text)','EXECUTE')
     or has_function_privilege('anon','public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.echo_research_submission_immutable_v5()','EXECUTE') then
    raise exception 'V5 submission function privileges are unsafe';
  end if;
end $$;

rollback;
