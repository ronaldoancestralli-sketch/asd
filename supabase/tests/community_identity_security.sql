-- EchoArena — invariantes de segurança do Echo Identity / Echo Scouts V1.
begin;

do $$
begin
  if has_table_privilege('anon','public.echo_identity_badges','select') then
    raise exception 'identity_security: anon can read raw institutional badge table';
  end if;
  if has_table_privilege('authenticated','public.echo_founder_authority','select') then
    raise exception 'identity_security: authenticated can read founder authority table directly';
  end if;
  if has_function_privilege('authenticated','public.echo_set_founder_server_only(uuid,text)','execute') then
    raise exception 'identity_security: authenticated can invoke founder setter';
  end if;
  if not has_function_privilege('service_role','public.echo_set_founder_server_only(uuid,text)','execute') then
    raise exception 'identity_security: service_role founder transfer path missing';
  end if;
  if strpos(pg_get_functiondef('public.admin_set_identity_badge_v1(uuid,text,boolean,text,text)'::regprocedure),'echo_is_admin')=0 then
    raise exception 'identity_security: institutional badge setter bypasses AAL2 admin authority';
  end if;
  if strpos(pg_get_functiondef('public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text)'::regprocedure),'''pending''')=0 then
    raise exception 'identity_security: community contribution does not force pending state';
  end if;
  if strpos(pg_get_functiondef('public.echo_set_founder_server_only(uuid,text)'::regprocedure),'service_role_required')=0 then
    raise exception 'identity_security: founder setter lacks service-role assertion';
  end if;
  if strpos(pg_get_functiondef('public.echo_guard_institutional_badge()'::regprocedure),'creator_badge_requires_verified_claim')=0 then
    raise exception 'identity_security: Creator can be activated without verified claim guard';
  end if;
  if exists(select 1 from public.echo_identity_badges where badge_type in ('admin','founder')) then
    raise exception 'identity_security: technical authority leaked into badge table';
  end if;
  if exists(select 1 from public.echo_research_contributions where is_first_discovery and status <> 'verified') then
    raise exception 'identity_security: first discovery exists without verified status';
  end if;
end
$$;

rollback;
