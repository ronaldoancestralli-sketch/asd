#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / 'meu-perfil.html'
CSS = ROOT / 'css/my-profile-v4.css'
RESEARCH_CSS = ROOT / 'css/my-profile-research-v4.css'
JS = ROOT / 'js/my-profile-v4.js'
DOC = ROOT / 'docs/IDENTITY_AND_REPUTATION.md'
LEDGER = ROOT / 'docs/CHANGELOG_INTERNAL.jsonl'
WORKFLOW = ROOT / '.github/workflows/quality-gates.yml'
GITLAB_CI = ROOT / '.gitlab-ci.yml'
RESEARCH_BASE_MIG = ROOT / 'supabase/migrations/20260825054000_community_identity_and_echo_scouts_v1.sql'
RESEARCH_INTEGRITY_MIG = ROOT / 'supabase/migrations/20260825062000_identity_integrity_v2_shadow.sql'
RESEARCH_REFERENCE_MIG = ROOT / 'supabase/migrations/20260825098000_identity_research_reference_integrity_v4_shadow.sql'
CREATOR_MIG = ROOT / 'supabase/migrations/20260825090000_identity_creator_url_hardening_v4_shadow.sql'
CREATOR_GRANT_MIG = ROOT / 'supabase/migrations/20260825091000_identity_creator_grant_guard_v4_shadow.sql'
PUBLIC_NAME_MIG = ROOT / 'supabase/migrations/20260825092000_identity_public_name_privacy_v4_shadow.sql'
CREATOR_SQL_TEST = ROOT / 'supabase/tests/identity_creator_url_hardening_v4_security.sql'
PUBLIC_NAME_SQL_TEST = ROOT / 'supabase/tests/identity_public_name_privacy_v4_security.sql'
RESEARCH_REFERENCE_TEST = ROOT / 'supabase/tests/identity_research_reference_integrity_v4_security.sql'
ADMIN_LAB = ROOT / 'admin/identity-lab.html'
ADMIN_JS = ROOT / 'admin/js/identity-lab.js'
PUBLIC_NAV = ROOT / 'js/public-navigation.js'
AUTH_SHELLS = (ROOT/'js/module-public-shell-core.js', ROOT/'js/site-shell-core.js')
NAV_FILES = (PUBLIC_NAV, *AUTH_SHELLS)
errors = []

for path in (HTML,CSS,RESEARCH_CSS,JS,DOC,LEDGER,WORKFLOW,GITLAB_CI,RESEARCH_BASE_MIG,RESEARCH_INTEGRITY_MIG,RESEARCH_REFERENCE_MIG,CREATOR_MIG,CREATOR_GRANT_MIG,PUBLIC_NAME_MIG,CREATOR_SQL_TEST,PUBLIC_NAME_SQL_TEST,RESEARCH_REFERENCE_TEST,ADMIN_LAB,ADMIN_JS,*NAV_FILES):
    if not path.exists(): errors.append(f'arquivo ausente: {path.relative_to(ROOT)}')
if errors:
    print('\n'.join(errors)); sys.exit(1)

html = HTML.read_text(encoding='utf-8').lower()
css = CSS.read_text(encoding='utf-8').lower()
research_css = RESEARCH_CSS.read_text(encoding='utf-8').lower()
js = JS.read_text(encoding='utf-8').lower()
doc = DOC.read_text(encoding='utf-8').lower()
ledger = LEDGER.read_text(encoding='utf-8').lower()
workflow = WORKFLOW.read_text(encoding='utf-8').lower()
gitlab_ci = GITLAB_CI.read_text(encoding='utf-8').lower()
research_base = RESEARCH_BASE_MIG.read_text(encoding='utf-8').lower()
research_integrity = RESEARCH_INTEGRITY_MIG.read_text(encoding='utf-8').lower()
research_reference = RESEARCH_REFERENCE_MIG.read_text(encoding='utf-8').lower()
creator_mig = CREATOR_MIG.read_text(encoding='utf-8').lower()
creator_grant_mig = CREATOR_GRANT_MIG.read_text(encoding='utf-8').lower()
public_name_mig = PUBLIC_NAME_MIG.read_text(encoding='utf-8').lower()
creator_test = CREATOR_SQL_TEST.read_text(encoding='utf-8').lower()
public_name_test = PUBLIC_NAME_SQL_TEST.read_text(encoding='utf-8').lower()
research_reference_test = RESEARCH_REFERENCE_TEST.read_text(encoding='utf-8').lower()
admin_lab = ADMIN_LAB.read_text(encoding='utf-8').lower()
admin_js = ADMIN_JS.read_text(encoding='utf-8').lower()

