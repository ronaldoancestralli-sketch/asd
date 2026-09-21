-- Echo Arena — persistência transacional das builds do usuário.
-- Preserva a semântica atual do motor; esta migração cuida somente de
-- propriedade, integridade, itens, tags e atualização/cópia da build.

-- Um slot físico da build pode conter no máximo um equipamento.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.build_items'::regclass
      and conname='build_items_build_slot_key'
  ) then
    alter table public.build_items
      add constraint build_items_build_slot_key unique (build_id, slot);
  end if;
end $$;

create or replace function public.save_user_build(
  p_build_id uuid,
  p_hero_id uuid,
  p_title text,
  p_description text,
  p_visibility text,
  p_status text,
  p_items jsonb,
  p_tags text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_build_id uuid;
  v_parent_id uuid;
  v_existing_owner uuid;
  v_is_update boolean := false;
  v_is_fork boolean := false;
  v_visibility text := lower(btrim(coalesce(p_visibility,'private')));
  v_status text := lower(btrim(coalesce(p_status,'draft')));
  v_is_public boolean;
  v_item jsonb;
  v_equipment uuid;
  v_tier uuid;
  v_slot integer;
  v_seen_slots integer[] := '{}'::integer[];
  v_tag text;
  v_tag_name text;
  v_tag_slug text;
  v_tag_id uuid;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if nullif(btrim(coalesce(p_title,'')),'') is null then
    raise exception 'build_title_required' using errcode='22023';
  end if;

  if v_visibility not in ('public','private','unlisted') then
    raise exception 'invalid_build_visibility' using errcode='22023';
  end if;
  if v_status not in ('draft','published','archived') then
    raise exception 'invalid_build_status' using errcode='22023';
  end if;

  if not exists(select 1 from public.heroes h where h.id=p_hero_id and h.enabled=true) then
    raise exception 'build_hero_unavailable' using errcode='23503';
  end if;

  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' then
    raise exception 'build_items_must_be_array' using errcode='22023';
  end if;

  -- Valida todos os itens antes de tocar na build existente.
  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    begin
      v_equipment := nullif(v_item->>'equipment_id','')::uuid;
      v_tier := nullif(v_item->>'tier_id','')::uuid;
      v_slot := nullif(v_item->>'slot','')::integer;
    exception when others then
      raise exception 'invalid_build_item_payload' using errcode='22023';
    end;

    if v_equipment is null or v_slot is null or v_slot < 1 then
      raise exception 'invalid_build_item' using errcode='22023';
    end if;
    if v_slot = any(v_seen_slots) then
      raise exception 'duplicate_build_slot' using errcode='23505';
    end if;
    v_seen_slots := array_append(v_seen_slots,v_slot);

    if not exists(select 1 from public.equipments e where e.id=v_equipment and e.enabled=true) then
      raise exception 'build_equipment_unavailable' using errcode='23503';
    end if;
    if v_tier is not null and not exists(select 1 from public.equipment_tiers t where t.id=v_tier) then
      raise exception 'build_tier_unavailable' using errcode='23503';
    end if;
  end loop;

  if p_build_id is not null then
    select b.user_id into v_existing_owner
    from public.builds b
    where b.id=p_build_id and b.deleted_at is null;

    if found and v_existing_owner=v_user then
      v_build_id:=p_build_id;
      v_is_update:=true;
    elsif found then
      -- Editar uma build de outra pessoa nunca sobrescreve o original.
      v_parent_id:=p_build_id;
      v_is_fork:=true;
    end if;
  end if;

  v_is_public := (v_visibility='public' and v_status='published');

  if v_is_update then
    update public.builds
    set hero_id=p_hero_id,
        title=btrim(p_title),
        description=nullif(btrim(coalesce(p_description,'')),''),
        visibility=v_visibility,
        status=v_status,
        is_public=v_is_public,
        published_at=case when v_is_public then coalesce(published_at,now()) else null end,
        updated_at=now(),
        version=coalesce(version,1)+1
    where id=v_build_id and user_id=v_user;

    delete from public.build_items where build_id=v_build_id;
    delete from public.build_tag_links where build_id=v_build_id;
  else
    insert into public.builds(
      user_id,hero_id,title,description,is_public,visibility,status,
      published_at,parent_build_id,version,updated_at
    ) values (
      v_user,p_hero_id,btrim(p_title),nullif(btrim(coalesce(p_description,'')),''),
      v_is_public,v_visibility,v_status,
      case when v_is_public then now() else null end,
      v_parent_id,1,now()
    ) returning id into v_build_id;

    if v_is_fork then
      update public.builds set fork_count=coalesce(fork_count,0)+1 where id=v_parent_id;
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_equipment := (v_item->>'equipment_id')::uuid;
    v_tier := nullif(v_item->>'tier_id','')::uuid;
    v_slot := (v_item->>'slot')::integer;
    insert into public.build_items(build_id,equipment_id,tier_id,slot)
    values(v_build_id,v_equipment,v_tier,v_slot);
  end loop;

  foreach v_tag in array coalesce(p_tags,'{}'::text[]) loop
    v_tag_name:=btrim(coalesce(v_tag,''));
    if v_tag_name='' then continue; end if;
    if char_length(v_tag_name)>40 then
      raise exception 'build_tag_too_long' using errcode='22023';
    end if;
    v_tag_slug:=trim(both '-' from regexp_replace(
      translate(lower(v_tag_name),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc'),
      '[^a-z0-9]+','-','g'
    ));
    if v_tag_slug='' then continue; end if;

    insert into public.build_tags(name,slug)
    values(v_tag_name,v_tag_slug)
    on conflict(slug) do update set name=excluded.name
    returning id into v_tag_id;

    insert into public.build_tag_links(build_id,tag_id)
    values(v_build_id,v_tag_id)
    on conflict do nothing;
  end loop;

  return jsonb_build_object(
    'id',v_build_id,
    'updated',v_is_update,
    'forked',v_is_fork,
    'visibility',v_visibility,
    'status',v_status,
    'is_public',v_is_public
  );
end;
$$;

revoke all on function public.save_user_build(uuid,uuid,text,text,text,text,jsonb,text[]) from public;
revoke execute on function public.save_user_build(uuid,uuid,text,text,text,text,jsonb,text[]) from anon;
grant execute on function public.save_user_build(uuid,uuid,text,text,text,text,jsonb,text[]) to authenticated;
