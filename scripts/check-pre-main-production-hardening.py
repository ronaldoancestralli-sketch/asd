#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/migrations/20260822150038_pre_main_production_hardening.sql'
failures = []

if not MIGRATION.exists():
    failures.append('migration de hardening de produção ausente')
else:
    sql = MIGRATION.read_text(encoding='utf-8').lower()
    required = (
        "insert into public.site_pages",
        "'statistics'",
        "on conflict (page_key) do nothing",
        "drop policy if exists seasons_admin_delete on public.seasons",
        "revoke delete on table public.seasons from public, anon, authenticated",
    )
    for token in required:
        if token not in sql:
            failures.append(f'migration sem contrato obrigatório: {token}')

    forbidden = (
        "on conflict (page_key) do update",
        "update public.site_pages",
        "delete from public.site_pages",
        "delete from public.seasons",
        "insert into public.seasons",
        "insert into public.team_synergies",
        "insert into public.hero_synergies",
        "insert into public.team_compositions",
        "insert into public.composition_model_versions",
        "insert into public.composition_training_runs",
    )
    for token in forbidden:
        if token in sql:
            failures.append(f'migration contém mutação proibida: {token}')

if failures:
    print(f'PRE-MAIN PRODUCTION HARDENING: FALHOU com {len(failures)} problema(s)', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('PRE-MAIN PRODUCTION HARDENING: OK · Estatísticas materializada sem sobrescrita e histórico de temporadas sem DELETE de cliente.')
