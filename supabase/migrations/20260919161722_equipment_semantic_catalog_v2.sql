-- Echo Arena — catálogo semântico central para equipamentos futuros.
-- Migração progressiva: não reescreve publicações imutáveis existentes.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

select pg_advisory_xact_lock(
  hashtextextended('echoarena:equipment-semantic-catalog-v2:20260919', 0)
);

create function public.calculation_normalize_alias_v2(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        translate(
          lower(btrim(coalesce(p_value, ''))),
          'áàâãäéèêëíìîïóòôõöúùûüçñ',
          'aaaaaeeeeiiiiooooouuuucn'
        ),
        '[^a-z0-9%°]+',
        ' ',
        'g'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  )
$$;

create table public.calculation_contexts_v2 (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,79}$'),
  label text not null check (length(btrim(label)) between 1 and 120),
  description text not null check (length(btrim(description)) between 3 and 500),
  version integer not null default 1 check (version > 0),
  state text not null check (state in ('draft', 'reviewed', 'published', 'deprecated')),
  created_at timestamptz not null default now()
);

create table public.calculation_operation_definitions_v2 (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,79}$'),
  label text not null check (length(btrim(label)) between 1 and 160),
  description text not null check (length(btrim(description)) between 3 and 1000),
  policy_id text not null check (length(btrim(policy_id)) between 3 and 120),
  version integer not null default 1 check (version > 0),
  state text not null check (state in ('draft', 'reviewed', 'published', 'deprecated')),
  created_at timestamptz not null default now()
);

