-- Echo Arena — painel semântico, publicação central e reprocessamento seguro.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

select pg_advisory_xact_lock(
  hashtextextended('echoarena:equipment-semantic-admin-v2:20260919', 0)
);

create function public.calculation_validate_alias_binding_v2(
  p_target_stat_id text,
  p_context_id text,
  p_allowed_units text[],
  p_allowed_operations text[]
)
returns public.calculation_stat_definition_profiles_v2
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_profile public.calculation_stat_definition_profiles_v2%rowtype;
begin
  if coalesce(cardinality(p_allowed_units), 0) = 0
    or coalesce(cardinality(p_allowed_operations), 0) = 0
    or exists (
      select 1 from unnest(p_allowed_units) value
      where value is null or value !~ '^[a-z0-9_%]{1,80}$'
    )
    or exists (
      select 1 from unnest(p_allowed_operations) value
      where value is null or value !~ '^[a-z][a-z0-9_]{1,79}$'
    ) then
    raise exception 'CALCULATION_ALIAS_UNIT_OR_OPERATION_REQUIRED';
  end if;

  select profile.* into v_profile
  from public.calculation_stat_definition_profiles_v2 profile
  join public.calculation_stat_definitions_v2 definition
    on definition.id = profile.definition_id
   and definition.enabled
  where profile.definition_id = p_target_stat_id
    and profile.context_id = p_context_id
    and profile.state = 'published'
    and profile.formula_state = 'published';

  if not found then
    raise exception 'CALCULATION_DEFINITION_FORMULA_NOT_PUBLISHED';
  end if;
  if not (p_allowed_units <@ v_profile.accepted_units)
    or not (p_allowed_operations <@ v_profile.allowed_operations) then
    raise exception 'CALCULATION_ALIAS_INCOMPATIBLE_WITH_DEFINITION';
  end if;
  if exists (
    select 1
    from unnest(p_allowed_operations) operation_id
    left join public.calculation_operation_definitions_v2 operation
      on operation.id = operation_id
     and operation.state = 'published'
    where operation.id is null
  ) then
    raise exception 'CALCULATION_OPERATION_NOT_PUBLISHED';
  end if;

  return v_profile;
end;
$$;

