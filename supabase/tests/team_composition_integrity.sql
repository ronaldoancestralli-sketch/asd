-- EchoArena — regressão read-only do módulo de Composições 3x3.
-- Não cria nem altera dados.

do $$
declare
  v_proc regprocedure := to_regprocedure('public.save_team_composition(text,text,boolean,uuid[])');
  v_definition text;
  v_count integer;
begin
  if v_proc is null then
    raise exception 'team_composition_regression: save_team_composition RPC missing';
  end if;

  if not (select p.prosecdef from pg_proc p where p.oid = v_proc) then
    raise exception 'team_composition_regression: save_team_composition lost SECURITY DEFINER';
  end if;

  if not exists (
    select 1 from pg_proc p
    where p.oid = v_proc
      and coalesce(p.proconfig::text, '') ilike '%search_path=public, pg_temp%'
  ) then
    raise exception 'team_composition_regression: save_team_composition search_path changed';
  end if;

  if has_function_privilege('anon', v_proc, 'EXECUTE') then
    raise exception 'team_composition_regression: anon can execute save_team_composition';
  end if;

  if not has_function_privilege('authenticated', v_proc, 'EXECUTE')
     or not has_function_privilege('service_role', v_proc, 'EXECUTE') then
    raise exception 'team_composition_regression: authenticated/service_role execute missing';
  end if;

  select pg_get_functiondef(v_proc) into v_definition;
  if v_definition not ilike '%authentication_required%'
     or v_definition not ilike '%composition_title_required%'
     or v_definition not ilike '%composition_title_too_long%'
     or v_definition not ilike '%composition_description_too_long%'
     or v_definition not ilike '%composition_requires_three_heroes%'
     or v_definition not ilike '%composition_requires_distinct_heroes%'
     or v_definition not ilike '%composition_contains_unavailable_hero%'
     or v_definition not ilike '%enabled%true%'
     or v_definition not ilike '%team_compositions%'
     or v_definition not ilike '%team_composition_members%' then
    raise exception 'team_composition_regression: transactional validation contract changed';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='team_compositions'
      and policyname='team_comp_manage'
  ) then
    raise exception 'team_composition_regression: legacy team_comp_manage returned';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='team_composition_members'
      and policyname='team_members_manage'
  ) then
    raise exception 'team_composition_regression: legacy team_members_manage returned';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='team_synergies'
      and policyname='team_synergy_admin'
  ) then
    raise exception 'team_composition_regression: legacy team_synergy_admin returned';
  end if;

  select count(*) into v_count
  from (
    values
      ('team_compositions','team_comp_admin_insert','INSERT'),
      ('team_compositions','team_comp_admin_update','UPDATE'),
      ('team_compositions','team_comp_admin_delete','DELETE'),
      ('team_composition_members','team_members_admin_insert','INSERT'),
      ('team_composition_members','team_members_admin_update','UPDATE'),
      ('team_composition_members','team_members_admin_delete','DELETE'),
      ('team_synergies','team_synergy_admin_insert','INSERT'),
      ('team_synergies','team_synergy_admin_update','UPDATE'),
      ('team_synergies','team_synergy_admin_delete','DELETE')
  ) expected(tablename, policyname, cmd)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename=expected.tablename
      and p.policyname=expected.policyname
      and p.cmd=expected.cmd
      and p.roles::text ilike '%authenticated%'
      and (
        coalesce(p.qual,'') ilike '%is_admin%'
        or coalesce(p.with_check,'') ilike '%is_admin%'
      )
      and coalesce(p.qual, p.with_check, '') not ilike '%auth.uid%'
  );
  if v_count <> 0 then
    raise exception 'team_composition_regression: % Admin-only write policy(ies) missing or widened', v_count;
  end if;

  select count(*) into v_count
  from (
    values
      ('team_compositions','team_comp_anon_read','anon'),
      ('team_compositions','team_comp_authenticated_read','authenticated'),
      ('team_composition_members','team_members_anon_read','anon'),
      ('team_composition_members','team_members_authenticated_read','authenticated')
  ) expected(tablename, policyname, role_name)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename=expected.tablename
      and p.policyname=expected.policyname
      and p.cmd='SELECT'
      and p.roles::text ilike '%' || expected.role_name || '%'
  );
  if v_count <> 0 then
    raise exception 'team_composition_regression: % composition read policy(ies) missing', v_count;
  end if;

  if not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename='team_synergies'
      and p.policyname='team_synergy_read'
      and p.cmd='SELECT'
      and p.roles::text ilike '%anon%'
      and p.roles::text ilike '%authenticated%'
      and coalesce(p.qual,'') = 'true'
  ) then
    raise exception 'team_composition_regression: public team_synergy_read missing or narrowed';
  end if;

  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='team_composition_members'
      and c.conname='team_composition_members_position_check'
      and pg_get_constraintdef(c.oid) ilike '%position%>= 1%position%<= 3%'
  ) then
    raise exception 'team_composition_regression: member position 1..3 constraint missing';
  end if;

  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='team_composition_members'
      and c.conname='team_composition_members_composition_id_position_key'
      and c.contype='u'
  ) then
    raise exception 'team_composition_regression: unique composition/position constraint missing';
  end if;

  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='team_composition_members'
      and c.conname='team_composition_members_composition_hero_key'
      and c.contype='u'
  ) then
    raise exception 'team_composition_regression: unique composition/hero constraint missing';
  end if;
end $$;

select
  (select count(*) from public.team_compositions) as compositions_total,
  (select count(*) from public.team_compositions where is_public=true) as compositions_public,
  (select count(*) from public.team_composition_members) as members_total,
  (select count(*) from public.team_synergies) as team_synergies_total,
  has_function_privilege('anon', 'public.save_team_composition(text,text,boolean,uuid[])', 'EXECUTE') as anon_can_save,
  has_function_privilege('authenticated', 'public.save_team_composition(text,text,boolean,uuid[])', 'EXECUTE') as authenticated_can_save;
