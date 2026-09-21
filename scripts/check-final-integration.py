#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
failures = []

def read(rel):
    path = ROOT / rel
    if not path.exists():
        failures.append(f'arquivo final ausente: {rel}')
        return ''
    return path.read_text(encoding='utf-8', errors='ignore')

admin_shell = read('admin/js/admin-shell.js')
admin_core = read('admin/js/admin-shell-core.js')
public_nav = read('js/public-navigation.js')
stats = read('estatisticas.html')
stats_wrapper = read('js/statistics-experience.js')
stats_bridge = read('js/statistics-cms-bridge.js')
stats_schema = read('admin/js/site-content-final-sync.js')
brain = read('admin/echo-brain.html')
brain_final = read('admin/js/echo-brain-final-ui.js')
brain_actions = read('admin/js/echo-brain-actions.js')
heroes = read('herois.html')
equipments = read('equipamentos.html')
compositions = read('composicoes.html')
compositions_v3 = read('js/compositions-experience-v3.js')
diversao = read('diversao.html')
versions = read('versoes.html')
about = read('sobre.html')
support = read('suporte.html')

for rel in (
    'admin/releases.html', 'admin/js/releases.js', 'admin/js/dashboard-brain.js',
    'js/heroes-page-media.js', 'js/composition-adaptive-learning.js',
    'supabase/functions/echo-brain-train/index.ts', 'supabase/functions/echo-brain-evaluate/index.ts',
    'supabase/functions/echo-brain-shadow/index.ts', 'supabase/functions/echo-brain-backtest/index.ts',
    'css/public-beta-banner.css', 'js/public-beta-banner.js',
):
    if not (ROOT / rel).exists(): failures.append(f'componente integrado ausente: {rel}')

for token in (
    "id:'announcements',label:'Avisos e Manutenção'",
    "href:'./site-content.html?page=global_announcement'",
    "id:'echo-brain',label:'Echo Brain'",
    "id:'echo-pulse',label:'Echo Pulse'",
    "id:'releases',label:'Versões públicas'",
):
    if token not in admin_core: failures.append(f'Admin Shell final sem destino consolidado: {token}')
for obsolete in ('injectBrainNavigation', 'injectReleaseNavigation'):
    if obsolete in admin_shell: failures.append(f'Admin Shell manteve injeção dinâmica obsoleta: {obsolete}')
for token in (
    'const shell=await core.initAdminShell(options)',
    'await initAdminAnnouncementAwareness({client:shell.supabase})',
):
    if token not in admin_shell:
        failures.append(f'Admin Shell wrapper final sem contrato integrado: {token}')

for token in (
    "['estatisticas', '⌁', 'Estatísticas', 'Dados atuais da comunidade', './estatisticas.html']",
    "['versoes', '↻', 'Versões & evolução'",
    "['sobre', '◎', 'Sobre o Echo Arena'",
    "'./suporte.html?tipo=problema'",
):
    if token not in public_nav: failures.append(f'navegação pública final sem destino: {token}')

for token in ('data-cms-page="statistics"', './js/statistics-experience.js?v=20260822-statistics-wrapper-2'):
    if token not in stats: failures.append(f'Estatísticas final sem entrypoint CMS atual: {token}')
for token in (
    './statistics-experience-core.js?v=20260822-intelligence-core-1',
    './statistics-cms-bridge.js?v=20260822-admin-public-sync-2',
):
    if token not in stats_wrapper: failures.append(f'Wrapper de Estatísticas incompleto: {token}')
for token in (
    ".from('site_pages')", ".eq('page_key', 'statistics')", "'coverage_title'",
    "'build_feed_title'", "'methodology_title'", "'source_failures_title'",
):
    if token not in stats_bridge: failures.append(f'Bridge CMS de Estatísticas incompleto: {token}')
for token in ("field('coverage_title'", "field('build_feed_title'", "field('methodology_title'"):
    if token not in stats_schema: failures.append(f'Schema final de Estatísticas incompleto: {token}')
for obsolete in ("field('radar_core_label'", "field('radar_heroes_label'"):
    if obsolete in stats_schema: failures.append(f'Schema final de Estatísticas reintroduziu campo obsoleto: {obsolete}')

brain_contract = brain + '\n' + brain_final + '\n' + brain_actions
for token in (
    'MODO DE EMERGÊNCIA', 'PIPELINE', 'SHADOW MODE', 'REPLAY / BACKTEST',
    'runBrainShadow', 'runBrainBacktest', 'setBrainShadowMode',
):
    if token.lower() not in brain_contract.lower(): failures.append(f'Echo Brain sem contrato integrado: {token}')

for token in ('heroes-page-media.js', 'heroes-build-handoff.js'):
    if token.lower() not in heroes.lower(): failures.append(f'Heróis sem contrato integrado: {token}')
for token in ('equipments-experience.js', 'equipamentos-data-limits.js'):
    if token.lower() not in equipments.lower(): failures.append(f'Equipamentos sem contrato integrado: {token}')

if 'compositions-experience-v3.js?v=20260827-brain-runtime-1' not in compositions:
    failures.append('Composições sem entrypoint v3 integrado')
for token in ('composition-adaptive-learning-public-bridge.js?v=20260823-server-authority-2', 'trainAdaptiveCompositionModel', 'evaluateAdaptiveComposition'):
    if token not in compositions_v3: failures.append(f'Composições v3 sem contrato adaptativo: {token}')

for label, text, tokens in (
    ('Diversão', diversao, ('diversao-responsive.css','diversao-responsive.js')),
    ('Versões', versions, ('public-versions.js','release-timeline')),
    ('Sobre', about, ('Sobre o Echo Arena','Beta')),
    ('Suporte', support, ('public-support.js','support-form')),
):
    for token in tokens:
        if token.lower() not in text.lower(): failures.append(f'{label} sem contrato integrado: {token}')

for public_file in list(ROOT.glob('*.html')) + list((ROOT / 'js').glob('*.js')):
    text = public_file.read_text(encoding='utf-8', errors='ignore').lower()
    if 'github.com/bpc-mga/echoarena' in text and public_file.relative_to(ROOT).as_posix() != 'js/admin.js':
        failures.append(f'exposição técnica residual: {public_file.relative_to(ROOT)}')

if not (ROOT / 'js/game-stat-engine.js').exists(): failures.append('js/game-stat-engine.js ausente')

if failures:
    print(f'FINAL INTEGRATION GATE: FALHOU com {len(failures)} problema(s)', file=sys.stderr)
    for failure in failures: print('-', failure, file=sys.stderr)
    raise SystemExit(1)

print('FINAL INTEGRATION GATE: OK · wrappers/cores, Admin, CMS, Brain, Composições adaptativas, Beta e superfícies públicas coexistem na mesma árvore.')
