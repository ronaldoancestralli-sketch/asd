-- Echo Identity Integrity V2 — invariantes read-only de segurança.

do $$
declare
  v_default text;
  v_fn text;
begin
  if has_table_privilege('anon','public.echo_identity_rollout_settings','select') then
    raise exception 'identity_v2: anon can read raw rollout settings';
  end if;
  if has_table_privilege('authenticated','public.echo_identity_rollout_settings','update') then
    raise exception 'identity_v2: authenticated can update rollout settings directly';
  end if;

  select pg_get_expr(d.adbin,d.adrelid) into v_default
  from pg_catalog.pg_attrdef d
  join pg_catalog.pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
  where d.adrelid='public.echo_identity_rollout_settings'::regclass and a.attname='public_identity_enabled';
  if coalesce(v_default,'') not in ('false','false::boolean') then
    raise exception 'identity_v2: master rollout default is not false';
  end if;

  if not has_function_privilege('anon','public.echo_identity_rollout_status_v1()','execute') then
    raise exception 'identity_v2: safe rollout status is not readable by anon';
  end if;
  if has_function_privilege('anon','public.admin_set_identity_rollout_v1(boolean,boolean,boolean,boolean,boolean,boolean,text,text)','execute') then
    raise exception 'identity_v2: anon can execute rollout setter';
  end if;

  v_fn:=pg_get_functiondef('public.echo_set_my_public_identity_v1(text,text,text,text,text,boolean)'::regprocedure);
  if strpos(v_fn,'display_name_invisible_characters')=0 or strpos(v_fn,'display_name_reserved')=0 or strpos(v_fn,'identity_public_rollout_disabled')=0 then
    raise exception 'identity_v2: self identity RPC lacks spoofing/rollout guards';
  end if;

  v_fn:=pg_get_functiondef('public.echo_request_creator_verification_v1(text,text)'::regprocedure);
  if strpos(v_fn,'creator_verification_rollout_disabled')=0 or strpos(v_fn,'channel_fingerprint')=0 or strpos(v_fn,'pg_advisory_xact_lock')=0 then
    raise exception 'identity_v2: Creator request lacks rollout/dedupe lock';
  end if;

  if not exists(
    select 1 from pg_catalog.pg_indexes
    where schemaname='public' and tablename='echo_creator_claims'
      and indexname='echo_creator_claims_verified_channel_unique'
      and indexdef ilike '%unique%'
  ) then
    raise exception 'identity_v2: verified Creator channel is not unique';
  end if;

  v_fn:=pg_get_functiondef('public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text)'::regprocedure);
  if strpos(v_fn,'research_submission_rollout_disabled')=0 or strpos(v_fn,'duplicate_research_submission')=0
     or strpos(v_fn,'submission_fingerprint')=0 or strpos(v_fn,'pg_advisory_xact_lock')=0 then
    raise exception 'identity_v2: Echo Research lacks rollout/dedupe lock';
  end if;

  v_fn:=pg_get_functiondef('public.echo_public_identity_cards_v1(uuid[])'::regprocedure);
  if strpos(v_fn,'identity_cards_enabled')=0 or strpos(v_fn,'public_profiles_enabled')=0 then
    raise exception 'identity_v2: public identity cards bypass rollout';
  end if;

  v_fn:=pg_get_functiondef('public.admin_set_identity_rollout_v1(boolean,boolean,boolean,boolean,boolean,boolean,text,text)'::regprocedure);
  if strpos(v_fn,'echo_is_admin')=0 or strpos(v_fn,'ENABLE_IDENTITY_V2')=0 then
    raise exception 'identity_v2: rollout setter lacks AAL2/confirmation guard';
  end if;
end $$;
