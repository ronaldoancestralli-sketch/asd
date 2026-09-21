-- Echo Arena — autoridade única de cobertura semântica para editor e auditoria.
-- Migração progressiva: apenas adiciona um contrato administrativo de leitura.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

select pg_advisory_xact_lock(
  hashtextextended('echoarena:calculation-resolution-contract-v2:20260920', 0)
);

create function public.calculation_effect_resolution_json_v2(p_equipment_id uuid)
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
    'alias', case when matched_alias.id is null then null else jsonb_build_object(
      'id', matched_alias.id,
      'rawAlias', matched_alias.raw_alias,
      'normalizedAlias', matched_alias.normalized_alias,
      'state', matched_alias.state,
      'version', matched_alias.version
    ) end,
    'aliasState', matched_alias.state,
    'resolvedAliasId', fx.resolved_alias_id,
    'canonicalKey', fx.target_stat_id,
    'target', fx.target_stat_id,
    'definitionVersion', fx.definition_version,
    'definitionState', profile.state,
    'formulaState', profile.formula_state,
    'context', fx.semantic_context,
    'semanticContext', fx.semantic_context,
    'observedUnit', fx.observed_unit,
    'operation', fx.operation,
    'resolutionStatus', fx.resolution_status,
    'workspaceRevision', workspace.revision,
    'publicationId', publication.id,
    'publishedRevision', publication.workspace_revision,
    'publicationStatus', case
      when publication.id is null then 'draft'
      when publication.workspace_revision = workspace.revision then 'published'
      else 'stale_publication'
    end,
    'sourceImageReference', fx.source_image_reference,
    'rarityEvidence', fx.rarity_evidence,
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
  join public.equipment_calculation_workspaces_v2 workspace
    on workspace.equipment_id = fx.equipment_id
  left join public.equipment_calculation_publication_heads_v2 publication_head
    on publication_head.equipment_id = fx.equipment_id
  left join public.equipment_calculation_publications_v2 publication
    on publication.id = publication_head.publication_id
  left join lateral (
    select alias.*
    from public.calculation_attribute_aliases_v2 alias
    where alias.id = fx.resolved_alias_id
       or (
         fx.resolved_alias_id is null
         and alias.normalized_alias = fx.normalized_text
       )
    order by
      (alias.id = fx.resolved_alias_id) desc,
      (alias.state = 'published') desc,
      alias.version desc,
      alias.created_at desc
    limit 1
  ) matched_alias on true
  left join public.calculation_stat_definition_profiles_v2 profile
    on profile.definition_id = fx.target_stat_id
   and profile.version = fx.definition_version
  where fx.equipment_id = p_equipment_id
$$;

create function public.calculation_validate_workspace_resolution_v2(p_equipment_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.equipments equipment where equipment.id = p_equipment_id
  ) then
    raise exception 'CALCULATION_EQUIPMENT_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.equipment_calculation_effects_v2 fx
    where fx.equipment_id = p_equipment_id
      and fx.resolution_status = 'resolved'
      and not exists (
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
        where alias.id = fx.resolved_alias_id
          and alias.state = 'published'
          and alias.normalized_alias = fx.normalized_text
          and alias.target_stat_id = fx.target_stat_id
          and alias.context_id = fx.semantic_context
          and alias.definition_version = fx.definition_version
          and fx.operation = any(alias.allowed_operations)
          and fx.operation = any(profile.allowed_operations)
          and fx.observed_unit = any(alias.allowed_units)
          and fx.observed_unit = any(profile.accepted_units)
      )
  ) then
    raise exception 'CALCULATION_WORKSPACE_RESOLUTION_STALE';
  end if;

  if exists (
    select 1
    from public.equipment_calculation_effects_v2 fx
    where fx.equipment_id = p_equipment_id
      and (
        (fx.resolution_status = 'resolved' and (
          fx.target_stat_id is null
          or fx.resolved_alias_id is null
          or fx.semantic_context is null
          or fx.definition_version is null
        ))
        or (fx.resolution_status <> 'resolved' and (
          fx.target_stat_id is not null
          or fx.resolved_alias_id is not null
        ))
      )
  ) then
    raise exception 'CALCULATION_WORKSPACE_RESOLUTION_INVALID';
  end if;
