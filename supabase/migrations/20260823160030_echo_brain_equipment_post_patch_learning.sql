-- Echo Brain — fechamento da dívida competitiva criada por mudanças de item.
-- A dívida só é resolvida quando o modelo que será liberado possui treino e
-- validação temporal posteriores ao patch. Habilitar influência continua sendo
-- protegido pelos gates já existentes de Replay + Shadow.

create or replace function public.echo_brain_resolve_equipment_learning_for_model(p_model_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_model public.composition_model_versions%rowtype;
  v_train_until timestamptz;
  v_validation_from timestamptz;
  v_resolved integer := 0;
begin
  if p_model_id is null then return 0; end if;

  select * into v_model
  from public.composition_model_versions
  where id=p_model_id;

  if not found
     or v_model.status <> 'active'
     or v_model.passed_validation is not true
     or v_model.feature_schema_version <> 'composition-semantic-context-v4' then
    return 0;
  end if;

  begin
    v_train_until := nullif(v_model.metrics->>'trainObservedUntil','')::timestamptz;
    v_validation_from := nullif(v_model.metrics->>'validationObservedFrom','')::timestamptz;
  exception when others then
    return 0;
  end;

  if v_train_until is null or v_validation_from is null then return 0; end if;

  with eligible as (
    select i.id
    from public.equipment_brain_invalidations i
    join public.equipment_brain_versions v on v.id=i.equipment_version_id
    where i.status='pending'
      and i.scope in ('training','composition_recommendations')
      and v.affects_brain is true
      and v.created_at <= v_train_until
      and v.created_at <= v_validation_from
      and v_model.created_at > v.created_at
      and (v_model.season_id is null or v.season_id is null or v_model.season_id=v.season_id)
  ), updated as (
    update public.equipment_brain_invalidations i
    set status='resolved',
        resolved_at=now(),
        metadata=coalesce(i.metadata,'{}'::jsonb)||jsonb_build_object(
          'resolution','validated_post_patch_model',
          'model_id',p_model_id,
          'model_version',v_model.version,
          'feature_schema',v_model.feature_schema_version,
          'train_observed_until',v_train_until,
          'validation_observed_from',v_validation_from
        )
    where i.id in (select id from eligible)
    returning i.id
  )
  select count(*)::integer into v_resolved from updated;

  return coalesce(v_resolved,0);
end;
$$;

-- Função interna. O Data API não recebe acesso direto; ela é chamada pelo
-- trigger após o runtime seguro liberar influência ou pelo wrapper admin abaixo.
revoke all on function public.echo_brain_resolve_equipment_learning_for_model(uuid) from public, anon, authenticated;

create or replace function public.echo_brain_reconcile_learning_on_runtime()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.brain_key='composition'
     and new.learning_enabled is true
     and (old.learning_enabled is distinct from new.learning_enabled
          or old.active_model_id is distinct from new.active_model_id) then
    perform public.echo_brain_resolve_equipment_learning_for_model(new.active_model_id);
  end if;
  return new;
end;
$$;

revoke all on function public.echo_brain_reconcile_learning_on_runtime() from public, anon, authenticated;

drop trigger if exists echo_brain_equipment_learning_runtime_reconcile on public.echo_brain_settings;
create trigger echo_brain_equipment_learning_runtime_reconcile
after update of learning_enabled,active_model_id on public.echo_brain_settings
for each row execute function public.echo_brain_reconcile_learning_on_runtime();

-- Ação administrativa explícita para auditoria/reprocessamento manual. Não
-- consegue contornar os requisitos: só resolve se o modelo ativo for v4,
-- validado e temporalmente posterior ao patch.
create or replace function public.admin_echo_brain_reconcile_equipment_learning()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.echo_brain_settings%rowtype;
  v_model public.composition_model_versions%rowtype;
  v_resolved integer := 0;
  v_pending integer := 0;
begin
  if not public.echo_is_admin() then
    raise exception 'admin_required' using errcode='42501';
  end if;

  select * into v_settings
  from public.echo_brain_settings
  where brain_key='composition';
  if not found then raise exception 'brain_settings_missing'; end if;
  if v_settings.active_model_id is null then raise exception 'active_model_required'; end if;

  select * into v_model
  from public.composition_model_versions
  where id=v_settings.active_model_id;
  if not found or v_model.status<>'active' or v_model.passed_validation is not true then
    raise exception 'validated_active_model_required';
  end if;
  if v_model.feature_schema_version <> 'composition-semantic-context-v4' then
    raise exception 'semantic_v4_model_required';
  end if;

  v_resolved := public.echo_brain_resolve_equipment_learning_for_model(v_model.id);

  select count(*)::integer into v_pending
  from public.equipment_brain_invalidations
  where status='pending' and scope in ('training','composition_recommendations');

  return jsonb_build_object(
    'ok',true,
    'modelId',v_model.id,
    'modelVersion',v_model.version,
    'resolved',v_resolved,
    'pending',v_pending,
    'featureSchema',v_model.feature_schema_version
  );
end;
$$;

revoke all on function public.admin_echo_brain_reconcile_equipment_learning() from public, anon;
grant execute on function public.admin_echo_brain_reconcile_equipment_learning() to authenticated;

comment on function public.admin_echo_brain_reconcile_equipment_learning() is
  'Resolve dívida competitiva de equipamentos somente quando o modelo ativo Semantic v4 possui treino/validação posteriores ao patch. A liberação pública continua dependendo dos gates de runtime.';
