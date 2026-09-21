-- EchoArena — índices de FK prioritários do módulo de Heróis.
-- Cada coluna abaixo foi apontada pelo Advisor sem índice de cobertura.

create index if not exists idx_hero_ability_stats_stat_key
  on public.hero_ability_stats(stat_key);

create index if not exists idx_hero_history_created_by
  on public.hero_history(created_by);

create index if not exists idx_hero_season_stats_hero_id
  on public.hero_season_stats(hero_id);

create index if not exists idx_heroes_rarity_id
  on public.heroes(rarity_id);
