\set ON_ERROR_STOP on
do $$ begin if current_database()<>'status_central_test' then raise exception 'DISPOSABLE_DATABASE_REQUIRED'; end if; end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
insert into auth.users values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.fixture_caps(capability text primary key,allowed boolean not null);
insert into public.fixture_caps values('equipment.view',true),('equipment.edit',true),('equipment.publish',true),('heroes.edit',true);
create function public.echo_has_admin_capability(p_capability text) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and coalesce((select allowed from public.fixture_caps where capability=p_capability),false)
$$;
create function public.echo_require_admin_capability(p_capability text) returns void language plpgsql security definer set search_path='' as $$
begin if not public.echo_has_admin_capability(p_capability) then raise exception 'DENIED' using errcode='42501'; end if; end $$;
create table public.fixture_audit(id bigint generated always as identity primary key,action text,before_data jsonb,after_data jsonb,reason text);
create function public.echo_write_admin_audit(p_module text,p_capability text,p_action text,p_type text,p_target text,p_reason text,p_before jsonb,p_after jsonb,p_actor_kind text default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint;
begin perform public.echo_require_admin_capability(p_capability); insert into public.fixture_audit(action,before_data,after_data,reason) values(p_action,p_before,p_after,p_reason) returning id into result; return result; end $$;
create table public.heroes(id uuid primary key,name text,enabled boolean default true);
create table public.equipments(id uuid primary key,name text,enabled boolean default true);
create table public.hero_base_stats(id uuid primary key default gen_random_uuid(),hero_id uuid references heroes,stat_key text,value numeric,updated_at timestamptz default now(),unique(hero_id,stat_key));
create table public.hero_weapon_stats(like public.hero_base_stats including defaults including constraints including indexes);
create table public.equipment_variants(id uuid primary key,equipment_id uuid references equipments,attributes jsonb);
create table public.equipment_set_bonuses(id uuid primary key,stats jsonb);
create table public.hero_skills(id uuid primary key,hero_id uuid references heroes,name text,enabled boolean default true,verification_status text default 'verified',needs_recheck boolean default false,cooldown numeric,duration numeric,energy_cost integer);
create table public.hero_skill_levels(id uuid primary key,skill_id uuid references hero_skills,level integer,damage numeric,healing numeric,shield numeric,cooldown numeric,duration numeric,radius numeric,range numeric,speed numeric,energy_cost integer);
-- Reproduce permissive inherited defaults to verify explicit revocation.
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
insert into public.heroes values('11111111-1111-4111-8111-111111111111','Isolated hero',true);
insert into public.equipments values('22222222-2222-4222-8222-222222222222','Isolated equipment',true);
insert into public.equipment_variants values('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','[{"label":"sem mirar","value":23,"operator":"decrease_percent"}]');
insert into public.hero_weapon_stats(hero_id,stat_key,value) values('11111111-1111-4111-8111-111111111111','weapon_spread',50);
\ir ../migrations/20260907022656_status_central_v1.sql

create function public.fixture_assert(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERTION: %',message; end if; end $$;
create function public.fixture_raises(command text,expected text) returns void language plpgsql as $$
begin
  begin execute command; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise; end;
  raise exception 'Expected rejection: %',expected;
end $$;
select public.fixture_assert((select count(*)=0 from status_registry_revisions),'No seeded drafts');
select public.fixture_assert(not has_table_privilege('authenticated','status_registry_revisions','INSERT'),'No direct draft write');
select public.fixture_assert(not has_table_privilege('authenticated','status_registry_publications','INSERT'),'No direct publish');
select public.fixture_assert(not has_table_privilege('anon','status_registry_publications','TRUNCATE'),'No inherited truncate');
select public.fixture_assert(not has_table_privilege('service_role','status_registry_revisions','TRUNCATE'),'No inherited service truncate');
select public.fixture_assert(not has_function_privilege('anon','admin_get_status_central_v1()','EXECUTE'),'No public draft RPC');
select public.fixture_assert(not has_function_privilege('authenticated','status_registry_validate_v1(jsonb,boolean)','EXECUTE'),'No direct internal validator');
set role anon;
select public.fixture_assert((get_status_registry_v1()->>'revision')::integer=0,'Empty public registry is explicit');
select public.fixture_raises('select * from public.status_registry_revisions','permission denied');
reset role;
set role authenticated;
select public.fixture_raises('select public.admin_get_status_central_v1()','DENIED');
reset role;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
set role authenticated;
select public.admin_save_status_central_v1(0,'{
  "contract":"echo-status-registry/v1",
  "definitions":[{"id":"dispersion","name":"Dispersão sem mira","scope":"weapon","source_key":"weapon_spread","unit":"degree","direction":"lower","kind":"scalar","minimum":0,"maximum":360,"evidence":"Private screenshot reference"}],
  "bindings":[{"id":"44444444-4444-4444-8444-444444444444","source_kind":"equipment_variant","source_id":"33333333-3333-4333-8333-333333333333","attribute_key":"0","source_snapshot":{"label":"sem mirar","value":23,"operator":"decrease_percent"},"target":"dispersion","operator":"decrease_percent","unit":"percent","condition":"always","evidence":"Private binding evidence"}]
}', 'Register verified fixture') as first_draft \gset
select public.fixture_assert((get_status_registry_v1()->>'revision')::integer=0,'Draft cannot leak to public');
select public.fixture_raises($q$select public.admin_save_status_central_v1(0,(public.admin_get_status_central_v1()->'draft'),'stale revision')$q$,'STATUS_REVISION_CONFLICT');
select public.admin_publish_status_central_v1(1,0,'Publish tested fixture');
select public.fixture_assert((get_status_registry_v1()->>'revision')::integer=1,'Published revision readable');
select public.fixture_assert(position('Private' in get_status_registry_v1()::text)=0,'Private evidence stripped');
select public.fixture_assert(jsonb_array_length(get_status_registry_v1()->'payload'->'bindings')=1,'Published binding preserved');
select public.fixture_raises($q$select public.admin_publish_status_central_v1(1,0,'stale publication')$q$,'STATUS_REVISION_CONFLICT');
select public.fixture_raises($q$update public.status_registry_head set active_publication=null$q$,'permission denied');
select public.fixture_raises($q$select public.admin_save_status_central_v1(1,jsonb_set(public.admin_get_status_central_v1()->'draft','{bindings,0,unit}','"second"'),'bad unit')$q$,'STATUS_UNIT_MISMATCH');
reset role;
select public.fixture_assert((select count(*)=2 from fixture_audit),'Draft and publish audited');
select public.fixture_raises($q$delete from public.status_registry_revisions$q$,'STATUS_HISTORY_IMMUTABLE');
select public.fixture_raises($q$update public.status_registry_publications set payload='{}'$q$,'STATUS_HISTORY_IMMUTABLE');
update public.equipment_variants set attributes='[{"label":"sem mirar","value":24,"operator":"decrease_percent"}]';
set role authenticated;
select public.fixture_raises($q$select public.admin_publish_status_central_v1(1,1,'source changed')$q$,'STATUS_SOURCE_CHANGED');
select public.fixture_assert((get_status_registry_v1()->>'revision')::integer=1,'Rejected publication preserves active revision');
select public.admin_save_status_base_v1('11111111-1111-4111-8111-111111111111','weapon','weapon_spread',50,45,'Fixture source','Fixture correction');
select public.fixture_raises($q$select public.admin_save_status_base_v1('11111111-1111-4111-8111-111111111111','weapon','weapon_spread',50,40,'Fixture source','Stale correction')$q$,'STATUS_BASE_CONFLICT');
select public.admin_save_status_base_v1('11111111-1111-4111-8111-111111111111','weapon','aimed_dispersion',null,5,'Fixture source','Add absent base');
select public.admin_save_status_central_v1(1,jsonb_set(public.admin_get_status_central_v1()->'draft','{bindings,0,source_snapshot,value}','24'),'Revalidate changed source');
select public.admin_publish_status_central_v1(2,1,'Publish second fixture');
select public.admin_restore_status_central_v1(2,1,'Restore first fixture for review');
select public.fixture_assert((admin_get_status_central_v1()->>'draft_revision')::integer=3,'Restore creates new immutable revision');
select public.fixture_assert((get_status_registry_v1()->>'revision')::integer=2,'Restore does not publish');
reset role;
set role anon;
select public.fixture_assert((select count(*)=1 from status_registry_publications),'Public sees active snapshot only');
select public.fixture_raises('select draft_revision from status_registry_head','permission denied');
reset role;
update public.fixture_caps set allowed=false where capability='heroes.edit';
set role authenticated;
select public.fixture_raises($q$select public.admin_save_status_base_v1('11111111-1111-4111-8111-111111111111','weapon','weapon_spread',45,40,'Fixture source','Unauthorized edit')$q$,'DENIED');
reset role;
select public.fixture_assert((select value=45 from hero_weapon_stats where stat_key='weapon_spread'),'Denied base edit preserved value');
select public.fixture_assert((select count(*)=3 from status_registry_revisions),'Invalid operations did not create revisions');
select public.fixture_assert((select count(*)=2 from status_registry_publications),'Invalid operations did not create publications');
select 'Status Central database fixture passed: permissions, immutable history, publish, source freshness, base corrections, restore and concurrency.' as result;