create table public.calculation_stat_definition_profiles_v2 (
  definition_id text not null
    references public.calculation_stat_definitions_v2(id) on delete restrict,
  version integer not null check (version > 0),
  context_id text not null references public.calculation_contexts_v2(id) on delete restrict,
  value_type text not null check (value_type in ('decimal', 'integer', 'duration', 'angle', 'factor')),
  accepted_units text[] not null check (cardinality(accepted_units) > 0),
  allowed_operations text[] not null check (cardinality(allowed_operations) > 0),
  internal_precision smallint not null check (internal_precision between 0 and 18),
  display_precision smallint not null check (display_precision between 0 and 12),
  display_rounding text not null check (display_rounding in ('decimal_places', 'none')),
  metric_kind text not null check (metric_kind in ('direct', 'derived')),
  formula_state text not null check (formula_state in ('draft', 'reviewed', 'published', 'deprecated')),
  state text not null check (state in ('draft', 'reviewed', 'published', 'deprecated')),
  evidence_reference text not null check (length(btrim(evidence_reference)) between 5 and 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (definition_id, version)
);

create unique index calculation_stat_definition_profiles_v2_published_idx
  on public.calculation_stat_definition_profiles_v2(definition_id)
  where state = 'published';

create table public.calculation_definition_drafts_v2 (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null
    check (canonical_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 160),
  scope text not null check (scope in ('hero', 'weapon', 'ability', 'equipment', 'team')),
  source_key text not null check (source_key ~ '^[a-z][a-z0-9_]{1,79}$'),
  context_id text not null references public.calculation_contexts_v2(id) on delete restrict,
  unit text not null check (unit ~ '^[a-z][a-z0-9_]{1,79}$'),
  value_type text not null check (value_type in ('decimal', 'integer', 'duration', 'angle', 'factor')),
  direction text not null check (direction in ('higher', 'lower', 'neutral')),
  allowed_operations text[] not null check (cardinality(allowed_operations) > 0),
  internal_precision smallint not null check (internal_precision between 0 and 18),
  display_precision smallint not null check (display_precision between 0 and 12),
  display_rounding text not null default 'decimal_places'
    check (display_rounding in ('decimal_places', 'none')),
  metric_kind text not null check (metric_kind in ('direct', 'derived')),
  default_base numeric,
  policy_id text,
  policy_reference text,
  evidence_reference text not null check (length(btrim(evidence_reference)) between 3 and 1000),
  version integer not null default 1 check (version > 0),
  state text not null check (state in ('draft', 'reviewed', 'published', 'deprecated')),
  created_by uuid not null references auth.users(id) on delete restrict,
  published_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (canonical_key, version),
  check (default_base is null or abs(default_base) <= 1e308::numeric),
  check ((state = 'published') = (published_at is not null)),
  check (
    (policy_id is null and policy_reference is null)
    or (
      length(btrim(policy_id)) between 3 and 120
      and length(btrim(policy_reference)) between 10 and 2000
    )
  )
);

create table public.calculation_attribute_aliases_v2 (
  id uuid primary key default gen_random_uuid(),
  raw_alias text not null check (length(btrim(raw_alias)) between 1 and 1000),
  normalized_alias text generated always as
    (public.calculation_normalize_alias_v2(raw_alias)) stored,
  target_stat_id text not null
    references public.calculation_stat_definitions_v2(id) on delete restrict,
  definition_version integer not null check (definition_version > 0),
  context_id text not null references public.calculation_contexts_v2(id) on delete restrict,
  allowed_units text[] not null check (cardinality(allowed_units) > 0),
  allowed_operations text[] not null check (cardinality(allowed_operations) > 0),
  version integer not null default 1 check (version > 0),
  state text not null check (state in ('draft', 'reviewed', 'published', 'deprecated')),
  evidence_reference text not null check (length(btrim(evidence_reference)) between 3 and 1000),
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (normalized_alias, version),
  check (normalized_alias <> ''),
  check ((state = 'published') = (published_at is not null))
);

create unique index calculation_attribute_aliases_v2_published_idx
  on public.calculation_attribute_aliases_v2(normalized_alias)
  where state = 'published';

create index calculation_attribute_aliases_v2_target_idx
  on public.calculation_attribute_aliases_v2(target_stat_id, context_id, state);

create table public.calculation_reprocess_plans_v2 (
  id uuid primary key default gen_random_uuid(),
  alias_id uuid not null
    references public.calculation_attribute_aliases_v2(id) on delete restrict,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('preview', 'applied', 'reverted', 'stale')),
  affected_effect_count integer not null check (affected_effect_count >= 0),
  affected_equipment_count integer not null check (affected_equipment_count >= 0),
  preview jsonb not null check (jsonb_typeof(preview) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  applied_by uuid references auth.users(id) on delete restrict,
  reverted_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  reverted_at timestamptz
);

create index calculation_reprocess_plans_v2_status_idx
  on public.calculation_reprocess_plans_v2(status, created_at desc);

create table public.calculation_reprocess_items_v2 (
  plan_id uuid not null references public.calculation_reprocess_plans_v2(id) on delete restrict,
  effect_id uuid not null references public.equipment_calculation_effects_v2(id) on delete restrict,
  equipment_id uuid not null references public.equipments(id) on delete restrict,
  before_effect jsonb not null check (jsonb_typeof(before_effect) = 'object'),
  after_effect jsonb not null check (jsonb_typeof(after_effect) = 'object'),
  primary key (plan_id, effect_id)
);

alter table public.calculation_contexts_v2 enable row level security;
alter table public.calculation_operation_definitions_v2 enable row level security;
alter table public.calculation_stat_definition_profiles_v2 enable row level security;
alter table public.calculation_definition_drafts_v2 enable row level security;
alter table public.calculation_attribute_aliases_v2 enable row level security;
alter table public.calculation_reprocess_plans_v2 enable row level security;
alter table public.calculation_reprocess_items_v2 enable row level security;

revoke all on table
  public.calculation_contexts_v2,
  public.calculation_operation_definitions_v2,
  public.calculation_stat_definition_profiles_v2,
  public.calculation_definition_drafts_v2,
  public.calculation_attribute_aliases_v2,
  public.calculation_reprocess_plans_v2,
  public.calculation_reprocess_items_v2
from public, anon, authenticated, service_role;

insert into public.calculation_contexts_v2
  (id, label, description, version, state)
values
  ('general', 'Geral', 'Sem condição semântica adicional comprovada.', 1, 'published'),
  ('hip_fire', 'Sem mirar', 'Dispersão ou alcance observado sem uso da mira.', 1, 'published'),
  ('aiming', 'Mirando', 'Efeito aplicável enquanto a arma está sendo mirada.', 1, 'published'),
  ('moving', 'Em movimento', 'Efeito ligado ao movimento do herói ou da arma.', 1, 'published'),
  ('spread_factor', 'Fator de dispersão', 'Fator adimensional de dispersão; não é ângulo.', 1, 'published'),
  ('aim_time', 'Tempo de mira', 'Duração necessária para entrar em mira.', 1, 'published'),
  ('aim_stability', 'Estabilidade de mira', 'Métrica de estabilidade; não equivale a dispersão.', 1, 'published'),
  ('recoil', 'Recuo', 'Índice de recuo; não equivale a dispersão.', 1, 'published');

insert into public.calculation_operation_definitions_v2
  (id, label, description, policy_id, version, state)
values
  (
    'flat',
    'Soma absoluta',
    'Soma o valor observado diretamente à base, preservando o sinal.',
    'additive-base-v1',
    1,
    'published'
  ),
  (
    'percent',
    'Percentual sobre a base',
    'Aplica base x percentual / 100 e soma o resultado à base, preservando o sinal.',
    'additive-base-v1',
    1,
    'published'
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
  evidence_reference
)
select
  d.id,
  1,
  case
    when d.id in ('weapon.aimed_range', 'weapon.aimed_spread', 'hero.aimed_movement_speed') then 'aiming'
    when d.id = 'weapon.spread' then 'hip_fire'
    when d.id in ('weapon.moving_spread_modifier', 'hero.movement_speed', 'hero.movement_noise_radius') then 'moving'
    when d.id = 'weapon.spread_factor' then 'spread_factor'
    when d.id = 'weapon.aim_time' then 'aim_time'
    else 'general'
  end,
  case
    when d.id = 'weapon.magazine' then 'integer'
    when d.unit = 'second' then 'duration'
    when d.id in ('weapon.spread', 'weapon.aimed_spread') then 'angle'
    when d.unit = 'multiplier' or d.id in ('weapon.spread_factor', 'weapon.moving_spread_modifier') then 'factor'
    else 'decimal'
  end,
  case
    when d.unit = 'second' then array['implicit', 'percent', 'second']::text[]
    when d.id in ('weapon.spread', 'weapon.aimed_spread') then array['implicit', 'percent', 'degree']::text[]
    when d.unit = 'multiplier' or d.id in ('weapon.spread_factor', 'weapon.moving_spread_modifier')
      then array['implicit', 'percent', 'factor']::text[]
    when d.unit = 'percent' then array['implicit', 'percent']::text[]
    else array['implicit', 'percent', 'point']::text[]
  end,
  array['flat', 'percent']::text[],
  8,
  case when d.id = 'weapon.magazine' then 0 else 2 end,
  'decimal_places',
  'direct',
  'published',
  'published',
  'migration:20260919161722:existing-calculation-v2-policy'
from public.calculation_stat_definitions_v2 d
where d.enabled
  -- This provisional definition used an invented base of 100. It has no
  -- published semantic profile: observed recoil text is the proven spread
  -- factor modifier below, while a future true recoil mechanic must be
  -- registered independently with evidence.
  and d.id <> 'weapon.recoil';

with alias_seed(target_stat_id, context_id, aliases) as (
  values
    ('hero.health', 'general', array[
      'vida', 'vida maxima', 'vida maxima do heroi', 'vida do heroi',
      'saude', 'saude maxima', 'saude maxima do heroi'
    ]::text[]),
    ('hero.armor', 'general', array[
      'armadura', 'armadura maxima', 'armadura do heroi',
      'armadura maxima do heroi', 'a armadura maxima do heroi'
    ]::text[]),
    ('hero.power', 'general', array['poder', 'poder do heroi']::text[]),
    ('hero.movement_speed', 'moving', array[
      'velocidade de movimento', 'velocidade de movimento do heroi',
      'velocidade maxima', 'velocidade maxima do heroi',
      'velocidade de corrida', 'movimentacao'
    ]::text[]),
    ('hero.aimed_movement_speed', 'aiming', array[
      'velocidade de movimento ao mirar',
      'velocidade maxima de movimentacao do heroi ao mirar',
      'velocidade do heroi ao mirar', 'a velocidade do heroi ao mirar',
      'velocidade ao mirar', 'velocidade com mira'
    ]::text[]),
    ('hero.movement_noise_radius', 'moving', array[
      'barulho da corrida', 'barulho da corrida do heroi',
      'ao barulho da corrida do heroi', 'raio do barulho de movimentacao',
      'raio maximo do barulho de movimentacao do heroi'
    ]::text[]),
    ('hero.penetration_resistance', 'general', array[
      'resistencia a perfuracao', 'resistencia a perfuracao do heroi'
    ]::text[]),
    ('hero.armor_resistance', 'general', array[
      'resistencia de armadura', 'resistencia da armadura',
      'resistencia de armadura do heroi', 'a resistencia de armadura do heroi'
    ]::text[]),
    ('hero.vision_range', 'general', array[
      'alcance de visao', 'alcance de visao do heroi', 'alcance visual',
      'distancia de visao', 'visao do heroi'
    ]::text[]),
    ('weapon.damage', 'general', array[
      'dano da arma', 'dano por tiro', 'dano da arma por tiro', 'dano do tiro'
    ]::text[]),
    ('weapon.fire_rate', 'general', array[
      'cadencia de tiro', 'cadencia de tiro da arma',
      'cadencia de tiro da arma do heroi', 'velocidade de tiro'
    ]::text[]),
    ('weapon.fire_interval', 'general', array[
      'intervalo entre tiros', 'intervalo de tiro'
    ]::text[]),
    ('weapon.magazine', 'general', array[
      'capacidade de municao', 'municao da arma', 'tamanho do pente',
      'capacidade do pente', 'tamanho do carregador', 'capacidade do carregador',
      'tamanho do carregador da arma', 'tamanho do carregador da arma do heroi',
      'ao tamanho do carregador da arma do heroi'
    ]::text[]),
    ('weapon.reload_time', 'general', array[
      'tempo de recarga', 'tempo de recarga da arma', 'recarga da arma',
      'tempo de recarregamento', 'tempo de recarregamento da arma'
    ]::text[]),
    ('weapon.range', 'general', array['alcance da arma', 'alcance de tiro']::text[]),
    ('weapon.aimed_range', 'aiming', array[
      'alcance do tiro com mira do heroi', 'ao alcance do tiro com mira do heroi',
      'alcance de tiro com mira do heroi', 'alcance do tiro com mira',
      'alcance de tiro com mira', 'alcance da arma ao mirar',
      'alcance do tiro da arma ao mirar'
    ]::text[]),
    ('weapon.spread_factor', 'spread_factor', array[
      'recuo da arma', 'recuo da arma do heroi', 'ao recuo da arma do heroi',
      'recuo do armamento', 'recuo do armamento do heroi'
    ]::text[]),
    ('weapon.aim_time', 'aim_time', array[
      'tempo de mira', 'tempo de mira da arma', 'tempo para mirar',
      'tempo para mirar da arma', 'tempo ao mirar'
    ]::text[]),
    ('weapon.spread', 'hip_fire', array[
      'dispersao sem mira', 'dispersao de tiro da arma sem mirar',
      'a dispersao de tiro da arma sem mirar'
    ]::text[]),
    ('weapon.aimed_spread', 'aiming', array[
      'dispersao ao mirar', 'dispersao da arma ao mirar',
      'dispersao de tiro da arma ao mirar'
    ]::text[]),
    ('weapon.spread_factor', 'spread_factor', array['fator de dispersao']::text[]),
    ('weapon.moving_spread_modifier', 'moving', array[
      'dispersao em movimento', 'dispersao da mira em movimento',
      'dispersao da arma em movimento', 'modificador de dispersao em movimento',
      'a dispersao de tiro da arma quando em movimento'
    ]::text[]),
    ('weapon.armor_penetration', 'general', array[
      'penetracao de armadura', 'penetracao de armadura da arma',
      'perfuracao de armadura', 'perfuracao de armadura da arma'
    ]::text[]),
    ('weapon.armor_penetration_power', 'general', array[
      'poder de penetracao', 'poder de penetracao de armadura',
      'poder de perfuracao', 'poder de perfuracao da arma',
      'ao poder de perfuracao da arma', 'poder de perfuracao de armadura',
      'forca de penetracao', 'forca de perfuracao'
    ]::text[])
)
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
  published_at
)
select
  alias_value,
  seed.target_stat_id,
  profile.version,
  seed.context_id,
  profile.accepted_units,
  profile.allowed_operations,
  1,
  'published',
  'migration:20260919161722:reviewed-existing-alias',
  now()
