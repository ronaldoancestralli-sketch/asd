#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'guard': ROOT / 'supabase/migrations/20260825110000_identity_research_guardrails_v5_shadow.sql',
    'review': ROOT / 'supabase/migrations/20260825111000_identity_review_ledger_and_scoring_v5_shadow.sql',
    'missions': ROOT / 'supabase/migrations/20260825112000_identity_research_missions_v5_shadow.sql',
    'fk_indexes': ROOT / 'supabase/migrations/20260825113000_identity_foreign_key_indexes_v5.sql',
    'guard_test': ROOT / 'supabase/tests/identity_research_guardrails_v5_security.sql',
    'review_test': ROOT / 'supabase/tests/identity_review_ledger_v5_security.sql',
    'mission_test': ROOT / 'supabase/tests/identity_research_missions_v5_security.sql',
    'fk_indexes_test': ROOT / 'supabase/tests/identity_foreign_key_indexes_v5_security.sql',
    'profile_html': ROOT / 'meu-perfil.html',
    'profile_js': ROOT / 'js/my-profile-v4.js',
    'progress_js': ROOT / 'js/my-profile-progress-v5.js',
    'progress_css': ROOT / 'css/my-profile-progress-v5.css',
    'confirmation_css': ROOT / 'css/my-profile-confirmation-v5.css',
    'admin_html': ROOT / 'admin/identity-lab.html',
    'admin_js': ROOT / 'admin/js/identity-lab.js',
    'admin_css': ROOT / 'admin/css/identity-lab-v5.css',
    'doc': ROOT / 'docs/IDENTITY_V5_HARDENING.md',
    'audit_doc': ROOT / 'docs/IDENTITY_V5_SNV_AUDIT_20260825.md',
    'quality_doc': ROOT / 'docs/REPUTATION_QUALITY_V2.md',
    'ledger': ROOT / 'docs/CHANGELOG_INTERNAL.jsonl',
    'workflow': ROOT / '.github/workflows/quality-gates.yml',
}

errors = []
for label, path in FILES.items():
    if not path.exists():
        errors.append(f'arquivo V5 ausente ({label}): {path.relative_to(ROOT)}')
if errors:
    print('IDENTITY V5 HARDENING: FALHOU')
    print('\n'.join(f'- {error}' for error in errors))
    sys.exit(1)

text = {label: path.read_text(encoding='utf-8').lower() for label, path in FILES.items()}

def require(label, tokens, area):
    body = text[label]
    for token in tokens:
        if token.lower() not in body:
            errors.append(f'{area} sem contrato: {token}')

def forbid(label, tokens, area):
    body = text[label]
    for token in tokens:
        if token.lower() in body:
            errors.append(f'{area} contém exposição proibida: {token}')

require('guard', (
    'research-hardening-v5-shadow',
    'max_pending_per_member_knowledge',
    'max_pending_per_knowledge_global',
    'knowledge_cooldown_minutes',
    'max_review_revisions_per_window',
    'independent_confirmation_required',
    'guardrail_policy_version',
    'echo_research_submission_immutable_v5',
    'research_submission_is_immutable',
    "hashtextextended('echo-research-member:'",
    "hashtextextended('echo-research-knowledge:'",
    'research_pending_queue_full',
    'research_knowledge_pending_limit',
    'research_knowledge_queue_saturated',
    'research_knowledge_cooldown',
    'none_until_independent_confirmation',
    'alter table public.echo_research_guardrail_policy enable row level security',
    'grant select on table public.echo_research_guardrail_policy to authenticated',
), 'Research Guardrails V5')
forbid('guard', (
    'grant insert on table public.echo_research_guardrail_policy to authenticated',
    'grant update on table public.echo_research_guardrail_policy to authenticated',
    'grant delete on table public.echo_research_guardrail_policy to authenticated',
    'grant execute on function public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text) to anon',
), 'Research Guardrails V5')

