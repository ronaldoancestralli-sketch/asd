#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []


def read(path):
    target = ROOT / path
    if not target.exists():
        errors.append(f'arquivo obrigatório ausente: {path}')
        return ''
    return target.read_text(encoding='utf-8')


migration = read('supabase/migrations/20260905115000_identity_institutional_scout_exclusion_v1.sql')
dossier = read('js/echo-profile-dossier-v15.js')
public_profile = read('js/profile-experience-v3.js')
author_identity = read('js/echo-author-identity.js')
own_profile = read('js/my-profile-v4.js')
own_authority = read('js/my-profile-authority-v10.js')
admin_lab = read('admin/js/identity-lab.js')
security_test = read('supabase/tests/identity_institutional_scout_exclusion_v1_security.sql')

for token in (
    'alter table public.echo_community_reputation',
    'alter table public.echo_community_specialty_stats',
    'add column if not exists scout_eligible boolean not null default true',
    'private.echo_is_scout_eligible_v1',
    'public.echo_founder_authority',
    'public.admin_staff_memberships',
    "lower(coalesce(p.role,''))='admin'",
    'revoke all on function private.echo_is_scout_eligible_v1(uuid) from public,anon,authenticated',
    'echo_community_reputation_scout_eligibility_v1',
    'echo_community_specialty_scout_eligibility_v1',
    'echo_research_institutional_scout_guard_v1',
    'institutional_accounts_do_not_join_scouts',
    'create or replace function public.echo_public_identity_cards_v1',
    'create or replace function public.echo_public_author_cards_v2',
    'create or replace function public.echo_public_profile_v1',
    "'scout_eligible',v_scout_eligible",
    'if not private.echo_is_scout_eligible_v1(v_uid) then return; end if',
    "'participation','institutional'",
):
    if token not in migration:
        errors.append(f'migração sem contrato institucional: {token}')

if migration.count('add column if not exists scout_eligible boolean not null default true') != 2:
    errors.append('scout_eligible deve existir exatamente nos dois snapshots comunitários')
for destructive in ('delete from public.echo_community_reputation', 'delete from public.echo_community_specialty_stats', 'truncate table', 'drop table'):
    if destructive in migration.lower():
        errors.append(f'migração não pode apagar histórico: {destructive}')

for token in (
    "const tier = !institutional",
    "'CONTRIBUIÇÃO' : 'TRILHA SCOUT'",
    'Institucional · fora da trilha Scout',
):
    if token not in dossier:
        errors.append(f'dossiê ainda mistura autoridade e Scout: {token}')

for token in (
    "const scoutEligible=!institutional",
    "progress.hidden=!scoutEligible",
    "history.hidden=!scoutEligible",
    "dataset.scoutParticipation=scoutEligible?'community':'institutional'",
):
    if token not in public_profile:
        errors.append(f'perfil público sem exclusão visual: {token}')

for token in (
    "if(authorityOf(card))return'none'",
    "data-echo-tier=\"${tier}\"",
    'Não participa da progressão comunitária.',
):
    if token not in author_identity:
        errors.append(f'cartão de autoria sem exclusão institucional: {token}')

for token in (
    "select('scout_eligible,community_tier,reputation_points",
    "reputation?.scout_eligible===false",
    "availability.institutional=true",
):
    if token not in own_profile:
        errors.append(f'Meu Perfil sem estado institucional: {token}')

for token in (
    'Este perfil não participa de pontos, ranks, missões ou especialidades comunitárias.',
    'Pontos, ranks, missões e especialidades comunitárias não se aplicam a esta identidade.',
):
    if token not in own_authority:
        errors.append(f'autoridade da conta sem explicação: {token}')

for token in (
    'user_id,scout_eligible,reputation_points',
    "rep?.scout_eligible===false",
    "['Participação Scout','Não participa']",
    "['Dados anteriores','Preservados · fora da progressão']",
):
    if token not in admin_lab:
        errors.append(f'laboratório administrativo sem estado institucional: {token}')

for token in (
    'private.echo_is_scout_eligible_v1',
    'echo_research_institutional_scout_guard_v1',
    'scout_eligible<>false',
    'institutional_accounts_do_not_join_scouts',
):
    if token not in security_test:
        errors.append(f'teste SQL sem cobertura: {token}')

if errors:
    print(f'INSTITUTIONAL SCOUT EXCLUSION: FALHOU com {len(errors)} problema(s)', file=sys.stderr)
    for error in errors:
        print('-', error, file=sys.stderr)
    raise SystemExit(1)

print('INSTITUTIONAL SCOUT EXCLUSION: OK · Founder/Admin fora da trilha, dados preservados e membros inalterados.')