from alias_seed seed
cross join lateral unnest(seed.aliases) alias_value
join public.calculation_stat_definition_profiles_v2 profile
  on profile.definition_id = seed.target_stat_id
 and profile.context_id = seed.context_id
 and profile.state = 'published';

alter table public.equipment_calculation_effects_v2
  add column original_text text,
  add column normalized_text text,
  add column observed_unit text,
  add column semantic_context text references public.calculation_contexts_v2(id) on delete restrict,
  add column resolved_alias_id uuid references public.calculation_attribute_aliases_v2(id) on delete restrict,
  add column definition_version integer,
  add column resolution_status text,
  add column source_image_reference text,
  add column rarity_evidence jsonb not null default '{}'::jsonb;

update public.equipment_calculation_effects_v2 fx
set original_text = fx.description,
    normalized_text = public.calculation_normalize_alias_v2(fx.description),
    observed_unit = case when fx.operation = 'percent' then 'percent' else 'implicit' end,
    semantic_context = alias.context_id,
    resolved_alias_id = alias.id,
    definition_version = alias.definition_version,
    resolution_status = case
      when fx.target_stat_id is null then 'pending_alias'
      else 'resolved'
    end,
    source_image_reference = case
      when fx.source_kind = 'game_capture' then fx.source_reference
      else null
    end
