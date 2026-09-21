begin;

do $$
declare
  v_missing text[];
  v_bad_grants integer;
  v_institutional_rows integer;
begin
  select array_agg(required.name order by required.name)
  into v_missing
  from (values
    ('echo_community_reputation'),
    ('echo_community_specialty_stats')
  ) required(name)
  where not exists(
    select 1
    from information_schema.columns c
    where c.table_schema='public'
      and c.table_name=required.name
      and c.column_name='scout_eligible'
      and c.data_type='boolean'
      and c.is_nullable='NO'
  );
  if v_missing is not null then
    raise exception 'missing_non_null_scout_eligible:%',v_missing;
  end if;

  if to_regprocedure('private.echo_is_scout_eligible_v1(uuid)') is null then
    raise exception 'missing_private_scout_eligibility_rule';
  end if;

  select count(*) into v_bad_grants
  from (values ('public'),('anon'),('authenticated')) roles(role_name)
  where has_function_privilege(roles.role_name,'private.echo_is_scout_eligible_v1(uuid)','EXECUTE');
  if v_bad_grants<>0 then
    raise exception 'private_scout_eligibility_rule_is_executable_by_client_roles';
  end if;

  if not exists(
    select 1 from pg_trigger
    where tgname='echo_research_institutional_scout_guard_v1' and not tgisinternal
  ) then
    raise exception 'missing_institutional_submission_guard';
  end if;

  if position('institutional_accounts_do_not_join_scouts' in pg_get_functiondef(
    'private.echo_block_institutional_scout_submission_v1()'::regprocedure
  ))=0 then
    raise exception 'institutional_submission_guard_has_wrong_contract';
  end if;

  select count(*) into v_institutional_rows
  from public.echo_community_reputation r
  where (
    exists(select 1 from public.echo_founder_authority f where f.user_id=r.user_id)
    or exists(select 1 from public.admin_staff_memberships s where s.user_id=r.user_id and s.active=true)
    or exists(select 1 from public.profiles p where p.id=r.user_id and (lower(coalesce(p.role,''))='admin' or coalesce(p.is_admin,false)))
  ) and r.scout_eligible<>false;
  if v_institutional_rows<>0 then
    raise exception 'institutional_reputation_rows_must_be_scout_eligible_false';
  end if;

  if exists(
    select 1 from public.echo_community_specialty_stats s
    where (
      exists(select 1 from public.echo_founder_authority f where f.user_id=s.user_id)
      or exists(select 1 from public.admin_staff_memberships a where a.user_id=s.user_id and a.active=true)
      or exists(select 1 from public.profiles p where p.id=s.user_id and (lower(coalesce(p.role,''))='admin' or coalesce(p.is_admin,false)))
    ) and s.scout_eligible<>false
  ) then
    raise exception 'institutional_specialty_rows_must_be_scout_eligible_false';
  end if;
end;
$$;

rollback;
