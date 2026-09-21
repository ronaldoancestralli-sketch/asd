#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
MIG=ROOT/'supabase/migrations/20260825093000_identity_reputation_quality_v2_shadow.sql'
DEDUPE_MIG=ROOT/'supabase/migrations/20260825094000_identity_reputation_knowledge_dedupe_v2_shadow.sql'
FIRST_MIG=ROOT/'supabase/migrations/20260825095000_identity_first_discovery_integrity_v2_shadow.sql'
SPECIALTY_MIG=ROOT/'supabase/migrations/20260825097000_identity_community_specialties_v1_shadow.sql'
SQL_TEST=ROOT/'supabase/tests/identity_reputation_quality_v2_security.sql'
DEDUPE_TEST=ROOT/'supabase/tests/identity_reputation_knowledge_dedupe_v2_security.sql'
FIRST_TEST=ROOT/'supabase/tests/identity_first_discovery_integrity_v2_security.sql'
SPECIALTY_TEST=ROOT/'supabase/tests/identity_community_specialties_v1_security.sql'
HTML=ROOT/'meu-perfil.html'
JS=ROOT/'js/my-profile-v4.js'
SPECIALTY_JS=ROOT/'js/my-profile-specialties-v4.js'
CSS=ROOT/'css/my-profile-reputation-v4.css'
SPECIALTY_CSS=ROOT/'css/my-profile-specialties-v4.css'
DOC=ROOT/'docs/REPUTATION_QUALITY_V2.md'
LEDGER=ROOT/'docs/CHANGELOG_INTERNAL.jsonl'
WORKFLOW=ROOT/'.github/workflows/quality-gates.yml'
errors=[]

for path in (MIG,DEDUPE_MIG,FIRST_MIG,SPECIALTY_MIG,SQL_TEST,DEDUPE_TEST,FIRST_TEST,SPECIALTY_TEST,HTML,JS,SPECIALTY_JS,CSS,SPECIALTY_CSS,DOC,LEDGER,WORKFLOW):
    if not path.exists(): errors.append(f'arquivo ausente: {path.relative_to(ROOT)}')
if errors:
    print('\n'.join(errors)); sys.exit(1)

mig=MIG.read_text(encoding='utf-8').lower()
dedupe=DEDUPE_MIG.read_text(encoding='utf-8').lower()
first=FIRST_MIG.read_text(encoding='utf-8').lower()
specialty=SPECIALTY_MIG.read_text(encoding='utf-8').lower()
test=SQL_TEST.read_text(encoding='utf-8').lower()
dedupe_test=DEDUPE_TEST.read_text(encoding='utf-8').lower()
first_test=FIRST_TEST.read_text(encoding='utf-8').lower()
specialty_test=SPECIALTY_TEST.read_text(encoding='utf-8').lower()
html=HTML.read_text(encoding='utf-8').lower()
js=JS.read_text(encoding='utf-8').lower()
specialty_js=SPECIALTY_JS.read_text(encoding='utf-8').lower()
css=CSS.read_text(encoding='utf-8').lower()
specialty_css=SPECIALTY_CSS.read_text(encoding='utf-8').lower()
doc=DOC.read_text(encoding='utf-8').lower()
ledger=LEDGER.read_text(encoding='utf-8').lower()
workflow=WORKFLOW.read_text(encoding='utf-8').lower()

for token in (
    'create table if not exists public.echo_reputation_policy_meta',
    'create table if not exists public.echo_reputation_tier_rules',
    "values(true,'quality-v2',10,4,15,now())",
    "('quality-v2','echo_scout',1,'echo scout',30,3,0,0)",
    "('quality-v2','tracker',2,'rastreador',120,10,0,0.6000)",
    "('quality-v2','cartographer',3,'cartógrafo',350,25,0,0.7000)",
    "('quality-v2','analyst',4,'analista',900,60,0,0.7500)",
    "('quality-v2','vanguard',5,'vanguarda',2500,150,0,0.8000)",
    "('quality-v2','arena_legend',6,'lenda da arena',8000,400,10,0.8500)",
    'add column if not exists accepted_count',
    'add column if not exists decided_count',
    "add column if not exists policy_version text not null default 'quality-v2'",
    'create or replace function public.echo_recompute_community_reputation(p_user_id uuid)',
    'v_points:=v_verified*v_verified_points + v_corroborated*v_corroborated_points + v_first*v_first_bonus',
    "status in ('verified','corroborated','rejected','contested')",
    'v_rate>=r.min_acceptance_rate',
    'order by r.ordinal desc',
    'grant select on table public.echo_reputation_policy_meta to authenticated',
    'grant select on table public.echo_reputation_tier_rules to authenticated',
    'revoke all on function public.echo_recompute_community_reputation(uuid) from public,anon,authenticated,service_role',
):
    if token not in mig: errors.append(f'migration Reputation V2 sem contrato: {token}')

