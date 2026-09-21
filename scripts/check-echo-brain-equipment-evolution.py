#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
migration = ROOT / 'supabase/migrations/20260823160010_echo_brain_equipment_evolution.sql'
api = ROOT / 'admin/js/equipment-api.js'
health = ROOT / 'admin/js/echo-brain-equipment-health.js'
reconcile = ROOT / 'admin/js/echo-brain-equipment-reconcile.js'
ui = ROOT / 'admin/js/echo-brain-equipment-ui.js'
core = ROOT / 'admin/js/echo-brain-core.js'
html = ROOT / 'admin/echo-brain.html'
css = ROOT / 'admin/css/echo-brain-equipment.css'
freshness = ROOT / 'js/echo-brain-equipment-freshness.js'
build = ROOT / 'js/build-analise.js'
item_fit_v4 = ROOT / 'js/echo-brain-item-fit-v4.js'
v1 = ROOT / 'js/echo-brain-equipment-evolution-v1.js'
v2 = ROOT / 'js/echo-brain-equipment-evolution-v2.js'
tests = ROOT / 'tests/echo-brain-equipment-evolution.test.mjs'
tests_v2 = ROOT / 'tests/echo-brain-equipment-evolution-v2.test.mjs'
tests_fit_v4 = ROOT / 'tests/echo-brain-item-fit-v4.test.mjs'
failures = []

for path in (migration, api, health, reconcile, ui, core, html, css, freshness, build, item_fit_v4, v1, v2, tests, tests_v2, tests_fit_v4):
    if not path.exists():
        failures.append(f'arquivo ausente: {path.relative_to(ROOT)}')

