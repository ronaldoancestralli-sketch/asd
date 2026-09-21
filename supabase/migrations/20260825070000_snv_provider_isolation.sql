-- EchoArena — exclusividade de provedor: somente SNV.
-- Destino exclusivo desta migration: Supabase SNV.
-- Objetivos:
-- 1) fixar a autoridade administrativa no emissor JWT do SNV;
-- 2) garantir que o Echo Pulse/Cron use apenas o endpoint do SNV;
-- 3) rejeitar qualquer endpoint Supabase diferente do SNV no Cron/Vault do Echo Pulse;
-- 4) falhar fechado se a URL operacional não estiver exatamente fixada no SNV.

begin;

-- ------------------------------------------------------------
-- 1. Admin: somente JWT emitido pelo SNV pode formar identidade administrativa.
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
    and coalesce(auth.jwt() ->> 'iss', '') = 'https://nqklhsfaqpbjqmfzjzxk.supabase.co/auth/v1'
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

revoke execute on function public.echo_admin_identity() from public, anon;
revoke execute on function public.echo_is_admin() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.current_user_is_admin() from public, anon;
grant execute on function public.echo_admin_identity() to authenticated, service_role;
grant execute on function public.echo_is_admin() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.current_user_is_admin() to authenticated, service_role;

comment on function public.echo_admin_identity()
is 'Identidade administrativa aceita somente JWT emitido pelo Supabase SNV e conta admin ativa.';
comment on function public.echo_is_admin()
is 'Autorização administrativa forte: emissor SNV + conta admin ativa + AAL2.';

-- ------------------------------------------------------------
-- 2. Echo Pulse/Cron: endpoint e chave publicável pertencem somente ao SNV.
-- ------------------------------------------------------------

do $block$
declare
  v_url_secret_id uuid;
  v_key_secret_id uuid;
begin
  select id into v_url_secret_id
  from vault.secrets
  where name = 'echo_pulse_project_url'
  limit 1;

  if v_url_secret_id is null then
    perform vault.create_secret(
      'https://nqklhsfaqpbjqmfzjzxk.supabase.co',
      'echo_pulse_project_url',
      'Echo Pulse: URL exclusiva do projeto SNV para o Cron',
      null
    );
  else
    perform vault.update_secret(
      v_url_secret_id,
      'https://nqklhsfaqpbjqmfzjzxk.supabase.co',
      'echo_pulse_project_url',
      'Echo Pulse: URL exclusiva do projeto SNV para o Cron'
    );
  end if;

  select id into v_key_secret_id
  from vault.secrets
  where name = 'echo_pulse_publishable_key'
  limit 1;

  if v_key_secret_id is null then
    perform vault.create_secret(
      'sb_publishable_20kuwDQ9LpRI10-hR2kXkA_pu4eVBmC',
      'echo_pulse_publishable_key',
      'Echo Pulse: chave publicável exclusiva do SNV',
      null
    );
  else
    perform vault.update_secret(
      v_key_secret_id,
      'sb_publishable_20kuwDQ9LpRI10-hR2kXkA_pu4eVBmC',
      'echo_pulse_publishable_key',
      'Echo Pulse: chave publicável exclusiva do SNV'
    );
  end if;
end
$block$;

-- ------------------------------------------------------------
-- 3. Invariantes fail-closed sem conhecer qualquer outro project ref.
-- ------------------------------------------------------------

do $block$
declare
  v_target_url text := 'https://nqklhsfaqpbjqmfzjzxk.supabase.co';
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'echo-pulse-ingest-30m'
      and command ~* 'https://[a-z0-9-]+\.supabase\.co'
      and command not ilike '%' || v_target_url || '%'
  ) then
    raise exception 'non_snv_provider_reference_detected_in_cron';
  end if;

  if exists (
    select 1
    from vault.decrypted_secrets
    where name like 'echo_pulse_%'
      and coalesce(decrypted_secret, '') ~* 'https://[a-z0-9-]+\.supabase\.co'
      and decrypted_secret <> v_target_url
  ) then
    raise exception 'non_snv_provider_reference_detected_in_vault';
  end if;

  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'echo_pulse_project_url'
      and decrypted_secret = v_target_url
  ) then
    raise exception 'snv_echo_pulse_project_url_not_locked';
  end if;
end
$block$;

commit;
