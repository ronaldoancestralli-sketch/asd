#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/migrations/20260906131109_home_featured_rotation_activation_phase_f.sql'
FIXTURE = ROOT / 'supabase/tests/home_featured_rotation_phase_f_fixture.sql'
INDEX = ROOT / 'index.html'
APP = ROOT / 'js/app.js'
AUTHORITY = ROOT / 'js/home-featured-authority.mjs'
SPOTLIGHT_CSS = ROOT / 'css/home-featured-spotlight.css'
BUILD_HTML = ROOT / 'criar-build.html'
BUILD_ENTRY = ROOT / 'js/criar-build-entry.js'
BUILD_CONTROLLER = ROOT / 'js/criar-build.js'
BUILD_ROUTE = ROOT / 'js/criar-build-route.mjs'
HOME_SELECTION_TESTS = ROOT / 'tests/home-hero-selection.test.mjs'
ADMIN_HTML = ROOT / 'admin/home-featured.html'
ADMIN_CSS = ROOT / 'admin/css/home-featured.css'
ADMIN_CONTROLLER = ROOT / 'admin/js/home-featured.js'
ADMIN_MODEL = ROOT / 'admin/js/home-featured-rotation-model.mjs'
ADMIN_TESTS = ROOT / 'tests/home-featured-admin.test.mjs'
AUTHORITY_TESTS = ROOT / 'tests/home-featured-authority.test.mjs'
WORKFLOW = ROOT / '.github/workflows/quality-gates.yml'
GITLAB = ROOT / '.gitlab-ci.yml'
VERSION = '20260906-home-featured-phase-f-1'

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
    'create or replace function private.home_featured_next_preview_v1(',
    "'mutates_state', false",
    'create or replace function public.echo_admin_preview_home_featured_rotation_v1()',
    "echo_require_admin_capability('publishing.view')",
    'create or replace function public.echo_admin_set_home_featured_automation_v1(',
    "echo_require_admin_capability('publishing.publish')",
    'HOME_FEATURED_REVISION_CONFLICT',
    "'resumed'",
    "'paused'",
    "'enable_home_featured_rotation'",
    "'pause_home_featured_rotation'",
    "'automation_available', true",
    "'echo-home-featured-rotation-1m'",
    "'* * * * *'",
    'private.run_home_featured_rotation_v1(pg_catalog.clock_timestamp())',
    'cron.schedule(',
    'security definer',
    "set search_path = ''",
    'from public, anon, authenticated, service_role',
    'to authenticated',
])
if migration:
    if len(re.findall(r'\bselect\s+cron\.schedule\s*\(', migration, flags=re.IGNORECASE)) != 1:
        failures.append('a migration deve possuir exatamente um upsert nomeado no Cron')
    for pattern, label in [
        (r'https?://', 'endpoint externo'),
        (r'\bservice_role\b[^;]*(?:grant|execute)', 'execução concedida a service_role'),
        (r'\b(?:update|insert\s+into)\s+public\s*\.\s*site_pages\b', 'escrita no CMS legado'),
    ]:
        if re.search(pattern, migration, flags=re.IGNORECASE | re.DOTALL):
            failures.append(f'{MIGRATION.relative_to(ROOT)}: contém {label}')

require_text(FIXTURE, [
    '\\ir home_featured_rotation_phase_e_fixture.sql',
    '\\ir ../migrations/20260906131109_home_featured_rotation_activation_phase_f.sql',
    'prévia sem mutação divergiu',
    'ativação automática divergiu',
    'ativação repetida não permaneceu idempotente',
    'virada do período seguinte divergiu',
    'pausa automática divergiu',
    'revisão obsoleta de ativação foi aceita',
    'ativação sem capacidade foi aceita',
    'prévia sem capacidade foi aceita',
    'worker único do destaque não foi instalado corretamente',
    'reagendamento pelo mesmo nome duplicou o worker',
    'home_featured_rotation_phase_f_fixture_ok',
])

index = require_text(INDEX, [
    'data-featured-mode="explore"',
    'class="hero-featured-atmosphere"',
    'id="hero-featured-seal"',
    'id="hero-featured-seal-label"',
    'id="hero-preview-banner"',
    f'home-featured-spotlight.css?v=20260907-royal-3',
    'home=20260906-f1',
])
if index and '>01<' in index[index.find('hero-stage'):index.find('intel-pulse')]:
    failures.append('a área principal não deve ganhar numeração visual artificial')

app = require_text(APP, [
    "from './home-featured-authority.mjs?v=20260906-f1'",
    'loadHomeFeaturedAuthority()',
    'state.featuredAuthority.source',
    'homeFeaturedPresentation({ isFeatured: snapshot.isFeatured',
    "dataset.featuredMode = presentation.mode",
    "seal.hidden = !snapshot.isFeatured",
    'heroSelection.snapshot().featuredHeroId',
])
if app and re.search(r'setFeaturedHero\(state\.cmsContent\.featured_hero_id', app):
    failures.append('app.js não pode restabelecer diretamente a autoridade legada do CMS')

