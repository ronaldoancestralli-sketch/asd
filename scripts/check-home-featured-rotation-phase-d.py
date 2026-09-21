#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/migrations/20260906034743_home_featured_rotation_phase_d.sql'
FIXTURE = ROOT / 'supabase/tests/home_featured_rotation_phase_d_fixture.sql'
WORKFLOW = ROOT / '.github/workflows/quality-gates.yml'
GITLAB = ROOT / '.gitlab-ci.yml'

failures: list[str] = []


def require_text(path: Path, fragments: list[str]) -> str:
    if not path.exists():
        failures.append(f'arquivo ausente: {path.relative_to(ROOT)}')
        return ''
    text = path.read_text(encoding='utf-8')
    lowered = text.lower()
    for fragment in fragments:
        if fragment.lower() not in lowered:
            failures.append(
                f'{path.relative_to(ROOT)}: contrato ausente: {fragment}'
            )
    return text


migration = require_text(MIGRATION, [
    "automation_enabled boolean not null default false",
    "cadence text not null default 'weekly'",
    "check (cadence in ('daily', 'weekly'))",
    'create table private.home_featured_rotation_queue',
    'create table private.home_featured_rotation_history',
    'execution_key text not null unique',
    'create trigger home_featured_rotation_history_append_only_v1',
    'create table public.home_featured_state',
    'alter table public.home_featured_state enable row level security',
    'create policy home_featured_state_public_read',
    'create or replace function private.run_home_featured_rotation_v1',
    'perform pg_catalog.pg_advisory_xact_lock',
    'on conflict (execution_key) do nothing',
    'create or replace function public.echo_home_featured_state_v1',
    'security invoker',
    'revoke all on function private.run_home_featured_rotation_v1',
    'grant execute on function public.echo_home_featured_state_v1()',
])

if migration:
    for pattern, label in [
        (r'\bcron\s*\.\s*schedule\b', 'agendamento pg_cron'),
        (r'\bcron\s*\.\s*job\b', 'edição direta de cron.job'),
        (r'\bupdate\s+public\s*\.\s*site_pages\b', 'escrita no CMS legado'),
        (r'\binsert\s+into\s+public\s*\.\s*site_pages\b', 'escrita no CMS legado'),
    ]:
        if re.search(pattern, migration, flags=re.IGNORECASE):
            failures.append(f'{MIGRATION.relative_to(ROOT)}: contém {label}')

    public_rpc = migration.split(
        'create or replace function public.echo_home_featured_state_v1()', 1
    )[-1]
    public_rpc = public_rpc.split('revoke all on function', 1)[0]
    if 'security definer' in public_rpc.lower():
        failures.append('RPC público não pode usar security definer')

fixture = require_text(FIXTURE, [
    '\\ir ../migrations/20260906034743_home_featured_rotation_phase_d.sql',
    "v_result ->> 'status' <> 'already_applied'",
    'execução atrasada criou backfill ou duplicata',
    "'weekly', 'America/Sao_Paulo'",
    'fila com um herói divergiu',
    "v_result ->> 'status' <> 'no_eligible_heroes'",
    'HOME_FEATURED_TIMEZONE_INVALID',
    'HOME_FEATURED_HISTORY_APPEND_ONLY',
    'RPC público expôs um destaque automático vencido',
    'set role anon',
])

workflow = require_text(WORKFLOW, [
    'python3 scripts/check-home-featured-rotation-phase-d.py',
])

gitlab = require_text(GITLAB, [
    'home-featured-rotation-database:',
    'supabase/tests/home_featured_rotation_phase_d_fixture.sql',
])

if gitlab and gitlab.count('- job: home-featured-rotation-database') != 3:
    failures.append(
        '.gitlab-ci.yml: o teste da rotação deve bloquear preview, Brain e Pages'
    )

if failures:
    print(f'HOME FEATURED ROTATION PHASE D: FALHOU com {len(failures)} problema(s)')
    for failure in failures:
        print('-', failure)
    raise SystemExit(1)

print('HOME FEATURED ROTATION PHASE D: OK · contrato inativo, fixture e dependências do deploy verificados.')
