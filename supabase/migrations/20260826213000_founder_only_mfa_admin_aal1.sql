-- Echo Arena — Founder-only MFA boundary.
-- Staff administrators authenticate with password/session and remain restricted by
-- active membership + module/capability grants. Founder keeps mandatory AAL2/TOTP
-- because the singleton Founder has implicit access to every administrative module.

begin;

create or replace function public.echo_is_admin()
returns boolean
language sql
stable
security definer
set search_path = 'public', 'auth'
as $function$
  select
    public.echo_staff_identity()
    and (
      not public.echo_is_founder_identity()
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    );
$function$;

comment on function public.echo_is_admin()
is 'Autorização administrativa: staff modular ativo pode operar em AAL1; Founder singleton exige JWT AAL2/TOTP.';

-- Legacy RLS/Storage helpers continue delegating to the centralized rule.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = 'public', 'auth'
as $function$
  select public.echo_is_admin();
$function$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = 'public', 'auth'
as $function$
  select public.echo_is_admin();
$function$;

-- Explicit helper for Founder-only surfaces and future sensitive RPCs.
create or replace function public.echo_is_founder_aal2()
returns boolean
language sql
stable
security definer
set search_path = 'public', 'auth'
as $function$
  select
    public.echo_is_founder_identity()
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$function$;

revoke all on function public.echo_is_founder_aal2() from public, anon;
grant execute on function public.echo_is_founder_aal2() to authenticated, service_role;

comment on function public.echo_is_founder_aal2()
is 'Barreira Founder: singleton Founder + sessão AAL2. Staff comum nunca satisfaz este helper.';

commit;
