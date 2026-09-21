-- Echo Identity V5 Shadow — Research Guardrails.
-- Limites versionados, fila anti-spam por conhecimento e evidência imutável.
-- Destino exclusivo: Supabase SNV. Não habilita rollout público.

begin;

-- ---------------------------------------------------------------------------
-- 1. Política server-side. Os limites ficam versionados e podem ser auditados
-- sem duplicar números no cliente. Missões e limites nunca concedem pontos.
-- ---------------------------------------------------------------------------
create table if not exists public.echo_research_guardrail_policy (
  singleton boolean primary key default true check (singleton=true),
  policy_version text not null,
  submission_window_minutes integer not null check (submission_window_minutes between 60 and 10080),
  max_submissions_per_window integer not null check (max_submissions_per_window between 1 and 200),
  max_pending_per_member integer not null check (max_pending_per_member between 1 and 100),
  max_pending_per_member_knowledge integer not null check (max_pending_per_member_knowledge between 1 and 10),
  max_pending_per_knowledge_global integer not null check (max_pending_per_knowledge_global between 2 and 200),
  knowledge_cooldown_minutes integer not null check (knowledge_cooldown_minutes between 1 and 10080),
  max_review_revisions_per_window integer not null check (max_review_revisions_per_window between 1 and 50),
  independent_confirmation_required boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.echo_research_guardrail_policy(
  singleton,policy_version,submission_window_minutes,max_submissions_per_window,
  max_pending_per_member,max_pending_per_member_knowledge,max_pending_per_knowledge_global,
  knowledge_cooldown_minutes,max_review_revisions_per_window,independent_confirmation_required,updated_at
) values(
  true,'research-hardening-v5-shadow',1440,30,12,2,12,360,6,true,now()
)
on conflict(singleton) do update set
  policy_version=excluded.policy_version,
  submission_window_minutes=excluded.submission_window_minutes,
  max_submissions_per_window=excluded.max_submissions_per_window,
  max_pending_per_member=excluded.max_pending_per_member,
  max_pending_per_member_knowledge=excluded.max_pending_per_member_knowledge,
  max_pending_per_knowledge_global=excluded.max_pending_per_knowledge_global,
  knowledge_cooldown_minutes=excluded.knowledge_cooldown_minutes,
  max_review_revisions_per_window=excluded.max_review_revisions_per_window,
  independent_confirmation_required=excluded.independent_confirmation_required,
  updated_at=now();

alter table public.echo_research_contributions
  add column if not exists guardrail_policy_version text not null default 'research-hardening-v5-shadow';

create index if not exists echo_research_pending_member_knowledge_v5_idx
  on public.echo_research_contributions(contributor_id,knowledge_fingerprint,submitted_at desc)
  where status='pending';

create index if not exists echo_research_pending_knowledge_v5_idx
  on public.echo_research_contributions(knowledge_fingerprint,submitted_at asc)
  where status='pending';

-- ---------------------------------------------------------------------------
-- 2. A submissão vira evidência append-only. Revisão pode alterar apenas o
-- estado de decisão; texto, payload, autor e fingerprints não são reescritos.
-- hero_id/skill_id ficam fora desta trava para preservar ON DELETE SET NULL.
-- ---------------------------------------------------------------------------
create or replace function public.echo_research_submission_immutable_v5()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.contributor_id is distinct from old.contributor_id
     or new.contribution_type is distinct from old.contribution_type
     or new.subject_key is distinct from old.subject_key
     or new.game_version is distinct from old.game_version
     or new.payload is distinct from old.payload
     or new.evidence_kind is distinct from old.evidence_kind
     or new.evidence_reference is distinct from old.evidence_reference
     or new.submitted_at is distinct from old.submitted_at
     or new.submission_fingerprint is distinct from old.submission_fingerprint
     or new.knowledge_fingerprint is distinct from old.knowledge_fingerprint
     or new.guardrail_policy_version is distinct from old.guardrail_policy_version then
    raise exception 'research_submission_is_immutable' using errcode='55000';
  end if;
  return new;
end;
$$;
revoke all on function public.echo_research_submission_immutable_v5() from public,anon,authenticated,service_role;

drop trigger if exists zz_echo_research_submission_immutable_v5 on public.echo_research_contributions;
create trigger zz_echo_research_submission_immutable_v5
before update on public.echo_research_contributions
for each row execute function public.echo_research_submission_immutable_v5();

-- ---------------------------------------------------------------------------
-- 3. Envio V5. Locks por membro e conhecimento fecham corridas; variantes de
-- evidência continuam possíveis, mas não podem lotar a fila do mesmo fato.
-- ---------------------------------------------------------------------------
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

  if p_contribution_type not in ('hero_skill_level','hero_passive','equipment_stat','patch_change','counter_evidence','other') then
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
  end if;

  if p_contribution_type<>'hero_skill_level' and char_length(v_subject_key) not between 1 and 160 then
    raise exception 'invalid_subject_key' using errcode='22023';
  end if;
  if char_length(v_subject_key)>160 then raise exception 'invalid_subject_key' using errcode='22023'; end if;

  v_submission_fingerprint:=public.echo_research_submission_fingerprint(
    p_contribution_type,v_subject_key,v_payload,p_hero_id,p_skill_id,p_game_version,p_evidence_kind,p_evidence_reference
  );
  v_knowledge_fingerprint:=public.echo_research_knowledge_fingerprint_v1(
    p_contribution_type,v_subject_key,p_hero_id,p_skill_id,p_game_version
  );

  -- Ordem fixa de locks: membro antes de conhecimento.
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

-- ---------------------------------------------------------------------------
-- 4. Transparência autenticada sem permitir escrita no cliente.
-- ---------------------------------------------------------------------------
alter table public.echo_research_guardrail_policy enable row level security;
revoke all on table public.echo_research_guardrail_policy from public,anon,authenticated;
grant select on table public.echo_research_guardrail_policy to authenticated;

drop policy if exists echo_research_guardrail_policy_read on public.echo_research_guardrail_policy;
create policy echo_research_guardrail_policy_read on public.echo_research_guardrail_policy
for select to authenticated using (true);

comment on table public.echo_research_guardrail_policy is
  'Limites versionados do Echo Research. Transparência autenticada; nenhuma escrita pelo cliente e nenhum ponto derivado do limite.';
comment on column public.echo_research_contributions.guardrail_policy_version is
  'Versão das regras anti-spam vigentes quando a evidência foi recebida.';
comment on function public.echo_research_submission_immutable_v5() is
  'Impede reescrita do autor, texto, payload, evidência e fingerprints após o envio; revisão altera apenas estado decisório.';
comment on function public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text) is
  'Echo Research V5: valida catálogo, serializa por membro/conhecimento, aplica limites versionados e sempre cria evidência pending sem reputação.';

commit;
