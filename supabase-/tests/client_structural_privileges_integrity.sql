-- EchoArena — regressão read-only dos privilégios estruturais da Data API.
-- Não cria nem altera dados.

do $$
declare
  v_count integer;
begin
  -- Nenhum grant atual de TRUNCATE/TRIGGER/REFERENCES para papéis de cliente.
  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema='public'
    and grantee in ('anon','authenticated')
    and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES');
  if v_count <> 0 then
    raise exception 'client_structural_privileges_regression: % structural table grant(s) returned', v_count;
  end if;

  -- MAINTAIN não aparece de forma confiável em role_table_grants em todas as versões;
  -- validar diretamente com has_table_privilege sobre todas as relações públicas.
  select count(*) into v_count
  from (values ('anon'),('authenticated')) r(role_name)
  cross join pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relkind in ('r','p','v','m')
    and has_table_privilege(r.role_name,c.oid,'MAINTAIN');
  if v_count <> 0 then
    raise exception 'client_structural_privileges_regression: MAINTAIN available on % role/relation pair(s)', v_count;
  end if;

  -- Defaults controláveis pelo owner postgres também devem permanecer fechados.
  select count(*) into v_count
  from pg_default_acl d
  join pg_roles owner_role on owner_role.oid=d.defaclrole
  join pg_namespace n on n.oid=d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) x
  join pg_roles grantee on grantee.oid=x.grantee
  where n.nspname='public'
    and d.defaclobjtype='r'
    and owner_role.rolname='postgres'
    and grantee.rolname in ('anon','authenticated')
    and x.privilege_type in ('TRUNCATE','TRIGGER','REFERENCES','MAINTAIN');
  if v_count <> 0 then
    raise exception 'client_structural_privileges_regression: postgres default ACL reopened % structural privilege(s)', v_count;
  end if;

  -- Hardening estrutural não pode quebrar as portas transacionais legítimas.
  if not has_function_privilege('authenticated','public.save_user_build(uuid,uuid,text,text,text,text,jsonb,text[])','EXECUTE') then
    raise exception 'client_structural_privileges_regression: authenticated lost save_user_build';
  end if;
  if not has_function_privilege('authenticated','public.save_team_composition(text,text,boolean,uuid[])','EXECUTE') then
    raise exception 'client_structural_privileges_regression: authenticated lost save_team_composition';
  end if;
  if not has_function_privilege('authenticated','public.toggle_saved_build_comparison(uuid,uuid,text)','EXECUTE') then
    raise exception 'client_structural_privileges_regression: authenticated lost toggle_saved_build_comparison';
  end if;
end $$;

select
  has_function_privilege('authenticated','public.save_user_build(uuid,uuid,text,text,text,text,jsonb,text[])','EXECUTE') as auth_save_build,
  has_function_privilege('authenticated','public.save_team_composition(text,text,boolean,uuid[])','EXECUTE') as auth_save_composition,
  has_function_privilege('authenticated','public.toggle_saved_build_comparison(uuid,uuid,text)','EXECUTE') as auth_save_comparison;
