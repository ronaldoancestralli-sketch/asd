-- EchoArena — regressão read-only das consolidações RLS públicas/comunidade.
-- Não cria nem altera dados.

do $$
declare
  v_count integer;
begin
  -- Duplicatas legadas não podem voltar.
  if exists (
    select 1 from pg_policies
    where schemaname='public' and (
      (tablename='hero_classes' and policyname='classes leitura publica')
      or (tablename='system_settings' and policyname='settings leitura publica')
      or (tablename='equipment_set_bonuses' and policyname='equipment_bonuses_public_read')
      or (tablename='comments' and policyname in ('comments_admin_all','comments_update_own','comments_delete_own'))
    )
  ) then
    raise exception 'public_rls_regression: legacy permissive policy returned';
  end if;

  -- Leitura pública única e total nas tabelas que já eram integralmente públicas.
  select count(*) into v_count
  from (
    values
      ('hero_classes','hero_classes_public_read'),
      ('system_settings','settings_public_read'),
      ('equipment_set_bonuses','equipment_set_bonuses_public_read')
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
    raise exception 'public_rls_regression: % canonical public read policy(ies) missing', v_count;
  end if;

  -- system_settings e equipment_set_bonuses: escrita continua Admin-only e separada do SELECT.
  select count(*) into v_count
  from (
    values
      ('system_settings','settings_admin_insert','INSERT'),
      ('system_settings','settings_admin_update','UPDATE'),
      ('system_settings','settings_admin_delete','DELETE'),
      ('equipment_set_bonuses','equipment_set_bonuses_admin_insert','INSERT'),
      ('equipment_set_bonuses','equipment_set_bonuses_admin_update','UPDATE'),
      ('equipment_set_bonuses','equipment_set_bonuses_admin_delete','DELETE')
  ) expected(tablename, policyname, cmd)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename=expected.tablename
      and p.policyname=expected.policyname
      and p.cmd=expected.cmd
      and p.roles::text ilike '%authenticated%'
      and (
        coalesce(p.qual,'') ilike '%admin%'
        or coalesce(p.with_check,'') ilike '%admin%'
      )
      and coalesce(p.qual,p.with_check,'') not ilike '%auth.uid%'
  );
  if v_count <> 0 then
    raise exception 'public_rls_regression: % Admin write policy(ies) missing or widened', v_count;
  end if;

  -- Comentários: leitura anônima não pode expor ocultos/deletados.
  if not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename='comments'
      and p.policyname='comments_anon_read'
      and p.cmd='SELECT'
      and p.roles::text ilike '%anon%'
      and coalesce(p.qual,'') ilike '%not is_hidden%'
      and coalesce(p.qual,'') ilike '%not is_deleted%'
  ) then
    raise exception 'public_rls_regression: comments anon visibility filter changed';
  end if;

  -- Leitura autenticada preserva público + owner + Admin.
  if not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename='comments'
      and p.policyname='comments_authenticated_read'
      and p.cmd='SELECT'
      and p.roles::text ilike '%authenticated%'
      and coalesce(p.qual,'') ilike '%not is_hidden%'
      and coalesce(p.qual,'') ilike '%not is_deleted%'
      and coalesce(p.qual,'') ilike '%auth.uid%'
      and coalesce(p.qual,'') ilike '%is_admin%'
  ) then
    raise exception 'public_rls_regression: comments authenticated read contract changed';
  end if;

  -- Insert comum continua owner + usuário não bloqueado; Admin conserva bypass administrativo.
  if not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename='comments'
      and p.policyname='comments_insert'
      and p.cmd='INSERT'
      and p.roles::text ilike '%authenticated%'
      and coalesce(p.with_check,'') ilike '%is_admin%'
      and coalesce(p.with_check,'') ilike '%auth.uid%'
      and coalesce(p.with_check,'') ilike '%is_blocked%'
  ) then
    raise exception 'public_rls_regression: comments insert protection changed';
  end if;

  -- Update/Delete: uma única policy por ação com Admin OR owner.
  select count(*) into v_count
  from (
    values ('comments_update','UPDATE'),('comments_delete','DELETE')
  ) expected(policyname, cmd)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename='comments'
      and p.policyname=expected.policyname
      and p.cmd=expected.cmd
      and p.roles::text ilike '%authenticated%'
      and coalesce(p.qual,'') ilike '%is_admin%'
      and coalesce(p.qual,'') ilike '%auth.uid%'
  );
  if v_count <> 0 then
    raise exception 'public_rls_regression: % comments write policy(ies) missing', v_count;
  end if;

  select count(*) into v_count
  from pg_policies p
  where p.schemaname='public'
    and p.tablename='comments'
    and p.roles::text ilike '%authenticated%'
    and p.cmd in ('INSERT','UPDATE','DELETE');
  if v_count <> 3 then
    raise exception 'public_rls_regression: comments has % authenticated write policies, expected 3', v_count;
  end if;
end $$;

select
  (select count(*) from public.comments) as comments_total,
  (select count(*) from public.comments where is_hidden=true or is_deleted=true) as comments_hidden_or_deleted,
  (select count(*) from public.hero_classes) as hero_classes_total,
  (select count(*) from public.equipment_set_bonuses) as equipment_set_bonuses_total;
