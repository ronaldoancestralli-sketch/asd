-- EchoArena — códigos promocionais com revelação condicionada a curtida.
-- Mantém metadados públicos separados do código real, que permanece no schema private.

begin;

create schema if not exists private;
revoke all on schema private from public;

create table public.promo_campaigns (
  id uuid primary key default gen_random_uuid(),
  game text not null default 'C.A.T.S.' check (length(btrim(game)) between 1 and 80),
  title text not null check (length(btrim(title)) between 1 and 140),
  reward text,
  banner_label text not null default 'NOVO CÓDIGO PROMOCIONAL' check (length(btrim(banner_label)) between 1 and 80),
  banner_message text not null default 'Curta para revelar o código.' check (length(btrim(banner_message)) between 1 and 280),
  source_type text not null default 'official' check (source_type in ('official','community')),
  source_name text not null check (length(btrim(source_name)) between 1 and 120),
  source_url text not null check (source_url ~* '^https://'),
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  verification_method text,
  discovered_at timestamptz not null default now(),
  verified_at timestamptz,
  starts_at timestamptz,
  expires_at timestamptz,
  status text not null default 'pending_verification' check (status in ('detected','pending_verification','verified','active','expired','invalid')),
  published boolean not null default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_campaigns_window_chk check (expires_at is null or starts_at is null or starts_at < expires_at),
  constraint promo_campaigns_publish_verified_chk check (
    published = false
    or (verification_status = 'verified' and status = 'active' and verified_at is not null)
  )
);

