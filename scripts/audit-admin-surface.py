#!/usr/bin/env python3
from __future__ import annotations

from html.parser import HTMLParser
from collections import Counter
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
ADMIN = ROOT / 'admin'
AUTH_PAGES = {'login.html', 'mfa.html'}
# Shadow tools stay outside the global menu until their feature is approved for normal Admin use.
# They are still audited for Shell/auth/local references and must declare their own explicit contract.
SHADOW_PAGE_CONTRACTS = {
    'hero-counter-lab.html': (
        'data-counter-shadow="true"',
        'SHADOW · NÃO PÚBLICO',
        'href="./echo-brain.html"',
        'admin-shell.js?v=',
    ),
    'identity-lab.html': (
        'data-identity-shadow="true"',
        'SHADOW · NÃO PÚBLICO',
        'href="./users.html"',
        'admin-shell.js?v=',
    ),
}
SHADOW_MENU_EXEMPT_PAGES = set(SHADOW_PAGE_CONTRACTS)
errors: list[str] = []
warnings: list[str] = []

class SurfaceParser(HTMLParser):
    def __init__(self, path: Path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.links: list[str] = []
        self.class_tokens: set[str] = set()
        self.buttons = 0
        self.anchors = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a':
            self.anchors += 1
            href = (attrs.get('href') or '').strip()
            self.links.append(href)
        if tag == 'button':
            self.buttons += 1
        classes = (attrs.get('class') or '').split()
        self.class_tokens.update(classes)


def local_target(source: Path, href: str) -> Path | None:
    href = href.split('#', 1)[0].split('?', 1)[0].strip()
    if not href or href.startswith(('http://', 'https://', 'mailto:', 'tel:', 'data:')):
        return None
    if href.startswith('/'):
        return ROOT / href.lstrip('/')
    return (source.parent / href).resolve()

html_files = sorted(ADMIN.glob('*.html'))
legacy_sidebar_pages = []
noop_pages = []
broken_links = []

for page in html_files:
    text = page.read_text(encoding='utf-8')
    parser = SurfaceParser(page)
    try:
        parser.feed(text)
    except Exception as exc:
        errors.append(f'{page.relative_to(ROOT)}: HTML não pôde ser analisado: {exc}')
        continue

    if 'sidebar' in parser.class_tokens:
        legacy_sidebar_pages.append(page.name)
        errors.append(f'{page.relative_to(ROOT)}: usa classe legada "sidebar" fora do Admin Shell')

    for href in parser.links:
        normalized = href.strip().lower()
        if normalized in {'', '#'} or normalized.startswith('javascript:'):
            noop_pages.append((page.name, href or '<vazio>'))
            errors.append(f'{page.relative_to(ROOT)}: link estático sem destino real: {href or "<vazio>"}')
            continue
        target = local_target(page, href)
        if target is None:
            continue
        clean = href.split('#', 1)[0].split('?', 1)[0]
        if clean.endswith(('.html', '.js', '.css')) and not target.exists():
            broken_links.append((page.name, href))
            errors.append(f'{page.relative_to(ROOT)}: destino local inexistente: {href}')

    if page.name not in AUTH_PAGES:
        has_shell_markup = 'data-admin-content' in text
        has_shell_reference = 'admin-shell' in text or 'hero-import.js' in text
        if not has_shell_markup:
            warnings.append(f'{page.name}: sem data-admin-content (revisar se é página operacional)')
        if not has_shell_reference:
            warnings.append(f'{page.name}: sem referência aparente ao Admin Shell')

for shadow_name, required_tokens in SHADOW_PAGE_CONTRACTS.items():
    shadow_path = ADMIN / shadow_name
    if not shadow_path.exists():
        errors.append(f'Admin Shadow: superfície declarada ausente: {shadow_name}')
        continue
    shadow_text = shadow_path.read_text(encoding='utf-8')
    for token in required_tokens:
        if token not in shadow_text:
            errors.append(f'Admin Shadow: {shadow_name} sem contrato explícito: {token}')

for js in sorted((ADMIN / 'js').rglob('*.js')):
    text = js.read_text(encoding='utf-8')
    for spec in re.findall(r"(?:from\s+|import\s*\()\s*['\"]([^'\"]+)['\"]", text):
        if not spec.startswith('.'):
            continue
        clean = spec.split('?', 1)[0].split('#', 1)[0]
        target = (js.parent / clean).resolve()
        if target.suffix == '':
            target = target.with_suffix('.js')
        if not target.exists():
            errors.append(f'{js.relative_to(ROOT)}: import relativo inexistente: {spec}')

hero_import = (ADMIN / 'hero-import.html').read_text(encoding='utf-8')
if 'Gravar no banco' in hero_import:
    errors.append('admin/hero-import.html: promete gravação apesar de o módulo ser somente leitura')
if 'Somente leitura' not in hero_import:
    errors.append('admin/hero-import.html: não deixa explícito o estado somente leitura')
if 'data-step="save"' in hero_import:
    errors.append('admin/hero-import.html: mantém etapa visual de save sem implementação correspondente')

shell_core_path = ADMIN / 'js' / 'admin-shell-core.js'
shell_wrapper_path = ADMIN / 'js' / 'admin-shell.js'
shell_css_path = ADMIN / 'css' / 'admin-shell.css'
audit_awareness_path = ADMIN / 'js' / 'admin-audit-awareness.js'
shell_core = shell_core_path.read_text(encoding='utf-8')
shell_wrapper = shell_wrapper_path.read_text(encoding='utf-8')
shell_css = shell_css_path.read_text(encoding='utf-8')
audit_awareness = audit_awareness_path.read_text(encoding='utf-8')
menu_match = re.search(r"const DEFAULT_MENU=\[(.*?)\n\];", shell_core, re.S)
if not menu_match:
    errors.append('admin/js/admin-shell-core.js: DEFAULT_MENU não pôde ser auditado')
    menu_block = ''
else:
    menu_block = menu_match.group(1)

menu_ids = re.findall(r"\bid:'([^']+)'", menu_block)
for menu_id, count in Counter(menu_ids).items():
    if count != 1:
        errors.append(f'Admin Shell: id de menu duplicado: {menu_id} ({count}x)')

menu_entries = re.findall(r"\{id:'([^']+)'[^{}\n]*?href:'([^']+)'", menu_block)
menu_routes = {menu_id: href for menu_id, href in menu_entries}
required_routes = {
    'dashboard': './index.html',
    'announcements': './site-content.html?page=global_announcement',
    'echo-brain': './echo-brain.html',
    'echo-pulse': './echo-pulse.html',
    'hero-import': './hero-import.html',
    'hero-skill-audit': './hero-skill-audit.html',
    'equipment-ocr-import': './equipment-import.html',
    'equipment-ai-import': './equipment-ai-import.html',
    'releases': './releases.html',
    'public-experience': './public-experience.html',
    'community-hub': './community.html',
}
for menu_id, expected_href in required_routes.items():
    if menu_routes.get(menu_id) != expected_href:
        errors.append(f'Admin Shell: {menu_id} precisa apontar para {expected_href}; atual={menu_routes.get(menu_id)!r}')

menu_files = [href.split('?', 1)[0].split('#', 1)[0].removeprefix('./') for _, href in menu_entries]
route_counts = Counter(menu_files)
operational_pages = {
    path.name for path in html_files
    if path.name not in AUTH_PAGES and path.name not in SHADOW_MENU_EXEMPT_PAGES
}
missing_from_menu = sorted(operational_pages - set(menu_files))
unknown_menu_pages = sorted(set(menu_files) - operational_pages)
for name in missing_from_menu:
    errors.append(f'Admin Shell: página operacional sem acesso no menu: {name}')
for name in unknown_menu_pages:
    errors.append(f'Admin Shell: menu aponta para página fora da superfície auditada: {name}')
for name, count in sorted(route_counts.items()):
    allowed = 2 if name == 'site-content.html' else 1
    if count != allowed:
        errors.append(f'Admin Shell: destino {name} aparece {count}x; esperado {allowed}x')

for obsolete in ('injectBrainNavigation', 'injectReleaseNavigation'):
    if obsolete in shell_wrapper:
        errors.append(f'Admin Shell: wrapper mantém fonte paralela de navegação: {obsolete}')
sidebar_installer_match = re.search(r"function installSidebarLink\(\) \{(.*?)\n\}", audit_awareness, re.S)
sidebar_installer = sidebar_installer_match.group(1) if sidebar_installer_match else ''
if not sidebar_installer_match:
    errors.append('Admin Shell: instalador da consciência de auditoria não pôde ser analisado')
for token in ("document.createElement('a')", 'nav.insertBefore(link', 'nav.appendChild(link)', 'nav.prepend(link)'):
    if token in sidebar_installer:
        errors.append(f'Admin Shell: consciência de auditoria ainda cria navegação paralela: {token}')
for token in ("document.querySelector('[data-menu-id=\"equipment-audit\"]')", "link.classList.add('admin-audit-nav')"):
    if token not in sidebar_installer:
        errors.append(f'Admin Shell: auditoria não enriquece o destino canônico: {token}')
for token in ('admin-shell-search-input', 'bindMenuSearch', "event.key==='/'", 'aria-controls="admin-shell-nav"'):
    if token not in shell_core:
        errors.append(f'Admin Shell: busca de ferramentas incompleta: {token}')
if "if(activeId){" not in shell_core or "if(item.id===activeId)return true;" not in shell_core:
    errors.append('Admin Shell: activeId não tem precedência sobre fallback por arquivo; deep links podem marcar dois itens')
for token in ('.admin-shell-item.is-priority', '@media(pointer:coarse)', 'width:min(340px,92vw)', 'prefers-reduced-motion'):
    if token not in shell_css:
        errors.append(f'Admin Shell CSS: contrato responsivo/acessível ausente: {token}')

dashboard = (ADMIN / 'index.html').read_text(encoding='utf-8')
if dashboard.count('href="./site-content.html?page=global_announcement"') < 2:
    errors.append('admin/index.html: Central de Avisos precisa de destaque operacional e cartão de acesso rápido')
if 'dashboard-announcement-card' not in dashboard:
    errors.append('admin/index.html: destaque da Central de Avisos ausente')

active_contracts = {
    'equipment-import.html': "activeId: 'equipment-ocr-import'",
    'hero-skill-audit.html': "activeId:'hero-skill-audit'",
    'public-experience.html': "activeId:'public-experience'",
    'releases.html': "activeId:'releases'",
    'community.js': "activeId:'community-hub'",
    'hero-import.js': "activeId: 'hero-import'",
}
for name, token in active_contracts.items():
    base = ADMIN / ('js' if name.endswith('.js') else '') / name
    if token not in base.read_text(encoding='utf-8'):
        errors.append(f'{base.relative_to(ROOT)}: estado ativo do menu incorreto; esperado {token}')

site_content = (ADMIN / 'site-content.html').read_text(encoding='utf-8')
for token in ("get('page') === 'global_announcement'", "activeId: announcementMode ? 'announcements' : 'site-content'", "pageTitle: announcementMode ? 'Central de Avisos'"):
    if token not in site_content:
        errors.append(f'admin/site-content.html: deep link de Avisos não assume contexto correto: {token}')

print('ADMIN SURFACE AUDIT')
print(f'- páginas HTML analisadas: {len(html_files)}')
print(f'- sidebars legadas encontradas: {len(legacy_sidebar_pages)}')
print(f'- links estáticos sem destino: {len(noop_pages)}')
print(f'- links locais quebrados: {len(broken_links)}')
print(f'- avisos de cobertura do Shell: {len(warnings)}')
print(f'- destinos únicos no menu: {len(menu_entries)}')
print(f'- páginas operacionais cobertas: {len(operational_pages) - len(missing_from_menu)}/{len(operational_pages)}')
print(f'- superfícies Shadow fora do menu: {len(SHADOW_MENU_EXEMPT_PAGES)}')
for warning in warnings:
    print(f'  AVISO: {warning}')

if errors:
    print('\nADMIN SURFACE AUDIT: FALHOU')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)

print('\nADMIN SURFACE AUDIT: OK')
