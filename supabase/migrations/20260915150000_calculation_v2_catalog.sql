-- Echo Arena — calculation catalog v2.
--
-- Additive replacement for calculation configuration. Legacy equipment
-- attributes and the previous status/effect registries remain untouched.
-- Draft rows are private, publication snapshots are immutable, and the public
-- site can read only the explicitly published snapshot through one RPC.

begin;

create table public.calculation_stat_definitions_v2 (
  id text primary key
    check (id ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  label text not null check (length(btrim(label)) between 1 and 160),
  scope text not null check (scope in ('hero', 'weapon')),
  source_key text not null check (source_key ~ '^[a-z][a-z0-9_]{1,79}$'),
  unit text not null check (unit ~ '^[a-z][a-z0-9_]{1,79}$'),
  direction text not null check (direction in ('higher', 'lower', 'neutral')),
  policy_id text not null default 'additive-base-v1'
    check (policy_id = 'additive-base-v1'),
  policy_reference text not null
    check (length(btrim(policy_reference)) between 10 and 1000),
  display_order integer not null check (display_order between 0 and 10000),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, source_key),
  unique (display_order),
  check ((scope = 'hero' and id like 'hero.%') or (scope = 'weapon' and id like 'weapon.%'))
);

create table public.calculation_conditions_v2 (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,79}$'),
  label text not null check (length(btrim(label)) between 1 and 120),
  description text not null check (length(btrim(description)) between 3 and 500),
  display_order integer not null check (display_order between 0 and 1000),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (display_order)
);

