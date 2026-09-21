#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []

def read(path):
    target = ROOT / path
    if not target.exists():
        errors.append(f'arquivo obrigatório ausente: {path}')
        return ''
    return target.read_text(encoding='utf-8')

identity = read('js/echo-author-identity.js')
trust = read('css/echo-trust.css')
community = read('js/community.js')
builds = read('js/builds-hub-experience.js')
community_html = read('comunidade.html')
builds_html = read('builds.html')

for token in (
    "const AUTHORITIES=new Set(['founder','admin'])",
    "const TIERS=new Set(Object.keys(TIER_LABELS))",
    'export function authorSurfaceAttributes',
    "supabase.rpc('echo_public_author_cards_v2'",
    'data-echo-authority=',
    'data-echo-tier=',
):
    if token not in identity:
        errors.append(f'identidade pública sem contrato: {token}')

for token in (
    "authorSurface(post.author_id,'community-post')",
    "authorSurface(post.author_id,'community-thread')",
    "'community-reply':'community-comment'",
):
    if token not in community:
        errors.append(f'comunidade sem propagação visual: {token}')

for token in (
    "authorSurface(build,'build-preview')",
    "authorSurface(build,'build-card')",
):
    if token not in builds:
        errors.append(f'builds sem propagação visual: {token}')

for role in ('founder', 'admin'):
    if f'data-echo-authority="{role}"' not in trust:
        errors.append(f'CSS sem autoridade institucional: {role}')
for tier in ('member','echo_scout','tracker','cartographer','analyst','vanguard','arena_legend'):
    if f'data-echo-tier="{tier}"' not in trust:
        errors.append(f'CSS sem progressão comunitária: {tier}')

cache = '20260905-institutional-scout-exclusion-v2-1'
for label, text in (('comunidade.html', community_html), ('builds.html', builds_html), ('js/community.js', community), ('js/builds-hub-experience.js', builds), ('js/echo-author-identity.js', identity)):
    if cache not in text:
        errors.append(f'{label} sem cache-busting da propagação de autoria')

for label, text in (('js/community.js', community), ('js/builds-hub-experience.js', builds)):
    for unsafe in ("institutional_role='founder'", 'institutional_role="founder"', "community_tier='arena_legend'", 'community_tier="arena_legend"'):
        if unsafe in text:
            errors.append(f'{label} tenta conceder identidade no navegador: {unsafe}')

if "if(authorityOf(card))return'none'" not in identity:
    errors.append('Founder/Admin ainda recebem tier comunitário no conteúdo público')

if errors:
    print(f'AUTHOR SURFACES: FALHOU com {len(errors)} problema(s)', file=sys.stderr)
    for error in errors:
        print('-', error, file=sys.stderr)
    raise SystemExit(1)

print('AUTHOR SURFACES: OK · Founder/Admin ficam fora da trilha e os sete níveis Scout continuam exclusivos dos membros.')
