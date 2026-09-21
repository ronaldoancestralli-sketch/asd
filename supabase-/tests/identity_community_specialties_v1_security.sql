-- Community Specialties V1 — contrato de segurança e consistência.
begin;

do $$
declare
  v_catalog integer;
  v_rules integer;
  v_def text;
  v_compact text;
begin
  select count(*) into v_catalog from public.echo_community_specialty_catalog where active=true;
  if v_catalog<>4 then raise exception 'specialty catalog count mismatch'; end if;

  select count(*) into v_rules from public.echo_community_specialty_rules where policy_version='specialty-v1-shadow';
  if v_rules<>12 then raise exception 'specialty rank rule count mismatch'; end if;

  if not has_table_privilege('authenticated','public.echo_community_specialty_catalog','SELECT')
     or not has_table_privilege('authenticated','public.echo_community_specialty_rules','SELECT')
     or not has_table_privilege('authenticated','public.echo_community_specialty_stats','SELECT') then
    raise exception 'authenticated cannot read specialty transparency tables';
  end if;

  if has_table_privilege('authenticated','public.echo_community_specialty_catalog','INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.echo_community_specialty_rules','INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.echo_community_specialty_stats','INSERT,UPDATE,DELETE') then
    raise exception 'authenticated can mutate specialty state';
  end if;

  if has_table_privilege('anon','public.echo_community_specialty_catalog','SELECT')
     or has_table_privilege('anon','public.echo_community_specialty_rules','SELECT')
     or has_table_privilege('anon','public.echo_community_specialty_stats','SELECT') then
    raise exception 'shadow specialties leaked to anon';
  end if;

  select pg_get_functiondef('public.echo_recompute_community_reputation(uuid)'::regprocedure::oid) into v_def;
  v_compact:=regexp_replace(replace(lower(v_def),'::text',''),'[[:space:]]+','','g');
  if position($needle$contribution_typein('hero_skill_level','hero_passive')then'hero_research'$needle$ in v_compact)=0
     or position($needle$contribution_type='equipment_stat'then'arsenal'$needle$ in v_compact)=0
     or position($needle$contribution_type='patch_change'then'patch_hunter'$needle$ in v_compact)=0
     or position($needle$contribution_type='counter_evidence'then'counter_research'$needle$ in v_compact)=0 then
    raise exception 'specialty contribution mapping missing';
  end if;
  if position('groupbyspecialty_key,knowledge_fingerprint' in v_compact)=0 then
    raise exception 'specialty reputation does not dedupe by knowledge';
  end if;
  if position('reviewed_byisdistinctfromcontributor_id' in v_compact)=0
     and position('e.reviewer_idisdistinctfromc.contributor_id' in v_compact)=0 then
    raise exception 'specialty reputation lost independent review guard';
  end if;
  if position($needle$'specialty-v1-shadow'$needle$ in v_compact)=0 then
    raise exception 'specialty policy version missing from recompute';
  end if;

  if has_function_privilege('authenticated','public.echo_recompute_community_reputation(uuid)','EXECUTE') then
    raise exception 'client can invoke specialty/general reputation recompute directly';
  end if;
end $$;

rollback;
