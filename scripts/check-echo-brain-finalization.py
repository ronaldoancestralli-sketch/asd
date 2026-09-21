#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
pipeline = ROOT / 'supabase/migrations/20260822031007_echo_brain_final_pipeline_shadow_backtest.sql'
shadow_runtime = ROOT / 'supabase/migrations/20260822031240_echo_brain_shadow_runtime.sql'
influence_gate = ROOT / 'supabase/migrations/20260822031909_echo_brain_public_influence_gate.sql'
train = ROOT / 'supabase/functions/echo-brain-train/index.ts'
evaluate = ROOT / 'supabase/functions/echo-brain-evaluate/index.ts'
shadow = ROOT / 'supabase/functions/echo-brain-shadow/index.ts'
backtest = ROOT / 'supabase/functions/echo-brain-backtest/index.ts'
shared_v4 = ROOT / 'supabase/functions/_shared/echo-brain-semantic-v4.ts'
shared_paths = [
    ROOT / 'supabase/functions/echo-brain-train/composition-brain.ts',
    ROOT / 'supabase/functions/echo-brain-evaluate/composition-brain.ts',
    ROOT / 'supabase/functions/echo-brain-shadow/composition-brain.ts',
    ROOT / 'supabase/functions/echo-brain-backtest/composition-brain.ts',
]
core = ROOT / 'admin/js/echo-brain-core.js'
actions = ROOT / 'admin/js/echo-brain-actions.js'
final_ui = ROOT / 'admin/js/echo-brain-final-ui.js'
final_css = ROOT / 'admin/css/echo-brain-final.css'
html = ROOT / 'admin/echo-brain.html'
dashboard = ROOT / 'admin/index.html'
dashboard_ui = ROOT / 'admin/js/dashboard-brain.js'
paths = (pipeline, shadow_runtime, influence_gate, train, evaluate, shadow, backtest, shared_v4, *shared_paths, core, actions, final_ui, final_css, html, dashboard, dashboard_ui)
failures = []

for path in paths:
    if not path.exists():
        failures.append(f'arquivo ausente: {path.relative_to(ROOT)}')

def compact(text: str) -> str:
    return ''.join(text.split())

