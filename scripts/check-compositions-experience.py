#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
html_path = ROOT / 'composicoes.html'
ui_path = ROOT / 'js' / 'compositions-experience.js'
engine_path = ROOT / 'js' / 'composition-synergy-engine.js'
css_path = ROOT / 'css' / 'compositions-experience.css'
save_path = ROOT / 'js' / 'composition-transactional-save.js'

failures = []
for path in (html_path, ui_path, engine_path, css_path, save_path):
    if not path.exists():
        failures.append(f'arquivo obrigatório ausente: {path.relative_to(ROOT)}')

if not failures:
    html = html_path.read_text(encoding='utf-8')
    ui = ui_path.read_text(encoding='utf-8')
    engine = engine_path.read_text(encoding='utf-8')
    css = css_path.read_text(encoding='utf-8')
    save = save_path.read_text(encoding='utf-8')

    required_html = (
        'id="composition-lab"',
        'id="composition-hero-picker"',
        'id="composition-analysis"',
        'id="composition-recommendation-grid"',
        'id="strategy-slot-1"',
        'id="strategy-slot-2"',
        'id="strategy-slot-3"',
        'class="composition-hero-select"',
        'Sinergias medidas',
        'Não é win rate nem sinergia medida',
        './js/composition-transactional-save.js?v=1',
        './css/compositions-experience.css?v=20260821-synergy-1',
        './js/compositions-experience.js?v=20260821-synergy-1',
    )
    for token in required_html:
        if token not in html:
            failures.append(f'composicoes.html sem contrato esperado: {token}')

    required_ui = (
        "from './composition-synergy-engine.js'",
        "supabase.from('heroes')",
        "supabase.from('hero_classes')",
        "supabase.from('hero_skills')",
        "supabase.from('team_compositions')",
        "supabase.from('team_synergies')",
        'evaluateComposition(heroes)',
        'recommendCompositions(state.heroes',
        "document.querySelectorAll('.composition-hero-select')",
        'state.selectedIds',
        'new Set(clean).size !== 3',
        'Habilidades indisponíveis nesta leitura',
        'não representa desempenho real em partidas',
    )
    for token in required_ui:
        if token not in ui:
            failures.append(f'compositions-experience.js sem integração esperada: {token}')

    required_capabilities = (
        "id: 'team_sustain'",
        "id: 'protection'",
        "id: 'damage_amp'",
        "id: 'tempo_buff'",
        "id: 'mobility_team'",
        "id: 'control'",
        "id: 'armor_pressure'",
        "id: 'recon'",
        "id: 'burst'",
        "id: 'engage'",
        'export function buildHeroProfile',
        'export function evaluateComposition',
        'export function recommendCompositions',
        "model: 'skill-compatibility-v1'",
        'Nenhuma regra é específica',
    )
    for token in required_capabilities:
        if token not in engine:
            failures.append(f'composition-synergy-engine.js sem capacidade/contrato esperado: {token}')

    for token in ("ids: ['control', 'burst']", "ids: ['armor_pressure', 'burst']", "ids: ['team_sustain', 'engage']", "ids: ['recon', 'ranged_pressure']"):
        if token not in engine:
            failures.append(f'motor sem interação funcional esperada: {token}')

    forbidden_engine = (
        'Math.random',
        "from './game-stat-engine.js'",
        "supabase.from('team_synergies')",
        'win_rate',
        'synergy_score',
    )
    for token in forbidden_engine:
        if token in engine:
            failures.append(f'motor misturou dado medido/aleatório ou engine proibida: {token}')

    if 'score = Math.max(0, Math.min(100' not in engine:
        failures.append('motor não limita explicitamente o score calculado ao intervalo 0–100')

    required_css = (
        '.composition-lab{',
        '.composition-lab-grid{',
        '.composition-hero-picker{',
        '.composition-analysis{',
        '.composition-recommendation-grid{',
        '@media(max-width:1180px)',
        '@media(max-width:900px)',
        '@media(pointer:coarse)',
        '@media(prefers-reduced-motion:reduce)',
    )
    for token in required_css:
        if token not in css:
            failures.append(f'compositions-experience.css sem tratamento visual/responsivo: {token}')

    required_save = (
        "supabase.rpc('save_team_composition'",
        'new Set(heroIds).size !== 3',
        "form.addEventListener('submit', handleSubmit, { capture: true })",
    )
    for token in required_save:
        if token not in save:
            failures.append(f'salvamento transacional perdeu contrato: {token}')

    for rel, text in (('composicoes.html', html), ('js/compositions-experience.js', ui), ('js/composition-synergy-engine.js', engine)):
        for token in ('vitória garantida', 'meta comprovada', 'sinergia oficial calculada'):
            if token.lower() in text.lower():
                failures.append(f'{rel} contém alegação não suportada: {token}')

if failures:
    print(f'Gate de Composições falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Composições: laboratório, motor por habilidades, separação de sinergia medida, persistência transacional e responsividade validados estruturalmente.')
