#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / 'admin/mfa.html'
JS = ROOT / 'admin/js/admin-mfa.js'
CSS = ROOT / 'admin/css/admin-mfa.css'

errors = []
for path in (HTML, JS, CSS):
    if not path.exists():
        errors.append(f'arquivo obrigatório ausente: {path.relative_to(ROOT)}')

if not errors:
    html = HTML.read_text(encoding='utf-8')
    js = JS.read_text(encoding='utf-8')
    css = CSS.read_text(encoding='utf-8')

    for token in (
        'id="mfa-factor-select"',
        'href="./mfa.html?manage=1"',
        'id="mfa-add-backup"',
        'id="mfa-factor-list"',
        'id="mfa-open-panel"',
        'id="mfa-cancel-enroll"',
        'recovery=20260823-mfa-backup-1',
        'sb=20260823-security-supabase-pin-1',
    ):
        if token not in html:
            errors.append(f'admin/mfa.html sem contrato de recuperação: {token}')

    for token in (
        'const MAX_TOTP_FACTORS = 10;',
        "new URLSearchParams(location.search).get('manage') === '1'",
        "factor?.status === 'verified'",
        'function renderFactorChoice()',
        'activeFactorId = event.currentTarget.value || null;',
        "await startEnrollment('recovery')",
        "factorType: 'totp'",
        'EchoArena Recuperação',
        'supabase.auth.mfa.unenroll',
        'verifiedFactors.length <= 1',
        'O último fator verificado não pode ser removido pela interface do EchoArena.',
        'verifiedFactors.length < 2',
        "location.replace('./index.html')",
    ):
        if token not in js:
            errors.append(f'admin-mfa.js sem contrato de recuperação: {token}')

    for forbidden in (
        "factorType: 'phone'",
        "channel: 'whatsapp'",
        'channel: "whatsapp"',
    ):
        if forbidden in js:
            errors.append(f'admin-mfa.js introduziu fator pago/telefônico proibido nesta tranche: {forbidden}')

    for token in (
        '.mfa-factor-choice',
        '.mfa-factor-list',
        '.mfa-factor-remove',
        '.mfa-manage-actions',
        '@media(max-width:520px)',
    ):
        if token not in css:
            errors.append(f'admin-mfa.css sem suporte ao gerenciamento responsivo: {token}')

if errors:
    print(f'MFA RECOVERY GATE: FALHOU com {len(errors)} problema(s):', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('MFA RECOVERY GATE: OK · múltiplos TOTP · escolha de fator · recuperação gratuita · último fator protegido na interface · sem SMS/WhatsApp')