for token in (
    'name="robots" content="noindex,nofollow"',
    'data-my-profile-shadow="true"',
    'my-profile-v4.css?v=20260825-my-profile-v4-shadow-4',
    'my-profile-research-v4.css?v=20260825-research-shadow-2',
    'my-profile-v4.js?v=20260905-institutional-scout-exclusion-v15-3',
    'echo scouts',
    'creator verification',
    'mensagens privadas ainda não estão disponíveis',
    'e-mail e nomes reservados',
    'minhas contribuições',
    'todo envio nasce <b>pendente</b>',
    'enviar informação não gera ponto',
    'id="my-scout-track"',
    'id="my-contributions"',
    'id="research-form"',
    'id="research-locked"',
    'id="research-catalog-context"',
    'id="research-hero"',
    'id="research-skill"',
    'id="research-skill-level"',
    'id="research-catalog-status"',
    'o assunto será montado a partir do catálogo e confirmado novamente pelo servidor',
):
    if token not in html: errors.append(f'meu-perfil.html sem contrato V4: {token}')

if 'id="my-profile-preview-link" class="my-profile-preview" hidden aria-disabled="true"' not in html:
    errors.append('link de preview deve nascer inerte e sem href')
if 'id="my-profile-preview-link" class="my-profile-preview" href=' in html:
    errors.append('link de preview não pode nascer com destino antes da validação')

for token in (
    'supabase.auth.getuser()',
    "supabase.rpc('echo_identity_rollout_status_v1')",
    "supabase.rpc('echo_set_my_public_identity_v1'",
    'p_allow_messages:false',
    'generated_handle_re',
    'email_like_re',
    'tier_order',
    'renderscouttrack',
    'loadcontributions',
    'researchrolloutready',
    'configureresearchcenter',
    'submitresearchcontribution',
    'publicrolloutready',
    'creatorrolloutready',
    "supabase.rpc('echo_request_creator_verification_v1'",
    "supabase.rpc('echo_submit_research_contribution_v1'",
    "from('echo_community_reputation')",
    "from('echo_identity_badges')",
    "from('echo_creator_claims')",
    "from('echo_research_contributions')",
    ".select('id,contribution_type,subject_key,game_version,status,is_first_discovery,submitted_at,reviewed_at')",
    ".eq('contributor_id',currentuserid)",
    "from('heroes')",
    "from('hero_skills')",
    "select('id,hero_id,name,max_level,enabled,display_order')",
    'researchcatalogready',
    'loadresearchcatalog',
    'configureresearchstructure',
    'resolveresearchreferences',
    'updateresearchcanonicalsubject',
    'p_payload:payload',
    'p_hero_id:references.heroid',
    'p_skill_id:references.skillid',
    'skill_level:references.skilllevel',
    'p_evidence_reference:evidencereference || null',
    "link.removeattribute('href')",
    'creator_channel_platform_mismatch',
    'display_name_email_not_allowed',
    'research_skill_hero_mismatch',
    'research_skill_level_out_of_range',
    'email_like_re.test(legacydisplay)',
    "$('profile-display-input').value = email_like_re.test(legacydisplay) ? '' : legacydisplay",
):
    if token not in js: errors.append(f'runtime V4 incompleto: {token}')

