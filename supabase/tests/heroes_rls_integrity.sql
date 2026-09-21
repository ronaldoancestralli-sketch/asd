-- EchoArena — regressão read-only da leitura RLS da tabela heroes.
-- Não cria nem altera dados.

do $$
declare
  v_count integer;
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='heroes'
      and policyname in ('heroes_public_read','heroes_admin_read_all')
  ) then
    raise exception 'heroes_rls_regression: legacy overlapping SELECT policy returned';
  end if;

  if not exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.tablename='heroes'
      and p.policyname='heroes_anon_read' and p.cmd='SELECT'
      and p.roles::text ilike '%anon%'
      and coalesce(p.qual,'') ilike '%enabled = true%'
      and coalesce(p.qual,'') not ilike '%is_admin%'
  ) then
    raise exception 'heroes_rls_regression: anon enabled-only read policy changed';
  end if;

  if not exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.tablename='heroes'
      and p.policyname='heroes_authenticated_read' and p.cmd='SELECT'
      and p.roles::text ilike '%authenticated%'
      and coalesce(p.qual,'') ilike '%enabled = true%'
      and coalesce(p.qual,'') ilike '%is_admin%'
  ) then
    raise exception 'heroes_rls_regression: authenticated enabled-or-admin read policy changed';
  end if;

  select count(*) into v_count
  from pg_policies p
  where p.schemaname='public' and p.tablename='heroes'
    and p.roles::text ilike '%authenticated%'
    and p.cmd in ('INSERT','UPDATE','DELETE')
    and (coalesce(p.qual,'') ilike '%is_admin%' or coalesce(p.with_check,'') ilike '%is_admin%');
  if v_count <> 3 then
    raise exception 'heroes_rls_regression: expected 3 Admin write policies, got %', v_count;
  end if;
end $$;

select
  (select count(*) from public.heroes) as heroes_total,
  (select count(*) from public.heroes where enabled=true) as heroes_enabled,
  (select count(*) from public.heroes where enabled=false) as heroes_disabled;
