-- Phase 2A: make equipment scope explicit and coherent at the Admin write boundary.

do $$
begin
  if exists (
    select 1
    from public.equipments e
    where not (
      (e.is_personal is true and e.hero_id is not null and e.class_id is null)
      or
      (e.is_personal is not true and e.hero_id is null)
    )
  ) then
    raise exception 'equipment_scope_historical_rows_require_review'
      using errcode = '23514';
  end if;
end;
$$;

alter table public.equipments
  drop constraint if exists equipment_scope_coherent_v2;

alter table public.equipments
  add constraint equipment_scope_coherent_v2
  check (
    (is_personal is true and hero_id is not null and class_id is null)
    or
    (is_personal is not true and hero_id is null)
  ) not valid;

alter table public.equipments
  validate constraint equipment_scope_coherent_v2;

-- A referenced class must not disappear and silently turn exclusive gear generic.
alter table public.equipments
  drop constraint if exists equipments_class_id_fkey;

alter table public.equipments
  add constraint equipments_class_id_fkey
  foreign key (class_id)
  references public.hero_classes(id)
  on delete restrict;

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
  v_scope_requested boolean := coalesce(p_equipment, '{}'::jsonb) ? 'scope_type';
  v_scope_fields_requested boolean := coalesce(p_equipment, '{}'::jsonb) ?| array['hero_id', 'class_id', 'is_personal'];
  v_scope_type text;
  v_scope_hero_id uuid;
  v_scope_class_id uuid;
  v_scope_is_personal boolean;
