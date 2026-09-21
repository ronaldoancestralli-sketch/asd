-- EchoArena — regression test da superfície pública de segurança.
-- Deve abortar em qualquer regressão das garantias endurecidas nesta branch.

begin;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute');
  if v_count <> 0 then
    raise exception 'security_regression: % SECURITY DEFINER function(s) executable by anon', v_count;
  end if;

  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and (roles::text ilike '%anon%' or roles::text ilike '%public%')
    and (
      coalesce(qual, '') ilike '%is_admin%'
      or coalesce(with_check, '') ilike '%is_admin%'
    );
  if v_count <> 0 then
    raise exception 'security_regression: % anon/PUBLIC policy(ies) still depend on is_admin()', v_count;
  end if;

  if has_function_privilege('anon', 'public.is_admin()', 'execute') then
    raise exception 'security_regression: anon can execute is_admin()';
  end if;
  if not has_function_privilege('authenticated', 'public.is_admin()', 'execute') then
    raise exception 'security_regression: authenticated lost is_admin() required by admin-aware policies';
  end if;

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prorettype = 'pg_catalog.trigger'::regtype
    and (
      has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute')
    );
  if v_count <> 0 then
    raise exception 'security_regression: % trigger function(s) exposed as direct Data API RPC', v_count;
  end if;

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'export_site', 'feature_is_enabled', 'feature_requires_login',
      'get_build', 'get_hero', 'get_site_settings', 'site_status',
      'export_build', 'export_hero'
    )
    and p.prosecdef;
  if v_count <> 0 then
    raise exception 'security_regression: % public read helper(s) reverted to SECURITY DEFINER', v_count;
  end if;

  select count(*) into v_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('mv_popular_builds', 'mv_hero_ranking', 'mv_equipment_ranking')
    and (
      has_table_privilege('anon', c.oid, 'select')
      or has_table_privilege('authenticated', c.oid, 'select')
    );
  if v_count <> 0 then
    raise exception 'security_regression: % materialized view(s) exposed to Data API roles', v_count;
  end if;

  if not exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm'
      and n.nspname = 'extensions'
  ) then
    raise exception 'security_regression: pg_trgm is not in extensions schema';
  end if;

  if has_table_privilege('anon', 'public.admin_secrets', 'select')
     or has_table_privilege('authenticated', 'public.admin_secrets', 'select')
     or has_table_privilege('authenticated', 'public.admin_secrets', 'insert')
     or has_table_privilege('authenticated', 'public.admin_secrets', 'update')
     or has_table_privilege('authenticated', 'public.admin_secrets', 'delete') then
    raise exception 'security_regression: admin_secrets acquired direct Data API privileges';
  end if;

  -- Policies permissivas fracas já causaram bypass de regras mais estritas.
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and policyname in ('comments_insert_own', 'profiles_update_own', 'comments_own');
  if v_count <> 0 then
    raise exception 'security_regression: weak legacy permissive policies reintroduced = %', v_count;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'comments'
      and policyname = 'comments_insert'
      and coalesce(with_check, '') ilike '%is_blocked%'
  ) then
    raise exception 'security_regression: comments_insert no longer enforces is_blocked()';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_self_upd'
      and coalesce(qual, '') ilike '%is_blocked%'
      and coalesce(with_check, '') ilike '%role%'
  ) then
    raise exception 'security_regression: profiles_self_upd lost blocked/role protections';
  end if;
end
$$;

-- Prova comportamental: um comentário oculto inserido dentro desta transação
-- não pode ser lido como anon. O rollback remove totalmente o dado de teste.
insert into public.comments(message, is_hidden)
values ('__echoarena_security_hidden_comment_test__', true);

set local role anon;

select 1 / (
  case when exists (
    select 1
    from public.comments
    where message = '__echoarena_security_hidden_comment_test__'
  ) then 0 else 1 end
) as hidden_comment_not_visible_to_anon;

select 1 / (
  case when exists (
    select 1 from public.builds where coalesce(is_public, false) = false
  ) then 0 else 1 end
) as nonpublic_builds_not_visible_to_anon;

select 1 / (
  case when exists (
    select 1 from public.equipment_tiers where enabled = false
  ) then 0 else 1 end
) as disabled_equipment_tiers_not_visible_to_anon;

select count(*) as homepage_rows from public.v_homepage;

reset role;
rollback;
