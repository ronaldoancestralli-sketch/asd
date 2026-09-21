-- Echo Brain — reconstrução transacional do grafo e investigação administrativa.

create or replace function public.admin_echo_brain_replace_semantic_edges(p_edges jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_season_id uuid;
  v_game_version text;
  v_inserted integer := 0;
  r jsonb;
begin
  if not public.echo_is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_edges,'[]'::jsonb)) <> 'array' then raise exception 'edges_array_required'; end if;

  select id,game_version into v_season_id,v_game_version
  from public.seasons where active is true
  order by starts_at desc nulls last,created_at desc limit 1;

  update public.echo_brain_semantic_edges
  set active=false,updated_at=now()
  where active is true and (season_id is not distinct from v_season_id);

  for r in select value from jsonb_array_elements(coalesce(p_edges,'[]'::jsonb))
  loop
    if coalesce(r->>'sourceType','')='' or coalesce(r->>'sourceId','')='' or
       coalesce(r->>'relation','')='' or coalesce(r->>'targetType','')='' or coalesce(r->>'targetId','')='' then
      continue;
    end if;
    insert into public.echo_brain_semantic_edges(
      season_id,game_version,source_type,source_id,relation,target_type,target_id,
      weight,confidence,evidence,source_fingerprint,active,updated_at
    ) values (
      v_season_id,v_game_version,r->>'sourceType',r->>'sourceId',r->>'relation',r->>'targetType',r->>'targetId',
      greatest(-1,least(1,coalesce((r->>'weight')::numeric,1))),
      greatest(0,least(1,coalesce((r->>'confidence')::numeric,1))),
      coalesce(r->'evidence','{}'::jsonb),nullif(r->>'sourceFingerprint',''),true,now()
    );
    v_inserted := v_inserted + 1;
  end loop;

  -- O grafo e os scorers determinísticos passam a ler o estado atual. Isso
  -- resolve apenas superfícies recalculáveis ao vivo. Treino e simulação não.
  update public.echo_brain_knowledge_invalidations
  set status='resolved',resolved_at=now()
  where status='pending' and scope in ('build_recommendations','composition_recommendations');

  return jsonb_build_object('ok',true,'inserted',v_inserted,'seasonId',v_season_id,'gameVersion',v_game_version);
end;
$$;

revoke all on function public.admin_echo_brain_replace_semantic_edges(jsonb) from public,anon;
grant execute on function public.admin_echo_brain_replace_semantic_edges(jsonb) to authenticated;

create or replace function public.admin_echo_brain_investigation_snapshot(
  p_hero_ids text[] default '{}'::text[],
  p_equipment_ids text[] default '{}'::text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_knowledge jsonb;
  v_equipment jsonb;
  v_edges jsonb;
  v_invalidations jsonb;
  v_decisions jsonb;
  v_counterfactuals jsonb;
  v_exposures bigint;
  v_brain_exposed bigint;
begin
  if not public.echo_is_admin() then raise exception 'admin_required' using errcode='42501'; end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.entity_id,x.version desc),'[]'::jsonb) into v_knowledge
  from (
    select entity_type,entity_id,version,game_version,semantic_fingerprint,change_class,created_at
    from public.echo_brain_knowledge_versions
    where entity_id=any(coalesce(p_hero_ids,'{}'::text[]))
    order by entity_id,version desc
    limit 100
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.equipment_id,x.version desc),'[]'::jsonb) into v_equipment
  from (
    select equipment_id,version,game_version,semantic_fingerprint,change_class,severity,affects_brain,requires_reevaluation,requires_retraining,created_at
    from public.equipment_brain_versions
    where equipment_id=any(coalesce(p_equipment_ids,'{}'::text[]))
    order by equipment_id,version desc
    limit 100
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.source_type,x.source_id,x.relation),'[]'::jsonb) into v_edges
  from (
    select source_type,source_id,relation,target_type,target_id,weight,confidence,evidence,game_version,updated_at
    from public.echo_brain_semantic_edges
    where active is true and (
      source_id=any(coalesce(p_hero_ids,'{}'::text[])) or source_id=any(coalesce(p_equipment_ids,'{}'::text[])) or
      target_id=any(coalesce(p_hero_ids,'{}'::text[])) or target_id=any(coalesce(p_equipment_ids,'{}'::text[]))
    )
    limit 300
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_invalidations
  from (
    select 'knowledge'::text source,entity_type,entity_id,scope,status,reason,created_at,resolved_at
    from public.echo_brain_knowledge_invalidations
    where entity_id=any(coalesce(p_hero_ids,'{}'::text[]))
    union all
    select 'equipment'::text,'equipment',equipment_id,scope,status,reason,created_at,resolved_at
    from public.equipment_brain_invalidations
    where equipment_id=any(coalesce(p_equipment_ids,'{}'::text[]))
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_decisions
  from (
    select id,decision_type,entity_key,semantic_schema,model_version,scores,confidence,explanation,provenance,created_at
    from public.echo_brain_decision_audits
    where entity_key like any(
      select '%'||value||'%' from unnest(coalesce(p_hero_ids,'{}'::text[])||coalesce(p_equipment_ids,'{}'::text[])) value
    )
    order by created_at desc limit 30
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_counterfactuals
  from (
    select id,domain,baseline_key,candidate_key,baseline_score,candidate_score,delta,changed_components,confidence,semantic_schema,created_at
    from public.echo_brain_counterfactual_audits
    where baseline_key like any(select '%'||value||'%' from unnest(coalesce(p_hero_ids,'{}'::text[])) value)
       or candidate_key like any(select '%'||value||'%' from unnest(coalesce(p_hero_ids,'{}'::text[])) value)
    order by created_at desc limit 30
  ) x;

  select count(*) into v_exposures from public.echo_brain_recommendation_exposures;
  select count(*) into v_brain_exposed from public.composition_match_observations where recommended_by_brain is true or observation_provenance='brain_exposed';

  return jsonb_build_object(
    'knowledgeVersions',coalesce(v_knowledge,'[]'::jsonb),
    'equipmentVersions',coalesce(v_equipment,'[]'::jsonb),
    'edges',coalesce(v_edges,'[]'::jsonb),
    'invalidations',coalesce(v_invalidations,'[]'::jsonb),
    'decisions',coalesce(v_decisions,'[]'::jsonb),
    'counterfactuals',coalesce(v_counterfactuals,'[]'::jsonb),
    'provenance',jsonb_build_object('recommendationExposures',v_exposures,'brainExposedObservations',v_brain_exposed)
  );
end;
$$;

revoke all on function public.admin_echo_brain_investigation_snapshot(text[],text[]) from public,anon;
grant execute on function public.admin_echo_brain_investigation_snapshot(text[],text[]) to authenticated;

comment on function public.admin_echo_brain_replace_semantic_edges(jsonb) is 'Substitui o grafo ativo em uma transação lógica e só então resolve invalidações determinísticas.';
comment on function public.admin_echo_brain_investigation_snapshot(text[],text[]) is 'Snapshot administrativo para rastrear versões, grafo, invalidações, decisões, contrafactuais e proveniência.';
