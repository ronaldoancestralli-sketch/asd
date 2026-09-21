-- Echo Identity V4 Shadow — Creator URL hardening.
-- Destino exclusivo: Supabase SNV. Não habilita rollout público.
-- Preserva a URL enviada para auditoria; propriedade/deduplicação usam URL canônica.

begin;

-- ---------------------------------------------------------------------------
-- 1. Canonicalização conservadora por plataforma.
-- Retorna NULL para URL ambígua, domínio incompatível ou formato não suportado.
-- ---------------------------------------------------------------------------
create or replace function public.echo_creator_canonical_channel_url_v1(
  p_platform text,
  p_url text
)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  v_platform text := lower(btrim(coalesce(p_platform,'')));
  v_url text := btrim(coalesce(p_url,''));
  v_host text;
  v_path text;
  v_value text;
begin
  if v_platform not in ('youtube','twitch','tiktok','instagram','facebook','x','other') then
    return null;
  end if;
  if char_length(v_url) not between 9 and 1000
     or v_url !~ '^https://'
     or v_url ~ '[[:space:][:cntrl:]]' then
    return null;
  end if;

  v_host := lower(substring(v_url from '^https://([^/?#]+)'));
  if v_host is null
     or position('@' in v_host)>0
     or position(':' in v_host)>0
     or position('..' in v_host)>0 then
    return null;
  end if;

  v_path := coalesce(substring(v_url from '^https://[^/?#]+([^?#]*)'),'');
  v_path := regexp_replace(v_path,'/{2,}','/','g');
  v_path := regexp_replace(v_path,'/+$','','g');

  case v_platform
    when 'youtube' then
      if v_host not in ('youtube.com','www.youtube.com','m.youtube.com') then return null; end if;
      if v_path !~ '^/(@[^/]{2,100}|channel/[A-Za-z0-9_-]{10,100}|c/[^/]{1,100}|user/[^/]{1,100})$' then return null; end if;
      return 'https://youtube.com'||v_path;

    when 'twitch' then
      if v_host not in ('twitch.tv','www.twitch.tv','m.twitch.tv') then return null; end if;
      if v_path !~ '^/[A-Za-z0-9_]{3,25}$' then return null; end if;
      return 'https://twitch.tv/'||lower(substring(v_path from 2));

    when 'tiktok' then
      if v_host not in ('tiktok.com','www.tiktok.com','m.tiktok.com') then return null; end if;
      if v_path !~ '^/@[A-Za-z0-9._]{2,32}$' then return null; end if;
      return 'https://tiktok.com/'||lower(substring(v_path from 2));

    when 'instagram' then
      if v_host not in ('instagram.com','www.instagram.com') then return null; end if;
      if v_path !~ '^/[A-Za-z0-9._]{1,30}$' then return null; end if;
      return 'https://instagram.com/'||lower(substring(v_path from 2));

    when 'facebook' then
      if v_host not in ('facebook.com','www.facebook.com','m.facebook.com') then return null; end if;
      if v_path !~ '^/[A-Za-z0-9.]{5,80}$' then return null; end if;
      v_value := lower(substring(v_path from 2));
      if v_value = any(array['watch','groups','marketplace','gaming','events','reel','reels','share','photo','photos','stories','help']::text[]) then
        return null;
      end if;
      return 'https://facebook.com/'||v_value;

    when 'x' then
      if v_host not in ('x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com') then return null; end if;
      if v_path !~ '^/[A-Za-z0-9_]{1,15}$' then return null; end if;
      v_value := lower(substring(v_path from 2));
      if v_value = any(array['home','explore','search','settings','notifications','messages','compose','i']::text[]) then return null; end if;
      return 'https://x.com/'||v_value;

    when 'other' then
      -- "other" permanece revisável por humano, mas não aceita query/fragment
      -- nem hosts sem domínio registrável aparente. Isso evita fingerprints triviais
      -- diferentes do mesmo endereço e URLs locais/internas.
      if v_url ~ '[?#]' then return null; end if;
      if v_host !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,63}$' then return null; end if;
      if char_length(v_path)>512 then return null; end if;
      return 'https://'||v_host||case when v_path='' then '/' else v_path end;
  end case;

  return null;
end;
$$;
revoke all on function public.echo_creator_canonical_channel_url_v1(text,text) from public,anon,authenticated;
grant execute on function public.echo_creator_canonical_channel_url_v1(text,text) to service_role;

comment on function public.echo_creator_canonical_channel_url_v1(text,text) is
  'Canonicaliza URL de canal com allowlist de domínio por plataforma. NULL significa que o claim deve falhar fechado.';

-- ---------------------------------------------------------------------------
-- 2. Guarda URL canônica separada da evidência original.
-- ---------------------------------------------------------------------------
alter table public.echo_creator_claims
  add column if not exists canonical_channel_url text;

alter table public.echo_creator_claims
  drop constraint if exists echo_creator_claims_canonical_https;
alter table public.echo_creator_claims
  add constraint echo_creator_claims_canonical_https
  check (canonical_channel_url is null or canonical_channel_url ~ '^https://');

update public.echo_creator_claims c
set canonical_channel_url=public.echo_creator_canonical_channel_url_v1(c.platform,c.channel_url)
where c.canonical_channel_url is null;

