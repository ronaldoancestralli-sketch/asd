#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

required_files = [
    ROOT / 'css' / 'public-header-sync.css',
    ROOT / 'js' / 'public-header-sync.js',
    ROOT / 'js' / 'public-header-sync-core.js',
    ROOT / 'js' / 'admin-guides-access.js',
    ROOT / 'guias.html',
    ROOT / 'herois.html',
    ROOT / 'comparar-build.html',
]

failures = []
for path in required_files:
    if not path.exists():
        failures.append(f'arquivo obrigatório ausente: {path.relative_to(ROOT)}')

if not failures:
    heroes = (ROOT / 'herois.html').read_text(encoding='utf-8')
    compare = (ROOT / 'comparar-build.html').read_text(encoding='utf-8')
    home = (ROOT / 'index.html').read_text(encoding='utf-8')
    builder = (ROOT / 'criar-build.html').read_text(encoding='utf-8')
    wrapper = (ROOT / 'js' / 'public-header-sync.js').read_text(encoding='utf-8')
    script = wrapper + '\n' + (ROOT / 'js' / 'public-header-sync-core.js').read_text(encoding='utf-8')
    css = (ROOT / 'css' / 'public-header-sync.css').read_text(encoding='utf-8')

    expectations = {
        'herois.html CSS': './css/public-header-sync.css?v=20260822-drawer-unified-3',
        'herois.html JS': './js/public-header-sync.js?v=20260822-beta-nav-5&amp;active=herois&amp;mode=site-shell',
        'comparar-build.html CSS': './css/public-header-sync.css?v=20260822-drawer-unified-3',
        'comparar-build.html JS': './js/public-header-sync.js?v=20260822-beta-nav-5&amp;active=comparar&amp;mode=compare',
    }
    for label, token in expectations.items():
        source = heroes if label.startswith('herois') else compare
        if token not in source:
            failures.append(f'{label} sem referência versionada esperada: {token}')

    for token in (
        "['inicio', 'Início', './index.html']",
        "['herois', 'Heróis', './herois.html']",
        "['comparar', 'Comparar', './comparar-build.html']",
        "document.querySelector('.side')?.remove();",
        "document.querySelector('.side-rail')?.remove();",
        "oldTopbar.replaceWith(header);",
        "oldTopbar.remove();",
        "compareAuthController(login, account);",
    ):
        if token not in script:
            failures.append(f'public-header-sync wrapper/core sem invariante esperada: {token}')

    if "./public-beta-banner.js?v=20260822-beta-1" not in wrapper:
        failures.append('public-header-sync.js não monta o aviso Beta global')
    if "./public-header-sync-core.js?v=20260822-public-header-core-3" not in wrapper:
        failures.append('public-header-sync.js não delega ao core preservado')
    for token in (
        'const wrapperParams = new URL(import.meta.url).searchParams',
        "coreUrl.searchParams.set('active'",
        "coreUrl.searchParams.set('mode'",
        'await import(coreUrl.href)',
    ):
        if token not in wrapper:
            failures.append(f'public-header-sync.js não repassa o contexto externo ao core: {token}')

    for token in (
        'body.echo-nav-site-shell .side{display:none!important}',
        'body.echo-nav-compare .side-rail{display:none!important}',
        '.echo-public-topbar{height:76px',
        '@media(max-width:1450px){.echo-public-topbar{gap:20px}',
        '.echo-public-mainnav a.on::after',
    ):
        if token not in css:
            failures.append(f'public-header-sync.css sem regra esperada: {token}')

    static_routes = {
        'Home → Composições': (home, 'href="./composicoes.html">Composições</a>'),
        'Home card → Composições': (home, 'href="./composicoes.html" data-cms-link="teams_card_url"'),
        'Home header → Diversão': (home, 'class="top-fun-link" href="./diversao.html"'),
        'Builds → Classes': (builder, 'href="./classes.html"'),
        'Builds → Tier List': (builder, 'href="./tier-list.html"'),
        'Builds → Sobre': (builder, 'href="./sobre.html"'),
        'Builds → Suporte': (builder, 'href="./suporte.html?tipo=contato"'),
        'Builds → Versões': (builder, 'href="./versoes.html" data-cms-link="news_url"'),
    }
    for label, (source, token) in static_routes.items():
        if token not in source:
            failures.append(f'fallback estático ausente: {label}')

    for token in (
        'aria-label="Abrir Diversão — Confronto Selado"',
        'class="top-fun-spark"',
        'class="top-fun-copy"><strong>Diversão</strong><small>Jogar</small>',
        '@keyframes topFunSignal',
        '@media(max-width:560px){.topbar',
        'min-width:86px',
        '.top-fun-copy{position:static;width:auto;height:auto;overflow:visible;clip-path:none;white-space:nowrap}',
        '@media(prefers-reduced-motion:reduce)',
    ):
        if token not in home:
            failures.append(f'destaque de Diversão no cabeçalho sem contrato esperado: {token}')

    if 'class="footer-fun-link"' in home:
        failures.append('Diversão ainda está exposta no rodapé em vez do cabeçalho')

    for label, source in (
        ('Home', home),
        ('Mesa de Builds', builder),
        ('cabeçalho público', script),
    ):
        if './guias.html' in source:
            failures.append(f'{label} ainda expõe a rota privada de Guias')

    if './js/herois.js?v=20260822-drawer-unified-1' not in heroes:
        failures.append('herois.html perdeu o entrypoint de Heróis/proveniência')
    if './js/comparar-build-persistence.js?v=20260821-comparisons-1' not in compare:
        failures.append('comparar-build.html perdeu persistência de comparações')
    if not (ROOT / 'js' / 'game-stat-engine.js').exists():
        failures.append('js/game-stat-engine.js ausente')

if failures:
    print(f'Gate de navegação pública falhou com {len(failures)} problema(s):')
    for failure in failures:
        print(f'- {failure}')
    raise SystemExit(1)

print('Navegação pública unificada: core preservado, wrapper Beta, referências e cache-busting válidos.')
