-- Echo Arena — otimização conservadora dos módulos já ativos.
-- Apenas adiciona índices de FKs apontados pelo linter e evita reavaliar
-- auth.uid()/is_admin() linha a linha nas políticas de composição/conteúdo.

create index if not exists idx_equipment_variants_rarity_id
  on public.equipment_variants(rarity_id);
create index if not exists idx_equipments_set_id
  on public.equipments(set_id);
create index if not exists idx_guides_author_id
  on public.guides(author_id);
create index if not exists idx_guides_cover_media_id
  on public.guides(cover_media_id);
create index if not exists idx_news_author_id
  on public.news(author_id);
create index if not exists idx_news_cover_media_id
  on public.news(cover_media_id);
create index if not exists idx_team_composition_members_build_id
  on public.team_composition_members(build_id);
create index if not exists idx_tier_list_entries_hero_id
  on public.tier_list_entries(hero_id);
create index if not exists idx_tier_lists_created_by
  on public.tier_lists(created_by);

alter policy team_comp_manage on public.team_compositions
  using ((user_id = (select auth.uid())) or (select public.is_admin()))
  with check ((user_id = (select auth.uid())) or (select public.is_admin()));

alter policy team_comp_read on public.team_compositions
  using (is_public or (user_id = (select auth.uid())) or (select public.is_admin()));

alter policy team_members_manage on public.team_composition_members
  using (exists (
    select 1 from public.team_compositions tc
    where tc.id = team_composition_members.composition_id
      and ((tc.user_id = (select auth.uid())) or (select public.is_admin()))
  ))
  with check (exists (
    select 1 from public.team_compositions tc
    where tc.id = team_composition_members.composition_id
      and ((tc.user_id = (select auth.uid())) or (select public.is_admin()))
  ));

alter policy team_members_read on public.team_composition_members
  using (exists (
    select 1 from public.team_compositions tc
    where tc.id = team_composition_members.composition_id
      and (tc.is_public or (tc.user_id = (select auth.uid())) or (select public.is_admin()))
  ));

alter policy tier_lists_admin on public.tier_lists
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy tier_lists_read on public.tier_lists
  using (published or (select public.is_admin()));

alter policy tier_entries_admin on public.tier_list_entries
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy tier_entries_read on public.tier_list_entries
  using (exists (
    select 1 from public.tier_lists tl
    where tl.id = tier_list_entries.tier_list_id
      and (tl.published or (select public.is_admin()))
  ));
