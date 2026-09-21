-- Echo Identity — Review Independence V2 em Shadow.
-- Revisar o próprio dado pode ser necessário operacionalmente, mas não pode gerar reputação,
-- primeira descoberta ou reconhecimento institucional para a mesma conta.
-- Destino exclusivo: Supabase SNV.

begin;

-- Falha fechada se já existir primeira descoberta auto-revisada no histórico.
do $$
begin
  if exists(
    select 1
    from public.echo_research_contributions c
    where c.status='verified'
      and c.is_first_discovery=true
      and c.reviewed_by=c.contributor_id
  ) then
    raise exception 'self_reviewed_first_discovery_requires_review' using errcode='23514';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Reputação conta somente decisões feitas por outra conta.
-- Evidência própria pode continuar verificada para uso operacional, sem premiar o revisor/contribuidor.
-- ---------------------------------------------------------------------------
create or replace function public.echo_recompute_community_reputation(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_verified integer;
  v_corroborated integer;
  v_first integer;
  v_decided integer;
  v_accepted integer;
  v_points integer;
  v_rate numeric(5,4);
  v_tier text := 'member';
  v_policy text;
  v_verified_points integer;
  v_corroborated_points integer;
  v_first_bonus integer;
begin
  select m.policy_version,m.verified_points,m.corroborated_points,m.first_discovery_bonus
  into v_policy,v_verified_points,v_corroborated_points,v_first_bonus
  from public.echo_reputation_policy_meta m
  where m.singleton=true;

  if v_policy is null then
    raise exception 'reputation_policy_missing' using errcode='55000';
  end if;

  with grouped as (
    select
      c.knowledge_fingerprint,
      bool_or(c.status='verified' and c.reviewed_by is distinct from c.contributor_id) as has_verified,
      bool_or(c.status='corroborated' and c.reviewed_by is distinct from c.contributor_id) as has_corroborated,
      bool_or(c.status='contested' and c.reviewed_by is distinct from c.contributor_id) as has_contested,
      bool_or(c.status='rejected' and c.reviewed_by is distinct from c.contributor_id) as has_rejected,
      bool_or(c.status='verified' and c.is_first_discovery=true and c.reviewed_by is distinct from c.contributor_id) as has_first
    from public.echo_research_contributions c
    where c.contributor_id=p_user_id
    group by c.knowledge_fingerprint
  ), normalized as (
    select
      case
        when has_verified then 'verified'
        when has_corroborated then 'corroborated'
        when has_contested then 'contested'
        when has_rejected then 'rejected'
        else 'neutral'
      end as effective_status,
      has_first
    from grouped
  )
  select
    count(*) filter(where effective_status='verified')::integer,
    count(*) filter(where effective_status='corroborated')::integer,
    count(*) filter(where has_first=true)::integer,
    count(*) filter(where effective_status in ('verified','corroborated','rejected','contested'))::integer
  into v_verified,v_corroborated,v_first,v_decided
  from normalized;

  v_verified:=coalesce(v_verified,0);
  v_corroborated:=coalesce(v_corroborated,0);
  v_first:=coalesce(v_first,0);
  v_decided:=coalesce(v_decided,0);
  v_accepted:=v_verified+v_corroborated;
  v_points:=v_verified*v_verified_points + v_corroborated*v_corroborated_points + v_first*v_first_bonus;
  v_rate:=case when v_decided=0 then 0 else least(1,greatest(0,v_accepted::numeric/v_decided::numeric)) end;

  select r.tier into v_tier
  from public.echo_reputation_tier_rules r
  where r.policy_version=v_policy
    and v_points>=r.min_points
    and v_verified>=r.min_verified
    and v_first>=r.min_first_discoveries
    and v_rate>=r.min_acceptance_rate
  order by r.ordinal desc
  limit 1;
  v_tier:=coalesce(v_tier,'member');

  insert into public.echo_community_reputation(
    user_id,reputation_points,community_tier,verified_count,corroborated_count,first_discoveries,
    acceptance_rate,accepted_count,decided_count,policy_version,updated_at
  ) values(
    p_user_id,v_points,v_tier,v_verified,v_corroborated,v_first,
    v_rate,v_accepted,v_decided,v_policy,now()
  )
  on conflict(user_id) do update set
    reputation_points=excluded.reputation_points,
    community_tier=excluded.community_tier,
    verified_count=excluded.verified_count,
    corroborated_count=excluded.corroborated_count,
    first_discoveries=excluded.first_discoveries,
    acceptance_rate=excluded.acceptance_rate,
    accepted_count=excluded.accepted_count,
    decided_count=excluded.decided_count,
    policy_version=excluded.policy_version,
    updated_at=now();
end;
$$;
revoke all on function public.echo_recompute_community_reputation(uuid) from public,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 2. Primeira descoberta exige revisor independente.
-- Status normal pode ser revisto pelo próprio Admin, mas não gera reputação por causa do recompute acima.
-- ---------------------------------------------------------------------------
create or replace function public.admin_review_research_contribution_v1(
  p_contribution_id uuid,
  p_status text,
  p_note text default null,
  p_first_discovery boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row public.echo_research_contributions%rowtype;
begin
  if not public.echo_is_admin() then raise exception 'admin_aal2_required' using errcode='42501'; end if;
  if p_status not in ('corroborated','verified','rejected','contested','superseded') then
    raise exception 'invalid_research_review_status' using errcode='22023';
  end if;
  if coalesce(p_first_discovery,false) and p_status<>'verified' then
    raise exception 'first_discovery_requires_verified' using errcode='22023';
  end if;
  if p_note is not null and char_length(p_note)>1600 then
    raise exception 'research_review_note_too_long' using errcode='22023';
  end if;

  select * into v_row from public.echo_research_contributions where id=p_contribution_id for update;
  if not found then raise exception 'research_contribution_not_found' using errcode='22023'; end if;

  if coalesce(p_first_discovery,false) then
    if v_row.contributor_id=auth.uid() then
      raise exception 'first_discovery_self_review_not_allowed' using errcode='42501';
    end if;
    if v_row.knowledge_fingerprint is null then
      raise exception 'first_discovery_knowledge_missing' using errcode='55000';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_row.knowledge_fingerprint,0));
    if exists(
      select 1 from public.echo_research_contributions c
      where c.id<>p_contribution_id
        and c.knowledge_fingerprint=v_row.knowledge_fingerprint
        and c.status='verified'
        and c.is_first_discovery=true
    ) then
      raise exception 'first_discovery_already_claimed' using errcode='23505';
    end if;
  end if;

  update public.echo_research_contributions
  set status=p_status,
      is_first_discovery=coalesce(p_first_discovery,false),
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      review_note=nullif(btrim(coalesce(p_note,'')),'')
  where id=p_contribution_id;

  return jsonb_build_object(
    'contribution_id',p_contribution_id,
    'status',p_status,
    'contributor_id',v_row.contributor_id,
    'first_discovery',coalesce(p_first_discovery,false),
    'independent_review',v_row.contributor_id is distinct from auth.uid()
  );
