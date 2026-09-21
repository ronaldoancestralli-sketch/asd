-- EchoArena — publicação administrativa rápida de promocodes.
-- A origem continua disponível, mas deixa de bloquear a operação manual.
-- O código permanece isolado em private.promo_secrets e todas as escritas exigem Admin/MFA.

alter table public.promo_campaigns
  alter column game set default 'Bullet Echo',
  alter column source_name drop not null,
  alter column source_url drop not null;

alter table public.promo_campaigns
  drop constraint if exists promo_campaigns_official_source_only_check,
  drop constraint if exists promo_campaigns_source_type_check,
  drop constraint if exists promo_campaigns_source_name_check,
  drop constraint if exists promo_campaigns_source_url_check;

alter table public.promo_campaigns
  add constraint promo_campaigns_source_type_check
    check (source_type = any (array['official'::text, 'community'::text, 'admin'::text])),
  add constraint promo_campaigns_source_name_check
    check (
      source_name is null
      or (length(btrim(source_name)) >= 1 and length(btrim(source_name)) <= 120)
    ),
  add constraint promo_campaigns_source_url_check
    check (
      source_url is null
      or (
        length(btrim(source_url)) <= 1000
        and btrim(source_url) ~* '^https://[^[:space:]@/]+'
      )
    );

comment on column public.promo_campaigns.created_by is
  'Administrador que criou ou assumiu a publicação manual. Preenchido pelo servidor a partir de auth.uid().';
comment on column public.promo_campaigns.source_url is
  'Fonte opcional informada pelo administrador. Quando presente, deve usar HTTPS sem credenciais embutidas.';

