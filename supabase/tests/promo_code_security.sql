-- EchoArena — contrato de segurança dos códigos promocionais.
-- O código real e metadados administrativos não podem vazar pela superfície pública.
-- Toda campanha deve pertencer ao Bullet Echo. A fonte manual é opcional,
-- enquanto a automação continua validando origens oficiais separadamente.
-- Executar em uma conexão administrativa dedicada. A transação é sempre descartada:
-- a campanha sintética nunca é publicada para outras sessões e não usa contas reais.
begin;
set local statement_timeout = '15s';
set local lock_timeout = '3s';

do $$
declare
  v_proc regprocedure;
  v_policy text;
  v_constraint text;
begin
  if to_regclass('public.promo_campaigns') is null
     or to_regclass('public.promo_likes') is null
     or to_regclass('private.promo_secrets') is null then
    raise exception 'security_test_failed: promo tables missing';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='promo_campaigns' and column_name='code'
  ) then
    raise exception 'security_test_failed: secret code leaked into public.promo_campaigns';
  end if;

  if has_table_privilege('anon', 'private.promo_secrets', 'SELECT')
     or has_table_privilege('authenticated', 'private.promo_secrets', 'SELECT') then
    raise exception 'security_test_failed: client can select private promo secrets';
  end if;

  if not has_column_privilege('anon','public.promo_campaigns','id','SELECT')
     or not has_column_privilege('authenticated','public.promo_campaigns','title','SELECT') then
    raise exception 'security_test_failed: safe public promo metadata is not readable';
  end if;

  if has_column_privilege('anon','public.promo_campaigns','verification_method','SELECT')
     or has_column_privilege('anon','public.promo_campaigns','created_by','SELECT')
     or has_column_privilege('anon','public.promo_campaigns','updated_by','SELECT')
     or has_column_privilege('authenticated','public.promo_campaigns','verification_method','SELECT')
     or has_column_privilege('authenticated','public.promo_campaigns','created_by','SELECT')
     or has_column_privilege('authenticated','public.promo_campaigns','updated_by','SELECT') then
    raise exception 'security_test_failed: internal promo columns exposed to client roles';
  end if;

  if not (select relrowsecurity from pg_class where oid='public.promo_campaigns'::regclass)
     or not (select relrowsecurity from pg_class where oid='public.promo_likes'::regclass) then
    raise exception 'security_test_failed: promo RLS disabled';
  end if;

  if to_regprocedure('private.promo_is_official_bullet_echo_source(text,text)') is null then
    raise exception 'security_test_failed: official source validator missing';
  end if;

  if has_function_privilege('anon','private.promo_is_official_bullet_echo_source(text,text)','EXECUTE')
     or has_function_privilege('authenticated','private.promo_is_official_bullet_echo_source(text,text)','EXECUTE') then
    raise exception 'security_test_failed: client can execute private official-source validator';
  end if;

  if not private.promo_is_official_bullet_echo_source(
    'Bullet Echo — Telegram oficial (RU/global)',
    'https://t.me/bulletecho/1234'
  ) then
    raise exception 'security_test_failed: official Russian/global Telegram source rejected';
  end if;

  if private.promo_is_official_bullet_echo_source(
    'Bullet Echo — Telegram oficial (RU/global)',
    'https://example.com/fake-bullet-echo-code'
  ) then
    raise exception 'security_test_failed: third-party URL accepted as official source';
  end if;

  foreach v_constraint in array array[
    'promo_campaigns_bullet_echo_only_check',
    'promo_campaigns_source_url_check',
    'promo_campaigns_source_type_check'
  ] loop
    if not exists (
      select 1 from pg_constraint
      where conrelid='public.promo_campaigns'::regclass
        and conname=v_constraint
    ) then
      raise exception 'security_test_failed: promo constraint % missing', v_constraint;
    end if;
  end loop;

  if position(
    'public.is_blocked()' in pg_get_functiondef('public.promo_reveal_if_liked(uuid)'::regprocedure)
  ) = 0 then
    raise exception 'security_test_failed: blocked user can reach promo re-reveal path';
  end if;

  if position(
    'promo_source_url_invalid' in pg_get_functiondef(
      'public.promo_admin_publish(text,uuid,text,text,text,timestamptz)'::regprocedure
    )
  ) = 0
  or position(
    'public.echo_is_admin()' in pg_get_functiondef(
      'public.promo_admin_publish(text,uuid,text,text,text,timestamptz)'::regprocedure
    )
  ) = 0
  or position(
    'insert into public.admin_log' in pg_get_functiondef(
      'public.promo_admin_publish(text,uuid,text,text,text,timestamptz)'::regprocedure
    )
  ) = 0
  or position(
    '''Bullet Echo''' in pg_get_functiondef(
      'public.promo_admin_publish(text,uuid,text,text,text,timestamptz)'::regprocedure
    )
  ) = 0 then
    raise exception 'security_test_failed: quick publish lost admin authorization, URL validation, authorship audit or game boundary';
  end if;

  if position(
    'set published = false' in pg_get_functiondef(
      'public.promo_admin_remove(uuid)'::regprocedure
    )
  ) = 0
  or position(
    'public.echo_is_admin()' in pg_get_functiondef(
      'public.promo_admin_remove(uuid)'::regprocedure
    )
  ) = 0
  or position(
    'delete from public.promo_campaigns' in pg_get_functiondef(
      'public.promo_admin_remove(uuid)'::regprocedure
    )
  ) > 0 then
    raise exception 'security_test_failed: admin removal is not reversible';
  end if;

  if position(
    'public.echo_is_admin()' in pg_get_functiondef(
      'public.promo_admin_list()'::regprocedure
    )
  ) = 0 then
    raise exception 'security_test_failed: admin list lost its authorization boundary';
  end if;

  foreach v_policy in array array[
    'promo_campaigns_authenticated_select',
    'promo_campaigns_admin_insert',
    'promo_campaigns_admin_update',
    'promo_campaigns_admin_delete',
    'promo_likes_authenticated_select',
    'promo_likes_authenticated_delete'
  ] loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and policyname = v_policy
        and position('echo_is_admin' in coalesce(qual, '') || ' ' || coalesce(with_check, '')) > 0
    ) then
      raise exception 'security_test_failed: promo policy % does not require echo_is_admin/AAL2', v_policy;
    end if;
  end loop;

  foreach v_proc in array array[
    'public.promo_like_and_reveal(uuid)'::regprocedure,
    'public.promo_reveal_if_liked(uuid)'::regprocedure,
    'public.promo_admin_list()'::regprocedure,
    'public.promo_admin_publish(text,uuid,text,text,text,timestamptz)'::regprocedure,
    'public.promo_admin_remove(uuid)'::regprocedure,
    'public.promo_admin_save(uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,text,boolean,text)'::regprocedure,
    'public.promo_admin_delete(uuid)'::regprocedure
  ] loop
    if has_function_privilege('anon', v_proc, 'EXECUTE') then
      raise exception 'security_test_failed: anon can execute %', v_proc;
    end if;
    if not has_function_privilege('authenticated', v_proc, 'EXECUTE') then
      raise exception 'security_test_failed: authenticated cannot execute %', v_proc;
    end if;
  end loop;
