begin;

-- Auditoria comunitária é uma contribuição de pesquisa normal: nasce pendente,
-- respeita os mesmos limites, exige revisão independente e só então pontua.
alter table public.echo_research_contributions
  drop constraint if exists echo_research_contributions_contribution_type_check;

alter table public.echo_research_contributions
  add constraint echo_research_contributions_contribution_type_check
  check (contribution_type = any (array[
    'hero_skill_level'::text,
    'hero_passive'::text,
    'hero_skill_audit'::text,
    'equipment_stat'::text,
    'patch_change'::text,
    'counter_evidence'::text,
    'other'::text
  ]));

create or replace function public.echo_submit_research_contribution_v1(
  p_contribution_type text,
  p_subject_key text,
  p_payload jsonb default '{}'::jsonb,
  p_hero_id uuid default null,
  p_skill_id uuid default null,
  p_game_version text default null,
  p_evidence_kind text default 'text',
  p_evidence_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_id uuid;
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
  v_submission_fingerprint text;
  v_knowledge_fingerprint text;
  v_subject_key text:=btrim(coalesce(p_subject_key,''));
  v_hero_name text;
  v_skill_name text;
  v_skill_hero_id uuid;
  v_skill_max_level integer;
  v_skill_level integer;
  v_audit_verdict text;
  v_audit_observation text;
  v_policy public.echo_research_guardrail_policy%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and coalesce(p.is_blocked,false)=false) then
    raise exception 'active_profile_required' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.echo_identity_rollout_settings s
    where s.singleton=true and s.public_identity_enabled and s.research_submission_enabled
  ) then
    raise exception 'research_submission_rollout_disabled' using errcode='42501';
  end if;

  select * into v_policy from public.echo_research_guardrail_policy where singleton=true;
  if not found or v_policy.policy_version is null then
    raise exception 'research_guardrail_policy_missing' using errcode='55000';
  end if;

  if p_contribution_type not in ('hero_skill_level','hero_passive','hero_skill_audit','equipment_stat','patch_change','counter_evidence','other') then
    raise exception 'invalid_contribution_type' using errcode='22023';
  end if;
  if jsonb_typeof(v_payload)<>'object' or octet_length(v_payload::text)>16384 then
    raise exception 'invalid_contribution_payload' using errcode='22023';
  end if;
  if p_game_version is not null and char_length(btrim(p_game_version))>80 then
    raise exception 'game_version_too_long' using errcode='22023';
  end if;
  if p_evidence_kind not in ('screenshot','video','official_link','community_link','text','other') then
    raise exception 'invalid_evidence_kind' using errcode='22023';
  end if;
  if p_evidence_reference is not null and char_length(p_evidence_reference)>1200 then
    raise exception 'evidence_reference_too_long' using errcode='22023';
  end if;

  if p_hero_id is not null then
    select h.name into v_hero_name
    from public.heroes h
    where h.id=p_hero_id and h.enabled=true;
    if v_hero_name is null then raise exception 'invalid_research_hero' using errcode='22023'; end if;
  end if;

  if p_skill_id is not null then
    if p_hero_id is null then raise exception 'research_skill_requires_hero' using errcode='22023'; end if;
    select s.name,s.hero_id,s.max_level
    into v_skill_name,v_skill_hero_id,v_skill_max_level
    from public.hero_skills s
    where s.id=p_skill_id and s.enabled=true;
    if v_skill_name is null then raise exception 'invalid_research_skill' using errcode='22023'; end if;
    if v_skill_hero_id is distinct from p_hero_id then
      raise exception 'research_skill_hero_mismatch' using errcode='22023';
    end if;
  end if;

  if p_contribution_type='hero_skill_level' then
    if p_hero_id is null or p_skill_id is null then
      raise exception 'hero_skill_reference_required' using errcode='22023';
    end if;
    if not (v_payload ? 'skill_level') or jsonb_typeof(v_payload->'skill_level')<>'number' then
      raise exception 'research_skill_level_required' using errcode='22023';
    end if;
    begin
      if (v_payload->>'skill_level') !~ '^[0-9]+$' then
        raise exception 'research_skill_level_invalid' using errcode='22023';
      end if;
      v_skill_level:=(v_payload->>'skill_level')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'research_skill_level_invalid' using errcode='22023';
    end;
    if v_skill_max_level is null or v_skill_max_level<1 then
      raise exception 'research_skill_level_catalog_missing' using errcode='55000';
    end if;
    if v_skill_level<1 or v_skill_level>v_skill_max_level then
      raise exception 'research_skill_level_out_of_range' using errcode='22023';
    end if;
    v_subject_key:=v_hero_name||' · '||v_skill_name||' · nível '||v_skill_level::text;
    v_payload:=jsonb_set(v_payload,'{skill_level}',to_jsonb(v_skill_level),true);
  elsif p_contribution_type='hero_passive' then
    if p_hero_id is null then raise exception 'hero_reference_required' using errcode='22023'; end if;
    if p_skill_id is not null then raise exception 'passive_skill_reference_not_allowed' using errcode='22023'; end if;
  elsif p_contribution_type='hero_skill_audit' then
    if p_hero_id is null or p_skill_id is null then
      raise exception 'hero_skill_audit_reference_required' using errcode='22023';
    end if;
    v_audit_verdict:=btrim(coalesce(v_payload->>'verdict',''));
    v_audit_observation:=btrim(coalesce(v_payload->>'observation',''));
    if v_audit_verdict not in ('confirmed','needs_correction') then
      raise exception 'invalid_hero_skill_audit_verdict' using errcode='22023';
    end if;
    if char_length(v_audit_observation) not between 20 and 800 then
      raise exception 'invalid_hero_skill_audit_observation' using errcode='22023';
    end if;
    if coalesce(v_payload->>'audit_schema_version','')<>'hero-skill-audit-v1' then
      raise exception 'invalid_hero_skill_audit_schema' using errcode='22023';
    end if;
    v_subject_key:='Auditoria · '||v_hero_name||' · '||v_skill_name;
  end if;

  if p_contribution_type not in ('hero_skill_level','hero_skill_audit') and char_length(v_subject_key) not between 1 and 160 then
    raise exception 'invalid_subject_key' using errcode='22023';
  end if;
  if char_length(v_subject_key)>160 then raise exception 'invalid_subject_key' using errcode='22023'; end if;

  v_submission_fingerprint:=public.echo_research_submission_fingerprint(
    p_contribution_type,v_subject_key,v_payload,p_hero_id,p_skill_id,p_game_version,p_evidence_kind,p_evidence_reference
  );
  v_knowledge_fingerprint:=public.echo_research_knowledge_fingerprint_v1(
    p_contribution_type,v_subject_key,p_hero_id,p_skill_id,p_game_version
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('echo-research-member:'||v_uid::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('echo-research-knowledge:'||v_knowledge_fingerprint,0));

  if exists(
    select 1 from public.echo_research_contributions c
    where c.contributor_id=v_uid and c.submission_fingerprint=v_submission_fingerprint
      and (c.status='pending' or c.submitted_at>now()-interval '7 days')
  ) then
    raise exception 'duplicate_research_submission' using errcode='23505';
  end if;

  if (
    select count(*) from public.echo_research_contributions c
    where c.contributor_id=v_uid
      and c.submitted_at>now()-(v_policy.submission_window_minutes*interval '1 minute')
  )>=v_policy.max_submissions_per_window then
    raise exception 'research_submission_rate_limited' using errcode='42501';
  end if;

  if (
    select count(*) from public.echo_research_contributions c
    where c.contributor_id=v_uid and c.status='pending'
  )>=v_policy.max_pending_per_member then
    raise exception 'research_pending_queue_full' using errcode='42501';
  end if;

  if (
    select count(*) from public.echo_research_contributions c
    where c.contributor_id=v_uid and c.knowledge_fingerprint=v_knowledge_fingerprint and c.status='pending'
  )>=v_policy.max_pending_per_member_knowledge then
    raise exception 'research_knowledge_pending_limit' using errcode='42501';
  end if;

  if (
    select count(*) from public.echo_research_contributions c
    where c.knowledge_fingerprint=v_knowledge_fingerprint and c.status='pending'
  )>=v_policy.max_pending_per_knowledge_global then
    raise exception 'research_knowledge_queue_saturated' using errcode='42501';
  end if;

  if exists(
    select 1 from public.echo_research_contributions c
    where c.contributor_id=v_uid
      and c.knowledge_fingerprint=v_knowledge_fingerprint
      and c.submitted_at>now()-(v_policy.knowledge_cooldown_minutes*interval '1 minute')
  ) then
    raise exception 'research_knowledge_cooldown' using errcode='42501';
  end if;

  insert into public.echo_research_contributions(
    contributor_id,contribution_type,hero_id,skill_id,subject_key,game_version,payload,evidence_kind,evidence_reference,
    submission_fingerprint,knowledge_fingerprint,guardrail_policy_version,status,is_first_discovery
  ) values(
    v_uid,p_contribution_type,p_hero_id,p_skill_id,v_subject_key,nullif(btrim(coalesce(p_game_version,'')),''),
    v_payload,p_evidence_kind,nullif(btrim(coalesce(p_evidence_reference,'')),''),
    v_submission_fingerprint,v_knowledge_fingerprint,v_policy.policy_version,'pending',false
  ) returning id into v_id;

  return jsonb_build_object(
    'contribution_id',v_id,
    'status','pending',
    'subject_key',v_subject_key,
    'hero_id',p_hero_id,
    'skill_id',p_skill_id,
    'guardrail_policy_version',v_policy.policy_version,
    'reputation_effect','none_until_independent_confirmation'
  );
end;
$$;

revoke all on function public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text) from public,anon;
grant execute on function public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text) to authenticated,service_role;