for forbidden in (
    'grant insert on table public.echo_reputation_policy_meta to authenticated',
    'grant update on table public.echo_reputation_policy_meta to authenticated',
    'grant delete on table public.echo_reputation_policy_meta to authenticated',
    'grant insert on table public.echo_reputation_tier_rules to authenticated',
    'grant update on table public.echo_reputation_tier_rules to authenticated',
    'grant delete on table public.echo_reputation_tier_rules to authenticated',
):
    if forbidden in mig: errors.append(f'cliente ganhou escrita na política: {forbidden}')

for token in (
    'create or replace function public.echo_research_normalize_subject_v1',
    "'[[:space:]]+[-–—|]+[[:space:]]+'",
    "public.echo_research_normalize_subject_v1(p_subject_key)",
    'create or replace function public.echo_research_knowledge_fingerprint_v1',
    'add column if not exists knowledge_fingerprint text',
    'alter column knowledge_fingerprint set not null',
    'echo_research_knowledge_fingerprint_idx',
    'create or replace function public.echo_research_set_knowledge_fingerprint_v1()',
    'create trigger echo_research_set_knowledge_fingerprint',
    'group by c.knowledge_fingerprint',
    "bool_or(c.status='verified')",
    "bool_or(c.status='corroborated')",
    "when has_verified then 'verified'",
    "when has_corroborated then 'corroborated'",
    'preservando pontuação que pode alterar valores numéricos',
    'múltiplas evidências do mesmo fato não empilham pontos',
):
    if token not in dedupe: errors.append(f'Knowledge Dedupe V2 sem contrato: {token}')
if "'[[:space:][:punct:]]+'" in dedupe:
    errors.append('normalização agressiva de pontuação reapareceu no knowledge fingerprint')
if 'submission_fingerprint' in dedupe.split('create or replace function public.echo_recompute_community_reputation',1)[-1]:
    errors.append('recompute final usa submission_fingerprint em vez de knowledge_fingerprint')

for token in (
    'duplicate_first_discovery_requires_review',
    'group by c.knowledge_fingerprint',
    'having count(*)>1',
    'create unique index if not exists echo_research_first_discovery_knowledge_unique',
    'on public.echo_research_contributions(knowledge_fingerprint)',
    "where status='verified' and is_first_discovery=true",
    'drop index if exists public.echo_research_first_discovery_unique',
    'create or replace function public.admin_review_research_contribution_v1',
    'first_discovery_requires_verified',
    'first_discovery_knowledge_missing',
    'pg_catalog.pg_advisory_xact_lock',
    'pg_catalog.hashtextextended(v_row.knowledge_fingerprint,0)',
    'first_discovery_already_claimed',
    'c.knowledge_fingerprint=v_row.knowledge_fingerprint',
    "grant execute on function public.admin_review_research_contribution_v1(uuid,text,text,boolean) to authenticated,service_role",
):
    if token not in first: errors.append(f'First Discovery Integrity V2 sem contrato: {token}')