-- Não consolidamos silenciosamente duas identidades Creator já verificadas.
-- Se dados históricos colidirem após canonicalização, a migration para e exige revisão humana.
do $$
begin
  if exists(
    select 1
    from (
      select public.echo_creator_channel_fingerprint(c.canonical_channel_url) as fingerprint
      from public.echo_creator_claims c
      where c.status='verified' and c.canonical_channel_url is not null
      group by public.echo_creator_channel_fingerprint(c.canonical_channel_url)
      having count(*)>1
    ) collisions
  ) then
    raise exception 'creator_canonical_duplicate_requires_review' using errcode='23505';
  end if;
  if exists(
    select 1 from public.echo_creator_claims c
    where c.status='verified' and c.canonical_channel_url is null
  ) then
    raise exception 'verified_creator_claim_requires_canonical_reissue' using errcode='23514';
  end if;
end;
$$;

update public.echo_creator_claims c
set channel_fingerprint=public.echo_creator_channel_fingerprint(c.canonical_channel_url)
where c.canonical_channel_url is not null
  and c.channel_fingerprint is distinct from public.echo_creator_channel_fingerprint(c.canonical_channel_url);

create index if not exists echo_creator_claims_canonical_url_idx
  on public.echo_creator_claims(canonical_channel_url,status,requested_at desc)
  where canonical_channel_url is not null;

alter table public.echo_creator_claims
  drop constraint if exists echo_creator_verified_requires_canonical;
alter table public.echo_creator_claims
  add constraint echo_creator_verified_requires_canonical
  check (status<>'verified' or canonical_channel_url is not null);

-- ---------------------------------------------------------------------------
-- 3. Solicitação Creator: domínio/plataforma + canonical fingerprint no servidor.
-- ---------------------------------------------------------------------------
create or replace function public.echo_request_creator_verification_v1(p_platform text,p_channel_url text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_platform text:=lower(btrim(coalesce(p_platform,'')));
  v_original_url text:=btrim(coalesce(p_channel_url,''));
  v_canonical_url text;
  v_code text;
  v_hash text;
  v_id uuid;
  v_fingerprint text;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and coalesce(p.is_blocked,false)=false) then
    raise exception 'active_profile_required' using errcode='42501';
  end if;
  if not exists(select 1 from public.echo_identity_rollout_settings s where s.singleton=true and s.public_identity_enabled and s.creator_verification_enabled) then
    raise exception 'creator_verification_rollout_disabled' using errcode='42501';
  end if;
  if v_platform not in ('youtube','twitch','tiktok','instagram','facebook','x','other') then
    raise exception 'unsupported_creator_platform' using errcode='22023';
  end if;
  if v_original_url !~ '^https://' or char_length(v_original_url)>1000 then
    raise exception 'invalid_creator_channel_url' using errcode='22023';
  end if;

  v_canonical_url:=public.echo_creator_canonical_channel_url_v1(v_platform,v_original_url);
  if v_canonical_url is null then
    if v_platform='other' then
      raise exception 'invalid_creator_channel_url' using errcode='22023';
    end if;
    raise exception 'creator_channel_platform_mismatch' using errcode='22023';
  end if;

  v_fingerprint:=public.echo_creator_channel_fingerprint(v_canonical_url);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_fingerprint,0));

  if exists(select 1 from public.echo_creator_claims c where c.channel_fingerprint=v_fingerprint and c.status='verified') then
    raise exception 'creator_channel_already_verified' using errcode='23505';
  end if;
  if exists(select 1 from public.echo_creator_claims c where c.user_id=v_uid and c.channel_fingerprint=v_fingerprint and c.status='pending' and c.expires_at>now()) then
    raise exception 'creator_claim_already_pending' using errcode='23505';
  end if;
  if (select count(*) from public.echo_creator_claims c where c.user_id=v_uid and c.requested_at>now()-interval '24 hours')>=5 then
    raise exception 'creator_claim_rate_limited' using errcode='42501';
  end if;
  if (select count(*) from public.echo_creator_claims c where c.user_id=v_uid and c.status='pending' and c.expires_at>now())>=3 then
    raise exception 'too_many_pending_creator_claims' using errcode='42501';
  end if;

  v_code:='ECHO-'||upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,10));
  v_hash:=encode(extensions.digest(convert_to(v_code,'UTF8'),'sha256'),'hex');
  insert into public.echo_creator_claims(
    user_id,platform,channel_url,canonical_channel_url,channel_fingerprint,proof_code,proof_code_hash,expires_at
  ) values(
    v_uid,v_platform,v_original_url,v_canonical_url,v_fingerprint,v_code,v_hash,now()+interval '7 days'
  ) returning id into v_id;

  return jsonb_build_object(
    'claim_id',v_id,
    'proof_code',v_code,
    'canonical_channel_url',v_canonical_url,
    'expires_at',now()+interval '7 days'
  );
end;
$$;
revoke all on function public.echo_request_creator_verification_v1(text,text) from public,anon;
grant execute on function public.echo_request_creator_verification_v1(text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Aprovação: claims sem canonicalização não podem virar Creator.
-- Continua exigindo Admin AAL2 e revisão humana da prova pública.
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
    perform public.admin_set_identity_badge_v1(
      v_claim.user_id,'creator',true,'Canal verificado por desafio EchoArena',v_claim.canonical_channel_url
    );
  end if;
  return jsonb_build_object('claim_id',p_claim_id,'status',p_decision,'user_id',v_claim.user_id);
end;
$$;
revoke all on function public.admin_review_creator_claim_v1(uuid,text,text) from public,anon;
grant execute on function public.admin_review_creator_claim_v1(uuid,text,text) to authenticated;

comment on column public.echo_creator_claims.canonical_channel_url is
  'URL normalizada usada para propriedade/dedupe. channel_url preserva a evidência original enviada pelo usuário.';

commit;