if not failures:
    pipe = pipeline.read_text(encoding='utf-8').lower()
    runtime = compact(shadow_runtime.read_text(encoding='utf-8').lower())
    gate = influence_gate.read_text(encoding='utf-8').lower()
    train_code = compact(train.read_text(encoding='utf-8'))
    evaluate_code = compact(evaluate.read_text(encoding='utf-8'))
    shadow_code = compact(shadow.read_text(encoding='utf-8'))
    backtest_code = compact(backtest.read_text(encoding='utf-8'))
    v4_code = compact(shared_v4.read_text(encoding='utf-8'))
    core_code = core.read_text(encoding='utf-8')
    actions_code = actions.read_text(encoding='utf-8')
    ui = final_ui.read_text(encoding='utf-8')
    css = final_css.read_text(encoding='utf-8')
    page = html.read_text(encoding='utf-8')
    dash = dashboard.read_text(encoding='utf-8')
    dash_ui = dashboard_ui.read_text(encoding='utf-8')

    for token in (
        'create table if not exists public.composition_observation_batches',
        'create table if not exists public.composition_match_observations',
        'create table if not exists public.composition_shadow_predictions',
        'create table if not exists public.composition_backtest_runs',
        'create table if not exists public.composition_backtest_results',
        'recommended_by_brain boolean not null default false',
        'recommendation_model_id uuid',
        'unique (source_name, external_match_key)',
        "trust_level in ('verified','corroborated','review')",
        "source_type in ('official','partner','admin_import','manual_verified')",
        'alter table public.composition_match_observations enable row level security',
        'revoke all on table public.composition_match_observations from anon, authenticated',
        'create or replace function public.admin_echo_brain_ingest_observations',
        'batch_fingerprint', 'duplicate_batch', 'three_distinct_heroes_required',
        'active_heroes_required', 'future_observation', 'recommendation_model_required',
        "values('ingest'", 'organicverifiedobservations', 'braininfluencedobservations',
        'distinctorganictrios', 'echo_brain_emergency_shadow_guard', 'echo_brain_emergency_backtest_guard',
    ):
        if token not in pipe:
            failures.append(f'pipeline final sem contrato: {token}')

    for token in (
        'shadow_mode_enabled boolean not null default false',
        'organic_training_only boolean not null default true',
        'min_shadow_matches integer not null default 60',
        'min_backtest_matches integer not null default 30',
    ):
        if token not in pipe:
            failures.append(f'settings finais sem default seguro: {token}')

    for token in (
        'createorreplacefunctionpublic.admin_echo_brain_set_shadow_mode',
        'shadow_mode_enabled=coalesce(p_enabled,false)',
        'brain_emergency_active', 'shadow_mode_enabled=false', 'learning_enabled=false',
        'auto_training_enabled=false', 'auto_promotion_enabled=false',
    ):
        if token not in runtime:
            failures.append(f'runtime Shadow sem contrato seguro: {token}')

    for token in (
        'successful_backtest_required', 'shadow_sample_required', 'shadow_validation_failed',
        'min_backtest_matches', 'min_shadow_matches', 'composition_shadow_predictions',
        'composition_backtest_runs', 'v_shadow_brier >= v_shadow_baseline_brier',
        'learning_enabled = coalesce(p_learning_enabled, false)',
    ):
        if token not in gate:
            failures.append(f'barreira de influência pública incompleta: {token}')

    required_train = (
        "service.from('composition_match_observations')", ".eq('trust_level','verified')",
        'organic_training_only', 'recommended_by_brain!==true', "observation_provenance==='organic'",
        'executorVersion:8', "observationProvenance:'organic'", 'organicTrainingOnly:ORGANIC_TRAINING_ONLY',
        "dataSource:'composition_match_observations'", 'dataset_fingerprint:fingerprint',
        'modelBrier<baselineBrier', 'SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION',
        'semanticContextV4FeatureVector(team)', "status:'candidate'",
    )
    for token in required_train:
        if token not in train_code:
            failures.append(f'treinador final sem proveniência/anti-loop v4: {token}')

    required_evaluate = (
        "service.from('composition_match_observations')", ".gt('occurred_at',after)",
        'observation_provenance', "query=query.eq('recommended_by_brain',false).eq('observation_provenance','organic')",
        'brainInfluencedMatches', 'evaluatorVersion:7',
        "observationProvenance:'organic'", 'constorganicOnly=true',
        'validateModelSpecV4(model,schema,expectedNames)',
        'featureVectorV4asfeatureVector', 'isSupportedFeatureSchemaV4asisSupportedFeatureSchema',
    )
    for token in required_evaluate:
        if token not in evaluate_code:
            failures.append(f'avaliador final sem janela prospectiva/schema v4/proveniência: {token}')

    required_shadow = (
        "service.from('composition_shadow_predictions')", 'shadow_mode_enabled',
        'observation_provenance', 'constorganicOnly=true',
        ".eq('recommended_by_brain',false).eq('observation_provenance','organic')",
        'newDate(o.occurred_at).getTime()>newDate(model.created_at).getTime()',
        "model_role:model.id===settings.active_model_id?'champion':'challenger'",
        'zero_public_influence:true', 'featureVectorV4asfeatureVector',
        'isSupportedFeatureSchemaV4asisSupportedFeatureSchema',
    )
    for token in required_shadow:
        if token not in shadow_code:
            failures.append(f'Shadow sem contrato prospectivo/orgânico v4: {token}')

    required_backtest = (
        'observation_provenance', 'constorganicOnly=true',
        "row.recommended_by_brain!==true&&row.observation_provenance==='organic'",
        'dataset_reconstruction_mismatch', 'reconstructedFingerprint!==target.dataset_fingerprint',
        'validationRows', 'historicalReplay:true', 'exactTrainingFingerprint:true',
        'composition_backtest_results', 'zero_public_influence:true', 'crossSchemaComparison:true',
        'featureVectorV4asfeatureVector', 'isSupportedFeatureSchemaV4asisSupportedFeatureSchema',
        'validateModelSpecV4(model,schema,expected)',
    )
    for token in required_backtest:
        if token not in backtest_code:
            failures.append(f'Backtest sem replay auditável/orgânico/schema v4: {token}')

    for label, code in (('shadow', shadow_code), ('backtest', backtest_code)):
        for forbidden in (
            'admin_echo_brain_promote_model', 'admin_echo_brain_set_runtime',
            'learning_enabled:true', "status:'active'", "service.from('analytics_events')",
            "service.from('team_compositions')",
        ):
            if forbidden in code:
                failures.append(f'{label} contém decisão/label proibido: {forbidden}')

    for label, code in (('train', train_code), ('evaluate', evaluate_code), ('shadow', shadow_code), ('backtest', backtest_code)):
        for forbidden in ('organic_training_only!==false', "'all_verified'", "'mixed_verified'"):
            if forbidden in code:
                failures.append(f'{label} torna o isolamento orgânico opcional: {forbidden}')

    wrappers = [compact(path.read_text(encoding='utf-8')) for path in shared_paths]
    if any(code != wrappers[0] for code in wrappers[1:]):
        failures.append('wrappers de treino, drift, Shadow e Backtest divergiram')
    for token in (
        "export*from'../_shared/echo-brain-semantic.ts';",
        "export*from'../_shared/echo-brain-semantic-v4.ts';",
    ):
        if token not in wrappers[0]:
            failures.append(f'wrapper final sem módulo compartilhado: {token}')
    for token in ('featureVectorV4', 'featureNamesForSchemaV4', 'semanticContextV4FeatureVector', 'composition-semantic-context-v4'):
        if token not in v4_code:
            failures.append(f'camada v4 sem contrato final: {token}')

    for token in ('pipeline:{', 'shadow:{', 'backtests:{rows:', 'organicVerifiedObservations', 'distinctOrganicTrios', 'validationRows=Math.floor(totalMatches*.2)'):
        if token not in core_code:
            failures.append(f'core não usa pipeline verificado: {token}')
    for token in (
        "supabase.rpc('admin_echo_brain_ingest_observations'",
        "supabase.rpc('admin_echo_brain_set_shadow_mode'",
        "supabase.functions.invoke('echo-brain-shadow'",
        "supabase.functions.invoke('echo-brain-backtest'",
    ):
        if token not in actions_code:
            failures.append(f'actions finais sem integração: {token}')
    for token in ('PIPELINE', 'SHADOW MODE', 'REPLAY / BACKTEST', 'recommendedByBrain', 'window.confirm(', 'runBrainShadow()', 'runBrainBacktest', 'ingestBrainObservations', 'setBrainShadowMode'):
        if token not in ui:
            failures.append(f'UI final sem experiência: {token}')
    for token in ('.brain-final-pipeline{', '.brain-final-grid{', '.brain-import-form{', '@media(max-width:1050px)', '@media(max-width:700px)', '@media(max-width:460px)', '@media(pointer:coarse)', '@media(prefers-reduced-motion:reduce)'):
        if token not in css:
            failures.append(f'CSS final sem responsividade: {token}')
    for token in ('./css/echo-brain-final.css?v=20260822-brain-final-1', './js/echo-brain-final-ui.js?v=20260822-brain-final-1', 'Escopo concluído:'):
        if token not in page:
            failures.append(f'página não ativa conclusão do Brain: {token}')
    if './js/dashboard-brain.js?v=20260822-brain-final-1' not in dash:
        failures.append('Dashboard sem cache final do Brain')
    for token in ('snapshot.pipeline', 'Shadow ON', 'Shadow OFF'):
        if token not in dash_ui:
            failures.append(f'Dashboard sem estado final: {token}')

if failures:
    print(f'Gate de conclusão do Echo Brain falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Echo Brain final: pipeline v1-v4 verificável, proveniência orgânica fail-closed, Replay, Shadow Champion/Challenger e barreira de influência pública validados.')
