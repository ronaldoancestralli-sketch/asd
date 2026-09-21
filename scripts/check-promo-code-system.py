#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

FILES = {
    'home': ROOT / 'index.html',
    'hub': ROOT / 'admin/content-modules.html',
    'admin_html': ROOT / 'admin/promo-codes.html',
    'admin_js': ROOT / 'admin/js/promo-codes.js',
    'admin_shell_core': ROOT / 'admin/js/admin-shell-core.js',
    'public_js': ROOT / 'js/public-promo-code.js',
    'controller': ROOT / 'js/promo-gift-controller.mjs',
    'view': ROOT / 'js/promo-gift-view.mjs',
    'public_css': ROOT / 'css/public-promo-code.css',
    'interaction_tests': ROOT / 'tests/public-promo-code.test.mjs',
    'admin_interaction_tests': ROOT / 'tests/promo-admin-simple-flow.test.mjs',
    'base_migration': ROOT / 'supabase/migrations/20260823074346_promo_code_gated_reveal.sql',
    'hardening_migration': ROOT / 'supabase/migrations/20260823074404_promo_code_blocked_rereveal_hardening.sql',
    'official_sources_migration': ROOT / 'supabase/migrations/20260823155922_promo_official_global_sources.sql',
    'rpc_fix_migration': ROOT / 'supabase/migrations/20260827232940_promo_like_rpc_conflict_fix.sql',
    'simple_admin_migration': ROOT / 'supabase/migrations/20260831040210_simplify_promo_admin_flow.sql',
    'rpc_database_test': ROOT / 'scripts/check-promo-code-rpc.py',
    'security_test': ROOT / 'supabase/tests/promo_code_security.sql',
    'admin_security_test': ROOT / 'supabase/tests/promo_admin_quick_publish.sql',
}

errors = []
for label, path in FILES.items():
    if not path.exists():
        errors.append(f'{label}: arquivo ausente: {path.relative_to(ROOT)}')

