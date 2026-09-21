-- Contrato executável do fluxo administrativo rápido.
-- Usa apenas fixtures transacionais e nunca lê códigos reais.
begin;
set local statement_timeout = '15s';
set local lock_timeout = '3s';

create or replace function public.echo_is_admin()
returns boolean
language sql
stable
as $$ select auth.uid() is not null $$;

do $promo_admin_runtime$
declare
  v_admin_id uuid := gen_random_uuid();
  v_promo_id uuid;
  v_republished_id uuid;
  v_row public.promo_campaigns%rowtype;
  v_list record;
  v_removed boolean;
begin
  insert into public.profiles(id, display_name, username)
  values (v_admin_id, 'Admin de teste', 'admin-teste');

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub',v_admin_id,'role','authenticated','aal','aal2')::text,
    true
  );

  select public.promo_admin_publish(
    p_code => 'ECHO-ADMIN-QUICK-TEST'
  ) into v_promo_id;

  select * into strict v_row
  from public.promo_campaigns
  where id = v_promo_id;

  if v_row.game <> 'Bullet Echo'
     or v_row.published is not true
     or v_row.status <> 'active'
     or v_row.verification_status <> 'verified'
     or v_row.created_by is distinct from v_admin_id
     or v_row.updated_by is distinct from v_admin_id
     or v_row.source_url is not null then
    raise exception 'promo_admin_test_failed: quick publish state or authorship is wrong';
  end if;

  if not exists (
    select 1 from private.promo_secrets s
    where s.promo_id = v_promo_id and s.code = 'ECHO-ADMIN-QUICK-TEST'
  ) then
    raise exception 'promo_admin_test_failed: secret was not stored privately';
  end if;

  select * into strict v_list
  from public.promo_admin_list()
  where id = v_promo_id;

  if v_list.created_by_name <> 'Admin de teste'
     or v_list.code <> 'ECHO-ADMIN-QUICK-TEST'
     or v_list.has_code is not true then
    raise exception 'promo_admin_test_failed: admin list lost author or secret status';
  end if;

  select public.promo_admin_remove(v_promo_id) into v_removed;
  if v_removed is not true then
    raise exception 'promo_admin_test_failed: published campaign was not removed';
  end if;

  select * into strict v_row
  from public.promo_campaigns
  where id = v_promo_id;

  if v_row.published is not false
     or v_row.status <> 'invalid'
     or v_row.created_by is distinct from v_admin_id then
    raise exception 'promo_admin_test_failed: removal deleted state or original author';
  end if;

  if not exists (
    select 1 from private.promo_secrets s
    where s.promo_id = v_promo_id and s.code = 'ECHO-ADMIN-QUICK-TEST'
  ) then
    raise exception 'promo_admin_test_failed: reversible removal deleted the secret';
  end if;

  select public.promo_admin_publish(
    p_code => 'ECHO-ADMIN-QUICK-TEST',
    p_source_url => 'https://example.com/promo',
    p_title => 'Promo republicada'
  ) into v_republished_id;

  if v_republished_id is distinct from v_promo_id then
    raise exception 'promo_admin_test_failed: same code created a duplicate campaign';
  end if;

  select * into strict v_row
  from public.promo_campaigns
  where id = v_promo_id;

  if v_row.published is not true
     or v_row.status <> 'active'
     or v_row.source_url <> 'https://example.com/promo'
     or v_row.created_by is distinct from v_admin_id then
    raise exception 'promo_admin_test_failed: republish did not restore campaign correctly';
  end if;

  if (
    select count(*)
    from public.admin_log l
    where l.admin_id = v_admin_id
      and l.action in ('promo.published','promo.republished','promo.removed')
  ) <> 3 then
    raise exception 'promo_admin_test_failed: audit trail is incomplete';
  end if;

  if exists (
    select 1
    from public.admin_log l
    where l.admin_id = v_admin_id
      and l.detail::text ilike '%ECHO-ADMIN-QUICK-TEST%'
  ) then
    raise exception 'promo_admin_test_failed: secret code leaked into audit log';
  end if;
end;
$promo_admin_runtime$;

select 'promo_admin_quick_publish_ok';
rollback;

