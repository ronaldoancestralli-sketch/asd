#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'profile_html': ROOT / 'meu-perfil.html',
    'profile_css': ROOT / 'css/my-profile-experience-v7.css',
    'profile_js': ROOT / 'js/my-profile-v4.js',
    'helper': ROOT / 'js/my-profile-experience-v7.js',
    'missions_js': ROOT / 'js/my-profile-progress-v5.js',
    'home': ROOT / 'index.html',
    'ledger': ROOT / 'docs/CHANGELOG_INTERNAL.jsonl',
    'doc': ROOT / 'docs/IDENTITY_AND_REPUTATION.md',
    'handoff': ROOT / 'PROJECT_HANDOFF.md',
    'workflow': ROOT / '.github/workflows/quality-gates.yml',
    'test': ROOT / 'tests/my-profile-experience-v7.test.mjs',
}

errors: list[str] = []
for label, path in FILES.items():
    if not path.exists():
        errors.append(f'arquivo V7 ausente ({label}): {path.relative_to(ROOT)}')

if errors:
    print('IDENTITY EXPERIENCE V7: FALHOU')
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
    'data-my-profile-experience="v7"',
    'my-profile-experience-v7.css?v=20260825-identity-experience-v7-1',
    'seu nome agora <em>tem história.</em>',
    'como ganhar pontos',
    'explore',
    'comprove',
    'confirme',
    'evolua',
    'id="identity-v7-launch-corroborated">—</strong>',
    'id="identity-v7-launch-verified">—</strong>',
    'id="identity-v7-launch-first">—</strong>',
    'id="identity-v7-points"',
    '+0 no envio',
    'id="identity-v7-preview"',
    'data-tier="unavailable"',
    'seu nick fica assim',
    'id="preview-tier"',
    'id="preview-institutional-badges"',
    'colecione suas insígnias',
    'prévia da coleção',
    'escolha sua próxima operação',
    'experience=20260825-v7-1',
), 'Meu Perfil V7')

ids = re.findall(r'\bid="([^"]+)"', text['profile_html'], flags=re.IGNORECASE)
duplicates = sorted({value for value in ids if ids.count(value) > 1})
if duplicates:
    errors.append('Meu Perfil V7 possui IDs duplicados: ' + ', '.join(duplicates))

for target in ('identity-v7-builder', 'identity-v7-points', 'my-research-v5'):
    if f'href="#{target}"' not in lower['profile_html'] or f'id="{target}"' not in lower['profile_html']:
        errors.append(f'CTA V7 sem destino real: {target}')

preview_match = re.search(
    r'<div id="preview-institutional-badges"[^>]*>(.*?)</div>',
    text['profile_html'],
    flags=re.IGNORECASE | re.DOTALL,
)
if not preview_match or preview_match.group(1).strip():
    errors.append('Prévia institucional deve nascer vazia e receber somente badges confirmados pelo servidor')

require('profile_js', (
    'pointPreviewValues',
    'communityTierState',
    'tierRequirementParts',
    'setLaunchPointPreview(pointValues,policyVersion)',
    "$('identity-v7-preview').dataset.accent = accent",
    "preview.dataset.tier = knownTier ? tier : 'unavailable'",
    "badges.filter((badge)=>badge.active && BADGE_LABELS[badge.badge_type])",
    "row.replaceChildren()",
    "status.textContent = state === 'current' ? 'ATUAL'",
    'identity-v7-insignia-mark',
    'sem nível confirmado',
), 'Runtime V7')

for forbidden in ('service_role', 'user_metadata', 'app_metadata', 'innerhtml'):
    if forbidden in lower['helper']:
        errors.append(f'Helper visual V7 contém autoridade ou renderização indevida: {forbidden}')

require('helper', (
    'COMMUNITY_TIER_ORDER',
    'COMMUNITY_TIER_GLYPHS',
    'pointPreviewValues',
    'firstTotal: verified + firstBonus',
    'communityTierState',
    'tierRequirementParts',
    'missionProgress',
    "completed === true && current >= target",
), 'Helper visual V7')

require('missions_js', (
    'missionProgress',
    "mission.awards_reputation!==false",
    "card.dataset.state=progressState.state",
    "'0 pontos próprios'",
    "progressState.isComplete",
), 'Missões V7')
if 'innerhtml' in lower['missions_js']:
    errors.append('Missões V7 voltaram a inserir dados do servidor com innerHTML')

require('profile_css', (
    '.identity-v7-launch',
    '.identity-v7-cycle',
    '.identity-v7-proof-path',
    '.identity-v7-zero-rule',
    '.identity-v7-preview',
    '.identity-v7-insignia-mark',
    '.identity-v7-mission-meta',
    '@media (max-width: 680px)',
    '@media (prefers-reduced-motion: reduce)',
    ':focus-visible',
), 'CSS V7')

require('home', (
    'id="auth-modal" role="dialog"',
    'aria-modal="true"',
    'aria-labelledby="auth-title"',
), 'Acessibilidade do modal de conta')

try:
    ledger = [json.loads(line) for line in text['ledger'].splitlines() if line.strip()]
except json.JSONDecodeError as exc:
    errors.append(f'ledger inválido: {exc}')
    ledger = []

entry = next((row for row in ledger if row.get('id') == '2026-08-25-identity-experience-v7'), None)
if not entry:
    errors.append('ledger sem Identity Experience V7')
else:
    expected = {
        'user_visible': True,
        'public': True,
        'public_version': '0.2.1-beta',
        'public_category': 'improvement',
        'version_impact': 'patch',
        'public_sync': 'synced',
        'security_sensitive': False,
        'backend_only': False,
    }
    for key, value in expected.items():
        if entry.get(key) != value:
            errors.append(f'ledger V7 com {key} incorreto: {entry.get(key)!r}')

require('doc', (
    'experiência v7',
    'prévia ao vivo',
    'sete insígnias comunitárias',
    'valores vêm da política versionada do servidor',
), 'Documentação V7')
require('handoff', ('echo identity v7', '0.2.1-beta'), 'Handoff V7')
require('workflow', (
    'python3 scripts/check-community-identity-v7.py',
    'node --test tests/my-profile-experience-v7.test.mjs',
), 'Quality Gates V7')
require('test', (
    'prévia de pontos deriva o total da política do servidor',
    'coleção distingue insígnias conquistadas, atual e bloqueadas',
    'missão informa progresso sem conceder reputação paralela',
), 'Testes V7')

if errors:
    print(f'IDENTITY EXPERIENCE V7: FALHOU com {len(errors)} problema(s)')
    for error in errors:
        print('-', error)
    raise SystemExit(1)

print('IDENTITY EXPERIENCE V7: OK · lançamento destacado, pontuação explicada, card ao vivo e insígnias server-truthful.')
