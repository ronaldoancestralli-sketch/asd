#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TARGET = '20260906-home-featured-phase-e-1'
CSS_TARGET = '20260822-admin-nav-1'
AUTH_PAGES = {'login.html', 'mfa.html'}
pattern = re.compile(r"admin-shell\.js\?v=([^'\"&\s)]+)")

refs = []
for path in sorted((ROOT / 'admin').rglob('*')):
    if not path.is_file() or path.suffix.lower() not in {'.html', '.js'}:
        continue
    text = path.read_text(encoding='utf-8')
    for match in pattern.finditer(text): refs.append((path.relative_to(ROOT).as_posix(), match.group(1)))

if not refs: raise SystemExit('[Admin Shell version] nenhuma referência versionada encontrada')
bad = [(path, version) for path, version in refs if version != TARGET]
if bad:
    print(f'[Admin Shell version] {len(bad)} referência(s) fora da versão {TARGET}:')
    for path, version in bad: print(f'- {path}: {version}')
    raise SystemExit(1)

wrapper = (ROOT / 'admin/js/admin-shell.js').read_text(encoding='utf-8')
core_path = ROOT / 'admin/js/admin-shell-core.js'
if not core_path.exists(): raise SystemExit('[Admin Shell version] core preservado ausente')
core = core_path.read_text(encoding='utf-8')
for token in (
    "id:'announcements',label:'Avisos e Manutenção'",
    "href:'./site-content.html?page=global_announcement'",
    "id:'echo-brain',label:'Echo Brain'",
    "id:'echo-pulse',label:'Echo Pulse'",
    "id:'home-featured',label:'Destaque da home'",
    "href:'./home-featured.html'",
    "id:'releases',label:'Versões públicas'",
):
    if token not in core:
        raise SystemExit(f'[Admin Shell version] destino consolidado ausente do core: {token}')
if "./admin-shell-core.js?v=20260906-home-featured-phase-e-1" not in wrapper:
    raise SystemExit('[Admin Shell version] wrapper não delega ao core versionado')
if "./admin-announcement-awareness.js?v=20260822-maintenance-2" not in wrapper:
    raise SystemExit('[Admin Shell version] indicador global de avisos não está versionado no wrapper')
if "./admin-audit-awareness.js?v=20260822-admin-nav-1" not in core:
    raise SystemExit('[Admin Shell version] consciência de auditoria sem cache-busting atual')
if 'injectBrainNavigation' in wrapper or 'injectReleaseNavigation' in wrapper:
    raise SystemExit('[Admin Shell version] wrapper ainda mantém uma segunda fonte de navegação')

css_pattern = re.compile(r"admin-shell\.css\?v=([^'\"&\s)]+)")
css_refs = []
for path in sorted((ROOT / 'admin').glob('*.html')):
    if path.name in AUTH_PAGES:
        continue
    matches = css_pattern.findall(path.read_text(encoding='utf-8'))
    if matches != [CSS_TARGET]:
        raise SystemExit(f'[Admin Shell version] {path.relative_to(ROOT)} precisa referenciar uma vez o CSS {CSS_TARGET}: {matches}')
    css_refs.append(path.relative_to(ROOT).as_posix())

print(f'Admin Shell version: OK · {len(refs)} referência(s) JS em {TARGET} · {len(css_refs)} páginas no CSS {CSS_TARGET} · navegação em fonte única')