begin
  if (select current_user_is_admin()) is not true then
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

  if v_scope_fields_requested and not v_scope_requested then
    raise exception 'scope_type é obrigatório ao alterar hero_id, class_id ou is_personal'
      using errcode = '22023';
  end if;
  if p_equipment ? 'is_personal' and jsonb_typeof(p_equipment->'is_personal') <> 'boolean' then
    raise exception 'is_personal precisa ser booleano' using errcode = '22023';
  end if;
  if v_id is null and not v_scope_requested then
    raise exception 'scope_type é obrigatório ao criar equipamento'
      using errcode = '22023';
  end if;

  if v_scope_requested then
    v_scope_type := lower(btrim(coalesce(p_equipment->>'scope_type', '')));

    begin
      v_scope_hero_id := nullif(btrim(coalesce(p_equipment->>'hero_id', '')), '')::uuid;
      v_scope_class_id := nullif(btrim(coalesce(p_equipment->>'class_id', '')), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'hero_id ou class_id inválido' using errcode = '22023';
    end;

    if v_scope_type = 'generic' then
      if v_scope_hero_id is not null or v_scope_class_id is not null
        or (p_equipment ? 'is_personal' and coalesce((p_equipment->>'is_personal')::boolean, false)) then
        raise exception 'Escopo genérico não aceita vínculo de herói ou classe'
          using errcode = '22023';
      end if;
      v_scope_hero_id := null;
      v_scope_class_id := null;
      v_scope_is_personal := false;
    elsif v_scope_type = 'class' then
      if v_scope_class_id is null then
        raise exception 'class_id é obrigatório para escopo de classe'
          using errcode = '22023';
      end if;
      if v_scope_hero_id is not null
        or (p_equipment ? 'is_personal' and coalesce((p_equipment->>'is_personal')::boolean, false)) then
        raise exception 'Escopo de classe não aceita vínculo de herói pessoal'
          using errcode = '22023';
      end if;
      if not exists (select 1 from public.hero_classes where id = v_scope_class_id) then
        raise exception 'Classe exclusiva não encontrada' using errcode = '23503';
      end if;
      v_scope_hero_id := null;
      v_scope_is_personal := false;
    elsif v_scope_type = 'hero' then
      if v_scope_hero_id is null then
        raise exception 'hero_id é obrigatório para escopo de herói'
          using errcode = '22023';
      end if;
      if v_scope_class_id is not null
        or (p_equipment ? 'is_personal' and coalesce((p_equipment->>'is_personal')::boolean, true) is not true) then
        raise exception 'Escopo de herói não aceita um segundo vínculo de classe'
          using errcode = '22023';
      end if;
      if not exists (select 1 from public.heroes where id = v_scope_hero_id) then
        raise exception 'Herói exclusivo não encontrado' using errcode = '23503';
      end if;
      v_scope_class_id := null;
      v_scope_is_personal := true;
    else
      raise exception 'scope_type deve ser generic, class ou hero'
        using errcode = '22023';
    end if;
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
      hero_id = case when v_scope_requested then v_scope_hero_id else e.hero_id end,
      class_id = case when v_scope_requested then v_scope_class_id else e.class_id end,
      is_personal = case when v_scope_requested then v_scope_is_personal else e.is_personal end,
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
      name, slug, slot_id, set_id, hero_id, class_id, is_personal,
      description, recommendation, recommendation_text,
      image_path, image_url, image_fit, image_position, image_scale, image_offset_x, image_offset_y,
      display_order, enabled
    ) values (
      btrim(p_equipment->>'name'),
      v_slug,
      nullif(p_equipment->>'slot_id','')::uuid,
      nullif(p_equipment->>'set_id','')::uuid,
      v_scope_hero_id,
      v_scope_class_id,
      v_scope_is_personal,
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

revoke all on function public.admin_save_equipment_bundle_v2(uuid, jsonb, jsonb, jsonb, boolean, boolean, text)
  from public, anon;
grant execute on function public.admin_save_equipment_bundle_v2(uuid, jsonb, jsonb, jsonb, boolean, boolean, text)
  to authenticated, service_role;

-- Version snapshots predate scope_type but already contain the three persisted fields.
-- Never infer scope from names, and never restore an incoherent historical snapshot.
create or replace function public.admin_restore_content_version_v2(p_version_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_record admin_content_versions%rowtype;
  v_result jsonb;
  v_equipment jsonb;
  v_hero_id text;
  v_class_id text;
  v_is_personal boolean;
begin
  if (select current_user_is_admin()) is not true then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;
  select * into v_record from admin_content_versions where id = p_version_id;
  if not found then
    raise exception 'Versão não encontrada' using errcode = 'P0002';
  end if;

  if v_record.entity_type = 'hero' then
    v_result := admin_save_hero_bundle_v2(
      v_record.entity_id,
      coalesce(v_record.snapshot->'hero', '{}'::jsonb),
      coalesce(v_record.snapshot->'base_stats', '{}'::jsonb),
      v_record.snapshot->>'weapon_name',
      coalesce(v_record.snapshot->'weapon_stats', '{}'::jsonb),
      true, true, 'version-restore'
    );
  elsif v_record.entity_type = 'equipment' then
    v_equipment := coalesce(v_record.snapshot->'equipment', '{}'::jsonb);
    if v_equipment ?| array['hero_id', 'class_id', 'is_personal'] then
      if not (v_equipment ?& array['hero_id', 'class_id', 'is_personal']) then
        raise exception 'Versão contém escopo incompleto; revise os vínculos no editor'
          using errcode = '23514';
      end if;
      if jsonb_typeof(v_equipment->'is_personal') not in ('boolean', 'null') then
        raise exception 'Versão contém is_personal inválido; revise os vínculos no editor'
          using errcode = '23514';
      end if;
      v_hero_id := nullif(btrim(coalesce(v_equipment->>'hero_id', '')), '');
      v_class_id := nullif(btrim(coalesce(v_equipment->>'class_id', '')), '');
      v_is_personal := coalesce((v_equipment->>'is_personal')::boolean, false);

      if (v_is_personal and (v_hero_id is null or v_class_id is not null))
        or (not v_is_personal and v_hero_id is not null) then
        raise exception 'Versão contém escopo contraditório; revise os vínculos no editor'
          using errcode = '23514';
      end if;

      v_equipment := v_equipment || jsonb_build_object(
        'scope_type', case when v_is_personal then 'hero' when v_class_id is not null then 'class' else 'generic' end,
        'hero_id', v_hero_id,
        'class_id', v_class_id,
        'is_personal', v_is_personal
      );
    end if;

    v_result := admin_save_equipment_bundle_v2(
      v_record.entity_id, v_equipment,
      coalesce(v_record.snapshot->'variants', '[]'::jsonb),
      coalesce(v_record.snapshot->'bonuses', '[]'::jsonb),
      true, true, 'version-restore'
    );
  else
    raise exception 'Tipo de versão inválido' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'restored_version_id', v_record.id,
    'entity_type', v_record.entity_type,
    'entity_id', v_record.entity_id,
    'result', v_result
  );
end;
$$;

revoke all on function public.admin_restore_content_version_v2(uuid) from public, anon;
grant execute on function public.admin_restore_content_version_v2(uuid) to authenticated, service_role;
