-- Echo Identity V4 Shadow — Creator authority grant guard.
-- Destino exclusivo: Supabase SNV. Não habilita rollout.
-- Creator pode ser revogado por Admin AAL2, mas só pode ser concedido por claim verificado.

begin;

-- ---------------------------------------------------------------------------
-- 1. RPC genérica de badges não pode mais conceder Creator manualmente.
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
  if not public.echo_is_admin() then
    raise exception 'admin_aal2_required' using errcode='42501';
  end if;
  if p_badge_type not in ('creator','partner','moderator','developer') then
    raise exception 'institutional_badge_not_allowed' using errcode='22023';
  end if;
  if p_badge_type='creator' and coalesce(p_active,false)=true then
    raise exception 'creator_badge_requires_verified_claim' using errcode='42501';
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
-- 2. Review Creator é o único caminho autenticado que concede esse badge.
-- A concessão acontece somente depois de o claim virar verified e passar
-- pelos checks de expiração/canonicalização/unicidade.
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
      active=true,
      reference_url=excluded.reference_url,
      grant_reason=excluded.grant_reason,
      granted_by=auth.uid(),
      granted_at=now(),
      revoked_by=null,
      revoked_at=null;
  end if;

  return jsonb_build_object('claim_id',p_claim_id,'status',p_decision,'user_id',v_claim.user_id);
end;
$$;
revoke all on function public.admin_review_creator_claim_v1(uuid,text,text) from public,anon;
grant execute on function public.admin_review_creator_claim_v1(uuid,text,text) to authenticated;

comment on function public.admin_set_identity_badge_v1(uuid,text,boolean,text,text) is
  'Admin AAL2 gerencia badges institucionais. Creator=true é proibido aqui e exige claim verificado; Creator=false continua permitido para revogação.';

commit;
