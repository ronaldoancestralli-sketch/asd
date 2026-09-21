-- Echo Identity V4 Shadow — privacidade do nome público.
-- Executar no SNV após aplicar as migrations de identidade.

do $$
declare
  v_fn text;
begin
  if not public.echo_identity_display_name_looks_like_email('legacy@example.com') then
    raise exception 'identity v4: email-shaped legacy display name was not detected';
  end if;

  if public.echo_identity_display_name_looks_like_email('Arena Scout') then
    raise exception 'identity v4: normal public nickname was misclassified as email';
  end if;

  v_fn:=pg_get_functiondef('public.echo_set_my_public_identity_v1(text,text,text,text,text,boolean)'::regprocedure);
  if strpos(v_fn,'display_name_email_not_allowed')=0
     or strpos(v_fn,'echo_identity_display_name_looks_like_email')=0 then
    raise exception 'identity v4: own-profile RPC does not reject email-shaped display names';
  end if;

  v_fn:=pg_get_functiondef('public.echo_public_identity_cards_v1(uuid[])'::regprocedure);
  if strpos(v_fn,'echo_identity_display_name_looks_like_email')=0
     or strpos(v_fn,'ep.public_handle')=0
     or strpos(v_fn,'profile_completed_at is not null')=0 then
    raise exception 'identity v4: public cards can expose a legacy email-shaped display name';
  end if;

  if has_function_privilege('anon','public.echo_identity_display_name_looks_like_email(text)','EXECUTE')
     or has_function_privilege('authenticated','public.echo_identity_display_name_looks_like_email(text)','EXECUTE') then
    raise exception 'identity v4: email privacy helper exposed to public roles';
  end if;
end;
$$;