create or replace function public.echo_submit_hero_skill_audit_v1(
  p_hero_id uuid,
  p_skill_id uuid,
  p_verdict text,
  p_observation text,
  p_game_version text default null,
  p_evidence_kind text default 'text',
  p_evidence_reference text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_skill public.hero_skills%rowtype;
  v_hero public.heroes%rowtype;
  v_observation text:=btrim(coalesce(p_observation,''));
  v_reference text:=nullif(btrim(coalesce(p_evidence_reference,'')),'');
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_verdict not in ('confirmed','needs_correction') then
    raise exception 'invalid_hero_skill_audit_verdict' using errcode='22023';
  end if;
  if char_length(v_observation) not between 20 and 800 then
    raise exception 'invalid_hero_skill_audit_observation' using errcode='22023';
  end if;
  if p_evidence_kind not in ('text','screenshot','video','official_link','community_link','other') then
    raise exception 'invalid_evidence_kind' using errcode='22023';
  end if;
  if v_reference is not null and (char_length(v_reference)>1200 or v_reference !~* '^https://') then
    raise exception 'invalid_hero_skill_audit_evidence' using errcode='22023';
  end if;
  if p_evidence_kind in ('official_link','community_link','screenshot','video') and v_reference is null then
    raise exception 'hero_skill_audit_evidence_required' using errcode='22023';
  end if;

  select * into v_hero from public.heroes where id=p_hero_id and enabled=true;
  if not found then raise exception 'invalid_research_hero' using errcode='22023'; end if;
  select * into v_skill from public.hero_skills where id=p_skill_id and hero_id=p_hero_id and enabled=true;
  if not found then raise exception 'invalid_research_skill' using errcode='22023'; end if;

  v_payload:=jsonb_build_object(
    'audit_schema_version','hero-skill-audit-v1',
    'verdict',p_verdict,
    'observation',v_observation,
    'snapshot',jsonb_build_object(
      'name',v_skill.name,
      'description',v_skill.description,
      'skill_type',v_skill.skill_type,
      'cooldown',v_skill.cooldown,
      'duration',v_skill.duration,
      'energy_cost',v_skill.energy_cost,
      'unlock_level',v_skill.unlock_level,
      'max_level',v_skill.max_level,
      'verification_status',v_skill.verification_status,
      'needs_recheck',v_skill.needs_recheck,
      'captured_at',now()
    )
  );

  return public.echo_submit_research_contribution_v1(
    'hero_skill_audit',
    'Auditoria · '||v_hero.name||' · '||v_skill.name,
    v_payload,
    p_hero_id,
    p_skill_id,
    p_game_version,
    p_evidence_kind,
    v_reference
  );
end;
$$;

revoke all on function public.echo_submit_hero_skill_audit_v1(uuid,uuid,text,text,text,text,text) from public,anon;
grant execute on function public.echo_submit_hero_skill_audit_v1(uuid,uuid,text,text,text,text,text) to authenticated,service_role;

-- Só expõe crédito quando a decisão foi confirmada por uma segunda pessoa e
-- quando o contribuidor escolheu manter um perfil público completo.
create or replace function public.echo_public_hero_audit_credits_v1(p_hero_ids uuid[])
returns table(
  hero_id uuid,
  skill_id uuid,
  contributor_id uuid,
  audit_status text,
  audited_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.echo_identity_rollout_settings s
    where s.singleton=true
      and s.public_identity_enabled
      and s.public_profiles_enabled
      and s.identity_cards_enabled
  ) then return; end if;
  if p_hero_ids is null or cardinality(p_hero_ids)=0 then return; end if;
  if cardinality(p_hero_ids)>50 then raise exception 'too_many_hero_audit_credits' using errcode='22023'; end if;

  return query
  select distinct on (c.skill_id,c.contributor_id)
    c.hero_id,
    c.skill_id,
    c.contributor_id,
    c.status,
    f.created_at
  from public.echo_research_contributions c
  join public.echo_research_review_events e
    on e.id=c.current_review_event_id
   and e.contribution_id=c.id
   and e.reviewer_id=c.reviewed_by
   and e.new_status=c.status
   and e.new_first_discovery=c.is_first_discovery
  join public.echo_research_review_confirmations f
    on f.decision_event_id=e.id
   and f.contribution_id=c.id
   and f.outcome='confirmed'
  join public.hero_skills hs on hs.id=c.skill_id and hs.hero_id=c.hero_id and hs.enabled=true
  join public.heroes h on h.id=c.hero_id and h.enabled=true
  join public.profiles p on p.id=c.contributor_id and coalesce(p.is_blocked,false)=false
  join public.echo_public_profiles ep
    on ep.user_id=c.contributor_id
   and ep.profile_visibility='public'
   and ep.profile_completed_at is not null
  where c.contribution_type='hero_skill_audit'
    and c.hero_id=any(p_hero_ids)
    and c.status in ('verified','corroborated')
    and c.review_confirmation_state='confirmed'
    and e.reviewer_id is distinct from c.contributor_id
    and f.confirmer_id is distinct from c.contributor_id
    and f.confirmer_id is distinct from e.reviewer_id
  order by c.skill_id,c.contributor_id,f.created_at desc;
end;
$$;

revoke all on function public.echo_public_hero_audit_credits_v1(uuid[]) from public;
grant execute on function public.echo_public_hero_audit_credits_v1(uuid[]) to anon,authenticated,service_role;

comment on function public.echo_submit_hero_skill_audit_v1(uuid,uuid,text,text,text,text,text) is
  'Envia validação comunitária de uma habilidade com snapshot imutável; nasce pending e reutiliza limites, revisão dupla e reputação do Echo Research.';
comment on function public.echo_public_hero_audit_credits_v1(uuid[]) is
  'Créditos públicos estreitos de auditorias confirmadas por revisão independente e vinculadas apenas a perfis públicos.';

commit;
