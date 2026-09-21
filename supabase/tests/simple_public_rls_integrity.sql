-- EchoArena — regressão read-only da consolidação RLS simples.
-- Não cria nem altera dados.

do $$
declare
  v_count integer;
begin
  -- Policies ALL legadas não podem voltar.
  if exists (
    select 1 from pg_policies
    where schemaname='public' and (
      (tablename='achievements' and policyname='achievements_admin_all')
      or (tablename='badges' and policyname='badges_admin_all')
      or (tablename='rankings' and policyname='rankings_admin_all')
      or (tablename='seasons' and policyname='seasons_admin_all')
      or (tablename='comment_likes' and policyname='comment_likes_manage')
    )
  ) then
    raise exception 'simple_public_rls_regression: legacy ALL policy returned';
  end if;

  -- Achievements/Badges: anon só enabled; authenticated enabled OR Admin.
  select count(*) into v_count
  from (
    values
      ('achievements','achievements_anon_read','achievements_authenticated_read'),
      ('badges','badges_anon_read','badges_authenticated_read')
  ) expected(tablename, anon_policy, auth_policy)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename=expected.tablename
      and p.policyname=expected.anon_policy
      and p.cmd='SELECT'
      and p.roles::text ilike '%anon%'
      and coalesce(p.qual,'') ilike '%enabled = true%'
  ) or not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename=expected.tablename
      and p.policyname=expected.auth_policy
      and p.cmd='SELECT'
      and p.roles::text ilike '%authenticated%'
      and coalesce(p.qual,'') ilike '%enabled = true%'
      and coalesce(p.qual,'') ilike '%is_admin%'
  );
  if v_count <> 0 then
    raise exception 'simple_public_rls_regression: % achievement/badge read contract(s) changed', v_count;
  end if;

  -- Rankings/Seasons: leitura pública total.
  select count(*) into v_count
  from (
    values ('rankings','rankings_public_read'),('seasons','seasons_public_read')
  ) expected(tablename, policyname)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename=expected.tablename
      and p.policyname=expected.policyname
      and p.cmd='SELECT'
      and p.roles::text ilike '%anon%'
      and p.roles::text ilike '%authenticated%'
      and coalesce(p.qual,'')='true'
  );
  if v_count <> 0 then
    raise exception 'simple_public_rls_regression: % public read policy(ies) changed', v_count;
  end if;

  -- Quatro tabelas administrativas: uma escrita Admin-only por ação.
  select count(*) into v_count
  from (
    values
      ('achievements','achievements_admin_insert','INSERT'),
      ('achievements','achievements_admin_update','UPDATE'),
      ('achievements','achievements_admin_delete','DELETE'),
      ('badges','badges_admin_insert','INSERT'),
      ('badges','badges_admin_update','UPDATE'),
      ('badges','badges_admin_delete','DELETE'),
      ('rankings','rankings_admin_insert','INSERT'),
      ('rankings','rankings_admin_update','UPDATE'),
      ('rankings','rankings_admin_delete','DELETE'),
      ('seasons','seasons_admin_insert','INSERT'),
      ('seasons','seasons_admin_update','UPDATE'),
      ('seasons','seasons_admin_delete','DELETE')
  ) expected(tablename, policyname, cmd)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename=expected.tablename
      and p.policyname=expected.policyname
      and p.cmd=expected.cmd
      and p.roles::text ilike '%authenticated%'
      and (coalesce(p.qual,'') ilike '%is_admin%' or coalesce(p.with_check,'') ilike '%is_admin%')
      and coalesce(p.qual,p.with_check,'') not ilike '%auth.uid%'
  );
  if v_count <> 0 then
    raise exception 'simple_public_rls_regression: % Admin write policy(ies) missing/widened', v_count;
  end if;

  -- Comment likes: leitura pública total; escrita owner OU Admin.
  if not exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.tablename='comment_likes'
      and p.policyname='comment_likes_read' and p.cmd='SELECT'
      and p.roles::text ilike '%anon%' and p.roles::text ilike '%authenticated%'
      and coalesce(p.qual,'')='true'
  ) then
    raise exception 'simple_public_rls_regression: comment_likes public read changed';
  end if;

  select count(*) into v_count
  from (
    values ('comment_likes_insert','INSERT'),('comment_likes_update','UPDATE'),('comment_likes_delete','DELETE')
  ) expected(policyname, cmd)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.tablename='comment_likes'
      and p.policyname=expected.policyname and p.cmd=expected.cmd
      and p.roles::text ilike '%authenticated%'
      and (coalesce(p.qual,'') ilike '%auth.uid%' or coalesce(p.with_check,'') ilike '%auth.uid%')
      and (coalesce(p.qual,'') ilike '%is_admin%' or coalesce(p.with_check,'') ilike '%is_admin%')
  );
  if v_count <> 0 then
    raise exception 'simple_public_rls_regression: % comment_likes owner/Admin write policy(ies) missing', v_count;
  end if;
end $$;

select
  (select count(*) from public.achievements) as achievements_total,
  (select count(*) from public.badges) as badges_total,
  (select count(*) from public.rankings) as rankings_total,
  (select count(*) from public.seasons) as seasons_total,
  (select count(*) from public.comment_likes) as comment_likes_total;
