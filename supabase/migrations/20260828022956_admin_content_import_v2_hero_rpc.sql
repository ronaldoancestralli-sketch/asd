create or replace function public.admin_save_hero_bundle_v2(
  p_hero_id uuid,
  p_hero jsonb,
  p_base_stats jsonb default '{}'::jsonb,
  p_weapon_name text default null,
  p_weapon_stats jsonb default '{}'::jsonb,
  p_replace_base_stats boolean default false,
  p_replace_weapon_stats boolean default false,
  p_source text default 'admin-ui'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid := p_hero_id;
  v_existing heroes%rowtype;
  v_saved heroes%rowtype;
  v_operation text;
  v_key text;
  v_value jsonb;
  v_incoming_base text[] := '{}';
  v_incoming_weapon text[] := '{}';
  v_slug text;
begin
  if not (select current_user_is_admin()) then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_hero,'{}'::jsonb)) <> 'object' then
    raise exception 'hero precisa ser um objeto JSON' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_base_stats,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_weapon_stats,'{}'::jsonb)) <> 'object' then
    raise exception 'Stats precisam ser objetos JSON' using errcode = '22023';
  end if;

  if v_id is not null then
    select * into v_existing from heroes where id = v_id for update;
    if not found then
      raise exception 'Herói não encontrado' using errcode = 'P0002';
    end if;

    perform admin_snapshot_content_v2('hero', v_id, p_source);

    update heroes h set
      name = case when p_hero ? 'name' then nullif(btrim(p_hero->>'name'),'') else h.name end,
      slug = case when p_hero ? 'slug' then nullif(btrim(p_hero->>'slug'),'') else h.slug end,
      description = case when p_hero ? 'description' then nullif(p_hero->>'description','') else h.description end,
      class_id = case when p_hero ? 'class_id' then nullif(p_hero->>'class_id','')::uuid else h.class_id end,
      rarity_id = case when p_hero ? 'rarity_id' then nullif(p_hero->>'rarity_id','')::uuid else h.rarity_id end,
      faction = case when p_hero ? 'faction' then nullif(p_hero->>'faction','') else h.faction end,
      enabled = case when p_hero ? 'enabled' and jsonb_typeof(p_hero->'enabled') = 'boolean' then (p_hero->>'enabled')::boolean else h.enabled end,
      display_order = case when p_hero ? 'display_order' and nullif(p_hero->>'display_order','') is not null then (p_hero->>'display_order')::integer else h.display_order end,
      image_path = case when p_hero ? 'image_path' then nullif(p_hero->>'image_path','') else h.image_path end,
      image_fit = case when p_hero ? 'image_fit' then coalesce(nullif(p_hero->>'image_fit',''), h.image_fit) else h.image_fit end,
      image_position = case when p_hero ? 'image_position' then coalesce(nullif(p_hero->>'image_position',''), h.image_position) else h.image_position end,
      image_scale = case when p_hero ? 'image_scale' and nullif(p_hero->>'image_scale','') is not null then (p_hero->>'image_scale')::numeric else h.image_scale end,
      image_offset_x = case when p_hero ? 'image_offset_x' and nullif(p_hero->>'image_offset_x','') is not null then (p_hero->>'image_offset_x')::integer else h.image_offset_x end,
      image_offset_y = case when p_hero ? 'image_offset_y' and nullif(p_hero->>'image_offset_y','') is not null then (p_hero->>'image_offset_y')::integer else h.image_offset_y end,
      card_image_path = case when p_hero ? 'card_image_path' then nullif(p_hero->>'card_image_path','') else h.card_image_path end,
      card_image_scale = case when p_hero ? 'card_image_scale' and nullif(p_hero->>'card_image_scale','') is not null then (p_hero->>'card_image_scale')::numeric else h.card_image_scale end,
      card_image_offset_x = case when p_hero ? 'card_image_offset_x' and nullif(p_hero->>'card_image_offset_x','') is not null then (p_hero->>'card_image_offset_x')::integer else h.card_image_offset_x end,
      card_image_offset_y = case when p_hero ? 'card_image_offset_y' and nullif(p_hero->>'card_image_offset_y','') is not null then (p_hero->>'card_image_offset_y')::integer else h.card_image_offset_y end,
      gif_path = case when p_hero ? 'gif_path' then nullif(p_hero->>'gif_path','') else h.gif_path end,
      gif_scale = case when p_hero ? 'gif_scale' and nullif(p_hero->>'gif_scale','') is not null then (p_hero->>'gif_scale')::numeric else h.gif_scale end,
      gif_offset_x = case when p_hero ? 'gif_offset_x' and nullif(p_hero->>'gif_offset_x','') is not null then (p_hero->>'gif_offset_x')::integer else h.gif_offset_x end,
      gif_offset_y = case when p_hero ? 'gif_offset_y' and nullif(p_hero->>'gif_offset_y','') is not null then (p_hero->>'gif_offset_y')::integer else h.gif_offset_y end,
      updated_at = now()
    where h.id = v_id
    returning * into v_saved;
    v_operation := 'updated';
  else
    if nullif(btrim(p_hero->>'name'),'') is null then
      raise exception 'Nome do herói é obrigatório' using errcode = '23502';
    end if;
    v_slug := nullif(btrim(p_hero->>'slug'),'');
    if v_slug is null then
      raise exception 'Slug do herói é obrigatório' using errcode = '23502';
    end if;
    if exists(select 1 from heroes where slug = v_slug) then
      raise exception 'Já existe herói com o slug %. Abra o registro existente para atualizar.', v_slug using errcode = '23505';
    end if;

    insert into heroes(
      name, slug, description, class_id, rarity_id, faction, enabled, display_order,
      image_path, image_fit, image_position, image_scale, image_offset_x, image_offset_y,
      card_image_path, card_image_scale, card_image_offset_x, card_image_offset_y,
      gif_path, gif_scale, gif_offset_x, gif_offset_y
    ) values (
      btrim(p_hero->>'name'),
      v_slug,
      nullif(p_hero->>'description',''),
      nullif(p_hero->>'class_id','')::uuid,
      nullif(p_hero->>'rarity_id','')::uuid,
      nullif(p_hero->>'faction',''),
      -- New AI-assisted content is never published implicitly.
      case when p_hero ? 'enabled' and jsonb_typeof(p_hero->'enabled') = 'boolean' then (p_hero->>'enabled')::boolean else false end,
      coalesce(nullif(p_hero->>'display_order','')::integer, 0),
      nullif(p_hero->>'image_path',''),
      coalesce(nullif(p_hero->>'image_fit',''), 'contain'),
      coalesce(nullif(p_hero->>'image_position',''), '50% 50%'),
      coalesce(nullif(p_hero->>'image_scale','')::numeric, 1),
      coalesce(nullif(p_hero->>'image_offset_x','')::integer, 0),
      coalesce(nullif(p_hero->>'image_offset_y','')::integer, 0),
      nullif(p_hero->>'card_image_path',''),
      coalesce(nullif(p_hero->>'card_image_scale','')::numeric, 1),
      coalesce(nullif(p_hero->>'card_image_offset_x','')::integer, 0),
      coalesce(nullif(p_hero->>'card_image_offset_y','')::integer, 0),
      nullif(p_hero->>'gif_path',''),
      coalesce(nullif(p_hero->>'gif_scale','')::numeric, 1),
      coalesce(nullif(p_hero->>'gif_offset_x','')::integer, 0),
      coalesce(nullif(p_hero->>'gif_offset_y','')::integer, 0)
    ) returning * into v_saved;
    v_id := v_saved.id;
    v_operation := 'created';
  end if;

  for v_key, v_value in select * from jsonb_each(coalesce(p_base_stats,'{}'::jsonb)) loop
    if v_value = 'null'::jsonb then continue; end if;
    if not exists(select 1 from stat_definitions where key = v_key and enabled is distinct from false) then
      raise exception 'Stat de herói desconhecido: %', v_key using errcode = '23503';
    end if;
    v_incoming_base := array_append(v_incoming_base, v_key);
    insert into hero_base_stats(hero_id, stat_key, value, updated_at)
    values (v_id, v_key, (v_value #>> '{}')::numeric, now())
    on conflict (hero_id, stat_key)
    do update set value = excluded.value, updated_at = now();
  end loop;

  if p_replace_base_stats then
    delete from hero_base_stats
    where hero_id = v_id
      and (coalesce(array_length(v_incoming_base,1),0) = 0 or not (stat_key = any(v_incoming_base)));
  end if;

  for v_key, v_value in select * from jsonb_each(coalesce(p_weapon_stats,'{}'::jsonb)) loop
    if v_value = 'null'::jsonb then continue; end if;
    if not exists(select 1 from stat_definitions where key = v_key and enabled is distinct from false) then
      raise exception 'Stat de arma desconhecido: %', v_key using errcode = '23503';
    end if;
    v_incoming_weapon := array_append(v_incoming_weapon, v_key);
    insert into hero_weapon_stats(hero_id, weapon_name, stat_key, value, updated_at)
    values (v_id, nullif(btrim(p_weapon_name),''), v_key, (v_value #>> '{}')::numeric, now())
    on conflict (hero_id, stat_key)
    do update set weapon_name = excluded.weapon_name, value = excluded.value, updated_at = now();
  end loop;

  if p_replace_weapon_stats then
    delete from hero_weapon_stats
    where hero_id = v_id
      and (coalesce(array_length(v_incoming_weapon,1),0) = 0 or not (stat_key = any(v_incoming_weapon)));
  end if;

  return jsonb_build_object(
    'operation', v_operation,
    'hero', to_jsonb(v_saved),
    'version_backup_created', v_operation = 'updated'
  );
end;
$$;

revoke all on function public.admin_save_hero_bundle_v2(uuid, jsonb, jsonb, text, jsonb, boolean, boolean, text) from public, anon;
grant execute on function public.admin_save_hero_bundle_v2(uuid, jsonb, jsonb, text, jsonb, boolean, boolean, text) to authenticated;