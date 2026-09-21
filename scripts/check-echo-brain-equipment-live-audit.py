#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
coverage = ROOT / 'js/echo-brain-equipment-coverage-v1.js'
ui = ROOT / 'admin/js/echo-brain-equipment-coverage-ui.js'
equipment_ui = ROOT / 'admin/js/echo-brain-equipment-ui.js'
test_file = ROOT / 'tests/echo-brain-equipment-coverage.test.mjs'
workflow = ROOT / '.github/workflows/quality-gates.yml'
failures = []

for path in (coverage, ui, equipment_ui, test_file, workflow):
    if not path.exists():
        failures.append(f'arquivo ausente: {path.relative_to(ROOT)}')

if not failures:
    classifier = coverage.read_text(encoding='utf-8')
    admin_ui = ui.read_text(encoding='utf-8')
    loader = equipment_ui.read_text(encoding='utf-8')
    tests = test_file.read_text(encoding='utf-8')
    wf = workflow.read_text(encoding='utf-8')

    for token in (
        "from './game-stat-engine.js?v=15&sc=20260906-1&eq=20260907-effects-1'",
        'applyEquipmentStats',
        'canonicalKey',
        'resolverChavePT',
        "from './echo-brain-item-fit-v3.js?sc=20260906-1'",
        'evaluateAppliedModifiersForHeroV3',
        "from './echo-brain-semantic-graph-v1.js'",
        'buildEchoBrainSemanticGraph',
        'classifyEquipmentAttributeV1',
        "classification: 'numeric_mapping_known'",
        "classification: 'semantic_only'",
        "classification: 'unmapped'",
        'classifySetBonusTextV1',
        "'unmapped_text'",
        'auditEquipmentBundlesCoverageV1',
        'complete: unmapped.length === 0 && unmappedText.length === 0',
        'blockers:',
    ):
        if token not in classifier:
            failures.append(f'classificador de cobertura sem contrato: {token}')

    for forbidden in ('const PERCENT_TARGETS', 'const FLAT_TARGETS', 'const REGRAS_PT'):
        if forbidden in classifier:
            failures.append(f'classificador duplicou regra do motor numérico: {forbidden}')

    for token in (
        'listEquipments', 'getEquipmentBundle', 'mapLimit(equipments, 6',
        'auditEquipmentBundlesCoverageV1', 'Auditar catálogo vivo',
        'applyEquipmentStats()', 'sem efeito silenciosamente não mapeado',
        'readErrors', 'audit.complete = audit.complete && readErrors.length === 0',
        "echo-brain:equipment-coverage-audited"
    ):
        if token not in admin_ui:
            failures.append(f'auditor vivo sem contrato: {token}')

    for forbidden in ("supabase.from(", "supabase.rpc(", '.insert(', '.update(', '.delete('):
        if forbidden in admin_ui:
            failures.append(f'auditor vivo deixou de ser somente leitura: {forbidden}')

    if "echo-brain-equipment-coverage-ui.js?v=20260823-brain-coverage-1" not in loader:
        failures.append('painel de equipamentos do Brain não carrega auditoria viva')

    for token in (
        'numeric_mapping_known', 'semantic_only', 'mystery_stat_foo',
        'special_ability_cooldown_pct', 'crate_opening_cooldown_pct',
        'tempo_de_troca_de_modo_da_arma_primaria_percentual',
        'unmapped_text'
    ):
        if token not in tests:
            failures.append(f'teste de cobertura sem caso obrigatório: {token}')

    for token in (
        'Testar cobertura semântica/numérica do catálogo de equipamentos',
        'node --test tests/echo-brain-equipment-coverage.test.mjs',
        'Verificar auditoria viva do catálogo de equipamentos',
        'python3 scripts/check-echo-brain-equipment-live-audit.py'
    ):
        if token not in wf:
            failures.append(f'workflow não executa auditoria de cobertura: {token}')

if failures:
    print(f'Gate de cobertura viva de equipamentos falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Echo Brain equipment coverage: classificador reutiliza motores canônicos, semantic-only é explícito, unmapped vira blocker e auditoria do catálogo vivo é read-only.')
