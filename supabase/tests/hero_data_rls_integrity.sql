-- EchoArena — regressão read-only da consolidação RLS dos dados de heróis.
-- Não cria nem altera dados.

do $$
declare
  v_count integer;
begin
  -- Cada tabela deste grupo deve ter 1 SELECT público, 3 escritas Admin e nenhum ALL.
  select count(*) into v_count
  from (
    values
      ('balance_history'),('hero_ability_stats'),('hero_base_stats'),('hero_history'),
      ('hero_matchups'),('hero_metrics'),('hero_season_stats'),('hero_statistics'),
      ('hero_synergies'),('hero_weapon_stats')
  ) expected(tablename)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.tablename=expected.tablename
      and p.cmd='SELECT' and p.roles::text ilike '%anon%'
      and p.roles::text ilike '%authenticated%' and coalesce(p.qual,'')='true'
  ) or (
    select count(*) from pg_policies p
    where p.schemaname='public' and p.tablename=expected.tablename
      and p.roles::text ilike '%authenticated%' and p.cmd in ('INSERT','UPDATE','DELETE')
  ) <> 3 or exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.tablename=expected.tablename and p.cmd='ALL'
  );
  if v_count <> 0 then
    raise exception 'hero_data_rls_regression: % table(s) lost canonical 1-read/3-write/no-ALL contract', v_count;
  end if;

  -- As três tabelas legadas usam current_user_is_admin; as demais usam is_admin.
  select count(*) into v_count
  from (
    values ('hero_ability_stats'),('hero_base_stats'),('hero_weapon_stats')
  ) expected(tablename)
  where exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.tablename=expected.tablename
      and p.cmd in ('INSERT','UPDATE','DELETE')
      and (coalesce(p.qual,p.with_check,'') not ilike '%current_user_is_admin%')
  );
  if v_count <> 0 then
    raise exception 'hero_data_rls_regression: legacy admin helper changed on % table(s)', v_count;
  end if;

  select count(*) into v_count
  from (
    values ('balance_history'),('hero_history'),('hero_matchups'),('hero_metrics'),
           ('hero_season_stats'),('hero_statistics'),('hero_synergies')
  ) expected(tablename)
  where exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.tablename=expected.tablename
      and p.cmd in ('INSERT','UPDATE','DELETE')
      and (coalesce(p.qual,p.with_check,'') not ilike '%is_admin%')
  );
  if v_count <> 0 then
    raise exception 'hero_data_rls_regression: canonical admin helper changed on % table(s)', v_count;
  end if;
end $$;

select
  (select count(*) from public.hero_base_stats) as hero_base_stats,
  (select count(*) from public.hero_weapon_stats) as hero_weapon_stats,
  (select count(*) from public.hero_ability_stats) as hero_ability_stats,
  (select count(*) from public.balance_history) as balance_history,
  (select count(*) from public.hero_history) as hero_history,
  (select count(*) from public.hero_metrics) as hero_metrics,
  (select count(*) from public.hero_season_stats) as hero_season_stats,
  (select count(*) from public.hero_statistics) as hero_statistics,
  (select count(*) from public.hero_synergies) as hero_synergies,
  (select count(*) from public.hero_matchups) as hero_matchups;
