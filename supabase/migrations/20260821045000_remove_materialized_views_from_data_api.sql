-- EchoArena
-- Materialized views não suportam RLS. Mantemos as MVs como cache interno,
-- removemos SELECT dos papéis do Data API e preservamos a homepage por uma
-- view security_invoker sobre as tabelas base.

create or replace view public.v_home_popular_builds
with (security_invoker = true)
as
select
  b.id,
  b.slug,
  b.title,
  b.hero_id,
  h.name as hero_name,
  b.rating_average,
  b.rating_count,
  b.likes,
  b.views,
  b.favorites_count,
  b.comments_count
from public.builds b
join public.heroes h on h.id = b.hero_id
where b.visibility = 'public'
  and b.status = 'published'
  and b.deleted_at is null
  and h.enabled = true
order by b.likes desc, b.views desc, b.created_at desc;

grant select on public.v_home_popular_builds to anon, authenticated, service_role;

create or replace view public.v_homepage
with (security_invoker = true)
as
select
  (
    select jsonb_agg(row_to_json(h.*))
    from (
      select
        v_hero_ranking.id,
        v_hero_ranking.name,
        v_hero_ranking.class_name,
        v_hero_ranking.total_builds,
        v_hero_ranking.total_public_builds,
        v_hero_ranking.total_views,
        v_hero_ranking.total_likes,
        v_hero_ranking.total_favorites
      from public.v_hero_ranking
      limit 10
    ) h
  ) as top_heroes,
  (
    select jsonb_agg(row_to_json(b.*))
    from (
      select
        v_home_popular_builds.id,
        v_home_popular_builds.slug,
        v_home_popular_builds.title,
        v_home_popular_builds.hero_id,
        v_home_popular_builds.hero_name,
        v_home_popular_builds.rating_average,
        v_home_popular_builds.rating_count,
        v_home_popular_builds.likes,
        v_home_popular_builds.views,
        v_home_popular_builds.favorites_count,
        v_home_popular_builds.comments_count
      from public.v_home_popular_builds
      limit 10
    ) b
  ) as popular_builds,
  (
    select jsonb_agg(row_to_json(t.*))
    from (
      select
        v_current_tier_list.id,
        v_current_tier_list.title,
        v_current_tier_list.slug,
        v_current_tier_list.season_name,
        v_current_tier_list.tier,
        v_current_tier_list.score,
        v_current_tier_list.display_order,
        v_current_tier_list.hero_id,
        v_current_tier_list.hero_name
      from public.v_current_tier_list
    ) t
  ) as tier_list;

grant select on public.v_homepage to anon, authenticated, service_role;

-- As materialized views continuam internas para refresh/diagnóstico, mas deixam
-- de ser superfícies diretas do Data API.
revoke select on public.mv_popular_builds from public, anon, authenticated;
revoke select on public.mv_hero_ranking from public, anon, authenticated;
revoke select on public.mv_equipment_ranking from public, anon, authenticated;

grant select on public.mv_popular_builds to service_role;
grant select on public.mv_hero_ranking to service_role;
grant select on public.mv_equipment_ranking to service_role;