create function public.admin_save_calculation_alias_draft_v2(
  p_raw_alias text,
  p_target_stat_id text,
  p_context_key text,
  p_allowed_units text[],
  p_allowed_operations text[],
  p_evidence_reference text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_profile public.calculation_stat_definition_profiles_v2%rowtype;
  v_normalized text;
  v_version integer;
  v_alias public.calculation_attribute_aliases_v2%rowtype;
begin
  perform public.echo_require_admin_capability('equipment.edit');
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'CALCULATION_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_reason)), 0) not between 5 and 2000
    or coalesce(length(btrim(p_evidence_reference)), 0) not between 3 and 1000 then
    raise exception 'CALCULATION_REASON_OR_EVIDENCE_REQUIRED';
  end if;

  v_normalized := public.calculation_normalize_alias_v2(p_raw_alias);
  if length(v_normalized) not between 1 and 1000 then
    raise exception 'CALCULATION_ALIAS_INVALID';
  end if;
  v_profile := public.calculation_validate_alias_binding_v2(
    p_target_stat_id,
    p_context_key,
    p_allowed_units,
    p_allowed_operations
  );

  if exists (
    select 1
    from public.calculation_attribute_aliases_v2 alias
    where alias.normalized_alias = v_normalized
      and alias.state = 'published'
  ) then
    raise exception 'CALCULATION_ALIAS_ALREADY_PUBLISHED';
  end if;

  select coalesce(max(alias.version), 0) + 1 into v_version
  from public.calculation_attribute_aliases_v2 alias
  where alias.normalized_alias = v_normalized;

  insert into public.calculation_attribute_aliases_v2 (
    raw_alias,
    target_stat_id,
    definition_version,
    context_id,
    allowed_units,
    allowed_operations,
    version,
    state,
    evidence_reference,
    created_by
  ) values (
    btrim(p_raw_alias),
    p_target_stat_id,
    v_profile.version,
    p_context_key,
    p_allowed_units,
    p_allowed_operations,
    v_version,
    'draft',
    btrim(p_evidence_reference),
    v_actor
  )
  returning * into v_alias;

  perform public.echo_write_admin_audit(
    'equipment',
    'equipment.edit',
    'calculation_alias_draft_saved',
    'calculation_attribute_alias',
    v_alias.id::text,
    p_reason,
    null,
    to_jsonb(v_alias),
    null::text
  );

  return jsonb_build_object(
    'id', v_alias.id,
    'rawAlias', v_alias.raw_alias,
    'normalizedAlias', v_alias.normalized_alias,
    'target', v_alias.target_stat_id,
    'context', v_alias.context_id,
    'allowedUnits', to_jsonb(v_alias.allowed_units),
    'allowedOperations', to_jsonb(v_alias.allowed_operations),
    'version', v_alias.version,
    'state', v_alias.state
  );
end;
$$;

create function public.admin_create_calculation_definition_draft_v2(
  p_canonical_key text,
  p_display_name text,
  p_scope text,
  p_source_key text,
  p_context_key text,
  p_unit text,
  p_value_type text,
  p_direction text,
  p_allowed_operations text[],
  p_internal_precision smallint,
  p_display_precision smallint,
  p_metric_kind text,
  p_default_base numeric,
  p_evidence_reference text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_version integer;
  v_draft public.calculation_definition_drafts_v2%rowtype;
begin
  perform public.echo_require_admin_capability('equipment.edit');
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'CALCULATION_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_reason)), 0) not between 5 and 2000
    or coalesce(length(btrim(p_evidence_reference)), 0) not between 3 and 1000 then
    raise exception 'CALCULATION_REASON_OR_EVIDENCE_REQUIRED';
  end if;
  if p_canonical_key !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    or p_source_key !~ '^[a-z][a-z0-9_]{1,79}$'
    or p_scope <> split_part(p_canonical_key, '.', 1) then
    raise exception 'CALCULATION_DEFINITION_KEY_INVALID';
  end if;
  if not exists (
    select 1 from public.calculation_contexts_v2 context
    where context.id = p_context_key and context.state = 'published'
  ) then
    raise exception 'CALCULATION_CONTEXT_NOT_PUBLISHED';
  end if;
  if coalesce(cardinality(p_allowed_operations), 0) = 0
    or exists (
      select 1
      from unnest(p_allowed_operations) requested
      left join public.calculation_operation_definitions_v2 operation
        on operation.id = requested and operation.state = 'published'
      where operation.id is null
    ) then
    raise exception 'CALCULATION_OPERATION_NOT_PUBLISHED';
  end if;
  if exists (
    select 1 from public.calculation_stat_definitions_v2 definition
    where definition.id = p_canonical_key
  ) then
    raise exception 'CALCULATION_DEFINITION_ALREADY_EXISTS';
  end if;

  select coalesce(max(draft.version), 0) + 1 into v_version
  from public.calculation_definition_drafts_v2 draft
  where draft.canonical_key = p_canonical_key;

  insert into public.calculation_definition_drafts_v2 (
    canonical_key,
    display_name,
    scope,
    source_key,
    context_id,
    unit,
    value_type,
    direction,
    allowed_operations,
    internal_precision,
    display_precision,
    display_rounding,
    metric_kind,
    default_base,
    evidence_reference,
    version,
    state,
    created_by
  ) values (
    p_canonical_key,
    btrim(p_display_name),
    p_scope,
    p_source_key,
    p_context_key,
    p_unit,
    p_value_type,
    p_direction,
    p_allowed_operations,
    p_internal_precision,
    p_display_precision,
    'decimal_places',
    p_metric_kind,
    p_default_base,
    btrim(p_evidence_reference),
    v_version,
    'draft',
    v_actor
  )
  returning * into v_draft;

  perform public.echo_write_admin_audit(
    'equipment',
    'equipment.edit',
    'calculation_definition_draft_created',
    'calculation_definition_draft',
    v_draft.id::text,
    p_reason,
    null,
    to_jsonb(v_draft),
    null::text
  );

  return jsonb_build_object(
    'id', v_draft.id,
    'canonicalKey', v_draft.canonical_key,
    'displayName', v_draft.display_name,
    'version', v_draft.version,
    'state', v_draft.state
  );
end;
$$;

create function public.admin_publish_calculation_definition_v2(
  p_draft_id uuid,
  p_expected_version integer,
  p_policy_reference text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_draft public.calculation_definition_drafts_v2%rowtype;
  v_display_order integer;
begin
  perform public.echo_require_admin_capability('equipment.publish');
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'CALCULATION_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_reason)), 0) not between 5 and 2000
    or coalesce(length(btrim(p_policy_reference)), 0) not between 10 and 2000 then
    raise exception 'CALCULATION_REASON_OR_POLICY_EVIDENCE_REQUIRED';
  end if;

  select * into v_draft
  from public.calculation_definition_drafts_v2 draft
  where draft.id = p_draft_id
  for update;

  if not found then
    raise exception 'CALCULATION_DEFINITION_DRAFT_NOT_FOUND';
  end if;
  if v_draft.version is distinct from p_expected_version
    or v_draft.state not in ('draft', 'reviewed') then
    raise exception 'CALCULATION_DEFINITION_DRAFT_CONFLICT' using errcode = '40001';
  end if;
  if v_draft.scope not in ('hero', 'weapon') then
    raise exception 'CALCULATION_SCOPE_REQUIRES_ENGINE_SUPPORT';
  end if;
  if exists (
    select 1
    from unnest(v_draft.allowed_operations) requested
    where requested <> all(array['flat', 'percent']::text[])
  ) then
    raise exception 'CALCULATION_OPERATION_REQUIRES_ENGINE_SUPPORT';
  end if;

  select coalesce(max(definition.display_order), 0) + 10
  into v_display_order
  from public.calculation_stat_definitions_v2 definition;

  insert into public.calculation_stat_definitions_v2 (
    id,
    label,
    scope,
    source_key,
    unit,
    direction,
    policy_id,
    policy_reference,
    display_order,
    enabled,
    default_base
  ) values (
    v_draft.canonical_key,
    v_draft.display_name,
    v_draft.scope,
    v_draft.source_key,
    v_draft.unit,
    v_draft.direction,
    'additive-base-v1',
    btrim(p_policy_reference),
    v_display_order,
    true,
    v_draft.default_base
  );

  insert into public.calculation_stat_definition_profiles_v2 (
    definition_id,
    version,
    context_id,
    value_type,
    accepted_units,
    allowed_operations,
    internal_precision,
    display_precision,
    display_rounding,
    metric_kind,
    formula_state,
    state,
    evidence_reference,
    created_by
  ) values (
    v_draft.canonical_key,
    v_draft.version,
    v_draft.context_id,
    v_draft.value_type,
    array[v_draft.unit, 'implicit', 'percent']::text[],
    v_draft.allowed_operations,
    v_draft.internal_precision,
    v_draft.display_precision,
    v_draft.display_rounding,
    v_draft.metric_kind,
    'published',
    'published',
    btrim(p_policy_reference),
    v_actor
  );

  update public.calculation_definition_drafts_v2
  set policy_id = 'additive-base-v1',
      policy_reference = btrim(p_policy_reference),
      state = 'published',
      published_by = v_actor,
      published_at = now(),
      updated_at = now()
  where id = v_draft.id;

  perform public.echo_write_admin_audit(
    'equipment',
    'equipment.publish',
    'calculation_definition_published',
    'calculation_stat_definition',
    v_draft.canonical_key,
    p_reason,
    to_jsonb(v_draft),
    jsonb_build_object(
      'definition', (
        select to_jsonb(definition)
        from public.calculation_stat_definitions_v2 definition
        where definition.id = v_draft.canonical_key
      ),
      'profile', (
        select to_jsonb(profile)
        from public.calculation_stat_definition_profiles_v2 profile
        where profile.definition_id = v_draft.canonical_key
          and profile.version = v_draft.version
      )
    ),
    null::text
  );

  return jsonb_build_object(
    'canonicalKey', v_draft.canonical_key,
    'version', v_draft.version,
    'state', 'published'
  );
end;
$$;

create function public.admin_publish_calculation_alias_v2(
  p_raw_alias text,
  p_target_stat_id text,
  p_context_key text,
  p_allowed_units text[],
  p_allowed_operations text[],
  p_evidence_reference text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_profile public.calculation_stat_definition_profiles_v2%rowtype;
  v_normalized text;
  v_version integer;
  v_alias public.calculation_attribute_aliases_v2%rowtype;
  v_before jsonb;
  v_plan_id uuid := gen_random_uuid();
  v_preview jsonb;
  v_items jsonb;
  v_equipment_names jsonb;
  v_effect_count integer;
  v_equipment_count integer;
  v_fingerprint text;
begin
  perform public.echo_require_admin_capability('equipment.publish');
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'CALCULATION_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_reason)), 0) not between 5 and 2000
    or coalesce(length(btrim(p_evidence_reference)), 0) not between 3 and 1000 then
    raise exception 'CALCULATION_REASON_OR_EVIDENCE_REQUIRED';
  end if;

  v_normalized := public.calculation_normalize_alias_v2(p_raw_alias);
  if length(v_normalized) not between 1 and 1000 then
    raise exception 'CALCULATION_ALIAS_INVALID';
  end if;
  v_profile := public.calculation_validate_alias_binding_v2(
    p_target_stat_id,
    p_context_key,
    p_allowed_units,
    p_allowed_operations
  );

  select * into v_alias
  from public.calculation_attribute_aliases_v2 alias
  where alias.normalized_alias = v_normalized
    and alias.state = 'published'
  for update;

  if found and (
    v_alias.target_stat_id <> p_target_stat_id
    or v_alias.context_id <> p_context_key
    or not (p_allowed_units <@ v_alias.allowed_units)
    or not (p_allowed_operations <@ v_alias.allowed_operations)
  ) then
    raise exception 'CALCULATION_ALIAS_COLLISION';
  end if;

  if not found then
    select * into v_alias
    from public.calculation_attribute_aliases_v2 alias
    where alias.normalized_alias = v_normalized
      and alias.target_stat_id = p_target_stat_id
      and alias.context_id = p_context_key
      and alias.state in ('draft', 'reviewed')
    order by alias.version desc
    limit 1
    for update;

    if found then
      v_before := to_jsonb(v_alias);
      update public.calculation_attribute_aliases_v2
      set raw_alias = btrim(p_raw_alias),
          definition_version = v_profile.version,
          allowed_units = p_allowed_units,
          allowed_operations = p_allowed_operations,
          state = 'published',
          evidence_reference = btrim(p_evidence_reference),
          reviewed_by = v_actor,
          published_by = v_actor,
          published_at = now(),
          updated_at = now()
      where id = v_alias.id
      returning * into v_alias;
    else
      select coalesce(max(alias.version), 0) + 1 into v_version
      from public.calculation_attribute_aliases_v2 alias
      where alias.normalized_alias = v_normalized;

      insert into public.calculation_attribute_aliases_v2 (
        raw_alias,
        target_stat_id,
        definition_version,
        context_id,
        allowed_units,
        allowed_operations,
        version,
        state,
        evidence_reference,
        created_by,
        reviewed_by,
        published_by,
        published_at
      ) values (
        btrim(p_raw_alias),
        p_target_stat_id,
        v_profile.version,
        p_context_key,
        p_allowed_units,
        p_allowed_operations,
        v_version,
        'published',
        btrim(p_evidence_reference),
        v_actor,
        v_actor,
        v_actor,
        now()
      )
      returning * into v_alias;
    end if;
  end if;

  select count(*), count(distinct fx.equipment_id)
  into v_effect_count, v_equipment_count
  from public.equipment_calculation_effects_v2 fx
  where fx.kind = 'numeric'
    and fx.target_stat_id is null
    and fx.normalized_text = v_alias.normalized_alias
    and fx.operation = any(v_alias.allowed_operations)
    and fx.observed_unit = any(v_alias.allowed_units);

  select coalesce(jsonb_agg(name order by name), '[]'::jsonb)
  into v_equipment_names
  from (
    select distinct equipment.name
    from public.equipment_calculation_effects_v2 fx
    join public.equipments equipment on equipment.id = fx.equipment_id
    where fx.kind = 'numeric'
      and fx.target_stat_id is null
      and fx.normalized_text = v_alias.normalized_alias
      and fx.operation = any(v_alias.allowed_operations)
      and fx.observed_unit = any(v_alias.allowed_units)
  ) affected_equipment;

  select coalesce(jsonb_agg(jsonb_build_object(
    'effectId', affected.effect_id,
    'equipmentId', affected.equipment_id,
    'equipmentName', affected.equipment_name,
    'description', affected.description,
    'previousTarget', null,
    'proposedTarget', v_alias.target_stat_id,
    'context', v_alias.context_id,
    'operation', affected.operation,
    'observedUnit', affected.observed_unit,
    'rarityValues', affected.rarity_values,
    'defaultBase', affected.default_base,
    'resultPreview', affected.result_preview
  ) order by affected.equipment_name, affected.effect_id), '[]'::jsonb)
  into v_items
  from (
    select
      fx.id as effect_id,
      fx.equipment_id,
      equipment.name as equipment_name,
      fx.description,
      fx.operation,
      fx.observed_unit,
      definition.default_base,
      (
        select jsonb_object_agg(
          rarity.slug,
          to_jsonb(value.value)
          order by rarity.rank, rarity.slug
        )
        from public.equipment_rarities rarity
        join public.equipment_calculation_rarity_values_v2 value
          on value.rarity_id = rarity.id
         and value.effect_id = fx.id
      ) as rarity_values,
      case
        when definition.default_base is null then null
        else (
          select jsonb_object_agg(
            rarity.slug,
            case
              when value.value is null then 'null'::jsonb
              when fx.operation = 'flat' then
                to_jsonb(definition.default_base + value.value)
              when fx.operation = 'percent' then
                to_jsonb(
                  definition.default_base
                  + definition.default_base * value.value / 100
                )
              else 'null'::jsonb
            end
            order by rarity.rank, rarity.slug
          )
          from public.equipment_rarities rarity
          join public.equipment_calculation_rarity_values_v2 value
            on value.rarity_id = rarity.id
           and value.effect_id = fx.id
        )
      end as result_preview
    from public.equipment_calculation_effects_v2 fx
    join public.equipments equipment on equipment.id = fx.equipment_id
    join public.calculation_stat_definitions_v2 definition
      on definition.id = v_alias.target_stat_id
    where fx.kind = 'numeric'
      and fx.target_stat_id is null
      and fx.normalized_text = v_alias.normalized_alias
      and fx.operation = any(v_alias.allowed_operations)
      and fx.observed_unit = any(v_alias.allowed_units)
  ) affected;

  v_preview := jsonb_build_object(
    'aliasId', v_alias.id,
    'normalizedAlias', v_alias.normalized_alias,
    'affectedEffectCount', v_effect_count,
    'affectedEquipmentCount', v_equipment_count,
    'equipmentNames', v_equipment_names,
    'previousTarget', null,
    'proposedTarget', v_alias.target_stat_id,
    'context', v_alias.context_id,
    'operation', case
      when cardinality(v_alias.allowed_operations) = 1
        then v_alias.allowed_operations[1]
      else null
    end,
    'observedUnit', case
      when cardinality(v_alias.allowed_units) = 1
        then v_alias.allowed_units[1]
      else null
    end,
    'definitionVersion', v_alias.definition_version,
    'policyId', (
      select definition.policy_id
      from public.calculation_stat_definitions_v2 definition
      where definition.id = v_alias.target_stat_id
    ),
    'items', v_items
  );
  v_fingerprint := public.calculation_hash_v2(v_preview);

  insert into public.calculation_reprocess_plans_v2 (
    id,
    alias_id,
    fingerprint,
    status,
    affected_effect_count,
    affected_equipment_count,
    preview,
    created_by
  ) values (
    v_plan_id,
    v_alias.id,
    v_fingerprint,
    'preview',
    v_effect_count,
    v_equipment_count,
    v_preview,
    v_actor
  );

  insert into public.calculation_reprocess_items_v2 (
    plan_id,
    effect_id,
    equipment_id,
    before_effect,
    after_effect
  )
  select
    v_plan_id,
    fx.id,
    fx.equipment_id,
    jsonb_build_object(
      'target', fx.target_stat_id,
      'resolvedAliasId', fx.resolved_alias_id,
      'semanticContext', fx.semantic_context,
      'definitionVersion', fx.definition_version,
      'resolutionStatus', fx.resolution_status,
      'operation', fx.operation,
      'observedUnit', fx.observed_unit
    ),
    jsonb_build_object(
      'target', v_alias.target_stat_id,
      'resolvedAliasId', v_alias.id,
      'semanticContext', v_alias.context_id,
      'definitionVersion', v_alias.definition_version,
      'resolutionStatus', 'resolved',
      'operation', fx.operation,
      'observedUnit', fx.observed_unit
    )
  from public.equipment_calculation_effects_v2 fx
  where fx.kind = 'numeric'
    and fx.target_stat_id is null
    and fx.normalized_text = v_alias.normalized_alias
    and fx.operation = any(v_alias.allowed_operations)
    and fx.observed_unit = any(v_alias.allowed_units);

  perform public.echo_write_admin_audit(
    'equipment',
    'equipment.publish',
    'calculation_alias_published',
    'calculation_attribute_alias',
    v_alias.id::text,
    p_reason,
    v_before,
    jsonb_build_object('alias', to_jsonb(v_alias), 'reprocessPreview', v_preview),
    null::text
  );

  return jsonb_build_object(
    'alias', jsonb_build_object(
      'id', v_alias.id,
      'rawAlias', v_alias.raw_alias,
      'normalizedAlias', v_alias.normalized_alias,
      'target', v_alias.target_stat_id,
      'definitionVersion', v_alias.definition_version,
      'context', v_alias.context_id,
      'allowedUnits', to_jsonb(v_alias.allowed_units),
      'allowedOperations', to_jsonb(v_alias.allowed_operations),
      'version', v_alias.version,
      'state', v_alias.state
    ),
    'reprocessPlan', jsonb_build_object(
      'id', v_plan_id,
      'fingerprint', v_fingerprint,
      'status', 'preview',
      'preview', v_preview
    )
  );
end;
$$;

create function public.admin_confirm_calculation_reprocess_v2(
  p_plan_id uuid,
  p_expected_fingerprint text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_plan public.calculation_reprocess_plans_v2%rowtype;
  v_before jsonb;
begin
  perform public.echo_require_admin_capability('equipment.publish');
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'CALCULATION_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_reason)), 0) not between 5 and 2000 then
    raise exception 'CALCULATION_REASON_REQUIRED';
  end if;

  select * into v_plan
  from public.calculation_reprocess_plans_v2 plan
  where plan.id = p_plan_id
  for update;

  if not found then
    raise exception 'CALCULATION_REPROCESS_PLAN_NOT_FOUND';
  end if;
  if v_plan.status <> 'preview'
    or v_plan.fingerprint is distinct from p_expected_fingerprint then
    raise exception 'CALCULATION_REPROCESS_PLAN_CONFLICT' using errcode = '40001';
  end if;

  if exists (
    select 1
    from public.calculation_reprocess_items_v2 item
    join public.equipment_calculation_effects_v2 fx on fx.id = item.effect_id
    where item.plan_id = p_plan_id
      and public.calculation_hash_v2(jsonb_build_object(
        'target', fx.target_stat_id,
        'resolvedAliasId', fx.resolved_alias_id,
        'semanticContext', fx.semantic_context,
        'definitionVersion', fx.definition_version,
        'resolutionStatus', fx.resolution_status,
        'operation', fx.operation,
        'observedUnit', fx.observed_unit
      )) <> public.calculation_hash_v2(item.before_effect)
  ) then
    update public.calculation_reprocess_plans_v2
    set status = 'stale'
    where id = p_plan_id;
    raise exception 'CALCULATION_REPROCESS_PREVIEW_STALE' using errcode = '40001';
  end if;

  v_before := v_plan.preview;

  update public.equipment_calculation_effects_v2 fx
  set target_stat_id = nullif(item.after_effect->>'target', ''),
      resolved_alias_id = nullif(item.after_effect->>'resolvedAliasId', '')::uuid,
      semantic_context = nullif(item.after_effect->>'semanticContext', ''),
      definition_version = nullif(item.after_effect->>'definitionVersion', '')::integer,
      resolution_status = item.after_effect->>'resolutionStatus',
      updated_at = now()
  from public.calculation_reprocess_items_v2 item
  where item.plan_id = p_plan_id
    and fx.id = item.effect_id
    and fx.equipment_id = item.equipment_id;

  update public.equipment_calculation_workspaces_v2 workspace
  set revision = workspace.revision + 1,
      workflow_status = 'draft',
      last_reason = btrim(p_reason),
      updated_by = v_actor,
      updated_at = now()
  where workspace.equipment_id in (
    select distinct item.equipment_id
    from public.calculation_reprocess_items_v2 item
    where item.plan_id = p_plan_id
  );

  update public.calculation_reprocess_plans_v2
  set status = 'applied',
      applied_by = v_actor,
      applied_at = now()
  where id = p_plan_id
  returning * into v_plan;

  perform public.echo_write_admin_audit(
    'equipment',
    'equipment.publish',
    'calculation_reprocess_applied',
    'calculation_reprocess_plan',
    p_plan_id::text,
    p_reason,
    v_before,
    jsonb_build_object(
      'status', v_plan.status,
      'appliedAt', v_plan.applied_at,
      'affectedEffectCount', v_plan.affected_effect_count,
      'affectedEquipmentCount', v_plan.affected_equipment_count
    ),
    null::text
  );

  return jsonb_build_object(
    'id', v_plan.id,
    'status', v_plan.status,
    'fingerprint', v_plan.fingerprint,
    'affectedEffectCount', v_plan.affected_effect_count,
    'affectedEquipmentCount', v_plan.affected_equipment_count,
    'appliedAt', v_plan.applied_at
  );
end;
$$;

create function public.admin_revert_calculation_reprocess_v2(
  p_plan_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_plan public.calculation_reprocess_plans_v2%rowtype;
begin
  perform public.echo_require_admin_capability('equipment.publish');
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'CALCULATION_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_reason)), 0) not between 5 and 2000 then
    raise exception 'CALCULATION_REASON_REQUIRED';
  end if;

  select * into v_plan
  from public.calculation_reprocess_plans_v2 plan
  where plan.id = p_plan_id
  for update;

  if not found then
    raise exception 'CALCULATION_REPROCESS_PLAN_NOT_FOUND';
  end if;
  if v_plan.status <> 'applied' then
    raise exception 'CALCULATION_REPROCESS_NOT_APPLIED';
  end if;

  if exists (
    select 1
    from public.calculation_reprocess_items_v2 item
    join public.equipment_calculation_effects_v2 fx on fx.id = item.effect_id
    where item.plan_id = p_plan_id
      and public.calculation_hash_v2(jsonb_build_object(
        'target', fx.target_stat_id,
        'resolvedAliasId', fx.resolved_alias_id,
        'semanticContext', fx.semantic_context,
        'definitionVersion', fx.definition_version,
        'resolutionStatus', fx.resolution_status,
        'operation', fx.operation,
        'observedUnit', fx.observed_unit
      )) <> public.calculation_hash_v2(item.after_effect)
  ) then
    raise exception 'CALCULATION_REPROCESS_REVERT_CONFLICT' using errcode = '40001';
  end if;

  update public.equipment_calculation_effects_v2 fx
  set target_stat_id = nullif(item.before_effect->>'target', ''),
      resolved_alias_id = nullif(item.before_effect->>'resolvedAliasId', '')::uuid,
      semantic_context = nullif(item.before_effect->>'semanticContext', ''),
      definition_version = nullif(item.before_effect->>'definitionVersion', '')::integer,
      resolution_status = item.before_effect->>'resolutionStatus',
      updated_at = now()
  from public.calculation_reprocess_items_v2 item
  where item.plan_id = p_plan_id
    and fx.id = item.effect_id
    and fx.equipment_id = item.equipment_id;

  update public.equipment_calculation_workspaces_v2 workspace
  set revision = workspace.revision + 1,
      workflow_status = 'draft',
      last_reason = btrim(p_reason),
      updated_by = v_actor,
      updated_at = now()
  where workspace.equipment_id in (
    select distinct item.equipment_id
    from public.calculation_reprocess_items_v2 item
    where item.plan_id = p_plan_id
  );

  update public.calculation_reprocess_plans_v2
  set status = 'reverted',
      reverted_by = v_actor,
      reverted_at = now()
  where id = p_plan_id
  returning * into v_plan;

  perform public.echo_write_admin_audit(
    'equipment',
    'equipment.publish',
    'calculation_reprocess_reverted',
    'calculation_reprocess_plan',
    p_plan_id::text,
    p_reason,
    jsonb_build_object('status', 'applied', 'preview', v_plan.preview),
    jsonb_build_object(
      'status', v_plan.status,
      'revertedAt', v_plan.reverted_at,
      'affectedEffectCount', v_plan.affected_effect_count,
      'affectedEquipmentCount', v_plan.affected_equipment_count
    ),
    null::text
  );

  return jsonb_build_object(
    'id', v_plan.id,
    'status', v_plan.status,
    'fingerprint', v_plan.fingerprint,
    'affectedEffectCount', v_plan.affected_effect_count,
    'affectedEquipmentCount', v_plan.affected_equipment_count,
    'revertedAt', v_plan.reverted_at
  );
end;
$$;

revoke all on function
  public.calculation_normalize_alias_v2(text),
  public.calculation_contexts_json_v2(),
  public.calculation_operations_json_v2(),
  public.calculation_aliases_json_v2(),
  public.calculation_definition_drafts_json_v2(),
  public.calculation_reprocess_plans_json_v2(),
  public.calculation_validate_effects_legacy_v2(jsonb),
  public.calculation_validate_effects_v2(jsonb),
  public.calculation_resolve_effect_semantics_v2(),
  public.calculation_validate_alias_binding_v2(text, text, text[], text[]),
  public.admin_save_equipment_calculation_legacy_v2(uuid, bigint, jsonb, text),
  public.admin_save_equipment_calculation_v2(uuid, bigint, jsonb, text),
  public.admin_save_calculation_alias_draft_v2(text, text, text, text[], text[], text, text),
  public.admin_create_calculation_definition_draft_v2(
    text, text, text, text, text, text, text, text,
    text[], smallint, smallint, text, numeric, text, text
  ),
  public.admin_publish_calculation_definition_v2(uuid, integer, text, text),
  public.admin_publish_calculation_alias_v2(text, text, text, text[], text[], text, text),
  public.admin_confirm_calculation_reprocess_v2(uuid, text, text),
  public.admin_revert_calculation_reprocess_v2(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.admin_save_equipment_calculation_v2(uuid, bigint, jsonb, text),
  public.admin_save_calculation_alias_draft_v2(text, text, text, text[], text[], text, text),
  public.admin_create_calculation_definition_draft_v2(
    text, text, text, text, text, text, text, text,
    text[], smallint, smallint, text, numeric, text, text
  ),
  public.admin_publish_calculation_definition_v2(uuid, integer, text, text),
  public.admin_publish_calculation_alias_v2(text, text, text, text[], text[], text, text),
  public.admin_confirm_calculation_reprocess_v2(uuid, text, text),
  public.admin_revert_calculation_reprocess_v2(uuid, text)
to authenticated;

comment on function public.admin_publish_calculation_alias_v2(
  text, text, text, text[], text[], text, text
) is
  'Publishes one exact catalog alias and creates an immutable reprocessing preview; it never mutates historical effects by itself.';

comment on function public.admin_confirm_calculation_reprocess_v2(uuid, text, text) is
  'Applies only a matching preview, audits the change and leaves active public snapshots untouched.';

comment on function public.admin_revert_calculation_reprocess_v2(uuid, text) is
  'Restores the exact pre-reprocessing semantic links when no later edit has changed them.';

commit;