require('review', (
    'create table if not exists public.echo_research_review_events',
    'create table if not exists public.echo_research_review_confirmations',
    'current_review_event_id',
    'review_confirmation_state',
    'awaiting_confirmation',
    'ineligible_self_review',
    'echo_research_review_ledger_before_update_v5',
    'echo_research_review_events_immutable_v5',
    'echo_research_review_confirmations_immutable_v5',
    'reviewed_at_epoch_us',
    'created_at_epoch_us',
    'echo_research_confirmation_queue_v5_idx',
    'research_rereview_reason_required',
    'research_review_revision_limited',
    'perform public.echo_recompute_community_reputation(v_row.contributor_id)',
    'admin_confirm_research_review_v1',
    'admin_research_review_queue_v5',
    'research_reviewer_cannot_self_confirm',
    'research_contributor_cannot_confirm',
    'research_confirmation_stale_decision',
    "c.review_confirmation_state='confirmed'",
    "f.outcome='confirmed'",
    "hashtextextended('echo-community-reputation:'",
    'echo_identity_authority_audit_chain_state',
    'for update',
    'echo_identity_authority_audit_immutable_v5',
    'alter table public.echo_research_review_events enable row level security',
    'alter table public.echo_research_review_confirmations enable row level security',
    'revoke select on table public.echo_research_contributions from authenticated',
    'grant select(',
), 'Review Ledger V5')
forbid('review', (
    'create index if not exists echo_research_review_events_contribution_idx',
    'grant execute on function public.echo_recompute_community_reputation(uuid) to authenticated',
    'grant execute on function public.admin_confirm_research_review_v1(uuid,bigint,text,text) to anon',
    'grant insert on table public.echo_research_review_events to authenticated',
    'grant update on table public.echo_research_review_confirmations to authenticated',
), 'Review Ledger V5')

require('missions', (
    'missions-v5-shadow',
    "'first_signal'", "'verified_trio'", "'field_notebook'", "'two_fronts'",
    "'first_discovery'", "'trusted_researcher'",
    'echo_my_research_missions_v5',
    'echo_my_research_guardrails_v5',
    'echo_community_reputation',
    'echo_community_specialty_stats',
    'awards_reputation boolean',
    'missions_award_reputation',
    "'scoring_mode','confirmed_current_decision_only'",
    'alter table public.echo_research_mission_catalog enable row level security',
), 'Research Missions V5')
mission_function = text['missions'].split('create or replace function public.echo_my_research_missions_v5', 1)[-1]
mission_function = mission_function.split('create or replace function public.echo_my_research_guardrails_v5', 1)[0]
for token in ('insert into public.echo_community_reputation', 'update public.echo_community_reputation',
              'insert into public.echo_identity_badges', 'insert into public.echo_research_contributions'):
    if token in mission_function:
        errors.append(f'Missões V5 podem alterar estado recompensável: {token}')

require('fk_indexes', (
    'echo_community_specialty_rules_specialty_fk_idx',
    'echo_community_specialty_stats_specialty_fk_idx',
    'echo_creator_claims_reviewed_by_fk_idx',
    'echo_founder_authority_assigned_by_fk_idx',
    'echo_identity_authority_audit_actor_fk_idx',
    'echo_identity_authority_audit_target_fk_idx',
    'echo_identity_badges_granted_by_fk_idx',
    'echo_identity_badges_revoked_by_fk_idx',
    'echo_identity_rollout_audit_actor_fk_idx',
    'echo_identity_rollout_settings_updated_by_fk_idx',
    'echo_research_contributions_hero_fk_idx',
    'echo_research_contributions_reviewed_by_fk_idx',
    'echo_research_contributions_skill_fk_idx',
), 'Foreign-key indexes V5')

for label, coverage in (
    ('guard_test', ('v5 guardrail policy mismatch', 'v5 submission guardrails incomplete', 'v5 immutable submission trigger missing')),
    ('review_test', ('v5 review event hash mismatch', 'v5 confirmation state inconsistent',
                     'v5 confirmation hash mismatch', 'v5 authority audit chain broken or branched',
                     'v5 authority audit chain-state pointer inconsistent', 'v5 ledger hashes depend on session timezone',
                     'v5 confirmation queue index missing or misaligned')),
    ('mission_test', ('v5 mission catalog count mismatch', 'v5 missions can mutate reputation, badges or research')),
    ('fk_indexes_test', ('v5 foreign-key indexes missing', 'v5 identity foreign keys remain unindexed')),
):
    require(label, coverage, f'teste SQL {label}')

require('profile_html', (
    'echo field ops',
    'missões de pesquisa',
    'decisão em duas etapas',
    'missões não criam pontos, insígnias ou autoridade',
    'my-profile-progress-v5.css?v=20260825-progress-v5-shadow-1',
    'my-profile-confirmation-v5.css?v=20260825-confirmation-v5-shadow-1',
    'my-profile-progress-v5.js?v=20260825-progress-v5-shadow-1',
), 'Meu Perfil V5')
if 'echo field ops · v5 shadow' in text['profile_html']:
    errors.append('Meu Perfil ainda exibe o rótulo Shadow da V5 após o lançamento público')
