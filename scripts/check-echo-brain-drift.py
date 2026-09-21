#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
migration = ROOT / 'supabase/migrations/20260822015257_echo_brain_drift_rollback.sql'
evaluate = ROOT / 'supabase/functions/echo-brain-evaluate/index.ts'
train_wrapper = ROOT / 'supabase/functions/echo-brain-train/composition-brain.ts'
evaluate_wrapper = ROOT / 'supabase/functions/echo-brain-evaluate/composition-brain.ts'
shared_v4 = ROOT / 'supabase/functions/_shared/echo-brain-semantic-v4.ts'
ui = ROOT / 'admin/js/echo-brain-intelligence-ui.js'
training_ui = ROOT / 'admin/js/echo-brain-training-ui.js'
failures = []

for path in (migration, evaluate, train_wrapper, evaluate_wrapper, shared_v4, ui, training_ui):
    if not path.exists():
        failures.append(f'arquivo ausente: {path.relative_to(ROOT)}')

def compact(text: str) -> str:
    return ''.join(text.split())

if not failures:
    sql = migration.read_text(encoding='utf-8').lower()
    code = evaluate.read_text(encoding='utf-8')
    c = compact(code)
    train_shared = compact(train_wrapper.read_text(encoding='utf-8'))
    evaluate_shared = compact(evaluate_wrapper.read_text(encoding='utf-8'))
    v4 = compact(shared_v4.read_text(encoding='utf-8'))
    ui_code = ui.read_text(encoding='utf-8')
    training_code = training_ui.read_text(encoding='utf-8')

    for token in (
        'create table if not exists public.composition_model_activations',
        'create table if not exists public.composition_model_evaluations',
        'create table if not exists public.echo_brain_actions',
        'min_evaluation_matches integer not null default 60',
        'drift_feature_warn numeric(6,5) not null default 0.12',
        'drift_feature_critical numeric(6,5) not null default 0.22',
        'drift_brier_tolerance numeric(6,5) not null default 0.02',
        'alter table public.composition_model_evaluations enable row level security',
        'revoke all on table public.composition_model_evaluations from anon, authenticated',
        'create or replace function public.admin_echo_brain_rollback_model',
        'rollback_reason_required',
        'activation_history_required',
        "'rollback'",
        'learning_enabled=false',
        'grant execute on function public.admin_echo_brain_rollback_model(uuid,text) to authenticated',
        'weights,metrics',
        'composition_model_evaluations',
        'echo_brain_actions',
    ):
        if token not in sql:
            failures.append(f'migration drift/rollback sem salvaguarda: {token}')
    if 'learning_enabled=true' in compact(sql):
        failures.append('migration de drift liga influência automaticamente')

    required = (
        "from'./composition-brain.ts'",
        "service.from('composition_match_observations')",
        ".eq('trust_level','verified')",
        ".gt('occurred_at',after)",
        "observation_provenance",
        "query=query.eq('recommended_by_brain',false).eq('observation_provenance','organic')",
        "constorganicOnly=true",
        "service.from('composition_model_evaluations').insert",
        "service.from('echo_brain_actions').insert",
        'active_model_required',
        'validated_active_model_required',
        'unsupported_feature_schema',
        'trainingFeatureMeans',
        'meanAbsoluteDrift',
        'modelBrier-baselineBrier',
        "?'drift':",
        'topFeatureDrift',
        'brainInfluencedMatches',
        "row.provenance==='organic'&&!row.recommendedByBrain",
        'evaluatorVersion:7',
        "observationProvenance:'organic'",
        "validateModelSpecV4(model,schema,expectedNames)",
        "training_feature_means_invalid",
        "dataSource:'composition_match_observations'",
        'featureNamesForSchemaV4asfeatureNamesForSchema',
        'featureVectorV4asfeatureVector',
        'isSupportedFeatureSchemaV4asisSupportedFeatureSchema',
        'SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION',
    )
    for token in required:
        if token not in c:
            failures.append(f'avaliador de drift sem contrato v4/proveniência: {token}')

    for token in (
        'Math.random',
        'organic_training_only!==false',
        "'all_verified'",
        "'mixed_verified'",
        'Number(value)||0',
        "service.from('analytics_events')",
        "service.from('team_compositions')",
        "service.from('team_synergies')",
        "service.from('echo_brain_settings').update",
        "service.from('composition_model_versions').update",
        'learning_enabled:true',
        "status:'active'",
    ):
        if token in c:
            failures.append(f'avaliador contém ação/label automático proibido: {token}')

    if train_shared != evaluate_shared:
        failures.append('wrappers de treino e avaliação divergiram; extração deixaria de ser comparável')
    for token in (
        "export*from'../_shared/echo-brain-semantic.ts';",
        "export*from'../_shared/echo-brain-semantic-v4.ts';",
    ):
        if token not in train_shared:
            failures.append(f'wrapper compartilhado sem versão semântica: {token}')
    for token in ('featureVectorV4', 'featureNamesForSchemaV4', 'isSupportedFeatureSchemaV4'):
        if token not in v4:
            failures.append(f'v4 sem função comparável de drift: {token}')

    for token in ('evaluateActiveBrainModel()', 'renderHealth(snapshot)', 'renderExplainability(snapshot)', 'renderHistory(snapshot)', 'brainInfluencedMatches'):
        if token not in ui_code:
            failures.append(f'UI de inteligência sem integração final: {token}')
    for token in ('rollbackBrainModel(modelId,reason)', 'data-rollback-model', 'window.prompt(', 'influência ficará DESLIGADA'):
        if token not in training_code:
            failures.append(f'UI de rollback sem governança: {token}')

if failures:
    print(f'Gate de drift/rollback do Echo Brain falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Echo Brain drift: v1-v4 comparáveis por schema, avaliação pós-ativação com proveniência orgânica explícita, explicabilidade e rollback auditável validados.')