for token in (
    'create table if not exists public.echo_community_specialty_catalog',
    'create table if not exists public.echo_community_specialty_rules',
    'create table if not exists public.echo_community_specialty_stats',
    "'hero_research','pesquisa de heróis'",
    "'arsenal','arsenal'",
    "'patch_hunter','caçador de patch'",
    "'counter_research','counter research'",
    "'specialty-v1-shadow','hero_research','specialist'",
    "'specialty-v1-shadow','patch_hunter','master'",
    "'specialty-v1-shadow','counter_research','master'",
    "c.contribution_type in ('hero_skill_level','hero_passive')",
    "c.contribution_type='equipment_stat'",
    "c.contribution_type='patch_change'",
    "c.contribution_type='counter_evidence'",
    'group by specialty_key,knowledge_fingerprint',
    'reviewed_by is distinct from contributor_id',
    'delete from public.echo_community_specialty_stats s where s.user_id=p_user_id',
    'grant select on table public.echo_community_specialty_catalog to authenticated',
    'grant select on table public.echo_community_specialty_rules to authenticated',
    'grant select on table public.echo_community_specialty_stats to authenticated',
    'user_id=(select auth.uid()) or (select public.echo_is_admin())',
    'revoke all on function public.echo_recompute_community_reputation(uuid) from public,anon,authenticated,service_role',
):
    if token not in specialty: errors.append(f'Community Specialties V1 sem contrato: {token}')
for forbidden in (
    'grant insert on table public.echo_community_specialty_stats to authenticated',
    'grant update on table public.echo_community_specialty_stats to authenticated',
    'grant delete on table public.echo_community_specialty_stats to authenticated',
    'grant insert on table public.echo_community_specialty_rules to authenticated',
    'grant update on table public.echo_community_specialty_rules to authenticated',
):
    if forbidden in specialty: errors.append(f'cliente ganhou escrita em especialidade: {forbidden}')

for token in (
    'reputation policy weights mismatch','tracker quality rule mismatch','cartographer quality rule mismatch',
    'analyst quality rule mismatch','vanguard quality rule mismatch','arena_legend quality rule mismatch',
    'authenticated can mutate reputation policy','shadow reputation policy leaked to anon',
    'reputation recompute is not policy-driven','client can invoke private reputation recompute directly',
):
    if token not in test: errors.append(f'teste SQL Reputation V2 sem cobertura: {token}')
for token in (
    'knowledge normalization does not collapse harmless formatting variants',
    'knowledge normalization collapsed different levels',
    'knowledge normalization collapsed decimal and integer values',
    'knowledge normalization collapsed signed numeric values',
    'knowledge normalizer modified semantic numeric punctuation',
    'client can invoke private knowledge normalization helpers',
    'knowledge fingerprint column missing or nullable',
    'knowledge fingerprint maintenance trigger missing',
    'reputation does not dedupe by knowledge fingerprint',
    'reputation incorrectly dedupes by evidence fingerprint instead of knowledge',
):
    if token not in dedupe_test: errors.append(f'teste SQL Knowledge Dedupe sem cobertura: {token}')
for token in (
    'first discovery canonical unique index missing or incomplete',
    'legacy textual first discovery unique index still active',
    'research review rpc lost first discovery integrity guards',
    'research review rpc expected execution grants missing',
    'anon can execute research review rpc',
):
    if token not in first_test: errors.append(f'teste SQL First Discovery sem cobertura: {token}')
for token in (
    'specialty catalog count mismatch','specialty rank rule count mismatch',
    'authenticated cannot read specialty transparency tables','authenticated can mutate specialty state',
    'shadow specialties leaked to anon','specialty contribution mapping missing',
    'specialty reputation does not dedupe by knowledge','specialty reputation lost independent review guard',
    'client can invoke specialty/general reputation recompute directly',
):
    if token not in specialty_test: errors.append(f'teste SQL Specialty V1 sem cobertura: {token}')

for token in (
    'my-profile-reputation-v4.css?v=20260825-reputation-shadow-2',
    'my-profile-specialties-v4.css?v=20260825-specialties-shadow-1',
    'my-profile-specialties-v4.js?v=',
    'my-profile-v4.js?v=20260905-institutional-scout-exclusion-v15-3',
    'id="my-scout-points"','id="my-scout-acceptance"','id="my-reputation-policy-version"',
    'id="my-reputation-points"','id="my-reputation-rules"','id="my-reputation-formula"','id="my-reputation-current"',
):
    if token not in html: errors.append(f'Meu Perfil sem transparência Reputation V2/Specialties: {token}')

