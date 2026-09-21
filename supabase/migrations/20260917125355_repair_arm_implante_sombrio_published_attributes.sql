-- EchoArena: usa a publicação ativa do Cálculo V2 como fonte única para os
-- atributos do A.R.M. Implante Sombrio e remove dois resíduos impossíveis de OCR.
-- Migration aplicada no Supabase: 20260917125355.

set lock_timeout = '10s';
set statement_timeout = '120s';

select pg_advisory_xact_lock(
  hashtextextended('echoarena:repair-arm-implante-sombrio-published-attributes:v1', 0)
);

-- O editor exige sessão de Admin nos guards de escopo. A migration roda como
-- proprietário do banco, por isso bloqueia escrita concorrente e suspende
-- somente esses guards durante a correção. Os demais gatilhos permanecem ativos.
lock table public.equipment_variants, public.equipment_audit_queue
  in access exclusive mode;

alter table public.equipment_variants
  disable trigger trg_echo_scope_equipment_variants;
alter table public.equipment_audit_queue
  disable trigger trg_echo_scope_equipment_audit_queue;

do $repair_arm_implante_sombrio$
declare
  v_equipment_id uuid;
  v_snapshot jsonb;
  v_effect_count integer;
  v_exact_effect_count integer;
  v_exact_value_count integer;
  v_variant_count integer;
  v_attribute_count integer;
