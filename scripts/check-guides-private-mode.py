#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/migrations/20260822174723_restrict_guides_to_admin_only.sql'

required_files = [
    ROOT / 'guias.html',
    ROOT / 'js/admin-guides-access.js',
    ROOT / 'admin/content-modules.html',
    ROOT / 'admin/public-experience.html',
    MIGRATION,
]

failures = []
for path in required_files:
    if not path.exists():
        failures.append(f'arquivo obrigatório ausente: {path.relative_to(ROOT)}')

if not failures:
    guides = (ROOT / 'guias.html').read_text(encoding='utf-8')
    guard = (ROOT / 'js/admin-guides-access.js').read_text(encoding='utf-8')
    migration = MIGRATION.read_text(encoding='utf-8').lower()
    admin_content = (ROOT / 'admin/content-modules.html').read_text(encoding='utf-8')
    admin_experience = (ROOT / 'admin/public-experience.html').read_text(encoding='utf-8')

    for token in (
        'class="guides-auth-pending"',
        'noindex,nofollow,noarchive',
        'html.guides-auth-pending body{visibility:hidden}',
        './js/admin-guides-access.js?v=20260822-drawer-unified-1',
    ):
        if token not in guides:
            failures.append(f'guias.html sem bloqueio fail-closed: {token}')

    if '<script type="module" src="./js/module-public-shell.js' in guides:
        failures.append('guias.html carrega o shell público antes da autorização')

    for token in (
        'supabase.auth.getUser()',
        'getAdminProfile',
        "getRoleName(profile) !== 'admin'",
        "redirectTo('./admin/login.html')",
        "redirectTo('./index.html')",
        "root.classList.remove('guides-auth-pending')",
        "import('./site-content.js?v=20260822-drawer-unified-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1')",
        "import('./module-public-shell.js?v=20260822-beta-module-4&active=guias&sb=20260823-security-supabase-pin-1&identity=20260825-v6-public-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1')",
    ):
        if token not in guard:
            failures.append(f'guarda administrativa de Guias incompleta: {token}')

    for unsafe in ('user_metadata', 'raw_user_meta_data', 'getSession()'):
        if unsafe in guard:
            failures.append(f'guarda de Guias usa fonte inadequada para autorização: {unsafe}')

    migration_tokens = (
        'drop policy if exists guides_anon_read on public.guides',
        'drop policy if exists guides_authenticated_read on public.guides',
        'create policy guides_admin_select',
        'for select',
        'to authenticated',
        'public.echo_is_admin()',
        'revoke select on table public.guides from anon',
        'grant select on table public.guides to authenticated, service_role',
    )
    for token in migration_tokens:
        if token not in migration:
            failures.append(f'migration de Guias sem contrato de privacidade: {token}')

    if 'published = true' in migration:
        failures.append('migration de Guias voltou a autorizar leitura pública por published')

    public_nav_sources = (
        'index.html',
        'criar-build.html',
        'noticias.html',
        'js/public-navigation.js',
        'js/site-shell-route-sync.js',
        'js/public-header-sync-core.js',
        'js/module-public-shell-core.js',
        'js/site-shell-core.js',
    )
    for rel in public_nav_sources:
        text = (ROOT / rel).read_text(encoding='utf-8')
        if './guias.html' in text:
            failures.append(f'rota privada de Guias ainda aparece na navegação pública: {rel}')

    for rel, text in (
        ('admin/content-modules.html', admin_content),
        ('admin/public-experience.html', admin_experience),
    ):
        if '../guias.html' not in text:
            failures.append(f'acesso administrativo a Guias ausente: {rel}')

if failures:
    print(f'Modo privado de Guias falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Guias privado: rota pública removida, guarda administrativa fail-closed e RLS sem leitura anônima validados.')
