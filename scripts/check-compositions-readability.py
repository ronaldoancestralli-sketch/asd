#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
files = {
    'html': ROOT / 'composicoes.html',
    'ui': ROOT / 'js' / 'compositions-experience-v2.js',
    'engine': ROOT / 'js' / 'composition-synergy-engine-v2.js',
    'css': ROOT / 'css' / 'compositions-readability.css',
}
failures = []
for name, path in files.items():
    if not path.exists(): failures.append(f'arquivo ausente: {path.relative_to(ROOT)}')

if not failures:
    html = files['html'].read_text(encoding='utf-8')
    ui = files['ui'].read_text(encoding='utf-8')
    engine = files['engine'].read_text(encoding='utf-8')
    css = files['css'].read_text(encoding='utf-8')

    for token in (
        './css/compositions-readability.css?v=20260821-synergy-2',
        './js/compositions-experience-v2.js?v=20260821-synergy-2',
        'Escolha. Teste. Ajuste.', 'Experimente outros trios'
    ):
        if token not in html: failures.append(f'HTML sem camada v2: {token}')

    for token in (
        "from './composition-synergy-engine-v2.js?v=20260821-synergy-2'",
        'PONTO FORTE', 'PONTO FRACO', 'analysis-insights',
        'Ver como o motor chegou nisso', 'Testar este trio',
        "supabase.from('hero_skills')", "supabase.from('team_synergies')",
        'state.selectedIds', 'new Set(clean).size!==3'
    ):
        if token not in ui: failures.append(f'UI v2 sem contrato: {token}')

    for token in (
        'function buildWeaknesses', 'const strengths = factors.slice(0,3)',
        "model:'skill-compatibility-v2'", 'Nenhuma regra é específica',
        "ids:['control','burst']", "ids:['armor_pressure','burst']",
        "ids:['team_sustain','engage']", "ids:['recon','ranged_pressure']"
    ):
        if token not in engine: failures.append(f'Motor v2 sem contrato: {token}')

    for token in ('Math.random', "from './game-stat-engine.js'", "supabase.from('team_synergies')", 'win_rate', 'synergy_score'):
        if token in engine: failures.append(f'Motor v2 contém fonte proibida: {token}')

    for token in (
        '.analysis-insights{', '.insight-card.strength{', '.insight-card.weakness{',
        '.analysis-details{', '.hero-option-copy>b{font-size:20px',
        '@media(max-width:900px)', '@media(max-width:700px)', '@media(pointer:coarse)'
    ):
        if token not in css: failures.append(f'CSS v2 sem legibilidade/responsividade: {token}')

if failures:
    print(f'Gate de legibilidade de Composições falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures: print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Composições v2: leitura rápida, pontos fortes/fracos, detalhe progressivo e responsividade validados.')
