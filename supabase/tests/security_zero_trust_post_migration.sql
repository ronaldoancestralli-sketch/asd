-- EchoArena — zero-trust post-migration contract.
begin;

do $test$
declare
  v_create boolean;
  v_trigger_count integer;
  v_make_admin_exposed integer;
begin
  select has_schema_privilege('anon', 'public', 'CREATE')
      or has_schema_privilege('authenticated', 'public', 'CREATE')
    into v_create;
  if v_create then
    raise exception 'zero_trust_failed: client can CREATE in public schema';
  end if;

  if has_schema_privilege('anon', 'private', 'USAGE')
     or has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'zero_trust_failed: client can USE private schema';
  end if;

  select count(*) into v_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'profiles'
    and t.tgname = 'profiles_guard_privilege_update'
    and not t.tgisinternal;
  if v_trigger_count <> 1 then
    raise exception 'zero_trust_failed: profile privilege guard trigger missing';
  end if;

  select count(*) into v_make_admin_exposed
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public'
    and p.proname='make_admin'
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
    );
  if v_make_admin_exposed <> 0 then
    raise exception 'zero_trust_failed: make_admin exposed to client role';
  end if;
end;
$test$;

-- All known private tables should be RLS-enabled when present.
do $test$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private'
    and c.relname = any(array['analytics_rate_limits','promo_radar_controls','promo_radar_observations','promo_secrets'])
    and c.relkind='r'
    and not c.relrowsecurity;
  if v_bad <> 0 then
    raise exception 'zero_trust_failed: known private table without RLS';
  end if;
end;
$test$;

rollback;