from public.calculation_attribute_aliases_v2 alias
where alias.state = 'published'
  and alias.normalized_alias = public.calculation_normalize_alias_v2(fx.description)
  and (fx.target_stat_id is null or alias.target_stat_id = fx.target_stat_id)
  and (fx.operation is null or fx.operation = any(alias.allowed_operations))
  and (
    (case when fx.operation = 'percent' then 'percent' else 'implicit' end)
    = any(alias.allowed_units)
  );

update public.equipment_calculation_effects_v2 fx
set original_text = coalesce(fx.original_text, fx.description),
    normalized_text = coalesce(
      fx.normalized_text,
      public.calculation_normalize_alias_v2(fx.description)
    ),
    observed_unit = coalesce(
      fx.observed_unit,
      case when fx.operation = 'percent' then 'percent' else 'implicit' end
    ),
    resolution_status = coalesce(
      fx.resolution_status,
      case when fx.target_stat_id is null then 'pending_alias' else 'alias_collision' end
    ),
    source_image_reference = coalesce(
      fx.source_image_reference,
      case when fx.source_kind = 'game_capture' then fx.source_reference else null end
    );

do $verify_existing_effects$
begin
  if exists (
    select 1
    from public.equipment_calculation_effects_v2 fx
    where fx.target_stat_id is not null
      and (
        fx.resolved_alias_id is null
        or fx.semantic_context is null
        or fx.definition_version is null
        or fx.resolution_status <> 'resolved'
      )
  ) then
    raise exception 'SEMANTIC_CATALOG_EXISTING_EFFECT_NOT_RESOLVED';
  end if;
end
$verify_existing_effects$;

alter table public.equipment_calculation_effects_v2
  alter column original_text set not null,
  alter column normalized_text set not null,
  alter column observed_unit set not null,
  alter column resolution_status set not null,
  add constraint equipment_calculation_effects_v2_resolution_status_check
    check (resolution_status in (
      'resolved',
      'pending_alias',
      'pending_mechanic',
      'alias_collision',
      'unit_mismatch',
      'operation_mismatch',
      'formula_unpublished'
    )),
  add constraint equipment_calculation_effects_v2_original_text_check
    check (length(btrim(original_text)) between 1 and 2000),
  add constraint equipment_calculation_effects_v2_normalized_text_check
    check (
      normalized_text = public.calculation_normalize_alias_v2(description)
      and length(normalized_text) between 1 and 1000
    ),
  add constraint equipment_calculation_effects_v2_source_image_check
    check (
      source_image_reference is null
      or length(btrim(source_image_reference)) between 3 and 2000
    ),
  add constraint equipment_calculation_effects_v2_rarity_evidence_check
    check (
      jsonb_typeof(rarity_evidence) = 'object'
      and octet_length(rarity_evidence::text) <= 100000
    ),
  add constraint equipment_calculation_effects_v2_resolution_check
    check (
      (
        target_stat_id is null
        and resolved_alias_id is null
        and resolution_status <> 'resolved'
      )
      or (
        target_stat_id is not null
        and resolved_alias_id is not null
        and semantic_context is not null
        and definition_version is not null
        and resolution_status = 'resolved'
      )
    );

