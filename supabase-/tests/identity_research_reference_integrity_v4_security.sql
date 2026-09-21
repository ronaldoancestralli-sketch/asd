-- Research Reference Integrity V4 — contrato estrutural de segurança.
begin;

do $$
declare
  v_def text;
  v_compact text;
begin
  select pg_get_functiondef('public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text)'::regprocedure::oid)
  into v_def;
  v_compact:=regexp_replace(lower(v_def),'[[:space:]]+','','g');

  if position('invalid_research_hero' in v_def)=0
     or position('invalid_research_skill' in v_def)=0
     or position('research_skill_hero_mismatch' in v_def)=0 then
    raise exception 'research reference validation missing';
  end if;
  if position('hero_skill_reference_required' in v_def)=0
     or position('research_skill_level_required' in v_def)=0
     or position('research_skill_level_out_of_range' in v_def)=0 then
    raise exception 'hero skill level structured validation missing';
  end if;
  if position('h.id=p_hero_idandh.enabled=true' in v_compact)=0 then
    raise exception 'hero reference does not require enabled catalog row';
  end if;
  if position('s.id=p_skill_idands.enabled=true' in v_compact)=0
     or position('v_skill_hero_idisdistinctfromp_hero_id' in v_compact)=0 then
    raise exception 'skill reference is not bound to selected hero';
  end if;
  if position($needle$v_subject_key:=v_hero_name||' · '||v_skill_name||' · nível '||v_skill_level::text$needle$ in v_def)=0 then
    raise exception 'hero skill subject is not canonical server-side';
  end if;
  if (position($needle$v_fingerprint:=public.echo_research_submission_fingerprint$needle$ in v_compact)=0
      and position($needle$v_submission_fingerprint:=public.echo_research_submission_fingerprint$needle$ in v_compact)=0)
     or (position($needle$v_fingerprint,'pending',false$needle$ in v_compact)=0
         and position($needle$v_submission_fingerprint,v_knowledge_fingerprint,v_policy.policy_version,'pending',false$needle$ in v_compact)=0) then
    raise exception 'reference hardening lost pending/dedupe boundary';
  end if;
  if not has_function_privilege('authenticated','public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text)','EXECUTE') then
    raise exception 'authenticated lost research submit execute';
  end if;
  if has_function_privilege('anon','public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text)','EXECUTE') then
    raise exception 'anon can submit structured research';
  end if;
end $$;

rollback;