create table public.equipment_calculation_workspaces_v2 (
  equipment_id uuid primary key references public.equipments(id) on delete restrict,
  revision bigint not null default 0 check (revision >= 0),
  workflow_status text not null default 'draft'
    check (workflow_status in ('draft', 'published')),
  last_reason text check (last_reason is null or length(btrim(last_reason)) between 5 and 2000),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.equipment_calculation_effects_v2 (
  id uuid primary key,
  equipment_id uuid not null references public.equipment_calculation_workspaces_v2(equipment_id) on delete cascade,
  kind text not null check (kind in ('numeric', 'informational', 'unresolved')),
  description text not null check (length(btrim(description)) between 1 and 1000),
  target_stat_id text references public.calculation_stat_definitions_v2(id) on delete restrict,
  operation text check (operation in ('flat', 'percent')),
  scope text not null check (scope in ('self', 'team')),
  condition_id text not null references public.calculation_conditions_v2(id) on delete restrict,
  condition_expected boolean,
  evaluated_on text not null check (evaluated_on in ('source', 'recipient')),
  source_kind text check (source_kind in (
    'official', 'game_capture', 'developer_statement', 'admin_observation', 'other'
  )),
  source_reference text check (
    source_reference is null or length(btrim(source_reference)) between 3 and 1000
  ),
  display_order integer not null check (display_order between 0 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (equipment_id, display_order),
  check ((source_kind is null) = (source_reference is null)),
  check (
    (kind = 'numeric' and target_stat_id is not null and operation is not null)
    or (kind = 'informational' and target_stat_id is null and operation is null)
    or (kind = 'unresolved' and operation is null)
  ),
  check (
    (condition_id = 'always' and condition_expected is null)
    or (condition_id <> 'always' and condition_expected is not null)
  ),
  check (scope <> 'self' or evaluated_on = 'source')
);

create index equipment_calculation_effects_v2_equipment_idx
  on public.equipment_calculation_effects_v2(equipment_id, display_order, id);
create index equipment_calculation_effects_v2_target_idx
  on public.equipment_calculation_effects_v2(target_stat_id)
  where target_stat_id is not null;

create table public.equipment_calculation_rarity_values_v2 (
  effect_id uuid not null references public.equipment_calculation_effects_v2(id) on delete cascade,
  rarity_id uuid not null references public.equipment_rarities(id) on delete restrict,
  value numeric,
  primary key (effect_id, rarity_id),
  check (value is null or (value::text not in ('NaN', 'Infinity', '-Infinity') and abs(value) <= 1e308::numeric))
);

create index equipment_calculation_rarity_values_v2_rarity_idx
  on public.equipment_calculation_rarity_values_v2(rarity_id, effect_id);

create table public.equipment_calculation_publications_v2 (
  id bigint generated always as identity primary key,
  equipment_id uuid not null references public.equipments(id) on delete restrict,
  workspace_revision bigint not null check (workspace_revision > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  reason text not null check (length(btrim(reason)) between 5 and 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (equipment_id, workspace_revision),
  unique (id, equipment_id)
);

create index equipment_calculation_publications_v2_equipment_idx
  on public.equipment_calculation_publications_v2(equipment_id, id desc);

create table public.equipment_calculation_publication_heads_v2 (
  equipment_id uuid primary key references public.equipments(id) on delete restrict,
  publication_id bigint not null,
  updated_at timestamptz not null default now(),
  foreign key (publication_id, equipment_id)
    references public.equipment_calculation_publications_v2(id, equipment_id)
    on delete restrict
);

alter table public.calculation_stat_definitions_v2 enable row level security;
alter table public.calculation_conditions_v2 enable row level security;
alter table public.equipment_calculation_workspaces_v2 enable row level security;
alter table public.equipment_calculation_effects_v2 enable row level security;
alter table public.equipment_calculation_rarity_values_v2 enable row level security;
alter table public.equipment_calculation_publications_v2 enable row level security;
alter table public.equipment_calculation_publication_heads_v2 enable row level security;

-- Deliberately no table policies or API-role table privileges. All reads and
-- writes cross one capability-checked RPC boundary. The public reader is a
-- narrowly scoped definer because an invoker cannot read an ungranted table.
revoke all on table
  public.calculation_stat_definitions_v2,
  public.calculation_conditions_v2,
  public.equipment_calculation_workspaces_v2,
  public.equipment_calculation_effects_v2,
  public.equipment_calculation_rarity_values_v2,
  public.equipment_calculation_publications_v2,
  public.equipment_calculation_publication_heads_v2
from public, anon, authenticated, service_role;
revoke all on sequence public.equipment_calculation_publications_v2_id_seq
  from public, anon, authenticated, service_role;

insert into public.calculation_stat_definitions_v2
  (id, label, scope, source_key, unit, direction, policy_reference, display_order)
values
  ('hero.health', 'Vida', 'hero', 'health', 'health_point', 'higher',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 10),
  ('hero.armor', 'Armadura', 'hero', 'armor', 'armor_point', 'higher',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 20),
  ('hero.power', 'Poder do heroi', 'hero', 'power', 'game_value', 'higher',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 30),
  ('hero.movement_speed', 'Velocidade de movimento', 'hero', 'movement_speed', 'game_value', 'higher',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 40),
  ('hero.vision_range', 'Alcance de visao', 'hero', 'vision_range', 'game_value', 'higher',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 50),
  ('weapon.damage', 'Dano da arma', 'weapon', 'weapon_damage', 'game_value', 'higher',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 100),
  ('weapon.fire_rate', 'Cadencia de tiro', 'weapon', 'fire_rate', 'game_value', 'higher',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 110),
  ('weapon.fire_interval', 'Intervalo entre tiros', 'weapon', 'fire_interval', 'game_value', 'lower',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 120),
  ('weapon.magazine', 'Tamanho do carregador', 'weapon', 'magazine_size', 'ammo_round', 'higher',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 130),
  ('weapon.reload_time', 'Tempo de recarga', 'weapon', 'reload_time', 'second', 'lower',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 140),
  ('weapon.range', 'Alcance da arma', 'weapon', 'weapon_range', 'game_value', 'higher',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 150),
  ('weapon.aim_time', 'Tempo para mirar', 'weapon', 'aim_time', 'second', 'lower',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 160),
  ('weapon.spread', 'Dispersao da arma', 'weapon', 'weapon_spread', 'game_value', 'lower',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 170),
  ('weapon.spread_factor', 'Fator de dispersao', 'weapon', 'spread_factor', 'game_value', 'lower',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 180),
  ('weapon.moving_spread_modifier', 'Modificador de dispersao em movimento', 'weapon', 'moving_spread_modifier', 'game_value', 'lower',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 190),
  ('weapon.armor_penetration', 'Perfuracao de armadura da arma', 'weapon', 'weapon_armor_penetration', 'game_value', 'higher',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 200),
  ('weapon.armor_penetration_power', 'Poder de perfuracao', 'weapon', 'armor_penetration_power', 'game_value', 'higher',
    'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no nucleo.', 210);

insert into public.calculation_conditions_v2
  (id, label, description, display_order)
values
  ('always', 'Sempre', 'O efeito nao depende de uma condicao de cenario.', 10),
  ('moving', 'Em movimento', 'Compara o estado de movimento com o valor esperado do efeito.', 20),
  ('aiming', 'Com mira', 'Compara o estado de mira com o valor esperado do efeito.', 30);

do $$
begin
  if (select count(distinct r.slug)
      from public.equipment_rarities r
      where r.slug = any(array[
        'comum', 'raro', 'epico', 'lendario', 'mitico', 'supremo',
        'grandioso', 'celestial', 'estelar', 'imortal', 'divino'
      ]::text[])) <> 11 then
    raise exception 'CALCULATION_RARITY_CATALOG_INVALID';
  end if;
end;
$$;

create function public.calculation_hash_v2(p_value jsonb)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_value::text, 'UTF8')),
    'hex'
  )
$$;

create function public.calculation_publication_immutable_v2()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'CALCULATION_PUBLICATION_IMMUTABLE' using errcode = '55000';
end;
$$;

create trigger equipment_calculation_publications_v2_immutable
before update or delete on public.equipment_calculation_publications_v2
for each row execute function public.calculation_publication_immutable_v2();

-- Existing semantic IDs are append-only. A published effect can therefore
-- never be reinterpreted later by changing its source key, policy or condition.
create trigger calculation_stat_definitions_v2_immutable
before update or delete on public.calculation_stat_definitions_v2
for each row execute function public.calculation_publication_immutable_v2();

create trigger calculation_conditions_v2_immutable
before update or delete on public.calculation_conditions_v2
for each row execute function public.calculation_publication_immutable_v2();

create function public.calculation_definitions_json_v2()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'label', d.label,
    'scope', d.scope,
    'sourceKey', d.source_key,
    'unit', d.unit,
    'direction', d.direction,
    'policy', jsonb_build_object(
      'id', d.policy_id,
      'reference', d.policy_reference,
      'rounding', 'none'
    )
  ) order by d.display_order, d.id), '[]'::jsonb)
  from public.calculation_stat_definitions_v2 d
  where d.enabled
