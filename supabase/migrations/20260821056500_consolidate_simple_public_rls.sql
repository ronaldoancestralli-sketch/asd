-- EchoArena — consolida policies ALL que apenas se sobrepunham ao SELECT já existente.
-- Não altera predicados de leitura; preserva semântica de escrita por tabela.

-- Achievements: leitura anon enabled; leitura auth enabled OR admin; escrita Admin-only.
drop policy if exists achievements_admin_all on public.achievements;
drop policy if exists achievements_admin_insert on public.achievements;
drop policy if exists achievements_admin_update on public.achievements;
drop policy if exists achievements_admin_delete on public.achievements;
create policy achievements_admin_insert on public.achievements for insert to authenticated with check ((select public.is_admin()));
create policy achievements_admin_update on public.achievements for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy achievements_admin_delete on public.achievements for delete to authenticated using ((select public.is_admin()));

-- Badges: mesma semântica de Achievements.
drop policy if exists badges_admin_all on public.badges;
drop policy if exists badges_admin_insert on public.badges;
drop policy if exists badges_admin_update on public.badges;
drop policy if exists badges_admin_delete on public.badges;
create policy badges_admin_insert on public.badges for insert to authenticated with check ((select public.is_admin()));
create policy badges_admin_update on public.badges for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy badges_admin_delete on public.badges for delete to authenticated using ((select public.is_admin()));

-- Rankings: leitura pública total; escrita Admin-only.
drop policy if exists rankings_admin_all on public.rankings;
drop policy if exists rankings_admin_insert on public.rankings;
drop policy if exists rankings_admin_update on public.rankings;
drop policy if exists rankings_admin_delete on public.rankings;
create policy rankings_admin_insert on public.rankings for insert to authenticated with check ((select public.is_admin()));
create policy rankings_admin_update on public.rankings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy rankings_admin_delete on public.rankings for delete to authenticated using ((select public.is_admin()));

-- Seasons: leitura pública total; escrita Admin-only.
drop policy if exists seasons_admin_all on public.seasons;
drop policy if exists seasons_admin_insert on public.seasons;
drop policy if exists seasons_admin_update on public.seasons;
drop policy if exists seasons_admin_delete on public.seasons;
create policy seasons_admin_insert on public.seasons for insert to authenticated with check ((select public.is_admin()));
create policy seasons_admin_update on public.seasons for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy seasons_admin_delete on public.seasons for delete to authenticated using ((select public.is_admin()));

-- Comment likes: leitura pública total; escrita do owner OU Admin.
drop policy if exists comment_likes_manage on public.comment_likes;
drop policy if exists comment_likes_insert on public.comment_likes;
drop policy if exists comment_likes_update on public.comment_likes;
drop policy if exists comment_likes_delete on public.comment_likes;
create policy comment_likes_insert on public.comment_likes for insert to authenticated with check (user_id = (select auth.uid()) or (select public.is_admin()));
create policy comment_likes_update on public.comment_likes for update to authenticated using (user_id = (select auth.uid()) or (select public.is_admin())) with check (user_id = (select auth.uid()) or (select public.is_admin()));
create policy comment_likes_delete on public.comment_likes for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
