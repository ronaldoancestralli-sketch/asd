-- Isolated CI database only. Never run this fixture in the live database.
\set ON_ERROR_STOP on

\ir calculation_v2_catalog_fixture.sql

reset role;
update public.fixture_caps set allowed = true
where capability in ('equipment.view', 'equipment.edit', 'equipment.publish');

-- The semantic migration follows the production migrations that introduced
-- pending numeric effects and default_base. The isolated base fixture keeps
-- only the minimal columns needed by this test.
alter table public.calculation_stat_definitions_v2
  add column default_base numeric;

-- Production already has this definition through
-- 20260917011649_restore_status_bindings_and_slayer.sql. The compact CI
-- fixture intentionally starts from the original 17 definitions, so mirror
-- that one prerequisite before exercising contextual alias separation.
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
  'weapon.aimed_spread',
  'Dispersão da arma ao mirar',
  'weapon',
  'aimed_spread',
  'game_value',
  'lower',
  'additive-base-v1',
  'Resultado = base + valores fixos + (base x soma dos percentuais / 100), sem arredondamento no núcleo.',
  250,
  true,
  5
);

-- Make the last fixture draft use an approved exact alias before the catalog
-- backfill verifies every pre-existing linked effect.
update public.equipment_calculation_effects_v2
set description = 'Tamanho do carregador'
where target_stat_id = 'weapon.magazine';

\ir ../migrations/20260917234421_allow_pending_numeric_calculation_effects.sql
\ir ../migrations/20260919161722_equipment_semantic_catalog_v2.sql
\ir ../migrations/20260919161723_equipment_semantic_admin_workflow_v2.sql
\ir ../migrations/20260920020646_calculation_resolution_contract_v2.sql

select public.fixture_assert(
  not has_table_privilege(
    'authenticated',
    'public.calculation_attribute_aliases_v2',
    'INSERT'
  ),
  'Aliases cannot be written outside capability-checked RPCs'
);
select public.fixture_assert(
  not has_table_privilege(
    'service_role',
    'public.calculation_reprocess_items_v2',
    'TRUNCATE'
  ),
  'Reprocessing history is closed even to the API service role'
);
select public.fixture_assert(
  not has_function_privilege(
    'authenticated',
    'public.calculation_validate_alias_binding_v2(text,text,text[],text[])',
    'EXECUTE'
  ),
  'Alias validator is not an exposed RPC'
);
select public.fixture_assert(
  has_function_privilege(
    'authenticated',
    'public.admin_publish_calculation_alias_v2(text,text,text,text[],text[],text,text)',
    'EXECUTE'
  ),
  'Alias publication RPC is available to authenticated administrators'
);
select public.fixture_assert(
  has_function_privilege(
    'authenticated',
    'public.admin_get_calculation_resolution_coverage_v2()',
    'EXECUTE'
  ),
  'The unified semantic coverage RPC is available to authenticated administrators'
);
select public.fixture_assert(
  not has_function_privilege(
    'anon',
    'public.admin_get_calculation_resolution_coverage_v2()',
    'EXECUTE'
  ),
  'The unified semantic coverage RPC is not public'
);

select public.fixture_assert(
  (select count(*) = 2
   from public.calculation_attribute_aliases_v2
   where normalized_alias in (
     'a dispersao de tiro da arma sem mirar',
     'dispersao da arma ao mirar'
   )
     and context_id in ('hip_fire', 'aiming')
     and state = 'published'),
  'Aiming and hip-fire aliases remain contextually distinct'
);
select public.fixture_assert(
  not exists (
    select 1
    from public.calculation_attribute_aliases_v2
    where normalized_alias in ('dispersao', 'dispersao da arma')
  ),
  'Context-free spread words are not guessed'
);

select set_config(
  'request.jwt.claim.sub',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  false
);
set role authenticated;

select public.admin_save_equipment_calculation_v2(
  '22222222-2222-4222-8222-222222222222',
  2,
  $json$[{
    "id":"66666666-6666-4666-8666-666666666666",
    "kind":"numeric",
    "description":"À NOVA FORMA DE ARMADURA",
    "originalText":"-17% À NOVA FORMA DE ARMADURA",
    "normalizedText":"a nova forma de armadura",
    "observedUnit":"percent",
    "semanticContext":null,
    "resolvedAliasId":null,
    "definitionVersion":null,
    "resolutionStatus":"pending_alias",
    "sourceImageReference":"fixture-armadura-comum.png",
    "rarityEvidence":{
      "comum":{
        "originalText":"-5% À NOVA FORMA DE ARMADURA",
        "sourceImageReference":"fixture-armadura-comum.png",
        "observedUnit":"percent"
      },
      "divino":{
        "originalText":"-17% À NOVA FORMA DE ARMADURA",
        "sourceImageReference":"fixture-armadura-divino.png",
        "observedUnit":"percent"
      }
    },
    "target":null,
    "operation":"percent",
    "scope":"self",
    "condition":"always",
    "conditionExpected":null,
    "evaluatedOn":"source",
    "sourceKind":"game_capture",
    "sourceReference":"game-capture:fixture-new-alias",
    "order":0,
    "values":{"comum":-5,"raro":-6,"epico":-7,"lendario":-8,"mitico":-9,"supremo":-10,"grandioso":-11,"celestial":-12,"estelar":-13,"imortal":-14,"divino":-17}
  }]$json$::jsonb,
  'Save unknown phrase without invented target'
);

