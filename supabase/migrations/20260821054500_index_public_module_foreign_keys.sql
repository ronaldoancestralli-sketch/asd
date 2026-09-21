-- EchoArena — índices de FK para superfícies públicas prioritárias.
-- Evita scans completos em cascatas/joins por usuário, herói e sinergia.

create index if not exists idx_comment_likes_user_id
  on public.comment_likes(user_id);

create index if not exists idx_rankings_user_id
  on public.rankings(user_id);

create index if not exists idx_rankings_hero_id
  on public.rankings(hero_id);

create index if not exists idx_team_synergies_hero_1_id
  on public.team_synergies(hero_1_id);

create index if not exists idx_team_synergies_hero_2_id
  on public.team_synergies(hero_2_id);

create index if not exists idx_team_synergies_hero_3_id
  on public.team_synergies(hero_3_id);
