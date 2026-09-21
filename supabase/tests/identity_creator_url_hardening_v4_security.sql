-- Echo Identity V4 Shadow — contrato de canonicalização e concessão Creator.
-- Executar no SNV após aplicar as migrations de identidade.

do $$
declare
  v text;
  v_fn text;
begin
  v:=public.echo_creator_canonical_channel_url_v1('youtube','https://www.youtube.com/@Creator/?utm_source=echo#x');
  if v<>'https://youtube.com/@Creator' then
    raise exception 'creator v4: YouTube alias/query was not canonicalized: %',v;
  end if;

  if public.echo_creator_canonical_channel_url_v1('youtube','https://example.com/@creator') is not null then
    raise exception 'creator v4: platform/domain mismatch was accepted';
  end if;

  if public.echo_creator_canonical_channel_url_v1('youtube','https://youtube.com/watch?v=abc') is not null then
    raise exception 'creator v4: YouTube video URL was accepted as channel';
  end if;

  v:=public.echo_creator_canonical_channel_url_v1('x','https://twitter.com/EchoCreator/?s=20');
  if v<>'https://x.com/echocreator' then
    raise exception 'creator v4: twitter alias was not canonicalized to x.com: %',v;
  end if;

  v:=public.echo_creator_canonical_channel_url_v1('instagram','https://www.instagram.com/Echo.Creator/');
  if v<>'https://instagram.com/echo.creator' then
    raise exception 'creator v4: Instagram canonicalization mismatch: %',v;
  end if;

  if public.echo_creator_canonical_channel_url_v1('other','https://example.com/channel?utm_source=x') is not null then
    raise exception 'creator v4: other platform accepted ambiguous query URL';
  end if;

  if public.echo_creator_canonical_channel_url_v1('other','https://localhost/channel') is not null then
    raise exception 'creator v4: local host accepted in other platform';
  end if;

  v_fn:=pg_get_functiondef('public.echo_request_creator_verification_v1(text,text)'::regprocedure);
  if strpos(v_fn,'creator_channel_platform_mismatch')=0
     or strpos(v_fn,'canonical_channel_url')=0
     or strpos(v_fn,'pg_advisory_xact_lock')=0 then
    raise exception 'creator v4: request RPC lacks canonical/platform/dedupe guards';
  end if;

  v_fn:=pg_get_functiondef('public.admin_set_identity_badge_v1(uuid,text,boolean,text,text)'::regprocedure);
  if strpos(v_fn,'creator_badge_requires_verified_claim')=0 then
    raise exception 'creator v4: generic badge RPC can still grant Creator';
  end if;

  v_fn:=pg_get_functiondef('public.admin_review_creator_claim_v1(uuid,text,text)'::regprocedure);
  if strpos(v_fn,'creator_claim_requires_reissue')=0
     or strpos(v_fn,'creator_claim_canonical_integrity_failed')=0
     or strpos(v_fn,'canonical_channel_url')=0
     or strpos(v_fn,'insert into public.echo_identity_badges')=0 then
    raise exception 'creator v4: review RPC does not own the verified Creator grant path';
  end if;

  if not exists(
    select 1 from pg_constraint
    where conname='echo_creator_verified_requires_canonical'
      and conrelid='public.echo_creator_claims'::regclass
  ) then
    raise exception 'creator v4: verified claim canonical constraint missing';
  end if;

  if not exists(
    select 1
    from pg_trigger t
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace n on n.oid=p.pronamespace
    where t.tgrelid='public.echo_identity_badges'::regclass
      and not t.tgisinternal
      and p.proname='echo_guard_institutional_badge'
      and n.nspname='public'
  ) then
    raise exception 'creator v4: defense-in-depth badge trigger missing';
  end if;

  if has_function_privilege('anon','public.echo_creator_canonical_channel_url_v1(text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.echo_creator_canonical_channel_url_v1(text,text)','EXECUTE') then
    raise exception 'creator v4: canonical helper exposed to public roles';
  end if;
end;
$$;
