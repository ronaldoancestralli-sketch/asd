-- EchoArena Admin Content Import V2
-- Additive migration: server-side version snapshots + atomic save RPCs.

create table if not exists public.admin_content_versions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('hero','equipment')),
  entity_id uuid not null,
  version integer not null,
  snapshot jsonb not null,
  source text not null default 'admin-ui',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, version)
);

alter table public.admin_content_versions enable row level security;

revoke all on table public.admin_content_versions from anon;
grant select, insert on table public.admin_content_versions to authenticated;

drop policy if exists admin_content_versions_admin_select on public.admin_content_versions;
create policy admin_content_versions_admin_select
on public.admin_content_versions
for select
to authenticated
using ((select current_user_is_admin()));

drop policy if exists admin_content_versions_admin_insert on public.admin_content_versions;
create policy admin_content_versions_admin_insert
on public.admin_content_versions
for insert
to authenticated
with check ((select current_user_is_admin()));

create or replace function public.admin_snapshot_content_v2(
  p_entity_type text,
  p_entity_id uuid,
  p_source text default 'admin-ui'
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_snapshot jsonb;
  v_version integer;
begin
  if not (select current_user_is_admin()) then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;

  -- Serialize snapshots per entity so version numbers remain collision-free
  -- even if two admin requests reach this RPC at the same time.
  perform pg_advisory_xact_lock(hashtext(p_entity_type), hashtext(p_entity_id::text));

  if p_entity_type = 'equipment' then
    select jsonb_build_object(
      'equipment', to_jsonb(e),
      'variants', coalesce((
        select jsonb_agg(to_jsonb(v) order by r.rank, r.slug)
        from equipment_variants v
        join equipment_rarities r on r.id = v.rarity_id
        where v.equipment_id = e.id
      ), '[]'::jsonb),
      'bonuses', coalesce((
        select jsonb_agg(to_jsonb(b) order by b.display_order, b.required_pieces)
        from equipment_set_bonuses b
        where b.set_id = e.set_id
      ), '[]'::jsonb)
    )
    into v_snapshot
    from equipments e
    where e.id = p_entity_id;
  elsif p_entity_type = 'hero' then
    select jsonb_build_object(
      'hero', to_jsonb(h),
      'base_stats', coalesce((
        select jsonb_object_agg(s.stat_key, s.value)
        from hero_base_stats s
        where s.hero_id = h.id
      ), '{}'::jsonb),
      'weapon_name', (
        select s.weapon_name
        from hero_weapon_stats s
        where s.hero_id = h.id
        order by s.updated_at desc nulls last, s.created_at desc nulls last
        limit 1
      ),
      'weapon_stats', coalesce((
        select jsonb_object_agg(s.stat_key, s.value)
        from hero_weapon_stats s
        where s.hero_id = h.id
      ), '{}'::jsonb)
    )
    into v_snapshot
    from heroes h
    where h.id = p_entity_id;
  else
    raise exception 'Tipo de conteúdo inválido: %', p_entity_type using errcode = '22023';
  end if;

  if v_snapshot is null then
    raise exception 'Conteúdo não encontrado para backup' using errcode = 'P0002';
  end if;

  select coalesce(max(version), 0) + 1
  into v_version
  from admin_content_versions
  where entity_type = p_entity_type and entity_id = p_entity_id;

  insert into admin_content_versions(entity_type, entity_id, version, snapshot, source)
  values (p_entity_type, p_entity_id, v_version, v_snapshot, coalesce(nullif(p_source,''), 'admin-ui'));

  return v_version;
end;
$$;

revoke all on function public.admin_snapshot_content_v2(text, uuid, text) from public, anon;
grant execute on function public.admin_snapshot_content_v2(text, uuid, text) to authenticated;