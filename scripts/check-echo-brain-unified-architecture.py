#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
paths = {
    'knowledge': ROOT / 'supabase/migrations/20260823160040_echo_brain_unified_knowledge.sql',
    'graph_rpc': ROOT / 'supabase/migrations/20260823160050_echo_brain_investigation_and_graph.sql',
    'provenance': ROOT / 'supabase/migrations/20260823160100_echo_brain_exposure_provenance_ingest.sql',
    'debt': ROOT / 'supabase/migrations/20260823160110_echo_brain_knowledge_debt_resolution.sql',
    'graph_idempotence': ROOT / 'supabase/migrations/20260823160120_echo_brain_graph_rebuild_idempotence.sql',
    'transversal_guards': ROOT / 'supabase/migrations/20260824073041_echo_brain_transversal_authority_guards.sql',
    'provenance_backfill': ROOT / 'supabase/migrations/20260823160130_echo_brain_observation_provenance_backfill.sql',
    'exposure_dedup': ROOT / 'supabase/migrations/20260823160140_echo_brain_exposure_dedup.sql',
    'counterfactual_audit': ROOT / 'supabase/migrations/20260823160150_echo_brain_admin_counterfactual_audit.sql',
    'graph': ROOT / 'js/echo-brain-semantic-graph-v1.js',
    'counterfactual': ROOT / 'js/echo-brain-counterfactual-v1.js',
    'build_counterfactual': ROOT / 'js/echo-brain-build-counterfactual-v1.js',
    'build_counterfactual_ui': ROOT / 'admin/js/echo-brain-build-counterfactual-ui.js',
    'item_fit_client': ROOT / 'js/echo-brain-item-fit-client-v4.js',
    'item_fit_server': ROOT / 'supabase/functions/echo-brain-item-fit/index.ts',
    'build_analysis': ROOT / 'js/build-analise.js',
    'build_creator': ROOT / 'js/criar-build.js',
    'build_compare': ROOT / 'js/comparar-build.js',
    'build_audit_bridge': ROOT / 'js/build-analise-audit.js',
    'client': ROOT / 'js/echo-brain-composition-client-v4.js',
    'public_response': ROOT / 'js/echo-brain-public-response-v4.js',
    'orchestrator': ROOT / 'js/compositions-semantic-v4.js',
    'score': ROOT / 'supabase/functions/echo-brain-score/index.ts',
    'equipment_context': ROOT / 'supabase/functions/_shared/echo-brain-equipment-context-v1.ts',
    'public_policy': ROOT / 'supabase/functions/_shared/echo-brain-public-policy-v4.ts',
    'composition_html': ROOT / 'composicoes.html',
    'investigation': ROOT / 'admin/js/echo-brain-investigation-ui.js',
    'equipment_ui': ROOT / 'admin/js/echo-brain-equipment-ui.js',
    'train': ROOT / 'supabase/functions/echo-brain-train/index.ts',
    'shadow': ROOT / 'supabase/functions/echo-brain-shadow/index.ts',
    'evaluate': ROOT / 'supabase/functions/echo-brain-evaluate/index.ts',
    'backtest': ROOT / 'supabase/functions/echo-brain-backtest/index.ts',
    'graph_test': ROOT / 'tests/echo-brain-semantic-graph.test.mjs',
    'counterfactual_test': ROOT / 'tests/echo-brain-counterfactual.test.mjs',
}
failures = []
for name, path in paths.items():
    if not path.exists(): failures.append(f'arquivo ausente ({name}): {path.relative_to(ROOT)}')

