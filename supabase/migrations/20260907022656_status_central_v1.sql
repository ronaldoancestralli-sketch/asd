-- SNV only. Additive registry; never rewrites catalog data or Phase 2C.1.
-- CLI scaffold: job 16336536067. Filename aligned to the verified SNV history.
begin;

create table public.status_registry_revisions (
  id bigint generated always as identity primary key,
  payload jsonb not null,
  fingerprint text not null,
  reason text not null check (length(btrim(reason)) between 5 and 2000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index status_registry_revisions_actor_idx on public.status_registry_revisions(created_by);
create table public.status_registry_publications (
  id bigint generated always as identity primary key,
  revision_id bigint not null references public.status_registry_revisions(id),
  payload jsonb not null,
  fingerprint text not null,
  created_at timestamptz not null default now()
);
create index status_registry_publications_revision_idx on public.status_registry_publications(revision_id);
create table public.status_registry_head (
  singleton boolean primary key default true check(singleton),
  draft_revision bigint references public.status_registry_revisions(id),
  active_publication bigint references public.status_registry_publications(id)
);
create index status_registry_head_draft_idx on public.status_registry_head(draft_revision);
create index status_registry_head_active_idx on public.status_registry_head(active_publication);
insert into public.status_registry_head(singleton) values(true);

alter table public.status_registry_revisions enable row level security;
alter table public.status_registry_publications enable row level security;
alter table public.status_registry_head enable row level security;
revoke all on public.status_registry_revisions, public.status_registry_publications, public.status_registry_head from public, anon, authenticated, service_role;
revoke all on sequence public.status_registry_revisions_id_seq, public.status_registry_publications_id_seq from public, anon, authenticated, service_role;
grant select on public.status_registry_publications to anon, authenticated, service_role;
grant select(singleton, active_publication) on public.status_registry_head to anon, authenticated, service_role;
create policy status_registry_head_read on public.status_registry_head for select to anon, authenticated using(true);
create policy status_registry_active_read on public.status_registry_publications for select to anon, authenticated
  using(id=(select active_publication from public.status_registry_head where singleton));

create function public.status_registry_hash_v1(p_value jsonb) returns text
language sql immutable set search_path='' as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_value::text,'UTF8')),'hex')
$$;

create function public.status_registry_immutable_v1() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'STATUS_HISTORY_IMMUTABLE' using errcode='42501'; end $$;
create trigger status_revision_immutable before update or delete on public.status_registry_revisions
  for each row execute function public.status_registry_immutable_v1();
create trigger status_publication_immutable before update or delete on public.status_registry_publications
  for each row execute function public.status_registry_immutable_v1();

