#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
js_path = ROOT / 'admin' / 'js' / 'builds.js'
html_path = ROOT / 'admin' / 'builds.html'
failures = []

for path in (js_path, html_path):
    if not path.exists():
        failures.append(f'arquivo obrigatório ausente: {path.relative_to(ROOT)}')

if not failures:
    js = js_path.read_text(encoding='utf-8')
    html = html_path.read_text(encoding='utf-8')

    required_js = (
        "build.is_public === true",
        "build.visibility === 'public'",
        "build.status === 'published'",
        ".eq('is_public', true)",
        ".eq('visibility', 'public')",
        ".eq('status', 'published')",
        ".is('deleted_at', null)",
        'visibility, status',
        'publicationBadge(build, publicBuild, deleted)',
        "supabase.rpc('admin_set_build_flag'",
        'await Promise.all([',
        'refresh(false)',
        'Estado confirmado no Supabase.',
    )
    for token in required_js:
        if token not in js:
            failures.append(f'admin/js/builds.js sem paridade real esperada: {token}')

    for forbidden in ('build[flag] = value', 'build.deleted_at = value ?'):
        if forbidden in js:
            failures.append(f'admin/js/builds.js voltou a simular estado pós-RPC: {forbidden}')

    if './js/builds.js?v=20260821-admin-experience-2' not in html:
        failures.append('admin/builds.html sem cache-busting da paridade real de Builds')

    for token in ('summary-public', 'status-filter', 'builds-list', '../builds.html'):
        if token not in html:
            failures.append(f'admin/builds.html perdeu estrutura funcional: {token}')

if failures:
    print(f'Paridade Admin de Builds falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Admin de Builds: predicado público do Hub, releitura pós-RPC e cache-busting validados.')