$$;

create function public.calculation_conditions_json_v2()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'label', c.label,
    'description', c.description
  ) order by c.display_order, c.id), '[]'::jsonb)
  from public.calculation_conditions_v2 c
  where c.enabled
$$;

create function public.calculation_rarities_json_v2()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'slug', r.slug,
    'name', r.name,
    'rank', r.rank
  ) order by r.rank, r.slug), '[]'::jsonb)
  from public.equipment_rarities r
  where r.slug = any(array[
    'comum', 'raro', 'epico', 'lendario', 'mitico', 'supremo',
    'grandioso', 'celestial', 'estelar', 'imortal', 'divino'
  ]::text[])
$$;

create function public.calculation_workspace_effects_json_v2(p_equipment_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', fx.id,
    'kind', fx.kind,
    'description', fx.description,
    'target', fx.target_stat_id,
    'operation', fx.operation,
    'scope', fx.scope,
    'condition', fx.condition_id,
    'conditionExpected', fx.condition_expected,
    'evaluatedOn', fx.evaluated_on,
    'sourceKind', fx.source_kind,
    'sourceReference', fx.source_reference,
    'order', fx.display_order,
    'values', coalesce((
      select jsonb_object_agg(r.slug, to_jsonb(rv.value) order by r.rank, r.slug)
      from public.equipment_rarities r
      left join public.equipment_calculation_rarity_values_v2 rv
        on rv.rarity_id = r.id and rv.effect_id = fx.id
      where r.slug = any(array[
        'comum', 'raro', 'epico', 'lendario', 'mitico', 'supremo',
        'grandioso', 'celestial', 'estelar', 'imortal', 'divino'
      ]::text[])
    ), '{}'::jsonb)
  ) order by fx.display_order, fx.id), '[]'::jsonb)
  from public.equipment_calculation_effects_v2 fx
  where fx.equipment_id = p_equipment_id
