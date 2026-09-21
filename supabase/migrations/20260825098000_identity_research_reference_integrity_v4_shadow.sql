-- Echo Identity — Research Reference Integrity V4 em Shadow.
-- Valida referências estruturadas de herói/habilidade no servidor antes de aceitar a contribuição.
-- Para hero_skill_level, nível e subject_key passam a ser canônicos e derivados do catálogo real.
-- Destino exclusivo: Supabase SNV.

begin;

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
  v_fingerprint text;
  v_subject_key text:=btrim(coalesce(p_subject_key,''));
  v_hero_name text;
  v_skill_name text;
  v_skill_hero_id uuid;
  v_skill_max_level integer;
  v_skill_level integer;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and coalesce(p.is_blocked,false)=false) then
    raise exception 'active_profile_required' using errcode='42501';
  end if;
  if not exists(select 1 from public.echo_identity_rollout_settings s where s.singleton=true and s.public_identity_enabled and s.research_submission_enabled) then
    raise exception 'research_submission_rollout_disabled' using errcode='42501';
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

  -- Referências nunca são aceitas por mera existência de UUID no request.
  if p_hero_id is not null then
    select h.name into v_hero_name
    from public.heroes h
    where h.id=p_hero_id and h.enabled=true;
    if v_hero_name is null then
      raise exception 'invalid_research_hero' using errcode='22023';
    end if;
  end if;

  if p_skill_id is not null then
    if p_hero_id is null then
      raise exception 'research_skill_requires_hero' using errcode='22023';
    end if;
    select s.name,s.hero_id,s.max_level
    into v_skill_name,v_skill_hero_id,v_skill_max_level
    from public.hero_skills s
    where s.id=p_skill_id and s.enabled=true;
    if v_skill_name is null then
      raise exception 'invalid_research_skill' using errcode='22023';
    end if;
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
    -- Evita farming/fragmentação por variações do texto livre no mesmo nível observado.
    v_subject_key:=v_hero_name||' · '||v_skill_name||' · nível '||v_skill_level::text;
    v_payload:=jsonb_set(v_payload,'{skill_level}',to_jsonb(v_skill_level),true);
  elsif p_contribution_type='hero_passive' then
    if p_hero_id is null then
      raise exception 'hero_reference_required' using errcode='22023';
    end if;
    if p_skill_id is not null then
      raise exception 'passive_skill_reference_not_allowed' using errcode='22023';
    end if;
  end if;

  if p_contribution_type<>'hero_skill_level' and char_length(v_subject_key) not between 1 and 160 then
    raise exception 'invalid_subject_key' using errcode='22023';
  end if;
  if char_length(v_subject_key)>160 then
    raise exception 'invalid_subject_key' using errcode='22023';
  end if;

  if (select count(*) from public.echo_research_contributions c where c.contributor_id=v_uid and c.submitted_at>now()-interval '24 hours')>=30 then
    raise exception 'research_submission_rate_limited' using errcode='42501';
  end if;

  v_fingerprint:=public.echo_research_submission_fingerprint(
    p_contribution_type,v_subject_key,v_payload,p_hero_id,p_skill_id,p_game_version,p_evidence_kind,p_evidence_reference
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text||':'||v_fingerprint,0));

  if exists(
    select 1 from public.echo_research_contributions c
    where c.contributor_id=v_uid and c.submission_fingerprint=v_fingerprint
      and (c.status='pending' or c.submitted_at>now()-interval '7 days')
  ) then
    raise exception 'duplicate_research_submission' using errcode='23505';
  end if;

  insert into public.echo_research_contributions(
    contributor_id,contribution_type,hero_id,skill_id,subject_key,game_version,payload,evidence_kind,evidence_reference,
    submission_fingerprint,status,is_first_discovery
  ) values(
    v_uid,p_contribution_type,p_hero_id,p_skill_id,v_subject_key,nullif(btrim(coalesce(p_game_version,'')),''),
    v_payload,p_evidence_kind,nullif(btrim(coalesce(p_evidence_reference,'')),''),v_fingerprint,'pending',false
  ) returning id into v_id;

  return jsonb_build_object(
    'contribution_id',v_id,
    'status','pending',
    'subject_key',v_subject_key,
    'hero_id',p_hero_id,
    'skill_id',p_skill_id
  );
end;
$$;
revoke all on function public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text) from public,anon;
grant execute on function public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text) to authenticated,service_role;

comment on function public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text) is
  'Echo Research V4: envio pending com rate limit/dedupe, referências hero/skill validadas server-side e subject canônico para níveis de habilidade.';

commit;
