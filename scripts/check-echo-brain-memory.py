#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
migration=ROOT/'supabase/migrations/20260822013022_echo_brain_model_registry.sql'
failures=[]
if not migration.exists(): failures.append('migration do registro do Echo Brain ausente')
else:
    sql=migration.read_text(encoding='utf-8').lower()
    required=(
        'create table if not exists public.composition_model_versions',
        'create table if not exists public.composition_training_runs',
        'create table if not exists public.echo_brain_settings',
        "values ('composition', false, 0.35, false, false, 12, 120, 3)",
        'influence_weight numeric(6,5)', 'influence_weight <= 0.55',
        'max_influence numeric(6,5)', 'max_influence <= 0.55',
        'create unique index if not exists composition_model_versions_one_active',
        "where status = 'active'",
        'alter table public.composition_model_versions enable row level security',
        'alter table public.composition_training_runs enable row level security',
        'alter table public.echo_brain_settings enable row level security',
        'revoke all on table public.composition_model_versions from anon, authenticated',
        'revoke all on table public.composition_training_runs from anon, authenticated',
        'revoke all on table public.echo_brain_settings from anon, authenticated',
        'create or replace function public.admin_echo_brain_registry_snapshot()',
        'create or replace function public.admin_echo_brain_set_runtime(',
        'if not public.is_admin()',
        "raise exception 'active_model_required'",
        "raise exception 'validated_active_model_required'",
        'grant execute on function public.admin_echo_brain_registry_snapshot() to authenticated',
        'grant execute on function public.admin_echo_brain_set_runtime(boolean, numeric) to authenticated',
        'auto_training_enabled boolean not null default false',
        'auto_promotion_enabled boolean not null default false',
        'learning_enabled boolean not null default false',
    )
    for token in required:
        if token not in sql: failures.append(f'migration Brain sem salvaguarda: {token}')
    forbidden=(
        "values ('composition', true",
        'auto_training_enabled boolean not null default true',
        'auto_promotion_enabled boolean not null default true',
        'grant all on table public.composition_model_versions',
        'grant all on table public.composition_training_runs',
        'grant all on table public.echo_brain_settings',
    )
    for token in forbidden:
        if token in sql: failures.append(f'migration Brain contém default/grant proibido: {token}')

if failures:
    print(f'Gate de memória do Echo Brain falhou com {len(failures)} problema(s):',file=sys.stderr)
    for failure in failures: print(f'- {failure}',file=sys.stderr)
    raise SystemExit(1)
print('Echo Brain memory: registros versionados, RLS, grants mínimos, kill switch e defaults seguros validados.')