create index equipment_calculation_effects_v2_normalized_idx
  on public.equipment_calculation_effects_v2(normalized_text, resolution_status);

create trigger calculation_contexts_v2_immutable
before update or delete on public.calculation_contexts_v2
for each row execute function public.calculation_publication_immutable_v2();

create trigger calculation_operation_definitions_v2_immutable
before update or delete on public.calculation_operation_definitions_v2
for each row execute function public.calculation_publication_immutable_v2();

create trigger calculation_stat_definition_profiles_v2_immutable
before update or delete on public.calculation_stat_definition_profiles_v2
for each row execute function public.calculation_publication_immutable_v2();

create or replace function public.calculation_definitions_json_v2()
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
    'defaultBase', d.default_base,
    'context', profile.context_id,
    'valueType', profile.value_type,
    'acceptedUnits', to_jsonb(profile.accepted_units),
    'allowedOperations', to_jsonb(profile.allowed_operations),
    'internalPrecision', profile.internal_precision,
    'displayPrecision', profile.display_precision,
    'displayRounding', profile.display_rounding,
    'metricKind', profile.metric_kind,
    'version', profile.version,
    'state', profile.state,
    'formulaState', profile.formula_state,
    'policy', jsonb_build_object(
      'id', d.policy_id,
      'reference', d.policy_reference,
      'rounding', 'none',
      'state', profile.formula_state
    )
  ) order by d.display_order, d.id), '[]'::jsonb)
  from public.calculation_stat_definitions_v2 d
  join public.calculation_stat_definition_profiles_v2 profile
    on profile.definition_id = d.id
   and profile.state = 'published'
   and profile.formula_state = 'published'
  where d.enabled
$$;

create function public.calculation_contexts_json_v2()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', context.id,
    'label', context.label,
    'description', context.description,
    'version', context.version,
    'state', context.state
  ) order by context.label, context.id), '[]'::jsonb)
  from public.calculation_contexts_v2 context
  where context.state = 'published'
$$;

create function public.calculation_operations_json_v2()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', operation.id,
    'label', operation.label,
    'description', operation.description,
    'policyId', operation.policy_id,
    'version', operation.version,
    'state', operation.state
  ) order by operation.id), '[]'::jsonb)
  from public.calculation_operation_definitions_v2 operation
  where operation.state = 'published'
$$;

create function public.calculation_aliases_json_v2()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', alias.id,
    'rawAlias', alias.raw_alias,
    'normalizedAlias', alias.normalized_alias,
    'target', alias.target_stat_id,
    'definitionVersion', alias.definition_version,
    'context', alias.context_id,
    'allowedUnits', to_jsonb(alias.allowed_units),
    'allowedOperations', to_jsonb(alias.allowed_operations),
    'version', alias.version,
    'state', alias.state,
    'evidenceReference', alias.evidence_reference,
    'publishedAt', alias.published_at
  ) order by alias.normalized_alias, alias.version desc), '[]'::jsonb)
  from public.calculation_attribute_aliases_v2 alias
  where alias.state <> 'deprecated'
$$;

create function public.calculation_definition_drafts_json_v2()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', draft.id,
    'canonicalKey', draft.canonical_key,
    'displayName', draft.display_name,
    'scope', draft.scope,
    'sourceKey', draft.source_key,
    'context', draft.context_id,
    'unit', draft.unit,
    'valueType', draft.value_type,
    'direction', draft.direction,
    'allowedOperations', to_jsonb(draft.allowed_operations),
    'internalPrecision', draft.internal_precision,
    'displayPrecision', draft.display_precision,
    'displayRounding', draft.display_rounding,
    'metricKind', draft.metric_kind,
    'defaultBase', draft.default_base,
    'policyId', draft.policy_id,
    'policyReference', draft.policy_reference,
    'version', draft.version,
    'state', draft.state,
    'evidenceReference', draft.evidence_reference,
    'createdAt', draft.created_at,
    'updatedAt', draft.updated_at
  ) order by draft.updated_at desc, draft.canonical_key), '[]'::jsonb)
  from public.calculation_definition_drafts_v2 draft
  where draft.state <> 'deprecated'
$$;

