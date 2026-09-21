#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
MIG=ROOT/'supabase/migrations/20260825080000_identity_profile_experience_v3_shadow.sql'
SQL_TEST=ROOT/'supabase/tests/identity_profile_experience_v3_security.sql'
HTML=ROOT/'perfil.html'
CSS=ROOT/'css/profile-experience-v3.css'
JS=ROOT/'js/profile-experience-v3.js'
DOC=ROOT/'docs/IDENTITY_AND_REPUTATION.md'
LEDGER=ROOT/'docs/CHANGELOG_INTERNAL.jsonl'
WORKFLOW=ROOT/'.github/workflows/quality-gates.yml'
NAV_FILES=(ROOT/'js/public-navigation.js',ROOT/'js/module-public-shell-core.js',ROOT/'js/site-shell-core.js')
errors=[]

for path in (MIG,SQL_TEST,HTML,CSS,JS,DOC,LEDGER,WORKFLOW,*NAV_FILES):
    if not path.exists(): errors.append(f'arquivo ausente: {path.relative_to(ROOT)}')
if errors:
    print('\n'.join(errors)); sys.exit(1)

mig=MIG.read_text(encoding='utf-8').lower()
sql_test=SQL_TEST.read_text(encoding='utf-8').lower()
html=HTML.read_text(encoding='utf-8').lower()
css=CSS.read_text(encoding='utf-8').lower()
js=JS.read_text(encoding='utf-8').lower()
doc=DOC.read_text(encoding='utf-8').lower()
ledger=LEDGER.read_text(encoding='utf-8').lower()
workflow=WORKFLOW.read_text(encoding='utf-8').lower()

required_mig=(
    'create or replace function public.echo_public_profile_v1(p_handle text)',
    "'profile_experience_version','v3-shadow'",
    'public_identity_enabled=true',
    'public_profiles_enabled=true',
    'identity_cards_enabled=true',
    "c.status in ('corroborated','verified')",
    "'visual_identity'",
    "'frame_key'",
    "'institutional_role'",
    "'institutional_badges'",
)
for token in required_mig:
    if token not in mig: errors.append(f'migration V3 sem contrato: {token}')

if mig.count('create or replace function') != 1:
    errors.append('V3 deve redefinir somente a RPC pública já auditada; nova função detectada')
security_definer_declarations=sum(1 for line in mig.splitlines() if line.strip()=='security definer')
if security_definer_declarations != 1:
    errors.append(f'V3 deve conter exatamente uma declaração SECURITY DEFINER real; total={security_definer_declarations}')
for forbidden in ('create table ','alter table ','grant update ','grant insert ','grant delete '):
    if forbidden in mig: errors.append(f'V3 expandiu superfície estrutural sem necessidade: {forbidden.strip()}')
for forbidden in ('reputation_points','proof_code','evidence_reference','review_note'):
    if forbidden in mig: errors.append(f'perfil público V3 referencia dado proibido: {forbidden}')

for token in ('identity profile rollout is not fail-closed by default','public profile exposes ranking points','public history is not restricted to reviewed contributions'):
    if token not in sql_test: errors.append(f'teste SQL V3 sem cobertura: {token}')

for token in ('name="robots" content="noindex,nofollow"','data-profile-shadow="true"','profile-experience-v3.css?v=20260825-profile-v3-shadow-2','profile-experience-v3.js?v=20260905-institutional-scout-exclusion-v15-3','id="profile-personal-accent"'):
    if token not in html: errors.append(f'perfil.html sem proteção/versão Shadow: {token}')

for token in ('echo_identity_rollout_status_v1','echo_public_profile_v1','profile_experience_version','v3-shadow','frameallowlist','accentallowlist','renderpersonalaccent'):
    if token not in js: errors.append(f'runtime V3 incompleto: {token}')
for token in ('public_identity_enabled','public_profiles_enabled','identity_cards_enabled'):
    if token not in js: errors.append(f'runtime V3 não checa gate: {token}')

for token in (
    '.frame-authority-founder','.frame-authority-admin','.frame-authority-developer',
    '.frame-authority-moderator','.frame-authority-partner','.frame-authority-creator',
    '.frame-scout-echo_scout','.frame-scout-tracker','.frame-scout-cartographer',
    '.frame-scout-analyst','.frame-scout-vanguard','.frame-scout-arena_legend',
    '.profile-personal-accent.accent-violet','.profile-personal-accent.accent-cyan',
    '.profile-personal-accent.accent-gold','.profile-personal-accent.accent-emerald',
    '.profile-personal-accent.accent-rose','.profile-personal-accent.accent-steel'
):
    if token not in css: errors.append(f'hierarquia visual/acento ausente: {token}')

# Acento pessoal não pode controlar a moldura de autoridade/progressão.
if 'frame-${accent}' in js or 'frame-'+"accent" in js:
    errors.append('acento pessoal não pode selecionar moldura institucional/comunitária')

for nav in NAV_FILES:
    if 'perfil.html' in nav.read_text(encoding='utf-8').lower():
        errors.append(f'perfil Shadow entrou na navegação pública: {nav.relative_to(ROOT)}')

if 'profile experience v3' not in doc or 'moldura' not in doc or 'noindex' not in doc:
    errors.append('documentação V3 incompleta')
if '2026-08-25-profile-experience-v3-shadow' not in ledger:
    errors.append('ledger interno sem Profile Experience V3')
if 'python3 scripts/check-community-identity-v3.py' not in workflow:
    errors.append('Quality Gates não executam Profile Experience V3')

if errors:
    print('PROFILE EXPERIENCE V3: FALHOU')
    for error in errors: print('-',error)
    sys.exit(1)
print('PROFILE EXPERIENCE V3: OK · perfis Shadow, moldura de autoridade/tier separada do acento pessoal, sem dados sintéticos.')
