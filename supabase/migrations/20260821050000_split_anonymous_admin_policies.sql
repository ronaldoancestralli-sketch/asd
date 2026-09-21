-- EchoArena
-- Remove is_admin() da superfície anon sem alterar acesso administrativo autenticado.
-- Também corrige policies públicas permissivas que anulavam flags de visibilidade.

-- Achievements / badges: anon vê somente habilitados; admin autenticado continua vendo tudo.
drop policy if exists achievements_public_read on public.achievements;
create policy achievements_anon_read
on public.achievements for select to anon
using (enabled = true);
create policy achievements_authenticated_read
on public.achievements for select to authenticated
using (enabled = true or (select public.is_admin()));

drop policy if exists badges_public_read on public.badges;
create policy badges_anon_read
on public.badges for select to anon
using (enabled = true);
create policy badges_authenticated_read
on public.badges for select to authenticated
using (enabled = true or (select public.is_admin()));

-- Logs administrativos nunca precisam de policy para PUBLIC/anon.
drop policy if exists log_admin on public.admin_log;
create policy admin_log_admin_all
on public.admin_log for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- Build items: separar leitura pública de owner/admin autenticado.
drop policy if exists build_items_read_accessible_build on public.build_items;
create policy build_items_anon_read
on public.build_items for select to anon
using (
  exists (
    select 1 from public.builds b
    where b.id = build_items.build_id
      and b.is_public = true
  )
);
create policy build_items_authenticated_read
on public.build_items for select to authenticated
using (
  exists (
    select 1 from public.builds b
    where b.id = build_items.build_id
      and (
        b.is_public = true
        or b.user_id = (select auth.uid())
        or (select public.is_admin())
      )
  )
);

-- Ratings: anon somente de builds públicos; owner/admin continuam com leitura ampliada.
drop policy if exists build_ratings_public_read on public.build_ratings;
create policy build_ratings_anon_read
on public.build_ratings for select to anon
using (
  exists (
    select 1 from public.builds b
    where b.id = build_ratings.build_id
      and b.visibility = 'public'
  )
);
create policy build_ratings_authenticated_read
on public.build_ratings for select to authenticated
using (
  exists (
    select 1 from public.builds b
    where b.id = build_ratings.build_id
      and (
        b.visibility = 'public'
        or b.user_id = (select auth.uid())
        or (select public.is_admin())
      )
  )
);

-- Tags de build: mesma separação de visibilidade.
drop policy if exists build_tag_links_public_read on public.build_tag_links;
create policy build_tag_links_anon_read
on public.build_tag_links for select to anon
using (
  exists (
    select 1 from public.builds b
    where b.id = build_tag_links.build_id
      and b.visibility = 'public'
  )
);
create policy build_tag_links_authenticated_read
on public.build_tag_links for select to authenticated
using (
  exists (
    select 1 from public.builds b
    where b.id = build_tag_links.build_id
      and (
        b.visibility = 'public'
        or b.user_id = (select auth.uid())
        or (select public.is_admin())
      )
  )
);

-- Policy admin legada em PUBLIC é duplicada por builds_admin_all authenticated.
drop policy if exists builds_admin on public.builds;

-- Comentários: remover policies PUBLIC permissivas/duplicadas.
-- Anon nunca vê ocultos/deletados; usuário autenticado pode ver os próprios e admin vê todos.
drop policy if exists comments_admin on public.comments;
drop policy if exists comments_read on public.comments;
drop policy if exists comments_public_read on public.comments;
create policy comments_anon_read
on public.comments for select to anon
using (not is_hidden and not is_deleted);
create policy comments_authenticated_read
on public.comments for select to authenticated
using (
  (not is_hidden and not is_deleted)
  or user_id = (select auth.uid())
  or (select public.is_admin())
);