end $$;

-- Regressão executável da RPC, além das verificações de catálogo acima.
-- Somente a fixture desta transação é consultada; nenhum código real é retornado.
do $promo_runtime$
declare
  v_promo_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_other_id uuid := gen_random_uuid();
  v_missing_secret_user uuid := gen_random_uuid();
  v_expected_time timestamptz := now() - interval '1 day';
  v_result record;
  v_checks integer := 0;
begin
  insert into public.promo_campaigns (
    id, game, title, source_type, source_name, source_url,
    verification_status, verified_at, status, published, expires_at
  ) values (
    v_promo_id, 'Bullet Echo', 'FIXTURE TRANSACIONAL — NÃO PUBLICAR',
    'official', 'Bullet Echo — Telegram oficial (RU/global)',
    'https://t.me/bulletecho', 'verified', now(), 'active', true,
    now() + interval '1 hour'
  );
  insert into private.promo_secrets(promo_id, code)
  values (v_promo_id, 'ECHO-RPC-TEST-ONLY');

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    perform public.promo_like_and_reveal(v_promo_id);
    raise exception 'runtime_test_failed: anonymous RPC allowed';
  exception when insufficient_privilege then null;
  end;
  v_checks := v_checks + 1;

  execute 'set local role authenticated';
  begin
    perform public.promo_like_and_reveal(v_promo_id);
    raise exception 'runtime_test_failed: missing identity allowed';
  exception when insufficient_privilege then
    if sqlerrm <> 'promo_authentication_required' then raise; end if;
  end;
  v_checks := v_checks + 1;

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_user_id, 'role', 'authenticated', 'aal', 'aal1'
  )::text, true);
  if exists(select 1 from public.promo_reveal_if_liked(v_promo_id)) then
    raise exception 'runtime_test_failed: code revealed before a like';
  end if;
  v_checks := v_checks + 1;

  select * into strict v_result from public.promo_like_and_reveal(v_promo_id);
  if v_result.promo_id is distinct from v_promo_id
     or v_result.code is distinct from 'ECHO-RPC-TEST-ONLY'
     or v_result.liked_at is null then
    raise exception 'runtime_test_failed: first like did not reveal its campaign';
  end if;
  v_checks := v_checks + 1;

  -- Uma data anterior detecta até um retry incorreto que use now() na mesma transação.
  execute 'reset role';
  update public.promo_likes set created_at = v_expected_time
  where promo_id = v_promo_id and user_id = v_user_id;
  execute 'set local role authenticated';
  select * into strict v_result from public.promo_like_and_reveal(v_promo_id);
  if v_result.promo_id is distinct from v_promo_id
     or v_result.code is distinct from 'ECHO-RPC-TEST-ONLY'
     or v_result.liked_at is distinct from v_expected_time
     or (select count(*) from public.promo_likes where promo_id = v_promo_id) <> 1 then
    raise exception 'runtime_test_failed: retry changed or duplicated the like';
  end if;
  v_checks := v_checks + 1;

  select * into strict v_result from public.promo_reveal_if_liked(v_promo_id);
  if v_result.code is distinct from 'ECHO-RPC-TEST-ONLY'
     or v_result.liked_at is distinct from v_expected_time then
    raise exception 'runtime_test_failed: existing like was not restored';
  end if;
  v_checks := v_checks + 1;

  perform set_config('request.jwt.claim.sub', v_other_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_other_id, 'role', 'authenticated', 'aal', 'aal1'
  )::text, true);
  if exists(select 1 from public.promo_reveal_if_liked(v_promo_id))
     or exists(select 1 from public.promo_likes where promo_id = v_promo_id) then
    raise exception 'runtime_test_failed: another account inherited the like';
  end if;
  v_checks := v_checks + 1;

  select * into strict v_result from public.promo_like_and_reveal(v_promo_id);
  if v_result.code is distinct from 'ECHO-RPC-TEST-ONLY'
     or (select count(*) from public.promo_likes where promo_id = v_promo_id) <> 1 then
    raise exception 'runtime_test_failed: second account could not like independently';
  end if;
  v_checks := v_checks + 1;

  execute 'reset role';
  update public.promo_campaigns set expires_at = now() - interval '1 second'
  where id = v_promo_id;
  execute 'set local role authenticated';
  begin
    perform public.promo_like_and_reveal(v_promo_id);
    raise exception 'runtime_test_failed: expired campaign allowed a like';
  exception when invalid_parameter_value then
    if sqlerrm <> 'promo_not_available' then raise; end if;
  end;
  v_checks := v_checks + 1;
  if exists(select 1 from public.promo_reveal_if_liked(v_promo_id)) then
    raise exception 'runtime_test_failed: expired campaign revealed again';
  end if;
  v_checks := v_checks + 1;

  execute 'reset role';
  update public.promo_campaigns set expires_at = now() + interval '1 hour'
  where id = v_promo_id;
  delete from private.promo_secrets where promo_id = v_promo_id;
  perform set_config('request.jwt.claim.sub', v_missing_secret_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_missing_secret_user, 'role', 'authenticated', 'aal', 'aal1'
  )::text, true);
  execute 'set local role authenticated';
  begin
    perform public.promo_like_and_reveal(v_promo_id);
    raise exception 'runtime_test_failed: missing secret was accepted';
  exception when raise_exception then
    if sqlerrm <> 'promo_code_unavailable' then raise; end if;
  end;
  if exists(select 1 from public.promo_likes where promo_id = v_promo_id) then
    raise exception 'runtime_test_failed: failed reveal persisted a like';
  end if;
  v_checks := v_checks + 1;
  execute 'reset role';
  if (select count(*) from public.promo_likes where promo_id = v_promo_id) <> 2 then
    raise exception 'runtime_test_failed: unexpected fixture like count';
  end if;
  raise notice 'PROMO RPC RUNTIME: % checks passed; fixture will be rolled back', v_checks;
end $promo_runtime$;

rollback;

select
  11 as rpc_runtime_checks_passed,
  has_table_privilege('anon','private.promo_secrets','SELECT') as anon_can_read_secret,
  has_table_privilege('authenticated','private.promo_secrets','SELECT') as authenticated_can_read_secret,
  has_column_privilege('anon','public.promo_campaigns','verification_method','SELECT') as anon_can_read_verification_method,
  has_column_privilege('authenticated','public.promo_campaigns','created_by','SELECT') as authenticated_can_read_created_by,
  (select relrowsecurity from pg_class where oid='public.promo_campaigns'::regclass) as campaigns_rls,
  (select relrowsecurity from pg_class where oid='public.promo_likes'::regclass) as likes_rls,
  private.promo_is_official_bullet_echo_source('Bullet Echo — Telegram oficial (RU/global)','https://t.me/bulletecho/1') as telegram_official_source_valid;
