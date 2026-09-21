-- Echo Identity V5 — cobertura de índices para todas as foreign keys.
-- Destino exclusivo: Supabase SNV. Não habilita rollout público.

begin;

create index if not exists echo_community_specialty_rules_specialty_fk_idx
  on public.echo_community_specialty_rules(specialty_key);

create index if not exists echo_community_specialty_stats_specialty_fk_idx
  on public.echo_community_specialty_stats(specialty_key);

create index if not exists echo_creator_claims_reviewed_by_fk_idx
  on public.echo_creator_claims(reviewed_by);

create index if not exists echo_founder_authority_assigned_by_fk_idx
  on public.echo_founder_authority(assigned_by);

create index if not exists echo_identity_authority_audit_actor_fk_idx
  on public.echo_identity_authority_audit(actor_user_id);

create index if not exists echo_identity_authority_audit_target_fk_idx
  on public.echo_identity_authority_audit(target_user_id);

create index if not exists echo_identity_badges_granted_by_fk_idx
  on public.echo_identity_badges(granted_by);

create index if not exists echo_identity_badges_revoked_by_fk_idx
  on public.echo_identity_badges(revoked_by);

create index if not exists echo_identity_rollout_audit_actor_fk_idx
  on public.echo_identity_rollout_audit(actor_user_id);

create index if not exists echo_identity_rollout_settings_updated_by_fk_idx
  on public.echo_identity_rollout_settings(updated_by);

create index if not exists echo_research_contributions_hero_fk_idx
  on public.echo_research_contributions(hero_id);

create index if not exists echo_research_contributions_reviewed_by_fk_idx
  on public.echo_research_contributions(reviewed_by);

create index if not exists echo_research_contributions_skill_fk_idx
  on public.echo_research_contributions(skill_id);

commit;