create or replace function public.promo_admin_publish(
  p_code text,
  p_id uuid default null,
  p_title text default null,
  p_reward text default null,
  p_source_url text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_code text := btrim(coalesce(p_code, ''));
  v_source_url text := nullif(btrim(coalesce(p_source_url, '')), '');
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_reward text := nullif(btrim(coalesce(p_reward, '')), '');
  v_id uuid := p_id;
  v_existing boolean := false;
begin
  if not public.echo_is_admin() then
    raise exception 'admin_aal2_required' using errcode = '42501';
  end if;

  if v_actor is null then
    raise exception 'admin_aal2_required' using errcode = '42501';
  end if;

  if length(v_code) < 1 or length(v_code) > 160 then
    raise exception 'promo_code_required' using errcode = '22023';
  end if;

  if v_source_url is not null
     and (
       length(v_source_url) > 1000
       or v_source_url !~* '^https://[^[:space:]@/]+'
     ) then
    raise exception 'promo_source_url_invalid' using errcode = '22023';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'promo_expiry_invalid' using errcode = '22023';
  end if;

  if v_id is not null then
    select exists (
      select 1 from public.promo_campaigns p where p.id = v_id
    ) into v_existing;
    if not v_existing then
      raise exception 'promo_not_found' using errcode = 'P0002';
    end if;
  else
    select s.promo_id
      into v_id
    from private.promo_secrets s
    where lower(btrim(s.code)) = lower(v_code)
    order by s.updated_at desc
    limit 1;

    v_existing := v_id is not null;
    v_id := coalesce(v_id, pg_catalog.gen_random_uuid());
  end if;

  insert into public.promo_campaigns(
    id, game, title, reward, banner_label, banner_message,
    source_type, source_name, source_url, verification_status,
    verification_method, discovered_at, verified_at, starts_at, expires_at,
    status, published, created_by, updated_by, created_at, updated_at
  ) values (
    v_id,
    'Bullet Echo',
    left(coalesce(v_title, 'Novo código promocional de Bullet Echo'), 140),
    case when v_reward is null then null else left(v_reward, 240) end,
    'NOVO CÓDIGO PROMOCIONAL',
    'Curta para revelar o código.',
    'admin',
    case when v_source_url is null then null else 'Fonte informada no painel administrativo' end,
    v_source_url,
    'verified',
    'admin:quick-publish-v1',
    now(),
    now(),
    now(),
    p_expires_at,
    'active',
    true,
    v_actor,
    v_actor,
    now(),
    now()
  )
  on conflict (id) do update set
    game = 'Bullet Echo',
    title = excluded.title,
    reward = excluded.reward,
    banner_label = excluded.banner_label,
    banner_message = excluded.banner_message,
    source_type = 'admin',
    source_name = excluded.source_name,
    source_url = excluded.source_url,
    verification_status = 'verified',
    verification_method = 'admin:quick-publish-v1',
    verified_at = now(),
    starts_at = now(),
    expires_at = excluded.expires_at,
    status = 'active',
    published = true,
    created_by = coalesce(public.promo_campaigns.created_by, v_actor),
    updated_by = v_actor,
    updated_at = now();

  insert into private.promo_secrets(promo_id, code, updated_by, updated_at)
  values (v_id, v_code, v_actor, now())
  on conflict (promo_id) do update set
    code = excluded.code,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  if pg_catalog.to_regclass('private.promo_radar_controls') is not null then
    execute
      'update private.promo_radar_controls
          set auto_managed = false,
              auto_published = false,
              safety_disable_at = null,
              updated_at = now()
        where campaign_id = $1'
      using v_id;
  end if;

  insert into public.admin_log(admin_id, action, target, detail)
  values (
    v_actor,
    case when v_existing then 'promo.republished' else 'promo.published' end,
    v_id::text,
    pg_catalog.jsonb_build_object(
      'campaign_id', v_id,
      'source_provided', v_source_url is not null,
      'expires_at', p_expires_at
    )
  );

  return v_id;
end;
$function$;

create or replace function public.promo_admin_remove(p_promo_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_changed boolean := false;
begin
  if not public.echo_is_admin() then
    raise exception 'admin_aal2_required' using errcode = '42501';
  end if;

  update public.promo_campaigns
     set published = false,
         status = 'invalid',
         updated_by = v_actor,
         updated_at = now()
   where id = p_promo_id
     and (published is distinct from false or status is distinct from 'invalid');

  v_changed := found;

  if not exists (select 1 from public.promo_campaigns p where p.id = p_promo_id) then
    raise exception 'promo_not_found' using errcode = 'P0002';
  end if;

  if pg_catalog.to_regclass('private.promo_radar_controls') is not null then
    execute
      'update private.promo_radar_controls
          set auto_managed = false,
              auto_published = false,
              safety_disable_at = null,
              updated_at = now()
        where campaign_id = $1'
      using p_promo_id;
  end if;

  insert into public.admin_log(admin_id, action, target, detail)
  values (
    v_actor,
    'promo.removed',
    p_promo_id::text,
    pg_catalog.jsonb_build_object(
      'campaign_id', p_promo_id,
      'changed', v_changed
    )
  );

  return v_changed;
end;
$function$;

drop function if exists public.promo_admin_list();

create function public.promo_admin_list()
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
  created_by uuid,
  created_by_name text,
  updated_by uuid,
  updated_by_name text,
  has_code boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p.id,
    p.game,
    p.title,
    p.reward,
    p.banner_label,
    p.banner_message,
    p.source_type,
    p.source_name,
    p.source_url,
    p.verification_status,
    p.verification_method,
    p.discovered_at,
    p.verified_at,
    p.starts_at,
    p.expires_at,
    p.status,
    p.published,
    s.code,
    (select count(*) from public.promo_likes l where l.promo_id = p.id),
    p.created_by,
    case
      when p.created_by is null then 'Automação'
      else coalesce(nullif(btrim(created_profile.display_name), ''), nullif(btrim(created_profile.username), ''), 'Administrador')
    end,
    p.updated_by,
    case
      when p.updated_by is null then null
      else coalesce(nullif(btrim(updated_profile.display_name), ''), nullif(btrim(updated_profile.username), ''), 'Administrador')
    end,
    s.promo_id is not null,
    p.created_at,
    p.updated_at
  from public.promo_campaigns p
  left join private.promo_secrets s on s.promo_id = p.id
  left join public.profiles created_profile on created_profile.id = p.created_by
  left join public.profiles updated_profile on updated_profile.id = p.updated_by
  where public.echo_is_admin()
  order by p.updated_at desc, p.created_at desc;
$function$;

-- Compatibilidade com abas antigas que ainda estejam abertas.
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
begin
  return public.promo_admin_publish(
    p_code => p_code,
    p_id => p_id,
    p_title => p_title,
    p_reward => p_reward,
    p_source_url => p_source_url,
    p_expires_at => p_expires_at
  );
end;
$function$;

create or replace function public.promo_admin_delete(p_promo_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return public.promo_admin_remove(p_promo_id);
end;
$function$;

revoke all on function public.promo_admin_publish(text,uuid,text,text,text,timestamptz) from public, anon;
revoke all on function public.promo_admin_remove(uuid) from public, anon;
revoke all on function public.promo_admin_list() from public, anon;
revoke all on function public.promo_admin_save(uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,text,boolean,text) from public, anon;
revoke all on function public.promo_admin_delete(uuid) from public, anon;

grant execute on function public.promo_admin_publish(text,uuid,text,text,text,timestamptz) to authenticated, service_role;
grant execute on function public.promo_admin_remove(uuid) to authenticated, service_role;
grant execute on function public.promo_admin_list() to authenticated, service_role;
grant execute on function public.promo_admin_save(uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,text,boolean,text) to authenticated, service_role;
grant execute on function public.promo_admin_delete(uuid) to authenticated, service_role;

comment on function public.promo_admin_publish(text,uuid,text,text,text,timestamptz) is
  'Publica ou republica um promocode com estados internos automáticos; código obrigatório e fonte opcional.';
comment on function public.promo_admin_remove(uuid) is
  'Remove a campanha da superfície pública sem apagar código, curtidas, autoria ou histórico.';