end;
$$;
revoke all on function public.admin_review_research_contribution_v1(uuid,text,text,boolean) from public,anon;
grant execute on function public.admin_review_research_contribution_v1(uuid,text,text,boolean) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 3. Badges institucionais não podem ser auto-concedidos pelo Admin.
-- Revogação própria continua permitida.
-- Creator=true já era proibido nesta RPC e continua exclusivo do claim.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_identity_badge_v1(
  p_user_id uuid,
  p_badge_type text,
  p_active boolean,
  p_reason text default null,
  p_reference_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.echo_is_admin() then raise exception 'admin_aal2_required' using errcode='42501'; end if;
  if p_badge_type not in ('creator','partner','moderator','developer') then
    raise exception 'institutional_badge_not_allowed' using errcode='22023';
  end if;
  if p_badge_type='creator' and coalesce(p_active,false)=true then
    raise exception 'creator_badge_requires_verified_claim' using errcode='42501';
  end if;
  if coalesce(p_active,false)=true and p_user_id=auth.uid() then
    raise exception 'institutional_badge_self_grant_not_allowed' using errcode='42501';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id and coalesce(p.is_blocked,false)=false) then
    raise exception 'target_profile_unavailable' using errcode='22023';
  end if;
  if p_reference_url is not null and p_reference_url !~ '^https://' then
    raise exception 'reference_url_must_be_https' using errcode='22023';
  end if;

  insert into public.echo_identity_badges(
    user_id,badge_type,active,reference_url,grant_reason,granted_by,granted_at,revoked_by,revoked_at
  ) values(
    p_user_id,p_badge_type,coalesce(p_active,false),p_reference_url,nullif(btrim(coalesce(p_reason,'')),''),
    case when p_active then auth.uid() else null end,now(),
    case when not p_active then auth.uid() else null end,case when not p_active then now() else null end
  )
  on conflict(user_id,badge_type) do update set
    active=excluded.active,
    reference_url=coalesce(excluded.reference_url,public.echo_identity_badges.reference_url),
    grant_reason=coalesce(excluded.grant_reason,public.echo_identity_badges.grant_reason),
    granted_by=case when excluded.active then auth.uid() else public.echo_identity_badges.granted_by end,
    granted_at=case when excluded.active then now() else public.echo_identity_badges.granted_at end,
    revoked_by=case when excluded.active then null else auth.uid() end,
    revoked_at=case when excluded.active then null else now() end;

  return jsonb_build_object('user_id',p_user_id,'badge_type',p_badge_type,'active',coalesce(p_active,false));