create function public.status_registry_validate_v1(p_payload jsonb, p_check_sources boolean default false)
returns void language plpgsql set search_path='' as $$
declare
  d jsonb; b jsonb; t jsonb; actual jsonb; attr jsonb; source_id uuid; source_key text;
  units text[]:=array['degree','second','shot_per_second','health_point','armor_point','damage_point','distance_unit','distance_per_second','percent','multiplier','ammo_round','point','count','unknown'];
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or p_payload->>'contract' is distinct from 'echo-status-registry/v1'
    or jsonb_typeof(p_payload->'definitions') is distinct from 'array' or jsonb_typeof(p_payload->'bindings') is distinct from 'array'
    or octet_length(p_payload::text)>3000000 then raise exception 'STATUS_INVALID_CONTRACT'; end if;
  if p_payload - array['contract','definitions','bindings'] <> '{}'::jsonb
    or jsonb_array_length(p_payload->'definitions')>500 or jsonb_array_length(p_payload->'bindings')>5000 then raise exception 'STATUS_INVALID_FIELDS'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'definitions') x group by x->>'id' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(p_payload->'definitions') x group by x->>'scope',coalesce(x->>'skill_id',''),coalesce(x->>'level_id',''),x->>'source_key' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(p_payload->'bindings') x group by x->>'id' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(p_payload->'bindings') x group by x->>'source_kind',x->>'source_id',x->>'attribute_key' having count(*)>1)
    then raise exception 'STATUS_DUPLICATE_ID_OR_SOURCE'; end if;
  for d in select value from jsonb_array_elements(p_payload->'definitions') loop
    if jsonb_typeof(d) is distinct from 'object'
      or exists(select 1 from unnest(array['id','name','scope','source_key','unit','direction','kind','evidence']) f(k) where jsonb_typeof(d->f.k) is distinct from 'string') or coalesce(d->>'id','') !~ '^[a-z][a-z0-9_]{1,79}$'
      or d->>'id'=any(array['constructor','prototype','__proto__'])
      or coalesce(d->>'source_key','') !~ '^[a-z][a-z0-9_]{1,79}$'
      or d->>'source_key'=any(array['constructor','prototype','__proto__'])
      or jsonb_typeof(d->'name') is distinct from 'string' or jsonb_typeof(d->'evidence') is distinct from 'string'
      or coalesce(length(btrim(d->>'name')),0) not between 1 and 160
      or coalesce(d->>'scope','')<>all(array['hero','weapon','skill','skill_level'])
      or coalesce(d->>'unit','')<>all(units)
      or coalesce(d->>'direction','')<>all(array['higher','lower','neutral'])
      or coalesce(d->>'kind','')<>all(array['scalar','summary'])
      or coalesce(length(btrim(d->>'evidence')),0) not between 3 and 2000
      or d-array['id','name','scope','source_key','skill_id','level_id','unit','direction','kind','minimum','maximum','evidence']<>'{}'::jsonb
      then raise exception 'STATUS_INVALID_DEFINITION:%',d->>'id'; end if;
    if d->>'scope' in ('skill','skill_level') then
      if coalesce(d->>'skill_id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        or (d->>'scope'='skill' and d->>'source_key'<>all(array['cooldown','duration','energy_cost']))
        or (d->>'scope'='skill_level' and (d->>'source_key'<>all(array['damage','healing','shield','cooldown','duration','radius','range','speed','energy_cost']) or coalesce(d->>'level_id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'))
        then raise exception 'STATUS_INVALID_SKILL_SOURCE'; end if;
      if p_check_sources and not exists(select 1 from public.hero_skills s where s.id=(d->>'skill_id')::uuid and s.enabled) then raise exception 'STATUS_SKILL_UNAVAILABLE'; end if;
      if p_check_sources and d->>'scope'='skill_level' and not exists(select 1 from public.hero_skill_levels l where l.id=(d->>'level_id')::uuid and l.skill_id=(d->>'skill_id')::uuid) then raise exception 'STATUS_LEVEL_UNAVAILABLE'; end if;
    end if;
    if (d->>'minimum' is not null and jsonb_typeof(d->'minimum')<>'number')
      or (d->>'maximum' is not null and jsonb_typeof(d->'maximum')<>'number')
      then raise exception 'STATUS_INVALID_BOUNDS'; end if;
    if abs((d->>'minimum')::numeric)>1e308::numeric or abs((d->>'maximum')::numeric)>1e308::numeric then raise exception 'STATUS_INVALID_BOUNDS'; end if;
    if (d->>'minimum')::numeric > (d->>'maximum')::numeric then raise exception 'STATUS_REVERSED_BOUNDS'; end if;
  end loop;
  for b in select value from jsonb_array_elements(p_payload->'bindings') loop
    if jsonb_typeof(b) is distinct from 'object'
      or exists(select 1 from unnest(array['id','source_kind','source_id','attribute_key','target','operator','unit','condition','evidence']) f(k) where jsonb_typeof(b->f.k) is distinct from 'string')
      or coalesce(b->>'id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or coalesce(b->>'source_id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or coalesce(b->>'source_kind','')<>all(array['equipment_variant','set_bonus','hero_skill','hero_skill_level'])
      or jsonb_typeof(b->'attribute_key') is distinct from 'string' or length(b->>'attribute_key')>240
      or b->>'attribute_key'=any(array['constructor','prototype','__proto__'])
      or coalesce(b->>'operator','')<>all(array['increase_flat','decrease_flat','increase_percent','decrease_percent'])
      or coalesce(b->>'condition','')<>all(array['always','aiming','unaimed','moving','ability_active'])
      or jsonb_typeof(b->'evidence') is distinct from 'string'
      or coalesce(length(btrim(b->>'evidence')),0) not between 3 and 2000
      or b->'source_snapshot' is null or b->'source_snapshot'='null'::jsonb
      or b-array['id','source_kind','source_id','attribute_key','source_snapshot','target','operator','unit','condition','ability_id','evidence']<>'{}'::jsonb
      then raise exception 'STATUS_INVALID_BINDING:%',b->>'id'; end if;
    select value into t from jsonb_array_elements(p_payload->'definitions') where value->>'id'=b->>'target';
    if t is null or t->>'kind'<>'scalar' or t->>'unit'='unknown' then raise exception 'STATUS_TARGET_NOT_CALCULABLE'; end if;
    if b->>'unit' is distinct from (case when right(b->>'operator',7)='percent' then 'percent' else t->>'unit' end) then raise exception 'STATUS_UNIT_MISMATCH'; end if;
    if b->>'condition'='ability_active' then
      if coalesce(b->>'ability_id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'STATUS_ABILITY_REQUIRED'; end if;
      if p_check_sources and not exists(select 1 from public.hero_skills s where s.id=(b->>'ability_id')::uuid and s.enabled) then raise exception 'STATUS_ABILITY_UNAVAILABLE'; end if;
    end if;
    if b->>'source_kind'='hero_skill' and (b->>'condition'<>'ability_active' or b->>'ability_id' is distinct from b->>'source_id') then raise exception 'STATUS_ABILITY_CONDITION_REQUIRED'; end if;
    if b->>'source_kind'='hero_skill_level' and b->>'condition'<>'ability_active' then raise exception 'STATUS_ABILITY_CONDITION_REQUIRED'; end if;
    if not p_check_sources then continue; end if;
    source_id:=(b->>'source_id')::uuid; source_key:=b->>'attribute_key'; actual:=null; attr:=null;
    if b->>'source_kind'='equipment_variant' then
      select v.attributes into actual from public.equipment_variants v join public.equipments e on e.id=v.equipment_id where v.id=source_id and e.enabled;
    elsif b->>'source_kind'='set_bonus' then
      select s.stats into actual from public.equipment_set_bonuses s where s.id=source_id;
    elsif b->>'source_kind'='hero_skill_level' then
      if source_key<>all(array['damage','healing','shield','cooldown','duration','radius','range','speed','energy_cost']) then raise exception 'STATUS_SKILL_FIELD_NOT_NUMERIC'; end if;
      select to_jsonb(l) into actual from public.hero_skill_levels l join public.hero_skills s on s.id=l.skill_id where l.id=source_id and l.skill_id=(b->>'ability_id')::uuid and s.enabled and s.verification_status in ('verified','corroborated') and not s.needs_recheck;
    else
      if source_key<>all(array['cooldown','duration','energy_cost']) then raise exception 'STATUS_SKILL_FIELD_NOT_NUMERIC'; end if;
      select to_jsonb(s) into actual from public.hero_skills s where s.id=source_id and s.enabled and s.verification_status in ('verified','corroborated') and not s.needs_recheck;
    end if;
    if jsonb_typeof(actual)='array' and source_key ~ '^(0|[1-9][0-9]{0,5})$' then attr:=actual->source_key::integer;
    elsif jsonb_typeof(actual)='object' then attr:=actual->source_key; end if;
    if attr is null or attr is distinct from b->'source_snapshot' then raise exception 'STATUS_SOURCE_CHANGED:%',b->>'id'; end if;
  end loop;
end $$;

create function public.get_status_registry_v1() returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce((select jsonb_build_object('revision',p.id,'fingerprint',p.fingerprint,'payload',p.payload,'published_at',p.created_at)
    from public.status_registry_head h join public.status_registry_publications p on p.id=h.active_publication where h.singleton),
    jsonb_build_object('revision',0,'fingerprint','unpublished','payload',jsonb_build_object('contract','echo-status-registry/v1','definitions','[]'::jsonb,'bindings','[]'::jsonb)))
$$;

-- Definer RPCs are the sole write boundary. No API role has DML/sequence
-- privileges. Each entry checks the existing capability guard before reading
-- private drafts or writing, uses a fixed search_path and no dynamic SQL.
create function public.admin_get_status_central_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.echo_require_admin_capability('equipment.view');
  select jsonb_build_object('draft_revision',coalesce(h.draft_revision,0),'active_publication',coalesce(h.active_publication,0),
    'draft',coalesce(r.payload,jsonb_build_object('contract','echo-status-registry/v1','definitions','[]'::jsonb,'bindings','[]'::jsonb)),
    'published',public.get_status_registry_v1(),
    'permissions',jsonb_build_object('edit',public.echo_has_admin_capability('equipment.edit'),'publish',public.echo_has_admin_capability('equipment.publish'),'base_edit',public.echo_has_admin_capability('heroes.edit')),
    'history',(select coalesce(jsonb_agg(x order by x.id desc),'[]'::jsonb) from (select id,fingerprint,reason,created_at from public.status_registry_revisions order by id desc limit 30)x))
  into result from public.status_registry_head h left join public.status_registry_revisions r on r.id=h.draft_revision where h.singleton;
  return result;
end $$;

create function public.admin_save_status_central_v1(p_expected_revision bigint,p_payload jsonb,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h public.status_registry_head; old_payload jsonb; new_id bigint;
begin
  perform public.echo_require_admin_capability('equipment.edit');
  if coalesce(length(btrim(p_reason)),0) not between 5 and 2000 then raise exception 'STATUS_REASON_REQUIRED'; end if;
  perform public.status_registry_validate_v1(p_payload,false);
  select * into h from public.status_registry_head where singleton for update;
  if p_expected_revision is distinct from coalesce(h.draft_revision,0) then raise exception 'STATUS_REVISION_CONFLICT' using errcode='40001'; end if;
  select payload into old_payload from public.status_registry_revisions where id=h.draft_revision;
  if old_payload is not distinct from p_payload then return public.admin_get_status_central_v1(); end if;
  insert into public.status_registry_revisions(payload,fingerprint,reason,created_by)
    values(p_payload,public.status_registry_hash_v1(p_payload),btrim(p_reason),auth.uid()) returning id into new_id;
  update public.status_registry_head set draft_revision=new_id where singleton;
  perform public.echo_write_admin_audit('equipment','equipment.edit','status_draft_saved','status_registry_revision',new_id::text,p_reason,old_payload,p_payload,null::text);
  return public.admin_get_status_central_v1();
end $$;

create function public.admin_publish_status_central_v1(p_expected_revision bigint,p_expected_publication bigint,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h public.status_registry_head; original jsonb; runtime jsonb; pub_id bigint; old_public jsonb;
begin
  perform public.echo_require_admin_capability('equipment.publish');
  if coalesce(length(btrim(p_reason)),0) not between 5 and 2000 then raise exception 'STATUS_REASON_REQUIRED'; end if;
  select * into h from public.status_registry_head where singleton for update;
  if p_expected_revision is distinct from h.draft_revision or p_expected_publication is distinct from coalesce(h.active_publication,0) then raise exception 'STATUS_REVISION_CONFLICT' using errcode='40001'; end if;
  select payload into original from public.status_registry_revisions where id=h.draft_revision;
  perform public.status_registry_validate_v1(original,true);
  runtime:=jsonb_build_object('contract','echo-status-registry/v1',
    'definitions',(select coalesce(jsonb_agg(d-'evidence'),'[]'::jsonb) from jsonb_array_elements(original->'definitions') d),
    'bindings',(select coalesce(jsonb_agg(b-'evidence'),'[]'::jsonb) from jsonb_array_elements(original->'bindings') b));
  select payload into old_public from public.status_registry_publications where id=h.active_publication;
  if old_public is not distinct from runtime then return public.admin_get_status_central_v1(); end if;
  insert into public.status_registry_publications(revision_id,payload,fingerprint)
    values(h.draft_revision,runtime,public.status_registry_hash_v1(runtime)) returning id into pub_id;
  update public.status_registry_head set active_publication=pub_id where singleton;
  perform public.echo_write_admin_audit('equipment','equipment.publish','status_registry_published','status_registry_publication',pub_id::text,p_reason,old_public,runtime,null::text);
  return public.admin_get_status_central_v1();
end $$;

create function public.admin_restore_status_central_v1(p_expected_revision bigint,p_restore_revision bigint,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare payload jsonb;
begin
  perform public.echo_require_admin_capability('equipment.edit');
  select r.payload into payload from public.status_registry_revisions r where r.id=p_restore_revision;
  if payload is null then raise exception 'STATUS_REVISION_NOT_FOUND'; end if;
  return public.admin_save_status_central_v1(p_expected_revision,payload,p_reason);
end $$;

create function public.admin_save_status_base_v1(p_hero_id uuid,p_scope text,p_source_key text,p_expected_value numeric,p_value numeric,p_evidence text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous numeric; actual numeric; target_id uuid; before_state jsonb; after_state jsonb;
begin
  perform public.echo_require_admin_capability('heroes.edit');
  if coalesce(p_scope,'')<>all(array['hero','weapon']) or coalesce(p_source_key,'') !~ '^[a-z][a-z0-9_]{1,79}$'
    or p_source_key=any(array['constructor','prototype','__proto__'])
    or p_value is null or abs(p_value)>1e308::numeric or p_value::text=any(array['NaN','Infinity','-Infinity'])
    or coalesce(length(btrim(p_evidence)),0) not between 3 and 2000
    or coalesce(length(btrim(p_reason)),0) not between 5 and 2000 then raise exception 'STATUS_INVALID_BASE'; end if;
  -- Lock the hero, including the absent-stat case, to serialize compare-and-set.
  perform 1 from public.heroes where id=p_hero_id for update;
  if not found then raise exception 'STATUS_HERO_NOT_FOUND'; end if;
  if p_scope='hero' then
    select value into previous from public.hero_base_stats where hero_id=p_hero_id and stat_key=p_source_key;
  else
    select value into previous from public.hero_weapon_stats where hero_id=p_hero_id and stat_key=p_source_key;
  end if;
  if previous is distinct from p_expected_value then raise exception 'STATUS_BASE_CONFLICT' using errcode='40001'; end if;
  if p_scope='hero' then
    insert into public.hero_base_stats(hero_id,stat_key,value) values(p_hero_id,p_source_key,p_value)
      on conflict(hero_id,stat_key) do update set value=excluded.value,updated_at=now() returning id,value into target_id,actual;
  else
    insert into public.hero_weapon_stats(hero_id,stat_key,value) values(p_hero_id,p_source_key,p_value)
      on conflict(hero_id,stat_key) do update set value=excluded.value,updated_at=now() returning id,value into target_id,actual;
  end if;
  before_state:=jsonb_build_object('hero_id',p_hero_id,'scope',p_scope,'key',p_source_key,'value',previous);
  after_state:=jsonb_build_object('hero_id',p_hero_id,'scope',p_scope,'key',p_source_key,'value',actual,'evidence',p_evidence);
  perform public.echo_write_admin_audit('heroes','heroes.edit','status_base_updated','hero_status',target_id::text,p_reason,before_state,after_state,null::text);
  return after_state;
end $$;

revoke all on function public.status_registry_hash_v1(jsonb),public.status_registry_immutable_v1(),public.status_registry_validate_v1(jsonb,boolean),
  public.get_status_registry_v1(),public.admin_get_status_central_v1(),public.admin_save_status_central_v1(bigint,jsonb,text),
  public.admin_publish_status_central_v1(bigint,bigint,text),public.admin_restore_status_central_v1(bigint,bigint,text),
  public.admin_save_status_base_v1(uuid,text,text,numeric,numeric,text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_status_registry_v1() to anon,authenticated,service_role;
grant execute on function public.admin_get_status_central_v1(),public.admin_save_status_central_v1(bigint,jsonb,text),
  public.admin_publish_status_central_v1(bigint,bigint,text),public.admin_restore_status_central_v1(bigint,bigint,text),
  public.admin_save_status_base_v1(uuid,text,text,numeric,numeric,text,text) to authenticated;

comment on function public.admin_publish_status_central_v1(bigint,bigint,text) is
  'Capability-checked atomic activation; revalidates live source snapshots; admin evidence is excluded from public payload.';
commit;
