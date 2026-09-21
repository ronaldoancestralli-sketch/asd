-- EchoArena — regressão read-only da fronteira RLS/transacional de Builds.
-- Este arquivo não cria nem altera dados.

do $$
declare
  v_count integer;
  v_proc regprocedure;
begin
  -- Policies legadas não podem reabrir escrita direta ou duplicar o OR permissivo.
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'builds_admin_all', 'builds_insert_own', 'builds_update_own', 'builds_delete_own',
      'builds_public_or_owner_read',
      'build_items_admin_all', 'build_items_insert_own_build',
      'build_items_update_own_build', 'build_items_delete_own_build',
      'build_tag_links_admin_manage', 'build_tag_links_owner_manage',
      'build_versions_admin_all', 'build_versions_owner_insert',
      'build_ratings_admin_all', 'build_ratings_insert_own',
      'build_ratings_update_own', 'build_ratings_delete_own',
      'build_tags_admin_manage', 'build_compare_read'
    );
  if v_count <> 0 then
    raise exception 'build_rls_regression: % legacy/overlapping policy(ies) reintroduced', v_count;
  end if;

  -- Tabelas transacionais: escrita direta authenticated permanece Admin-only.
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and tablename in ('builds','build_items','build_tag_links','build_tags','build_versions')
    and cmd in ('INSERT','UPDATE','DELETE')
    and roles::text ilike '%authenticated%'
    and (
      coalesce(qual, '') not ilike '%is_admin%'
      and coalesce(with_check, '') not ilike '%is_admin%'
    );
  if v_count <> 0 then
    raise exception 'build_rls_regression: % direct authenticated write policy(ies) are not Admin-only', v_count;
  end if;

  -- Policies Admin explícitas precisam existir por ação nas tabelas transacionais.
  select count(*) into v_count
  from (
    values
      ('builds','builds_admin_insert','INSERT'),
      ('builds','builds_admin_update','UPDATE'),
      ('builds','builds_admin_delete','DELETE'),
      ('build_items','build_items_admin_insert','INSERT'),
      ('build_items','build_items_admin_update','UPDATE'),
      ('build_items','build_items_admin_delete','DELETE'),
      ('build_tag_links','build_tag_links_admin_insert','INSERT'),
      ('build_tag_links','build_tag_links_admin_update','UPDATE'),
      ('build_tag_links','build_tag_links_admin_delete','DELETE'),
      ('build_tags','build_tags_admin_insert','INSERT'),
      ('build_tags','build_tags_admin_update','UPDATE'),
      ('build_tags','build_tags_admin_delete','DELETE'),
      ('build_versions','build_versions_admin_insert','INSERT'),
      ('build_versions','build_versions_admin_update','UPDATE'),
      ('build_versions','build_versions_admin_delete','DELETE')
  ) expected(tablename, policyname, cmd)
  where not exists (
    select 1
    from pg_policies p
    where p.schemaname='public'
      and p.tablename=expected.tablename
      and p.policyname=expected.policyname
      and p.cmd=expected.cmd
      and p.roles::text ilike '%authenticated%'
      and (
        coalesce(p.qual,'') ilike '%is_admin%'
        or coalesce(p.with_check,'') ilike '%is_admin%'
      )
  );
  if v_count <> 0 then
    raise exception 'build_rls_regression: % required Admin write policy(ies) missing/incorrect', v_count;
  end if;

  -- Ratings: escrita própria + Admin é intencional, mas INSERT só em build
  -- realmente pública/publicada/não deletada e nunca na própria build.
  select count(*) into v_count
  from (
    values
      ('build_ratings_authenticated_insert','INSERT'),
      ('build_ratings_authenticated_update','UPDATE'),
      ('build_ratings_authenticated_delete','DELETE')
  ) expected(policyname, cmd)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename='build_ratings'
      and p.policyname=expected.policyname
      and p.cmd=expected.cmd
      and p.roles::text ilike '%authenticated%'
      and (
        coalesce(p.qual,'') ilike '%is_admin%'
        or coalesce(p.with_check,'') ilike '%is_admin%'
      )
  );
  if v_count <> 0 then
    raise exception 'build_rls_regression: rating write policy set incomplete = %', v_count;
  end if;

  if not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename='build_ratings'
      and p.policyname='build_ratings_authenticated_insert'
      and coalesce(p.with_check,'') ilike '%is_public%'
      and coalesce(p.with_check,'') ilike '%visibility%public%'
      and coalesce(p.with_check,'') ilike '%status%published%'
      and coalesce(p.with_check,'') ilike '%deleted_at%'
      and coalesce(p.with_check,'') ilike '%auth.uid%'
  ) then
    raise exception 'build_rls_regression: rating INSERT lost hardened public-build requirements';
  end if;

  -- Leitura pública de build e dependências deve permanecer endurecida.
  if not exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.tablename='builds'
      and p.policyname='builds_anon_read' and p.cmd='SELECT'
      and p.roles::text ilike '%anon%'
      and coalesce(p.qual,'') ilike '%is_public%'
      and coalesce(p.qual,'') ilike '%visibility%public%'
      and coalesce(p.qual,'') ilike '%status%published%'
      and coalesce(p.qual,'') ilike '%deleted_at%'
  ) then
    raise exception 'build_rls_regression: builds_anon_read lost hardened publication criteria';
  end if;

  select count(*) into v_count
  from (
    values
      ('build_items','build_items_anon_read'),
      ('build_tag_links','build_tag_links_anon_read'),
      ('build_ratings','build_ratings_anon_read')
  ) expected(tablename, policyname)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename=expected.tablename
      and p.policyname=expected.policyname
      and p.cmd='SELECT'
      and p.roles::text ilike '%anon%'
      and coalesce(p.qual,'') ilike '%is_public%'
      and coalesce(p.qual,'') ilike '%visibility%public%'
      and coalesce(p.qual,'') ilike '%status%published%'
      and coalesce(p.qual,'') ilike '%deleted_at%'
  );
  if v_count <> 0 then
    raise exception 'build_rls_regression: % dependent anon read policy(ies) lost publication criteria', v_count;
  end if;

  -- RPCs transacionais devem continuar privilegiadas, mas nunca anônimas.
  foreach v_proc in array array[
    to_regprocedure('public.save_user_build(uuid,uuid,text,text,text,text,jsonb,text[])'),
    to_regprocedure('public.clone_build(uuid)')
  ] loop
    if v_proc is null then
      raise exception 'build_rls_regression: required transactional RPC missing';
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid=v_proc) then
      raise exception 'build_rls_regression: % is no longer SECURITY DEFINER', v_proc;
    end if;
    if has_function_privilege('anon', v_proc, 'EXECUTE') then
      raise exception 'build_rls_regression: anon can execute %', v_proc;
    end if;
    if not has_function_privilege('authenticated', v_proc, 'EXECUTE') then
      raise exception 'build_rls_regression: authenticated lost execute on %', v_proc;
    end if;
  end loop;

  -- build_comparisons deve manter apenas uma policy permissiva para SELECT/auth.
  select count(*) into v_count
  from pg_policies
  where schemaname='public'
    and tablename='build_comparisons'
    and roles::text ilike '%authenticated%'
    and cmd in ('ALL','SELECT');
  if v_count <> 1 then
    raise exception 'build_rls_regression: build_comparisons has % overlapping auth ALL/SELECT policies', v_count;
  end if;
end $$;

select
  (select count(*) from public.builds where is_public=true and visibility='public' and status='published' and deleted_at is null) as public_builds,
  (select count(*) from pg_policies where schemaname='public' and tablename in ('builds','build_items','build_tag_links','build_ratings','build_versions','build_comparisons','build_tags')) as build_module_policies,
  has_function_privilege('anon', 'public.save_user_build(uuid,uuid,text,text,text,text,jsonb,text[])', 'EXECUTE') as anon_can_save_build,
  has_function_privilege('authenticated', 'public.save_user_build(uuid,uuid,text,text,text,text,jsonb,text[])', 'EXECUTE') as authenticated_can_save_build;
