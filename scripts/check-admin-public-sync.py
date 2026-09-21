#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
failures = []
notes = []

canonical = ROOT / 'js/site-content-schema.js'
premium_wrapper = ROOT / 'admin/js/site-content-premium-schema.js'
premium_core = ROOT / 'admin/js/site-content-premium-schema-core.js'
premium_final = ROOT / 'admin/js/site-content-final-sync.js'
site_admin = ROOT / 'admin/site-content.html'
central = ROOT / 'admin/public-experience.html'
central_audit = ROOT / 'admin/js/public-experience-sync-audit.js'
hero_media = ROOT / 'js/heroes-page-media.js'
statistics_wrapper = ROOT / 'js/statistics-experience.js'
statistics_bridge = ROOT / 'js/statistics-cms-bridge.js'
guides_guard = ROOT / 'js/admin-guides-access.js'

SUSPENDED_CMS_ROUTES = {'news': 'noticias.html'}
CROSS_PAGE_CMS_COMPONENTS = {
    'global_announcement': 'js/public-global-announcement.js',
}

required_paths = (
    canonical, premium_wrapper, premium_core, premium_final, site_admin, central,
    central_audit, hero_media, statistics_wrapper, statistics_bridge,
    guides_guard,
)
for path in required_paths:
    if not path.exists():
        failures.append(f'arquivo ausente: {path.relative_to(ROOT)}')

PAGE_RE = re.compile(
    r"\{\s*key:\s*'([^']+)'\s*,\s*label:\s*'([^']+)'\s*,\s*url:\s*'([^']+)'\s*,.*?fields:\s*\[(.*?)\]\s*\n\s*\}",
    re.S,
)
FIELD_RE = re.compile(r"field\(\s*'([^']+)'")
CMS_ATTR_RE = re.compile(r'data-cms-(?:text|placeholder|link|image|bg|visible|scale|scale-mobile|x|y)=["\']([^"\']+)["\']')
PAGE_ATTR_RE = re.compile(r'data-cms-page=["\']([^"\']+)["\']')


def pages_from(text):
    result = {}
    for key, label, url, fields in PAGE_RE.findall(text):
        result[key] = {'label': label, 'url': url, 'fields': set(FIELD_RE.findall(fields))}
    return result


