-- EchoArena — códigos promocionais do Bullet Echo: somente fontes oficiais globais.
-- Mantém a origem verificável no banco, não apenas na interface.

create or replace function private.promo_is_official_bullet_echo_source(
  p_source_name text,
  p_source_url text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_source_name, ''));
  v_url text := lower(btrim(coalesce(p_source_url, '')));
begin
  if v_url !~ '^https://' then
    return false;
  end if;

  return case v_name
    when 'ZeptoLab — Bullet Echo / notícias' then
      v_url ~ '^https://(www\.)?zeptolab\.com/(games/bullet-echo(?:[/?#]|$)|news(?:[/?#]|$))'
    when 'ZeptoLab Support — Bullet Echo' then
      v_url ~ '^https://zepto\.helpshift\.com/hc/[^/]+/10-bullet-echo(?:[/?#]|$)'
    when 'Bullet Echo — anúncio no jogo' then
      v_url ~ '^https://((www\.)?zeptolab\.com/(news(?:[/?#]|$)|games/bullet-echo(?:[/?#]|$))|zepto\.helpshift\.com/hc/[^/]+/10-bullet-echo(?:[/?#]|$))'
    when 'Bullet Echo — Loja oficial' then
      v_url ~ '^https://shop\.bulletecho\.game(?:[/?#]|$)'
    when 'Bullet Echo — Discord oficial' then
      v_url ~ '^https://(discord\.gg/u4appb7(?:[/?#]|$)|discord\.com/(invite/u4appb7(?:[/?#]|$)|channels/))'
    when 'Bullet Echo — X oficial' then
      v_url ~ '^https://(www\.)?(x\.com|twitter\.com)/(bulletecho|bullet_echo)(?:[/?#]|$)'
    when 'Bullet Echo — YouTube oficial' then
      v_url ~ '^https://(www\.)?(youtube\.com|youtu\.be)(?:[/?#]|$)'
    when 'Bullet Echo — Facebook oficial' then
      v_url ~ '^https://(www\.)?facebook\.com(?:[/?#]|$)'
    when 'Bullet Echo — Instagram oficial' then
      v_url ~ '^https://(www\.)?instagram\.com(?:[/?#]|$)'
    when 'Bullet Echo — Telegram oficial (RU/global)' then
      v_url ~ '^https://t\.me/(s/)?bulletecho(?:[/?#]|$)'
    when 'Bullet Echo — Google Play oficial' then
      v_url ~ '^https://play\.google\.com/store/apps/details\?' and
      position('id=com.zeptolab.bulletecho.google' in v_url) > 0
    when 'Bullet Echo — App Store oficial' then
      v_url ~ '^https://apps\.apple\.com/' and
      position('id1500726361' in v_url) > 0
    when 'ZeptoLab — X oficial' then
      v_url ~ '^https://(www\.)?(x\.com|twitter\.com)/zeptolab(?:[/?#]|$)'
    when 'ZeptoLab — Instagram oficial' then
      v_url ~ '^https://(www\.)?instagram\.com/zeptolab(?:[/?#]|$)'
    when 'ZeptoLab — Facebook oficial' then
      v_url ~ '^https://(www\.)?facebook\.com/zeptolab(?:[/?#]|$)'
    else false
  end;
end;
$$;

revoke all on function private.promo_is_official_bullet_echo_source(text, text)
  from public, anon, authenticated;

alter table public.promo_campaigns
  drop constraint if exists promo_campaigns_bullet_echo_only_check;
alter table public.promo_campaigns
  add constraint promo_campaigns_bullet_echo_only_check
  check (btrim(game) = 'Bullet Echo');

alter table public.promo_campaigns
  drop constraint if exists promo_campaigns_official_source_only_check;
alter table public.promo_campaigns
  add constraint promo_campaigns_official_source_only_check
  check (
    source_type = 'official'
    and private.promo_is_official_bullet_echo_source(source_name, source_url)
  );

create or replace function public.promo_admin_save(
  p_id uuid,
  p_game text,
  p_title text,
  p_reward text,
  p_banner_label text,
  p_banner_message text,
  p_source_type text,
  p_source_name text,
  p_source_url text,
  p_verification_status text,
  p_verification_method text,
  p_discovered_at timestamptz,
  p_verified_at timestamptz,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_status text,
  p_published boolean,
  p_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_id, pg_catalog.gen_random_uuid());
  v_actor uuid := auth.uid();
  v_verified_at timestamptz := p_verified_at;
begin
  if not public.echo_is_admin() then
    raise exception 'admin_aal2_required' using errcode = '42501';
  end if;

  if btrim(coalesce(p_game, '')) <> 'Bullet Echo' then
    raise exception 'promo_game_must_be_bullet_echo' using errcode = '22023';
  end if;

  if p_source_type <> 'official'
     or not private.promo_is_official_bullet_echo_source(p_source_name, p_source_url) then
    raise exception 'promo_official_source_required' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_title, '')), '') is null
     or nullif(btrim(coalesce(p_source_name, '')), '') is null
     or nullif(btrim(coalesce(p_source_url, '')), '') is null
     or p_source_url !~* '^https://'
     or nullif(btrim(coalesce(p_code, '')), '') is null then
    raise exception 'invalid_promo_payload' using errcode = '22023';
  end if;

  if coalesce(p_published, false)
     and (p_verification_status <> 'verified' or p_status <> 'active') then
    raise exception 'published_promo_must_be_verified_and_active' using errcode = '22023';
  end if;

  if p_verification_status = 'verified' and v_verified_at is null then
    v_verified_at := now();
  end if;

  insert into public.promo_campaigns(
    id, game, title, reward, banner_label, banner_message,
    source_type, source_name, source_url, verification_status,
    verification_method, discovered_at, verified_at, starts_at, expires_at,
    status, published, created_by, updated_by, created_at, updated_at
  ) values (
    v_id, 'Bullet Echo', btrim(p_title), nullif(btrim(coalesce(p_reward, '')), ''),
    btrim(p_banner_label), btrim(p_banner_message), 'official',
    btrim(p_source_name), btrim(p_source_url), p_verification_status,
    nullif(btrim(coalesce(p_verification_method, '')), ''),
    coalesce(p_discovered_at, now()), v_verified_at, p_starts_at, p_expires_at,
    p_status, coalesce(p_published, false), v_actor, v_actor, now(), now()
  )
  on conflict (id) do update set
    game = 'Bullet Echo',
    title = excluded.title,
    reward = excluded.reward,
    banner_label = excluded.banner_label,
    banner_message = excluded.banner_message,
    source_type = 'official',
    source_name = excluded.source_name,
    source_url = excluded.source_url,
    verification_status = excluded.verification_status,
    verification_method = excluded.verification_method,
    discovered_at = excluded.discovered_at,
    verified_at = excluded.verified_at,
    starts_at = excluded.starts_at,
    expires_at = excluded.expires_at,
    status = excluded.status,
    published = excluded.published,
    updated_by = v_actor,
    updated_at = now();

  insert into private.promo_secrets(promo_id, code, updated_by, updated_at)
  values (v_id, btrim(p_code), v_actor, now())
  on conflict (promo_id) do update set
    code = excluded.code,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  return v_id;
end;
$$;

revoke all on function public.promo_admin_save(
  uuid,text,text,text,text,text,text,text,text,text,text,
  timestamptz,timestamptz,timestamptz,timestamptz,text,boolean,text
) from public, anon;
grant execute on function public.promo_admin_save(
  uuid,text,text,text,text,text,text,text,text,text,text,
  timestamptz,timestamptz,timestamptz,timestamptz,text,boolean,text
) to authenticated;
