-- EchoArena: restaura os vínculos canônicos de status e corrige o Slayer.
-- Evidências do Slayer (capturas fornecidas em 2026-09-17):
-- IMG_1304.jpeg sha256:8adfedf53427f16d98937c434ad7f9b9be8e5dd2706fa2a88d0a2bcacfba6fe1
-- IMG_1305.jpeg sha256:0cee35cdba9471be8d215924bf4565558e772d65f222adaf84542fafc2f8841d
-- IMG_1306.jpeg sha256:e58c0e28b77e9b618699aa2a4c0b0835fc80ca4c50a8c38b8ad2b92b63bb679c

set lock_timeout = '10s';
set statement_timeout = '120s';

select pg_advisory_xact_lock(hashtextextended('echoarena:restore-status-bindings-and-slayer:v1', 0));

-- O contrato geral passa a preservar todos os campos distintos comprovados
-- nas telas, inclusive os seis índices-resumo da arma. Valores duplicados de
-- apresentação (Dano/Valor de armadura) continuam apontando para as chaves
-- mecânicas já existentes e não criam estatísticas paralelas.
insert into public.stat_definitions (
  key, name, category, unit, value_type, decimals,
  higher_is_better, description, display_order, enabled
)
values
  ('movement_noise_radius', 'Raio máximo do barulho de movimentação', 'utility', '', 'number', 0, false,
    'Raio máximo em que a movimentação do herói pode ser ouvida.', 60, true),
  ('aimed_movement_speed', 'Velocidade de movimento ao mirar', 'hero', '', 'number', 0, true,
    'Velocidade máxima de movimentação enquanto o herói está mirando.', 70, true),
  ('penetration_resistance', 'Resistência à perfuração', 'defense', '', 'number', 0, true,
    'Resistência do herói à perfuração.', 80, true),
  ('armor_resistance', 'Resistência de armadura', 'defense', '', 'number', 0, true,
    'Resistência própria da armadura do herói.', 90, true),
  ('weapon_firepower_score', 'Poder de fogo (índice)', 'weapon', '', 'integer', 0, true,
    'Índice-resumo de poder de fogo exibido na tela da arma; não substitui o dano por tiro.', 91, true),
  ('armor_break_score', 'Quebra de armadura (índice)', 'weapon', '', 'integer', 0, true,
    'Índice-resumo de quebra de armadura exibido na tela da arma.', 92, true),
  ('fire_rate_score', 'Cadência de tiro (índice)', 'weapon', '', 'integer', 0, true,
    'Índice-resumo de cadência exibido na tela da arma; não substitui tiros por segundo.', 93, true),
  ('magazine_capacity_score', 'Capacidade de munição (índice)', 'weapon', '', 'integer', 0, true,
    'Índice-resumo de capacidade exibido na tela da arma; não substitui o tamanho real do pente.', 94, true),
  ('effective_range_score', 'Alcance efetivo (índice)', 'weapon', '', 'integer', 0, true,
    'Índice-resumo de alcance efetivo exibido na tela da arma; não substitui os alcances mecânicos.', 95, true),
  ('aiming_stability_score', 'Estabilidade de mira (índice)', 'weapon', '', 'integer', 0, true,
    'Índice-resumo de estabilidade de mira exibido na tela da arma.', 96, true)
on conflict (key) do nothing;

do $verify_general_catalog$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.stat_definitions
  where key = any(array[
    'movement_noise_radius', 'aimed_movement_speed',
    'penetration_resistance', 'armor_resistance',
    'weapon_firepower_score', 'armor_break_score', 'fire_rate_score',
    'magazine_capacity_score', 'effective_range_score', 'aiming_stability_score'
  ]::text[])
    and enabled;

  if v_count <> 10 then
    raise exception 'STATUS_GENERAL_CATALOG_INCOMPLETE:%', v_count;
  end if;
end
$verify_general_catalog$;

