-- EchoArena — nenhuma ação/papel deve avaliar policies permissivas duplicadas.

do $$
declare
  v_count integer;
begin
  with expanded as (
    select
      p.tablename,
      p.policyname,
      action_name,
      role_name
    from pg_policies p
    cross join lateral unnest(
      case p.cmd
        when 'ALL' then array['SELECT', 'INSERT', 'UPDATE', 'DELETE']
        else array[p.cmd]
      end
    ) action_name
    cross join lateral unnest(
      case
        when 'public' = any(p.roles) then array['anon'::name, 'authenticated'::name]
        else p.roles
      end
    ) role_name
    where p.schemaname = 'public'
      and p.permissive = 'PERMISSIVE'
  ), duplicates as (
    select tablename, action_name, role_name, count(*)
    from expanded
    where role_name in ('anon', 'authenticated')
    group by tablename, action_name, role_name
    having count(*) > 1
  )
  select count(*) into v_count from duplicates;

  if v_count <> 0 then
    raise exception 'rls_performance_regression: % duplicated permissive policy group(s)', v_count;
  end if;
end $$;

select 'no_multiple_permissive_policies' as check_name, true as passed;
