-- Echo Identity V5 — nenhuma foreign key das 19 tabelas fica sem índice de cobertura.
begin;

do $$
declare
  v_missing text[];
begin
  select array_agg(v.index_name order by v.index_name) into v_missing
  from (values
    ('echo_community_specialty_rules_specialty_fk_idx'),
    ('echo_community_specialty_stats_specialty_fk_idx'),
    ('echo_creator_claims_reviewed_by_fk_idx'),
    ('echo_founder_authority_assigned_by_fk_idx'),
    ('echo_identity_authority_audit_actor_fk_idx'),
    ('echo_identity_authority_audit_target_fk_idx'),
    ('echo_identity_badges_granted_by_fk_idx'),
    ('echo_identity_badges_revoked_by_fk_idx'),
    ('echo_identity_rollout_audit_actor_fk_idx'),
    ('echo_identity_rollout_settings_updated_by_fk_idx'),
    ('echo_research_contributions_hero_fk_idx'),
    ('echo_research_contributions_reviewed_by_fk_idx'),
    ('echo_research_contributions_skill_fk_idx')
  ) v(index_name)
  where to_regclass('public.'||v.index_name) is null;

  if cardinality(v_missing)>0 then
    raise exception 'v5 foreign-key indexes missing: %',v_missing;
  end if;

  select array_agg(format('%s:%s',c.conrelid::regclass,c.conname) order by c.conrelid::regclass::text,c.conname)
  into v_missing
  from pg_constraint c
  where c.contype='f'
    and c.conrelid=any(array[
      'public.echo_public_profiles'::regclass,
      'public.echo_community_reputation'::regclass,
      'public.echo_identity_authority_audit'::regclass,
      'public.echo_identity_badges'::regclass,
      'public.echo_founder_authority'::regclass,
      'public.echo_creator_claims'::regclass,
      'public.echo_research_contributions'::regclass,
      'public.echo_identity_rollout_settings'::regclass,
      'public.echo_identity_rollout_audit'::regclass,
      'public.echo_reputation_policy_meta'::regclass,
      'public.echo_reputation_tier_rules'::regclass,
      'public.echo_community_specialty_catalog'::regclass,
      'public.echo_community_specialty_rules'::regclass,
      'public.echo_community_specialty_stats'::regclass,
      'public.echo_research_guardrail_policy'::regclass,
      'public.echo_research_review_events'::regclass,
      'public.echo_research_review_confirmations'::regclass,
      'public.echo_identity_authority_audit_chain_state'::regclass,
      'public.echo_research_mission_catalog'::regclass
    ])
    and not exists (
      select 1
      from pg_index i
      where i.indrelid=c.conrelid
        and i.indisvalid
        and i.indisready
        and (
          select array_agg(k.attnum order by k.ordinality)
          from unnest(i.indkey) with ordinality k(attnum,ordinality)
          where k.ordinality<=cardinality(c.conkey)
        )=c.conkey
    );

  if cardinality(v_missing)>0 then
    raise exception 'v5 identity foreign keys remain unindexed: %',v_missing;
  end if;
end $$;

rollback;
