-- Echo Identity Profile Experience V3 — Shadow.
-- Evolui o perfil público existente sem criar nova superfície SECURITY DEFINER.
-- Destino exclusivo: Supabase SNV. Os gates da Identity V2 continuam desligados por padrão.

begin;

-- ---------------------------------------------------------------------------
-- Perfil público V1 evoluído de forma aditiva.
-- Mantém a mesma assinatura e a mesma fronteira de autorização já auditada.
-- Nunca retorna e-mail, role bruto, is_admin, is_blocked, pontos, payload de
-- evidência, códigos Creator ou notas administrativas.
-- ---------------------------------------------------------------------------
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
  v_tier text:='member';
  v_frame text:='scout-member';
  v_authority_label text:='Membro';
  v_tier_label text:='Member';
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
  v_tier:=coalesce(v_card->>'community_tier','member');

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
    when 'echo_scout' then 'Echo Scout'
    when 'tracker' then 'Rastreador'
    when 'cartographer' then 'Cartógrafo'
    when 'analyst' then 'Analista'
    when 'vanguard' then 'Vanguarda'
    when 'arena_legend' then 'Lenda da Arena'
    else 'Member'
  end;

  v_frame:=case
    when v_authority<>'member' then 'authority-'||v_authority
    else 'scout-'||v_tier
  end;

  select coalesce(jsonb_agg(x order by x.submitted_at desc),'[]'::jsonb)
  into v_recent
  from (
    select
      c.contribution_type,
      c.subject_key,
      c.game_version,
      c.status,
      c.is_first_discovery,
      c.submitted_at,
      c.reviewed_at
    from public.echo_research_contributions c
    where c.contributor_id=v_id
      and c.status in ('corroborated','verified')
    order by c.submitted_at desc
    limit 30
  ) x;

  return jsonb_build_object(
    'profile_experience_version','v3-shadow',
    'identity',jsonb_build_object(
      'public_handle',v_card->>'public_handle',
      'display_name',v_card->>'display_name',
      'avatar_url',v_card->>'avatar_url',
      'bio',v_profile.bio,
      'profile_accent',v_profile.profile_accent,
      'community_tier',v_tier,
      'verified_count',coalesce((v_card->>'verified_count')::integer,0),
      'first_discoveries',coalesce((v_card->>'first_discoveries')::integer,0),
      'institutional_role',v_authority,
      'institutional_badges',coalesce(v_card->'institutional_badges','[]'::jsonb)
    ),
    'visual_identity',jsonb_build_object(
      'authority',v_authority,
      'authority_label',v_authority_label,
      'community_tier',v_tier,
      'community_tier_label',v_tier_label,
      'frame_key',v_frame
    ),
    'recent_contributions',v_recent
  );
end;
$$;
revoke all on function public.echo_public_profile_v1(text) from public;
grant execute on function public.echo_public_profile_v1(text) to anon,authenticated;

comment on function public.echo_public_profile_v1(text) is
  'Perfil público Echo Identity V3. Fail-closed pelos gates V2; identidade visual é derivada no servidor e o histórico expõe somente contribuições revisadas sanitizadas.';

commit;