begin
  select e.id, p.snapshot
  into strict v_equipment_id, v_snapshot
  from public.equipments e
  join public.equipment_calculation_publication_heads_v2 h
    on h.equipment_id = e.id
  join public.equipment_calculation_publications_v2 p
    on p.id = h.publication_id
  where e.slug = 'a-r-m-implante-sombrio'
  for update of e, h, p;

  if v_snapshot->>'contract' <> 'echo-equipment-calculation/v2'
    or v_snapshot->>'equipmentId' <> v_equipment_id::text
    or jsonb_typeof(v_snapshot->'effects') <> 'array'
  then
    raise exception 'ARM_PUBLISHED_SNAPSHOT_INVALID';
  end if;

  select count(*)
  into v_effect_count
  from jsonb_array_elements(v_snapshot->'effects') effect;

  select count(*)
  into v_exact_effect_count
  from jsonb_array_elements(v_snapshot->'effects') effect
  join (values
    (
      'AO ALCANCE DO TIRO COM MIRA DO HERÓI'::text,
      'weapon.aimed_range'::text,
      'flat'::text
    ),
    (
      'AO TAMANHO DO CARREGADOR DA ARMA DO HERÓI'::text,
      'weapon.magazine'::text,
      'flat'::text
    )
  ) expected(description, target, operation)
    on expected.description = effect->>'description'
   and expected.target = effect->>'target'
   and expected.operation = effect->>'operation'
  where effect->>'kind' = 'numeric'
    and jsonb_typeof(effect->'values') = 'object';

  if v_effect_count <> 2 or v_exact_effect_count <> 2 then
    raise exception
      'ARM_PUBLISHED_EFFECTS_UNEXPECTED:effects=%,exact=%',
      v_effect_count, v_exact_effect_count;
  end if;

  select count(*)
  into v_exact_value_count
  from jsonb_array_elements(v_snapshot->'effects') effect
  join (values
    ('AO ALCANCE DO TIRO COM MIRA DO HERÓI'::text, 'comum'::text, 10::numeric),
    ('AO ALCANCE DO TIRO COM MIRA DO HERÓI', 'raro', 12),
    ('AO ALCANCE DO TIRO COM MIRA DO HERÓI', 'epico', 14),
    ('AO ALCANCE DO TIRO COM MIRA DO HERÓI', 'lendario', 16),
    ('AO ALCANCE DO TIRO COM MIRA DO HERÓI', 'mitico', 18),
    ('AO ALCANCE DO TIRO COM MIRA DO HERÓI', 'supremo', 20),
    ('AO ALCANCE DO TIRO COM MIRA DO HERÓI', 'grandioso', 22),
    ('AO ALCANCE DO TIRO COM MIRA DO HERÓI', 'celestial', 23),
    ('AO ALCANCE DO TIRO COM MIRA DO HERÓI', 'estelar', 24),
    ('AO ALCANCE DO TIRO COM MIRA DO HERÓI', 'imortal', 25),
    ('AO ALCANCE DO TIRO COM MIRA DO HERÓI', 'divino', 25),
    ('AO TAMANHO DO CARREGADOR DA ARMA DO HERÓI', 'comum', 1),
    ('AO TAMANHO DO CARREGADOR DA ARMA DO HERÓI', 'raro', 2),
    ('AO TAMANHO DO CARREGADOR DA ARMA DO HERÓI', 'epico', 3),
    ('AO TAMANHO DO CARREGADOR DA ARMA DO HERÓI', 'lendario', 4),
    ('AO TAMANHO DO CARREGADOR DA ARMA DO HERÓI', 'mitico', 5),
    ('AO TAMANHO DO CARREGADOR DA ARMA DO HERÓI', 'supremo', 5),
    ('AO TAMANHO DO CARREGADOR DA ARMA DO HERÓI', 'grandioso', 5),
    ('AO TAMANHO DO CARREGADOR DA ARMA DO HERÓI', 'celestial', 5),
    ('AO TAMANHO DO CARREGADOR DA ARMA DO HERÓI', 'estelar', 6),
    ('AO TAMANHO DO CARREGADOR DA ARMA DO HERÓI', 'imortal', 6),
    ('AO TAMANHO DO CARREGADOR DA ARMA DO HERÓI', 'divino', 7)
  ) expected(description, rarity_slug, value)
    on expected.description = effect->>'description'
   and jsonb_typeof(effect->'values'->expected.rarity_slug) = 'number'
   and (effect->'values'->>expected.rarity_slug)::numeric = expected.value;

  if v_exact_value_count <> 22 or exists (
    select 1
    from jsonb_array_elements(v_snapshot->'effects') effect
    where (
      select count(*)
      from jsonb_object_keys(effect->'values')
    ) <> 11
  ) then
    raise exception 'ARM_PUBLISHED_VALUES_UNEXPECTED:exact=%', v_exact_value_count;
  end if;

  select count(*), coalesce(sum(jsonb_array_length(v.attributes)), 0)
  into v_variant_count, v_attribute_count
  from public.equipment_variants v
  join public.equipment_rarities r on r.id = v.rarity_id
  where v.equipment_id = v_equipment_id
    and r.slug = any(array[
      'comum', 'raro', 'epico', 'lendario', 'mitico', 'supremo',
      'grandioso', 'celestial', 'estelar', 'imortal', 'divino'
    ]::text[]);

  if v_variant_count <> 11 then
    raise exception 'ARM_VARIANTS_INCOMPLETE:%', v_variant_count;
  end if;

  with rebuilt as (
    select
      v.id,
      jsonb_agg(
        jsonb_build_object(
          'raw', concat(
            '+', effect->'values'->>r.slug, ' ', effect->>'description'
          ),
          'unit', null,
          'label', effect->>'description',
          'value', effect->'values'->>r.slug,
          'operator', 'increase_flat',
          'confidence', 1
        )
        order by (effect->>'order')::integer, effect->>'description'
      ) as attributes
    from public.equipment_variants v
    join public.equipment_rarities r on r.id = v.rarity_id
    cross join lateral jsonb_array_elements(v_snapshot->'effects') effect
    where v.equipment_id = v_equipment_id
      and r.slug = any(array[
        'comum', 'raro', 'epico', 'lendario', 'mitico', 'supremo',
        'grandioso', 'celestial', 'estelar', 'imortal', 'divino'
      ]::text[])
    group by v.id
  )
  update public.equipment_variants v
  set attributes = rebuilt.attributes,
      updated_at = now()
  from rebuilt
  where v.id = rebuilt.id
    and v.attributes is distinct from rebuilt.attributes;

  -- Esta fila nasceu exclusivamente do texto impossível "EI FOTLA". Ela não
  -- representa uma pendência histórica real e não deve reaparecer na Auditoria.
  delete from public.equipment_audit_queue q
  where q.equipment_id::text = v_equipment_id::text
    and q.issue_type = 'unknown_attribute'
    and (
      q.attribute_key in (
        'EI FOTLA',
        'O AO ALCANCE DO TIRO COM MIRA DO HERÓI'
      )
      or q.issue_key in (
        'unknown_attribute|grandioso|ei_fotla',
        'unknown_attribute|supremo|o_ao_alcance_do_tiro_com_mira_do_heroi'
      )
    );

  select count(*), coalesce(sum(jsonb_array_length(v.attributes)), 0)
  into v_variant_count, v_attribute_count
  from public.equipment_variants v
  join public.equipment_rarities r on r.id = v.rarity_id
  where v.equipment_id = v_equipment_id
    and r.slug = any(array[
      'comum', 'raro', 'epico', 'lendario', 'mitico', 'supremo',
      'grandioso', 'celestial', 'estelar', 'imortal', 'divino'
    ]::text[]);

  if v_variant_count <> 11 or v_attribute_count <> 22 then
    raise exception
      'ARM_REPAIR_CARDINALITY_FAILED:variants=%,attributes=%',
      v_variant_count, v_attribute_count;
  end if;

  if exists (
    select 1
    from public.equipment_variants v
    cross join lateral jsonb_array_elements(v.attributes) attribute
    where v.equipment_id = v_equipment_id
      and (
        upper(coalesce(attribute->>'label', '')) = 'EI FOTLA'
        or upper(coalesce(attribute->>'label', '')) =
          'O AO ALCANCE DO TIRO COM MIRA DO HERÓI'
        or upper(coalesce(attribute->>'raw', '')) like '%EI FOTLA%'
        or upper(coalesce(attribute->>'raw', '')) like '+2O AO ALCANCE%'
      )
  ) then
    raise exception 'ARM_OCR_GARBAGE_REMAINS';
  end if;

  if exists (
    select 1
    from public.equipment_variants v
    join public.equipment_rarities r on r.id = v.rarity_id
    cross join lateral jsonb_array_elements(v.attributes) attribute
    where v.equipment_id = v_equipment_id
      and not exists (
        select 1
        from jsonb_array_elements(v_snapshot->'effects') effect
        where effect->>'description' = attribute->>'label'
          and attribute->>'operator' = 'increase_flat'
          and attribute->>'value' = effect->'values'->>r.slug
      )
  ) then
    raise exception 'ARM_VARIANTS_DIVERGE_FROM_PUBLICATION';
  end if;

  if exists (
    select 1
    from public.equipment_audit_queue q
    where q.equipment_id::text = v_equipment_id::text
      and (
        upper(coalesce(q.attribute_key, '')) = 'EI FOTLA'
        or upper(coalesce(q.attribute_key, '')) =
          'O AO ALCANCE DO TIRO COM MIRA DO HERÓI'
      )
  ) then
    raise exception 'ARM_FALSE_AUDIT_ENTRY_REMAINS';
  end if;
end
$repair_arm_implante_sombrio$;

alter table public.equipment_audit_queue
  enable trigger trg_echo_scope_equipment_audit_queue;
alter table public.equipment_variants
  enable trigger trg_echo_scope_equipment_variants;
