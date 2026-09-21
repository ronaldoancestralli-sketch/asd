-- First Discovery Integrity V2 — contrato read-only.
-- Executar somente no SNV após as migrations de Identity/Reputation V2.

begin;

do $$
declare
  v_index text;
  v_def text;
  v_proc regprocedure := to_regprocedure('public.admin_review_research_contribution_v1(uuid,text,text,boolean)');
begin
  select indexdef into v_index
  from pg_indexes
  where schemaname='public' and indexname='echo_research_first_discovery_knowledge_unique';

  if v_index is null
     or position('UNIQUE INDEX' in upper(v_index))=0
     or position('knowledge_fingerprint' in v_index)=0
     or position('is_first_discovery' in v_index)=0
     or position('verified' in v_index)=0 then
    raise exception 'first discovery canonical unique index missing or incomplete';
  end if;

  if exists(
    select 1 from pg_indexes
    where schemaname='public' and indexname='echo_research_first_discovery_unique'
  ) then
    raise exception 'legacy textual first discovery unique index still active';
  end if;

  if v_proc is null then
    raise exception 'research review RPC missing';
  end if;

  select pg_get_functiondef(v_proc::oid) into v_def;
  if position('first_discovery_requires_verified' in v_def)=0
     or position('first_discovery_knowledge_missing' in v_def)=0
     or position('pg_advisory_xact_lock' in v_def)=0
     or position('hashtextextended' in v_def)=0
     or position('knowledge_fingerprint' in v_def)=0
     or position('first_discovery_already_claimed' in v_def)=0 then
    raise exception 'research review RPC lost first discovery integrity guards';
  end if;

  if not has_function_privilege('authenticated',v_proc,'EXECUTE')
     or not has_function_privilege('service_role',v_proc,'EXECUTE') then
    raise exception 'research review RPC expected execution grants missing';
  end if;
  if has_function_privilege('anon',v_proc,'EXECUTE') then
    raise exception 'anon can execute research review RPC';
  end if;
end $$;

rollback;
