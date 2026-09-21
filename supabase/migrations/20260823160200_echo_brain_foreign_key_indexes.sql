-- Echo Brain — índices de cobertura para chaves estrangeiras.
-- Não altera dados, regras, modelos ou influência pública. Os índices reduzem
-- scans integrais em JOINs e em ações ON DELETE/UPDATE das tabelas referenciadas.

-- Replay e Backtest.
create index if not exists composition_backtest_results_model_id_idx
  on public.composition_backtest_results(model_id);
create index if not exists composition_backtest_runs_target_model_id_idx
  on public.composition_backtest_runs(target_model_id);
create index if not exists composition_backtest_runs_champion_model_id_idx
  on public.composition_backtest_runs(champion_model_id)
  where champion_model_id is not null;
create index if not exists composition_backtest_runs_season_id_idx
  on public.composition_backtest_runs(season_id)
  where season_id is not null;
create index if not exists composition_backtest_runs_created_by_idx
  on public.composition_backtest_runs(created_by)
  where created_by is not null;

-- Observações orgânicas e lotes de importação.
create index if not exists composition_match_observations_batch_id_idx
  on public.composition_match_observations(batch_id);
create index if not exists composition_match_observations_hero_2_id_idx
  on public.composition_match_observations(hero_2_id);
create index if not exists composition_match_observations_hero_3_id_idx
  on public.composition_match_observations(hero_3_id);
create index if not exists composition_match_observations_opponent_1_id_idx
  on public.composition_match_observations(opponent_1_id)
  where opponent_1_id is not null;
create index if not exists composition_match_observations_opponent_2_id_idx
  on public.composition_match_observations(opponent_2_id)
  where opponent_2_id is not null;
create index if not exists composition_match_observations_opponent_3_id_idx
  on public.composition_match_observations(opponent_3_id)
  where opponent_3_id is not null;
create index if not exists composition_match_observations_recommendation_model_id_idx
  on public.composition_match_observations(recommendation_model_id)
  where recommendation_model_id is not null;
create index if not exists composition_observation_batches_season_id_idx
  on public.composition_observation_batches(season_id);
create index if not exists composition_observation_batches_imported_by_idx
  on public.composition_observation_batches(imported_by)
  where imported_by is not null;

-- Registro, treino, ativação e avaliação de modelos.
create index if not exists composition_model_versions_created_by_idx
  on public.composition_model_versions(created_by)
  where created_by is not null;
create index if not exists composition_training_runs_candidate_model_id_idx
  on public.composition_training_runs(candidate_model_id)
  where candidate_model_id is not null;
create index if not exists composition_training_runs_created_by_idx
  on public.composition_training_runs(created_by)
  where created_by is not null;
create index if not exists composition_model_activations_previous_model_id_idx
  on public.composition_model_activations(previous_model_id)
  where previous_model_id is not null;
create index if not exists composition_model_activations_activated_by_idx
  on public.composition_model_activations(activated_by)
  where activated_by is not null;
create index if not exists composition_model_activation_baselines_team_synergy_id_idx
  on public.composition_model_activation_baselines(team_synergy_id);
create index if not exists composition_model_evaluations_activation_id_idx
  on public.composition_model_evaluations(activation_id);
create index if not exists composition_model_evaluations_season_id_idx
  on public.composition_model_evaluations(season_id)
  where season_id is not null;
create index if not exists composition_model_evaluations_created_by_idx
  on public.composition_model_evaluations(created_by)
  where created_by is not null;

-- Configuração e trilha operacional.
create index if not exists echo_brain_actions_model_id_idx
  on public.echo_brain_actions(model_id)
  where model_id is not null;
create index if not exists echo_brain_actions_previous_model_id_idx
  on public.echo_brain_actions(previous_model_id)
  where previous_model_id is not null;
create index if not exists echo_brain_actions_actor_id_idx
  on public.echo_brain_actions(actor_id)
  where actor_id is not null;
create index if not exists echo_brain_settings_active_model_id_idx
  on public.echo_brain_settings(active_model_id)
  where active_model_id is not null;
create index if not exists echo_brain_settings_updated_by_idx
  on public.echo_brain_settings(updated_by)
  where updated_by is not null;
create index if not exists echo_brain_settings_emergency_activated_by_idx
  on public.echo_brain_settings(emergency_activated_by)
  where emergency_activated_by is not null;
create index if not exists echo_brain_settings_emergency_cleared_by_idx
  on public.echo_brain_settings(emergency_cleared_by)
  where emergency_cleared_by is not null;

-- Semantic v4: relações introduzidas pela tranche ainda pendente.
create index if not exists echo_brain_semantic_edges_season_id_idx
  on public.echo_brain_semantic_edges(season_id)
  where season_id is not null;
create index if not exists echo_brain_decision_audits_model_id_idx
  on public.echo_brain_decision_audits(model_id)
  where model_id is not null;
create index if not exists echo_brain_counterfactual_audits_model_id_idx
  on public.echo_brain_counterfactual_audits(model_id)
  where model_id is not null;
create index if not exists echo_brain_recommendation_exposures_model_id_idx
  on public.echo_brain_recommendation_exposures(model_id)
  where model_id is not null;