require('progress_js', (
    "rpc('echo_my_research_guardrails_v5')",
    "rpc('echo_my_research_missions_v5')",
    'independent_confirmation_required!==true',
    'missions_award_reputation!==false',
    'mission.awards_reputation!==false',
    'nenhum limite ou progresso provisório foi inventado',
    'replacechildren',
    'textcontent',
), 'Runtime de missões V5')
if 'innerhtml' in text['progress_js']:
    errors.append('Runtime de missões V5 usa innerHTML em dados do servidor')

require('profile_js', (
    'research_pending_queue_full',
    'research_knowledge_pending_limit',
    'research_knowledge_queue_saturated',
    'research_knowledge_cooldown',
    'review_confirmation_state,current_review_event_id,review_revision',
    'aguardando 2ª confirmação',
    'confirmada por revisão independente',
    'decisão divergente · nova revisão necessária',
    'candidata à primeira descoberta',
    'após revisão e confirmação por outro admin independente',
), 'Histórico privado V5')

require('admin_html', (
    'decisões aguardando confirmação',
    'separação de função obrigatória',
    'autor, o revisor primário e o confirmador precisam ser pessoas distintas',
    'identity-shadow-5-v5-hardening-1',
), 'Identity Lab V5')
require('admin_js', (
    "from('echo_research_guardrail_policy')",
    "from('echo_research_review_events')",
    "rpc('admin_research_review_queue_v5'",
    "rpc('admin_confirm_research_review_v1'",
    'research_reviewer_cannot_self_confirm',
    'research_contributor_cannot_confirm',
    'research_confirmation_stale_decision',
    'decisão primária registrada no ledger',
    'divergência registrada',
), 'Identity Lab runtime V5')

require('doc', (
    'modelo de ameaça', 'auto-revisar ou auto-confirmar', 'riscos residuais',
    'múltiplas contas', 'conluio entre dois administradores', 'missões sem gamificação explorável',
    'não executar a v5 isoladamente', 'não há rollback destrutivo automático', 'nqklhsfaqpbjqmfzjzxk',
), 'Documentação V5')
require('audit_doc', (
    'plano free', 'o plano atual não oferece supabase branching',
    '19 migrations', 'uma vigésima migration aditiva', 'dry-run transacional',
    'identity-v1-v5-68405dca-before', '17 contratos sql',
    '61', '82', '242', '267', '13 foreign keys',
    '59 funções autenticadas', '68 assinaturas',
    'os seis gates públicos continuam desligados',
), 'Auditoria de implantação V5 no SNV')
require('quality_doc', ('auto-revisão', 'segundo parecer admin aal2', 'decisões antigas não voltam a contar'), 'Reputation Quality V2/V5')

try:
    ledger_rows = [json.loads(line) for line in FILES['ledger'].read_text(encoding='utf-8').splitlines() if line.strip()]
except (json.JSONDecodeError, OSError) as exc:
    errors.append(f'ledger interno inválido: {exc}')
    ledger_rows = []
entry = next((row for row in ledger_rows if row.get('id') == '2026-08-25-identity-v5-hardening-shadow'), None)
if not entry or entry.get('security_sensitive') is not True or entry.get('user_visible') is not False or entry.get('source_ref') is not None:
    errors.append('ledger interno sem entrada segura e privada da V5')
deploy_entry = next((row for row in ledger_rows if row.get('id') == '2026-08-25-identity-v5-snv-main-deploy'), None)
if not deploy_entry or deploy_entry.get('security_sensitive') is not True or deploy_entry.get('user_visible') is not False:
    errors.append('ledger interno sem evidência privada do deploy V5 no SNV')

require('workflow', (
    'python3 scripts/check-community-review-independence-v2.py',
    'python3 scripts/check-community-identity-v5.py',
), 'Quality Gates V5')

public_nav = ROOT / 'js/public-navigation.js'
if public_nav.exists() and 'meu-perfil.html' in public_nav.read_text(encoding='utf-8').lower():
    errors.append('Meu Perfil entrou na navegação pública estática antes de existir uma sessão autenticada')
for shell_path in (ROOT / 'js/site-shell-core.js', ROOT / 'js/module-public-shell-core.js'):
    if shell_path.exists():
        shell_text = shell_path.read_text(encoding='utf-8').lower()
        if 'identityprofileurl' not in shell_text or 'meu perfil' not in shell_text:
            errors.append(f'{shell_path.relative_to(ROOT)} não oferece Meu Perfil à conta autenticada')

if errors:
    print('IDENTITY V5 HARDENING: FALHOU')
    for error in errors:
        print('-', error)
    sys.exit(1)

print('IDENTITY V5 HARDENING: OK · fila limitada, revisão em duas etapas, ledger imutável e missões sem pontos paralelos.')