if not failures:
    sql = migration.read_text(encoding='utf-8').lower()
    api_code = api.read_text(encoding='utf-8')
    health_code = health.read_text(encoding='utf-8')
    reconcile_code = reconcile.read_text(encoding='utf-8')
    ui_code = ui.read_text(encoding='utf-8')
    core_code = core.read_text(encoding='utf-8')
    html_code = html.read_text(encoding='utf-8')
    css_code = css.read_text(encoding='utf-8')
    freshness_code = freshness.read_text(encoding='utf-8')
    build_code = build.read_text(encoding='utf-8')
    item_fit_v4_code = item_fit_v4.read_text(encoding='utf-8')
    v1_code = v1.read_text(encoding='utf-8')
    v2_code = v2.read_text(encoding='utf-8')

    for token in (
        'create table if not exists public.equipment_brain_versions',
        'create table if not exists public.equipment_brain_invalidations',
        'create table if not exists public.equipment_brain_change_queue',
        'semantic_fingerprint text not null',
        'before_snapshot jsonb',
        'after_snapshot jsonb not null',
        "scope in ('item_fit','build_recommendations','composition_recommendations','training')",
        "'migration-bootstrap'",
        "'operation','baseline_required'",
        'from public.equipments e',
        'on conflict (equipment_id) do nothing',
        'create or replace function public.echo_brain_mark_equipment_dirty()',
        'trg_echo_brain_equipment_dirty',
        'trg_echo_brain_equipment_variant_dirty',
        'trg_echo_brain_equipment_set_bonus_dirty',
        'create or replace function public.admin_echo_brain_record_equipment_change',
        'if not public.echo_is_admin()',
        'perform pg_advisory_xact_lock(hashtextextended(p_equipment_id, 0))',
        "where s.active is true",
        'v_fingerprint := md5(v_after::text)',
        "status='resolved'",
        "'item_fit'",
        "'build_recommendations'",
        "'composition_recommendations'",
        "'training'",
        'create or replace function public.echo_brain_equipment_freshness',
        'grant execute on function public.echo_brain_equipment_freshness(text[]) to anon, authenticated'
    ):
        if token not in sql:
            failures.append(f'memória de equipamento sem contrato: {token}')

    for forbidden in (
        'drop table public.equipment_brain_versions',
        'grant all on table public.equipment_brain_versions to anon',
        'grant all on table public.equipment_brain_invalidations to anon'
    ):
        if forbidden in sql:
            failures.append(f'migration de equipamento contém comportamento proibido: {forbidden}')

    for token in (
        "from '../../js/echo-brain-equipment-evolution-v2.js?v=3'",
        'beforeBundle = await getEquipmentBundle',
        'analyzeEquipmentEvolutionV2(beforeBundle || null, afterBundle)',
        "supabase.rpc('admin_echo_brain_record_equipment_change'",
        "status: 'pending'",
        "new CustomEvent('equipment:brain-sync'"
    ):
        if token not in api_code:
            failures.append(f'save de equipamento não sincroniza Brain: {token}')

    for token in (
        "count('equipment_brain_change_queue'",
        "count('equipment_brain_invalidations'",
        "eq('scope', 'training')",
        'stale: pendingItems > 0 || pending > 0',
        'requiresRetraining: pendingTraining > 0'
    ):
        if token not in health_code:
            failures.append(f'saúde de equipamentos sem contrato: {token}')

    for token in (
        'bootstrapEquipmentBrainKnowledge',
        'reconcileEquipmentBrainQueue',
        "'baseline-bootstrap'",
        "'queue-reconcile'",
        "'queue-delete-reconcile'",
        'rehydrateSnapshot',
        'tombstoneBundle',
        'deletionAnalysis',
        "'equipment_removed'",
        'requiresRetraining: true',
        "from('equipment_brain_change_queue')",
        "from('equipment_brain_versions')",
        'baselineAnalysis',
        'requiresRetraining: analysis.requiresRetraining'
    ):
        if token not in reconcile_code:
            failures.append(f'reconciliação de equipamentos sem contrato: {token}')

    for token in (
        'bootstrapEquipmentBrainKnowledge()',
        'reconcileEquipmentBrainQueue()',
        'window.confirm(',
        "new CustomEvent('echo-brain:equipment-memory-changed'"
    ):
        if token not in ui_code:
            failures.append(f'UI de reconciliação sem proteção: {token}')

    for token in (
        "from './echo-brain-equipment-health.js?v=1&sb=20260823-security-supabase-pin-1'",
        'loadEquipmentBrainHealth()',
        'applyEquipmentKnowledgeHealth',
        "key:'equipment-drift'",
        "key:'equipment-stale'",
        'equipmentEvolution'
    ):
        if token not in core_code:
            failures.append(f'painel Brain não representa conhecimento de equipamento obsoleto: {token}')

    for token in (
        './css/echo-brain-equipment.css?v=20260823-brain-equipment-1',
        'id="brain-equipment-panel"',
        'id="brain-equipment-bootstrap"',
        'id="brain-equipment-reconcile"',
        './js/echo-brain-equipment-ui.js?v=20260905-operator-consistency-1'
    ):
        if token not in html_code:
            failures.append(f'página Echo Brain sem memória de equipamentos: {token}')

    for token in (
        '.brain-equipment-panel{', '.brain-equipment-grid{',
        '@media(max-width:900px)', '@media(max-width:620px)',
        '@media(prefers-reduced-motion:reduce)'
    ):
        if token not in css_code:
            failures.append(f'CSS da memória de equipamentos sem contrato: {token}')

    for token in (
        "supabase.rpc('echo_brain_equipment_freshness'",
        "from('equipments')",
        ".select('id')",
        'getEquipmentFreshness',
        'equipmentFreshnessState'
    ):
        if token not in freshness_code:
            failures.append(f'cache público de frescor sem contrato: {token}')
    if ".eq('enabled', true)" in freshness_code:
        failures.append('cache de frescor assume coluna enabled e pode quebrar schema legado')

    for token in (
        "from './echo-brain-item-fit-v4.js?v=4&sc=20260906-1'",
        "from './echo-brain-equipment-freshness.js?v=1&sb=20260823-security-supabase-pin-1'",
        'evaluateAppliedModifiersForHeroV4({',
        'behaviorTexts: comportamentosDaBuild(contexto)',
        'behaviorTexts: comportamentoDoItem(item)',
        'behaviorTexts: [ativo.desc || \'\'].filter(Boolean)',
        "knowledgeStatus === 'current' ? 1",
        "knowledgeStatus === 'stale' ? .65 : .75",
        'behaviorReasons',
        'pendingInvalidations'
    ):
        if token not in build_code:
            failures.append(f'build não usa comportamento/frescor do Echo Brain: {token}')

    for token in (
        'interpretEquipmentBehaviorV4',
        'evaluateEquipmentBehaviorForHeroV4',
        'evaluateAppliedModifiersForHeroV4',
        'behaviorWeight',
        'triggerMatches',
        'semanticCoverage'
    ):
        if token not in item_fit_v4_code:
            failures.append(f'Item Fit v4 sem contrato: {token}')

    for token in ('buff', 'nerf', 'numeric_change', 'attribute_behavior_change', 'requiresReevaluation'):
        if token not in v1_code:
            failures.append(f'comparador v1 sem conceito: {token}')

    for token in ('semantic_value_change', 'mechanicsChanged', 'numericChanged', 'requiresRetraining'):
        if token not in v2_code:
            failures.append(f'comparador v2 sem conceito: {token}')

if failures:
    print(f'Gate de evolução de equipamentos do Echo Brain falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Echo Brain equipment evolution: baseline obrigatória, versões imutáveis/concurrent-safe, buffs/nerfs, comportamento por herói, remoções, fila fail-safe, frescor público, reconciliação e invalidação seletiva validados.')