select public.fixture_assert(
  public.admin_get_equipment_calculation_v2(
    '22222222-2222-4222-8222-222222222222'
  )->'effects'->0->>'target' is null
  and public.admin_get_equipment_calculation_v2(
    '22222222-2222-4222-8222-222222222222'
  )->'effects'->0->>'originalText' = '-17% À NOVA FORMA DE ARMADURA'
  and public.admin_get_equipment_calculation_v2(
    '22222222-2222-4222-8222-222222222222'
  )->'effects'->0->>'sourceImageReference' = 'fixture-armadura-comum.png'
  and public.admin_get_equipment_calculation_v2(
    '22222222-2222-4222-8222-222222222222'
  )->'effects'->0->'rarityEvidence'->'divino'->>'sourceImageReference'
    = 'fixture-armadura-divino.png',
  'Unknown mechanics preserve original text, rarity values and image evidence'
);

select public.admin_save_calculation_alias_draft_v2(
  'À NOVA FORMA DE ARMADURA',
  'hero.armor',
  'general',
  array['percent']::text[],
  array['percent']::text[],
  'game-capture:fixture-new-alias',
  'Keep alias pending until reviewed'
);

-- Internal fixture assertions run as the disposable database owner. The
-- authenticated API role must remain unable to select these private tables.
reset role;
select public.fixture_assert(
  (select count(*) = 1
   from public.calculation_attribute_aliases_v2
   where normalized_alias = 'a nova forma de armadura'
     and state = 'draft'),
  'An uncertain alias can remain a non-resolving draft'
);
select public.fixture_assert(
  (select target_stat_id is null
   from public.equipment_calculation_effects_v2
   where id = '66666666-6666-4666-8666-666666666666'),
  'Saving an alias draft never mutates historical effects'
);
set role authenticated;

create temporary table fixture_alias_publication as
select public.admin_publish_calculation_alias_v2(
  'À NOVA FORMA DE ARMADURA',
  'hero.armor',
  'general',
  array['percent']::text[],
  array['percent']::text[],
  'game-capture:fixture-new-alias',
  'Publish reviewed exact alias'
) as response;

select public.fixture_assert(
  (select response->'reprocessPlan'->>'status' = 'preview'
     and (response->'reprocessPlan'->'preview'->>'affectedEffectCount')::integer = 1
   from fixture_alias_publication),
  'Publishing an alias creates a preview with the affected count'
);
reset role;
select public.fixture_assert(
  (select target_stat_id is null
   from public.equipment_calculation_effects_v2
   where id = '66666666-6666-4666-8666-666666666666'),
  'Reprocessing preview cannot mutate an effect'
);
set role authenticated;

select public.admin_confirm_calculation_reprocess_v2(
  (select (response->'reprocessPlan'->>'id')::uuid
   from fixture_alias_publication),
  (select response->'reprocessPlan'->>'fingerprint'
   from fixture_alias_publication),
  'Confirm reviewed retroactive link'
);

reset role;
select public.fixture_assert(
  (select target_stat_id = 'hero.armor'
      and resolution_status = 'resolved'
      and resolved_alias_id is not null
   from public.equipment_calculation_effects_v2
   where id = '66666666-6666-4666-8666-666666666666'),
  'Confirmed reprocessing applies the exact reviewed alias'
);
select public.fixture_assert(
  exists (
    select 1 from public.fixture_audit
    where action = 'calculation_reprocess_applied'
  ),
  'Retroactive update is audited'
);

set role authenticated;
select public.admin_revert_calculation_reprocess_v2(
  (select (response->'reprocessPlan'->>'id')::uuid
   from fixture_alias_publication),
  'Revert fixture retroactive link'
);

reset role;
select public.fixture_assert(
  (select target_stat_id is null
      and resolution_status = 'pending_alias'
   from public.equipment_calculation_effects_v2
   where id = '66666666-6666-4666-8666-666666666666'),
  'Reprocessing can restore the exact pending state'
);
select public.fixture_assert(
  exists (
    select 1 from public.fixture_audit
    where action = 'calculation_reprocess_reverted'
  ),
  'Retroactive reversal is audited'
);

insert into public.equipments(id, name, enabled)
values ('77777777-7777-4777-8777-777777777777', 'Equipamento futuro', true);
set role authenticated;

