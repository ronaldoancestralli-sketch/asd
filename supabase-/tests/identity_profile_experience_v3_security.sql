-- Echo Identity Profile Experience V3 — contrato de segurança read-only.
-- Executar no SNV somente após as migrations V1/V2/V3 em ambiente controlado.

begin;

do $$
declare
  v_proc regprocedure := to_regprocedure('public.echo_public_profile_v1(text)');
  v_definition text;
  v_settings public.echo_identity_rollout_settings%rowtype;
begin
  if v_proc is null then
    raise exception 'echo_public_profile_v1(text) missing';
  end if;

  select pg_get_functiondef(v_proc::oid) into v_definition;
  select * into v_settings from public.echo_identity_rollout_settings where singleton=true;

  if v_settings.public_identity_enabled is not false
     or v_settings.public_profiles_enabled is not false
     or v_settings.identity_cards_enabled is not false then
    raise exception 'identity profile rollout is not fail-closed by default';
  end if;

  if position('profile_experience_version' in v_definition)=0
     or position('v3-shadow' in v_definition)=0 then
    raise exception 'profile v3 marker missing';
  end if;

  if position('public_identity_enabled=true' in replace(v_definition,' ',''))=0
     or position('public_profiles_enabled=true' in replace(v_definition,' ',''))=0
     or position('identity_cards_enabled=true' in replace(v_definition,' ',''))=0 then
    raise exception 'profile v3 lost rollout gates';
  end if;

  if position('corroborated' in v_definition)=0 or position('verified' in v_definition)=0 then
    raise exception 'public history is not restricted to reviewed contributions';
  end if;

  if position('reputation_points' in v_definition)>0 then
    raise exception 'public profile exposes ranking points';
  end if;
  if position('email' in lower(v_definition))>0
     or position('proof_code' in lower(v_definition))>0
     or position('evidence_reference' in lower(v_definition))>0
     or position('review_note' in lower(v_definition))>0 then
    raise exception 'public profile references private identity/research data';
  end if;

  if not has_function_privilege('anon',v_proc,'EXECUTE')
     or not has_function_privilege('authenticated',v_proc,'EXECUTE') then
    raise exception 'public profile narrow RPC grants changed';
  end if;

  if not has_function_privilege('service_role',v_proc,'EXECUTE') then
    raise exception 'service_role lost profile RPC execute';
  end if;
end $$;

rollback;