if not failures:
    canonical_text = canonical.read_text(encoding='utf-8')
    premium_wrapper_text = premium_wrapper.read_text(encoding='utf-8')
    premium_core_text = premium_core.read_text(encoding='utf-8')
    premium_final_text = premium_final.read_text(encoding='utf-8')
    site_admin_text = site_admin.read_text(encoding='utf-8')
    central_text = central.read_text(encoding='utf-8')
    central_audit_text = central_audit.read_text(encoding='utf-8')
    hero_media_text = hero_media.read_text(encoding='utf-8')
    statistics_wrapper_text = statistics_wrapper.read_text(encoding='utf-8')
    statistics_bridge_text = statistics_bridge.read_text(encoding='utf-8')
    guides_guard_text = guides_guard.read_text(encoding='utf-8')

    if "./site-content-premium-schema-core.js?v=" not in premium_wrapper_text:
        failures.append('wrapper do schema premium não delega ao core versionado')
    if "./site-content-final-sync.js?v=" not in premium_wrapper_text:
        failures.append('wrapper do schema premium não carrega a sincronização final versionada')

    schema_pages = pages_from(canonical_text)
    schema_pages.update(pages_from(premium_core_text))

    heroes_extra = re.search(r'addFields\(heroes,\s*\[(.*?)\]\s*\);', premium_core_text, re.S)
    if heroes_extra and 'heroes' in schema_pages:
        schema_pages['heroes']['fields'].update(FIELD_RE.findall(heroes_extra.group(1)))

    if not schema_pages:
        failures.append('não foi possível extrair nenhuma página do schema editorial')

    public_pages = {}
    for html in sorted(ROOT.glob('*.html')):
        text = html.read_text(encoding='utf-8')
        match = PAGE_ATTR_RE.search(text)
        if not match:
            continue
        key = match.group(1)
        public_pages[key] = html.name
        if key not in schema_pages:
            failures.append(f'{html.name}: data-cms-page="{key}" não existe no schema do Admin')
            continue

        if key == 'statistics':
            if './js/statistics-experience.js?v=' not in text:
                failures.append('estatisticas.html não carrega o wrapper versionado de Estatísticas')
            continue

        if key == 'guides':
            if "import('./site-content.js?v=20260822-drawer-unified-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1')" not in guides_guard_text:
                failures.append('guias.html não carrega o CMS somente após autorização administrativa')
        elif './js/site-content.js?v=' not in text:
            failures.append(f'{html.name}: declara CMS mas não carrega js/site-content.js com cache-busting')
        used = set(CMS_ATTR_RE.findall(text))
        declared = schema_pages[key]['fields']
        missing = sorted(used - declared)
        if missing:
            failures.append(f'{html.name}: bindings sem controle no Admin para {key}: {", ".join(missing)}')

    for key, page in schema_pages.items():
        public_name = Path(page['url']).name
        public_file = ROOT / public_name
        if not public_file.exists():
            failures.append(f'schema {key}: página pública ausente: {public_name}')
            continue
        text = public_file.read_text(encoding='utf-8')
        if key in SUSPENDED_CMS_ROUTES:
            if public_name != SUSPENDED_CMS_ROUTES[key]:
                failures.append(f'schema suspenso {key}: rota inesperada {public_name}')
            if 'Módulo em preparação' not in text or 'Echo Pulse' not in text:
                failures.append(f'{public_name}: exceção de CMS só é válida enquanto Echo Pulse estiver explicitamente Em breve')
            notes.append(f'{public_name}: schema {key} preparado, bindings públicos suspensos intencionalmente pelo modo privado do Echo Pulse.')
            continue
        if key in CROSS_PAGE_CMS_COMPONENTS:
            component = ROOT / CROSS_PAGE_CMS_COMPONENTS[key]
            component_text = component.read_text(encoding='utf-8') if component.exists() else ''
            if not component_text:
                failures.append(f'schema transversal {key}: componente público ausente')
            for token in (".from('site_pages')", f"const PAGE_KEY = '{key}'", "content.enabled !== true"):
                if token not in component_text:
                    failures.append(f'schema transversal {key}: componente sem contrato {token}')
            public_reference = f'./{CROSS_PAGE_CMS_COMPONENTS[key]}?v='
            covered = [
                html.name for html in ROOT.glob('*.html')
                if public_reference in html.read_text(encoding='utf-8')
            ]
            if len(covered) < 10:
                failures.append(f'schema transversal {key}: cobertura pública insuficiente ({len(covered)} páginas)')
            else:
                notes.append(f'schema {key}: componente transversal verificado em {len(covered)} páginas públicas.')
            continue
        page_match = PAGE_ATTR_RE.search(text)
        if not page_match or page_match.group(1) != key:
            failures.append(f'schema {key}: {public_name} não declara data-cms-page="{key}"')

    for token in (
        "field('heroes_all_card_image'",
        "field('heroes_all_feature_image'",
        '`heroes_class_${slug}_image`',
        '`heroes_featured_${slug}`',
        '`heroes_roster_${slug}`',
        ".from('v_heroes_complete')",
        ".from('hero_classes')",
    ):
        if token not in premium_core_text:
            failures.append(f'schema premium de Heróis sem contrato de mídia: {token}')

    statistics_schema_text = premium_core_text + '\n' + premium_final_text
    for token in (
        "key: 'statistics'",
        "field('explorer_title'",
        "field('activity_title'",
        "field('reading_title'",
        "field('methodology_title'",
        "field('source_heroes_title'",
        "field('source_failures_title'",
    ):
        if token not in statistics_schema_text:
            failures.append(f'Estatísticas sem schema editorial completo: {token}')

    statistics_html = (ROOT / 'estatisticas.html').read_text(encoding='utf-8')
    if 'data-cms-page="statistics"' not in statistics_html:
        failures.append('Estatísticas não declara data-cms-page="statistics"')
    if "./statistics-cms-bridge.js?v=" not in statistics_wrapper_text:
        failures.append('wrapper de Estatísticas não carrega a ponte CMS versionada')
    for token in (
        ".from('site_pages')",
        ".eq('page_key', 'statistics')",
        "setText('.stats-kicker', content, 'explorer_kicker')",
        "setText('#arena-activity .stats-section-head h2', content, 'activity_title')",
        "setText('#stats-activity-reading', content, 'reading_description')",
        "setText('.stats-methodology > div:first-child > h2', content, 'methodology_title')",
    ):
        if token not in statistics_bridge_text:
            failures.append(f'ponte CMS de Estatísticas sem contrato: {token}')

    hero_html = (ROOT / 'herois.html').read_text(encoding='utf-8')
    if './js/heroes-page-media.js?v=' not in hero_html:
        failures.append('Heróis sem integração versionada de mídia editorial')
    if 'data-cms-page="heroes"' not in hero_html:
        failures.append('Heróis sem data-cms-page="heroes"')
    for token in (
        'heroes_all_feature_image', 'heroes_all_card_image', "heroKey('featured'",
        "heroKey('roster'", 'classKey(slug)', 'echo:content-applied', 'data:image/',
    ):
        if token not in hero_media_text:
            failures.append(f'heroes-page-media.js sem consumo esperado: {token}')

    for token in (
        './js/site-content-premium-schema.js?v=',
        './js/site-content-deeplink.js?v=',
        'Conteúdo público sob controle do Admin',
    ):
        if token not in site_admin_text:
            failures.append(f'Editor do site sem integração/paridade esperada: {token}')

    for token in (
        './js/site-content-premium-schema.js?v=',
        './js/public-experience-sync-audit.js?v=',
    ):
        if token not in central_text:
            failures.append(f'Central de Paridade sem auditoria editorial versionada: {token}')

    for token in (
        "supabase.from('site_pages')", "supabase.from('site_content')", 'LEGACY_CONTENT_KEYS',
        "['compare', new Set(['hero_art'])]", 'Chaves sem controle correspondente no Admin',
        'site_content legado', 'schema.fieldKeys.has(key)', './site-content.html?page=heroes&tab=media',
    ):
        if token not in central_audit_text:
            failures.append(f'Auditoria viva sem contrato esperado: {token}')

    module_contracts = {
        'Heróis': ('admin/heroes.html', 'herois.html'),
        'Equipamentos': ('admin/equipments.html', 'equipamentos.html'),
        'Classes': ('admin/classes.html', 'classes.html'),
        'Builds': ('admin/builds.html', 'builds.html'),
        'Guias': ('admin/content-modules.html', 'guias.html'),
        'Notícias': ('admin/content-modules.html', 'noticias.html'),
        'Tier List': ('admin/content-modules.html', 'tier-list.html'),
        'Composições': ('admin/content-modules.html', 'composicoes.html'),
    }
    for label, (admin_path, public_path) in module_contracts.items():
        if not (ROOT / admin_path).exists(): failures.append(f'{label}: editor Admin ausente: {admin_path}')
        if not (ROOT / public_path).exists(): failures.append(f'{label}: página pública ausente: {public_path}')

    content_modules = (ROOT / 'admin/js/content-modules.js').read_text(encoding='utf-8')
    for token in (
        "return type==='guides'?'guides':'news'", 'supabase.from(table)',
        "supabase.from('tier_lists')", "supabase.from('team_compositions')",
    ):
        if token not in content_modules:
            failures.append(f'Conteúdo modular sem fonte pública editável: {token}')

    deeplink = (ROOT / 'admin/js/site-content-deeplink.js').read_text(encoding='utf-8')
    for token in ("params.get('page')", "params.get('tab')", 'data-editor-tab', 'MutationObserver'):
        if token not in deeplink:
            failures.append(f'deeplink do editor incompleto: {token}')

    legacy_code_refs = []
    for path in (ROOT / 'js').glob('*.js'):
        text = path.read_text(encoding='utf-8', errors='ignore')
        if 'site_content' in text: legacy_code_refs.append(str(path.relative_to(ROOT)))
    active_legacy_imports = []
    for html in list(ROOT.glob('*.html')) + list((ROOT / 'admin').glob('*.html')):
        text = html.read_text(encoding='utf-8', errors='ignore')
        if 'js/admin.js' in text: active_legacy_imports.append(str(html.relative_to(ROOT)))
    if active_legacy_imports:
        failures.append('Controlador legado js/admin.js voltou a ser carregado por HTML atual: ' + ', '.join(active_legacy_imports))
    elif legacy_code_refs:
        notes.append('Código legado com referência a site_content, sem import HTML atual: ' + ', '.join(sorted(legacy_code_refs)))
    else:
        notes.append('Nenhum controlador atual referencia diretamente a tabela site_content legada.')

if notes:
    for note in notes: print(f'INFO: {note}')
if failures:
    print(f'Auditoria Admin↔Público falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures: print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print(f'Admin↔Público sincronizado: schema core/final, ponte CMS de Estatísticas e {len(public_pages)} superfícies públicas verificadas; rotas suspensas documentadas separadamente.')
