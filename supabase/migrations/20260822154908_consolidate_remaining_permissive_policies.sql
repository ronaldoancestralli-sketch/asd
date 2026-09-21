-- EchoArena — consolidação final de policies permissivas sobrepostas.
--
-- Preserva a semântica existente:
--   * anon continua vendo somente o que já era público;
--   * authenticated mantém leitura pública/própria;
--   * Admin mantém leitura integral e as mesmas escritas;
--   * nenhuma linha é criada, alterada ou removida.
--
-- Chamadas estáveis são embrulhadas em SELECT para avaliação única por query.

-- Comunidade: uma policy SELECT por papel, reunindo público + próprio/Admin.
drop policy if exists community_posts_public_read on public.community_posts;
drop policy if exists community_posts_owner_read on public.community_posts;
create policy community_posts_anon_read on public.community_posts
  for select to anon
  using (status = 'active' and pulse_item_id is null);
create policy community_posts_authenticated_read on public.community_posts
  for select to authenticated
  using (
    (status = 'active' and pulse_item_id is null)
    or author_id = (select auth.uid())
    or (select public.is_admin())
  );

drop policy if exists community_comments_public_read on public.community_comments;
drop policy if exists community_comments_owner_read on public.community_comments;
create policy community_comments_anon_read on public.community_comments
  for select to anon
  using (
    status = 'active'
    and exists (
      select 1 from public.community_posts p
      where p.id = community_comments.post_id and p.status = 'active'
    )
  );
create policy community_comments_authenticated_read on public.community_comments
  for select to authenticated
  using (
    (
      status = 'active'
      and exists (
        select 1 from public.community_posts p
        where p.id = community_comments.post_id and p.status = 'active'
      )
    )
    or author_id = (select auth.uid())
    or (select public.is_admin())
  );

-- Tabelas públicas com escrita exclusivamente administrativa.
drop policy if exists equipment_admin_all on public.equipment;
create policy equipment_admin_insert on public.equipment
  for insert to authenticated with check ((select public.is_admin()));
create policy equipment_admin_update on public.equipment
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy equipment_admin_delete on public.equipment
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists equipment_metrics_admin_all on public.equipment_metrics;
create policy equipment_metrics_admin_insert on public.equipment_metrics
  for insert to authenticated with check ((select public.is_admin()));
create policy equipment_metrics_admin_update on public.equipment_metrics
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy equipment_metrics_admin_delete on public.equipment_metrics
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists equipment_sets_admin_all on public.equipment_sets;
create policy equipment_sets_admin_insert on public.equipment_sets
  for insert to authenticated with check ((select public.is_admin()));
create policy equipment_sets_admin_update on public.equipment_sets
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy equipment_sets_admin_delete on public.equipment_sets
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists equipment_tier_stats_admin_all on public.equipment_tier_stats;
create policy equipment_tier_stats_admin_insert on public.equipment_tier_stats
  for insert to authenticated with check ((select public.is_admin()));
create policy equipment_tier_stats_admin_update on public.equipment_tier_stats
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy equipment_tier_stats_admin_delete on public.equipment_tier_stats
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists equipment_variants_admin_all on public.equipment_variants;
create policy equipment_variants_admin_insert on public.equipment_variants
  for insert to authenticated with check ((select public.is_admin()));
create policy equipment_variants_admin_update on public.equipment_variants
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy equipment_variants_admin_delete on public.equipment_variants
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists site_content_admin_all on public.site_content;
create policy site_content_admin_insert on public.site_content
  for insert to authenticated with check ((select public.is_admin()));
create policy site_content_admin_update on public.site_content
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy site_content_admin_delete on public.site_content
  for delete to authenticated using ((select public.is_admin()));

-- Catálogos com leitura pública filtrada e visão integral de Admin.
drop policy if exists equipment_modifiers_admin_all on public.equipment_modifiers;
drop policy if exists equipment_modifiers_public_read on public.equipment_modifiers;
create policy equipment_modifiers_anon_read on public.equipment_modifiers
  for select to anon using (enabled = true);
create policy equipment_modifiers_authenticated_read on public.equipment_modifiers
  for select to authenticated using (enabled = true or (select public.is_admin()));
create policy equipment_modifiers_admin_insert on public.equipment_modifiers
  for insert to authenticated with check ((select public.is_admin()));
create policy equipment_modifiers_admin_update on public.equipment_modifiers
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy equipment_modifiers_admin_delete on public.equipment_modifiers
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists set_bonus_modifiers_admin_all on public.equipment_set_bonus_modifiers;
drop policy if exists set_bonus_modifiers_public_read on public.equipment_set_bonus_modifiers;
create policy set_bonus_modifiers_anon_read on public.equipment_set_bonus_modifiers
  for select to anon using (enabled = true);
create policy set_bonus_modifiers_authenticated_read on public.equipment_set_bonus_modifiers
  for select to authenticated using (enabled = true or (select public.is_admin()));
create policy set_bonus_modifiers_admin_insert on public.equipment_set_bonus_modifiers
  for insert to authenticated with check ((select public.is_admin()));
create policy set_bonus_modifiers_admin_update on public.equipment_set_bonus_modifiers
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy set_bonus_modifiers_admin_delete on public.equipment_set_bonus_modifiers
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists equipment_tiers_admin_all on public.equipment_tiers;
create policy equipment_tiers_admin_insert on public.equipment_tiers
  for insert to authenticated with check ((select public.is_admin()));
