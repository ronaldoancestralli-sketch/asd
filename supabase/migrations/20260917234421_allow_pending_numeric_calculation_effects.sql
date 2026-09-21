-- Preserva observações numéricas sem vínculo para cálculo parcial.\n-- Um target nulo nunca é aplicado; os demais efeitos continuam calculáveis.\n\nbegin;

alter table public.equipment_calculation_effects_v2
  drop constraint equipment_calculation_effects_v2_check1;

alter table public.equipment_calculation_effects_v2
  add constraint equipment_calculation_effects_v2_check1
  check (
    (kind = 'numeric' and operation is not null)
    or (kind = 'informational' and target_stat_id is null and operation is null)
    or (kind = 'unresolved' and operation is null)
  );

comment on constraint equipment_calculation_effects_v2_check1
  on public.equipment_calculation_effects_v2 is
  'Numeric observations may remain without target while awaiting an exact status binding; they are never calculated until target_stat_id is set.';

CREATE OR REPLACE FUNCTION public.calculation_validate_effects_v2(p_effects jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_effect jsonb;
  v_value jsonb;
  v_key text;
  v_kind text;
  v_target text;
  v_source_kind text;
  v_source_reference text;
  v_rarities constant text[] := array[
    'comum', 'raro', 'epico', 'lendario', 'mitico', 'supremo',
    'grandioso', 'celestial', 'estelar', 'imortal', 'divino'
  ];
  v_fields constant text[] := array[
    'id', 'kind', 'description', 'target', 'operation', 'scope',
    'condition', 'conditionExpected', 'evaluatedOn', 'sourceKind',
    'sourceReference', 'order', 'values'
  ];
begin
  if jsonb_typeof(p_effects) is distinct from 'array'
    or jsonb_array_length(p_effects) > 100
    or octet_length(p_effects::text) > 1000000 then
    raise exception 'CALCULATION_INVALID_EFFECTS';
  end if;

  if (select count(distinct r.slug)
      from public.equipment_rarities r
      where r.slug = any(v_rarities)) <> 11 then
    raise exception 'CALCULATION_RARITY_CATALOG_INVALID';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_effects) x
    group by x->>'id' having count(*) > 1
  ) then
    raise exception 'CALCULATION_DUPLICATE_EFFECT_ID';
  end if;

  for v_effect in select value from jsonb_array_elements(p_effects) loop
    if jsonb_typeof(v_effect) is distinct from 'object'
      or not (v_effect ?& v_fields)
      or v_effect - v_fields <> '{}'::jsonb then
      raise exception 'CALCULATION_INVALID_EFFECT_FIELDS';
    end if;

    if jsonb_typeof(v_effect->'id') is distinct from 'string'
      or coalesce(v_effect->>'id', '') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
      raise exception 'CALCULATION_INVALID_EFFECT_ID';
    end if;

    if jsonb_typeof(v_effect->'kind') is distinct from 'string'
      or coalesce(v_effect->>'kind', '') <> all(array['numeric', 'informational', 'unresolved']) then
      raise exception 'CALCULATION_INVALID_EFFECT_KIND';
    end if;
    v_kind := v_effect->>'kind';

    if jsonb_typeof(v_effect->'description') is distinct from 'string'
      or coalesce(length(btrim(v_effect->>'description')), 0) not between 1 and 1000 then
      raise exception 'CALCULATION_INVALID_DESCRIPTION';
    end if;

    if jsonb_typeof(v_effect->'scope') is distinct from 'string'
      or coalesce(v_effect->>'scope', '') <> all(array['self', 'team'])
      or jsonb_typeof(v_effect->'evaluatedOn') is distinct from 'string'
      or coalesce(v_effect->>'evaluatedOn', '') <> all(array['source', 'recipient'])
      or (v_effect->>'scope' = 'self' and v_effect->>'evaluatedOn' <> 'source') then
      raise exception 'CALCULATION_INVALID_SCOPE';
    end if;

    if jsonb_typeof(v_effect->'condition') is distinct from 'string'
      or not exists (
        select 1 from public.calculation_conditions_v2 c
        where c.id = v_effect->>'condition' and c.enabled
      ) then
      raise exception 'CALCULATION_INVALID_CONDITION';
    end if;
    if (v_effect->>'condition' = 'always'
        and jsonb_typeof(v_effect->'conditionExpected') is distinct from 'null')
      or (v_effect->>'condition' <> 'always'
        and jsonb_typeof(v_effect->'conditionExpected') is distinct from 'boolean') then
      raise exception 'CALCULATION_INVALID_CONDITION_EXPECTED';
    end if;

    if jsonb_typeof(v_effect->'order') is distinct from 'number'
      or (v_effect->>'order')::numeric <> trunc((v_effect->>'order')::numeric)
      or (v_effect->>'order')::numeric not between 0 and 99 then
      raise exception 'CALCULATION_INVALID_EFFECT_ORDER';
    end if;

    if jsonb_typeof(v_effect->'target') not in ('null', 'string')
      or jsonb_typeof(v_effect->'operation') not in ('null', 'string') then
      raise exception 'CALCULATION_INVALID_NUMERIC_FIELDS';
    end if;
    v_target := v_effect->>'target';
    if v_kind = 'numeric' then
      if coalesce(v_effect->>'operation', '') <> all(array['flat', 'percent'])
        or (
          v_target is not null
          and (
            btrim(v_target) = ''
            or not exists (
              select 1 from public.calculation_stat_definitions_v2 d
              where d.id = v_target and d.enabled
            )
          )
        ) then
        raise exception 'CALCULATION_INVALID_NUMERIC_FIELDS';
      end if;
    elsif v_kind = 'informational' then
      if v_target is not null or jsonb_typeof(v_effect->'operation') is distinct from 'null' then
        raise exception 'CALCULATION_INFORMATIONAL_CANNOT_CALCULATE';
      end if;
    else
      if jsonb_typeof(v_effect->'operation') is distinct from 'null'
        or (v_target is not null and not exists (
          select 1 from public.calculation_stat_definitions_v2 d
          where d.id = v_target and d.enabled
        )) then
        raise exception 'CALCULATION_INVALID_UNRESOLVED_FIELDS';
      end if;
    end if;

    if jsonb_typeof(v_effect->'sourceKind') not in ('null', 'string')
      or jsonb_typeof(v_effect->'sourceReference') not in ('null', 'string') then
      raise exception 'CALCULATION_INVALID_SOURCE';
    end if;
    v_source_kind := v_effect->>'sourceKind';
    v_source_reference := v_effect->>'sourceReference';
    if (v_source_kind is null) <> (v_source_reference is null)
      or (v_source_kind is not null and v_source_kind <> all(array[
        'official', 'game_capture', 'developer_statement', 'admin_observation', 'other'
      ]))
      or (v_source_reference is not null
        and length(btrim(v_source_reference)) not between 3 and 1000) then
      raise exception 'CALCULATION_INVALID_SOURCE';
    end if;

    if jsonb_typeof(v_effect->'values') is distinct from 'object'
      or not ((v_effect->'values') ?& v_rarities)
      or (v_effect->'values') - v_rarities <> '{}'::jsonb then
      raise exception 'CALCULATION_INVALID_RARITY_VALUES';
    end if;

    foreach v_key in array v_rarities loop
      v_value := v_effect->'values'->v_key;
      if v_kind = 'numeric' then
        if jsonb_typeof(v_value) not in ('number', 'null') then
          raise exception 'CALCULATION_INVALID_RARITY_VALUE:%', v_key;
        end if;
        if jsonb_typeof(v_value) = 'number'
          and abs(v_value::text::numeric) > 1e308::numeric then
          raise exception 'CALCULATION_INVALID_RARITY_VALUE:%', v_key;
        end if;
      elsif jsonb_typeof(v_value) is distinct from 'null' then
        raise exception 'CALCULATION_NON_NUMERIC_VALUE_FORBIDDEN:%', v_key;
      end if;
    end loop;
  end loop;

  if exists (
    select 1 from jsonb_array_elements(p_effects) x
    group by (x->>'order')::numeric having count(*) > 1
  ) then
    raise exception 'CALCULATION_DUPLICATE_EFFECT_ORDER';
  end if;
end;
$function$;

do $$
declare
  v_values jsonb := jsonb_build_object(
    'comum', -25, 'raro', -28, 'epico', -28, 'lendario', -31,
    'mitico', -31, 'supremo', -34, 'grandioso', -34, 'celestial', -37,
    'estelar', -37, 'imortal', -38, 'divino', -38
  );
begin
  perform public.calculation_validate_effects_v2(jsonb_build_array(jsonb_build_object(
    'id', '00000000-0000-4000-8000-000000000038',
    'kind', 'numeric',
    'description', 'AO RECUO DA ARMA DO HERÓI',
    'target', null,
    'operation', 'percent',
    'scope', 'self',
    'condition', 'always',
    'conditionExpected', null,
    'evaluatedOn', 'source',
    'sourceKind', 'game_capture',
    'sourceReference', 'game-capture:pending-recoil-regression',
    'order', 0,
    'values', v_values
  )));
end;
$$;

commit;
