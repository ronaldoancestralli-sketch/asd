-- EchoArena — regressão read-only da persistência de Comparações.
-- Não cria nem altera dados.

do $$
declare
  v_count integer;
  v_proc regprocedure := to_regprocedure('public.toggle_saved_build_comparison(uuid,uuid,text)');
  v_definition text;
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='hero_comparisons'
      and policyname='hero_compare_read'
  ) then
    raise exception 'comparison_regression: redundant hero_compare_read returned';
  end if;

  select count(*) into v_count
  from pg_policies
  where schemaname='public'
    and tablename='hero_comparisons'
    and roles::text ilike '%authenticated%'
    and cmd in ('ALL','SELECT');
  if v_count <> 1 then
    raise exception 'comparison_regression: hero_comparisons has % overlapping auth ALL/SELECT policies', v_count;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='build_comparisons'
      and policyname='build_comparisons_admin_all'
  ) then
    raise exception 'comparison_regression: build_comparisons_admin_all returned';
  end if;

  select count(*) into v_count
  from (
    values
      ('build_comparisons_admin_insert','INSERT'),
      ('build_comparisons_admin_update','UPDATE'),
      ('build_comparisons_admin_delete','DELETE')
  ) expected(policyname, cmd)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename='build_comparisons'
      and p.policyname=expected.policyname
      and p.cmd=expected.cmd
      and p.roles::text ilike '%authenticated%'
      and (
        coalesce(p.qual,'') ilike '%is_admin%'
        or coalesce(p.with_check,'') ilike '%is_admin%'
      )
  );
  if v_count <> 0 then
    raise exception 'comparison_regression: % Admin direct-write policy(ies) missing', v_count;
  end if;

  if not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename='build_comparisons'
      and p.policyname='build_comparisons_owner_read'
      and p.cmd='SELECT'
      and p.roles::text ilike '%authenticated%'
      and coalesce(p.qual,'') ilike '%auth.uid%'
  ) then
    raise exception 'comparison_regression: owner read policy missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public'
      and tablename='build_comparisons'
      and indexname='build_comparisons_user_pair_uidx'
      and indexdef ilike '%unique%'
      and indexdef ilike '%user_id%left_build_id%right_build_id%'
  ) then
    raise exception 'comparison_regression: unique saved-comparison index missing';
  end if;

  if to_regprocedure('public.toggle_build_comparison(uuid,uuid,text)') is not null then
    raise exception 'comparison_regression: duplicate toggle_build_comparison RPC returned';
  end if;

  if v_proc is null then
    raise exception 'comparison_regression: toggle_saved_build_comparison RPC missing';
  end if;

  if not (select p.prosecdef from pg_proc p where p.oid=v_proc) then
    raise exception 'comparison_regression: canonical comparison RPC lost SECURITY DEFINER';
  end if;

  if has_function_privilege('anon', v_proc, 'EXECUTE') then
    raise exception 'comparison_regression: anon can execute canonical comparison RPC';
  end if;

  if not has_function_privilege('authenticated', v_proc, 'EXECUTE')
     or not has_function_privilege('service_role', v_proc, 'EXECUTE') then
    raise exception 'comparison_regression: expected authenticated/service execute missing';
  end if;

  select pg_get_functiondef(v_proc) into v_definition;
  if v_definition not ilike '%authentication_required%'
     or v_definition not ilike '%invalid_build_comparison_pair%'
     or v_definition not ilike '%comparison_left_build_unavailable%'
     or v_definition not ilike '%comparison_right_build_must_be_public%'
     or v_definition not ilike '%comparison_heroes_must_match%'
     or v_definition not ilike '%visibility=''public''%'
     or v_definition not ilike '%status=''published''%'
     or v_definition not ilike '%deleted_at is null%' then
    raise exception 'comparison_regression: RPC validation contract changed';
  end if;
end $$;

select
  (select count(*) from public.hero_comparisons) as hero_comparisons,
  (select count(*) from public.build_comparisons) as build_comparisons,
  has_function_privilege('anon', 'public.toggle_saved_build_comparison(uuid,uuid,text)', 'EXECUTE') as anon_can_toggle,
  has_function_privilege('authenticated', 'public.toggle_saved_build_comparison(uuid,uuid,text)', 'EXECUTE') as authenticated_can_toggle;
