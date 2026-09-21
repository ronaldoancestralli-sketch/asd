-- Echo Brain — constraints de temporadas e janela temporária de ações de governança.
-- Aplicada em produção como echo_brain_seasons_constraints.

alter table public.seasons
  add constraint seasons_name_valid check (length(trim(name)) between 2 and 80),
  add constraint seasons_slug_valid check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(slug) <= 80),
  add constraint seasons_game_version_valid check (length(trim(game_version)) between 1 and 40),
  add constraint seasons_date_order check (ends_at is null or starts_at is null or ends_at > starts_at);

create unique index if not exists seasons_one_active on public.seasons ((1)) where active is true;

alter table public.echo_brain_actions drop constraint if exists echo_brain_actions_action_type_check;
alter table public.echo_brain_actions add constraint echo_brain_actions_action_type_check
  check (action_type in ('promote','rollback','runtime_update','evaluate','suspend','emergency_on','emergency_off','ingest','shadow','backtest','season_create','season_update','season_activate','season_deactivate'));
