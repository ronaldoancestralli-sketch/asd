-- Echo Brain — restaura o conjunto final de tipos de ação após a governança de temporadas.
-- Aplicada em produção como echo_brain_seasons_action_constraint_cleanup.

alter table public.echo_brain_actions drop constraint if exists echo_brain_actions_action_type_check;
alter table public.echo_brain_actions add constraint echo_brain_actions_action_type_check
  check (action_type in ('promote','rollback','runtime_update','evaluate','suspend','emergency_on','emergency_off','ingest','shadow','backtest'));
