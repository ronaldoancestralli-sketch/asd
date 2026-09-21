#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = (
    ROOT
    / 'supabase'
    / 'migrations'
    / '20260823160200_echo_brain_foreign_key_indexes.sql'
)
WORKFLOW = ROOT / '.github' / 'workflows' / 'quality-gates.yml'

# Índices esperados para FKs identificadas pela auditoria do banco. A flag
# indica se a coluna é nullable e, portanto, deve usar um índice parcial.
EXPECTED_INDEXES = {
    'composition_backtest_results_model_id_idx':
        ('composition_backtest_results', 'model_id', False),
    'composition_backtest_runs_target_model_id_idx':
        ('composition_backtest_runs', 'target_model_id', False),
    'composition_backtest_runs_champion_model_id_idx':
        ('composition_backtest_runs', 'champion_model_id', True),
    'composition_backtest_runs_season_id_idx':
        ('composition_backtest_runs', 'season_id', True),
    'composition_backtest_runs_created_by_idx':
        ('composition_backtest_runs', 'created_by', True),
    'composition_match_observations_batch_id_idx':
        ('composition_match_observations', 'batch_id', False),
    'composition_match_observations_hero_2_id_idx':
        ('composition_match_observations', 'hero_2_id', False),
    'composition_match_observations_hero_3_id_idx':
        ('composition_match_observations', 'hero_3_id', False),
    'composition_match_observations_opponent_1_id_idx':
        ('composition_match_observations', 'opponent_1_id', True),
    'composition_match_observations_opponent_2_id_idx':
        ('composition_match_observations', 'opponent_2_id', True),
    'composition_match_observations_opponent_3_id_idx':
        ('composition_match_observations', 'opponent_3_id', True),
    'composition_match_observations_recommendation_model_id_idx':
        ('composition_match_observations', 'recommendation_model_id', True),
    'composition_observation_batches_season_id_idx':
        ('composition_observation_batches', 'season_id', False),
    'composition_observation_batches_imported_by_idx':
        ('composition_observation_batches', 'imported_by', True),
    'composition_model_versions_created_by_idx':
        ('composition_model_versions', 'created_by', True),
    'composition_training_runs_candidate_model_id_idx':
        ('composition_training_runs', 'candidate_model_id', True),
    'composition_training_runs_created_by_idx':
        ('composition_training_runs', 'created_by', True),
    'composition_model_activations_previous_model_id_idx':
        ('composition_model_activations', 'previous_model_id', True),
    'composition_model_activations_activated_by_idx':
        ('composition_model_activations', 'activated_by', True),
    'composition_model_activation_baselines_team_synergy_id_idx':
        ('composition_model_activation_baselines', 'team_synergy_id', False),
    'composition_model_evaluations_activation_id_idx':
        ('composition_model_evaluations', 'activation_id', False),
    'composition_model_evaluations_season_id_idx':
        ('composition_model_evaluations', 'season_id', True),
    'composition_model_evaluations_created_by_idx':
        ('composition_model_evaluations', 'created_by', True),
    'echo_brain_actions_model_id_idx':
        ('echo_brain_actions', 'model_id', True),
    'echo_brain_actions_previous_model_id_idx':
        ('echo_brain_actions', 'previous_model_id', True),
    'echo_brain_actions_actor_id_idx':
        ('echo_brain_actions', 'actor_id', True),
    'echo_brain_settings_active_model_id_idx':
        ('echo_brain_settings', 'active_model_id', True),
    'echo_brain_settings_updated_by_idx':
        ('echo_brain_settings', 'updated_by', True),
    'echo_brain_settings_emergency_activated_by_idx':
        ('echo_brain_settings', 'emergency_activated_by', True),
    'echo_brain_settings_emergency_cleared_by_idx':
        ('echo_brain_settings', 'emergency_cleared_by', True),
    'echo_brain_semantic_edges_season_id_idx':
        ('echo_brain_semantic_edges', 'season_id', True),
    'echo_brain_decision_audits_model_id_idx':
        ('echo_brain_decision_audits', 'model_id', True),
    'echo_brain_counterfactual_audits_model_id_idx':
        ('echo_brain_counterfactual_audits', 'model_id', True),
    'echo_brain_recommendation_exposures_model_id_idx':
        ('echo_brain_recommendation_exposures', 'model_id', True),
}