-- Completa o catálogo de cálculo V2 sem alterar definições já publicadas.
-- Oito chaves já existiam no registro geral e quatro vêm dos parâmetros
-- heroicos comprovados nas capturas.
insert into public.calculation_stat_definitions_v2 (
  id, label, scope, source_key, unit, direction,
  policy_id, policy_reference, display_order, enabled
)
values
  ('hero.movement_noise_radius', 'Raio do barulho de movimentação', 'hero', 'movement_noise_radius', 'noise_unit', 'lower',
    'additive-base-v1', 'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no núcleo.', 60, true),
  ('hero.aimed_movement_speed', 'Velocidade de movimento ao mirar', 'hero', 'aimed_movement_speed', 'game_value', 'higher',
    'additive-base-v1', 'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no núcleo.', 70, true),
  ('hero.penetration_resistance', 'Resistência à perfuração', 'hero', 'penetration_resistance', 'game_value', 'higher',
    'additive-base-v1', 'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no núcleo.', 80, true),
  ('hero.armor_resistance', 'Resistência de armadura', 'hero', 'armor_resistance', 'game_value', 'higher',
    'additive-base-v1', 'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no núcleo.', 90, true),
  ('weapon.life_damage_multiplier', 'Modificador de dano contra vida', 'weapon', 'life_damage_multiplier', 'multiplier', 'higher',
    'additive-base-v1', 'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no núcleo.', 220, true),
  ('weapon.armor_damage_multiplier', 'Modificador de dano contra armadura e drones', 'weapon', 'armor_damage_multiplier', 'multiplier', 'higher',
    'additive-base-v1', 'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no núcleo.', 230, true),
  ('weapon.aimed_range', 'Alcance da arma ao mirar', 'weapon', 'aimed_weapon_range', 'game_value', 'higher',
    'additive-base-v1', 'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no núcleo.', 240, true),
  ('weapon.aimed_spread', 'Dispersão da arma ao mirar', 'weapon', 'aimed_spread', 'game_value', 'lower',
    'additive-base-v1', 'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no núcleo.', 250, true),
  ('hero.special_ability_cooldown', 'Recarga da habilidade especial', 'hero', 'special_ability_cooldown', 'second', 'lower',
    'additive-base-v1', 'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no núcleo.', 300, true),
  ('hero.box_open_time', 'Tempo de abertura da caixa', 'hero', 'box_open_time', 'second', 'lower',
    'additive-base-v1', 'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no núcleo.', 310, true),
  ('weapon.damage_to_health_percent', 'Dano da arma contra vida', 'weapon', 'weapon_damage_to_health_percent', 'percent', 'higher',
    'additive-base-v1', 'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no núcleo.', 320, true),
  ('weapon.damage_to_armor_percent', 'Dano da arma contra armadura', 'weapon', 'weapon_damage_to_armor_percent', 'percent', 'higher',
    'additive-base-v1', 'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no núcleo.', 330, true)
on conflict (id) do nothing;

do $verify_v2_catalog$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.calculation_stat_definitions_v2 d
  join (values
    ('hero.movement_noise_radius', 'hero', 'movement_noise_radius'),
    ('hero.aimed_movement_speed', 'hero', 'aimed_movement_speed'),
    ('hero.penetration_resistance', 'hero', 'penetration_resistance'),
    ('hero.armor_resistance', 'hero', 'armor_resistance'),
    ('weapon.life_damage_multiplier', 'weapon', 'life_damage_multiplier'),
    ('weapon.armor_damage_multiplier', 'weapon', 'armor_damage_multiplier'),
    ('weapon.aimed_range', 'weapon', 'aimed_weapon_range'),
    ('weapon.aimed_spread', 'weapon', 'aimed_spread'),
    ('hero.special_ability_cooldown', 'hero', 'special_ability_cooldown'),
    ('hero.box_open_time', 'hero', 'box_open_time'),
    ('weapon.damage_to_health_percent', 'weapon', 'weapon_damage_to_health_percent'),
    ('weapon.damage_to_armor_percent', 'weapon', 'weapon_damage_to_armor_percent')
  ) expected(id, scope, source_key)
    on expected.id = d.id
   and expected.scope = d.scope
   and expected.source_key = d.source_key
  where d.enabled;

  if v_count <> 12 then
    raise exception 'CALCULATION_V2_CATALOG_INCOMPLETE:%', v_count;
  end if;
end
$verify_v2_catalog$;

-- Os gatilhos de escopo exigem uma sessão de Admin. A migration roda como
-- proprietário do banco, portanto bloqueia escrita concorrente e suspende
-- somente os dois guards durante a correção; os gatilhos de updated_at e do
-- Echo Brain permanecem ativos. Qualquer falha reverte também o DISABLE.
lock table public.hero_base_stats, public.hero_weapon_stats
  in access exclusive mode;

alter table public.hero_base_stats
  disable trigger trg_echo_scope_hero_base_stats;
