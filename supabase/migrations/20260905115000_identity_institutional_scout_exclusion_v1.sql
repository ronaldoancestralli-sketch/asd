begin;

-- Founder and active Admin accounts are institutional identities. Their work
-- remains auditable, but it never enters the Echo Scouts progression.
alter table public.echo_community_reputation
  add column if not exists scout_eligible boolean not null default true;

alter table public.echo_community_specialty_stats
  add column if not exists scout_eligible boolean not null default true;

create or replace function private.echo_is_scout_eligible_v1(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path=''
as $$
  select p_user_id is not null
    and exists(
      select 1
      from public.profiles p
      where p.id=p_user_id
    )
    and not exists(
      select 1
      from public.echo_founder_authority f
      where f.user_id=p_user_id
    )
    and not exists(
      select 1
      from public.admin_staff_memberships s
      where s.user_id=p_user_id
        and s.active=true
    )
    and not exists(
      select 1
      from public.profiles p
      where p.id=p_user_id
        and (lower(coalesce(p.role,''))='admin' or coalesce(p.is_admin,false)=true)
    );
$$;
revoke all on function private.echo_is_scout_eligible_v1(uuid) from public,anon,authenticated;

create or replace function private.echo_enforce_scout_eligibility_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.scout_eligible:=private.echo_is_scout_eligible_v1(new.user_id);
  return new;
end;
$$;
revoke all on function private.echo_enforce_scout_eligibility_v1() from public,anon,authenticated;

drop trigger if exists echo_community_reputation_scout_eligibility_v1 on public.echo_community_reputation;
create trigger echo_community_reputation_scout_eligibility_v1
before insert or update on public.echo_community_reputation
for each row execute function private.echo_enforce_scout_eligibility_v1();

drop trigger if exists echo_community_specialty_scout_eligibility_v1 on public.echo_community_specialty_stats;
create trigger echo_community_specialty_scout_eligibility_v1
before insert or update on public.echo_community_specialty_stats
for each row execute function private.echo_enforce_scout_eligibility_v1();

create or replace function private.echo_refresh_scout_eligibility_v1(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_eligible boolean;
begin
  if p_user_id is null then return; end if;
  v_eligible:=private.echo_is_scout_eligible_v1(p_user_id);
  update public.echo_community_reputation
  set scout_eligible=v_eligible,updated_at=now()
  where user_id=p_user_id and scout_eligible is distinct from v_eligible;
  update public.echo_community_specialty_stats
  set scout_eligible=v_eligible,updated_at=now()
  where user_id=p_user_id and scout_eligible is distinct from v_eligible;
  -- Rebuild the community snapshot when an institutional account returns to
  -- regular membership. Historical contributions stay preserved and become
  -- eligible again only after the server-side role is removed.
  if v_eligible then
    perform public.echo_recompute_community_reputation(p_user_id);
  end if;
end;
$$;
revoke all on function private.echo_refresh_scout_eligibility_v1(uuid) from public,anon,authenticated;

create or replace function private.echo_sync_scout_eligibility_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_old_id uuid;
  v_new_id uuid;
begin
  if tg_op<>'INSERT' then
    v_old_id:=nullif(coalesce(to_jsonb(old)->>'user_id',to_jsonb(old)->>'id'),'')::uuid;
  end if;
  if tg_op<>'DELETE' then
    v_new_id:=nullif(coalesce(to_jsonb(new)->>'user_id',to_jsonb(new)->>'id'),'')::uuid;
  end if;
  perform private.echo_refresh_scout_eligibility_v1(v_old_id);
  if v_new_id is distinct from v_old_id then
    perform private.echo_refresh_scout_eligibility_v1(v_new_id);
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.echo_sync_scout_eligibility_v1() from public,anon,authenticated;

drop trigger if exists echo_founder_sync_scout_eligibility_v1 on public.echo_founder_authority;
create trigger echo_founder_sync_scout_eligibility_v1
after insert or update or delete on public.echo_founder_authority
for each row execute function private.echo_sync_scout_eligibility_v1();

drop trigger if exists echo_admin_staff_insert_delete_sync_scout_v1 on public.admin_staff_memberships;
create trigger echo_admin_staff_insert_delete_sync_scout_v1
after insert or delete on public.admin_staff_memberships
for each row execute function private.echo_sync_scout_eligibility_v1();

drop trigger if exists echo_admin_staff_update_sync_scout_v1 on public.admin_staff_memberships;
create trigger echo_admin_staff_update_sync_scout_v1
after update of user_id,active on public.admin_staff_memberships
for each row execute function private.echo_sync_scout_eligibility_v1();

drop trigger if exists echo_profile_admin_sync_scout_eligibility_v1 on public.profiles;
create trigger echo_profile_admin_sync_scout_eligibility_v1
after update of role,is_admin on public.profiles
for each row
when (old.role is distinct from new.role or old.is_admin is distinct from new.is_admin)
execute function private.echo_sync_scout_eligibility_v1();

create or replace function private.echo_block_institutional_scout_submission_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.echo_is_scout_eligible_v1(new.contributor_id) then
    raise exception 'institutional_accounts_do_not_join_scouts' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.echo_block_institutional_scout_submission_v1() from public,anon,authenticated;

drop trigger if exists echo_research_institutional_scout_guard_v1 on public.echo_research_contributions;
create trigger echo_research_institutional_scout_guard_v1
before insert or update of contributor_id on public.echo_research_contributions
for each row execute function private.echo_block_institutional_scout_submission_v1();

create or replace function public.echo_research_reputation_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid:=coalesce(new.contributor_id,old.contributor_id);
begin
  if tg_op='INSERT' and new.status='pending' then return new; end if;
  if private.echo_is_scout_eligible_v1(v_user_id) then
    perform public.echo_recompute_community_reputation(v_user_id);
  else
    perform private.echo_refresh_scout_eligibility_v1(v_user_id);
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.echo_public_identity_cards_v1(p_user_ids uuid[])
returns table(
  user_id uuid,public_handle text,display_name text,avatar_url text,profile_accent text,
  community_tier text,reputation_points integer,verified_count integer,first_discoveries integer,
  institutional_role text,institutional_badges jsonb
)
language plpgsql
security definer
stable
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.echo_identity_rollout_settings s
    where s.singleton=true and s.public_identity_enabled and s.public_profiles_enabled and s.identity_cards_enabled
  ) then return; end if;
  if p_user_ids is null or cardinality(p_user_ids)=0 then return; end if;
  if cardinality(p_user_ids)>50 then raise exception 'too_many_identity_cards' using errcode='22023'; end if;

  return query
  select
    p.id,
    ep.public_handle,
    case
      when public.echo_identity_display_name_looks_like_email(p.display_name) then ep.public_handle
      else p.display_name
    end,
    p.avatar_url,
    ep.profile_accent,
    case when scout.eligible then coalesce(r.community_tier,'member') else null end,
    case when scout.eligible then coalesce(r.reputation_points,0) else null end,
    case when scout.eligible then coalesce(r.verified_count,0) else null end,
    case when scout.eligible then coalesce(r.first_discoveries,0) else null end,
    case
      when exists(select 1 from public.echo_founder_authority f where f.user_id=p.id) then 'founder'
      when exists(select 1 from public.admin_staff_memberships s where s.user_id=p.id and s.active=true)
        or lower(coalesce(p.role,''))='admin' or coalesce(p.is_admin,false)=true then 'admin'
      when exists(select 1 from public.echo_identity_badges b where b.user_id=p.id and b.badge_type='developer' and b.active=true) then 'developer'
      when exists(select 1 from public.echo_identity_badges b where b.user_id=p.id and b.badge_type='moderator' and b.active=true) then 'moderator'
      when exists(select 1 from public.echo_identity_badges b where b.user_id=p.id and b.badge_type='partner' and b.active=true) then 'partner'
      when exists(select 1 from public.echo_identity_badges b where b.user_id=p.id and b.badge_type='creator' and b.active=true) then 'creator'
      else 'member'
    end,
    coalesce((
      select jsonb_agg(b.badge_type order by case b.badge_type when 'developer' then 1 when 'moderator' then 2 when 'partner' then 3 else 4 end)
      from public.echo_identity_badges b
      where b.user_id=p.id and b.active=true
    ),'[]'::jsonb)
  from public.profiles p
  join public.echo_public_profiles ep on ep.user_id=p.id and ep.profile_visibility='public'
  cross join lateral (select private.echo_is_scout_eligible_v1(p.id) as eligible) scout
  left join public.echo_community_reputation r
    on r.user_id=p.id and r.scout_eligible=true and scout.eligible
  where p.id=any(p_user_ids)
    and ep.profile_completed_at is not null
    and coalesce(p.is_blocked,false)=false;
end;
$$;

create or replace function public.echo_public_author_cards_v2(p_user_ids uuid[])
returns table(
  user_id uuid,display_name text,public_handle text,avatar_url text,
  community_tier text,reputation_points integer,institutional_role text,
  institutional_label text,primary_module text,primary_specialization text
)
language plpgsql
security definer
stable
set search_path=''
as $$
begin
  if p_user_ids is null or cardinality(p_user_ids)=0 then return; end if;
  if cardinality(p_user_ids)>100 then raise exception 'too_many_author_cards' using errcode='22023'; end if;
  return query
  select
    p.id,
    coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.username),''),'Jogador')::text,
    case when ep.profile_visibility='public' then ep.public_handle else null end::text,
    p.avatar_url::text,
    case when scout.eligible then coalesce(r.community_tier,'member') else null end::text,
    case when scout.eligible then coalesce(r.reputation_points,0) else null end::integer,
    case
      when exists(select 1 from public.echo_founder_authority f where f.user_id=p.id) then 'founder'
      when exists(select 1 from public.admin_staff_memberships s where s.user_id=p.id and s.active=true)
        or lower(coalesce(p.role,''))='admin' or coalesce(p.is_admin,false)=true then 'admin'
      else 'member'
    end::text,
    case
      when exists(select 1 from public.echo_founder_authority f where f.user_id=p.id) then 'FUNDADOR'
      when exists(select 1 from public.admin_staff_memberships s where s.user_id=p.id and s.active=true)
        or lower(coalesce(p.role,''))='admin' or coalesce(p.is_admin,false)=true then
        coalesce((
          select upper(nullif(btrim(s.staff_label),''))
          from public.admin_staff_memberships s
          where s.user_id=p.id and s.active=true
        ),'ADMIN')
      else null
    end::text,
    (
      select g.module_key
      from public.admin_staff_module_grants g
      join public.admin_modules m on m.module_key=g.module_key
      where g.user_id=p.id
        and g.module_key not in ('dashboard','governance')
        and m.is_active=true
      order by m.sort_order,g.module_key
      limit 1
    )::text,
    case when scout.eligible then (
      select c.label
      from public.echo_community_specialty_stats s
      join public.echo_community_specialty_catalog c on c.specialty_key=s.specialty_key
      where s.user_id=p.id
        and s.scout_eligible=true
        and s.earned_rank in ('specialist','reference','master')
        and c.active=true
      order by case s.earned_rank when 'master' then 3 when 'reference' then 2 else 1 end desc,
               s.specialty_points desc,c.label
      limit 1
    ) else null end::text
  from public.profiles p
  left join public.echo_public_profiles ep on ep.user_id=p.id
  cross join lateral (select private.echo_is_scout_eligible_v1(p.id) as eligible) scout
  left join public.echo_community_reputation r
    on r.user_id=p.id and r.scout_eligible=true and scout.eligible
  where p.id=any(p_user_ids) and coalesce(p.is_blocked,false)=false;
