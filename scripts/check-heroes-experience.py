#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
html_path = ROOT / 'herois.html'
js_path = ROOT / 'js' / 'herois-experience.js'
css_path = ROOT / 'css' / 'herois-experience.css'
detail_css_path = ROOT / 'css' / 'herois-detail.css'
legacy_js_path = ROOT / 'js' / 'herois.js'
media_storage_path = ROOT / 'js' / 'media-storage.js'
media_compat_path = ROOT / 'js' / 'heroes-media-compat.js'
media_fix_css_path = ROOT / 'css' / 'heroes-card-media-fix.css'
build_handoff_path = ROOT / 'js' / 'heroes-build-handoff.js'

failures = []

for path in (
    html_path,
    js_path,
    css_path,
    detail_css_path,
    legacy_js_path,
    media_storage_path,
    media_compat_path,
    media_fix_css_path,
    build_handoff_path,
):
    if not path.exists():
        failures.append(f'arquivo obrigatório ausente: {path.relative_to(ROOT)}')

if not failures:
    html = html_path.read_text(encoding='utf-8')
    experience = js_path.read_text(encoding='utf-8')
    css = css_path.read_text(encoding='utf-8')
    legacy = legacy_js_path.read_text(encoding='utf-8')
    media_storage = media_storage_path.read_text(encoding='utf-8')
    media_compat = media_compat_path.read_text(encoding='utf-8')
    media_fix_css = media_fix_css_path.read_text(encoding='utf-8')
    build_handoff = build_handoff_path.read_text(encoding='utf-8')

    required_html = [
        'id="hero-explorer"',
        'id="featured-media"',
        'id="featured-trust"',
        'id="class-showcase"',
        'id="grid"',
        'id="hero-detail"',
        'id="featured-build"',
        'id="class-cycle-control"',
        'id="class-cycle-name"',
        'id="class-cycle-index"',
        './css/herois-detail.css?v=20260821-experience-1',
        './css/herois-experience.css?v=20260821-experience-1',
        './css/heroes-card-media-fix.css?v=20260821-media-3',
        './js/herois.js?v=20260822-drawer-unified-1',
        './js/herois-experience.js?v=20260822-drawer-unified-1',
        'build=20260830-class-cycle-1',
        './js/heroes-build-handoff.js?v=20260821-build-handoff-2',
        './js/heroes-media-compat.js?v=20260821-media-4',
        './js/public-header-sync.js?v=20260822-beta-nav-5&amp;active=herois&amp;mode=site-shell',
    ]
    for token in required_html:
        if token not in html:
            failures.append(f'herois.html sem estrutura/versionamento esperado: {token}')

    if '<style>' in html:
        failures.append('herois.html voltou a concentrar CSS inline; experiência deve permanecer modular')

    required_js = [
        "supabase.from('v_heroes_complete')",
        "supabase.from('hero_classes')",
        "supabase.from('hero_skills')",
        "supabase.from('hero_base_stats')",
        "supabase.from('stat_definitions')",
        'verificationState(hero.id)',
        'compactNumber(hero.total_builds || 0)',
        'classShowcase.addEventListener',
        "grid.addEventListener('mouseover'",
        'skillsAvailable: true',
        'statsAvailable: true',
        "state.skillsAvailable = !skillsResult.error",
        "state.statsAvailable = !statsResult.error && !definitionsResult.error",
        "'—'",
        'Habilidades indisponíveis nesta leitura',
        'function renderRosterOverview()',
        'function cycleClass()',
        "page.classList.add('is-roster-overview')",
        "if (isRosterOverview()) return;",
    ]
    for token in required_js:
        if token not in experience:
            failures.append(f'herois-experience.js sem integração real esperada: {token}')

    for token in (
        ".hc.is-featured[data-slug]",
        "params.set('nova', '1')",
        "params.set('heroi', slug)",
        'return `./criar-build.html?${params.toString()}`',
        'MutationObserver(syncFeaturedBuildLink)',
        '.hd-cta[href*="criar-build.html"]',
        'MutationObserver(syncDetailBuildLink)',
        "document.addEventListener('click', event => {",
        'routeHeroSlug() || selectedHeroSlug()',
    ):
        if token not in build_handoff:
            failures.append(f'Fluxo Heróis→Criar build incompleto: {token}')

    for forbidden in ('SLAYER', 'MIRAGE', '19 heróis', '76 habilidades'):
        if forbidden in experience:
            failures.append(f'herois-experience.js contém dado de roster hardcoded: {forbidden}')

    if "supabase.from('hero_skill_levels')" in experience:
        failures.append('herois-experience.js não deve fabricar/depender de progressão detalhada para o spotlight')

    required_css = [
        '.hero-explorer{',
        '.hero-featured-intel{',
        '.class-showcase{',
        'body[data-cms-page="heroes"] .grid{',
        '.hc-intel{',
        '.class-cycle-control{',
        '.heroes-page.is-roster-overview .hero-featured-intel{',
        '@media(max-width:760px)',
    ]
    for token in required_css:
        if token not in css:
            failures.append(f'herois-experience.css sem camada visual esperada: {token}')

    for token in ('renderSkillSources(skill)', 'renderSkillHistory(skill.id)', 'renderBaseStats(hero.id)'):
        if token not in legacy:
            failures.append(f'herois.js perdeu profundidade da ficha detalhada: {token}')

    # Contrato de mídia: URLs públicas absolutas vindas das views são finais.
    external_guard = "if (isExternalMedia(source) || source.startsWith('/')"
    worker_guard = "if (LEGACY_MEDIA_API_URL && !LEGACY_MEDIA_API_URL.includes('SEU_SUBDOMINIO'))"
    if external_guard not in media_storage:
        failures.append('media-storage.js não preserva explicitamente URLs públicas/externas antes do Worker')
    elif worker_guard not in media_storage:
        failures.append('media-storage.js perdeu o fallback do Worker para caminhos legados')
    elif media_storage.index(external_guard) > media_storage.index(worker_guard):
        failures.append('media-storage.js voltou a encaminhar URLs públicas ao Worker antes de preservá-las')

    if 'legacySupabasePath(source)' in media_storage:
        failures.append('media-storage.js voltou a reescrever URL pública absoluta do Supabase para /legacy')

    required_media_compat = [
        "from './media-storage.js?v=20260821-media-4&sb=20260823-security-supabase-pin-1'",
        "resolveMediaUrl(String(hero[`${slot}_source`] || '').trim())",
        ".from('v_heroes_complete')",
        "host.dataset.mediaCompat = 'direct-source'",
    ]
    for token in required_media_compat:
        if token not in media_compat:
            failures.append(f'heroes-media-compat.js sem contrato de mídia esperado: {token}')

    required_media_css = [
        'body[data-cms-page="heroes"] .hc .thumb{position:relative;overflow:hidden}',
        'position:absolute;',
        'inset:0;',
        'min-height:100%;',
    ]
    for token in required_media_css:
        if token not in media_fix_css:
            failures.append(f'heroes-card-media-fix.css perdeu correção estrutural do card: {token}')

if failures:
    print(f'Gate de Heróis falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Repaginação de Heróis: estrutura, dados reais, proveniência, mídia pública, fluxo de nova build (spotlight + ficha lateral) e cache-busting validados.')