create policy equipment_tiers_admin_update on public.equipment_tiers
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy equipment_tiers_admin_delete on public.equipment_tiers
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists stat_definitions_admin_all on public.stat_definitions;
drop policy if exists stat_definitions_public_read on public.stat_definitions;
create policy stat_definitions_anon_read on public.stat_definitions
  for select to anon using (enabled = true);
create policy stat_definitions_authenticated_read on public.stat_definitions
  for select to authenticated using (enabled = true or (select public.is_admin()));
create policy stat_definitions_admin_insert on public.stat_definitions
  for insert to authenticated with check ((select public.is_admin()));
create policy stat_definitions_admin_update on public.stat_definitions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy stat_definitions_admin_delete on public.stat_definitions
  for delete to authenticated using ((select public.is_admin()));

-- Equipamentos: remove a policy ALL redundante e mantém uma por ação.
drop policy if exists equipments_admin_all on public.equipments;
drop policy if exists equipments_public_read on public.equipments;
drop policy if exists equipments_admin_read_all on public.equipments;
create policy equipments_anon_read on public.equipments
  for select to anon using (enabled = true);
create policy equipments_authenticated_read on public.equipments
  for select to authenticated using (enabled = true or (select public.is_admin()));

-- Favoritos: proprietário e Admin compartilham uma única policy por ação.
drop policy if exists favorites_admin_all on public.favorites;
drop policy if exists favorites_read_own on public.favorites;
drop policy if exists favorites_insert_own on public.favorites;
drop policy if exists favorites_delete_own on public.favorites;
create policy favorites_read on public.favorites
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy favorites_insert on public.favorites
  for insert to authenticated
  with check (user_id = (select auth.uid()) or (select public.is_admin()));
create policy favorites_update on public.favorites
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy favorites_delete on public.favorites
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Conteúdo editorial: leitura existente já inclui o Admin; ALL vira escrita.
drop policy if exists guides_admin_all on public.guides;
create policy guides_admin_insert on public.guides
  for insert to authenticated with check ((select public.is_admin()));
create policy guides_admin_update on public.guides
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy guides_admin_delete on public.guides
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists news_admin_all on public.news;
create policy news_admin_insert on public.news
  for insert to authenticated with check ((select public.is_admin()));
create policy news_admin_update on public.news
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy news_admin_delete on public.news
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists pulse_ingestion_runs_admin_write on public.pulse_ingestion_runs;
create policy pulse_ingestion_runs_admin_insert on public.pulse_ingestion_runs
  for insert to authenticated with check ((select public.is_admin()));
create policy pulse_ingestion_runs_admin_update on public.pulse_ingestion_runs
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy pulse_ingestion_runs_admin_delete on public.pulse_ingestion_runs
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists reports_admin_all on public.reports;
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) or (select public.is_admin()));
create policy reports_admin_update on public.reports
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy reports_admin_delete on public.reports
  for delete to authenticated using ((select public.is_admin()));

-- CMS: público para anon; authenticated reúne publicado + Admin.
drop policy if exists site_pages_public_read on public.site_pages;
drop policy if exists site_pages_admin_read on public.site_pages;
create policy site_pages_anon_read on public.site_pages
  for select to anon using (published = true);
create policy site_pages_authenticated_read on public.site_pages
  for select to authenticated using (published = true or (select public.is_admin()));

-- Tier List: leitura autenticada já reúne publicado + Admin; ALL vira escrita.
drop policy if exists tier_entries_admin on public.tier_list_entries;
create policy tier_entries_admin_insert on public.tier_list_entries
  for insert to authenticated with check ((select public.is_admin()));
create policy tier_entries_admin_update on public.tier_list_entries
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy tier_entries_admin_delete on public.tier_list_entries
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists tier_lists_admin on public.tier_lists;
create policy tier_lists_admin_insert on public.tier_lists
  for insert to authenticated with check ((select public.is_admin()));
create policy tier_lists_admin_update on public.tier_lists
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy tier_lists_admin_delete on public.tier_lists
  for delete to authenticated using ((select public.is_admin()));

-- Conquistas e badges: leitura própria/Admin e escrita somente Admin.
drop policy if exists user_achievements_admin_all on public.user_achievements;
create policy user_achievements_admin_insert on public.user_achievements
  for insert to authenticated with check ((select public.is_admin()));
create policy user_achievements_admin_update on public.user_achievements
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy user_achievements_admin_delete on public.user_achievements
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists user_badges_admin_all on public.user_badges;
create policy user_badges_admin_insert on public.user_badges
  for insert to authenticated with check ((select public.is_admin()));
create policy user_badges_admin_update on public.user_badges
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy user_badges_admin_delete on public.user_badges
  for delete to authenticated using ((select public.is_admin()));

-- Falha a migration inteira se alguma policy ALL redundante permanecer.
do $$
declare
  v_remaining integer;
begin
  select count(*) into v_remaining
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'equipment_admin_all', 'equipment_metrics_admin_all',
      'equipment_modifiers_admin_all', 'set_bonus_modifiers_admin_all',
      'equipment_sets_admin_all', 'equipment_tier_stats_admin_all',
      'equipment_tiers_admin_all', 'equipment_variants_admin_all',
      'equipments_admin_all', 'favorites_admin_all', 'guides_admin_all',
      'news_admin_all', 'pulse_ingestion_runs_admin_write',
      'reports_admin_all', 'site_content_admin_all',
      'stat_definitions_admin_all', 'tier_entries_admin',
      'tier_lists_admin', 'user_achievements_admin_all',
      'user_badges_admin_all'
    );
  if v_remaining <> 0 then
    raise exception 'policy_consolidation_failed: % legacy ALL policies remain', v_remaining;
  end if;
end $$;
