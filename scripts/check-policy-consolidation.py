#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/migrations/20260822154908_consolidate_remaining_permissive_policies.sql'
SQL_TEST = ROOT / 'supabase/tests/no_multiple_permissive_policies.sql'
WORKFLOW = ROOT / '.github/workflows/quality-gates.yml'
failures = []

for path in (MIGRATION, SQL_TEST, WORKFLOW):
    if not path.exists():
        failures.append(f'arquivo obrigatório ausente: {path.relative_to(ROOT)}')

if not failures:
    sql = MIGRATION.read_text(encoding='utf-8').lower()
    test = SQL_TEST.read_text(encoding='utf-8').lower()
    workflow = WORKFLOW.read_text(encoding='utf-8')
    required_tables = (
        'community_posts', 'community_comments', 'equipment', 'equipment_metrics',
        'equipment_modifiers', 'equipment_set_bonus_modifiers', 'equipment_sets',
        'equipment_tier_stats', 'equipment_tiers', 'equipment_variants', 'equipments',
        'favorites', 'guides', 'news', 'pulse_ingestion_runs', 'reports',
        'site_content', 'site_pages', 'stat_definitions', 'tier_list_entries',
        'tier_lists', 'user_achievements', 'user_badges',
    )
    for table in required_tables:
        if f'public.{table}' not in sql:
            failures.append(f'migration não cobre tabela: {table}')
    for token in (
        'for select to anon', 'for select to authenticated',
        '(select auth.uid())', '(select public.is_admin())',
        'policy_consolidation_failed',
    ):
        if token not in sql:
            failures.append(f'migration sem invariante: {token}')
    for forbidden in ('insert into ', 'update public.', 'delete from '):
        if forbidden in sql:
            failures.append(f'migration contém mutação de dados proibida: {forbidden.strip()}')
    for token in ('p.permissive = \'permissive\'', 'having count(*) > 1', "'anon'", "'authenticated'"):
        if token not in test:
            failures.append(f'teste SQL sem contrato: {token}')
    if 'python3 scripts/check-policy-consolidation.py' not in workflow:
        failures.append('workflow não executa gate de consolidação de policies')

if failures:
    print(f'CONSOLIDAÇÃO DE POLICIES: FALHOU com {len(failures)} problema(s)', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('CONSOLIDAÇÃO DE POLICIES: OK · 23 tabelas cobertas sem mutação de dados.')
