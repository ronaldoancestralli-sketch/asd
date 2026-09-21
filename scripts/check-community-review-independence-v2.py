#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MIG = ROOT / 'supabase/migrations/20260825096000_identity_review_independence_v2_shadow.sql'
SQL_TEST = ROOT / 'supabase/tests/identity_review_independence_v2_security.sql'
DOC = ROOT / 'docs/REPUTATION_QUALITY_V2.md'
LEDGER = ROOT / 'docs/CHANGELOG_INTERNAL.jsonl'
WORKFLOW = ROOT / '.github/workflows/quality-gates.yml'
errors = []

for path in (MIG, SQL_TEST, DOC, LEDGER, WORKFLOW):
    if not path.exists():
        errors.append(f'arquivo ausente: {path.relative_to(ROOT)}')
if errors:
    print('\n'.join(errors)); sys.exit(1)

mig = MIG.read_text(encoding='utf-8').lower()
test = SQL_TEST.read_text(encoding='utf-8').lower()
doc = DOC.read_text(encoding='utf-8').lower()
ledger = LEDGER.read_text(encoding='utf-8').lower()
workflow = WORKFLOW.read_text(encoding='utf-8').lower()

for token in (
    'self_reviewed_first_discovery_requires_review',
    "c.reviewed_by is distinct from c.contributor_id",
    'first_discovery_self_review_not_allowed',
    'institutional_badge_self_grant_not_allowed',
    'creator_self_review_not_allowed',
    "'independent_review',v_row.contributor_id is distinct from auth.uid()",
    'perform public.echo_recompute_community_reputation(r.id)',
):
    if token not in mig:
        errors.append(f'Review Independence migration sem contrato: {token}')

for token in (
    'reputation recompute counts self-reviewed decisions',
    'research review lost self-review first-discovery guard',
    'creator review allows self-verification',
    'institutional badge rpc allows self-grant',
    'anon can execute an institutional/research review rpc',
):
    if token not in test:
        errors.append(f'teste SQL Review Independence sem cobertura: {token}')

for forbidden in (
    "grant execute on function public.echo_recompute_community_reputation(uuid) to authenticated",
    "grant execute on function public.echo_recompute_community_reputation(uuid) to anon",
):
    if forbidden in mig:
        errors.append(f'recompute privado exposto: {forbidden}')

for token in (
    'revisão independente',
    'auto-revisão',
    'creator',
    'primeira descoberta',
    'não conta',
):
    if token not in doc:
        errors.append(f'documentação sem independência de revisão: {token}')

if '2026-08-25-review-independence-v2-shadow' not in ledger:
    errors.append('ledger interno sem Review Independence V2')
if 'python3 scripts/check-community-review-independence-v2.py' not in workflow:
    errors.append('Quality Gates não executam Review Independence V2')

if errors:
    print('REVIEW INDEPENDENCE V2: FALHOU')
    for error in errors: print('-', error)
    sys.exit(1)
print('REVIEW INDEPENDENCE V2: OK · auto-revisão não gera reputação/descoberta/Creator/badge institucional.')
