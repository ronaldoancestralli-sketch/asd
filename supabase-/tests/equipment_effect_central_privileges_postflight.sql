-- SNV only: read-only verification for equipment_effect_central_privileges_v1.
-- No role impersonation, fixture data, DDL or destructive operations.
-- Run the two SELECT statements separately when the SQL client returns only
-- the last result set. Compare the checkpoint before/after the ACL correction.

-- Expected after correction: no mismatches, no RLS-disabled Central tables.
with roles(role_name) as (values ('anon'),('authenticated'),('service_role')),
tables(table_name,mutable) as (values ('equipment_effect_documents',true),('equipment_effect_document_revisions',false),('equipment_effect_evidence',false),('equipment_effect_revision_evidence',false),('equipment_effect_review_queue',true)),
privileges(privilege) as (select unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] || case when current_setting('server_version_num')::integer >= 170000 then array['MAINTAIN'] else '{}'::text[] end)),
matrix as (select role_name,table_name,privilege,
 has_table_privilege(role_name,'public.'||table_name,privilege) as actual,
 role_name<>'anon' and (privilege in ('SELECT','INSERT') or (mutable and privilege='UPDATE')) as expected,
 has_table_privilege(role_name,'public.'||table_name,privilege||' WITH GRANT OPTION') as grant_option
 from roles cross join tables cross join privileges),
funcs(signature,guard) as (values
 ('equipment_effect_central_write_guard_v1()',true),
 ('equipment_effect_central_immutable_guard_v1()',true),
 ('equipment_effect_payload_has_forbidden_key_v1(jsonb)',false),
 ('equipment_effect_builtin_capability_v1(text)',false),
 ('equipment_effect_issue_v1(text,text,text,text)',false),
 ('validate_equipment_effect_document_draft_v1(jsonb,text,uuid)',false),
 ('admin_save_equipment_effect_draft_v1(text,uuid,jsonb,jsonb,uuid,text)',false),
 ('admin_request_equipment_effect_review_v1(uuid,text,text,text)',false),
 ('admin_review_equipment_effect_revision_v1(uuid,text,text)',false),
 ('admin_list_equipment_effect_drafts_v1(uuid)',false)),
fmatrix as (select role_name,signature,has_function_privilege(role_name,'public.'||signature,'EXECUTE') as actual,(role_name<>'anon' and not guard) as expected from roles cross join funcs)
select jsonb_build_object('table_checks',(select count(*) from matrix),'function_checks',(select count(*) from fmatrix),
 'table_mismatches',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from matrix m where actual is distinct from expected or grant_option),
 'function_mismatches',(select coalesce(jsonb_agg(to_jsonb(f)),'[]') from fmatrix f where actual is distinct from expected),
 'rls_disabled',(select coalesce(jsonb_agg(t.table_name),'[]') from tables t join pg_class c on c.oid=('public.'||t.table_name)::regclass where not c.relrowsecurity)) as verification;

-- Expected: this entire checkpoint is unchanged by the ACL correction.
select jsonb_build_object(
  'catalog', jsonb_build_object(
    'equipments', (select jsonb_build_object('count',count(*),'md5',md5(coalesce(string_agg(to_jsonb(e)::text,E'\n' order by e.id),''))) from public.equipments e),
    'variants', (select jsonb_build_object('count',count(*),'md5',md5(coalesce(string_agg(to_jsonb(e)::text,E'\n' order by e.id),''))) from public.equipment_variants e),
    'set_bonuses', (select jsonb_build_object('count',count(*),'md5',md5(coalesce(string_agg(to_jsonb(e)::text,E'\n' order by e.id),''))) from public.equipment_set_bonuses e)
  ),
  'central_counts', jsonb_build_object(
    'documents',(select count(*) from public.equipment_effect_documents),
    'revisions',(select count(*) from public.equipment_effect_document_revisions),
    'evidence',(select count(*) from public.equipment_effect_evidence),
    'links',(select count(*) from public.equipment_effect_revision_evidence),
    'reviews',(select count(*) from public.equipment_effect_review_queue)
  ),
  'function_definitions_md5',(select md5(string_agg(pg_get_functiondef(p.oid),E'\n' order by p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like '%equipment_effect%'),
  'policies_md5',(select md5(string_agg(to_jsonb(p)::text,E'\n' order by p.tablename,p.policyname))
    from pg_policies p where p.schemaname='public' and p.tablename like 'equipment_effect_%'),
  'triggers_md5',(select md5(string_agg(pg_get_triggerdef(t.oid),E'\n' order by t.oid))
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname like 'equipment_effect_%' and not t.tgisinternal),
  'defaults_md5',(select md5(coalesce(string_agg(to_jsonb(d)::text,E'\n' order by d.oid),'')) from pg_default_acl d),
  'other_public_table_acls_md5',(select md5(string_agg(jsonb_build_object('oid',c.oid,'acl',c.relacl)::text,E'\n' order by c.oid))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relname not like 'equipment_effect_%'),
  'other_public_function_acls_md5',(select md5(string_agg(jsonb_build_object('oid',p.oid,'acl',p.proacl)::text,E'\n' order by p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname not in ('equipment_effect_central_write_guard_v1','equipment_effect_central_immutable_guard_v1'))
) as checkpoint;