for forbidden in ('<td>30</td>','<td>120</td>','<td>350</td>','<td>900</td>','<td>2.500</td>','<td>8.000</td>'):
    if forbidden in html: errors.append(f'threshold duplicado/hardcoded no HTML: {forbidden}')

for token in (
    "from('echo_reputation_policy_meta')",
    "from('echo_reputation_tier_rules')",
    "select('scout_eligible,community_tier,reputation_points,verified_count,corroborated_count,first_discoveries,acceptance_rate,accepted_count,decided_count,policy_version')",
    'renderreputationpolicy','normalizedpolicyrules','min_acceptance_rate','accepted_count','decided_count','policy_version',
    'os requisitos exatos dependem da política versionada do servidor',
    'nenhum threshold será inventado pelo cliente',
    'reputationunavailable','badgesunavailable',
    'nenhum nível ou progresso foi presumido','nenhuma ausência foi presumida',
):
    if token not in js: errors.append(f'runtime não deriva Reputation V2 do servidor: {token}')

for token in (
    "from('echo_community_specialty_catalog')",
    "from('echo_community_specialty_stats')",
    "from('echo_community_specialty_rules')",
    "eq('user_id',userid)",
    "eq('policy_version','specialty-v1-shadow')",
    'especialidades conquistadas','especialidade vem de conhecimento revisado naquela área',
    'rank-order','nexT'.lower(),'renderunavailable',
    'nenhuma ausência, rank ou progresso foi presumido','load().catch(renderunavailable)',
):
    if token not in specialty_js: errors.append(f'runtime de especialidades incompleto: {token}')
for forbidden in (
    'min_points:120','min_verified:10','min_acceptance_rate:0.65','insert(','update(','delete(',
    'if(catalogresult.error||statsresult.error||rulesresult.error)return','load().catch(()=>{})'
):
    if forbidden in specialty_js: errors.append(f'cliente de especialidades contém regra/escrita indevida ou falha silenciosa: {forbidden}')

for token in ('.my-reputation-current','.my-reputation-loading','tr.current-rule'):
    if token not in css: errors.append(f'CSS Reputation V2 sem estado: {token}')
for token in ('.my-specialties-grid','.my-specialty-card.rank-specialist','.my-specialty-card.rank-reference','.my-specialty-card.rank-master','.my-specialty-next'):
    if token not in specialty_css: errors.append(f'CSS Specialty V1 sem estado: {token}')

for token in (
    'reputation quality v2','quality-v2','+10','+4','+15','60%','70%','75%','80%','85%',
    'superseded','knowledge_fingerprint','mesmo conhecimento','submission_fingerprint','não concede autoridade',
    'primeira descoberta: uma só por conhecimento','first_discovery_already_claimed','duplicate_first_discovery_requires_review',
    'especialidades conquistadas','pesquisa de heróis','caçador de patch','counter research','especialista','referência','mestre','specialty-v1-shadow'
):
    if token not in doc: errors.append(f'especificação Reputation V2/Specialties incompleta: {token}')
if '2026-08-25-reputation-quality-v2-shadow' not in ledger:
    errors.append('ledger interno sem Reputation Quality V2')
if '2026-08-25-reputation-knowledge-dedupe-v2-shadow' not in ledger:
    errors.append('ledger interno sem Knowledge Dedupe V2')
if '2026-08-25-first-discovery-integrity-v2-shadow' not in ledger:
    errors.append('ledger interno sem First Discovery Integrity V2')
if '2026-08-25-review-independence-v2-shadow' not in ledger:
    errors.append('ledger interno sem Review Independence V2')
if '2026-08-25-community-specialties-v1-shadow' not in ledger:
    errors.append('ledger interno sem Community Specialties V1')
if 'python3 scripts/check-community-reputation-v2.py' not in workflow:
    errors.append('Quality Gates não executam Reputation Quality V2')

if errors:
    print('REPUTATION QUALITY V2: FALHOU')
    for error in errors: print('-',error)
    sys.exit(1)
print('REPUTATION QUALITY V2: OK · política server-driven, knowledge-deduped, revisão independente e especialidades conquistadas por área.')
