-- Auditoria comunitária de habilidades — privilégios e reconhecimento público.
begin;

do $$
declare
  v_submit text;
  v_public text;
begin
  if has_function_privilege('anon','public.echo_submit_hero_skill_audit_v1(uuid,uuid,text,text,text,text,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.echo_submit_hero_skill_audit_v1(uuid,uuid,text,text,text,text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.echo_submit_hero_skill_audit_v1(uuid,uuid,text,text,text,text,text)','EXECUTE') then
    raise exception 'hero skill audit submit privileges are unsafe';
  end if;

  if not has_function_privilege('anon','public.echo_public_hero_audit_credits_v1(uuid[])','EXECUTE')
     or not has_function_privilege('authenticated','public.echo_public_hero_audit_credits_v1(uuid[])','EXECUTE')
     or not has_function_privilege('service_role','public.echo_public_hero_audit_credits_v1(uuid[])','EXECUTE') then
    raise exception 'hero skill public audit credit privileges are incomplete';
  end if;

  if has_table_privilege('anon','public.echo_research_contributions','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.echo_research_contributions','INSERT,UPDATE,DELETE') then
    raise exception 'hero skill audit bypasses contribution RLS';
  end if;

  select lower(pg_get_functiondef('public.echo_submit_hero_skill_audit_v1(uuid,uuid,text,text,text,text,text)'::regprocedure::oid)) into v_submit;
  if position('security invoker' in v_submit)=0
     or position('hero-skill-audit-v1' in v_submit)=0
     or position('echo_submit_research_contribution_v1' in v_submit)=0
     or position('https://' in v_submit)=0 then
    raise exception 'hero skill audit submit contract incomplete';
  end if;

  select lower(pg_get_functiondef('public.echo_public_hero_audit_credits_v1(uuid[])'::regprocedure::oid)) into v_public;
  if position('security definer' in v_public)=0
     or position('cardinality(p_hero_ids) > 50' in v_public)=0
     or position('profile_visibility = ''public''' in v_public)=0
     or position('review_confirmation_state = ''confirmed''' in v_public)=0
     or position('f.confirmer_id is distinct from c.contributor_id' in v_public)=0
     or position('f.confirmer_id is distinct from e.reviewer_id' in v_public)=0 then
    raise exception 'hero skill public audit credit contract incomplete';
  end if;
end;
$$;

rollback;

