-- EchoArena — protocolo de segurança completo, camada de banco.
-- Objetivos:
-- 1) separar identidade administrativa de sessão administrativa plenamente autenticada;
-- 2) exigir AAL2/MFA em is_admin(), RLS, RPCs e Storage administrativo;
-- 3) fazer views expostas obedecerem ao RLS das tabelas-base;
-- 4) fechar colunas internas de profiles para clientes comuns;
-- 5) remover escrita ampla do bucket legado media;
-- 6) substituir INSERT direto de analytics por RPC validada e limitada.
--
-- Esta migration não altera dados de negócio. A única tabela nova guarda contadores
-- efêmeros e irreversíveis (hash) usados para rate-limit de analytics.

begin;

-- ------------------------------------------------------------
-- 1. Identidade administrativa x autorização administrativa AAL2
-- ------------------------------------------------------------

create or replace function public.echo_admin_identity()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      left join public.roles r on r.id = p.role_id
      where p.id = auth.uid()
        and coalesce(p.is_blocked, false) = false
        and (
          coalesce(p.is_admin, false) = true
          or lower(coalesce(p.role, '')) = 'admin'
          or lower(coalesce(r.name, '')) = 'admin'
        )
    );
$function$;

revoke execute on function public.echo_admin_identity() from public, anon;
grant execute on function public.echo_admin_identity() to authenticated;

comment on function public.echo_admin_identity()
is 'Identifica conta administrativa ativa sem exigir AAL2. Uso exclusivo do fluxo de inscrição/desafio MFA; não concede privilégio administrativo.';

create or replace function public.echo_is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select
    public.echo_admin_identity()
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$function$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select public.echo_is_admin();
$function$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select public.echo_is_admin();
$function$;

revoke execute on function public.echo_is_admin() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.current_user_is_admin() from public, anon;
grant execute on function public.echo_is_admin() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;

comment on function public.echo_is_admin()
is 'Autorização administrativa forte: conta admin não bloqueada + JWT AAL2.';
comment on function public.is_admin()
is 'Autorização administrativa usada por RLS/RPCs. Exige conta admin não bloqueada + AAL2.';
comment on function public.current_user_is_admin()
is 'Autorização administrativa do Storage. Exige conta admin não bloqueada + AAL2.';

-- O preview privado também é dado administrativo e deve exigir MFA.
create or replace function public.echo_can_preview_pulse()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select
    public.echo_is_admin()
    and exists (
      select 1
      from public.pulse_preview_access ppa
      where ppa.user_id = auth.uid()
    );
$function$;

revoke execute on function public.echo_can_preview_pulse() from public, anon;
grant execute on function public.echo_can_preview_pulse() to authenticated;

-- ------------------------------------------------------------
-- 2. Profiles: dados públicos continuam públicos; estado interno fica encapsulado
-- ------------------------------------------------------------

-- Remove grants de leitura global de atributos de autorização/moderação.
revoke select (role, role_id, is_admin, is_blocked, blocked_reason, blocked_at)
on public.profiles from authenticated;

-- Reafirma explicitamente o conjunto de leitura pública permitido.
grant select (id, username, display_name, avatar_url, created_at, updated_at)
on public.profiles to anon, authenticated;

-- O próprio usuário pode consultar seu estado sem ganhar leitura global dessas colunas.
create or replace function public.echo_current_user_access_state()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select case
    when auth.uid() is null then null
    else (
      select jsonb_build_object(
        'role', coalesce(p.role, 'user'),
        'is_blocked', coalesce(p.is_blocked, false),
        'blocked_reason', p.blocked_reason,
        'blocked_at', p.blocked_at,
        'is_admin_identity', (
          coalesce(p.is_admin, false) = true
          or lower(coalesce(p.role, '')) = 'admin'
          or lower(coalesce(r.name, '')) = 'admin'
        )
      )
      from public.profiles p
      left join public.roles r on r.id = p.role_id
      where p.id = auth.uid()
    )
  end;
$function$;

revoke execute on function public.echo_current_user_access_state() from public, anon;
grant execute on function public.echo_current_user_access_state() to authenticated;

-- ------------------------------------------------------------
-- 3. Views: nenhuma view exposta pode executar como dona e furar RLS
-- ------------------------------------------------------------

do $block$
declare
  v record;
begin
  for v in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
      and (
        has_table_privilege('anon', c.oid, 'select')
        or has_table_privilege('authenticated', c.oid, 'select')
      )
  loop
    execute format('alter view public.%I set (security_invoker = true)', v.relname);
  end loop;
end
$block$;

-- Comparações salvas são privadas por desenho. O anon não precisa nem alcançar a view.
revoke select on public.v_build_compare from anon;

-- Guias estão em modo privado. Mantemos sitemap/metadados públicos úteis sem depender
-- da tabela privada de guias; quando Guias voltar a público, a extensão deverá ser
-- feita com grants/RLS explícitos, não via SECURITY DEFINER.
create or replace view public.v_meta_data
with (security_invoker = true)
as
select h.slug, h.meta_title, h.meta_description, h.meta_keywords, 'hero'::text as page_type
from public.heroes h
where h.enabled = true
union all
select b.slug, b.meta_title, b.meta_description, b.meta_keywords, 'build'::text as page_type
from public.builds b
where b.is_public = true
  and b.visibility = 'public'
  and b.status = 'published'
  and b.deleted_at is null