for forbidden in (
    'user.email',
    '.select(\'email',
    'admin_set_identity_badge_v1',
    'echo_set_founder_server_only',
    'grant execute',
    'service_role',
    "link.href = canopen ?",
    'review_note',
    ".select('payload",
    ".select('evidence_reference",
    'p_hero_id:null',
    'p_skill_id:null',
):
    if forbidden in js: errors.append(f'runtime V4 contém capacidade/dado proibido ou regressão: {forbidden}')

if 'publicradio.disabled = !ready' not in js:
    errors.append('V4 não desabilita a opção pública quando gates não estão prontos')
if "p_visibility:visibility" not in js:
    errors.append('V4 não envia visibilidade pelo RPC próprio')
if "const visibility = publicrolloutready() ? selectedvisibility() : 'private'" not in js:
    errors.append('V4 não força private no cliente enquanto rollout público estiver bloqueado')
if 'generated_handle_re.test' not in js or "? ''" not in js:
    errors.append('V4 pode expor handle técnico player-* como apelido escolhido')

for token in (
    '.my-profile-section', '.my-profile-stats', '.my-profile-badge', '.creator-form',
    '.creator-claim', '.creator-proof', '.creator-status.verified', '.my-scout-track',
    '.my-scout-step.current', '.my-contribution', '.my-contribution-status.verified', '.my-contribution-first'
):
    if token not in css: errors.append(f'CSS V4 sem componente: {token}')
for token in ('.research-form','.research-grid','.research-actions','.my-contribution-history-head','.research-form select','.research-catalog-status','.research-level-context'):
    if token not in research_css: errors.append(f'CSS Echo Research sem componente: {token}')

for token in (
    'echo_research_contributions_self_or_admin',
    'contributor_id=(select auth.uid()) or (select public.echo_is_admin())',
    'grant select on table public.echo_research_contributions to authenticated',
):
    if token not in research_base: errors.append(f'contrato RLS da timeline privada ausente: {token}')

for token in (
    'research_submission_enabled boolean not null default false',
    'research_submission_rollout_disabled',
    'duplicate_research_submission',
    'research_submission_rate_limited',
    'echo_research_submission_fingerprint',
    'pg_catalog.pg_advisory_xact_lock',
    "v_fingerprint,'pending',false",
):
    if token not in research_integrity: errors.append(f'hardening do Echo Research ausente: {token}')

for token in (
    'create or replace function public.echo_submit_research_contribution_v1',
    'invalid_research_hero',
    'invalid_research_skill',
    'research_skill_requires_hero',
    'research_skill_hero_mismatch',
    'hero_skill_reference_required',
    'hero_reference_required',
    'passive_skill_reference_not_allowed',
    'research_skill_level_required',
    'research_skill_level_out_of_range',
    'research_skill_level_catalog_missing',
    'h.id=p_hero_id and h.enabled=true',
    's.id=p_skill_id and s.enabled=true',
    'v_skill_hero_id is distinct from p_hero_id',
    "v_subject_key:=v_hero_name||' · '||v_skill_name||' · nível '||v_skill_level::text",
    "v_fingerprint,'pending',false",
    "grant execute on function public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text) to authenticated,service_role",
):
    if token not in research_reference: errors.append(f'Research Reference Integrity V4 sem contrato: {token}')

for token in (
    'research reference validation missing',
    'hero skill level structured validation missing',
    'hero reference does not require enabled catalog row',
    'skill reference is not bound to selected hero',
    'hero skill subject is not canonical server-side',
    'reference hardening lost pending/dedupe boundary',
    'anon can submit structured research',
):
    if token not in research_reference_test: errors.append(f'teste SQL Research Reference V4 sem cobertura: {token}')

