#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
failures = []

required = [
    'comparar-build.html',
    'css/compare-experience.css',
    'js/compare-experience.js',
    'js/comparar-build.js',
    'js/comparar-build-persistence.js',
    'js/calculation-v2-build-adapter.js',
    'js/calculation-v2-view.js',
]
for rel in required:
    if not (ROOT / rel).exists():
        failures.append(f'arquivo ausente: {rel}')

if not failures:
    html = (ROOT / 'comparar-build.html').read_text(encoding='utf-8')
    css = (ROOT / 'css/compare-experience.css').read_text(encoding='utf-8')
    experience = (ROOT / 'js/compare-experience.js').read_text(encoding='utf-8')
    compare = (ROOT / 'js/comparar-build.js').read_text(encoding='utf-8')
    persistence = (ROOT / 'js/comparar-build-persistence.js').read_text(encoding='utf-8')

    for token in (
        './css/compare-experience.css?v=20260822-tablet-1',
        './js/compare-experience.js?v=20260821-experience-1',
        './js/comparar-build-persistence.js?v=20260821-comparisons-1',
        './js/public-header-sync.js?v=20260822-beta-nav-5&amp;active=comparar&amp;mode=compare',
    ):
        if token not in html:
            failures.append(f'comparar-build.html sem integração esperada: {token}')

    for token in (
        "text('comparison-hero-name')",
        "text('data-source'",
        "text('community-name')",
        "text('mine-wins')",
        "text('ties')",
        "text('community-wins')",
    ):
        if token not in experience:
            failures.append(f'cockpit não espelha valor real existente: {token}')

    forbidden = (
        'mine = 1', 'community = 1', 'top #1 =',
        'vantagens suas =', 'vantagens comunidade =',
        '19 heróis', '76 habilidades'
    )
    lowered = experience.lower()
    for token in forbidden:
        if token.lower() in lowered:
            failures.append(f'compare-experience.js contém valor hardcoded proibido: {token}')

    for token in (
        "from './calculation-v2-build-adapter.js?v=20260915-calculation-v2-1&partial=20260917-partial-effects-1'",
        "from './calculation-v2-view.js?v=20260915-calculation-v2-1&partial=20260917-partial-effects-1'",
        'loadCalculationDataV2(',
        'analyzeBuildV2(',
    ):
        if token not in compare:
            failures.append(f'comparar-build.js sem contrato obrigatório do Calculation V2: {token}')

    for legacy_source in (
        'game-stat-engine.js',
        'build-analise.js',
        'equipment-attribute-calculation.js',
    ):
        if legacy_source in compare:
            failures.append(f'comparar-build.js ainda referencia fonte matemática legada: {legacy_source}')

    if "toggle_saved_build_comparison" not in persistence:
        failures.append('persistência de comparação perdeu a RPC canônica')

    for token in (
        '@media(max-width:1280px)',
        '.comparison-stage{grid-template-columns:minmax(0,1fr)',
        '.versus-column{height:46px',
        '.compare-intelligence{grid-template-columns:repeat(2,minmax(0,1fr))}',
    ):
        if token not in css:
            failures.append(f'compare-experience.css sem correção responsiva de tablet: {token}')

if failures:
    print(f'Experiência Comparar falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Experiência Comparar validada: cockpit visual, Calculation V2 e persistência preservados.')