if errors:
    print('PROMO CODE GATE: arquivos obrigatórios ausentes', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

texts = {label: path.read_text(encoding='utf-8') for label, path in FILES.items()}

home_loader = '<script type="module" src="./js/public-promo-code.js?v=20260831-promo-source-1&sb=20260823-security-supabase-pin-1"></script>'
if texts['home'].count(home_loader) != 1:
    errors.append('index.html precisa carregar public-promo-code.js exatamente uma vez na versão do presente central')

if 'href="./promo-codes.html"' not in texts['hub']:
    errors.append('hub de Conteúdo público não aponta para promo-codes.html')

for token in (
    "{id:'promo-codes',label:'Códigos promocionais'",
    "href:'./promo-codes.html'",
):
    if token not in texts['admin_shell_core']:
        errors.append(f'Admin Shell canônico sem contrato promocional: {token}')

for token in (
    "activeId:'promo-codes'",
    "./js/admin-shell.js?v=20260906-home-featured-phase-e-1",
    "./js/promo-codes.js?v=20260831-promo-admin-fast-1",
    'id="promo-preview"',
    'Códigos promocionais',
    'PUBLICAÇÃO RÁPIDA',
    'name="code"',
    'Fonte, validade e detalhes ajudam, mas são opcionais',
    'Remover do site',
    'Autoria automática',
):
    if token not in texts['admin_html']:
        errors.append(f'admin/promo-codes.html sem contrato: {token}')

if '<option value="community">' in texts['admin_html']:
    errors.append('Admin promocional ainda oferece fonte comunitária')
if 'C.A.T.S.' in texts['admin_html'] or 'C.A.T.S.' in texts['admin_js']:
    errors.append('Admin promocional contém referência proibida a C.A.T.S.')

for token in (
    "promo_admin_list",
    "promo_admin_publish",
    "promo_admin_remove",
    "created_by_name",
    "Publicado por",
    "p_source_url",
    "removeFromSite",
    "promo_preview",
    "window.open(url.href,'_blank')",
):
    if token not in texts['admin_js']:
        errors.append(f'admin/js/promo-codes.js sem contrato: {token}')

for token in (
    "./supabase.js?v=20260823-security-supabase-pin-1",
    "./promo-gift-controller.mjs?v=20260831-promo-source-1",
    'export { loadPromoCodeBanner }',
):
    if token not in texts['public_js']:
        errors.append(f'loader público sem contrato: {token}')

for token in (
    "./promo-gift-view.mjs?v=20260831-promo-source-1",
    "client.rpc('promo_like_and_reveal'",
    "client.rpc('promo_reveal_if_liked'",
    "client.auth.onAuthStateChange(onAuth)",
    'defer(async () =>',
    'authEpoch',
    'stillCurrent',
    'busy || unlocked',
    "const PREVIEW_CODE = 'PREVIA-NAO-REAL';",
    "client.rpc('echo_is_admin')",
    'getAuthenticatorAssuranceLevel',
    "aal?.currentLevel !== 'aal2'",
    'promo.__preview',
    'hasOpenIntent',
    'isExpired',
):
    if token not in texts['controller']:
        errors.append(f'controlador público sem contrato: {token}')

for token in (
    '../css/public-promo-code.css?v=20260831-promo-source-1',
    '<dialog class="echo-promo-dialog"',
    'dialog.showModal()',
    "dialog.addEventListener('cancel'",
    "dialog.addEventListener('keydown'",
    'Minimizar presente',
    'echo-promo-launcher',
    'echo-promo-gift-lid',
    'doc.body.appendChild(root)',
    "codeBox.textContent = ''",
    'launchConfetti',
    'prefers-reduced-motion: reduce',
    'Math.min(win.innerWidth, win.innerHeight || win.innerWidth) < 600',
    'compactViewport ? 72 : 108',
    'lockPageScroll',
    'unlockPageScroll',
    'onViewportChange',
    'const perWave = count / 3',
    'Pausar animações',
    'syncMotion',
    'scheduleCelebrationEnd',
    'details:not([open])',
    '<details class="echo-promo-details">',
    'PRÉVIA ADMIN · NÃO PUBLICADO',
    'Prévia concluída — nada foi gravado no banco.',
    'Copiar não resgata automaticamente',
    'Publicado pelo Echo Arena',
    'Confira o resgate diretamente no jogo',
):
    if token not in texts['view']:
        errors.append(f'presente central sem contrato: {token}')

public_source = texts['public_js'] + texts['controller'] + texts['view']
for forbidden in ('targetHeader', 'placeBanner', 'MutationObserver'):
    if forbidden in public_source:
        errors.append(f'presente central regrediu à faixa ou observador global: {forbidden}')

for token in (
    '@keyframes echoPromoGiftWiggle',
    '@keyframes echoPromoLid',
    '@keyframes echoPromoLight',
    '@keyframes echoPromoConfetti',
    '@keyframes echoPromoLidTease',
    '@keyframes echoPromoSheen',
    '@keyframes echoPromoRing',
    '@keyframes echoPromoSpark',
    '@keyframes echoPromoSettle',
    'animation-play-state:paused!important',
    '@media(prefers-reduced-motion:reduce)',
    '.echo-promo-confetti',
    '.echo-promo-confetti-layer',
    '.echo-promo-dialog::backdrop',
    '.echo-promo-launcher',
    '100dvh',
    'safe-area-inset-top',
    'safe-area-inset-right',
    'safe-area-inset-bottom',
    'safe-area-inset-left',
    '@media(max-height:540px)',
    '-webkit-overflow-scrolling:touch',
):
    if token not in texts['public_css']:
        errors.append(f'css/public-promo-code.css sem animação obrigatória: {token}')

for forbidden in (
    'private.promo_secrets',
    '.from(\'promo_likes\')',
):
    if forbidden in public_source:
        errors.append(f'js/public-promo-code.js acessa superfície proibida diretamente: {forbidden}')

base = texts['base_migration']
for token in (
    'create table public.promo_campaigns',
    'create table private.promo_secrets',
    'create table public.promo_likes',
    'revoke all on table private.promo_secrets from public, anon, authenticated;',
    'promo_like_and_reveal',
    'promo_reveal_if_liked',
    'promo_admin_save',
    'public.echo_is_admin()',
):
    if token not in base:
        errors.append(f'migration-base sem contrato: {token}')

campaign_section = base.split('create table public.promo_campaigns', 1)[1].split('create table private.promo_secrets', 1)[0]
if '\n  code text' in campaign_section:
    errors.append('código secreto foi colocado em public.promo_campaigns')

hardening = texts['hardening_migration']
for token in (
    'create or replace function public.promo_reveal_if_liked',
    'if public.is_blocked() then',
    "raise exception 'promo_user_blocked'",
    'public.echo_is_admin()',
    'drop policy if exists promo_campaigns_authenticated_select',
    'drop policy if exists promo_likes_authenticated_select',
):
    if token not in hardening:
        errors.append(f'migration de hardening sem contrato: {token}')

official = texts['official_sources_migration']
for token in (
    'private.promo_is_official_bullet_echo_source',
    'promo_campaigns_bullet_echo_only_check',
    'promo_campaigns_official_source_only_check',
    "raise exception 'promo_game_must_be_bullet_echo'",
    "raise exception 'promo_official_source_required'",
    "v_id, 'Bullet Echo'",
    "source_type = 'official'",
    'Bullet Echo — Telegram oficial (RU/global)',
    "^https://t\\.me/(s/)?bulletecho",
    'discord\\.gg/u4appb7',
    '(bulletecho|bullet_echo)',
    'id=com.zeptolab.bulletecho.google',
    'id1500726361',
):
    if token not in official:
        errors.append(f'migration de fontes oficiais sem contrato: {token}')

rpc_fix = texts['rpc_fix_migration']
for token in (
    'returns table(promo_id uuid, code text, liked_at timestamptz)',
    "set search_path = ''",
    'if v_user_id is null then',
    'if public.is_blocked() then',
    'on conflict on constraint promo_likes_pkey do update',
    'set created_at = existing_like.created_at',
    'returning existing_like.created_at into v_liked_at',
    'revoke execute on function public.promo_like_and_reveal(uuid) from public, anon;',
):
    if token not in rpc_fix:
        errors.append(f'correção da RPC sem contrato: {token}')
if re.search(r'on\s+conflict\s*\(\s*promo_id', rpc_fix, re.I):
    errors.append('RPC voltou a usar promo_id ambíguo no alvo de conflito')

simple_admin = texts['simple_admin_migration']
for token in (
    'create or replace function public.promo_admin_publish',
    'create or replace function public.promo_admin_remove',
    'v_actor uuid := auth.uid()',
    'source_url is null',
    'created_by = coalesce(public.promo_campaigns.created_by, v_actor)',
    'insert into public.admin_log',
    "'promo.removed'",
    'set published = false',
    "status = 'invalid'",
    'revoke all on function public.promo_admin_publish',
    'grant execute on function public.promo_admin_remove',
):
    if token not in simple_admin:
        errors.append(f'migration do Admin rápido sem contrato: {token}')

remove_section = simple_admin.split(
    'create or replace function public.promo_admin_remove', 1
)[1].split('drop function if exists public.promo_admin_list', 1)[0]
if re.search(r'delete\s+from\s+public\.promo_campaigns', remove_section, re.I):
    errors.append('remoção administrativa voltou a excluir a campanha definitivamente')

security_test = texts['security_test']
for token in (
    "private.promo_secrets",
    "verification_method",
    "pg_get_functiondef('public.promo_reveal_if_liked(uuid)'::regprocedure)",
    "public.is_blocked()",
    "echo_is_admin",
    "promo_campaigns_admin_update",
    "promo_likes_authenticated_delete",
    "promo_campaigns_source_url_check",
    "promo_is_official_bullet_echo_source",
    "public.promo_admin_publish(text,uuid,text,text,text,timestamptz)",
    "public.promo_admin_remove(uuid)",
    'do $promo_runtime$',
    'from public.promo_like_and_reveal(v_promo_id)',
    'retry changed or duplicated the like',
    'failed reveal persisted a like',
    'rollback;',
):
    if token not in security_test:
        errors.append(f'teste de segurança sem cobertura: {token}')

for token in (
    "const PROMO_GAME = 'Bullet Echo';",
    ".eq('game',PROMO_GAME)",
    ".eq('published',true)",
    ".eq('verification_status','verified')",
    ".eq('status','active')",
    "starts_at.is.null,starts_at.lte.${timestamp}",
    "expires_at.is.null,expires_at.gt.${timestamp}",
):
    if token not in texts['controller']:
        errors.append(f'consulta pública promocional sem filtro obrigatório: {token}')

if 'echo-promo-code-box.revealed' not in texts['public_css']:
    errors.append('CSS público não possui estado visual de código revelado')

if re.search(r'animation[^;{}]*\binfinite\b', texts['public_css']):
    errors.append('presente não pode manter animações infinitas')
if 'backdrop-filter:' in texts['public_css']:
    errors.append('presente não pode adicionar blur de viewport')

if errors:
    print(f'PROMO CODE GATE: FALHOU com {len(errors)} problema(s):', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

subprocess.run(['node', '--test', str(FILES['interaction_tests'])], cwd=ROOT, check=True)
subprocess.run(['node', '--test', str(FILES['admin_interaction_tests'])], cwd=ROOT, check=True)
print('PROMO CODE GATE: OK · publicação rápida · autoria automática · fonte opcional · remoção reversível · presente central · segredo isolado · cache versionado')
