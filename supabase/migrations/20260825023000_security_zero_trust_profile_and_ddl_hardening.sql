-- EchoArena — post-migration zero-trust hardening.
-- Defense-in-depth against self-admin, destructive client privileges and private-schema exposure.
-- This migration is idempotent and intentionally preserves service_role/Admin AAL2 operations.

begin;

-- Client roles must never be able to create/drop schema objects through exposed schemas.
revoke create on schema public from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;

-- Private schema is server-only. SECURITY DEFINER/service_role routines keep owner privileges.
revoke all privileges on all tables in schema private from public, anon, authenticated;
revoke all privileges on all sequences in schema private from public, anon, authenticated;
revoke all privileges on all functions in schema private from public, anon, authenticated;

-- Defense-in-depth RLS for known private state. These relations are not client Data API surfaces.
alter table if exists private.analytics_rate_limits enable row level security;
alter table if exists private.promo_radar_controls enable row level security;
alter table if exists private.promo_radar_observations enable row level security;
alter table if exists private.promo_secrets enable row level security;

-- Even if a future policy/grant accidentally becomes permissive, a normal user cannot
-- change the authority/blocking fields on their own profile. AAL2 Admin and service_role remain valid.
create or replace function public.guard_profile_privilege_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.role is distinct from old.role
     or new.role_id is distinct from old.role_id
     or new.is_admin is distinct from old.is_admin
     or new.is_blocked is distinct from old.is_blocked
     or new.blocked_reason is distinct from old.blocked_reason
     or new.blocked_at is distinct from old.blocked_at then
    if coalesce(auth.role(), '') = 'service_role' then
      return new;
    end if;
    if not public.echo_is_admin() then
      raise exception 'profile_privilege_fields_forbidden' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_profile_privilege_update() from public, anon, authenticated;

drop trigger if exists profiles_guard_privilege_update on public.profiles;
create trigger profiles_guard_privilege_update
before update on public.profiles
for each row execute function public.guard_profile_privilege_update();

-- Historical emergency/promotion helper: if it exists in any overload, it is server-only.
do $guard_make_admin$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'make_admin'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.signature);
    execute format('grant execute on function %s to service_role', r.signature);
  end loop;
end;
$guard_make_admin$;

-- New functions created by the migration owner are not executable by PUBLIC by default.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

comment on function public.guard_profile_privilege_update() is
  'Fail-closed trigger against self-admin/self-unblock privilege-field changes; service_role and AAL2 Admin only.';

commit;