INDEX_STATEMENT = re.compile(
    r'^create\s+index\s+if\s+not\s+exists\s+'
    r'(?P<name>[a-z0-9_]+)\s+'
    r'on\s+public\.(?P<table>[a-z0-9_]+)\s*'
    r'\(\s*(?P<column>[a-z0-9_]+)\s*\)'
    r'(?:\s+where\s+(?P<predicate>[a-z0-9_]+\s+is\s+not\s+null))?$',
    re.IGNORECASE,
)


def main() -> int:
    failures: list[str] = []

    for path in (MIGRATION, WORKFLOW):
        if not path.is_file():
            failures.append(f'arquivo ausente: {path.relative_to(ROOT)}')

    if failures:
        return report(failures)

    raw_sql = MIGRATION.read_text(encoding='utf-8')
    sql_without_comments = re.sub(r'--[^\n]*', '', raw_sql.lower())
    statements = [statement.strip() for statement in sql_without_comments.split(';') if statement.strip()]
    actual: dict[str, tuple[str, str, str | None]] = {}

    for statement in statements:
        match = INDEX_STATEMENT.fullmatch(statement)
        if match is None:
            failures.append(
                'migration contém comando fora do contrato exclusivo '
                f'CREATE INDEX IF NOT EXISTS: {statement[:120]}'
            )
            continue
        name = match.group('name')
        if name in actual:
            failures.append(f'índice declarado mais de uma vez: {name}')
            continue
        actual[name] = (
            match.group('table'),
            match.group('column'),
            match.group('predicate'),
        )

    missing = sorted(set(EXPECTED_INDEXES) - set(actual))
    unexpected = sorted(set(actual) - set(EXPECTED_INDEXES))
    for name in missing:
        failures.append(f'índice obrigatório ausente: {name}')
    for name in unexpected:
        failures.append(f'índice não auditado adicionado à migration: {name}')

    for name, (expected_table, expected_column, nullable) in EXPECTED_INDEXES.items():
        if name not in actual:
            continue
        actual_table, actual_column, predicate = actual[name]
        if (actual_table, actual_column) != (expected_table, expected_column):
            failures.append(
                f'{name} aponta para {actual_table}({actual_column}); esperado '
                f'{expected_table}({expected_column})'
            )
        expected_predicate = f'{expected_column} is not null' if nullable else None
        if predicate != expected_predicate:
            failures.append(
                f'{name} usa predicado {predicate or "nenhum"}; esperado '
                f'{expected_predicate or "nenhum (FK obrigatória)"}'
            )

    workflow = WORKFLOW.read_text(encoding='utf-8')
    for token in (
        'Verificar índices de FKs do Echo Brain',
        'python3 scripts/check-echo-brain-foreign-key-indexes.py',
    ):
        if token not in workflow:
            failures.append(f'Quality Gates não executa o gate permanente: {token}')

    if len(statements) != len(EXPECTED_INDEXES):
        failures.append(
            f'migration contém {len(statements)} comando(s); '
            f'esperado exatamente {len(EXPECTED_INDEXES)}'
        )

    if failures:
        return report(failures)

    nullable_count = sum(1 for _, _, nullable in EXPECTED_INDEXES.values() if nullable)
    print(
        'Echo Brain FK indexes: '
        f'{len(EXPECTED_INDEXES)} FKs cobertas com criação idempotente, '
        f'{nullable_count} índices parciais e zero alteração de dados ou aprendizado.'
    )
    return 0


def report(failures: list[str]) -> int:
    print(
        f'Gate de índices de FKs do Echo Brain falhou com {len(failures)} problema(s):',
        file=sys.stderr,
    )
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
