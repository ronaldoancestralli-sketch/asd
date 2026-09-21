-- Echo Identity V4 Shadow — proteção contra e-mail como identidade visual.
-- Destino exclusivo: Supabase SNV. Não habilita rollout público.

begin;

create or replace function public.echo_identity_display_name_looks_like_email(p_display text)
returns boolean
language sql
immutable
set search_path=''
as $$
  select btrim(coalesce(p_display,'')) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
$$;
revoke all on function public.echo_identity_display_name_looks_like_email(text) from public,anon,authenticated;
grant execute on function public.echo_identity_display_name_looks_like_email(text) to service_role;

comment on function public.echo_identity_display_name_looks_like_email(text) is
  'Barreira de privacidade: e-mail não pode virar identidade visual pública por legado ou input do usuário.';

-- ---------------------------------------------------------------------------
-- 1. Editor próprio: recusa e-mail como display_name.
-- ---------------------------------------------------------------------------
create or replace function public.echo_set_my_public_identity_v1(
  p_handle text,
  p_display_name text,
  p_bio text default null,
  p_accent text default 'violet',
  p_visibility text default 'public',
  p_allow_messages boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_handle text := lower(btrim(coalesce(p_handle,'')));
  v_display text := btrim(coalesce(p_display_name,''));
  v_bio text := nullif(btrim(coalesce(p_bio,'')), '');
  v_current public.echo_public_profiles%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and coalesce(p.is_blocked,false)=false) then
    raise exception 'active_profile_required' using errcode='42501';
  end if;
  if v_handle !~ '^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])$' then
    raise exception 'invalid_public_handle' using errcode='22023';
  end if;
  if public.echo_identity_handle_reserved(v_handle) then
    raise exception 'reserved_public_handle' using errcode='22023';
  end if;
  if char_length(v_display) not between 2 and 40 then
    raise exception 'invalid_display_name' using errcode='22023';
  end if;
  if public.echo_identity_display_name_looks_like_email(v_display) then
    raise exception 'display_name_email_not_allowed' using errcode='22023';
  end if;
  if public.echo_identity_display_name_has_invisible(v_display) then
    raise exception 'display_name_invisible_characters' using errcode='22023';
  end if;
  if public.echo_identity_display_name_reserved(v_display) then
    raise exception 'display_name_reserved' using errcode='22023';
  end if;
  if v_bio is not null and char_length(v_bio)>240 then raise exception 'bio_too_long' using errcode='22023'; end if;
  if p_accent not in ('violet','cyan','gold','emerald','rose','steel') then raise exception 'invalid_profile_accent' using errcode='22023'; end if;
  if p_visibility not in ('public','private') then raise exception 'invalid_profile_visibility' using errcode='22023'; end if;
  if p_visibility='public' and not exists(
    select 1 from public.echo_identity_rollout_settings s
    where s.singleton=true and s.public_identity_enabled=true and s.public_profiles_enabled=true
  ) then
    raise exception 'identity_public_rollout_disabled' using errcode='42501';
  end if;

  insert into public.echo_public_profiles(user_id,public_handle,profile_visibility)
  values(v_uid,public.echo_identity_generated_handle(v_uid),'private')
  on conflict(user_id) do nothing;

  select * into v_current from public.echo_public_profiles where user_id=v_uid for update;
  if v_current.public_handle<>v_handle
     and v_current.public_handle<>public.echo_identity_generated_handle(v_uid)
     and v_current.handle_changed_at is not null
     and v_current.handle_changed_at>now()-interval '30 days' then
    raise exception 'handle_change_cooldown' using errcode='42501';
  end if;

  begin
    update public.echo_public_profiles
    set public_handle=v_handle,bio=v_bio,profile_accent=p_accent,profile_visibility=p_visibility,
        allow_messages=coalesce(p_allow_messages,false),profile_completed_at=coalesce(profile_completed_at,now()),
        handle_changed_at=case when public_handle is distinct from v_handle then now() else handle_changed_at end
    where user_id=v_uid;
  exception when unique_violation then
    raise exception 'public_handle_unavailable' using errcode='23505';
  end;

  update public.profiles set display_name=v_display where id=v_uid;
  return jsonb_build_object(
    'user_id',v_uid,'public_handle',v_handle,'display_name',v_display,'bio',v_bio,
    'profile_accent',p_accent,'profile_visibility',p_visibility,'allow_messages',coalesce(p_allow_messages,false)
  );
end;
$$;
revoke all on function public.echo_set_my_public_identity_v1(text,text,text,text,text,boolean) from public,anon;
grant execute on function public.echo_set_my_public_identity_v1(text,text,text,text,text,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Cards públicos: defesa para registros legados. Nunca devolve e-mail como nome.
-- ---------------------------------------------------------------------------
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
    coalesce(r.community_tier,'member'),coalesce(r.reputation_points,0),coalesce(r.verified_count,0),coalesce(r.first_discoveries,0),
    case
      when exists(select 1 from public.echo_founder_authority f where f.user_id=p.id) then 'founder'
      when lower(coalesce(p.role,''))='admin' or coalesce(p.is_admin,false)=true then 'admin'
      when exists(select 1 from public.echo_identity_badges b where b.user_id=p.id and b.badge_type='developer' and b.active=true) then 'developer'
      when exists(select 1 from public.echo_identity_badges b where b.user_id=p.id and b.badge_type='moderator' and b.active=true) then 'moderator'
      when exists(select 1 from public.echo_identity_badges b where b.user_id=p.id and b.badge_type='partner' and b.active=true) then 'partner'
      when exists(select 1 from public.echo_identity_badges b where b.user_id=p.id and b.badge_type='creator' and b.active=true) then 'creator'
      else 'member'
    end,
    coalesce((select jsonb_agg(b.badge_type order by case b.badge_type when 'developer' then 1 when 'moderator' then 2 when 'partner' then 3 else 4 end)
      from public.echo_identity_badges b where b.user_id=p.id and b.active=true),'[]'::jsonb)
  from public.profiles p
  join public.echo_public_profiles ep on ep.user_id=p.id and ep.profile_visibility='public'
  left join public.echo_community_reputation r on r.user_id=p.id
  where p.id=any(p_user_ids)
    and ep.profile_completed_at is not null
    and coalesce(p.is_blocked,false)=false;
end;
$$;
revoke all on function public.echo_public_identity_cards_v1(uuid[]) from public;
grant execute on function public.echo_public_identity_cards_v1(uuid[]) to anon,authenticated;

commit;
