#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT=Path(__file__).resolve().parents[1]
MIG=ROOT/'supabase/migrations/20260825054000_community_identity_and_echo_scouts_v1.sql'
FOUNDER_READ=ROOT/'supabase/migrations/20260825054500_identity_founder_admin_readonly.sql'
RUNTIME_HARDENING=ROOT/'supabase/migrations/20260825054600_identity_runtime_and_creator_hardening.sql'
DOC=ROOT/'docs/IDENTITY_AND_REPUTATION.md'
TEST=ROOT/'supabase/tests/community_identity_security.sql'
LAB=ROOT/'admin/identity-lab.html'
LAB_JS=ROOT/'admin/js/identity-lab.js'
LAB_CSS=ROOT/'admin/css/identity-lab.css'
errors=[]

for path in (MIG,FOUNDER_READ,RUNTIME_HARDENING,DOC,TEST,LAB,LAB_JS,LAB_CSS):
    if not path.exists(): errors.append(f'arquivo obrigatório ausente: {path.relative_to(ROOT)}')
if errors:
    print('\n'.join(errors),file=sys.stderr);raise SystemExit(1)

sql=MIG.read_text(encoding='utf-8')
low=sql.lower();founder_read=FOUNDER_READ.read_text(encoding='utf-8').lower();hard=RUNTIME_HARDENING.read_text(encoding='utf-8').lower()
doc=DOC.read_text(encoding='utf-8').lower();lab=LAB.read_text(encoding='utf-8').lower();lab_js=LAB_JS.read_text(encoding='utf-8').lower()

required=[
 'create table if not exists public.echo_public_profiles',
 'create table if not exists public.echo_community_reputation',
 'create table if not exists public.echo_identity_badges',
 "badge_type in ('creator','partner','moderator','developer')",
 'create table if not exists public.echo_founder_authority',
 'create table if not exists public.echo_creator_claims',
 'proof_code_hash',
 "now()+interval '7 days'",
 'create table if not exists public.echo_research_contributions',
 "'pending',false",
 'research_submission_rate_limited',
 'create or replace function public.echo_recompute_community_reputation',
 'create or replace function public.echo_public_identity_cards_v1',
 'create or replace function public.echo_public_profile_v1',
 'create or replace function public.admin_set_identity_badge_v1',
 'if not public.echo_is_admin()',
 'create or replace function public.echo_set_founder_server_only',
 "coalesce(auth.role(),'') <> 'service_role'",
 'revoke all on function public.echo_set_founder_server_only(uuid,text) from public, anon, authenticated',
 'grant execute on function public.echo_set_founder_server_only(uuid,text) to service_role',
 'create or replace function public.echo_request_creator_verification_v1',
 'create or replace function public.admin_review_creator_claim_v1',
 'create or replace function public.echo_submit_research_contribution_v1',
 'create or replace function public.admin_review_research_contribution_v1',
]
for token in required:
    if token not in low: errors.append(f'migration sem garantia obrigatória: {token}')

badge_block=re.search(r'create table if not exists public\.echo_identity_badges\s*\((.*?)\n\);',low,re.S)
if not badge_block: errors.append('não foi possível inspecionar echo_identity_badges')
else:
    block=badge_block.group(1)
    if "'admin'" in block or "'founder'" in block: errors.append('admin/founder não podem ser badge institucional editável')

reputation_block=re.search(r'create or replace function public\.echo_recompute_community_reputation.*?\$\$;',low,re.S)
if not reputation_block: errors.append('recomputação de reputação ausente')
elif 'is_admin' in reputation_block.group(0) or 'role=' in reputation_block.group(0): errors.append('reputação comunitária está acoplada a autoridade')

public_surface='\n'.join(re.findall(r'create or replace function public\.echo_public_(?:identity_cards|profile)_v1.*?\$\$;',low,re.S))
if not public_surface: errors.append('RPC pública de identidade ausente')
if 'email' in public_surface: errors.append('RPC pública de identidade contém e-mail')
for sensitive in ('blocked_reason','blocked_at'):
    if sensitive in public_surface: errors.append(f'RPC pública expõe campo sensível: {sensitive}')

bootstrap=re.search(r'create or replace function public\.echo_identity_bootstrap_profile.*?\$\$;',low,re.S)
if not bootstrap: errors.append('bootstrap de identidade ausente')
else:
    for forbidden in ('creator','partner','moderator','developer','founder'):
        if f"'{forbidden}'" in bootstrap.group(0): errors.append(f'bootstrap atribui autoridade automaticamente: {forbidden}')

for token in ('create or replace function public.admin_identity_founder_status_v1','if not public.echo_is_admin()','mutable_from_admin'):
    if token not in founder_read: errors.append(f'leitura Founder sem garantia: {token}')
if 'echo_set_founder_server_only' in lab_js: errors.append('laboratório Admin tenta invocar setter server-only de Founder')
if 'data-founder-set' in lab or 'set founder' in lab: errors.append('laboratório contém controle de mutação Founder')

for token in ("rpc('admin_set_identity_badge_v1'","rpc('admin_review_creator_claim_v1'","rpc('admin_review_research_contribution_v1'"):
    if token not in lab_js: errors.append(f'laboratório sem RPC de governança: {token}')
for unsafe in ("from('echo_identity_badges').insert", "from('echo_identity_badges').update", "from('echo_creator_claims').update", "from('echo_research_contributions').update"):
    if unsafe in lab_js: errors.append(f'laboratório faz mutação direta: {unsafe}')
for token in ('shadow · não público','founder','server-only'):
    if token not in lab: errors.append(f'laboratório sem aviso crítico: {token}')

for token in ('if tg_op=\'insert\' then','if tg_op=\'delete\' then','echo_guard_institutional_badge','creator_badge_requires_verified_claim',"c.status='verified'"):
    if token not in hard: errors.append(f'hardening de runtime ausente: {token}')
if 'coalesce(new.contributor_id,old.contributor_id)' in hard: errors.append('trigger de reputação ainda acessa OLD/NEW de forma insegura')
if 'coalesce(new.user_id,old.user_id)' in hard: errors.append('trigger de auditoria ainda acessa OLD/NEW de forma insegura')

for token in ('não é badge','nunca','service_role','envio → pending','não existe dm','único destino permitido o snv'):
    if token not in doc: errors.append(f'documentação sem regra crítica: {token}')

if errors:
    print(f'IDENTITY + ECHO SCOUTS V1: FALHOU com {len(errors)} problema(s)',file=sys.stderr)
    for e in errors: print('-',e,file=sys.stderr)
    raise SystemExit(1)
print('IDENTITY + ECHO SCOUTS V1: OK · identidade sem e-mail, reputação sem autoridade, Creator só após claim verificado, badges AAL2, Founder server-only e laboratório Shadow fail-closed.')
