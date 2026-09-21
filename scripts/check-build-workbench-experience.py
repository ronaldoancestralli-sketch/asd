#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
failures = []

required = [
    'criar-build.html',
    'js/criar-build-entry.js',
    'js/criar-build.js',
    'js/calculation-v2-engine.js',
    'js/calculation-v2-client.js',
    'js/calculation-v2-build-adapter.js',
    'js/calculation-v2-view.js',
    'js/build-unknown-taxonomy-ui.js',
    'js/public-navigation.js',
]
for rel in required:
    if not (ROOT / rel).exists():
        failures.append(f'arquivo ausente: {rel}')

if not failures:
    html = (ROOT / 'criar-build.html').read_text(encoding='utf-8')
    entry = (ROOT / 'js/criar-build-entry.js').read_text(encoding='utf-8')
    build = (ROOT / 'js/criar-build.js').read_text(encoding='utf-8')
    taxonomy = (ROOT / 'js/build-unknown-taxonomy-ui.js').read_text(encoding='utf-8')

    for token in (
        'class="workbench-zone"',
        'class="hero-panel"',
        'class="synergy-stage"',
        'id="ring"',
        'id="eq-count"',
        'class="impact-panel"',
        'id="impact-grid"',
        './js/criar-build-entry.js?v=20260906-home-featured-route-f2-1&sb=20260823-security-supabase-pin-1&calc=20260915-calculation-v2-1&partial=20260917-partial-effects-1',
        './js/build-unknown-taxonomy-ui.js?v=7&sb=20260823-security-supabase-pin-1',
        './css/calculation-v2.css?v=20260915-calculation-v2-1&partial=20260917-partial-effects-1',
        'id="calculation-v2-conditions"',
    ):
        if token not in html:
            failures.append(f'Mesa de Builds perdeu superfície/entrada esperada: {token}')

    for token in (
        "params.get('nova') === '1'",
        "params.get('heroi')",
        "params.delete('build')",
        "params.delete('draft')",
        'localStorage.removeItem(draftKey)',
        'items: []',
        "entrySource: handoffSource",
        "await import('./criar-build.js?v=20260906-home-featured-route-f2-1&sb=20260823-security-supabase-pin-1&calc=20260915-calculation-v2-1&partial=20260917-partial-effects-1')",
        'current?.entrySource === handoffSource',
    ):
        if token not in entry:
            failures.append(f'Entrada limpa da Mesa incompleta: {token}')

    for token in (
        "syncPublicNavigation('builds')",
        "from './calculation-v2-build-adapter.js?v=20260915-calculation-v2-1&partial=20260917-partial-effects-1'",
        "from './calculation-v2-view.js?v=20260915-calculation-v2-1&partial=20260917-partial-effects-1'",
        'effectRowsForEquipment(',
        'loadCalculationDataV2(supabase)',
        'const resultado = analyzeBuildV2(contexto)',
        'renderCalculationDetailsV2(resultado',
        'renderCalculationImpactV2(resultado',
        'renderHeroBaseSummaryV2(resultado',
        "supabase.rpc('save_user_build'",
        'p_build_id: buildIdAtual || null',
        'p_tags: payload.tags',
    ):
        if token not in build:
            failures.append(f'criar-build.js perdeu contrato esperado: {token}')

    for legacy_token in (
        'build-analise.js',
        'game-stat-engine.js',
        'equipment-attribute-calculation.js',
        'normalizeEquipmentAttributesForCalculation',
        'prepararAnalisePublicaV4',
        'analisarBuildComAutoridadeV4',
        'equipment_rarity_levels',
        'legacyLevelsResult',
        'calculationSource',
    ):
        if legacy_token in build or legacy_token in entry or legacy_token in html:
            failures.append(f'Mesa de Builds ainda referencia cálculo legado: {legacy_token}')

    if "supabase.from('builds').insert" in build:
        failures.append('Mesa voltou a usar INSERT fragmentado em builds')
    if "payload.visibility === 'unlisted' ? 'private'" in build:
        failures.append('Mesa voltou a converter unlisted em private')

    for token in (
        "TAXONOMY_UI_VERSION = '7'",
        'Cobertura da análise',
        'impact-taxonomy-disclosure',
        '.impact-unknown .impact-taxonomy-label-open{display:none}',
        'impact-taxonomy-item',
        "rows.length === 1 ? 'efeito' : 'efeitos'",
        'impact-taxonomy-label-closed',
        'impact-taxonomy-label-open',
        'Ver detalhes',
        'Ocultar detalhes',
        'flex-wrap:nowrap',
        'overflow-x:auto',
        '@media(max-width:560px)',
    ):
        if token not in taxonomy:
            failures.append(f'Resumo progressivo dos efeitos não calculados perdeu contrato: {token}')

    for forbidden in (
        'O que fazer?',
        'Somente dados confirmados alteram o resultado.',
        "rows.length === 1 ? 'item' : 'itens'",
        'Exibindo todos os efeitos registrados',
    ):
        if forbidden in taxonomy:
            failures.append(f'Resumo público dos efeitos voltou a expor texto redundante: {forbidden}')

if failures:
    print(f'Experiência da Mesa de Builds falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Mesa de Builds validada: entrada limpa, Calculation V2 em tempo real, persistência transacional e pendências explícitas sem cálculo legado.')

