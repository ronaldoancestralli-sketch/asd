#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'profile_html': ROOT / 'meu-perfil.html',
    'profile_css': ROOT / 'css/my-profile-alive-v8.css',
    'profile_js': ROOT / 'js/my-profile-v4.js',
    'alive_js': ROOT / 'js/my-profile-alive-v8.js',
    'workflow': ROOT / '.github/workflows/quality-gates.yml',
    'test': ROOT / 'tests/my-profile-alive-v8.test.mjs',
    'ledger': ROOT / 'docs/CHANGELOG_INTERNAL.jsonl',
    'doc': ROOT / 'docs/IDENTITY_AND_REPUTATION.md',
    'handoff': ROOT / 'PROJECT_HANDOFF.md',
}

errors: list[str] = []
for label, path in FILES.items():
    if not path.exists():
        errors.append(f'arquivo V8 ausente ({label}): {path.relative_to(ROOT)}')

if errors:
    print('IDENTITY ALIVE V8: FALHOU')
    for error in errors:
        print('-', error)
    raise SystemExit(1)

text = {label: path.read_text(encoding='utf-8') for label, path in FILES.items()}
lower = {label: body.lower() for label, body in text.items()}


def require(label: str, tokens: tuple[str, ...], area: str) -> None:
    for token in tokens:
        if token.lower() not in lower[label]:
            errors.append(f'{area} sem contrato: {token}')


require('profile_html', (
    'data-my-profile-alive="v8"',
    'my-profile-alive-v8.css?v=20260825-identity-alive-v8-1',
    'id="identity-v8-gateway-template"',
    'começar minha identidade',
    'teste uma cor',
    '7</strong><span>insígnias para colecionar',
    '2×</strong><span>revisões antes de pontuar',
    'id="identity-v8-simulator"',
    'simulação educativa · não altera sua conta',
    'id="identity-v8-simulator-total">—',
    'id="identity-v8-showroom"',
    'voltar ao meu nível',
    'alive=20260825-v8-1',
), 'Meu Perfil V8')

ids = re.findall(r'\bid="([^"]+)"', text['profile_html'], flags=re.IGNORECASE)
duplicates = sorted({value for value in ids if ids.count(value) > 1})
if duplicates:
    errors.append('Meu Perfil V8 possui IDs duplicados: ' + ', '.join(duplicates))

require('profile_js', (
    'renderIdentityGateway',
    'syncIdentityAlivePolicy(null)',
    'syncIdentityAlivePolicy(meta)',
    'syncIdentityAliveJourney({',
    'celebrateIdentitySave()',
    "document.createElement('button')",
    "step.setAttribute('aria-pressed','false')",
    'activateIdentityAliveV8()',
    'initializeIdentityAliveV8()',
), 'Integração V8')

require('alive_js', (
    'projectedIdentityPoints',
    'pointPreviewValues(policy)',
    'firstPoints = first * values.firstTotal',
    'showroomPreviewState',
    'communityTierState(actual, selected)',
    'renderIdentityGateway',
    'data-simulator-step',
    'política indisponível. nenhum peso foi presumido',
    'simulação visual',
    'prefers-reduced-motion: reduce',
    'IntersectionObserver',
), 'Runtime V8')

for forbidden in ('service_role', 'supabase.from', 'supabase.rpc', 'innerhtml', 'insert(', 'update(', 'delete('):
    if forbidden in lower['alive_js']:
        errors.append(f'Runtime visual V8 contém autoridade ou escrita indevida: {forbidden}')

require('profile_css', (
    '.identity-v8-gateway',
    '.identity-v8-demo-card',
    '.identity-v8-gateway-swatches',
    '.identity-v8-simulator',
    '.identity-v8-showroom',
    'button.my-scout-step[aria-pressed="true"]',
    '[data-identity-v8-reveal]',
    '@media (max-width: 680px)',
    '@media (prefers-reduced-motion: reduce)',
    ':focus-visible',
), 'CSS V8')

require('workflow', (
    'python3 scripts/check-community-identity-v8.py',
    'node --test tests/my-profile-alive-v8.test.mjs',
), 'Quality Gates V8')

require('test', (
    'simulador vivo calcula somente com pesos recebidos do servidor',
    'simulador falha fechado sem política ou com contagens manipuladas',
    'primeira descoberta não soma a verificação duas vezes',
    'showroom diferencia nível real de uma prévia bloqueada',
), 'Testes V8')

try:
    ledger = [json.loads(line) for line in text['ledger'].splitlines() if line.strip()]
except json.JSONDecodeError as exc:
    errors.append(f'ledger inválido: {exc}')
    ledger = []

entry = next((row for row in ledger if row.get('id') == '2026-08-25-identity-alive-v8'), None)
if not entry:
    errors.append('ledger sem Identity Alive V8')
else:
    expected = {
        'user_visible': True,
        'public': True,
        'public_version': '0.2.2-beta',
        'public_category': 'improvement',
        'version_impact': 'patch',
        'public_sync': 'synced',
        'security_sensitive': False,
        'backend_only': False,
    }
    for key, value in expected.items():
        if entry.get(key) != value:
            errors.append(f'ledger V8 com {key} incorreto: {entry.get(key)!r}')

require('doc', (
    'experiência v8',
    'vitrine pública',
    'simulador educativo',
    'showroom de insígnias',
    'não escreve reputação',
), 'Documentação V8')
require('handoff', ('echo identity v8', '0.2.2-beta'), 'Handoff V8')

if errors:
    print(f'IDENTITY ALIVE V8: FALHOU com {len(errors)} problema(s)')
    for error in errors:
        print('-', error)
    raise SystemExit(1)

print('IDENTITY ALIVE V8: OK · entrada viva, simulador server-truthful, showroom explícito e microinterações acessíveis.')