alter table public.hero_weapon_stats
  disable trigger trg_echo_scope_hero_weapon_stats;

do $repair_slayer$
declare
  v_hero_id uuid;
  v_version integer;
  v_actor uuid;
  v_snapshot jsonb;
begin
  select h.id into strict v_hero_id
  from public.heroes h
  where h.slug = 'slayer'
  for update;

  select v.created_by into v_actor
  from public.admin_content_versions v
  where v.entity_type = 'hero'
    and v.entity_id = v_hero_id
  order by v.version desc, v.created_at desc
  limit 1;

  select jsonb_build_object(
    'hero', to_jsonb(h),
    'base_stats', coalesce((
      select jsonb_object_agg(s.stat_key, s.value order by s.stat_key)
      from public.hero_base_stats s where s.hero_id = h.id
    ), '{}'::jsonb),
    'weapon_name', (
      select s.weapon_name
      from public.hero_weapon_stats s
      where s.hero_id = h.id
      order by s.updated_at desc nulls last, s.created_at desc nulls last
      limit 1
    ),
    'weapon_stats', coalesce((
      select jsonb_object_agg(s.stat_key, s.value order by s.stat_key)
      from public.hero_weapon_stats s where s.hero_id = h.id
    ), '{}'::jsonb)
  ) into v_snapshot
  from public.heroes h
  where h.id = v_hero_id;

  select coalesce(max(v.version), 0) + 1 into v_version
  from public.admin_content_versions v
  where v.entity_type = 'hero' and v.entity_id = v_hero_id;

  insert into public.admin_content_versions (
    entity_type, entity_id, version, snapshot, source, created_by
  ) values (
    'hero', v_hero_id, v_version, v_snapshot,
    'migration-slayer-ocr-verified-20260917', v_actor
  );

  insert into public.hero_base_stats (hero_id, stat_key, value, updated_at)
  values
    (v_hero_id, 'power', 2096, now()),
    (v_hero_id, 'health', 811, now()),
    (v_hero_id, 'armor', 811, now()),
    (v_hero_id, 'vision_range', 600, now()),
    (v_hero_id, 'movement_speed', 171, now()),
    (v_hero_id, 'movement_noise_radius', 300, now()),
    (v_hero_id, 'aimed_movement_speed', 51, now()),
    (v_hero_id, 'penetration_resistance', 4, now()),
    (v_hero_id, 'armor_resistance', 6, now())
  on conflict (hero_id, stat_key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at;

  insert into public.hero_weapon_stats (
    hero_id, weapon_name, stat_key, value, updated_at
  )
  values
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'weapon_firepower_score', 1518, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'armor_break_score', 1981, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'fire_rate_score', 183, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'magazine_capacity_score', 38, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'effective_range_score', 1500, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'aiming_stability_score', 374, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'weapon_damage', 2555, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'life_damage_multiplier', 1, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'weapon_armor_penetration', 85, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'armor_penetration_power', 22, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'armor_damage_multiplier', 2, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'fire_rate', 0.3, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'reload_time', 5, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'magazine_size', 5, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'weapon_range', 430, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'aimed_weapon_range', 430, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'weapon_spread', 50, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'moving_spread_modifier', 5, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'aimed_spread', 5, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'aim_time', 1.7, now()),
    (v_hero_id, 'RIFLE DE PRECISÃO DE SLAYER', 'spread_factor', 1.3, now())
  on conflict (hero_id, stat_key) do update
    set weapon_name = excluded.weapon_name,
        value = excluded.value,
        updated_at = excluded.updated_at;

  -- 183 é o índice-resumo de cadência. O valor mecânico observado é
  -- fire_rate=0.3; nenhum intervalo é inferido a partir dele.
  delete from public.hero_weapon_stats
  where hero_id = v_hero_id and stat_key = 'fire_interval';
end
$repair_slayer$;

alter table public.hero_weapon_stats
  enable trigger trg_echo_scope_hero_weapon_stats;
alter table public.hero_base_stats
  enable trigger trg_echo_scope_hero_base_stats;

-- Normaliza somente as grafias equivalentes já persistidas para a Boina.
-- O valor e o operador originais são preservados semanticamente.
lock table public.equipment_variants in access exclusive mode;
alter table public.equipment_variants
  disable trigger trg_echo_scope_equipment_variants;

update public.equipment_variants v
set attributes = normalized.attributes,
    updated_at = now()
