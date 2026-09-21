#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/migrations/20260906041241_home_featured_rotation_admin_phase_e.sql'
FIXTURE = ROOT / 'supabase/tests/home_featured_rotation_phase_e_fixture.sql'
HTML = ROOT / 'admin/home-featured.html'
CSS = ROOT / 'admin/css/home-featured.css'
CONTROLLER = ROOT / 'admin/js/home-featured.js'
MODEL = ROOT / 'admin/js/home-featured-rotation-model.mjs'
TESTS = ROOT / 'tests/home-featured-admin.test.mjs'
SHELL = ROOT / 'admin/js/admin-shell-core.js'
ACCESS = ROOT / 'admin/js/admin-access.js'
WORKFLOW = ROOT / '.github/workflows/quality-gates.yml'
GITLAB = ROOT / '.gitlab-ci.yml'
VERSION = '20260906-home-featured-phase-e-1'
HOME_VERSION = '20260906-home-featured-phase-f-1'

failures: list[str] = []


def require_text(path: Path, fragments: list[str]) -> str:
    if not path.exists():
        failures.append(f'arquivo ausente: {path.relative_to(ROOT)}')
        return ''
    value = path.read_text(encoding='utf-8')
    lowered = value.lower()
    for fragment in fragments:
        if fragment.lower() not in lowered:
            failures.append(f'{path.relative_to(ROOT)}: contrato ausente: {fragment}')
    return value


migration = require_text(MIGRATION, [
    'create or replace function public.echo_admin_home_featured_rotation_v1()',
    "echo_require_admin_capability('publishing.view')",
    "'automation_available', false",
    'create or replace function public.echo_admin_save_home_featured_plan_v1(',
    "echo_require_admin_capability('publishing.edit')",
    'HOME_FEATURED_REVISION_CONFLICT',
    'HOME_FEATURED_CURRENT_MUST_REMAIN_IN_QUEUE',
    "'schedule_changed'",
    "'save_home_featured_plan'",
    'create or replace function public.echo_admin_set_home_featured_hero_v1(',
    "echo_require_admin_capability('publishing.publish')",
    'HOME_FEATURED_REASON_REQUIRED',
    "'manual_override'",
    "'set_home_featured_hero'",
    'security definer',
    "set search_path = ''",
    'from public, anon, authenticated, service_role',
    'to authenticated',
])

if migration:
    for pattern, label in [
        (r'\bcron\s*\.\s*schedule\b', 'agendamento pg_cron'),
        (r'\bcron\s*\.\s*job\b', 'edição de cron.job'),
        (r'\bautomation_enabled\s*=\s*true\b', 'ativação automática'),
        (r'\b(?:update|insert\s+into)\s+public\s*\.\s*site_pages\b', 'escrita no CMS legado'),
        (r'\brun_home_featured_rotation_v1\s*\(', 'execução do agendador'),
    ]:
        if re.search(pattern, migration, flags=re.IGNORECASE):
            failures.append(f'{MIGRATION.relative_to(ROOT)}: contém {label}')

    if migration.lower().count('security definer') < 3:
        failures.append('as três RPCs administrativas precisam permanecer security definer')
    if migration.lower().count("set search_path = ''") < 3:
        failures.append('as três RPCs administrativas precisam manter search_path vazio')
    if migration.count('public.echo_write_admin_audit(') != 2:
        failures.append('as duas mutações precisam registrar auditoria central')

fixture = require_text(FIXTURE, [
    '\\ir ../migrations/20260906034743_home_featured_rotation_phase_d.sql',
    '\\ir ../migrations/20260906041241_home_featured_rotation_admin_phase_e.sql',
    'privilégios das RPCs administrativas divergiram',
    'snapshot administrativo inicial divergiu',
    'salvamento idêntico não permaneceu idempotente',
    'HOME_FEATURED_REVISION_CONFLICT',
    'HOME_FEATURED_CURRENT_MUST_REMAIN_IN_QUEUE',
    'HOME_FEATURED_QUEUE_INVALID',
    'HOME_FEATURED_QUEUE_HAS_INELIGIBLE_HERO',
    'HOME_FEATURED_REASON_REQUIRED',
    'ADMIN_CAPABILITY_DENIED',
    "to_regnamespace('cron') is not null",
    'set role authenticated',
])

