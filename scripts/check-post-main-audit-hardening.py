#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/migrations/20260822154246_post_main_audit_hardening.sql'
SQL_TEST = ROOT / 'supabase/tests/echo_brain_internal_function_privileges.sql'
REDIRECT = ROOT / 'hero-editor.html'
REFERENCE_GATE = ROOT / 'scripts/check-local-references.py'
WORKFLOW = ROOT / '.github/workflows/quality-gates.yml'
FUNCTIONS = (
    'echo_brain_guard_emergency_activation',
    'echo_brain_guard_emergency_evaluation',
    'echo_brain_guard_emergency_model_transition',
    'echo_brain_guard_emergency_runtime',
    'echo_brain_guard_emergency_training',
    'echo_brain_guard_processing_during_emergency',
)
failures = []

for path in (MIGRATION, SQL_TEST, REDIRECT, REFERENCE_GATE, WORKFLOW):
    if not path.exists():
        failures.append(f'arquivo obrigatório ausente: {path.relative_to(ROOT)}')

if not failures:
    sql = MIGRATION.read_text(encoding='utf-8').lower()
    sql_test = SQL_TEST.read_text(encoding='utf-8').lower()
    redirect = REDIRECT.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')

    for function in FUNCTIONS:
        revoke = f'revoke all on function public.{function}()'
        if revoke not in sql:
            failures.append(f'migration não revoga função interna: {function}')
        if function not in sql_test:
            failures.append(f'teste SQL não cobre função interna: {function}')

    if sql.count('from public, anon, authenticated, service_role;') != len(FUNCTIONS):
        failures.append('migration não revoga os quatro papéis em todas as funções internas')
    if 'admin_echo_brain_' in sql:
        failures.append('migration alterou indevidamente RPC administrativa do Echo Brain')
    if './admin/hero-editor.html' not in redirect:
        failures.append('rota legada não aponta para o editor Admin atual')
    for token in ('target.search = window.location.search', 'target.hash = window.location.hash'):
        if token not in redirect:
            failures.append(f'redirecionamento legado perdeu contexto: {token}')
    if 'python3 scripts/check-local-references.py' not in workflow:
        failures.append('workflow não executa auditoria completa de referências locais')
    if 'python3 scripts/check-post-main-audit-hardening.py' not in workflow:
        failures.append('workflow não executa gate de hardening pós-auditoria')

if failures:
    print(f'HARDENING PÓS-AUDITORIA: FALHOU com {len(failures)} problema(s)', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('HARDENING PÓS-AUDITORIA: OK · rota legada consolidada e triggers do Echo Brain fora do Data API.')