end;
$$;

create or replace function public.echo_public_profile_v1(p_handle text)
returns jsonb
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_id uuid;
  v_card jsonb;
  v_profile public.echo_public_profiles%rowtype;
  v_recent jsonb:='[]'::jsonb;
  v_authority text:='member';
  v_scout_eligible boolean:=true;
  v_tier text;
  v_frame text:='scout-member';
  v_authority_label text:='Membro';
  v_tier_label text;
begin
  if not exists(
    select 1 from public.echo_identity_rollout_settings s
    where s.singleton=true
      and s.public_identity_enabled=true
      and s.public_profiles_enabled=true
      and s.identity_cards_enabled=true
  ) then return null; end if;

  select ep.user_id into v_id
  from public.echo_public_profiles ep
  join public.profiles p on p.id=ep.user_id
  where lower(ep.public_handle)=lower(btrim(coalesce(p_handle,'')))
    and ep.profile_visibility='public'
    and ep.profile_completed_at is not null
    and coalesce(p.is_blocked,false)=false;
  if v_id is null then return null; end if;

  select * into v_profile
  from public.echo_public_profiles ep
  where ep.user_id=v_id;

  select to_jsonb(c) into v_card
  from public.echo_public_identity_cards_v1(array[v_id]) c
  limit 1;
  if v_card is null then return null; end if;

  v_authority:=coalesce(v_card->>'institutional_role','member');
  v_scout_eligible:=private.echo_is_scout_eligible_v1(v_id);
  v_tier:=case when v_scout_eligible then coalesce(v_card->>'community_tier','member') else null end;

  v_authority_label:=case v_authority
    when 'founder' then 'Founder'
    when 'admin' then 'Admin'
    when 'developer' then 'Developer'
    when 'moderator' then 'Moderator'
    when 'partner' then 'Partner'
    when 'creator' then 'Creator'
    else 'Membro'
  end;

  v_tier_label:=case v_tier
    when 'member' then 'Member'
    when 'echo_scout' then 'Echo Scout'
    when 'tracker' then 'Rastreador'
    when 'cartographer' then 'Cartógrafo'
    when 'analyst' then 'Analista'
    when 'vanguard' then 'Vanguarda'
    when 'arena_legend' then 'Lenda da Arena'
    else null
  end;

  v_frame:=case
    when v_authority<>'member' then 'authority-'||v_authority
    else 'scout-'||coalesce(v_tier,'member')
  end;

  select coalesce(jsonb_agg(x order by x.submitted_at desc),'[]'::jsonb)
  into v_recent
  from (
    select
      c.contribution_type,c.subject_key,c.game_version,c.status,
      c.is_first_discovery,c.submitted_at,c.reviewed_at
    from public.echo_research_contributions c
    where v_scout_eligible
      and c.contributor_id=v_id
      and c.status in ('corroborated','verified')
    order by c.submitted_at desc
    limit 30
  ) x;

  return jsonb_build_object(
    'profile_experience_version','v3-shadow',
    'scout_eligible',v_scout_eligible,
    'identity',jsonb_build_object(
      'public_handle',v_card->>'public_handle',
      'display_name',v_card->>'display_name',
      'avatar_url',v_card->>'avatar_url',
      'bio',v_profile.bio,
      'profile_accent',v_profile.profile_accent,
      'scout_eligible',v_scout_eligible,
      'community_tier',v_tier,
      'verified_count',case when v_scout_eligible then coalesce((v_card->>'verified_count')::integer,0) else null end,
      'first_discoveries',case when v_scout_eligible then coalesce((v_card->>'first_discoveries')::integer,0) else null end,
      'institutional_role',v_authority,
      'institutional_badges',coalesce(v_card->'institutional_badges','[]'::jsonb)
    ),
    'visual_identity',jsonb_build_object(
      'authority',v_authority,
      'authority_label',v_authority_label,
      'scout_eligible',v_scout_eligible,
      'community_tier',v_tier,
      'community_tier_label',v_tier_label,
      'frame_key',v_frame
    ),
    'recent_contributions',case when v_scout_eligible then v_recent else '[]'::jsonb end
  );