if not failures:
    text = {name: path.read_text(encoding='utf-8') for name, path in paths.items()}
    low = {name: value.lower() for name, value in text.items()}

    for token in (
        'create table if not exists public.echo_brain_knowledge_versions',
        "entity_type in ('hero_profile','ruleset')",
        'create table if not exists public.echo_brain_knowledge_invalidations',
        'create table if not exists public.echo_brain_semantic_edges',
        'create table if not exists public.echo_brain_decision_audits',
        'create table if not exists public.echo_brain_counterfactual_audits',
        'create table if not exists public.echo_brain_recommendation_exposures',
        'recommendation_exposure_id uuid',
        'observation_provenance text not null',
        'trg_echo_brain_hero_skill_dirty',
        'trg_echo_brain_hero_base_stats_dirty',
        'trg_echo_brain_hero_weapon_stats_dirty',
        "'operation','baseline_required'",
        'create or replace function public.admin_echo_brain_reconcile_knowledge',
        'create or replace view public.echo_brain_current_knowledge',
        'create or replace function public.admin_echo_brain_simulation_readiness',
        "'simulatorenabled', false",
    ):
        if token not in low['knowledge']:
            failures.append(f'fonte de verdade incompleta: {token}')

    for token in (
        'create or replace function public.admin_echo_brain_replace_semantic_edges',
        "scope in ('build_recommendations','composition_recommendations')",
        'create or replace function public.admin_echo_brain_investigation_snapshot',
        'recommendationexposures',
        'brainexposedobservations',
    ):
        if token not in low['graph_rpc']:
            failures.append(f'grafo/investigação sem contrato: {token}')

    for token in (
        'on conflict (season_id,source_type,source_id,relation,target_type,target_id,source_fingerprint)',
        'v_was_existing', 'active=true', "'idempotent',true", 'is not distinct from'
    ):
        if token not in low['graph_idempotence']:
            failures.append(f'rebuild do grafo não é idempotente: {token}')

    for token in (
        'echo_brain_settings_organic_training_only_true', 'organic_training_only is true',
        'semantic_edges_cannot_be_empty', 'semantic_edge_type_invalid',
        'semantic_edge_relation_invalid', 'semantic_edge_fingerprint_invalid',
        'semantic_graph_coverage_incomplete', "s.verification_status='verified'",
        "s.needs_recheck is false", "e.source_id=i.entity_id", "'resolvedentityids'"
    ):
        if token not in low['transversal_guards']:
            failures.append(f'guardas transversais incompletas: {token}')

    for token in (
        'composition_match_observations_recommendation_provenance_check',
        "v_provenance := 'brain_exposed'", 'recommendationexposureid',
        'feedback_loop_guard', 'recommendation_provenance_required'
    ):
        if token not in low['provenance']:
            failures.append(f'anti-feedback-loop incompleto: {token}')

    for token in (
        "b.source_type in ('official','partner','manual_verified')", "then 'organic'",
        "when v_source_type='admin_import' then 'admin_import'", 'echo_brain_observation_provenance_guard'
    ):
        if token not in low['provenance_backfill']:
            failures.append(f'backfill/proveniência fail-closed incompleto: {token}')

    for token in (
        'hashtextextended', "interval '5 minutes'", 'context_hash=v_context',
        'context_hash_required', 'grant execute on function public.echo_brain_register_recommendation_exposure'
    ):
        if token not in low['exposure_dedup']:
            failures.append(f'RPC pública de exposição sem deduplicação/limite: {token}')

    for token in (
        'create or replace function public.admin_echo_brain_record_counterfactual',
        'if not public.echo_is_admin()', "v_domain not in ('composition','build','equipment')",
        'echo_brain_counterfactual_audits'
    ):
        if token not in low['counterfactual_audit']:
            failures.append(f'auditoria contrafactual admin sem contrato: {token}')

    for token in (
        "new.feature_schema_version <> 'composition-semantic-context-v4'", 'validationobservedfrom',
        "i.scope='training'", 'trg_echo_brain_resolve_knowledge_training_debt',
        'não resolve simulation_readiness'.lower()
    ):
        if token not in low['debt']:
            failures.append(f'resolução de dívida de conhecimento insegura: {token}')

    for token in ('buildEchoBrainSemanticGraph', 'has_skill', 'produces_effect', 'uses_trigger', 'values_stat', 'modifies_stat', 'explainSemanticPath'):
        if token not in text['graph']:
            failures.append(f'grafo semântico sem capacidade: {token}')

    for token in ('compareCounterfactual', 'mechanicalDemand: -1', 'rankCounterfactuals', 'unknown', 'explainCounterfactual', "value === null || value === undefined || value === ''"):
        if token not in text['counterfactual']:
            failures.append(f'contrafactual incompleto: {token}')

    for token in ('evaluateEquipmentSwapCounterfactualsV1', 'oneChangeAtATimeInvariantV1', 'evaluateBuild', 'baselineResult'):
        if token not in text['build_counterfactual']:
            failures.append(f'contrafactual de build incompleto: {token}')

    for token in (
        "functions.invoke('echo-brain-item-fit'", 'validatePublicItemFitResponseV4',
        "fallback: 'none'", 'localInfluence: 0'
    ):
        if token not in text['item_fit_client']:
            failures.append(f'cliente Item Fit público sem autoridade fail-closed: {token}')

    for token in (
        "SCHEMA = 'echo-brain-item-fit-public-v4'", "from('hero_complete_base_stats')",
        "from('hero_skills')", ".eq('verification_status', 'verified').eq('needs_recheck', false)",
        "from('echo_brain_knowledge_versions')", "from('equipment_brain_versions')",
        "from('equipment_brain_invalidations')", 'knowledge_not_current',
        'evaluateAppliedModifiersForHeroV4', 'applyEquipmentStats',
        'equipment-attribute-calculation.js', 'normalizeEquipmentAttributesForCalculation',
        "rpc('echo_brain_register_recommendation_exposure'", "authority: 'server'",
        "fallback: 'none'", 'localInfluence: 0'
    ):
        if token not in text['item_fit_server']:
            failures.append(f'servidor Item Fit v4 incompleto: {token}')

    for name in ('build_audit_bridge', 'build_counterfactual_ui'):
        if 'analisarBuildComAutoridadeV4' not in text[name]:
            failures.append(f'{name} contorna a autoridade Item Fit do servidor')
    if 'prepararAnalisePublicaV4' not in text['build_analysis'] or "fallback: 'none'" not in text['build_analysis']:
        failures.append('análise pública de build não declara fallback local zero')

    for name in ('build_creator', 'build_compare'):
        for token in ('analyzeBuildV2', 'loadCalculationDataV2'):
            if token not in text[name]:
                failures.append(f'{name} não usa o Calculation V2: {token}')
        for forbidden in ('analisarBuildComAutoridadeV4', 'prepararAnalisePublicaV4'):
            if forbidden in text[name]:
                failures.append(f'{name} voltou ao motor legado: {forbidden}')
    for name in ('build_creator', 'build_compare', 'build_counterfactual_ui'):
        if 'analisarBuild({' in text[name]:
            failures.append(f'{name} ainda publica scorer local')

    for token in (
        "from '../../js/build-analise.js?v=18&sb=20260823-security-supabase-pin-1&sc=20260906-1&eq=20260907-effects-1'", 'evaluateEquipmentSwapCounterfactualsV1',
        "analisarBuildComAutoridadeV4(ctx, 'comparison')", "slotKey: 'audit-slot'", 'mesmo slot',
        "rpc('admin_echo_brain_record_counterfactual'", 'calculationCoverage',
        'Contrafactual isolado'
    ):
        if token not in text['build_counterfactual_ui']:
            failures.append(f'contrafactual de build não está consumido de forma auditável: {token}')
    if 'uma única posição' not in low['build_counterfactual_ui']:
        failures.append('contrafactual de build não declara a invariante de uma única posição')

    for token in (
        "functions.invoke('echo-brain-score'", 'recordAudit: auditRequested',
        'registerCompositionExposureV4', "rpc('echo_brain_register_recommendation_exposure'",
        'validateCompositionScoreResponseV4(data, normalized)', 'PUBLIC_COMPOSITION_SCORE_SCHEMA_V4'
    ):
        if token not in text['client']:
            failures.append(f'cliente público v4 sem contrato: {token}')

    for token in (
        'PUBLIC_COMPOSITION_SCORE_SCHEMA_V4', 'PUBLIC_COMPOSITION_EQUIPMENT_SCHEMA_V1',
        'result_cardinality_mismatch', 'result_identity_mismatch', 'result_contract_invalid',
        "finiteInRange(result.equipmentAdjustment, -4, 4)", 'validKnowledge', 'validConfidence'
    ):
        if token not in text['public_response']:
            failures.append(f'validador da resposta pública v4 incompleto: {token}')

    for token in (
        'PUBLIC_SCORING_LIMITS', 'finitePolicyNumber', 'normalizePublicScoringPayload',
        'readJsonBodyLimited', 'validateModelSpecV4', 'learningPreflightV4',
        'resolveLearningInfluenceV4', 'effectiveTeamInfluenceV4',
        "value === null || value === undefined || value === ''"
    ):
        if token not in text['public_policy']:
            failures.append(f'policy pública v4 sem contrato executável: {token}')

    for token in (
        'COMPOSITION_EQUIPMENT_CONTEXT_V1_SCHEMA',
        'COMPOSITION_EQUIPMENT_CONTEXT_V1_MAX_ADJUSTMENT = 4',
        'assessCompositionEquipmentContextV1',
        'selectedLoadoutAssumed: false',
        'setBonusesAssumed: false',
        'bestSemanticSupportPerSlotOnly: true',
        'const adjustment = sufficient',
        'bestBySlot'
    ):
        if token not in text['equipment_context']:
            failures.append(f'contexto de equipamentos de composição incompleto: {token}')

    for token in (
        "from '../_shared/echo-brain-public-policy-v4.ts'",
        "from '../_shared/echo-brain-equipment-context-v1.ts'",
        'semanticCompositionAssessmentV4', 'functionalSynergy', 'semanticSynergy', 'observedPerformance', 'mechanicalDemand',
        'confidenceComponents', 'learnedAllowed', 'debt.fresh', 'learnedSuppressedReason',
        'echo_brain_decision_audits', 'echo_brain_counterfactual_audits',
        'body?.recordAudit === true', 'adminAuditAllowed', 'service.auth.getUser(token)',
        'auditAllowed && responseResults.length', 'normalizePublicScoringPayload(body)',
        'readJsonBodyLimited(req)', 'validateModelSpecV4', 'learningPreflightV4',
        'resolveLearningInfluenceV4', 'effectiveTeamInfluenceV4',
        "service.from('equipments')", "service.from('equipment_variants')",
        'assessCompositionEquipmentContextV1(heroes, equipmentCatalogue)',
        'heroSkillSemanticScore', 'equipmentAdjustment', 'equipmentContext',
        'equipmentContextSourceAvailable',
        'featureVectorV4(heroes, spec.schema)',
        'Recommendation exposures are never written with service-role',
        'normalizePublicRecommendationPayload', 'recommendationCandidatesFromCatalog',
        "authority: 'server'", "fallback: 'none'", 'localInfluence: 0',
        "service.from('echo_brain_knowledge_versions')", "service.from('equipment_brain_versions')",
        'equipmentCatalogueFingerprint', 'knowledge_not_current'
    ):
        if token not in text['score']:
            failures.append(f'scorer público sem separação/segurança: {token}')
    if 'body?.recordExposure === true' in text['score']:
        failures.append('scorer público ainda aceita escrita de exposição via service-role')
    if "from('equipment_set_bonuses')" in text['score']:
        failures.append('scorer de composição v1 não pode presumir bônus de conjunto sem loadout escolhido')

    for forbidden in ('weights:', 'coefficients:', 'intercept:'):
        response_zone = text['score'].split('return json({', 1)[-1]
        if forbidden in response_zone:
            failures.append(f'scorer público parece expor peso interno: {forbidden}')

    for token in (
        'COMPOSITION_SELECTION_EVENT', 'scoreCompositionTeamsV4', 'recommendCompositionTeamsV4', 'renderSemanticStrip', 'rescoreRecommendations',
        'counterfactual', 'response.results.map(recommendationCard)', 'nenhum rank local foi usado', 'lastRecommendationSignature',
        'registerCompositionExposureV4', 'ensureCompositionExposure', 'if (!exposureId) return false',
        'equipmentContextLabel', 'result.equipmentAdjustment', 'confidence.equipmentContext',
        'potencial do catálogo'
    ):
        if token not in text['orchestrator']:
            failures.append(f'orquestrador público não torna v4 árbitro final/estável: {token}')
    if 'recordAudit: true' in text['orchestrator'] or 'auditContext:' in text['orchestrator']:
        failures.append('orquestrador público não deve solicitar auditoria administrativa detalhada')
    if 'assessCompositionEquipmentContextV1' in text['orchestrator'] or "from('equipments')" in text['orchestrator']:
        failures.append('orquestrador público não deve recalcular contexto de equipamentos no navegador')

    for token in (
        './css/compositions-semantic-v4.css?v=20260827-brain-runtime-1',
        './js/compositions-semantic-v4.js?v=20260827-brain-runtime-1', 'Echo Brain Semantic v4',
        'Compatibilidade adaptativa', 'histórico real só entra após validação', 'Não é win rate nem sinergia medida',
        'potencial do catálogo atual', 'nunca é tratado como uma build equipada'
    ):
        if token not in text['composition_html']:
            failures.append(f'Composições não conectada ao Semantic v4/contrato público: {token}')

    for token in (
        'admin_echo_brain_reconcile_knowledge', 'admin_echo_brain_replace_semantic_edges',
        'admin_echo_brain_investigation_snapshot', 'admin_echo_brain_simulation_readiness',
        'buildEchoBrainSemanticGraph', 'scoreCompositionTeamsV4', "crypto.subtle.digest('SHA-256'",
        'sourceFingerprint', 'Investigar trio', 'Investigar herói × item',
        'recordAudit: true', 'auditContext: `admin-investigation:',
        ".eq('verification_status', 'verified').eq('needs_recheck', false)"
    ):
        if token not in text['investigation']:
            failures.append(f'modo investigação incompleto: {token}')

    for token in (
        "echo-brain-investigation-ui.js?v=20260824-brain-investigation-2",
        "echo-brain-build-counterfactual-ui.js?v=20260905-operator-consistency-1"
    ):
        if token not in text['equipment_ui']:
            failures.append(f'painel Brain não carrega ferramenta: {token}')

    for token in ("organic_training_only", "row.recommended_by_brain !== true", "row.observation_provenance === 'organic'", 'observationProvenance'):
        if token not in text['train']:
            failures.append(f'treino perdeu proteção orgânica: {token}')

    for name in ('shadow', 'evaluate', 'backtest'):
        for token in ('observation_provenance', 'recommended_by_brain'):
            if token not in text[name]: failures.append(f'{name} não carrega proveniência: {token}')
        if "'organic'" not in text[name] or 'organicOnly' not in text[name]:
            failures.append(f'{name} não aplica gate orgânico explícito')
        if 'organic_training_only !== false' in text[name] or "'all_verified'" in text[name] or "'mixed_verified'" in text[name]:
            failures.append(f'{name} ainda torna o isolamento orgânico opcional')

    for name in ('evaluate', 'shadow', 'backtest'):
        if "from '../_shared/echo-brain-public-policy-v4.ts'" not in text[name] or 'validateModelSpecV4' not in text[name]:
            failures.append(f'{name} não reutiliza a validação fail-closed de pesos')
    if 'organic_training_only !== false' in text['train'] or "'all_verified'" in text['train'] or "'mixed_verified'" in text['train']:
        failures.append('treino ainda torna o isolamento orgânico opcional')

    if 'drop table public.echo_brain_knowledge_versions' in low['knowledge']:
        failures.append('migration unificada contém drop destrutivo')
    if 'grant all on table public.echo_brain_recommendation_exposures to anon' in low['knowledge']:
        failures.append('tabela de exposição foi aberta diretamente ao anon')

if failures:
    print(f'Gate unificado do Echo Brain falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures: print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Echo Brain unified architecture: fonte versionada, grafo idempotente+SHA256, contrafactual consumido pelo motor oficial, composição Semantic v4 com contexto de equipamento determinístico e limitado, policy pública executável e fail-closed, confiança componentizada, auditoria admin-only, exposição deduplicada, proveniência orgânica fail-closed, Shadow/Replay limpos e simulator gate validados estruturalmente.')