$$;

create function public.calculation_validate_effects_v2(p_effects jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
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
      if coalesce(v_target, '') = ''
        or coalesce(v_effect->>'operation', '') <> all(array['flat', 'percent'])
        or not exists (
          select 1 from public.calculation_stat_definitions_v2 d
          where d.id = v_target and d.enabled
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
$$;

create function public.calculation_admin_equipment_json_v2(p_equipment_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'contract', 'echo-calculation-workspace/v2',
    'equipment', jsonb_build_object('id', e.id, 'name', e.name, 'enabled', e.enabled),
    'revision', coalesce(w.revision, 0),
    'state', case
      when w.equipment_id is null then 'empty'
      when p.workspace_revision = w.revision then 'published'
      else 'draft'
    end,
    'effects', public.calculation_workspace_effects_json_v2(e.id),
    'definitions', public.calculation_definitions_json_v2(),
    'conditions', public.calculation_conditions_json_v2(),
    'rarities', public.calculation_rarities_json_v2(),
    'published', case when p.id is null then null else jsonb_build_object(
      'id', p.id,
      'workspaceRevision', p.workspace_revision,
      'fingerprint', p.fingerprint,
      'publishedAt', p.created_at
    ) end,
    'permissions', jsonb_build_object(
      'edit', public.echo_has_admin_capability('equipment.edit'),
      'publish', public.echo_has_admin_capability('equipment.publish')
    )
  )
  from public.equipments e
  left join public.equipment_calculation_workspaces_v2 w on w.equipment_id = e.id
  left join public.equipment_calculation_publication_heads_v2 h on h.equipment_id = e.id
  left join public.equipment_calculation_publications_v2 p on p.id = h.publication_id
  where e.id = p_equipment_id
$$;

create function public.get_calculation_catalog_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_catalog jsonb;
begin
  v_catalog := jsonb_build_object(
    'contract', 'echo-calculation-catalog/v2',
    'policy', jsonb_build_object(
      'id', 'additive-base-v1',
      'description', 'base + soma dos valores fixos + base x soma dos percentuais / 100; sem arredondamento'
    ),
    'definitions', public.calculation_definitions_json_v2(),
    'conditions', public.calculation_conditions_json_v2(),
    'rarities', public.calculation_rarities_json_v2(),
    'equipment', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'name', e.name,
        'publication', case when p.id is null then null else jsonb_build_object(
          'id', p.id,
          'workspaceRevision', p.workspace_revision,
          'fingerprint', p.fingerprint,
          'publishedAt', p.created_at
        ) end,
        'effects', coalesce(p.snapshot->'effects', '[]'::jsonb)
      ) order by e.name, e.id)
      from public.equipments e
      left join public.equipment_calculation_publication_heads_v2 h on h.equipment_id = e.id
      left join public.equipment_calculation_publications_v2 p on p.id = h.publication_id
      where e.enabled
    ), '[]'::jsonb)
  );

  return v_catalog || jsonb_build_object(
    'catalogRevision', public.calculation_hash_v2(v_catalog),
    'generatedAt', statement_timestamp()
  );
end;
$$;