end;
$$;

create or replace function public.echo_my_research_missions_v5()
returns table(
  mission_key text,title text,description text,icon_key text,metric_key text,
  current_value integer,target_value integer,completed boolean,policy_version text,awards_reputation boolean
)
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and coalesce(p.is_blocked,false)=false) then
    raise exception 'active_profile_required' using errcode='42501';
  end if;
  if not private.echo_is_scout_eligible_v1(v_uid) then return; end if;

  return query
  with snapshot as (
    select
      coalesce(r.accepted_count,0)::integer as accepted_knowledge,
      coalesce(r.verified_count,0)::integer as verified_knowledge,
      coalesce(r.decided_count,0)::integer as decided_knowledge,
      coalesce(r.first_discoveries,0)::integer as first_discoveries,
      coalesce((
        select count(*)::integer
        from public.echo_community_specialty_stats s
        where s.user_id=v_uid and s.scout_eligible=true and s.accepted_count>0
      ),0)::integer as active_specialties
    from (select 1) seed
    left join public.echo_community_reputation r
      on r.user_id=v_uid and r.scout_eligible=true
  ), progress as (
    select
      m.*,
      case m.metric_key
        when 'accepted_knowledge' then s.accepted_knowledge
        when 'verified_knowledge' then s.verified_knowledge
        when 'decided_knowledge' then s.decided_knowledge
        when 'first_discoveries' then s.first_discoveries
        when 'active_specialties' then s.active_specialties
        else 0
      end::integer as value_now
    from public.echo_research_mission_catalog m
    cross join snapshot s
    where m.active=true and m.policy_version='missions-v5-shadow'
  )
  select
    p.mission_key,p.title,p.description,p.icon_key,p.metric_key,
    p.value_now,p.target_value,(p.value_now>=p.target_value),p.policy_version,false
  from progress p
  order by p.sort_order;