from (
  select
    source.id,
    jsonb_agg(
      case
        when lower(attribute.item->>'label') like '%barulho%corrida%'
          then jsonb_set(
            jsonb_set(
              attribute.item,
              '{label}',
              to_jsonb('AO BARULHO DA CORRIDA DO HERÓI'::text),
              true
            ),
            '{operator}',
            to_jsonb('decrease_percent'::text),
            true
          )
        else attribute.item
      end
      order by attribute.ordinality
    ) as attributes
  from public.equipment_variants source
  join public.equipments e on e.id = source.equipment_id
  cross join lateral jsonb_array_elements(source.attributes)
    with ordinality as attribute(item, ordinality)
  where e.slug = 'boina-do-comandante'
  group by source.id
) normalized
where v.id = normalized.id
  and v.attributes is distinct from normalized.attributes;

alter table public.equipment_variants
  enable trigger trg_echo_scope_equipment_variants;

-- Cria o vínculo calculável da Boina e corrige dois efeitos existentes que
-- diziam explicitamente "com mira", mas apontavam para o alcance sem mira.
do $repair_calculation_v2$
declare
  v_reason constant text := 'migration-status-binding-v1';
  v_equipment_id uuid;
  v_boina_id uuid;
  v_effect_id uuid;
  v_actor uuid;
  v_source_version bigint;
  v_effect_count integer;
  v_row_count integer;
  v_rarity_count integer;
  v_numeric_count integer;
  v_admin_effects jsonb;
  v_public_effects jsonb;
  v_snapshot jsonb;
  v_fingerprint text;
  v_publication_id bigint;
  v_workspace record;