authority = require_text(AUTHORITY, [
    "client.rpc('echo_home_featured_state_v1')",
    "client.rpc('echo_admin_preview_home_featured_rotation_v1')",
    "get('previewDestaque') === 'proximo'",
    "source: 'admin-preview'",
    "source: 'canonical'",
    "source: 'fallback'",
    "'Herói em destaque'",
    "eyebrow: 'Explorar heróis'",
    "'Destaque da Arena'",
])
if authority:
    for forbidden in ['get(\'heroi\')', 'get("heroi")', 'previewDestaqueId']:
        if forbidden in authority:
            failures.append('a URL de prévia não pode escolher livremente a identidade do destaque')

require_text(BUILD_ROUTE, [
    'export function parseCreateBuildEntry',
    'export function resolveCreateBuildEntry',
    "params.get('nova') === '1'",
    "params.get('heroi')",
    'allowsDraft: !isNew',
    'missingRequestedHero',
])
require_text(BUILD_CONTROLLER, [
    "from './criar-build-route.mjs?v=20260906-home-featured-route-f2-1'",
    'resolveCreateBuildEntry(location.search, CONFIG.herois)',
    'CONFIG.heroi = configurarHeroiDaBuild(buildEntryRoute.hero)',
    '!buildEntryRoute.allowsDraft',
])
require_text(BUILD_ENTRY, [
    "criar-build.js?v=20260906-home-featured-route-f2-1",
])
require_text(BUILD_HTML, [
    "criar-build-entry.js?v=20260906-home-featured-route-f2-1",
])
require_text(HOME_SELECTION_TESTS, [
    'the workbench resolves the explicit hero route after the real catalog loads',
    'a new workbench never restores an old draft when the requested hero is unavailable',
])

css = require_text(SPOTLIGHT_CSS, [
    '#hero-stage[data-is-featured="true"] .hero-featured-atmosphere',
    '#hero-stage[data-is-featured="true"] .hero-name',
    '#hero-stage[data-is-featured="true"] .spot-media',
    '.hero-featured-seal',
    '.hero-preview-banner',
    '@media(max-width:840px)',
    '@media(max-width:560px)',
    '@media(prefers-reduced-motion:reduce)',
])
if css and re.search(r'#hero-stage(?!\[data-is-featured="true"\])[^\n{]*\.hero-name', css):
    failures.append('o tratamento premium do nome precisa permanecer condicionado ao destaque')

require_text(ADMIN_HTML, [
    'data-home-featured-admin-phase="F"',
    'id="hf-automation-reason"',
    'id="hf-prepare-automation"',
    'id="hf-open-preview"',
    '?previewDestaque=proximo',
    'Laboratório sem publicação',
    'id="hf-automation-review"',
    f'home-featured.css?v={VERSION}',
    f'home-featured.js?v={VERSION}',
])
require_text(ADMIN_CSS, [
    '.hf-automation-control',
    '.hf-automation-control.is-active',
    '.hf-preview-control',
    '.hf-review',
    '@media(max-width:520px)',
    '@media(pointer:coarse)',
])
require_text(ADMIN_CONTROLLER, [
    'buildHomeFeaturedAutomationRpcArgs',
    "supabase.rpc('echo_admin_set_home_featured_automation_v1'",
    'openAutomationReview()',
    'closeAutomationReview()',
    'state.snapshot.worker.active',
    'Pause a rotação para editar frequência, calendário ou fila.',
])
require_text(ADMIN_MODEL, [
    'previewSource',
    'workerSource',
    'buildHomeFeaturedAutomationRpcArgs',
    'p_expected_revision',
    'automationLocked: snapshot.automationAvailable !== true',
])
require_text(ADMIN_TESTS, [
    'libera automação na etapa F',
    'monta ativação com revisão otimista e motivo auditável',
])
require_text(AUTHORITY_TESTS, [
    'autoridade canônica prevalece',
    'estado canônico vazio não ressuscita',
    'prévia administrativa usa somente o próximo herói',
    'falha de permissão da prévia retorna ao estado canônico',
])

require_text(WORKFLOW, [
    'tests/home-featured-authority.test.mjs',
    'python3 scripts/check-home-featured-rotation-phase-f.py',
])
gitlab = require_text(GITLAB, [
    'home-featured-rotation-activation-database:',
    'supabase/tests/home_featured_rotation_phase_f_fixture.sql',
])
if gitlab and gitlab.count('- job: home-featured-rotation-activation-database') != 3:
    failures.append('.gitlab-ci.yml: fixture F deve bloquear preview, Brain e Pages')

if failures:
    print(f'HOME FEATURED ROTATION PHASE F: FALHOU com {len(failures)} problema(s)')
    for failure in failures:
        print('-', failure)
    raise SystemExit(1)

print('HOME FEATURED ROTATION PHASE F: OK · prévia sem mutação, ativação, Cron, autoridade pública e destaque visual verificados.')