end;
$$;

create or replace function public.echo_my_research_guardrails_v5()
returns jsonb
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_policy public.echo_research_guardrail_policy%rowtype;
  v_recent integer;
  v_pending integer;
  v_awaiting integer;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and coalesce(p.is_blocked,false)=false) then
    raise exception 'active_profile_required' using errcode='42501';
  end if;
  if not private.echo_is_scout_eligible_v1(v_uid) then
    return jsonb_build_object(
      'scout_eligible',false,
      'participation','institutional',
      'missions_award_reputation',false
    );
  end if;

  select * into v_policy from public.echo_research_guardrail_policy where singleton=true;
  if not found then raise exception 'research_guardrail_policy_missing' using errcode='55000'; end if;

  select count(*)::integer into v_recent
  from public.echo_research_contributions c
  where c.contributor_id=v_uid
    and c.submitted_at>now()-(v_policy.submission_window_minutes*interval '1 minute');

  select
    count(*) filter(where c.status='pending')::integer,
    count(*) filter(where c.review_confirmation_state='awaiting_confirmation')::integer
  into v_pending,v_awaiting
  from public.echo_research_contributions c
  where c.contributor_id=v_uid;

  return jsonb_build_object(
    'scout_eligible',true,
    'policy_version',v_policy.policy_version,
    'submission_window_minutes',v_policy.submission_window_minutes,
    'max_submissions_per_window',v_policy.max_submissions_per_window,
    'submissions_in_window',coalesce(v_recent,0),
    'submissions_remaining',greatest(0,v_policy.max_submissions_per_window-coalesce(v_recent,0)),
    'max_pending_per_member',v_policy.max_pending_per_member,
    'pending_total',coalesce(v_pending,0),
    'pending_capacity_remaining',greatest(0,v_policy.max_pending_per_member-coalesce(v_pending,0)),
    'max_pending_per_member_knowledge',v_policy.max_pending_per_member_knowledge,
    'knowledge_cooldown_minutes',v_policy.knowledge_cooldown_minutes,
    'awaiting_independent_confirmation',coalesce(v_awaiting,0),
    'independent_confirmation_required',v_policy.independent_confirmation_required,
    'missions_award_reputation',false,
    'scoring_mode','confirmed_current_decision_only'
  );
end;
$$;

update public.echo_community_reputation r
set scout_eligible=private.echo_is_scout_eligible_v1(r.user_id),updated_at=now()
where r.scout_eligible is distinct from private.echo_is_scout_eligible_v1(r.user_id);

update public.echo_community_specialty_stats s
set scout_eligible=private.echo_is_scout_eligible_v1(s.user_id),updated_at=now()
where s.scout_eligible is distinct from private.echo_is_scout_eligible_v1(s.user_id);

comment on column public.echo_community_reputation.scout_eligible is
  'False for Founder/Admin identities. Stored history is preserved but excluded from Echo Scouts progression.';
comment on column public.echo_community_specialty_stats.scout_eligible is
  'False for Founder/Admin identities. Institutional work never grants community specialty ranks.';
comment on function private.echo_is_scout_eligible_v1(uuid) is
  'Single server-side rule: Founder and Admin identities do not participate in Echo Scouts.';

commit;
