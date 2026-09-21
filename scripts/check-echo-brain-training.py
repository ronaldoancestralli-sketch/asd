#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
edge = ROOT / 'supabase/functions/echo-brain-train/index.ts'
shared = ROOT / 'supabase/functions/_shared/echo-brain-semantic.ts'
shared_v4 = ROOT / 'supabase/functions/_shared/echo-brain-semantic-v4.ts'
wrapper = ROOT / 'supabase/functions/echo-brain-train/composition-brain.ts'
guard = ROOT / 'supabase/migrations/20260822013720_echo_brain_training_guard.sql'
promotion = ROOT / 'supabase/migrations/20260822013929_echo_brain_manual_promotion.sql'
failures = []

for path in (edge, shared, shared_v4, wrapper, guard, promotion):
    if not path.exists():
        failures.append(f'arquivo ausente: {path.relative_to(ROOT)}')

def compact(text: str) -> str:
    return ''.join(text.split())

if not failures:
    code = edge.read_text(encoding='utf-8')
    c = compact(code)
    shared_code = shared.read_text(encoding='utf-8')
    v4_code = shared_v4.read_text(encoding='utf-8')
    wrapper_code = wrapper.read_text(encoding='utf-8')
    guard_sql = compact(guard.read_text(encoding='utf-8').lower())
    promotion_sql = compact(promotion.read_text(encoding='utf-8').lower())

    required_edge = (
        "from'./composition-brain.ts'",
        "service.from('composition_match_observations')",
        ".eq('trust_level','verified')",
        'observation_provenance',
        'organic_training_only',
        "row.recommended_by_brain!==true&&row.observation_provenance==='organic'",
        "provenance:'explicit_organic_only'",
        "observationProvenance:'organic'",
        'organicTrainingOnly:ORGANIC_TRAINING_ONLY',
        "service.from('hero_skills')",
        'cooldown,duration',
        "service.from('echo_brain_settings')",
        "service.from('composition_training_runs').insert",
        "service.from('composition_model_versions').insert",
        "status:'candidate'",
        "status:'rejected'",
        "error:'not_ready'",
        "returnjson({error:'admin_required'},403)",
        'service.auth.getUser(token)',
        'functiondecodeJwtPayload(token:string)',
        'claims.sub!==data.user.id',
        "claims.aal!=='aal2'",
        "service.from('profiles').select('id,is_blocked')",
        "userClient.rpc('echo_is_admin')",
        'profile.is_blocked===true',
        'settings?.emergency_enabled===true',
        'modelBrier<baselineBrier',
        'dataset_fingerprint:fingerprint',
        'passed_validation:true',
        'trainingFeatureMeans=featureMeans(train)',
        'validationFeatureMeans=featureMeans(validation)',
        'executorVersion:8',
        "dataSource:'composition_match_observations'",
        "sourceTrust:'verified'",
        "semanticInterpreter:'deterministic-ptbr-context-v4'",
        'SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION',
        'SEMANTIC_CONTEXT_V4_FEATURE_NAMES.length*2',
        'semanticContextV4FeatureVector(team)',
        'trainObservedUntil',
        'validationObservedFrom',
        "algorithm:'logistic-regression-l2-semantic-context-v4'",
    )
    for token in required_edge:
        if token not in c:
            failures.append(f'Edge Brain sem salvaguarda/contrato v4: {token}')

    required_shared = (
        "FEATURE_SCHEMA_VERSION='composition-capabilities-v1'",
        "SEMANTIC_FEATURE_SCHEMA_VERSION='composition-semantic-effects-v2'",
        "SEMANTIC_CONTEXT_FEATURE_SCHEMA_VERSION='composition-semantic-context-v3'",
        'exportfunctiontrainLogistic',
        'exportfunctionbrier',
        'exportfunctionfeatureMeans',
        'exportfunctionpredict',
        'exportconstFEATURE_NAMES',
    )
    shared_compact = compact(shared_code)
    for token in required_shared:
        if token not in shared_compact:
            failures.append(f'Base semântica versionada sem contrato: {token}')

    required_v4 = (
        "SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION='composition-semantic-context-v4'",
        'semanticCorrectionsV4',
        'semanticContextV4FeatureVector',
        'featureVectorV4',
        'featureNamesForSchemaV4',
        'isSupportedFeatureSchemaV4',
        "'self_weapon_disable'",
        "'self_movement_penalty'",
        "'enemy_weapon_disable'",
        "'direct_hit_shield_break'",
        '...SEMANTIC_CONTEXT_FEATURE_NAMES',
    )
    v4_compact = compact(v4_code)
    for token in required_v4:
        if token not in v4_compact:
            failures.append(f'Camada semântica v4 sem contrato: {token}')

    for export_line in (
        "export*from'../_shared/echo-brain-semantic.ts';",
        "export*from'../_shared/echo-brain-semantic-v4.ts';",
    ):
        if export_line not in compact(wrapper_code):
            failures.append(f'wrapper de treino não expõe camada compartilhada: {export_line}')

    forbidden = (
        'Math.random',
        'organic_training_only!==false',
        "'all_verified'",
        "'mixed_verified'",
        "service.from('analytics_events')",
        "service.from('team_compositions')",
        "service.from('team_synergies')",
        "status:'active'",
        'learning_enabled:true',
        "from'./game-stat-engine.js'",
    )
    combined = c + shared_compact + v4_compact
    for token in forbidden:
        if token in combined:
            failures.append(f'Executor Brain contém label/comportamento proibido: {token}')

    for token in ("wherestatusin('queued','running')", 'composition_training_runs_one_inflight'):
        if token not in guard_sql:
            failures.append(f'guard de concorrência ausente: {token}')

    for token in (
        'createorreplacefunctionpublic.admin_echo_brain_promote_model',
        'ifnotpublic.is_admin()',
        "ifv_model.status<>'candidate'",
        'v_model.passed_validationisnottrue',
        "status='succeeded'",
        'passed_validationistrue',
        "setstatus='active'",
        'learning_enabled=false',
        'grantexecuteonfunctionpublic.admin_echo_brain_promote_model(uuid)toauthenticated',
    ):
        if token not in promotion_sql:
            failures.append(f'promoção manual sem salvaguarda: {token}')
    if 'learning_enabled=true' in promotion_sql:
        failures.append('promoção manual liga influência automaticamente')

if failures:
    print(f'Gate de treinamento do Echo Brain falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Echo Brain training: schema v4 aditivo, dados verificados e explicitamente orgânicos, holdout temporal, AAL2, piso anti-overfit, emergência e promoção manual validados.')
