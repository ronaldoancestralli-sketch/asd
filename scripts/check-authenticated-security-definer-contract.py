#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL_TEST = ROOT / 'supabase' / 'tests' / 'authenticated_security_definer_contract.sql'
AUDIT_DOC = ROOT / 'docs' / 'AUTHENTICATED_SECURITY_DEFINER_AUDIT_2026-08-22.md'
WORKFLOW = ROOT / '.github' / 'workflows' / 'quality-gates.yml'
QUALITY_CHECK = ROOT / 'scripts' / 'quality_check.py'

SIGNATURE_RE = re.compile(r"'public\.([a-z0-9_]+\([^']*\))'", re.IGNORECASE)


def require_tokens(label: str, text: str, tokens: tuple[str, ...], failures: list[str]) -> None:
    for token in tokens:
        if token not in text:
            failures.append(f'{label}: token obrigatório ausente: {token}')


def extract_signature_array(sql: str, variable: str, failures: list[str]) -> list[str]:
    match = re.search(
        rf'\b{re.escape(variable)}\s+text\[\]\s*:=\s*array\[(.*?)\];',
        sql,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        failures.append(f'authenticated_security_definer_contract.sql: array {variable} ausente')
        return []
    return SIGNATURE_RE.findall(match.group(1))


def main() -> int:
    failures: list[str] = []
    required_files = (SQL_TEST, AUDIT_DOC, WORKFLOW, QUALITY_CHECK)
    for path in required_files:
        if not path.exists():
            failures.append(f'arquivo obrigatório ausente: {path.relative_to(ROOT)}')

    if failures:
        for failure in failures:
            print(f'- {failure}', file=sys.stderr)
        return 1

    sql = SQL_TEST.read_text(encoding='utf-8')
    expected = extract_signature_array(sql, 'v_expected', failures)
    semantic_optional = extract_signature_array(sql, 'v_semantic_optional', failures)
    admin = extract_signature_array(sql, 'v_admin', failures)
    user = extract_signature_array(sql, 'v_user', failures)
    helpers = extract_signature_array(sql, 'v_helpers', failures)
    public_narrow = extract_signature_array(sql, 'v_public_narrow', failures)
    pulse = {'echo_can_preview_pulse()','echo_pulse_private_preview_feed()'}

    if len(expected) != 68 or len(set(expected)) != 68:
        failures.append(
            'authenticated_security_definer_contract.sql: '
            f'v_expected deve ter 68 assinaturas únicas; total={len(expected)}, únicas={len(set(expected))}'
        )
    if len(semantic_optional) != 9 or len(set(semantic_optional)) != 9:
        failures.append(
            'authenticated_security_definer_contract.sql: '
            f'v_semantic_optional deve ter 9 assinaturas únicas; total={len(semantic_optional)}, '
            f'únicas={len(set(semantic_optional))}'
        )
    if not set(semantic_optional).issubset(set(expected)):
        failures.append('authenticated_security_definer_contract.sql: Semantic v4 opcional deve ser subconjunto da allowlist')
    for label, values, total in (
        ('v_admin', admin, 40),
        ('v_user', user, 15),
        ('v_helpers', helpers, 5),
        ('v_public_narrow', public_narrow, 6),
    ):
        if len(values) != total or len(set(values)) != total:
            failures.append(
                f'authenticated_security_definer_contract.sql: {label} deve ter '
                f'{total} assinaturas únicas; total={len(values)}, únicas={len(set(values))}'
            )

    classified=set(admin)|set(user)|set(helpers)|set(public_narrow)|pulse
    if classified != set(expected):
        failures.append('authenticated_security_definer_contract.sql: grupos funcionais não cobrem exatamente a allowlist esperada')
    groups=[set(admin),set(user),set(helpers),set(public_narrow),pulse]
    for i,left in enumerate(groups):
        for right in groups[i+1:]:
            if left & right:
                failures.append('authenticated_security_definer_contract.sql: grupos funcionais sobrepostos')
                break

    require_tokens(
        'authenticated_security_definer_contract.sql',sql,(
            "has_function_privilege('anon',v_proc,'EXECUTE')",
            "has_function_privilege('authenticated',v_proc,'EXECUTE')",
            "has_function_privilege('service_role',v_proc,'EXECUTE')",
            "v_signature=any(v_public_narrow)",
            'RPC pública estreita perdeu anon',
            'anon executa função não pública',
            "v_settings not like '%search_path=%'",
            "position('is_admin' in v_definition)=0",
            "position('auth.uid' in v_definition)=0",
            'context_hash_required','pg_advisory_xact_lock','nova exposição fora da allowlist',
            'echo_identity_rollout_status_v1()','echo_public_identity_cards_v1(uuid[])','echo_public_profile_v1(text)',
            'admin_confirm_research_review_v1(uuid,bigint,text,text)',
            'admin_research_review_queue_v5(text,integer)',
            'echo_my_research_guardrails_v5()','echo_my_research_missions_v5()',
            'status público de Identity','cards públicos de Identity','perfil público de Identity',
            'Semantic v4 parcialmente instalada','v_active_expected',
            'record_analytics_event(text,text,text,uuid,text,jsonb)',
            'analytics público sem limites/identidade esperados',
        ),failures,
    )

    lowered_sql=sql.lower()
    for forbidden in ('insert into ','update public.','delete from ','alter table ','drop table ','grant execute ','revoke all '):
        if forbidden in lowered_sql:
            failures.append('authenticated_security_definer_contract.sql deixou de ser read-only: '+forbidden.strip())

    workflow=WORKFLOW.read_text(encoding='utf-8')
    require_tokens('quality-gates.yml',workflow,(
        'Verificar contrato das SECURITY DEFINER autenticadas',
        'python3 scripts/check-authenticated-security-definer-contract.py',
    ),failures)

    quality_check=QUALITY_CHECK.read_text(encoding='utf-8')
    require_tokens('quality_check.py',quality_check,("ROOT / 'supabase' / 'tests' / 'authenticated_security_definer_contract.sql'",),failures)

    audit_doc=AUDIT_DOC.read_text(encoding='utf-8').replace('**','').lower()
    require_tokens('AUTHENTICATED_SECURITY_DEFINER_AUDIT_2026-08-22.md',audit_doc,(
        '36','45','56','35','10','4','5','baseline de produção','branch semantic v4',
        'echo identity v1 + integrity v2','rpcs públicas estreitas','service_role',
        'echo identity v5 hardening','60','37','12','44','59','68','40','15','6',
        'admin_confirm_research_review_v1','admin_research_review_queue_v5',
        'echo_my_research_guardrails_v5','echo_my_research_missions_v5',
        'nenhuma migration da tranche de 2026-08-22','echo pulse continua privado',
    ),failures)

    if failures:
        print(f'Gate SECURITY DEFINER falhou com {len(failures)} problema(s):',file=sys.stderr)
        for failure in failures: print(f'- {failure}',file=sys.stderr)
        return 1

    print('Contrato read-only validado: baseline restaurada 44 · Identity V5 59 sem Semantic v4 ou 68 com Semantic v4; bundle opcional atômico e 6 RPCs públicas estreitas classificadas.')
    return 0


if __name__=='__main__':
    raise SystemExit(main())
