-- EchoArena
-- Segunda tranche controlada de hardening SECURITY DEFINER.
-- Objetivos:
--   * remover exposição RPC de funções que só existem como triggers;
--   * retirar acesso anon de operações autenticadas/admin;
--   * corrigir export_user_data contra auth.uid() NULL;
--   * fazer export_build/export_hero obedecerem RLS via SECURITY INVOKER;
--   * proteger escrita direta em media e refresh de estatísticas.

-- ---------------------------------------------------------------------------
-- 1. Funções de trigger não são RPCs públicas.
-- O executor do trigger é o owner da função; os papéis do Data API não precisam
-- de EXECUTE direto nessas funções RETURNS trigger.
-- ---------------------------------------------------------------------------
revoke all on function public.create_build_version_snapshot() from public, anon, authenticated, service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke all on function public.log_equipment_attribute_classification_history() from public, anon, authenticated, service_role;
revoke all on function public.log_equipment_audit_queue_history() from public, anon, authenticated, service_role;
revoke all on function public.log_equipment_set_bonus_stats_history() from public, anon, authenticated, service_role;
revoke all on function public.log_realtime_event() from public, anon, authenticated, service_role;
revoke all on function public.sync_build_counters() from public, anon, authenticated, service_role;
revoke all on function public.sync_build_rating() from public, anon, authenticated, service_role;
revoke all on function public.sync_comment_likes() from public, anon, authenticated, service_role;
revoke all on function public.sync_hero_media() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Operações que exigem login/admin não devem estar expostas a anon.
-- ---------------------------------------------------------------------------
revoke execute on function public.clone_build(uuid) from public, anon;
grant execute on function public.clone_build(uuid) to authenticated, service_role;

revoke execute on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated, service_role;

revoke execute on function public.export_database() from public, anon;
grant execute on function public.export_database() to authenticated, service_role;

revoke execute on function public.refresh_materialized_views() from public, anon;
grant execute on function public.refresh_materialized_views() to authenticated, service_role;

revoke execute on function public.log_admin_action(text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_admin_action(text, text, uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. log_admin antes aceitava qualquer chamador SECURITY DEFINER.
-- Agora exige admin autenticado ou service_role.
-- ---------------------------------------------------------------------------
create or replace function public.log_admin(
  p_action text,
  p_target text,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), p_action, p_target, coalesce(p_detail, '{}'::jsonb));
end;
$$;

revoke execute on function public.log_admin(text, text, jsonb) from public, anon;
grant execute on function public.log_admin(text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. export_user_data: corrige bypass por NULL.
-- Em SQL, NULL <> target_user produz NULL; o IF antigo não negava anon.
-- Anon deixa de ter EXECUTE. Usuário autenticado só exporta a si mesmo; admin
-- e service_role podem exportar outro usuário.
-- ---------------------------------------------------------------------------
create or replace function public.export_user_data(target_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  caller uuid := auth.uid();
  caller_role text := coalesce(auth.role(), '');
begin
  if target_user is null then
    raise exception 'Usuário alvo obrigatório.' using errcode = '22023';
  end if;

  if caller_role <> 'service_role' then
    if caller is null then
      raise exception 'Autenticação obrigatória.' using errcode = '42501';
    end if;

    if caller <> target_user and not public.is_admin() then
      raise exception 'Acesso negado.' using errcode = '42501';
    end if;
  end if;

  result := jsonb_build_object(
    'profile', (
      select to_jsonb(p)
      from public.profiles p
      where p.id = target_user
    ),
    'builds', (
      select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
      from public.builds b
      where b.user_id = target_user
    ),
    'favorites', (
      select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb)
      from public.favorites f
      where f.user_id = target_user
    ),
    'teams', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      from public.team_compositions t
      where t.user_id = target_user
    )
  );

  return result;
end;
$$;

revoke execute on function public.export_user_data(uuid) from public, anon;
grant execute on function public.export_user_data(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Exportações públicas devem respeitar as RLS existentes, não bypassá-las.
-- builds: RLS já limita anon a build público e authenticated a público/próprio/admin.
-- heroes/skills/media: RLS já limita público a conteúdo habilitado e admin a tudo.
-- ---------------------------------------------------------------------------
create or replace function public.export_build(p_build_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'build', to_jsonb(b),
    'items', coalesce((
      select jsonb_agg(to_jsonb(bi))
      from public.build_items bi
      where bi.build_id = b.id
    ), '[]'::jsonb)
  )
  into result
  from public.builds b
  where b.id = p_build_id;

  return result;
end;
$$;

grant execute on function public.export_build(uuid) to anon, authenticated, service_role;

create or replace function public.export_hero(p_hero_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'hero', to_jsonb(h),
    'media', (
      select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
      from public.media_links ml
      join public.media m on m.id = ml.media_id
      where ml.entity_type = 'hero'
        and ml.entity_id = h.id
    ),
    'skills', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.display_order), '[]'::jsonb)
      from public.hero_skills s
      where s.hero_id = h.id
    )
  )
  into result
  from public.heroes h
  where h.id = p_hero_id;

  return result;
end;
$$;

grant execute on function public.export_hero(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. upsert_hero_media é implementação do trigger sync_hero_media.
-- Não deve ser uma mutação direta disponível a usuários do Data API.
-- O trigger SECURITY DEFINER continua podendo chamá-la como owner.
-- ---------------------------------------------------------------------------
revoke execute on function public.upsert_hero_media(text, text, text, text, numeric, integer, integer)
  from public, anon, authenticated;
grant execute on function public.upsert_hero_media(text, text, text, text, numeric, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 7. Refresh de estatísticas: operação de escrita/manutenção.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_hero_statistics()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  insert into public.hero_statistics(
    hero_id,
    total_builds,
    total_public_builds,
    total_views,
    total_likes,
    total_favorites,
    updated_at
  )
  select
    h.id,
    count(b.id),
    count(*) filter(where b.visibility = 'public'),
    coalesce(sum(b.views), 0),
    coalesce(sum(b.likes), 0),
    coalesce(sum(b.favorites_count), 0),
    now()
  from public.heroes h
  left join public.builds b on b.hero_id = h.id
  group by h.id
  on conflict(hero_id)
  do update set
    total_builds = excluded.total_builds,
    total_public_builds = excluded.total_public_builds,
    total_views = excluded.total_views,
    total_likes = excluded.total_likes,
    total_favorites = excluded.total_favorites,
    updated_at = now();
end;
$$;

revoke execute on function public.refresh_hero_statistics() from public, anon;
grant execute on function public.refresh_hero_statistics() to authenticated, service_role;
