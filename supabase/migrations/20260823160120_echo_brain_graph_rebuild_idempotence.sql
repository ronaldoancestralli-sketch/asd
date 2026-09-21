-- Echo Brain — rebuild idempotente do grafo semântico.
-- Reconstruir a mesma fonte não pode colidir com arestas inativas do mesmo fingerprint.

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
  v_reactivated integer := 0;
  r jsonb;
  v_was_existing boolean;
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

    select exists(
      select 1 from public.echo_brain_semantic_edges e
      where e.season_id is not distinct from v_season_id
        and e.source_type=r->>'sourceType'
        and e.source_id=r->>'sourceId'
        and e.relation=r->>'relation'
        and e.target_type=r->>'targetType'
        and e.target_id=r->>'targetId'
        and e.source_fingerprint is not distinct from nullif(r->>'sourceFingerprint','')
    ) into v_was_existing;

    -- ON CONFLICT handles normal non-null season/fingerprint identity. The
    -- explicit lookup/update branch handles NULL semantics safely as well.
    if v_was_existing then
      update public.echo_brain_semantic_edges e set
        game_version=v_game_version,
        weight=greatest(-1,least(1,coalesce((r->>'weight')::numeric,1))),
        confidence=greatest(0,least(1,coalesce((r->>'confidence')::numeric,1))),
        evidence=coalesce(r->'evidence','{}'::jsonb),
        active=true,
        updated_at=now()
      where e.season_id is not distinct from v_season_id
        and e.source_type=r->>'sourceType'
        and e.source_id=r->>'sourceId'
        and e.relation=r->>'relation'
        and e.target_type=r->>'targetType'
        and e.target_id=r->>'targetId'
        and e.source_fingerprint is not distinct from nullif(r->>'sourceFingerprint','');
      v_reactivated := v_reactivated + 1;
    else
      insert into public.echo_brain_semantic_edges(
        season_id,game_version,source_type,source_id,relation,target_type,target_id,
        weight,confidence,evidence,source_fingerprint,active,updated_at
      ) values (
        v_season_id,v_game_version,r->>'sourceType',r->>'sourceId',r->>'relation',r->>'targetType',r->>'targetId',
        greatest(-1,least(1,coalesce((r->>'weight')::numeric,1))),
        greatest(0,least(1,coalesce((r->>'confidence')::numeric,1))),
        coalesce(r->'evidence','{}'::jsonb),nullif(r->>'sourceFingerprint',''),true,now()
      )
      on conflict (season_id,source_type,source_id,relation,target_type,target_id,source_fingerprint)
      do update set
        game_version=excluded.game_version,
        weight=excluded.weight,
        confidence=excluded.confidence,
        evidence=excluded.evidence,
        active=true,
        updated_at=now();
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  update public.echo_brain_knowledge_invalidations
  set status='resolved',resolved_at=now()
  where status='pending' and scope in ('build_recommendations','composition_recommendations');

  return jsonb_build_object(
    'ok',true,
    'inserted',v_inserted,
    'reactivated',v_reactivated,
    'activeEdges',(select count(*) from public.echo_brain_semantic_edges where active is true and season_id is not distinct from v_season_id),
    'seasonId',v_season_id,
    'gameVersion',v_game_version,
    'idempotent',true
  );
end;
$$;

revoke all on function public.admin_echo_brain_replace_semantic_edges(jsonb) from public,anon;
grant execute on function public.admin_echo_brain_replace_semantic_edges(jsonb) to authenticated;

comment on function public.admin_echo_brain_replace_semantic_edges(jsonb) is
  'Rebuild transacional/idempotente do grafo: aresta igual é reativada/atualizada em vez de duplicada ou rejeitada.';