for token in (
    'create or replace function public.echo_creator_canonical_channel_url_v1',
    "when 'youtube' then", "when 'twitch' then", "when 'tiktok' then", "when 'instagram' then",
    "when 'facebook' then", "when 'x' then", "when 'other' then",
    'canonical_channel_url text',
    'creator_canonical_duplicate_requires_review',
    'verified_creator_claim_requires_canonical_reissue',
    'creator_channel_platform_mismatch',
    'pg_catalog.pg_advisory_xact_lock',
    'creator_claim_requires_reissue',
    'creator_claim_canonical_integrity_failed',
    'echo_creator_verified_requires_canonical',
    "grant execute on function public.echo_creator_canonical_channel_url_v1(text,text) to service_role",
):
    if token not in creator_mig: errors.append(f'Creator URL hardening sem contrato: {token}')

for forbidden in (
    'grant execute on function public.echo_creator_canonical_channel_url_v1(text,text) to anon',
    'grant execute on function public.echo_creator_canonical_channel_url_v1(text,text) to authenticated',
):
    if forbidden in creator_mig: errors.append(f'helper Creator exposto indevidamente: {forbidden}')

for token in (
    'create or replace function public.admin_set_identity_badge_v1',
    "p_badge_type='creator' and coalesce(p_active,false)=true",
    'creator_badge_requires_verified_claim',
    'create or replace function public.admin_review_creator_claim_v1',
    'insert into public.echo_identity_badges',
    "v_claim.user_id,'creator',true,v_claim.canonical_channel_url",
):
    if token not in creator_grant_mig: errors.append(f'Creator grant guard sem contrato: {token}')

for token in (
    "youtube','https://example.com/@creator",
    "youtube','https://youtube.com/watch?v=abc",
    "x','https://twitter.com/echocreator/?s=20",
    "other','https://localhost/channel",
    'creator_claim_requires_reissue',
    'creator_claim_canonical_integrity_failed',
    'echo_creator_verified_requires_canonical',
    'creator_badge_requires_verified_claim',
    'insert into public.echo_identity_badges',
    'echo_guard_institutional_badge',
    'has_function_privilege',
):
    if token not in creator_test: errors.append(f'teste SQL Creator V4 sem caso: {token}')

for token in (
    'create or replace function public.echo_identity_display_name_looks_like_email',
    'display_name_email_not_allowed',
    'create or replace function public.echo_public_identity_cards_v1',
    'when public.echo_identity_display_name_looks_like_email(p.display_name) then ep.public_handle',
    'ep.profile_completed_at is not null',
    "grant execute on function public.echo_identity_display_name_looks_like_email(text) to service_role",
):
    if token not in public_name_mig: errors.append(f'privacidade do nome público sem contrato: {token}')
for forbidden in (
    'grant execute on function public.echo_identity_display_name_looks_like_email(text) to anon',
    'grant execute on function public.echo_identity_display_name_looks_like_email(text) to authenticated',
):
    if forbidden in public_name_mig: errors.append(f'helper de privacidade exposta indevidamente: {forbidden}')
for token in (
    "echo_identity_display_name_looks_like_email('legacy@example.com')",
    "echo_identity_display_name_looks_like_email('arena scout')",
    'display_name_email_not_allowed',
    'ep.public_handle',
    'has_function_privilege',
):
    if token not in public_name_test: errors.append(f'teste SQL de privacidade V4 sem caso: {token}')

for token in (
    'identity-shadow-5',
    'creator exige claim verificado',
    'creator só nasce da fila de verificação abaixo',
    'claims sem canonicalização ou expirados não podem ser aprovados',
    'a observação sanitizada fica visível somente para admin durante a revisão',
    'primeira descoberta é exclusiva por conhecimento/patch verificado',
):
    if token not in admin_lab: errors.append(f'Admin Identity Lab sem contrato V4: {token}')
