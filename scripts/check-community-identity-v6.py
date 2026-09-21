#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'helper': ROOT / 'js/identity-public-launch-v6.js',
    'home': ROOT / 'index.html',
    'home_auth': ROOT / 'js/app.js',
    'module_auth': ROOT / 'js/module-public-shell-core.js',
    'site_auth': ROOT / 'js/site-shell-core.js',
    'compare_auth': ROOT / 'js/public-header-sync-core.js',
    'module_wrapper': ROOT / 'js/module-public-shell.js',
    'site_wrapper': ROOT / 'js/site-shell.js',
    'header_wrapper': ROOT / 'js/public-header-sync.js',
    'profile_html': ROOT / 'meu-perfil.html',
    'profile_js': ROOT / 'js/my-profile-v4.js',
    'public_nav': ROOT / 'js/public-navigation.js',
    'doc': ROOT / 'docs/IDENTITY_AND_REPUTATION.md',
    'ledger': ROOT / 'docs/CHANGELOG_INTERNAL.jsonl',
    'workflow': ROOT / '.github/workflows/quality-gates.yml',
    'test': ROOT / 'tests/identity-public-launch-v6.test.mjs',
}

errors: list[str] = []
for label, path in FILES.items():
    if not path.exists():
        errors.append(f'arquivo V6 ausente ({label}): {path.relative_to(ROOT)}')

if errors:
    print('IDENTITY V6 PUBLIC LAUNCH: FALHOU')
    for error in errors:
        print('-', error)
    raise SystemExit(1)

text = {label: path.read_text(encoding='utf-8') for label, path in FILES.items()}
lower = {label: body.lower() for label, body in text.items()}


def require(label: str, tokens: tuple[str, ...], area: str) -> None:
    for token in tokens:
        if token.lower() not in lower[label]:
            errors.append(f'{area} sem contrato: {token}')


require('helper', (
    'normalizePublicHandle',
    'isValidPublicHandle',
    'identityProfileUrl',
    'identitySignupMetadata',
    'signupHandleFromUser',
    'identitySignupGateEnabled',
    "rpc('echo_identity_rollout_status_v1')",
    'public_identity_enabled && rollout?.signup_handle_enabled',
), 'Helper de lançamento V6')
for forbidden in ('service_role', 'app_metadata', 'is_admin(', ".from('"):
    if forbidden in lower['helper']:
        errors.append(f'Helper V6 contém autoridade indevida: {forbidden}')

require('home', (
    'id="handle-field" hidden',
    'id="auth-handle"',
    'identity=20260825-v6-public-1',
), 'Cadastro da Home')

auth_contracts = {
    'home_auth': 'auth-handle',
    'module_auth': 'echo-module-handle',
    'site_auth': 'auth-handle',
    'compare_auth': 'echo-auth-handle',
}
for label, handle_id in auth_contracts.items():
    require(label, (
        'identity-public-launch-v6.js?v=20260825-identity-public-v6-1',
        'identitySignupGateEnabled',
        'identitySignupMetadata',
        'identityProfileUrl',
        handle_id,
        'Meu Perfil',
        'data: metadata',
    ), f'Cadastro autenticado ({label})')
    if 'user.email' in lower[label] and 'textcontent' in lower[label]:
        errors.append(f'{label} ainda pode usar e-mail como rótulo visível da conta')

require('profile_html', (
    'data-my-profile-launch="v6-public"',
    'echo identity',
    'echo field ops',
    'seu e-mail não faz parte da identidade pública',
    'identity=20260825-v6-public-1',
), 'Meu Perfil público V6')
for visible_shadow in ('echo identity · shadow', 'echo field ops · v5 shadow'):
    if visible_shadow in lower['profile_html']:
        errors.append(f'Meu Perfil ainda exibe rótulo de pré-lançamento: {visible_shadow}')

require('profile_js', (
    'signupHandleFromUser',
    'currentAuthUser',
    "action === 'login'",
    'Entrar ou criar conta',
    'fillForm(identity,userData.user)',
    "p_visibility:visibility",
), 'Runtime de Meu Perfil V6')

if 'meu-perfil.html' in lower['public_nav']:
    errors.append('Meu Perfil foi incluído na navegação estática, sem condicionar a existência de sessão')

for label in ('module_wrapper', 'site_wrapper', 'header_wrapper'):
    if 'identity=20260825-v6-public-1' not in lower[label]:
        errors.append(f'{label} não invalida o cache do core V6')

entrypoints = ('module-public-shell.js', 'site-shell.js', 'public-header-sync.js', 'app.js')
for path in ROOT.rglob('*'):
    if not path.is_file() or path.suffix.lower() not in {'.html', '.js', '.mjs'}:
        continue
    rel = path.relative_to(ROOT).as_posix()
    if rel.startswith(('.git/', 'scripts/', 'tests/', 'echo-arena-restaurado/')):
        continue
    body = path.read_text(encoding='utf-8', errors='ignore')
    for entrypoint in entrypoints:
        for match in re.finditer(rf'{re.escape(entrypoint)}\?[^\'"\s)<>]+', body):
            if 'identity=20260825-v6-public-1' not in match.group(0):
                errors.append(f'{rel} não invalida cache V6 ao carregar {entrypoint}')

require('doc', (
    'lançamento público v6',
    'metadado de cadastro não concede autoridade',
    'privado por padrão',
), 'Documentação de identidade')

try:
    ledger = [json.loads(line) for line in text['ledger'].splitlines() if line.strip()]
except json.JSONDecodeError as exc:
    errors.append(f'ledger inválido: {exc}')
    ledger = []

entry = next((row for row in ledger if row.get('id') == '2026-08-25-identity-v6-public-launch'), None)
if not entry:
    errors.append('ledger sem lançamento público V6')
else:
    expected = {
        'user_visible': True,
        'public': True,
        'public_version': '0.2.0-beta',
        'public_category': 'feature',
        'version_impact': 'minor',
        'public_sync': 'synced',
        'security_sensitive': False,
        'backend_only': False,
    }
    for key, value in expected.items():
        if entry.get(key) != value:
            errors.append(f'ledger V6 com {key} incorreto: {entry.get(key)!r}')

require('workflow', (
    'python3 scripts/check-community-identity-v6.py',
    'node --test tests/identity-public-launch-v6.test.mjs',
), 'Quality Gates V6')
require('test', (
    'metadado de cadastro serve apenas como sugestão validada',
    'gate de cadastro exige identidade principal e handle habilitados',
), 'Testes V6')

if errors:
    print(f'IDENTITY V6 PUBLIC LAUNCH: FALHOU com {len(errors)} problema(s)')
    for error in errors:
        print('-', error)
    raise SystemExit(1)

print('IDENTITY V6 PUBLIC LAUNCH: OK · cadastro com handle gated, Meu Perfil autenticado e autoridade preservada no servidor.')
