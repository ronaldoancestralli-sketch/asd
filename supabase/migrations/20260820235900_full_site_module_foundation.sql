-- Echo Arena — fundação de coerência entre módulos públicos e Admin.
-- Não cria dados fictícios. Apenas valida, resume e persiste operações reais.

-- Uma composição 3x3 não pode repetir o mesmo herói.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.team_composition_members'::regclass
      and conname = 'team_composition_members_composition_hero_key'
  ) then
    alter table public.team_composition_members
      add constraint team_composition_members_composition_hero_key
      unique (composition_id, hero_id);
  end if;
end $$;

-- Criação transacional de composição: ou composição + 3 membros são salvos,
-- ou nada é persistido. Elimina o fluxo parcial do frontend.
create or replace function public.save_team_composition(
  p_title text,
  p_description text,
  p_is_public boolean,
  p_hero_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_composition uuid;
  v_hero uuid;
  v_position integer := 0;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception 'composition_title_required' using errcode = '22023';
  end if;

  if coalesce(array_length(p_hero_ids, 1), 0) <> 3 then
    raise exception 'composition_requires_three_heroes' using errcode = '22023';
  end if;

  if (select count(distinct x) from unnest(p_hero_ids) as x) <> 3 then
    raise exception 'composition_requires_distinct_heroes' using errcode = '22023';
  end if;

  if (
    select count(*)
    from public.heroes h
    where h.id = any(p_hero_ids)
      and coalesce(h.enabled, false) = true
  ) <> 3 then
    raise exception 'composition_contains_unavailable_hero' using errcode = '23503';
  end if;

  insert into public.team_compositions(user_id, title, description, is_public)
  values (
    v_user,
    btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    coalesce(p_is_public, false)
  )
  returning id into v_composition;

  foreach v_hero in array p_hero_ids loop
    v_position := v_position + 1;
    insert into public.team_composition_members(composition_id, position, hero_id)
    values (v_composition, v_position, v_hero);
  end loop;

  return v_composition;
end;
$$;

revoke all on function public.save_team_composition(text,text,boolean,uuid[]) from public;
revoke execute on function public.save_team_composition(text,text,boolean,uuid[]) from anon;
grant execute on function public.save_team_composition(text,text,boolean,uuid[]) to authenticated;

-- Visão administrativa consolidada por módulo. A saída é JSON para não
-- acoplar o painel a uma estrutura física específica de tabelas.
create or replace function public.echo_admin_module_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select jsonb_build_array(
    jsonb_build_object(
      'key','heroes','label','Heróis','admin_url','./heroes.html','public_url','../herois.html',
      'total',(select count(*) from public.heroes),
      'visible',(select count(*) from public.heroes where enabled = true),
      'issues',(select count(*) from public.heroes h where h.enabled = true and (
        h.class_id is null or
        coalesce(h.card_image_path,h.image_path,h.card_image_url,h.image_url,'') = '' or
        not exists (select 1 from public.hero_complete_base_stats s where s.hero_id = h.id)
      ))
    ),
    jsonb_build_object(
      'key','classes','label','Classes','admin_url','./classes.html','public_url','../classes.html',
      'total',(select count(*) from public.hero_classes),
      'visible',(select count(*) from public.hero_classes),
      'issues',(select count(*) from public.hero_classes c where not exists (
        select 1 from public.heroes h where h.class_id = c.id and h.enabled = true
      ))
    ),
    jsonb_build_object(
      'key','equipments','label','Equipamentos','admin_url','./equipments.html','public_url','../equipamentos.html',
      'total',(select count(*) from public.equipments),
      'visible',(select count(*) from public.equipments where enabled = true),
      'issues',(
        (select count(*) from public.equipments e where e.enabled = true and not exists (
          select 1 from public.equipment_variants v where v.equipment_id = e.id
        )) +
        (select count(*) from public.equipment_audit_queue q where coalesce(q.status,'open') not in ('resolved','ignored','closed'))
      )
    ),
    jsonb_build_object(
      'key','builds','label','Builds','admin_url','./builds.html','public_url','../criar-build.html',
      'total',(select count(*) from public.builds where deleted_at is null),
      'visible',(select count(*) from public.builds where deleted_at is null and status = 'published' and is_public = true),
      'issues',(
        (select count(*) from public.build_items bi where not exists (select 1 from public.equipments e where e.id = bi.equipment_id)) +
        (select count(*) from public.builds b where b.deleted_at is null and b.hero_id is not null and not exists (select 1 from public.heroes h where h.id = b.hero_id))
      )
    ),
    jsonb_build_object(
      'key','guides','label','Guias','admin_url','./content-modules.html#guides','public_url','../guias.html',
      'total',(select count(*) from public.guides),
      'visible',(select count(*) from public.guides where published = true),
      'issues',(select count(*) from public.guides where published = true and (nullif(btrim(content),'') is null or nullif(btrim(summary),'') is null))
    ),
    jsonb_build_object(
      'key','news','label','Notícias','admin_url','./content-modules.html#news','public_url','../noticias.html',
      'total',(select count(*) from public.news),
      'visible',(select count(*) from public.news where published = true),
      'issues',(select count(*) from public.news where published = true and (nullif(btrim(content),'') is null or nullif(btrim(summary),'') is null))
    ),
    jsonb_build_object(
      'key','tier-list','label','Tier List','admin_url','./content-modules.html#tier','public_url','../tier-list.html',
      'total',(select count(*) from public.tier_lists),
      'visible',(select count(*) from public.tier_lists where published = true),
      'issues',(select count(*) from public.tier_lists t where t.published = true and not exists (
        select 1 from public.tier_list_entries e where e.tier_list_id = t.id
      ))
    ),
    jsonb_build_object(
      'key','compositions','label','Composições','admin_url','./content-modules.html#compositions','public_url','../composicoes.html',
      'total',(select count(*) from public.team_compositions),
      'visible',(select count(*) from public.team_compositions where is_public = true),
      'issues',(select count(*) from public.team_compositions c where (
        select count(*) from public.team_composition_members m where m.composition_id = c.id
      ) <> 3)
    ),
    jsonb_build_object(
      'key','community','label','Comunidade','admin_url','./comments.html','public_url','../index.html',
      'total',(select count(*) from public.comments),
      'visible',(select count(*) from public.comments),
      'issues',(select count(*) from public.reports where coalesce(status,'pending') not in ('resolved','closed','dismissed'))
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.echo_admin_module_health() from public;
revoke execute on function public.echo_admin_module_health() from anon;
grant execute on function public.echo_admin_module_health() to authenticated;

-- Amplia o diagnóstico existente sem remover os campos já consumidos.
create or replace function public.echo_admin_system_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'heroes', jsonb_build_object(
      'total', (select count(*) from public.heroes),
      'enabled', (select count(*) from public.heroes where enabled = true),
      'enabled_missing_class', (select count(*) from public.heroes where enabled = true and class_id is null),
      'enabled_missing_media', (select count(*) from public.heroes where enabled = true and coalesce(card_image_path, image_path, card_image_url, image_url, '') = ''),
      'enabled_missing_base_stats', (select count(*) from public.heroes h where h.enabled = true and not exists (select 1 from public.hero_complete_base_stats s where s.hero_id = h.id))
    ),
    'equipments', jsonb_build_object(
      'total', (select count(*) from public.equipments),
      'enabled', (select count(*) from public.equipments where enabled = true),
      'without_variants', (select count(*) from public.equipments e where e.enabled = true and not exists (select 1 from public.equipment_variants v where v.equipment_id = e.id)),
      'audit_open', (select count(*) from public.equipment_audit_queue q where coalesce(q.status, 'open') not in ('resolved','ignored','closed')),
      'legacy_table_rows', (select count(*) from public.equipment)
    ),
    'builds', jsonb_build_object(
      'total', (select count(*) from public.builds where deleted_at is null),
      'published', (select count(*) from public.builds where deleted_at is null and status = 'published'),
      'orphan_items', (select count(*) from public.build_items bi where not exists (select 1 from public.equipments e where e.id = bi.equipment_id)),
      'missing_hero', (select count(*) from public.builds b where b.deleted_at is null and b.hero_id is not null and not exists (select 1 from public.heroes h where h.id = b.hero_id))
    ),
    'content', jsonb_build_object(
      'guides', (select count(*) from public.guides),
      'guides_published', (select count(*) from public.guides where published = true),
      'news', (select count(*) from public.news),
      'news_published', (select count(*) from public.news where published = true),
      'tier_lists', (select count(*) from public.tier_lists),
      'tier_lists_published', (select count(*) from public.tier_lists where published = true),
      'compositions', (select count(*) from public.team_compositions),
      'compositions_public', (select count(*) from public.team_compositions where is_public = true)
    ),
    'modules', public.echo_admin_module_health()
  ) into result;

  return result;
end;
$$;

revoke execute on function public.echo_admin_system_health() from anon;
grant execute on function public.echo_admin_system_health() to authenticated;

-- RPCs administrativas jamais precisam ser executáveis pela sessão anônima.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'admin\_%' escape '\'
  loop
    execute 'revoke execute on function ' || fn.signature || ' from anon';
  end loop;
end $$;