create function public.calculation_reprocess_plans_json_v2()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', plan.id,
    'aliasId', plan.alias_id,
    'fingerprint', plan.fingerprint,
    'status', plan.status,
    'affectedEffectCount', plan.affected_effect_count,
    'affectedEquipmentCount', plan.affected_equipment_count,
    'equipmentNames', coalesce(plan.preview->'equipmentNames', '[]'::jsonb),
    'previousTarget', plan.preview->>'previousTarget',
    'proposedTarget', plan.preview->>'proposedTarget',
    'operation', plan.preview->>'operation',
    'observedUnit', plan.preview->>'observedUnit',
    'items', coalesce(plan.preview->'items', '[]'::jsonb),
    'createdAt', plan.created_at,
    'appliedAt', plan.applied_at,
    'revertedAt', plan.reverted_at
  ) order by plan.created_at desc), '[]'::jsonb)
  from (
    select source.*
    from public.calculation_reprocess_plans_v2 source
    where source.status in ('preview', 'applied')
    order by source.created_at desc
    limit 20
  ) plan
$$;

create or replace function public.calculation_workspace_effects_json_v2(p_equipment_id uuid)
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
    'originalText', fx.original_text,
    'normalizedText', fx.normalized_text,
    'observedUnit', fx.observed_unit,
    'semanticContext', fx.semantic_context,
    'resolvedAliasId', fx.resolved_alias_id,
    'definitionVersion', fx.definition_version,
    'resolutionStatus', fx.resolution_status,
    'sourceImageReference', fx.source_image_reference,
    'rarityEvidence', fx.rarity_evidence,
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

create or replace function public.calculation_admin_equipment_json_v2(p_equipment_id uuid)
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
      when publication.workspace_revision = w.revision then 'published'
      else 'draft'
    end,
    'effects', public.calculation_workspace_effects_json_v2(e.id),
    'definitions', public.calculation_definitions_json_v2(),
    'aliases', public.calculation_aliases_json_v2(),
    'contexts', public.calculation_contexts_json_v2(),
    'operations', public.calculation_operations_json_v2(),
    'definitionDrafts', public.calculation_definition_drafts_json_v2(),
    'reprocessPlans', public.calculation_reprocess_plans_json_v2(),
    'conditions', public.calculation_conditions_json_v2(),
    'rarities', public.calculation_rarities_json_v2(),
    'published', case when publication.id is null then null else jsonb_build_object(
      'id', publication.id,
      'workspaceRevision', publication.workspace_revision,
      'fingerprint', publication.fingerprint,
      'publishedAt', publication.created_at
    ) end,
    'permissions', jsonb_build_object(
      'edit', public.echo_has_admin_capability('equipment.edit'),
      'publish', public.echo_has_admin_capability('equipment.publish')
    )
  )
  from public.equipments e
  left join public.equipment_calculation_workspaces_v2 w on w.equipment_id = e.id
  left join public.equipment_calculation_publication_heads_v2 head on head.equipment_id = e.id
  left join public.equipment_calculation_publications_v2 publication
    on publication.id = head.publication_id
  where e.id = p_equipment_id
$$;

alter function public.calculation_validate_effects_v2(jsonb)
  rename to calculation_validate_effects_legacy_v2;