begin
  for v_equipment_id in
    select distinct fx.equipment_id
    from public.equipment_calculation_effects_v2 fx
    where fx.description = 'AO ALCANCE DO TIRO COM MIRA DO HERÓI'
      and fx.target_stat_id = 'weapon.range'
    order by fx.equipment_id
  loop
    update public.equipment_calculation_effects_v2
    set target_stat_id = 'weapon.aimed_range',
        updated_at = now()
    where equipment_id = v_equipment_id
      and description = 'AO ALCANCE DO TIRO COM MIRA DO HERÓI'
      and target_stat_id = 'weapon.range';

    update public.equipment_calculation_workspaces_v2
    set revision = revision + 1,
        workflow_status = 'draft',
        last_reason = v_reason,
        updated_at = now()
    where equipment_id = v_equipment_id;

    if not found then
      raise exception 'AIMED_RANGE_WORKSPACE_MISSING:%', v_equipment_id;
    end if;
  end loop;

  select e.id into strict v_boina_id
  from public.equipments e
  where e.slug = 'boina-do-comandante'
  for update;

  select b.id, b.created_by
  into v_source_version, v_actor
  from public.equipment_brain_versions b
  where b.equipment_id = v_boina_id::text
    and b.created_by is not null
  order by b.version desc, b.created_at desc
  limit 1;

  if v_source_version is null or v_actor is null then
    raise exception 'BOINA_SOURCE_PROVENANCE_MISSING';
  end if;

  select
    count(*),
    count(distinct extracted.rarity_slug),
    count(*) filter (
      where extracted.value_text ~ '^-?[0-9]+([.][0-9]+)?$'
    )
  into v_row_count, v_rarity_count, v_numeric_count
  from (
    select
      v.id,
      r.slug as rarity_slug,
      (
        select attribute->>'value'
        from jsonb_array_elements(v.attributes) attribute
        where lower(attribute->>'label') like '%barulho%corrida%'
        limit 1
      ) as value_text
    from public.equipment_variants v
    join public.equipment_rarities r on r.id = v.rarity_id
    where v.equipment_id = v_boina_id
      and r.slug = any(array[
        'comum', 'raro', 'epico', 'lendario', 'mitico', 'supremo',
        'grandioso', 'celestial', 'estelar', 'imortal', 'divino'
      ]::text[])
  ) extracted;

  if v_row_count <> 11 or v_rarity_count <> 11 or v_numeric_count <> 11 then
    raise exception 'BOINA_RARITY_VALUES_INVALID:rows=%,rarities=%,numeric=%',
      v_row_count, v_rarity_count, v_numeric_count;
  end if;

  insert into public.equipment_calculation_workspaces_v2 (
    equipment_id, revision, workflow_status, last_reason, updated_by
  ) values (
    v_boina_id, 0, 'draft', v_reason, v_actor
  ) on conflict (equipment_id) do nothing;

  select count(*), min(fx.id::text)::uuid
  into v_effect_count, v_effect_id
  from public.equipment_calculation_effects_v2 fx
  where fx.equipment_id = v_boina_id;

  if v_effect_count > 1 then
    raise exception 'BOINA_UNEXPECTED_EFFECT_COUNT:%', v_effect_count;
  elsif v_effect_count = 0 then
    v_effect_id := gen_random_uuid();
    insert into public.equipment_calculation_effects_v2 (
      id, equipment_id, kind, description, target_stat_id, operation,
      scope, condition_id, condition_expected, evaluated_on,
      source_kind, source_reference, display_order
    ) values (
      v_effect_id,
      v_boina_id,
      'numeric',
      'AO BARULHO DA CORRIDA DO HERÓI',
      'hero.movement_noise_radius',
      'percent',
      'self',
      'always',
      null,
      'source',
      'admin_observation',
      format('equipment-brain-version:%s', v_source_version),
      0
    );
  else
    update public.equipment_calculation_effects_v2
    set kind = 'numeric',
        description = 'AO BARULHO DA CORRIDA DO HERÓI',
        target_stat_id = 'hero.movement_noise_radius',
        operation = 'percent',
        scope = 'self',
        condition_id = 'always',
        condition_expected = null,
        evaluated_on = 'source',
        source_kind = 'admin_observation',
        source_reference = format('equipment-brain-version:%s', v_source_version),
        display_order = 0,
        updated_at = now()
    where id = v_effect_id;
  end if;

  delete from public.equipment_calculation_rarity_values_v2
  where effect_id = v_effect_id;

  insert into public.equipment_calculation_rarity_values_v2 (
    effect_id, rarity_id, value
  )
  select
    v_effect_id,
    v.rarity_id,
    (
      select (attribute->>'value')::numeric
      from jsonb_array_elements(v.attributes) attribute
      where lower(attribute->>'label') like '%barulho%corrida%'
      limit 1
    )
  from public.equipment_variants v
  join public.equipment_rarities r on r.id = v.rarity_id
  where v.equipment_id = v_boina_id
    and r.slug = any(array[
      'comum', 'raro', 'epico', 'lendario', 'mitico', 'supremo',
      'grandioso', 'celestial', 'estelar', 'imortal', 'divino'
    ]::text[]);

  update public.equipment_calculation_workspaces_v2
  set revision = revision + 1,
      workflow_status = 'draft',
      last_reason = v_reason,
      updated_by = v_actor,
      updated_at = now()
  where equipment_id = v_boina_id;

  -- Publicações anteriores permanecem imutáveis. Cada workspace alterado
  -- recebe uma nova publicação e o head passa a apontar para ela.
  for v_workspace in
    select w.equipment_id, w.revision, w.updated_by
    from public.equipment_calculation_workspaces_v2 w
    where w.last_reason = v_reason
      and not exists (
        select 1
        from public.equipment_calculation_publications_v2 p
        where p.equipment_id = w.equipment_id
          and p.workspace_revision = w.revision
      )
    order by w.equipment_id
  loop
    if v_workspace.updated_by is null then
      raise exception 'CALCULATION_PUBLICATION_ACTOR_MISSING:%', v_workspace.equipment_id;
    end if;

    v_admin_effects := public.calculation_workspace_effects_json_v2(
      v_workspace.equipment_id
    );

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', effect->>'id',
      'kind', effect->>'kind',
      'description', effect->>'description',
      'target', effect->'target',
      'operation', effect->'operation',
      'scope', effect->>'scope',
      'condition', effect->>'condition',
      'conditionExpected', effect->'conditionExpected',
      'evaluatedOn', effect->>'evaluatedOn',
      'source', case
        when jsonb_typeof(effect->'sourceKind') = 'string'
          then jsonb_build_object(
            'kind', effect->>'sourceKind',
            'reference', effect->>'sourceReference'
          )
        else null
      end,
      'order', (effect->>'order')::integer,
      'values', effect->'values'
    ) order by (effect->>'order')::integer, effect->>'id'), '[]'::jsonb)
    into v_public_effects
    from jsonb_array_elements(v_admin_effects) effect;

    v_snapshot := jsonb_build_object(
      'contract', 'echo-equipment-calculation/v2',
      'equipmentId', v_workspace.equipment_id,
      'workspaceRevision', v_workspace.revision,
      'effects', v_public_effects
    );
    v_fingerprint := public.calculation_hash_v2(v_snapshot);

    insert into public.equipment_calculation_publications_v2 (
      equipment_id, workspace_revision, snapshot, fingerprint,
      reason, created_by
    ) values (
      v_workspace.equipment_id,
      v_workspace.revision,
      v_snapshot,
      v_fingerprint,
      v_reason,
      v_workspace.updated_by
    ) returning id into v_publication_id;

    insert into public.equipment_calculation_publication_heads_v2 (
      equipment_id, publication_id, updated_at
    ) values (
      v_workspace.equipment_id, v_publication_id, now()
    )
    on conflict (equipment_id) do update
      set publication_id = excluded.publication_id,
          updated_at = excluded.updated_at;

    update public.equipment_calculation_workspaces_v2
    set workflow_status = 'published',
        updated_at = now()
    where equipment_id = v_workspace.equipment_id;
  end loop;
