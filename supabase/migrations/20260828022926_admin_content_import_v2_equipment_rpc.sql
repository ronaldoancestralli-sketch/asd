create or replace function public.admin_save_equipment_bundle_v2(
  p_equipment_id uuid,
  p_equipment jsonb,
  p_variants jsonb default '[]'::jsonb,
  p_bonuses jsonb default '[]'::jsonb,
  p_replace_variants boolean default false,
  p_replace_bonuses boolean default false,
  p_source text default 'admin-ui'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid := p_equipment_id;
  v_existing equipments%rowtype;
  v_saved equipments%rowtype;
  v_operation text;
  v_variant jsonb;
  v_bonus jsonb;
  v_rarity_id uuid;
  v_required integer;
  v_set_id uuid;
  v_incoming_variant_ids uuid[] := '{}';
  v_incoming_bonus_pieces integer[] := '{}';
  v_slug text;
begin
  if not (select current_user_is_admin()) then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_equipment, '{}'::jsonb)) <> 'object' then
    raise exception 'equipment precisa ser um objeto JSON' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_variants, '[]'::jsonb)) <> 'array' then
    raise exception 'variants precisa ser um array JSON' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_bonuses, '[]'::jsonb)) <> 'array' then
    raise exception 'bonuses precisa ser um array JSON' using errcode = '22023';
  end if;

  if v_id is not null then
    select * into v_existing from equipments where id = v_id for update;
    if not found then
      raise exception 'Equipamento não encontrado' using errcode = 'P0002';
    end if;

    perform admin_snapshot_content_v2('equipment', v_id, p_source);

    update equipments e set
      name = case when p_equipment ? 'name' then nullif(btrim(p_equipment->>'name'),'') else e.name end,
      slug = case when p_equipment ? 'slug' then nullif(btrim(p_equipment->>'slug'),'') else e.slug end,
      slot_id = case when p_equipment ? 'slot_id' then nullif(p_equipment->>'slot_id','')::uuid else e.slot_id end,
      set_id = case when p_equipment ? 'set_id' then nullif(p_equipment->>'set_id','')::uuid else e.set_id end,
      description = case when p_equipment ? 'description' then nullif(p_equipment->>'description','') else e.description end,
      recommendation = case when p_equipment ? 'recommendation' then nullif(p_equipment->>'recommendation','') else e.recommendation end,
      recommendation_text = case when p_equipment ? 'recommendation_text' then nullif(p_equipment->>'recommendation_text','') else e.recommendation_text end,
      image_path = case when p_equipment ? 'image_path' then nullif(p_equipment->>'image_path','') else e.image_path end,
      image_url = case when p_equipment ? 'image_url' then nullif(p_equipment->>'image_url','') else e.image_url end,
      image_fit = case when p_equipment ? 'image_fit' then coalesce(nullif(p_equipment->>'image_fit',''), e.image_fit) else e.image_fit end,
      image_position = case when p_equipment ? 'image_position' then coalesce(nullif(p_equipment->>'image_position',''), e.image_position) else e.image_position end,
      image_scale = case when p_equipment ? 'image_scale' and nullif(p_equipment->>'image_scale','') is not null then (p_equipment->>'image_scale')::numeric else e.image_scale end,
      image_offset_x = case when p_equipment ? 'image_offset_x' and nullif(p_equipment->>'image_offset_x','') is not null then (p_equipment->>'image_offset_x')::integer else e.image_offset_x end,
      image_offset_y = case when p_equipment ? 'image_offset_y' and nullif(p_equipment->>'image_offset_y','') is not null then (p_equipment->>'image_offset_y')::integer else e.image_offset_y end,
      display_order = case when p_equipment ? 'display_order' and nullif(p_equipment->>'display_order','') is not null then (p_equipment->>'display_order')::integer else e.display_order end,
      enabled = case when p_equipment ? 'enabled' and jsonb_typeof(p_equipment->'enabled') = 'boolean' then (p_equipment->>'enabled')::boolean else e.enabled end,
      updated_at = now()
    where e.id = v_id
    returning * into v_saved;

    v_operation := 'updated';
  else
    if nullif(btrim(p_equipment->>'name'),'') is null then
      raise exception 'Nome do equipamento é obrigatório' using errcode = '23502';
    end if;
    v_slug := nullif(btrim(p_equipment->>'slug'),'');
    if v_slug is null then
      raise exception 'Slug do equipamento é obrigatório' using errcode = '23502';
    end if;
    if exists(select 1 from equipments where slug = v_slug) then
      raise exception 'Já existe equipamento com o slug %. Abra o registro existente para atualizar.', v_slug using errcode = '23505';
    end if;

    insert into equipments(
      name, slug, slot_id, set_id, description, recommendation, recommendation_text,
      image_path, image_url, image_fit, image_position, image_scale, image_offset_x, image_offset_y,
      display_order, enabled
    ) values (
      btrim(p_equipment->>'name'),
      v_slug,
      nullif(p_equipment->>'slot_id','')::uuid,
      nullif(p_equipment->>'set_id','')::uuid,
      nullif(p_equipment->>'description',''),
      nullif(p_equipment->>'recommendation',''),
      nullif(p_equipment->>'recommendation_text',''),
      nullif(p_equipment->>'image_path',''),
      nullif(p_equipment->>'image_url',''),
      coalesce(nullif(p_equipment->>'image_fit',''), 'contain'),
      coalesce(nullif(p_equipment->>'image_position',''), '50% 50%'),
      coalesce(nullif(p_equipment->>'image_scale','')::numeric, 1),
      coalesce(nullif(p_equipment->>'image_offset_x','')::integer, 0),
      coalesce(nullif(p_equipment->>'image_offset_y','')::integer, 0),
      coalesce(nullif(p_equipment->>'display_order','')::integer, 0),
      -- New AI-assisted content is never published implicitly.
      case when p_equipment ? 'enabled' and jsonb_typeof(p_equipment->'enabled') = 'boolean' then (p_equipment->>'enabled')::boolean else false end
    ) returning * into v_saved;

    v_id := v_saved.id;
    v_operation := 'created';
  end if;

  v_set_id := v_saved.set_id;

  for v_variant in select value from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb)) loop
    v_rarity_id := nullif(v_variant->>'rarity_id','')::uuid;
    if v_rarity_id is null or not exists(select 1 from equipment_rarities where id = v_rarity_id) then
      raise exception 'Raridade de variante inválida' using errcode = '23503';
    end if;
    v_incoming_variant_ids := array_append(v_incoming_variant_ids, v_rarity_id);

    insert into equipment_variants(equipment_id, rarity_id, attributes, updated_at)
    values (
      v_id,
      v_rarity_id,
      case when jsonb_typeof(v_variant->'attributes') in ('array','object') then v_variant->'attributes' else '[]'::jsonb end,
      now()
    )
    on conflict (equipment_id, rarity_id)
    do update set attributes = excluded.attributes, updated_at = now();
  end loop;

  if p_replace_variants then
    delete from equipment_variants
    where equipment_id = v_id
      and (coalesce(array_length(v_incoming_variant_ids,1),0) = 0 or not (rarity_id = any(v_incoming_variant_ids)));
  end if;

  if v_set_id is null and jsonb_array_length(coalesce(p_bonuses,'[]'::jsonb)) > 0 then
    raise exception 'Bônus foram enviados, mas o equipamento não possui conjunto selecionado' using errcode = '22023';
  end if;

  if v_set_id is not null then
    for v_bonus in select value from jsonb_array_elements(coalesce(p_bonuses, '[]'::jsonb)) loop
      v_required := nullif(v_bonus->>'required_pieces','')::integer;
      if v_required is null or v_required < 1 then
        raise exception 'required_pieces inválido' using errcode = '22023';
      end if;
      v_incoming_bonus_pieces := array_append(v_incoming_bonus_pieces, v_required);

      insert into equipment_set_bonuses(
        set_id, required_pieces, title, description, stats, display_order, updated_at
      ) values (
        v_set_id,
        v_required,
        coalesce(nullif(btrim(v_bonus->>'title'),''), v_required::text || ' Equipamentos'),
        coalesce(nullif(btrim(v_bonus->>'description'),''), 'Bônus do conjunto'),
        case when jsonb_typeof(v_bonus->'stats') = 'object' then v_bonus->'stats' else '{}'::jsonb end,
        coalesce(nullif(v_bonus->>'display_order','')::integer, 0),
        now()
      )
      on conflict (set_id, required_pieces)
      do update set
        title = excluded.title,
        description = excluded.description,
        stats = excluded.stats,
        display_order = excluded.display_order,
        updated_at = now();
    end loop;

    if p_replace_bonuses then
      delete from equipment_set_bonuses
      where set_id = v_set_id
        and (coalesce(array_length(v_incoming_bonus_pieces,1),0) = 0 or not (required_pieces = any(v_incoming_bonus_pieces)));
    end if;
  end if;

  return jsonb_build_object(
    'operation', v_operation,
    'equipment', to_jsonb(v_saved),
    'version_backup_created', v_operation = 'updated'
  );
end;
$$;

revoke all on function public.admin_save_equipment_bundle_v2(uuid, jsonb, jsonb, jsonb, boolean, boolean, text) from public, anon;
grant execute on function public.admin_save_equipment_bundle_v2(uuid, jsonb, jsonb, jsonb, boolean, boolean, text) to authenticated;