#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
failures = []

required = (
    'js/public-navigation.js',
    'js/public-header-sync-core.js',
    'js/module-public-shell-core.js',
    'js/site-shell-core.js',
    'js/app.js',
    'js/criar-build.js',
    'js/site-content.js',
    'js/public-modules.js',
    'css/public-header-sync.css',
    'index.html',
    'criar-build.html',
)
for rel in required:
    if not (ROOT / rel).exists():
        failures.append(f'arquivo obrigatório ausente: {rel}')

if not failures:
    canonical = (ROOT / 'js/public-navigation.js').read_text(encoding='utf-8')
    header_core = (ROOT / 'js/public-header-sync-core.js').read_text(encoding='utf-8')
    module_core = (ROOT / 'js/module-public-shell-core.js').read_text(encoding='utf-8')
    site_core = (ROOT / 'js/site-shell-core.js').read_text(encoding='utf-8')
    css = (ROOT / 'css/public-header-sync.css').read_text(encoding='utf-8')
    home = (ROOT / 'index.html').read_text(encoding='utf-8')
    builder = (ROOT / 'criar-build.html').read_text(encoding='utf-8')

    expected_items = (
        "['inicio', '⌂', 'Início', 'Página principal da arena', './index.html']",
        "['herois', '♟', 'Heróis', 'Lista, funções e atributos', './herois.html']",
        "['builds', '◇', 'Builds', 'Monte e analise sua configuração', './criar-build.html']",
        "['comparar', '⇄', 'Comparar', 'Compare sua build com as mais votadas', './comparar-build.html']",
        "['equipamentos', '✣', 'Equipamentos', 'Itens, raridades e status', './equipamentos.html']",
        "['estatisticas', '⌁', 'Estatísticas', 'Dados atuais da comunidade', './estatisticas.html']",
        "['classes', '◆', 'Classes', 'Funções e estilos de combate', './classes.html']",
        "['composicoes', '◉', 'Composições', 'Estratégias para equipes 3×3', './composicoes.html']",
        "['tier-list', '★', 'Tier List', 'Ranking competitivo de heróis', './tier-list.html']",
        "['community', '◉', 'Comunidade', 'Discussões reais entre jogadores', './comunidade.html']",
        "['noticias', '◫', 'Echo Pulse', 'Radar editorial em preparação', './noticias.html', 'Em breve']",
        "['versoes', '↻', 'Versões & evolução', 'Notas públicas de cada atualização', './versoes.html']",
        "['sobre', '◎', 'Sobre o Echo Arena', 'Propósito, Beta e transparência', './sobre.html']",
        "['contato', '✉', 'Contate-nos', 'Dúvidas, sugestões e parcerias', './suporte.html?tipo=contato']",
        "['problema', '!', 'Reportar problema', 'Informe erros encontrados no site', './suporte.html?tipo=problema']",
    )
    for token in expected_items:
        if token not in canonical:
            failures.append(f'fonte canônica sem item da Home: {token}')

    for token in (
        'export const PUBLIC_NAVIGATION_GROUPS',
        'export function publicNavigationItems()',
        'export function echoDrawerMarkup(activeId = \'\')',
        "echoSection('Explorar'",
        "echoSection('Conteúdo e comunidade'",
        "echoSection('Ajuda e suporte'",
        'echo-public-drawer-news-kicker">Versão Beta',
        'A arena está evoluindo',
    ):
        if token not in canonical:
            failures.append(f'fonte canônica sem contrato do drawer: {token}')

    if './guias.html' in canonical:
        failures.append('fonte canônica voltou a expor Guias ao público')

    shared_import = "./public-navigation.js?v=20260822-drawer-unified-1"
    for rel, text in (
        ('js/public-header-sync-core.js', header_core),
        ('js/module-public-shell-core.js', module_core),
    ):
        if shared_import not in text or 'echoDrawerMarkup(activeId)' not in text:
            failures.append(f'{rel} não usa o mesmo drawer da Home')
        for forbidden in ('function drawerMarkup', 'DRAWER_EXTRA', 'const EXTRA ='):
            if forbidden in text:
                failures.append(f'{rel} ainda mantém lista paralela: {forbidden}')

    if shared_import not in site_core or 'const SIDE_NAV = publicNavigationItems();' not in site_core:
        failures.append('site-shell-core.js ainda mantém navegação lateral independente')

    consumer_contracts = {
        'js/app.js': "./public-navigation.js?v=20260822-drawer-unified-1",
        'js/criar-build.js': "./public-navigation.js?v=20260822-drawer-unified-1",
        'js/site-content.js': "./public-navigation.js?v=20260822-drawer-unified-1",
        'js/public-modules.js': "./public-navigation.js?v=20260822-drawer-unified-1",
    }
    for rel, token in consumer_contracts.items():
        if token not in (ROOT / rel).read_text(encoding='utf-8'):
            failures.append(f'{rel} sem versão canônica do menu: {token}')

    for token in (
        '.echo-public-drawer-section+.echo-public-drawer-section',
        '.echo-public-drawer-badge',
        '.echo-public-drawer-news',
        '.echo-public-drawer-news-kicker',
    ):
        if token not in css:
            failures.append(f'CSS compartilhado sem suporte ao drawer completo: {token}')

    fallback_tokens = (
        'href="./comparar-build.html"',
        'href="./estatisticas.html"',
        'href="./comunidade.html"',
        'href="./noticias.html"',
        'href="./versoes.html"',
        'href="./suporte.html?tipo=contato"',
        'href="./suporte.html?tipo=problema"',
    )
    for rel, text in (('index.html', home), ('criar-build.html', builder)):
        for token in fallback_tokens:
            if token not in text:
                failures.append(f'{rel} sem fallback equivalente à Home: {token}')
        if 'href="./guias.html"' in text:
            failures.append(f'{rel} voltou a expor Guias no drawer público')

    shell_consumers = {
        'herois.html': 'public-header-sync.js?v=20260822-beta-nav-5',
        'equipamentos.html': 'public-header-sync.js?v=20260822-beta-nav-5',
        'diversao.html': 'public-header-sync.js?v=20260822-beta-nav-5',
        'comparar-build.html': 'public-header-sync.js?v=20260822-beta-nav-5',
        'classes.html': 'module-public-shell.js?v=20260822-beta-module-4',
        'composicoes.html': 'module-public-shell.js?v=20260822-beta-module-4',
        'builds.html': 'module-public-shell.js?v=20260822-beta-module-4',
        'estatisticas.html': 'module-public-shell.js?v=20260822-beta-module-4',
        'tier-list.html': 'module-public-shell.js?v=20260822-beta-module-4',
        'comunidade.html': 'module-public-shell.js?v=20260822-beta-module-4',
        'noticias.html': 'module-public-shell.js?v=20260822-beta-module-4',
        'versoes.html': 'module-public-shell.js?v=20260822-beta-module-4',
        'sobre.html': 'module-public-shell.js?v=20260822-beta-module-4',
        'suporte.html': 'module-public-shell.js?v=20260822-beta-module-4',
    }
    for rel, token in shell_consumers.items():
        if token not in (ROOT / rel).read_text(encoding='utf-8'):
            failures.append(f'{rel} sem shell unificado e versionado: {token}')

if failures:
    print(f'Paridade do drawer público falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Drawer público unificado: Home, módulos, headers legados e fallback usam a mesma fonte de 15 destinos, sem Guias público.')