select public.admin_save_equipment_calculation_v2(
  '77777777-7777-4777-8777-777777777777',
  0,
  jsonb_build_array(jsonb_build_object(
    'id', '88888888-8888-4888-8888-888888888888',
    'kind', 'numeric',
    'description', 'À NOVA FORMA DE ARMADURA',
    'originalText', '-9% À NOVA FORMA DE ARMADURA',
    'normalizedText', 'a nova forma de armadura',
    'observedUnit', 'percent',
    'semanticContext', 'general',
    'resolvedAliasId', (
      select (response->'alias'->>'id')::uuid
      from fixture_alias_publication
    ),
    'definitionVersion', 1,
    'resolutionStatus', 'resolved',
    'sourceImageReference', 'future-equipment.png',
    'target', 'hero.armor',
    'operation', 'percent',
    'scope', 'self',
    'condition', 'always',
    'conditionExpected', null,
    'evaluatedOn', 'source',
    'sourceKind', 'game_capture',
    'sourceReference', 'game-capture:future-equipment',
    'order', 0,
    'values', jsonb_build_object(
      'comum', -1, 'raro', -2, 'epico', -3, 'lendario', -4,
      'mitico', -5, 'supremo', -6, 'grandioso', -7, 'celestial', -8,
      'estelar', -9, 'imortal', -10, 'divino', -11
    )
  )),
  'Save future equipment without code change'
);

reset role;
select public.fixture_assert(
  (select target_stat_id = 'hero.armor'
      and resolved_alias_id is not null
   from public.equipment_calculation_effects_v2
   where id = '88888888-8888-4888-8888-888888888888'),
  'A published alias resolves future equipment without code changes'
);

set role authenticated;
create temporary table fixture_resolution_coverage as
select public.admin_get_calculation_resolution_coverage_v2() as response;

reset role;
select public.fixture_assert(
  (select response->>'contract' = 'echo-calculation-resolution-coverage/v2'
      and (response->>'compatible')::boolean
      and jsonb_array_length(response->'definitions') > 0
      and jsonb_array_length(response->'aliases') > 0
      and jsonb_array_length(response->'operations') > 0
   from fixture_resolution_coverage),
  'The backend exposes one compatible semantic-resolution contract'
);
select public.fixture_assert(
  (select item->>'publicationStatus' = 'draft'
      and (item->>'workspaceRevision')::integer = 1
      and item->'effects'->0->>'resolutionStatus' = 'resolved'
      and item->'effects'->0->>'canonicalKey' = 'hero.armor'
      and item->'effects'->0->>'aliasState' = 'published'
      and item->'effects'->0->>'definitionState' = 'published'
      and item->'effects'->0->>'formulaState' = 'published'
      and item->'effects'->0->>'publicationStatus' = 'draft'
      and (item->'effects'->0->>'workspaceRevision')::integer = 1
      and item->'effects'->0->'publicationId' = 'null'::jsonb
      and item->'effects'->0->'rarityEvidence' is not null
   from fixture_resolution_coverage,
   lateral jsonb_array_elements(response->'equipment') item
   where item->>'equipmentId' = '77777777-7777-4777-8777-777777777777'),
  'A resolved draft is reported as recognized and awaiting publication, not unknown'
);

set role authenticated;
select public.admin_publish_equipment_calculation_v2(
  '77777777-7777-4777-8777-777777777777',
  1,
  0,
  'Publish the exact reviewed future-equipment revision'
);
create temporary table fixture_resolution_published as
select public.admin_get_calculation_resolution_coverage_v2() as response;

reset role;
select public.fixture_assert(
  (select item->>'publicationStatus' = 'published'
      and (item->'publication'->>'workspaceRevision')::integer
        = (item->>'workspaceRevision')::integer
      and item->'effects'->0->>'publicationStatus' = 'published'
      and item->'effects'->0->'publicationId' is not null
   from fixture_resolution_published,
   lateral jsonb_array_elements(response->'equipment') item
   where item->>'equipmentId' = '77777777-7777-4777-8777-777777777777'),
  'Publishing the same revision keeps semantic resolution and confirms the public snapshot'
);

set role authenticated;
select public.admin_create_calculation_definition_draft_v2(
  'weapon.quantum_stability',
  'Estabilidade quântica',
  'weapon',
  'quantum_stability',
  'aim_stability',
  'factor',
  'factor',
  'neutral',
  array['percent']::text[],
  8::smallint,
  2::smallint,
  'derived',
  null::numeric,
  'game-capture:unproven-new-mechanic',
  'Preserve new mechanic without formula'
);

reset role;
select public.fixture_assert(
  exists (
    select 1
    from public.calculation_definition_drafts_v2
    where canonical_key = 'weapon.quantum_stability'
      and state = 'draft'
      and policy_id is null
  )
  and not exists (
    select 1
    from public.calculation_stat_definitions_v2
    where id = 'weapon.quantum_stability'
  ),
  'A genuinely new mechanic remains pending until its formula is published'
);

select public.fixture_assert(
  (select count(*) >= 1
   from public.fixture_audit
   where action = 'calculation_alias_published'),
  'Alias publication is audited'
);
select public.fixture_assert(
  (select count(*) >= 1
   from public.fixture_audit
   where action = 'calculation_definition_draft_created'),
  'Definition draft creation is audited'
);

select 'Equipment semantic catalog fixture passed: exact aliases, safe pending mechanics, previewed and reversible reprocessing.' as result;