union all
select n.slug, n.meta_title, n.meta_description, n.meta_keywords, 'news'::text as page_type
from public.news n
where n.published = true;

create or replace view public.v_sitemap
with (security_invoker = true)
as
select concat('/heroes/', h.slug) as url,
       h.updated_at,
       'weekly'::text as changefreq,
       0.9::numeric as priority
from public.heroes h
where h.enabled = true
union all
select concat('/builds/', b.slug) as url,
       b.updated_at,
       'daily'::text as changefreq,
       0.8::numeric as priority
from public.builds b
where b.is_public = true
  and b.visibility = 'public'
  and b.status = 'published'
  and b.deleted_at is null
union all
select concat('/news/', n.slug) as url,
       n.updated_at,
       'weekly'::text as changefreq,
       0.6::numeric as priority
from public.news n
where n.published = true;

-- ------------------------------------------------------------
-- 4. Storage legado: sem escrita global por qualquer authenticated
-- ------------------------------------------------------------

drop policy if exists "Authenticated Upload" on storage.objects;
drop policy if exists "Authenticated Update" on storage.objects;
drop policy if exists "Authenticated Delete" on storage.objects;

-- A leitura pública legada pode permanecer; o bucket media está sem objetos e não é
-- o pipeline ativo. Escritas atuais seguem em game-media/Worker com current_user_is_admin().

-- ------------------------------------------------------------
-- 5. Analytics: sem INSERT arbitrário; RPC validada + rate-limit por ator/IP hash
-- ------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.analytics_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  event_count integer not null default 0 check (event_count >= 0),
  updated_at timestamptz not null default now()
);

revoke all on table private.analytics_rate_limits from public, anon, authenticated;

-- Remove a policy que aceitava qualquer payload e o grant de INSERT direto.
drop policy if exists analytics_insert on public.analytics_events;
revoke insert on public.analytics_events from anon, authenticated;

create or replace function public.record_analytics_event(
  p_event_name text,
  p_session_id text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_page text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'private', 'extensions', 'pg_temp'
as $function$
declare
  v_event_name text := lower(btrim(coalesce(p_event_name, '')));
  v_session_id text := nullif(btrim(coalesce(p_session_id, '')), '');
  v_entity_type text := nullif(lower(btrim(coalesce(p_entity_type, ''))), '');
  v_page text := nullif(btrim(coalesce(p_page, '')), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_headers jsonb := '{}'::jsonb;
  v_forwarded text := null;
  v_actor_source text;
  v_rate_key text;
  v_event_count integer;
  v_id uuid;
begin
  if length(v_event_name) < 1 or length(v_event_name) > 64
     or v_event_name !~ '^[a-z0-9][a-z0-9_.:-]*$' then
    raise exception 'invalid_analytics_event_name' using errcode = '22023';
  end if;

  if v_session_id is not null and length(v_session_id) > 128 then
    raise exception 'analytics_session_too_long' using errcode = '22023';
  end if;
  if v_entity_type is not null and (
    length(v_entity_type) > 64 or v_entity_type !~ '^[a-z0-9][a-z0-9_.:-]*$'
  ) then
    raise exception 'invalid_analytics_entity_type' using errcode = '22023';
  end if;
  if p_entity_id is not null and v_entity_type is null then
    raise exception 'analytics_entity_type_required' using errcode = '22023';
  end if;
  if v_page is not null and length(v_page) > 256 then
    raise exception 'analytics_page_too_long' using errcode = '22023';
  end if;
  if jsonb_typeof(v_metadata) <> 'object'
     or octet_length(v_metadata::text) > 4096 then
    raise exception 'invalid_analytics_metadata' using errcode = '22023';
  end if;

  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_forwarded := nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');
  v_actor_source := coalesce(auth.uid()::text, v_forwarded, v_session_id, 'anonymous');
  v_rate_key := encode(extensions.digest(v_actor_source || ':echoarena:analytics:v1', 'sha256'), 'hex');

  insert into private.analytics_rate_limits(rate_key, window_started_at, event_count, updated_at)
  values (v_rate_key, now(), 1, now())
  on conflict (rate_key) do update
    set window_started_at = case
          when private.analytics_rate_limits.window_started_at < now() - interval '5 minutes'
            then now()
          else private.analytics_rate_limits.window_started_at
        end,
        event_count = case
          when private.analytics_rate_limits.window_started_at < now() - interval '5 minutes'
            then 1
          else private.analytics_rate_limits.event_count + 1
        end,
        updated_at = now()
  returning event_count into v_event_count;

  if v_event_count > 120 then
    raise exception 'analytics_rate_limit_exceeded' using errcode = 'P0001';
  end if;

  insert into public.analytics_events(
    user_id, session_id, event_name, entity_type, entity_id, page, metadata
  ) values (
    auth.uid(), v_session_id, v_event_name, v_entity_type, p_entity_id, v_page, v_metadata
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke execute on function public.record_analytics_event(text,text,text,uuid,text,jsonb)
from public;
grant execute on function public.record_analytics_event(text,text,text,uuid,text,jsonb)
to anon, authenticated;

comment on function public.record_analytics_event(text,text,text,uuid,text,jsonb)
is 'Único caminho client-side para analytics: valida payload, força user_id=auth.uid() e limita 120 eventos/5 min por ator/IP hash.';

commit;
