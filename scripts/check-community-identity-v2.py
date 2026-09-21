#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT=Path(__file__).resolve().parents[1]
MIG=ROOT/'supabase/migrations/20260825062000_identity_integrity_v2_shadow.sql'
TEST=ROOT/'supabase/tests/identity_integrity_v2_security.sql'
DOC=ROOT/'docs/IDENTITY_AND_REPUTATION.md'
LEDGER=ROOT/'docs/CHANGELOG_INTERNAL.jsonl'
WORKFLOW=ROOT/'.github/workflows/quality-gates.yml'
errors=[]

for path in (MIG,TEST,DOC,LEDGER,WORKFLOW):
    if not path.exists(): errors.append(f'arquivo ausente: {path.relative_to(ROOT)}')
if errors:
    print('\n'.join(errors)); sys.exit(1)

mig=MIG.read_text(encoding='utf-8').lower()
test=TEST.read_text(encoding='utf-8').lower()
doc=DOC.read_text(encoding='utf-8').lower()
ledger=LEDGER.read_text(encoding='utf-8').lower()
workflow=WORKFLOW.read_text(encoding='utf-8').lower()

required=[
 'create table if not exists public.echo_identity_rollout_settings',
 'public_identity_enabled boolean not null default false',
 'creator_verification_enabled boolean not null default false',
 'research_submission_enabled boolean not null default false',
 'create or replace function public.admin_set_identity_rollout_v1',
 "'enable_identity_v2'",
 'create or replace function public.echo_identity_display_name_has_invisible',
 'create or replace function public.echo_identity_display_name_reserved',
 'display_name_invisible_characters',
 'display_name_reserved',
 'create or replace function public.echo_creator_channel_fingerprint',
 'echo_creator_claims_verified_channel_unique',
 'creator_channel_already_verified',
 'create or replace function public.echo_research_submission_fingerprint',
 'duplicate_research_submission',
 'pg_catalog.pg_advisory_xact_lock',
 'identity_public_rollout_disabled',
 'creator_verification_rollout_disabled',
 'research_submission_rollout_disabled',
 'identity_cards_enabled',
]
for token in required:
    if token not in mig: errors.append(f'migration V2 sem invariante: {token}')

rollout=re.search(r'create table if not exists public\.echo_identity_rollout_settings\s*\((.*?)\n\);',mig,re.S)
if not rollout:
    errors.append('não foi possível inspecionar rollout settings')
else:
    block=rollout.group(1)
    for field in ('public_identity_enabled','signup_handle_enabled','public_profiles_enabled','identity_cards_enabled','creator_verification_enabled','research_submission_enabled'):
        if not re.search(rf'{field}\s+boolean\s+not null\s+default\s+false',block):
            errors.append(f'rollout não nasce fail-closed: {field}')

if 'grant execute on function public.echo_identity_rollout_status_v1() to anon,authenticated' not in mig:
    errors.append('status público seguro do rollout não está explicitamente concedido')
if 'grant update on table public.echo_identity_rollout_settings' in mig:
    errors.append('rollout settings recebeu UPDATE direto')
if "grant execute on function public.admin_set_identity_rollout_v1" not in mig:
    errors.append('setter AAL2 de rollout ausente')
if "revoke all on function public.admin_set_identity_rollout_v1" not in mig:
    errors.append('setter de rollout sem revoke explícito')

for token in ('master rollout default is not false','verified creator channel is not unique','echo research lacks rollout/dedupe lock'):
    if token not in test: errors.append(f'teste SQL V2 sem cobertura: {token}')
for token in ('identity integrity v2','deduplic','anti-imperson'):
    if token not in doc: errors.append(f'documentação V2 incompleta: {token}')
if '2026-08-25-identity-integrity-v2-shadow' not in ledger:
    errors.append('ledger interno sem Identity Integrity V2')
if '"public":false' not in ledger or '"version_impact":"none"' not in ledger:
    errors.append('ledger não preserva classificação interna sem versão')
if 'python3 scripts/check-community-identity-v2.py' not in workflow:
    errors.append('Quality Gates não executam Identity Integrity V2')

if errors:
    print('IDENTITY INTEGRITY V2: FALHOU')
    for error in errors: print('-',error)
    sys.exit(1)
print('IDENTITY INTEGRITY V2: OK · rollout fail-closed, anti-impersonação, Creator exclusivo e Echo Research deduplicado.')
