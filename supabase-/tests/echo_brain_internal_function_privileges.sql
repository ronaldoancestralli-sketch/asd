-- EchoArena — funções internas do Echo Brain não são endpoints RPC.

do $$
declare
  v_proc regprocedure;
  v_signature text;
  v_role text;
begin
  foreach v_signature in array array[
    'public.echo_brain_guard_emergency_activation()',
    'public.echo_brain_guard_emergency_evaluation()',
    'public.echo_brain_guard_emergency_model_transition()',
    'public.echo_brain_guard_emergency_runtime()',
    'public.echo_brain_guard_emergency_training()',
    'public.echo_brain_guard_processing_during_emergency()'
  ] loop
    v_proc := to_regprocedure(v_signature);
    if v_proc is null then
      raise exception 'echo_brain_security_regression: missing function %', v_signature;
    end if;

    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(v_role, v_proc, 'EXECUTE') then
        raise exception 'echo_brain_security_regression: % can execute %', v_role, v_signature;
      end if;
    end loop;
  end loop;
end $$;

select
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'echo_brain_guard_%'
order by p.proname;