html = require_text(HTML, [
    'data-home-featured-admin-phase="F"',
    'name="robots" content="noindex,nofollow"',
    'Escolher destaque manual',
    'id="hf-publish-reason"',
    'id="hf-prepare-publish"',
    'Frequência e calendário',
    'value="daily"',
    'value="weekly"',
    'id="hf-timezone"',
    'id="hf-queue"',
    'id="hf-prepare-automation"',
    'Laboratório sem publicação',
    'id="hf-publish-review"',
    f'admin-shell.js?v={VERSION}',
    f'home-featured.js?v={HOME_VERSION}',
])

css = require_text(CSS, [
    '.hf-main-grid',
    '.hf-hero-option.is-selected',
    '.hf-hero-option.is-current',
    '.hf-automation-control',
    '.hf-review',
    '@media(max-width:760px)',
    '@media(pointer:coarse)',
    '@media(prefers-reduced-motion:reduce)',
    'min-height:44px',
    'font-size:16px',
])

controller = require_text(CONTROLLER, [
    "supabase.rpc('echo_admin_home_featured_rotation_v1')",
    "supabase.rpc('echo_admin_save_home_featured_plan_v1'",
    "supabase.rpc('echo_admin_set_home_featured_hero_v1'",
    'p_expected_revision: state.snapshot.config.revision',
    "error?.code === '40001'",
    'recoverConflict()',
    'beforeunload',
    'openReview()',
    'closeReview()',
    'homeFeaturedPlanChanged',
    'Fora da fila · adicione abaixo',
    'Salve ou descarte o planejamento antes de revisar uma troca manual.',
])
if controller and re.search(r'p_automation|automation_enabled\s*:', controller, re.IGNORECASE):
    failures.append('controller não pode enviar comando de ativação na etapa E')

require_text(MODEL, [
    'normalizeHomeFeaturedSnapshot',
    'moveHomeFeaturedQueue',
    'removeHomeFeaturedQueueHero',
    'validateHomeFeaturedPlan',
    'buildHomeFeaturedPlanRpcArgs',
    'p_expected_revision',
    'automationLocked',
])
require_text(TESTS, [
    'sem campo de ativação',
    'mantém automação bloqueada na etapa E',
    'não permite remover o destaque',
    'detecta alterações inclusive na ordem da fila',
])
require_text(SHELL, [
    "id:'home-featured'",
    "href:'./home-featured.html'",
    'Herói e planejamento da rotação',
])
require_text(ACCESS, ["'home-featured.html':'publishing'"])

workflow = require_text(WORKFLOW, [
    'node --test tests/home-featured-admin.test.mjs',
    'python3 scripts/check-home-featured-rotation-phase-e.py',
])
gitlab = require_text(GITLAB, [
    'home-featured-rotation-admin-database:',
    'supabase/tests/home_featured_rotation_phase_e_fixture.sql',
])
if gitlab and gitlab.count('- job: home-featured-rotation-admin-database') != 3:
    failures.append('.gitlab-ci.yml: fixture E deve bloquear preview, Brain e Pages')

for path in sorted((ROOT / 'admin').glob('*.html')):
    value = path.read_text(encoding='utf-8', errors='ignore')
    if 'admin-shell.js?v=' not in value:
        continue
    if f'admin-shell.js?v={VERSION}' not in value:
        failures.append(f'{path.relative_to(ROOT)}: cache do Admin Shell não acompanha a etapa E')

if html and re.search(r'>\s*0[1-9]\s*<', html):
    failures.append('a nova tela não deve usar numeração visual artificial de seções')

if failures:
    print(f'HOME FEATURED ROTATION PHASE E: FALHOU com {len(failures)} problema(s)')
    for failure in failures:
        print('-', failure)
    raise SystemExit(1)

print('HOME FEATURED ROTATION PHASE E: OK · autoridade, UI, auditoria, concorrência e automação bloqueada verificados.')
