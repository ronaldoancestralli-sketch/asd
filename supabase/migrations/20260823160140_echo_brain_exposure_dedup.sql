-- Echo Brain — exposição pública estreita, deduplicada e sem identidade do usuário.
-- A RPC não é label de treino; serve apenas para impedir que resultado posterior
-- influenciado pelo produto seja confundido com observação orgânica.

create or replace function public.echo_brain_register_recommendation_exposure(
  p_surface text,
  p_entity_key text,
  p_semantic_schema text default null,
  p_model_id uuid default null,
  p_model_version integer default null,
  p_brain_influence numeric default 0,
  p_context_hash text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_id uuid;
  v_surface text := trim(coalesce(p_surface,''));
  v_entity text := trim(coalesce(p_entity_key,''));
  v_context text := trim(coalesce(p_context_hash,''));
begin
  if v_surface not in ('composition_lab','build_lab','comparison','other') then raise exception 'invalid_surface'; end if;
  if length(v_entity) < 3 or length(v_entity) > 256 then raise exception 'entity_key_invalid'; end if;
  if length(v_context) < 3 or length(v_context) > 160 then raise exception 'context_hash_required'; end if;
  if p_semantic_schema is not null and length(p_semantic_schema) > 96 then raise exception 'semantic_schema_invalid'; end if;

  -- Serializa o mesmo evento lógico para impedir double-click/rerender concorrente.
  perform pg_advisory_xact_lock(hashtextextended(v_surface||'|'||v_entity||'|'||v_context,0));

  select id into v_id
  from public.echo_brain_recommendation_exposures
  where surface=v_surface
    and entity_key=v_entity
    and context_hash=v_context
    and created_at >= now() - interval '5 minutes'
  order by created_at desc
  limit 1;

  if v_id is not null then return v_id; end if;

  insert into public.echo_brain_recommendation_exposures(
    surface,entity_key,semantic_schema,model_id,model_version,brain_influence,context_hash
  ) values (
    v_surface,v_entity,nullif(trim(coalesce(p_semantic_schema,'')),''),p_model_id,p_model_version,
    least(.55,greatest(0,coalesce(p_brain_influence,0))),v_context
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.echo_brain_register_recommendation_exposure(text,text,text,uuid,integer,numeric,text) from public;
grant execute on function public.echo_brain_register_recommendation_exposure(text,text,text,uuid,integer,numeric,text) to anon,authenticated;

comment on function public.echo_brain_register_recommendation_exposure(text,text,text,uuid,integer,numeric,text) is
  'Registra apenas proveniência anônima; exige context hash, deduplica por 5 minutos e nunca transforma exposição em evidência de performance.';
