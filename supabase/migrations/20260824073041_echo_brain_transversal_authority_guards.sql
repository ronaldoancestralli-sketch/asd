-- Echo Brain: invariantes transversais de autoridade pública.
-- 1. O anti-feedback-loop é permanente, não uma preferência desligável.
-- 2. O rebuild Admin do grafo valida fonte/cobertura antes de substituir o
--    grafo ativo e só resolve dívida das entidades efetivamente cobertas.

update public.echo_brain_settings
set organic_training_only=true
where organic_training_only is distinct from true;

alter table public.echo_brain_settings
  drop constraint if exists echo_brain_settings_organic_training_only_true;
alter table public.echo_brain_settings
  add constraint echo_brain_settings_organic_training_only_true
  check (organic_training_only is true);

create or replace function public.admin_echo_brain_replace_semantic_edges(p_edges jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_season_id uuid;
  v_game_version text;
  v_inserted integer := 0;
  v_reactivated integer := 0;
  v_expected_heroes integer := 0;
  v_received_heroes integer := 0;
  v_expected_skills integer := 0;
  v_received_skills integer := 0;
  v_expected_equipment integer := 0;
  v_received_equipment integer := 0;
  v_resolved_entity_ids text[] := '{}'::text[];
  v_graph_fingerprint text := null;
  v_fingerprint text;
  v_source_type text;
  v_source_id text;
  v_relation text;
  v_target_type text;
  v_target_id text;
  v_weight numeric;
  v_confidence numeric;
  v_was_existing boolean;
  r jsonb;
begin
  if not public.echo_is_admin() then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if p_edges is null or jsonb_typeof(p_edges) <> 'array' then
    raise exception 'edges_array_required';
  end if;
  if jsonb_array_length(p_edges) = 0 then
    raise exception 'semantic_edges_cannot_be_empty';
  end if;
  if jsonb_array_length(p_edges) > 20000 then
    raise exception 'semantic_edges_limit_exceeded';
  end if;

  select s.id,s.game_version into v_season_id,v_game_version
  from public.seasons s
  where s.active is true
  order by s.starts_at desc nulls last,s.created_at desc
  limit 1;
  if v_season_id is null or nullif(trim(coalesce(v_game_version,'')),'') is null then
    raise exception 'active_versioned_season_required';
  end if;

  -- Primeiro valida o payload inteiro. Nenhuma aresta ativa muda antes de toda
  -- a estrutura, identidade e proveniência serem aceitas.
  for r in select value from jsonb_array_elements(p_edges)
  loop
    if jsonb_typeof(r) <> 'object' then
      raise exception 'semantic_edge_object_required';
    end if;
    v_source_type := trim(coalesce(r->>'sourceType',''));
    v_source_id := trim(coalesce(r->>'sourceId',''));
    v_relation := trim(coalesce(r->>'relation',''));
    v_target_type := trim(coalesce(r->>'targetType',''));
    v_target_id := trim(coalesce(r->>'targetId',''));
    v_fingerprint := trim(coalesce(r->>'sourceFingerprint',''));

    if v_source_type not in ('hero','skill','effect','equipment','set','set_bonus')
       or v_target_type not in ('skill','effect','stat','trigger','set_bonus') then
      raise exception 'semantic_edge_type_invalid';
    end if;
    if v_relation not in ('has_skill','produces_effect','maps_to_stat','values_stat','uses_trigger','modifies_stat','unlocks_bonus') then
      raise exception 'semantic_edge_relation_invalid';
    end if;
    if length(v_source_id) not between 1 and 256 or length(v_target_id) not between 1 and 256 then
      raise exception 'semantic_edge_identity_invalid';
    end if;
    if not (
      (v_relation='has_skill' and v_source_type='hero' and v_target_type='skill') or
      (v_relation='produces_effect' and v_source_type in ('skill','equipment','set_bonus') and v_target_type='effect') or
      (v_relation='maps_to_stat' and v_source_type='effect' and v_target_type='stat') or
      (v_relation='values_stat' and v_source_type='hero' and v_target_type='stat') or
      (v_relation='uses_trigger' and v_source_type in ('skill','equipment') and v_target_type='trigger') or
      (v_relation='modifies_stat' and v_source_type in ('equipment','set_bonus') and v_target_type='stat') or
      (v_relation='unlocks_bonus' and v_source_type='set' and v_target_type='set_bonus')
    ) then
      raise exception 'semantic_edge_relation_invalid';
    end if;
    if v_fingerprint !~ '^[0-9a-f]{64}:[a-z_]+:.{1,256}$'
       or split_part(v_fingerprint,':',2) <> v_source_type
       or substring(v_fingerprint from length(split_part(v_fingerprint,':',1))+length(split_part(v_fingerprint,':',2))+3) <> v_source_id then
      raise exception 'semantic_edge_fingerprint_invalid';
    end if;
    if v_graph_fingerprint is null then
      v_graph_fingerprint := split_part(v_fingerprint,':',1);
    elsif v_graph_fingerprint <> split_part(v_fingerprint,':',1) then
      raise exception 'semantic_graph_fingerprint_mismatch';
    end if;
    if jsonb_typeof(coalesce(r->'evidence','{}'::jsonb)) <> 'object' then
      raise exception 'semantic_edge_evidence_invalid';
    end if;

    begin
      v_weight := coalesce((r->>'weight')::numeric,1);
      v_confidence := coalesce((r->>'confidence')::numeric,1);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'semantic_edge_numeric_invalid';
    end;
    if v_weight < -1 or v_weight > 1 or v_confidence < 0 or v_confidence > 1 then
      raise exception 'semantic_edge_numeric_invalid';
    end if;

    if v_source_type='hero' and not exists(
      select 1 from public.heroes h where h.id::text=v_source_id and h.enabled is true
    ) then raise exception 'semantic_edge_source_unknown'; end if;
    if v_source_type='skill' and not exists(
      select 1 from public.hero_skills s
      where s.id::text=v_source_id and s.enabled is true
        and s.verification_status='verified' and s.needs_recheck is false
    ) then raise exception 'semantic_edge_source_unverified'; end if;
    if v_source_type='equipment' and not exists(
      select 1 from public.equipments e where e.id::text=v_source_id and e.enabled is true
    ) then raise exception 'semantic_edge_source_unknown'; end if;
    if v_source_type='set' and not exists(
      select 1 from public.equipment_sets s where s.id::text=v_source_id
    ) then raise exception 'semantic_edge_source_unknown'; end if;
    if v_source_type='set_bonus' and not exists(
      select 1 from public.equipment_set_bonuses b where b.id::text=v_source_id
    ) then raise exception 'semantic_edge_source_unknown'; end if;
    if v_target_type='skill' and not exists(
      select 1 from public.hero_skills s
      where s.id::text=v_target_id and s.hero_id::text=v_source_id
        and s.enabled is true and s.verification_status='verified' and s.needs_recheck is false
    ) then raise exception 'semantic_edge_target_unverified'; end if;
    if v_target_type='set_bonus' and not exists(
      select 1 from public.equipment_set_bonuses b where b.id::text=v_target_id and b.set_id::text=v_source_id
    ) then raise exception 'semantic_edge_target_unknown'; end if;
  end loop;

  select count(distinct h.id) into v_expected_heroes
  from public.heroes h
  where h.enabled is true and exists(
    select 1 from public.hero_skills s
    where s.hero_id=h.id and s.enabled is true
      and s.verification_status='verified' and s.needs_recheck is false
  );
  select count(distinct edge->>'sourceId') into v_received_heroes
  from jsonb_array_elements(p_edges) as payload(edge)
  where edge->>'sourceType'='hero' and edge->>'relation'='has_skill';

  select count(*) into v_expected_skills
  from public.hero_skills s
  join public.heroes h on h.id=s.hero_id and h.enabled is true
  where s.enabled is true and s.verification_status='verified' and s.needs_recheck is false;
  select count(distinct edge->>'targetId') into v_received_skills
  from jsonb_array_elements(p_edges) as payload(edge)
  where edge->>'sourceType'='hero' and edge->>'relation'='has_skill' and edge->>'targetType'='skill';

  select count(distinct e.id) into v_expected_equipment
  from public.equipments e
  join public.equipment_variants v on v.equipment_id=e.id
  where e.enabled is true and v.attributes is not null
    and v.attributes <> '{}'::jsonb and v.attributes <> '[]'::jsonb;
  select count(distinct edge->>'sourceId') into v_received_equipment
  from jsonb_array_elements(p_edges) as payload(edge)
  where edge->>'sourceType'='equipment' and edge->>'relation'='modifies_stat';

  if v_received_heroes <> v_expected_heroes or v_received_skills <> v_expected_skills
     or v_received_equipment <> v_expected_equipment then
    raise exception 'semantic_graph_coverage_incomplete';
  end if;
  if exists(
    select 1 from public.equipments e
    join public.equipment_variants v on v.equipment_id=e.id
    where e.enabled is true and v.attributes is not null
      and v.attributes <> '{}'::jsonb and v.attributes <> '[]'::jsonb
      and not exists(
        select 1 from jsonb_array_elements(p_edges) as payload(edge)
        where edge->>'sourceType'='equipment' and edge->>'relation'='modifies_stat'
          and edge->>'sourceId'=e.id::text
      )
  ) then
    raise exception 'semantic_graph_coverage_incomplete';
  end if;

  update public.echo_brain_semantic_edges e
  set active=false,updated_at=now()
  where e.active is true and e.season_id=v_season_id;

  for r in select value from jsonb_array_elements(p_edges)
  loop
    v_source_type := trim(r->>'sourceType');
    v_source_id := trim(r->>'sourceId');
    v_relation := trim(r->>'relation');
    v_target_type := trim(r->>'targetType');
    v_target_id := trim(r->>'targetId');
    v_fingerprint := trim(r->>'sourceFingerprint');

    select exists(
      select 1 from public.echo_brain_semantic_edges e
      where e.season_id=v_season_id and e.source_type=v_source_type and e.source_id=v_source_id
        and e.relation=v_relation and e.target_type=v_target_type and e.target_id=v_target_id
        and e.source_fingerprint=v_fingerprint
    ) into v_was_existing;

    insert into public.echo_brain_semantic_edges(
      season_id,game_version,source_type,source_id,relation,target_type,target_id,
      weight,confidence,evidence,source_fingerprint,active,updated_at
    ) values (
      v_season_id,v_game_version,v_source_type,v_source_id,v_relation,v_target_type,v_target_id,
      coalesce((r->>'weight')::numeric,1),coalesce((r->>'confidence')::numeric,1),
      coalesce(r->'evidence','{}'::jsonb),v_fingerprint,true,now()
    )
    on conflict (season_id,source_type,source_id,relation,target_type,target_id,source_fingerprint)
    do update set
      game_version=excluded.game_version,weight=excluded.weight,confidence=excluded.confidence,
      evidence=excluded.evidence,active=true,updated_at=now();

    if v_was_existing then v_reactivated := v_reactivated+1;
    else v_inserted := v_inserted+1;
    end if;
  end loop;

  with resolved as (
    update public.echo_brain_knowledge_invalidations i
    set status='resolved',resolved_at=now()
    where i.status='pending'
      and i.scope in ('build_recommendations','composition_recommendations')
      and i.entity_type='hero_profile'
      and exists(
        select 1 from public.echo_brain_semantic_edges e
        where e.active is true and e.season_id=v_season_id
          and e.source_type='hero' and e.relation='has_skill' and e.source_id=i.entity_id
      )
    returning i.entity_id
  )
  select coalesce(array_agg(distinct entity_id),'{}'::text[])
  into v_resolved_entity_ids from resolved;

  return jsonb_build_object(
    'ok',true,
    'inserted',v_inserted,
    'reactivated',v_reactivated,
    'activeEdges',(select count(*) from public.echo_brain_semantic_edges e where e.active is true and e.season_id=v_season_id),
    'seasonId',v_season_id,
    'gameVersion',v_game_version,
    'graphFingerprint',v_graph_fingerprint,
    'resolvedEntityIds',to_jsonb(v_resolved_entity_ids),
    'coverage',jsonb_build_object(
      'heroes',v_received_heroes,'skills',v_received_skills,'equipment',v_received_equipment
    ),
    'idempotent',true
  );
end;
$$;

revoke all on function public.admin_echo_brain_replace_semantic_edges(jsonb) from public,anon;
grant execute on function public.admin_echo_brain_replace_semantic_edges(jsonb) to authenticated;

comment on function public.admin_echo_brain_replace_semantic_edges(jsonb) is
  'Rebuild Admin transacional: valida tipos, relações, SHA-256, fonte verificada e cobertura completa; resolve apenas dívida dos heróis cobertos pelo grafo ativo.';