create function public.calculation_validate_effects_v2(p_effects jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_effect jsonb;
  v_legacy_effects jsonb;
  v_required constant text[] := array[
    'id', 'kind', 'description', 'target', 'operation', 'scope',
    'condition', 'conditionExpected', 'evaluatedOn', 'sourceKind',
    'sourceReference', 'order', 'values'
  ];
  v_allowed constant text[] := array[
    'id', 'kind', 'description', 'originalText', 'normalizedText',
    'observedUnit', 'semanticContext', 'resolvedAliasId',
    'definitionVersion', 'resolutionStatus', 'sourceImageReference',
    'rarityEvidence',
    'target', 'operation', 'scope', 'condition', 'conditionExpected',
    'evaluatedOn', 'sourceKind', 'sourceReference', 'order', 'values'
  ];
  v_semantic_fields constant text[] := array[
    'originalText', 'normalizedText', 'observedUnit', 'semanticContext',
    'resolvedAliasId', 'definitionVersion', 'resolutionStatus',
    'sourceImageReference', 'rarityEvidence'
  ];
  v_target text;
  v_normalized text;
  v_unit text;
  v_status text;
  v_rarities constant text[] := array[
    'comum', 'raro', 'epico', 'lendario', 'mitico', 'supremo',
    'grandioso', 'celestial', 'estelar', 'imortal', 'divino'
  ];
begin
  if jsonb_typeof(p_effects) is distinct from 'array'
    or jsonb_array_length(p_effects) > 100
    or octet_length(p_effects::text) > 1000000 then
    raise exception 'CALCULATION_INVALID_EFFECTS';
  end if;

  for v_effect in select value from jsonb_array_elements(p_effects) loop
    if jsonb_typeof(v_effect) is distinct from 'object'
      or not (v_effect ?& v_required)
      or v_effect - v_allowed <> '{}'::jsonb then
      raise exception 'CALCULATION_INVALID_EFFECT_FIELDS';
    end if;
  end loop;

  select coalesce(jsonb_agg(effect_value - v_semantic_fields), '[]'::jsonb)
  into v_legacy_effects
  from jsonb_array_elements(p_effects) effect_value;

  perform public.calculation_validate_effects_legacy_v2(v_legacy_effects);

  for v_effect in select value from jsonb_array_elements(p_effects) loop
    v_target := v_effect->>'target';
    v_normalized := public.calculation_normalize_alias_v2(v_effect->>'description');
    v_unit := coalesce(
      nullif(btrim(v_effect->>'observedUnit'), ''),
      case when v_effect->>'operation' = 'percent' then 'percent' else 'implicit' end
    );
    v_status := coalesce(
      nullif(btrim(v_effect->>'resolutionStatus'), ''),
      case when v_target is null then 'pending_alias' else 'resolved' end
    );

    if v_effect ? 'originalText' and (
      jsonb_typeof(v_effect->'originalText') is distinct from 'string'
      or length(btrim(v_effect->>'originalText')) not between 1 and 2000
    ) then
      raise exception 'CALCULATION_INVALID_ORIGINAL_TEXT';
    end if;

    if v_effect ? 'normalizedText' and (
      jsonb_typeof(v_effect->'normalizedText') is distinct from 'string'
      or v_effect->>'normalizedText' <> v_normalized
    ) then
      raise exception 'CALCULATION_INVALID_NORMALIZED_TEXT';
    end if;

    if v_effect ? 'observedUnit' and jsonb_typeof(v_effect->'observedUnit') not in ('null', 'string') then
      raise exception 'CALCULATION_INVALID_OBSERVED_UNIT';
    end if;
    if length(v_unit) not between 1 and 80 or v_unit !~ '^[a-z0-9_%]+$' then
      raise exception 'CALCULATION_INVALID_OBSERVED_UNIT';
    end if;

    if v_status <> all(array[
      'resolved', 'pending_alias', 'pending_mechanic', 'alias_collision',
      'unit_mismatch', 'operation_mismatch', 'formula_unpublished'
    ]::text[]) then
      raise exception 'CALCULATION_INVALID_RESOLUTION_STATUS';
    end if;

    if v_effect ? 'sourceImageReference'
      and jsonb_typeof(v_effect->'sourceImageReference') not in ('null', 'string') then
      raise exception 'CALCULATION_INVALID_SOURCE_IMAGE';
    end if;
    if nullif(btrim(v_effect->>'sourceImageReference'), '') is not null
      and length(btrim(v_effect->>'sourceImageReference')) > 2000 then
      raise exception 'CALCULATION_INVALID_SOURCE_IMAGE';
    end if;

    if v_effect ? 'rarityEvidence' then
      if jsonb_typeof(v_effect->'rarityEvidence') is distinct from 'object'
        or octet_length((v_effect->'rarityEvidence')::text) > 100000 then
        raise exception 'CALCULATION_INVALID_RARITY_EVIDENCE';
      end if;
      if exists (
        select 1
        from jsonb_each(v_effect->'rarityEvidence') evidence(rarity_slug, evidence_value)
        where rarity_slug <> all(v_rarities)
          or jsonb_typeof(evidence_value) is distinct from 'object'
          or evidence_value - array[
            'originalText', 'sourceImageReference', 'observedUnit'
          ]::text[] <> '{}'::jsonb
          or jsonb_typeof(evidence_value->'originalText') is distinct from 'string'
          or length(btrim(evidence_value->>'originalText')) not between 1 and 2000
          or jsonb_typeof(evidence_value->'sourceImageReference') not in ('null', 'string')
          or (
            nullif(btrim(evidence_value->>'sourceImageReference'), '') is not null
            and length(btrim(evidence_value->>'sourceImageReference')) > 2000
          )
          or jsonb_typeof(evidence_value->'observedUnit') not in ('null', 'string')
          or (
            nullif(btrim(evidence_value->>'observedUnit'), '') is not null
            and (
              length(btrim(evidence_value->>'observedUnit')) > 80
              or btrim(evidence_value->>'observedUnit') !~ '^[a-z0-9_%]+$'
            )
          )
      ) then
        raise exception 'CALCULATION_INVALID_RARITY_EVIDENCE';
      end if;
    end if;

    if v_target is null then
      if jsonb_typeof(v_effect->'resolvedAliasId') = 'string'
        or v_status = 'resolved' then
        raise exception 'CALCULATION_PENDING_EFFECT_CANNOT_RESOLVE';
      end if;
    else
      if jsonb_typeof(v_effect->'resolvedAliasId') is distinct from 'string'
        or coalesce(v_effect->>'resolvedAliasId', '') !~*
          '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        or jsonb_typeof(v_effect->'semanticContext') is distinct from 'string'
        or jsonb_typeof(v_effect->'definitionVersion') is distinct from 'number'
        or (v_effect->>'definitionVersion')::numeric
          <> trunc((v_effect->>'definitionVersion')::numeric)
        or v_status <> 'resolved'
        or not exists (
          select 1
          from public.calculation_attribute_aliases_v2 alias
          join public.calculation_stat_definition_profiles_v2 profile
            on profile.definition_id = alias.target_stat_id
           and profile.version = alias.definition_version
           and profile.context_id = alias.context_id
           and profile.state = 'published'
           and profile.formula_state = 'published'
          join public.calculation_stat_definitions_v2 definition
            on definition.id = alias.target_stat_id
           and definition.enabled
          where alias.id = (v_effect->>'resolvedAliasId')::uuid
            and alias.state = 'published'
            and alias.normalized_alias = v_normalized
            and alias.target_stat_id = v_target
            and alias.context_id = v_effect->>'semanticContext'
            and alias.definition_version = (v_effect->>'definitionVersion')::integer
            and v_effect->>'operation' = any(alias.allowed_operations)
            and v_effect->>'operation' = any(profile.allowed_operations)
            and v_unit = any(alias.allowed_units)
            and v_unit = any(profile.accepted_units)
        ) then
        raise exception 'CALCULATION_ALIAS_NOT_PUBLISHED_OR_INCOMPATIBLE';
      end if;
    end if;
  end loop;
end;
$$;

create function public.calculation_resolve_effect_semantics_v2()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_alias public.calculation_attribute_aliases_v2%rowtype;
begin
  new.original_text := coalesce(nullif(btrim(new.original_text), ''), new.description);
  new.normalized_text := public.calculation_normalize_alias_v2(new.description);
  new.observed_unit := coalesce(
    nullif(btrim(new.observed_unit), ''),
    case when new.operation = 'percent' then 'percent' else 'implicit' end
  );
  new.source_image_reference := coalesce(
    nullif(btrim(new.source_image_reference), ''),
    case when new.source_kind = 'game_capture' then new.source_reference else null end
  );

  if new.target_stat_id is null then
    new.semantic_context := null;
    new.resolved_alias_id := null;
    new.definition_version := null;
    if new.resolution_status is null or new.resolution_status = 'resolved' then
      new.resolution_status := 'pending_alias';
    end if;
    return new;
  end if;

  select alias.* into v_alias
  from public.calculation_attribute_aliases_v2 alias
  join public.calculation_stat_definition_profiles_v2 profile
    on profile.definition_id = alias.target_stat_id
   and profile.version = alias.definition_version
   and profile.context_id = alias.context_id
   and profile.state = 'published'
   and profile.formula_state = 'published'
  where alias.state = 'published'
    and alias.normalized_alias = new.normalized_text
    and alias.target_stat_id = new.target_stat_id
    and new.operation = any(alias.allowed_operations)
    and new.operation = any(profile.allowed_operations)
    and new.observed_unit = any(alias.allowed_units)
    and new.observed_unit = any(profile.accepted_units);

  if not found then
    raise exception 'CALCULATION_ALIAS_NOT_PUBLISHED_OR_INCOMPATIBLE';
  end if;

  new.semantic_context := v_alias.context_id;
  new.resolved_alias_id := v_alias.id;
  new.definition_version := v_alias.definition_version;
  new.resolution_status := 'resolved';
  return new;
end;
$$;

create trigger equipment_calculation_effects_v2_semantic_resolver
before insert or update of
  description,
  target_stat_id,
  operation,
  observed_unit,
  semantic_context,
  resolved_alias_id,
  definition_version,
  resolution_status
on public.equipment_calculation_effects_v2
for each row execute function public.calculation_resolve_effect_semantics_v2();

alter function public.admin_save_equipment_calculation_v2(uuid, bigint, jsonb, text)
  rename to admin_save_equipment_calculation_legacy_v2;

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
  v_effect jsonb;
  v_actor uuid;
  v_before jsonb;
  v_result jsonb;
begin
  perform public.echo_require_admin_capability('equipment.edit');
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'CALCULATION_AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform public.calculation_validate_effects_v2(p_effects);
  v_before := public.calculation_admin_equipment_json_v2(p_equipment_id);

  perform public.admin_save_equipment_calculation_legacy_v2(
    p_equipment_id,
    p_expected_revision,
    p_effects,
    p_reason
  );

  for v_effect in select value from jsonb_array_elements(p_effects) loop
    update public.equipment_calculation_effects_v2 fx
    set original_text = coalesce(
          nullif(btrim(v_effect->>'originalText'), ''),
          fx.description
        ),
        observed_unit = coalesce(
          nullif(btrim(v_effect->>'observedUnit'), ''),
          fx.observed_unit
        ),
        resolution_status = case
          when fx.target_stat_id is null then coalesce(
            nullif(btrim(v_effect->>'resolutionStatus'), ''),
            fx.resolution_status
          )
          else 'resolved'
        end,
        source_image_reference = nullif(
          btrim(v_effect->>'sourceImageReference'),
          ''
        ),
        rarity_evidence = coalesce(v_effect->'rarityEvidence', '{}'::jsonb),
        updated_at = now()
    where fx.id = (v_effect->>'id')::uuid
      and fx.equipment_id = p_equipment_id;
  end loop;

  v_result := public.calculation_admin_equipment_json_v2(p_equipment_id);
  perform public.echo_write_admin_audit(
    'equipment',
    'equipment.edit',
    'calculation_v2_semantics_saved',
    'equipment_calculation_workspace',
    p_equipment_id::text,
    p_reason,
    v_before,
    v_result,
    null::text
  );
  return v_result;
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
  public.admin_save_equipment_calculation_legacy_v2(uuid, bigint, jsonb, text),
  public.admin_save_equipment_calculation_v2(uuid, bigint, jsonb, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.admin_save_equipment_calculation_v2(uuid, bigint, jsonb, text)
to authenticated;

commit;