create table private.promo_secrets (
  promo_id uuid primary key references public.promo_campaigns(id) on delete cascade,
  code text not null check (length(btrim(code)) between 1 and 160),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table public.promo_likes (
  promo_id uuid not null references public.promo_campaigns(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (promo_id, user_id)
);

create index promo_campaigns_public_window_idx
  on public.promo_campaigns (published, status, starts_at, expires_at)
  where published = true;
create index promo_likes_user_idx on public.promo_likes (user_id, created_at desc);

alter table public.promo_campaigns enable row level security;
alter table public.promo_likes enable row level security;

revoke all on table public.promo_campaigns from public, anon, authenticated;
grant select (
  id, game, title, reward, banner_label, banner_message,
  source_type, source_name, source_url, verification_status,
  discovered_at, verified_at, starts_at, expires_at,
  status, published, created_at, updated_at
) on public.promo_campaigns to anon, authenticated;

revoke all on table public.promo_likes from public, anon, authenticated;
grant select, insert, delete on table public.promo_likes to authenticated;

revoke all on table private.promo_secrets from public, anon, authenticated;

create policy promo_campaigns_anon_select
on public.promo_campaigns
for select
to anon
using (
  published = true
  and verification_status = 'verified'
  and status = 'active'
  and (starts_at is null or starts_at <= now())
  and (expires_at is null or expires_at > now())
);

create policy promo_campaigns_authenticated_select
on public.promo_campaigns
for select
to authenticated
using (
  (
    published = true
    and verification_status = 'verified'
    and status = 'active'
    and (starts_at is null or starts_at <= now())
    and (expires_at is null or expires_at > now())
  )
  or (select public.is_admin())
);

create policy promo_campaigns_admin_insert
on public.promo_campaigns
for insert
to authenticated
with check ((select public.is_admin()));

create policy promo_campaigns_admin_update
on public.promo_campaigns
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy promo_campaigns_admin_delete
on public.promo_campaigns
for delete
to authenticated
using ((select public.is_admin()));

create policy promo_likes_authenticated_select
on public.promo_likes
for select
to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy promo_likes_authenticated_insert
on public.promo_likes
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and not (select public.is_blocked())
  and exists (
    select 1
    from public.promo_campaigns p
    where p.id = promo_id
      and p.published = true
      and p.verification_status = 'verified'
      and p.status = 'active'
      and (p.starts_at is null or p.starts_at <= now())
      and (p.expires_at is null or p.expires_at > now())
  )
);

create policy promo_likes_authenticated_delete
on public.promo_likes
for delete
to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

create or replace function public.promo_like_and_reveal(p_promo_id uuid)
returns table(promo_id uuid, code text, liked_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_liked_at timestamptz;
  v_code text;
begin
  if v_user_id is null then
    raise exception 'promo_authentication_required' using errcode = '42501';
  end if;

  if public.is_blocked() then
    raise exception 'promo_user_blocked' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.promo_campaigns p
    where p.id = p_promo_id
      and p.published = true
      and p.verification_status = 'verified'
      and p.status = 'active'
      and (p.starts_at is null or p.starts_at <= now())
      and (p.expires_at is null or p.expires_at > now())
  ) then
    raise exception 'promo_not_available' using errcode = '22023';
  end if;

  insert into public.promo_likes(promo_id, user_id)
  values (p_promo_id, v_user_id)
  on conflict (promo_id, user_id) do update
    set created_at = public.promo_likes.created_at
  returning created_at into v_liked_at;

  select s.code into v_code
  from private.promo_secrets s
  where s.promo_id = p_promo_id;

  if nullif(btrim(v_code), '') is null then
    raise exception 'promo_code_unavailable' using errcode = 'P0001';
  end if;

  return query select p_promo_id, v_code, v_liked_at;
end;
$function$;

create or replace function public.promo_reveal_if_liked(p_promo_id uuid)
returns table(promo_id uuid, code text, liked_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_liked_at timestamptz;
  v_code text;
begin
  if v_user_id is null then
    return;
  end if;

  select l.created_at into v_liked_at
  from public.promo_likes l
  where l.promo_id = p_promo_id and l.user_id = v_user_id;

  if v_liked_at is null then
    return;
  end if;

  if not exists (
    select 1
    from public.promo_campaigns p
    where p.id = p_promo_id
      and p.published = true
      and p.verification_status = 'verified'
      and p.status = 'active'
      and (p.starts_at is null or p.starts_at <= now())
      and (p.expires_at is null or p.expires_at > now())
  ) then
    return;
  end if;

  select s.code into v_code
  from private.promo_secrets s
  where s.promo_id = p_promo_id;

  if nullif(btrim(v_code), '') is null then
    return;
  end if;

  return query select p_promo_id, v_code, v_liked_at;
end;
$function$;

create or replace function public.promo_admin_list()
returns table(
  id uuid,
  game text,
  title text,
  reward text,
  banner_label text,
  banner_message text,
  source_type text,
  source_name text,
  source_url text,
  verification_status text,
  verification_method text,
  discovered_at timestamptz,
  verified_at timestamptz,
  starts_at timestamptz,
  expires_at timestamptz,
  status text,
  published boolean,
  code text,
  likes_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p.id, p.game, p.title, p.reward, p.banner_label, p.banner_message,
    p.source_type, p.source_name, p.source_url, p.verification_status,
    p.verification_method, p.discovered_at, p.verified_at, p.starts_at,
    p.expires_at, p.status, p.published, s.code,
    (select count(*) from public.promo_likes l where l.promo_id = p.id) as likes_count,
    p.created_at, p.updated_at
  from public.promo_campaigns p
  left join private.promo_secrets s on s.promo_id = p.id
  where public.echo_is_admin()
  order by p.discovered_at desc, p.created_at desc;
$function$;

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
as $function$
declare
  v_id uuid := coalesce(p_id, pg_catalog.gen_random_uuid());
  v_actor uuid := auth.uid();
  v_verified_at timestamptz := p_verified_at;
begin
  if not public.echo_is_admin() then
    raise exception 'admin_aal2_required' using errcode = '42501';
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
    v_id, btrim(p_game), btrim(p_title), nullif(btrim(coalesce(p_reward, '')), ''),
    btrim(p_banner_label), btrim(p_banner_message), p_source_type,
    btrim(p_source_name), btrim(p_source_url), p_verification_status,
    nullif(btrim(coalesce(p_verification_method, '')), ''),
    coalesce(p_discovered_at, now()), v_verified_at, p_starts_at, p_expires_at,
    p_status, coalesce(p_published, false), v_actor, v_actor, now(), now()
  )
  on conflict (id) do update set
    game = excluded.game,
    title = excluded.title,
    reward = excluded.reward,
    banner_label = excluded.banner_label,
    banner_message = excluded.banner_message,
    source_type = excluded.source_type,
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
$function$;

create or replace function public.promo_admin_delete(p_promo_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.echo_is_admin() then
    raise exception 'admin_aal2_required' using errcode = '42501';
  end if;

  delete from public.promo_campaigns where id = p_promo_id;
  return found;
end;
$function$;

revoke execute on function public.promo_like_and_reveal(uuid) from public, anon;
revoke execute on function public.promo_reveal_if_liked(uuid) from public, anon;
revoke execute on function public.promo_admin_list() from public, anon;
revoke execute on function public.promo_admin_save(uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,text,boolean,text) from public, anon;
revoke execute on function public.promo_admin_delete(uuid) from public, anon;

grant execute on function public.promo_like_and_reveal(uuid) to authenticated;
grant execute on function public.promo_reveal_if_liked(uuid) to authenticated;
grant execute on function public.promo_admin_list() to authenticated;
grant execute on function public.promo_admin_save(uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,text,boolean,text) to authenticated;
grant execute on function public.promo_admin_delete(uuid) to authenticated;

comment on table public.promo_campaigns is 'Metadados publicáveis de códigos promocionais; nunca contém o código secreto.';
comment on table private.promo_secrets is 'Código promocional real, inacessível diretamente a anon/authenticated.';
comment on function public.promo_like_and_reveal(uuid) is 'Registra a curtida autenticada e só então devolve o código de promoção ativa e verificada.';
comment on function public.promo_reveal_if_liked(uuid) is 'Reexibe o código somente para usuário que já curtiu a promoção.';
comment on function public.promo_admin_save(uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,text,boolean,text) is 'Cria/edita promoção e segredo de forma atômica; exige admin com AAL2.';

commit;