create function public.admin_get_equipment_calculation_v2(p_equipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.echo_require_admin_capability('equipment.view');
  select public.calculation_admin_equipment_json_v2(p_equipment_id) into v_result;
  if v_result is null then
    raise exception 'CALCULATION_EQUIPMENT_NOT_FOUND';
  end if;
  return v_result;
end;
$$;

create function public.admin_save_equipment_calculation_v2(
  p_equipment_id uuid,
  p_expected_revision bigint,
  p_effects jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace public.equipment_calculation_workspaces_v2%rowtype;
  v_effect jsonb;
  v_effect_id uuid;
  v_rarity record;
  v_value jsonb;
  v_actor uuid;
  v_before jsonb;
  v_after jsonb;
  v_new_revision bigint;
  v_rarities constant text[] := array[
    'comum', 'raro', 'epico', 'lendario', 'mitico', 'supremo',
    'grandioso', 'celestial', 'estelar', 'imortal', 'divino'
  ];
begin
  perform public.echo_require_admin_capability('equipment.edit');
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'CALCULATION_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_reason)), 0) not between 5 and 2000 then
    raise exception 'CALCULATION_REASON_REQUIRED';
  end if;
  perform public.calculation_validate_effects_v2(p_effects);

  perform 1 from public.equipments e where e.id = p_equipment_id for update;
  if not found then
    raise exception 'CALCULATION_EQUIPMENT_NOT_FOUND';
  end if;

  select * into v_workspace
  from public.equipment_calculation_workspaces_v2 w
  where w.equipment_id = p_equipment_id
  for update;
  if not found then
    if p_expected_revision is distinct from 0 then
      raise exception 'CALCULATION_REVISION_CONFLICT' using errcode = '40001';
    end if;
    insert into public.equipment_calculation_workspaces_v2
      (equipment_id, revision, workflow_status, last_reason, updated_by)
    values (p_equipment_id, 0, 'draft', btrim(p_reason), v_actor)
    returning * into v_workspace;
  elsif p_expected_revision is distinct from v_workspace.revision then
    raise exception 'CALCULATION_REVISION_CONFLICT' using errcode = '40001';
  end if;

  if exists (
    select 1
    from public.equipment_calculation_effects_v2 existing
    join jsonb_array_elements(p_effects) incoming
      on existing.id = (incoming->>'id')::uuid
    where existing.equipment_id <> p_equipment_id
  ) then
    raise exception 'CALCULATION_EFFECT_ID_IN_USE';
  end if;

  v_before := jsonb_build_object(
    'revision', v_workspace.revision,
    'effects', public.calculation_workspace_effects_json_v2(p_equipment_id)
  );

  delete from public.equipment_calculation_effects_v2
  where equipment_id = p_equipment_id;

  for v_effect in select value from jsonb_array_elements(p_effects) loop
    v_effect_id := (v_effect->>'id')::uuid;
    insert into public.equipment_calculation_effects_v2 (
      id, equipment_id, kind, description, target_stat_id, operation,
      scope, condition_id, condition_expected, evaluated_on,
      source_kind, source_reference, display_order
    ) values (
      v_effect_id,
      p_equipment_id,
      v_effect->>'kind',
      btrim(v_effect->>'description'),
      nullif(v_effect->>'target', ''),
      nullif(v_effect->>'operation', ''),
      v_effect->>'scope',
      v_effect->>'condition',
      case when jsonb_typeof(v_effect->'conditionExpected') = 'boolean'
        then (v_effect->>'conditionExpected')::boolean else null end,
      v_effect->>'evaluatedOn',
      nullif(v_effect->>'sourceKind', ''),
      case when v_effect->>'sourceReference' is null then null
        else btrim(v_effect->>'sourceReference') end,
      (v_effect->>'order')::integer
    );

    for v_rarity in
      select r.id, r.slug
      from public.equipment_rarities r
      where r.slug = any(v_rarities)
      order by r.rank, r.slug
    loop
      v_value := v_effect->'values'->v_rarity.slug;
      insert into public.equipment_calculation_rarity_values_v2(effect_id, rarity_id, value)
      values (
        v_effect_id,
        v_rarity.id,
        case when jsonb_typeof(v_value) = 'number' then v_value::text::numeric else null end
      );
    end loop;
  end loop;

  v_new_revision := v_workspace.revision + 1;
  update public.equipment_calculation_workspaces_v2
  set revision = v_new_revision,
      workflow_status = 'draft',
      last_reason = btrim(p_reason),
      updated_by = v_actor,
      updated_at = now()
  where equipment_id = p_equipment_id;

  v_after := jsonb_build_object(
    'revision', v_new_revision,
    'effects', public.calculation_workspace_effects_json_v2(p_equipment_id)
  );
  perform public.echo_write_admin_audit(
    'equipment', 'equipment.edit', 'calculation_v2_draft_saved',
    'equipment_calculation_workspace', p_equipment_id::text, p_reason,
    v_before, v_after, null::text
  );

  return public.calculation_admin_equipment_json_v2(p_equipment_id);
end;
$$;

create function public.admin_publish_equipment_calculation_v2(
  p_equipment_id uuid,
  p_expected_revision bigint,
  p_expected_publication bigint,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace public.equipment_calculation_workspaces_v2%rowtype;
  v_current_publication bigint;
  v_old_snapshot jsonb;
  v_admin_effects jsonb;
  v_public_effects jsonb;
  v_snapshot jsonb;
  v_fingerprint text;
  v_publication_id bigint;
  v_actor uuid;
begin
  perform public.echo_require_admin_capability('equipment.publish');
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'CALCULATION_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_reason)), 0) not between 5 and 2000 then
    raise exception 'CALCULATION_REASON_REQUIRED';
  end if;

  perform 1 from public.equipments e where e.id = p_equipment_id for update;
  if not found then
    raise exception 'CALCULATION_EQUIPMENT_NOT_FOUND';
  end if;

  select * into v_workspace
  from public.equipment_calculation_workspaces_v2 w
  where w.equipment_id = p_equipment_id
  for update;
  if not found then
    raise exception 'CALCULATION_DRAFT_NOT_FOUND';
  end if;
  if p_expected_revision is distinct from v_workspace.revision then
    raise exception 'CALCULATION_REVISION_CONFLICT' using errcode = '40001';
  end if;

  select h.publication_id into v_current_publication
  from public.equipment_calculation_publication_heads_v2 h
  where h.equipment_id = p_equipment_id
  for update;
  if p_expected_publication is distinct from coalesce(v_current_publication, 0) then
    raise exception 'CALCULATION_REVISION_CONFLICT' using errcode = '40001';
  end if;

  if v_current_publication is not null and exists (
    select 1
    from public.equipment_calculation_publications_v2 p
    where p.id = v_current_publication
      and p.workspace_revision = v_workspace.revision
  ) then
    return public.calculation_admin_equipment_json_v2(p_equipment_id);
  end if;

  if not exists (
    select 1 from public.equipment_calculation_effects_v2 fx
    where fx.equipment_id = p_equipment_id
  ) then
    raise exception 'CALCULATION_EFFECT_REQUIRED';
  end if;

  if exists (
    select 1
    from public.equipment_calculation_effects_v2 fx
    where fx.equipment_id = p_equipment_id
      and fx.kind = 'numeric'
      and (fx.source_kind is null or fx.source_reference is null)
  ) then
    raise exception 'CALCULATION_NUMERIC_SOURCE_REQUIRED';
  end if;

  if exists (
    select 1
    from public.equipment_calculation_effects_v2 fx
    where fx.equipment_id = p_equipment_id
      and (
        (select count(*) from public.equipment_calculation_rarity_values_v2 rv
          join public.equipment_rarities r on r.id = rv.rarity_id
          where rv.effect_id = fx.id and r.slug = any(array[
            'comum', 'raro', 'epico', 'lendario', 'mitico', 'supremo',
            'grandioso', 'celestial', 'estelar', 'imortal', 'divino'
          ]::text[])) <> 11
        or (fx.kind = 'numeric' and not exists (
          select 1 from public.equipment_calculation_rarity_values_v2 rv
          join public.equipment_rarities r on r.id = rv.rarity_id
          where rv.effect_id = fx.id
            and r.slug = any(array[
              'comum', 'raro', 'epico', 'lendario', 'mitico', 'supremo',
              'grandioso', 'celestial', 'estelar', 'imortal', 'divino'
            ]::text[])
            and rv.value is not null
        ))
        or (fx.kind <> 'numeric' and exists (
          select 1 from public.equipment_calculation_rarity_values_v2 rv
          where rv.effect_id = fx.id and rv.value is not null
        ))
      )
  ) then
    raise exception 'CALCULATION_PUBLICATION_INCOMPLETE';
  end if;

  -- Recheck enabled references at the publication boundary. A future migration
  -- may disable a definition or condition after a draft was saved.
  if exists (
    select 1
    from public.equipment_calculation_effects_v2 fx
    left join public.calculation_conditions_v2 c
      on c.id = fx.condition_id and c.enabled
    left join public.calculation_stat_definitions_v2 d
      on d.id = fx.target_stat_id and d.enabled
    where fx.equipment_id = p_equipment_id
      and (c.id is null or (fx.target_stat_id is not null and d.id is null))
  ) then
    raise exception 'CALCULATION_PUBLICATION_REFERENCE_DISABLED';
  end if;

  v_admin_effects := public.calculation_workspace_effects_json_v2(p_equipment_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x->>'id',
    'kind', x->>'kind',
    'description', x->>'description',
    'target', x->'target',
    'operation', x->'operation',
    'scope', x->>'scope',
    'condition', x->>'condition',
    'conditionExpected', x->'conditionExpected',
    'evaluatedOn', x->>'evaluatedOn',
    'source', case
      when jsonb_typeof(x->'sourceKind') = 'string' then jsonb_build_object(
        'kind', x->>'sourceKind', 'reference', x->>'sourceReference'
      ) else null end,
    'order', (x->>'order')::integer,
    'values', x->'values'
  ) order by (x->>'order')::integer, x->>'id'), '[]'::jsonb)
  into v_public_effects
  from jsonb_array_elements(v_admin_effects) x;

  v_snapshot := jsonb_build_object(
    'contract', 'echo-equipment-calculation/v2',
    'equipmentId', p_equipment_id,
    'workspaceRevision', v_workspace.revision,
    'effects', v_public_effects
  );
  v_fingerprint := public.calculation_hash_v2(v_snapshot);
  select p.snapshot into v_old_snapshot
  from public.equipment_calculation_publications_v2 p
  where p.id = v_current_publication;

  insert into public.equipment_calculation_publications_v2 (
    equipment_id, workspace_revision, snapshot, fingerprint, reason, created_by
  ) values (
    p_equipment_id, v_workspace.revision, v_snapshot, v_fingerprint,
    btrim(p_reason), v_actor
  ) returning id into v_publication_id;

  insert into public.equipment_calculation_publication_heads_v2
    (equipment_id, publication_id, updated_at)
  values (p_equipment_id, v_publication_id, now())
  on conflict (equipment_id) do update
    set publication_id = excluded.publication_id,
        updated_at = excluded.updated_at;

  update public.equipment_calculation_workspaces_v2
  set workflow_status = 'published',
      last_reason = btrim(p_reason),
      updated_by = v_actor,
      updated_at = now()
  where equipment_id = p_equipment_id;

  perform public.echo_write_admin_audit(
    'equipment', 'equipment.publish', 'calculation_v2_published',
    'equipment_calculation_publication', v_publication_id::text, p_reason,
    v_old_snapshot, v_snapshot, null::text
  );

  return public.calculation_admin_equipment_json_v2(p_equipment_id);
end;
$$;

revoke all on function
  public.calculation_hash_v2(jsonb),
  public.calculation_publication_immutable_v2(),
  public.calculation_definitions_json_v2(),
  public.calculation_conditions_json_v2(),
  public.calculation_rarities_json_v2(),
  public.calculation_workspace_effects_json_v2(uuid),
  public.calculation_validate_effects_v2(jsonb),
  public.calculation_admin_equipment_json_v2(uuid),
  public.get_calculation_catalog_v2(),
  public.admin_get_equipment_calculation_v2(uuid),
  public.admin_save_equipment_calculation_v2(uuid, bigint, jsonb, text),
  public.admin_publish_equipment_calculation_v2(uuid, bigint, bigint, text)
from public, anon, authenticated, service_role;

grant execute on function public.get_calculation_catalog_v2()
  to anon, authenticated, service_role;
grant execute on function
  public.admin_get_equipment_calculation_v2(uuid),
  public.admin_save_equipment_calculation_v2(uuid, bigint, jsonb, text),
  public.admin_publish_equipment_calculation_v2(uuid, bigint, bigint, text)
to authenticated;

comment on function public.get_calculation_catalog_v2() is
  'Returns only current immutable calculation-v2 publications; unpublished enabled equipment is explicit with effects=[].';
comment on function public.admin_save_equipment_calculation_v2(uuid, bigint, jsonb, text) is
  'Capability-checked compare-and-set draft replacement. Saving never changes the active publication.';
comment on function public.admin_publish_equipment_calculation_v2(uuid, bigint, bigint, text) is
  'Capability-checked atomic publication. Numeric effects require an exact target, operation, source, all 11 rarity keys and at least one known value; null remains unknown.';

commit;
