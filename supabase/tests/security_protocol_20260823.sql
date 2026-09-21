-- EchoArena — regressões do protocolo de segurança 2026-08-23.
-- Executar contra a branch Supabase antes de qualquer merge em produção.

begin;

do $$
declare
  v_count integer;
begin
  -- Toda view alcançável pelo Data API precisa obedecer às permissões/RLS do invocador.
  select count(*) into v_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and (
      has_table_privilege('anon', c.oid, 'select')
      or has_table_privilege('authenticated', c.oid, 'select')
    )
    and not exists (
      select 1
      from pg_options_to_table(c.reloptions)
      where option_name = 'security_invoker'
        and option_value = 'true'
    );
  if v_count <> 0 then
    raise exception 'security_protocol_regression: % exposed view(s) are not security_invoker', v_count;
  end if;

  if has_table_privilege('anon', 'public.v_build_compare', 'select') then
    raise exception 'security_protocol_regression: anon can reach private build comparisons';
  end if;

  -- Colunas de autorização/moderação não podem voltar a ser globais para authenticated.
  if has_column_privilege('authenticated', 'public.profiles', 'role', 'select')
     or has_column_privilege('authenticated', 'public.profiles', 'role_id', 'select')
     or has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'select')
     or has_column_privilege('authenticated', 'public.profiles', 'is_blocked', 'select')
     or has_column_privilege('authenticated', 'public.profiles', 'blocked_reason', 'select')
     or has_column_privilege('authenticated', 'public.profiles', 'blocked_at', 'select') then
    raise exception 'security_protocol_regression: authenticated regained global sensitive profile columns';
  end if;

  if not has_column_privilege('authenticated', 'public.profiles', 'display_name', 'select') then
    raise exception 'security_protocol_regression: public profile surface was accidentally removed';
  end if;

  -- Bucket legado não pode aceitar escrita genérica.
  select count(*) into v_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname in ('Authenticated Upload', 'Authenticated Update', 'Authenticated Delete');
  if v_count <> 0 then
    raise exception 'security_protocol_regression: % legacy media write policies remain', v_count;
  end if;

  -- Analytics: clientes não recebem INSERT direto, somente a RPC limitada.
  if has_table_privilege('anon', 'public.analytics_events', 'insert')
     or has_table_privilege('authenticated', 'public.analytics_events', 'insert') then
    raise exception 'security_protocol_regression: direct analytics INSERT is still granted';
  end if;

  if not has_function_privilege('anon', 'public.record_analytics_event(text,text,text,uuid,text,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.record_analytics_event(text,text,text,uuid,text,jsonb)', 'execute') then
    raise exception 'security_protocol_regression: analytics ingest RPC is unavailable';
  end if;

  -- Só o helper de identidade pode reconhecer admin em AAL1. Os helpers de autorização
  -- precisam conter a exigência de aal2 no corpo.
  if position('aal2' in pg_get_functiondef('public.echo_is_admin()'::regprocedure)) = 0 then
    raise exception 'security_protocol_regression: echo_is_admin no longer requires AAL2';
  end if;
  if position('echo_is_admin' in pg_get_functiondef('public.is_admin()'::regprocedure)) = 0 then
    raise exception 'security_protocol_regression: is_admin bypasses centralized AAL2 authorization';
  end if;
  if position('echo_is_admin' in pg_get_functiondef('public.current_user_is_admin()'::regprocedure)) = 0 then
    raise exception 'security_protocol_regression: Storage admin helper bypasses centralized AAL2 authorization';
  end if;

  if has_function_privilege('anon', 'public.echo_admin_identity()', 'execute') then
    raise exception 'security_protocol_regression: anon can call admin identity helper';
  end if;
end
$$;

rollback;
