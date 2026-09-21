-- EchoArena — consolida RLS de tabelas de dados de heróis.
-- Todas já possuem leitura pública USING true; somente o Admin ALL é separado em I/U/D.

-- Helper legado: current_user_is_admin()
drop policy if exists hero_ability_stats_admin_all on public.hero_ability_stats;
create policy hero_ability_stats_admin_insert on public.hero_ability_stats for insert to authenticated with check ((select public.current_user_is_admin()));
create policy hero_ability_stats_admin_update on public.hero_ability_stats for update to authenticated using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy hero_ability_stats_admin_delete on public.hero_ability_stats for delete to authenticated using ((select public.current_user_is_admin()));

drop policy if exists hero_base_stats_admin_all on public.hero_base_stats;
create policy hero_base_stats_admin_insert on public.hero_base_stats for insert to authenticated with check ((select public.current_user_is_admin()));
create policy hero_base_stats_admin_update on public.hero_base_stats for update to authenticated using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy hero_base_stats_admin_delete on public.hero_base_stats for delete to authenticated using ((select public.current_user_is_admin()));

drop policy if exists hero_weapon_stats_admin_all on public.hero_weapon_stats;
create policy hero_weapon_stats_admin_insert on public.hero_weapon_stats for insert to authenticated with check ((select public.current_user_is_admin()));
create policy hero_weapon_stats_admin_update on public.hero_weapon_stats for update to authenticated using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy hero_weapon_stats_admin_delete on public.hero_weapon_stats for delete to authenticated using ((select public.current_user_is_admin()));

-- Helper canônico atual: is_admin()
drop policy if exists balance_admin_all on public.balance_history;
create policy balance_admin_insert on public.balance_history for insert to authenticated with check ((select public.is_admin()));
create policy balance_admin_update on public.balance_history for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy balance_admin_delete on public.balance_history for delete to authenticated using ((select public.is_admin()));

drop policy if exists hero_history_admin_all on public.hero_history;
create policy hero_history_admin_insert on public.hero_history for insert to authenticated with check ((select public.is_admin()));
create policy hero_history_admin_update on public.hero_history for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy hero_history_admin_delete on public.hero_history for delete to authenticated using ((select public.is_admin()));

drop policy if exists hero_matchups_admin on public.hero_matchups;
create policy hero_matchups_admin_insert on public.hero_matchups for insert to authenticated with check ((select public.is_admin()));
create policy hero_matchups_admin_update on public.hero_matchups for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy hero_matchups_admin_delete on public.hero_matchups for delete to authenticated using ((select public.is_admin()));

drop policy if exists hero_metrics_admin_all on public.hero_metrics;
create policy hero_metrics_admin_insert on public.hero_metrics for insert to authenticated with check ((select public.is_admin()));
create policy hero_metrics_admin_update on public.hero_metrics for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy hero_metrics_admin_delete on public.hero_metrics for delete to authenticated using ((select public.is_admin()));

drop policy if exists hero_season_stats_admin_all on public.hero_season_stats;
create policy hero_season_stats_admin_insert on public.hero_season_stats for insert to authenticated with check ((select public.is_admin()));
create policy hero_season_stats_admin_update on public.hero_season_stats for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy hero_season_stats_admin_delete on public.hero_season_stats for delete to authenticated using ((select public.is_admin()));

drop policy if exists hero_statistics_admin_all on public.hero_statistics;
create policy hero_statistics_admin_insert on public.hero_statistics for insert to authenticated with check ((select public.is_admin()));
create policy hero_statistics_admin_update on public.hero_statistics for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy hero_statistics_admin_delete on public.hero_statistics for delete to authenticated using ((select public.is_admin()));

drop policy if exists hero_synergy_admin on public.hero_synergies;
create policy hero_synergy_admin_insert on public.hero_synergies for insert to authenticated with check ((select public.is_admin()));
create policy hero_synergy_admin_update on public.hero_synergies for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy hero_synergy_admin_delete on public.hero_synergies for delete to authenticated using ((select public.is_admin()));