end;
$$;
revoke all on function public.admin_set_identity_badge_v1(uuid,text,boolean,text,text) from public,anon;
grant execute on function public.admin_set_identity_badge_v1(uuid,text,boolean,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Creator exige revisor diferente do dono do canal/claim.
-- ---------------------------------------------------------------------------
create or replace function public.admin_review_creator_claim_v1(p_claim_id uuid,p_decision text,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_claim public.echo_creator_claims%rowtype;
begin
  if not public.echo_is_admin() then raise exception 'admin_aal2_required' using errcode='42501'; end if;
  if p_decision not in ('verified','rejected') then raise exception 'invalid_creator_claim_decision' using errcode='22023'; end if;

  select * into v_claim from public.echo_creator_claims where id=p_claim_id for update;
  if not found then raise exception 'creator_claim_not_found' using errcode='22023'; end if;
  if v_claim.status<>'pending' then raise exception 'creator_claim_already_reviewed' using errcode='22023'; end if;
  if p_decision='verified' and v_claim.user_id=auth.uid() then
    raise exception 'creator_self_review_not_allowed' using errcode='42501';
  end if;
  if p_decision='verified' and v_claim.expires_at<=now() then
    update public.echo_creator_claims
      set status='expired',reviewed_by=auth.uid(),reviewed_at=now(),review_note='Desafio expirado antes da verificação.'
    where id=p_claim_id;
    raise exception 'creator_claim_expired' using errcode='22023';
  end if;
  if p_decision='verified' and v_claim.canonical_channel_url is null then
    raise exception 'creator_claim_requires_reissue' using errcode='22023';
  end if;
  if p_decision='verified' and v_claim.channel_fingerprint<>public.echo_creator_channel_fingerprint(v_claim.canonical_channel_url) then
    raise exception 'creator_claim_canonical_integrity_failed' using errcode='23514';
  end if;
  if p_decision='verified' and exists(
    select 1 from public.echo_creator_claims c
    where c.id<>p_claim_id and c.channel_fingerprint=v_claim.channel_fingerprint and c.status='verified'
  ) then
    raise exception 'creator_channel_already_verified' using errcode='23505';
  end if;

  begin
    update public.echo_creator_claims
    set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(btrim(coalesce(p_note,'')),'')
    where id=p_claim_id;
  exception when unique_violation then
    raise exception 'creator_channel_already_verified' using errcode='23505';
  end;

  if p_decision='verified' then
    insert into public.echo_identity_badges(
      user_id,badge_type,active,reference_url,grant_reason,granted_by,granted_at,revoked_by,revoked_at
    ) values(
      v_claim.user_id,'creator',true,v_claim.canonical_channel_url,
      'Canal verificado por desafio EchoArena',auth.uid(),now(),null,null
    )
    on conflict(user_id,badge_type) do update set
      active=true,reference_url=excluded.reference_url,grant_reason=excluded.grant_reason,
      granted_by=auth.uid(),granted_at=now(),revoked_by=null,revoked_at=null;
  end if;

  return jsonb_build_object('claim_id',p_claim_id,'status',p_decision,'user_id',v_claim.user_id);
end;
$$;
revoke all on function public.admin_review_creator_claim_v1(uuid,text,text) from public,anon;
grant execute on function public.admin_review_creator_claim_v1(uuid,text,text) to authenticated;

-- Recalcula materialização existente para retirar qualquer crédito de auto-revisão.
do $$
declare r record;
begin
  for r in select p.id from public.profiles p loop
    perform public.echo_recompute_community_reputation(r.id);
  end loop;
end $$;

comment on function public.echo_recompute_community_reputation(uuid) is
  'Reputação quality-v2 por conhecimento único e revisão independente; decisões auto-revisadas não contam para pontos, taxa ou tier.';
comment on function public.admin_review_research_contribution_v1(uuid,text,text,boolean) is
  'Admin AAL2 pode revisar dado próprio por necessidade operacional, mas não recebe reputação e não pode atribuir a si Primeira descoberta.';
comment on function public.admin_review_creator_claim_v1(uuid,text,text) is
  'Creator Verification exige Admin AAL2 diferente do proprietário do claim.';

commit;
