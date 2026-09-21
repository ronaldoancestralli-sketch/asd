-- Echo Brain — proveniência de recomendação no pipeline de observações.
-- Uma recomendação sem modelo aprendido (Semantic v4 puro) também é exposição do
-- produto e NÃO pode voltar ao treino como evidência orgânica.

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid='public.composition_match_observations'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) ilike '%recommended_by_brain%'
      and pg_get_constraintdef(oid) ilike '%recommendation_model_id%'
  loop
    execute format('alter table public.composition_match_observations drop constraint %I',r.conname);
  end loop;
end;
$$;

alter table public.composition_match_observations
  add constraint composition_match_observations_recommendation_provenance_check
  check (
    not recommended_by_brain
    or recommendation_model_id is not null
    or recommendation_exposure_id is not null
  );

create or replace function public.admin_echo_brain_ingest_observations(
  p_source_name text,
  p_source_type text,
  p_source_ref text,
  p_trust_level text,
  p_season_id uuid,
  p_observations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch_id uuid;
  v_fingerprint text;
  v_rows_received integer;
  v_rows_accepted integer := 0;
  v_rows_duplicate integer := 0;
  v_rows_exposed integer := 0;
  v_item jsonb;
  v_sorted uuid[];
  v_sorted_opponents uuid[];
  v_match_key text;
  v_outcome text;
  v_occurred_at timestamptz;
  v_recommended boolean;
  v_recommendation_model uuid;
  v_exposure_id uuid;
  v_exposure_model uuid;
  v_inserted uuid;
  v_provenance text;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if coalesce(length(trim(p_source_name)),0) < 2 then raise exception 'source_name_required'; end if;
  if p_source_type not in ('official','partner','admin_import','manual_verified') then raise exception 'invalid_source_type'; end if;
  if p_trust_level not in ('verified','corroborated','review') then raise exception 'invalid_trust_level'; end if;
  if p_season_id is null or not exists(select 1 from public.seasons where id=p_season_id) then raise exception 'valid_season_required'; end if;
  if jsonb_typeof(p_observations) <> 'array' then raise exception 'observations_array_required'; end if;
  v_rows_received := jsonb_array_length(p_observations);
  if v_rows_received < 1 or v_rows_received > 5000 then raise exception 'observation_batch_size_invalid'; end if;

  v_fingerprint := encode(digest(concat_ws('|',trim(p_source_name),coalesce(trim(p_source_ref),''),p_season_id::text,p_observations::text),'sha256'),'hex');
  select id into v_batch_id from public.composition_observation_batches where batch_fingerprint=v_fingerprint;
  if found then return jsonb_build_object('status','duplicate_batch','batch_id',v_batch_id,'rows_received',v_rows_received); end if;

  insert into public.composition_observation_batches(source_name,source_type,source_ref,trust_level,season_id,batch_fingerprint,rows_received,imported_by)
  values(trim(p_source_name),p_source_type,nullif(trim(coalesce(p_source_ref,'')),''),p_trust_level,p_season_id,v_fingerprint,v_rows_received,auth.uid())
  returning id into v_batch_id;

  for v_item in select value from jsonb_array_elements(p_observations)
  loop
    v_match_key := trim(coalesce(v_item->>'matchKey',''));
    v_outcome := lower(trim(coalesce(v_item->>'outcome','')));
    if length(v_match_key)<1 then raise exception 'match_key_required'; end if;
    if v_outcome not in ('win','loss') then raise exception 'invalid_outcome:%',v_match_key; end if;
    begin v_occurred_at := (v_item->>'occurredAt')::timestamptz; exception when others then raise exception 'invalid_occurred_at:%',v_match_key; end;
    if v_occurred_at > now() + interval '5 minutes' then raise exception 'future_observation:%',v_match_key; end if;

    select array_agg(value::uuid order by value) into v_sorted from jsonb_array_elements_text(v_item->'heroes') x(value);
    if coalesce(array_length(v_sorted,1),0)<>3 or v_sorted[1]=v_sorted[2] or v_sorted[1]=v_sorted[3] or v_sorted[2]=v_sorted[3] then raise exception 'three_distinct_heroes_required:%',v_match_key; end if;
    if (select count(*) from public.heroes where id=any(v_sorted) and enabled=true)<>3 then raise exception 'active_heroes_required:%',v_match_key; end if;

    v_sorted_opponents := null;
    if v_item ? 'opponents' and jsonb_typeof(v_item->'opponents')='array' and jsonb_array_length(v_item->'opponents')>0 then
      select array_agg(value::uuid order by value) into v_sorted_opponents from jsonb_array_elements_text(v_item->'opponents') x(value);
      if array_length(v_sorted_opponents,1)<>3 or v_sorted_opponents[1]=v_sorted_opponents[2] or v_sorted_opponents[1]=v_sorted_opponents[3] or v_sorted_opponents[2]=v_sorted_opponents[3] then raise exception 'three_distinct_opponents_required:%',v_match_key; end if;
      if (select count(*) from public.heroes where id=any(v_sorted_opponents) and enabled=true)<>3 then raise exception 'active_opponents_required:%',v_match_key; end if;
    end if;

    v_exposure_id := null;
    begin
      v_exposure_id := nullif(v_item->>'recommendationExposureId','')::uuid;
    exception when others then raise exception 'invalid_recommendation_exposure:%',v_match_key;
    end;
    v_recommendation_model := null;
    begin
      v_recommendation_model := nullif(v_item->>'recommendationModelId','')::uuid;
    exception when others then raise exception 'invalid_recommendation_model:%',v_match_key;
    end;

    if v_exposure_id is not null then
      select model_id into v_exposure_model from public.echo_brain_recommendation_exposures where id=v_exposure_id;
      if not found then raise exception 'recommendation_exposure_unknown:%',v_match_key; end if;
      if v_recommendation_model is null then v_recommendation_model := v_exposure_model; end if;
      v_recommended := true;
      v_provenance := 'brain_exposed';
      v_rows_exposed := v_rows_exposed + 1;
    else
      v_recommended := coalesce((v_item->>'recommendedByBrain')::boolean,false);
      v_provenance := case when v_recommended then 'brain_exposed' when p_source_type='admin_import' then 'admin_import' else 'organic' end;
    end if;

    if v_recommendation_model is not null and not exists(select 1 from public.composition_model_versions where id=v_recommendation_model) then raise exception 'recommendation_model_unknown:%',v_match_key; end if;
    if v_recommended and v_recommendation_model is null and v_exposure_id is null then raise exception 'recommendation_provenance_required:%',v_match_key; end if;

    v_inserted := null;
    insert into public.composition_match_observations(
      batch_id,source_name,external_match_key,trust_level,season_id,
      hero_1_id,hero_2_id,hero_3_id,opponent_1_id,opponent_2_id,opponent_3_id,
      outcome,recommended_by_brain,recommendation_model_id,recommendation_exposure_id,
      observation_provenance,occurred_at,metadata
    ) values (
      v_batch_id,trim(p_source_name),v_match_key,p_trust_level,p_season_id,
      v_sorted[1],v_sorted[2],v_sorted[3],v_sorted_opponents[1],v_sorted_opponents[2],v_sorted_opponents[3],
      v_outcome,v_recommended,v_recommendation_model,v_exposure_id,v_provenance,v_occurred_at,coalesce(v_item->'metadata','{}'::jsonb)
    )
    on conflict(source_name,external_match_key) do nothing returning id into v_inserted;
    if v_inserted is null then v_rows_duplicate:=v_rows_duplicate+1; else v_rows_accepted:=v_rows_accepted+1; end if;
  end loop;

  update public.composition_observation_batches set rows_accepted=v_rows_accepted,rows_duplicate=v_rows_duplicate where id=v_batch_id;
  insert into public.echo_brain_actions(action_type,actor_id,reason,details)
  values('ingest',auth.uid(),trim(p_source_name),jsonb_build_object(
    'batch_id',v_batch_id,'trust_level',p_trust_level,'rows_received',v_rows_received,
    'rows_accepted',v_rows_accepted,'rows_duplicate',v_rows_duplicate,'rows_brain_exposed',v_rows_exposed,
    'season_id',p_season_id,'feedback_loop_guard',true
  ));
  return jsonb_build_object('status','ingested','batch_id',v_batch_id,'rows_received',v_rows_received,'rows_accepted',v_rows_accepted,'rows_duplicate',v_rows_duplicate,'rows_brain_exposed',v_rows_exposed);
end;
$$;

revoke all on function public.admin_echo_brain_ingest_observations(text,text,text,text,uuid,jsonb) from public,anon;
grant execute on function public.admin_echo_brain_ingest_observations(text,text,text,text,uuid,jsonb) to authenticated;

comment on column public.composition_match_observations.observation_provenance is 'organic=independente do Echo Arena; brain_exposed=recomendação foi mostrada antes da partida; unknown nunca deve ser promovido a orgânico automaticamente.';