for token in (
    "select('id,user_id,platform,channel_url,canonical_channel_url,proof_code,status,requested_at,expires_at')",
    "type==='creator'&&enabled",
    'creator só pode ser concedido pela revisão de um claim válido',
    'reemitir antes de verificar',
    'abrir canal canônico',
    'function researchobservation(row)',
    "const value=row?.payload?.observation",
    "<b>observação:</b> ${esc(observation)}",
    'function researchreviewerror(error)',
    'first_discovery_already_claimed',
    'já existe uma primeira descoberta verificada para este conhecimento/patch',
):
    if token not in admin_js: errors.append(f'Admin Identity runtime sem proteção/revisão V4: {token}')
if "select('id,contributor_id,contribution_type,hero_id,skill_id,subject_key,game_version,payload,evidence_kind,evidence_reference,status,submitted_at')" not in admin_js \
   and "rpc('admin_research_review_queue_v5'" not in admin_js:
    errors.append('Admin Identity runtime sem fila AAL2 de evidências para revisão')
if 'data-badge="creator" data-enable="true"' in admin_js:
    errors.append('Admin ainda oferece botão para conceder Creator fora do claim')

if 'meu-perfil.html' in PUBLIC_NAV.read_text(encoding='utf-8').lower():
    errors.append('Meu Perfil entrou na navegação pública estática antes de existir uma sessão autenticada')
for shell in AUTH_SHELLS:
    shell_text = shell.read_text(encoding='utf-8').lower()
    if 'identityprofileurl' not in shell_text or 'meu perfil' not in shell_text:
        errors.append(f'{shell.relative_to(ROOT)} não oferece Meu Perfil à conta autenticada')

if 'meu perfil v4 em shadow' not in doc or 'centro creator' not in doc or 'p_allow_messages=false' not in doc:
    errors.append('documentação V4 incompleta')
if 'canonicalização creator' not in doc or 'creator só pode ser concedido' not in doc:
    errors.append('documentação V4 não descreve hardening Creator completo')
if 'privacidade de nome público v4' not in doc:
    errors.append('documentação V4 não descreve proteção contra e-mail como nome')
if 'timeline privada' not in doc or 'trilha visual echo scout' not in doc:
    errors.append('documentação V4 não descreve timeline privada/trilha Scout')
if 'centro de contribuição echo research v4' not in doc:
    errors.append('documentação V4 não descreve envio comunitário gated')
if 'research reference integrity v4' not in doc or 'skill_level' not in doc:
    errors.append('documentação V4 não descreve referências estruturadas de herói/habilidade')
if '2026-08-25-my-profile-v4-shadow' not in ledger:
    errors.append('ledger interno sem Meu Perfil V4')
if '2026-08-25-creator-url-hardening-v4-shadow' not in ledger:
    errors.append('ledger interno sem Creator URL Hardening V4')
if '2026-08-25-public-name-privacy-v4-shadow' not in ledger:
    errors.append('ledger interno sem Public Name Privacy V4')
if '2026-08-25-private-contribution-history-v4-shadow' not in ledger:
    errors.append('ledger interno sem histórico privado de contribuições V4')
if '2026-08-25-research-contribution-center-v4-shadow' not in ledger:
    errors.append('ledger interno sem Centro Echo Research V4')
if '2026-08-25-research-reference-integrity-v4-shadow' not in ledger:
    errors.append('ledger interno sem Research Reference Integrity V4')
if 'python3 scripts/check-community-identity-v4.py' not in workflow:
    errors.append('Quality Gates não executam Meu Perfil V4')

for forbidden in ('path_prefix:', 'pages-preview/', 'review/$ci_commit_ref_slug'):
    if forbidden in gitlab_ci:
        errors.append(f'CI contém configuração experimental de preview: {forbidden}')

if errors:
    print('MY PROFILE V4: FALHOU')
    for error in errors: print('-', error)
    sys.exit(1)
print('MY PROFILE V4: OK · editor privado, Research estruturado server-validated, Scout real, primeira descoberta exclusiva e Creator claim-only.')