end;
$$;

alter function public.admin_publish_equipment_calculation_v2(uuid, bigint, bigint, text)
  rename to admin_publish_equipment_calculation_semantic_legacy_v2;

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
begin
  perform public.echo_require_admin_capability('equipment.publish');
  perform public.calculation_validate_workspace_resolution_v2(p_equipment_id);
  return public.admin_publish_equipment_calculation_semantic_legacy_v2(
    p_equipment_id,
    p_expected_revision,
    p_expected_publication,
    p_reason
  );
end;
$$;

create function public.admin_get_calculation_resolution_coverage_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_catalog jsonb;
  v_result jsonb;
begin
  perform public.echo_require_admin_capability('equipment.view');

  v_catalog := jsonb_build_object(
    'definitions', public.calculation_definitions_json_v2(),
    'aliases', public.calculation_aliases_json_v2(),
    'contexts', public.calculation_contexts_json_v2(),
    'operations', public.calculation_operations_json_v2()
  );

  v_result := jsonb_build_object(
    'contract', 'echo-calculation-resolution-coverage/v2',
    'compatible', true,
    'catalogRevision', public.calculation_hash_v2(v_catalog),
    'definitions', v_catalog->'definitions',
    'aliases', v_catalog->'aliases',
    'contexts', v_catalog->'contexts',
    'operations', v_catalog->'operations',
    'equipment', coalesce((
      select jsonb_agg(jsonb_build_object(
        'equipment', jsonb_build_object(
          'id', equipment.id,
          'name', equipment.name,
          'enabled', equipment.enabled
        ),
        'equipmentId', equipment.id,
        'equipmentName', equipment.name,
        'revision', coalesce(workspace.revision, 0),
        'workspaceRevision', coalesce(workspace.revision, 0),
        'workspaceStatus', case
          when workspace.equipment_id is null then 'empty'
          when publication.workspace_revision = workspace.revision then 'published'
          else 'draft'
        end,
        'publicationStatus', case
          when publication.id is null then 'draft'
          when publication.workspace_revision = coalesce(workspace.revision, 0) then 'published'
          else 'stale_publication'
        end,
        'publication', case when publication.id is null then null else jsonb_build_object(
          'id', publication.id,
          'revision', publication.workspace_revision,
          'workspaceRevision', publication.workspace_revision,
          'fingerprint', publication.fingerprint,
          'publishedAt', publication.created_at,
          'status', case
            when publication.workspace_revision = coalesce(workspace.revision, 0)
              then 'published'
            else 'stale_publication'
          end
        ) end,
        'published', case when publication.id is null then null else jsonb_build_object(
          'id', publication.id,
          'workspaceRevision', publication.workspace_revision,
          'fingerprint', publication.fingerprint,
          'publishedAt', publication.created_at
        ) end,
        'effects', public.calculation_effect_resolution_json_v2(equipment.id)
      ) order by equipment.name, equipment.id)
      from public.equipments equipment
      left join public.equipment_calculation_workspaces_v2 workspace
        on workspace.equipment_id = equipment.id
      left join public.equipment_calculation_publication_heads_v2 publication_head
        on publication_head.equipment_id = equipment.id
      left join public.equipment_calculation_publications_v2 publication
        on publication.id = publication_head.publication_id
    ), '[]'::jsonb),
    'generatedAt', statement_timestamp()
  );

  return v_result;
end;
$$;

revoke all on function
  public.calculation_effect_resolution_json_v2(uuid),
  public.calculation_validate_workspace_resolution_v2(uuid),
  public.admin_publish_equipment_calculation_semantic_legacy_v2(uuid, bigint, bigint, text),
  public.admin_publish_equipment_calculation_v2(uuid, bigint, bigint, text),
  public.admin_get_calculation_resolution_coverage_v2()
from public, anon, authenticated, service_role;

grant execute on function
  public.admin_publish_equipment_calculation_v2(uuid, bigint, bigint, text),
  public.admin_get_calculation_resolution_coverage_v2()
to authenticated;

comment on function public.admin_get_calculation_resolution_coverage_v2() is
  'Single capability-checked semantic resolution contract for equipment forms, simulations and audits; publication status is independent from semantic resolution.';

commit;