end
$repair_calculation_v2$;

-- As entradas históricas de unknown_attribute permanecem intactas. Fechá-las
-- exigiria personificar uma sessão administrativa para atravessar a cadeia de
-- auditoria; o vínculo publicado abaixo já é a nova fonte de verdade.

-- Pós-condições: a migration falha inteira se qualquer vínculo ficar parcial.
do $verify_repair$
declare
  v_slayer_id uuid;
  v_boina_id uuid;
  v_value_count integer;
begin
  select id into strict v_slayer_id
  from public.heroes where slug = 'slayer';
  select id into strict v_boina_id
  from public.equipments where slug = 'boina-do-comandante';

  if not exists (
    select 1 from public.hero_base_stats
    where hero_id = v_slayer_id and stat_key = 'movement_speed' and value = 171
  ) or not exists (
    select 1 from public.hero_base_stats
    where hero_id = v_slayer_id and stat_key = 'aimed_movement_speed' and value = 51
  ) or not exists (
    select 1 from public.hero_base_stats
    where hero_id = v_slayer_id and stat_key = 'movement_noise_radius' and value = 300
  ) or not exists (
    select 1 from public.hero_base_stats
    where hero_id = v_slayer_id and stat_key = 'penetration_resistance' and value = 4
  ) or not exists (
    select 1 from public.hero_base_stats
    where hero_id = v_slayer_id and stat_key = 'armor_resistance' and value = 6
  ) then
    raise exception 'SLAYER_BASE_STATS_POSTCONDITION_FAILED';
  end if;

  if exists (
    select 1 from public.hero_weapon_stats
    where hero_id = v_slayer_id and stat_key = 'fire_interval'
  ) or not exists (
    select 1 from public.hero_weapon_stats
    where hero_id = v_slayer_id and stat_key = 'fire_rate_score' and value = 183
  ) or not exists (
    select 1 from public.hero_weapon_stats
    where hero_id = v_slayer_id and stat_key = 'fire_rate' and value = 0.3
  ) or not exists (
    select 1 from public.hero_weapon_stats
    where hero_id = v_slayer_id and stat_key = 'weapon_range' and value = 430
  ) or not exists (
    select 1 from public.hero_weapon_stats
    where hero_id = v_slayer_id and stat_key = 'aimed_weapon_range' and value = 430
  ) then
    raise exception 'SLAYER_WEAPON_STATS_POSTCONDITION_FAILED';
  end if;

  select count(*) into v_value_count
  from public.equipment_calculation_publication_heads_v2 h
  join public.equipment_calculation_publications_v2 p
    on p.id = h.publication_id
  cross join lateral jsonb_array_elements(p.snapshot->'effects') effect
  cross join lateral jsonb_each(effect->'values') rarity
  where h.equipment_id = v_boina_id
    and effect->>'target' = 'hero.movement_noise_radius'
    and effect->>'operation' = 'percent'
    and jsonb_typeof(rarity.value) = 'number';

  if v_value_count <> 11 then
    raise exception 'BOINA_PUBLICATION_POSTCONDITION_FAILED:%', v_value_count;
  end if;

  if exists (
    select 1
    from public.equipment_calculation_effects_v2 fx
    where fx.description = 'AO ALCANCE DO TIRO COM MIRA DO HERÓI'
      and fx.target_stat_id <> 'weapon.aimed_range'
  ) then
    raise exception 'AIMED_RANGE_TARGET_POSTCONDITION_FAILED';
  end if;

end
$verify_repair$;

