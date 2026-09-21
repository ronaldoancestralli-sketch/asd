-- EchoArena — garante que RPCs administrativas SECURITY DEFINER não sejam públicas.
-- `authenticated` permanece com EXECUTE porque cada função faz is_admin()
-- internamente; `service_role` é preservado para operações privilegiadas.

do $$
declare
  v_proc regprocedure;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.admin_change_master_password(text,text)',
    'public.admin_set_build_flag(uuid,text,boolean)',
    'public.admin_set_comment_flag(uuid,text,boolean)',
    'public.admin_set_maintenance(boolean,text)',
    'public.admin_set_user_blocked(uuid,boolean,text)',
    'public.admin_set_user_role(uuid,text)',
    'public.admin_sync_hero_media(uuid)'
  ] loop
    v_proc := to_regprocedure(v_signature);
    if v_proc is null then
      raise exception 'security_test_failed: missing function %', v_signature;
    end if;

    if has_function_privilege('anon', v_proc, 'EXECUTE') then
      raise exception 'security_test_failed: anon can execute %', v_signature;
    end if;

    if not has_function_privilege('authenticated', v_proc, 'EXECUTE') then
      raise exception 'security_test_failed: authenticated lost execute on %', v_signature;
    end if;

    if not has_function_privilege('service_role', v_proc, 'EXECUTE') then
      raise exception 'security_test_failed: service_role lost execute on %', v_signature;
    end if;
  end loop;
end $$;

select
  count(*) filter (where has_function_privilege('anon', p.oid, 'EXECUTE')) as admin_rpcs_executable_by_anon,
  count(*) filter (where has_function_privilege('authenticated', p.oid, 'EXECUTE')) as admin_rpcs_executable_by_authenticated,
  count(*) filter (where has_function_privilege('service_role', p.oid, 'EXECUTE')) as admin_rpcs_executable_by_service_role
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'admin_change_master_password','admin_set_build_flag','admin_set_comment_flag',
    'admin_set_maintenance','admin_set_user_blocked','admin_set_user_role','admin_sync_hero_media'
  );
