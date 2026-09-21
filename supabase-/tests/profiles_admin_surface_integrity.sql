-- EchoArena — integridade da superfície Admin de perfis.
-- Não persiste fixtures; usa os perfis reais apenas para validar autorização/leitura.

begin;

do $test$
declare
  v_admin uuid;
  v_non_admin uuid;
  v_payload jsonb;
  v_rejected boolean := false;
begin
  select id into v_admin
  from public.profiles
  where role = 'admin' or is_admin = true
  order by created_at nulls last, id
  limit 1;

  if v_admin is null then
    raise exception 'profiles_test_requires_existing_admin';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_payload := public.admin_profiles_page(null, null, null, 25, 0);

  if (v_payload->>'total_count')::bigint <> (select count(*) from public.profiles) then
    raise exception 'admin_profiles_page_total_mismatch';
  end if;

  if coalesce(jsonb_array_length(v_payload->'users'), 0) > 25 then
    raise exception 'admin_profiles_page_limit_not_enforced';
  end if;

  select id into v_non_admin
  from public.profiles
  where id <> v_admin
    and not (role = 'admin' or is_admin = true)
  order by created_at nulls last, id
  limit 1;

  if v_non_admin is not null then
    perform set_config('request.jwt.claim.sub', v_non_admin::text, true);
    begin
      perform public.admin_profiles_page(null, null, null, 1, 0);
    exception
      when insufficient_privilege then
        v_rejected := true;
    end;

    if not v_rejected then
      raise exception 'non_admin_profile_rpc_not_rejected';
    end if;
  end if;
end;
$test$;

-- Privilégios da RPC e da função histórica de promoção.
do $test$
begin
  if has_function_privilege('anon', 'public.admin_profiles_page(text,text,text,integer,integer)', 'EXECUTE') then
    raise exception 'anon_can_execute_admin_profiles_page';
  end if;

  if not has_function_privilege('authenticated', 'public.admin_profiles_page(text,text,text,integer,integer)', 'EXECUTE') then
    raise exception 'authenticated_cannot_execute_admin_profiles_page';
  end if;

  if has_function_privilege('anon', 'public.make_admin(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.make_admin(text)', 'EXECUTE') then
    raise exception 'make_admin_exposed_to_client_role';
  end if;

  if not has_function_privilege('service_role', 'public.make_admin(text)', 'EXECUTE') then
    raise exception 'make_admin_service_role_missing';
  end if;
end;
$test$;

-- A fase compatível deve ter uma única leitura e políticas explícitas por escrita.
do $test$
declare
  v_select integer;
  v_insert integer;
  v_update integer;
  v_delete integer;
  v_legacy integer;
begin
  select count(*) filter (where cmd='SELECT'),
         count(*) filter (where cmd='INSERT'),
         count(*) filter (where cmd='UPDATE'),
         count(*) filter (where cmd='DELETE'),
         count(*) filter (where policyname in ('profiles_read','profiles_admin_all','profiles_self_upd'))
    into v_select, v_insert, v_update, v_delete, v_legacy
  from pg_policies
  where schemaname='public' and tablename='profiles';

  if v_select <> 1 or v_insert <> 1 or v_update <> 1 or v_delete <> 1 or v_legacy <> 0 then
    raise exception 'profiles_policy_shape_invalid';
  end if;
end;
$test$;

-- Nesta fase de rollout o SELECT amplo autenticado ainda existe deliberadamente.
-- O teste será endurecido quando a migration final de colunas for aplicada.
do $test$
begin
  if not has_table_privilege('authenticated', 'public.profiles', 'SELECT') then
    raise exception 'profiles_compat_select_closed_too_early';
  end if;
end;
$test$;

select
  (select count(*) from public.profiles) as profile_rows,
  (select count(*) from public.profiles where is_blocked = true) as blocked_rows,
  (select count(*) from public.profiles where role='admin' or is_admin=true) as admin_marked_rows,
  has_function_privilege('anon', 'public.admin_profiles_page(text,text,text,integer,integer)', 'EXECUTE') as anon_rpc_execute,
  has_function_privilege('authenticated', 'public.admin_profiles_page(text,text,text,integer,integer)', 'EXECUTE') as authenticated_rpc_execute;

rollback;