-- Tabelas legadas de equipamento: escrita somente para admin autenticado.
drop policy if exists eq_admin on public.equipment;
create policy equipment_admin_all
on public.equipment for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists eqts_admin on public.equipment_tier_stats;
create policy equipment_tier_stats_admin_all
on public.equipment_tier_stats for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- equipment_tiers tinha uma leitura PUBLIC irrestrita que anulava enabled.
drop policy if exists eqt_admin on public.equipment_tiers;
drop policy if exists eqt_read on public.equipment_tiers;
drop policy if exists equipment_tiers_public_read on public.equipment_tiers;
create policy equipment_tiers_anon_read
on public.equipment_tiers for select to anon
using (enabled = true);
create policy equipment_tiers_authenticated_read
on public.equipment_tiers for select to authenticated
using (enabled = true or (select public.is_admin()));

-- Editorial: anon apenas publicado; admin autenticado continua vendo rascunhos.
drop policy if exists guides_public_read on public.guides;
create policy guides_anon_read
on public.guides for select to anon
using (published = true);
create policy guides_authenticated_read
on public.guides for select to authenticated
using (published = true or (select public.is_admin()));

drop policy if exists news_public_read on public.news;
create policy news_anon_read
on public.news for select to anon
using (published = true);
create policy news_authenticated_read
on public.news for select to authenticated
using (published = true or (select public.is_admin()));

-- Policies administrativas antigas em PUBLIC já possuem equivalentes authenticated.
drop policy if exists "classes escrita admin" on public.hero_classes;
drop policy if exists "media escrita admin" on public.media;
drop policy if exists profiles_admin on public.profiles;
drop policy if exists "settings escrita admin" on public.system_settings;

-- site_content ainda precisava de uma policy administrativa explícita authenticated.
drop policy if exists site_admin on public.site_content;
create policy site_content_admin_all
on public.site_content for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- Composições: anon apenas conteúdo público; owner/admin autenticado mantém acesso.
drop policy if exists team_members_read on public.team_composition_members;
create policy team_members_anon_read
on public.team_composition_members for select to anon
using (
  exists (
    select 1 from public.team_compositions tc
    where tc.id = team_composition_members.composition_id
      and tc.is_public = true
  )
);
create policy team_members_authenticated_read
on public.team_composition_members for select to authenticated
using (
  exists (
    select 1 from public.team_compositions tc
    where tc.id = team_composition_members.composition_id
      and (
        tc.is_public = true
        or tc.user_id = (select auth.uid())
        or (select public.is_admin())
      )
  )
);

drop policy if exists team_comp_read on public.team_compositions;
create policy team_comp_anon_read
on public.team_compositions for select to anon
using (is_public = true);
create policy team_comp_authenticated_read
on public.team_compositions for select to authenticated
using (
  is_public = true
  or user_id = (select auth.uid())
  or (select public.is_admin())
);

-- Tier lists: anon somente publicação; admin autenticado pode revisar rascunhos.
drop policy if exists tier_entries_read on public.tier_list_entries;
create policy tier_entries_anon_read
on public.tier_list_entries for select to anon
using (
  exists (
    select 1 from public.tier_lists tl
    where tl.id = tier_list_entries.tier_list_id
      and tl.published = true
  )
);
create policy tier_entries_authenticated_read
on public.tier_list_entries for select to authenticated
using (
  exists (
    select 1 from public.tier_lists tl
    where tl.id = tier_list_entries.tier_list_id
      and (tl.published = true or (select public.is_admin()))
  )
);

drop policy if exists tier_lists_read on public.tier_lists;
create policy tier_lists_anon_read
on public.tier_lists for select to anon
using (published = true);
create policy tier_lists_authenticated_read
on public.tier_lists for select to authenticated
using (published = true or (select public.is_admin()));

-- Log de moderação: leitura somente admin autenticado.
drop policy if exists "admin le o log" on public.user_moderation_log;
create policy user_moderation_log_admin_read
on public.user_moderation_log for select to authenticated
using ((select public.is_admin()));

-- Depois de separar todas as policies anon, is_admin não precisa ser uma RPC anônima.
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
