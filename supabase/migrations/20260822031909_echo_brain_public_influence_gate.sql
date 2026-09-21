-- Echo Brain final — nenhuma influência pública sem Backtest + Shadow prospectivo aprovado.
-- Promoção continua separada; esta trava atua somente ao tentar liberar learning_enabled.

create or replace function public.admin_echo_brain_set_runtime(
  p_learning_enabled boolean,
  p_max_influence numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.echo_brain_settings%rowtype;
  v_model public.composition_model_versions%rowtype;
  v_next_influence numeric;
  v_before_enabled boolean;
  v_before_influence numeric;
  v_shadow_matches integer := 0;
  v_shadow_brier numeric;
  v_shadow_rate numeric;
  v_shadow_baseline_brier numeric;
  v_backtest_matches integer := 0;
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select * into v_settings
  from public.echo_brain_settings
  where brain_key = 'composition'
  for update;
  if not found then raise exception 'brain_settings_missing'; end if;

  v_before_enabled := v_settings.learning_enabled;
  v_before_influence := v_settings.max_influence;
  v_next_influence := coalesce(p_max_influence, v_settings.max_influence);
  if v_next_influence < 0 or v_next_influence > 0.55 then raise exception 'invalid_max_influence'; end if;

  if coalesce(p_learning_enabled, false) then
    if v_settings.emergency_enabled is true then raise exception 'brain_emergency_active'; end if;
    if v_settings.active_model_id is null then raise exception 'active_model_required'; end if;

    select * into v_model
    from public.composition_model_versions
    where id = v_settings.active_model_id;
    if not found or v_model.status <> 'active' or v_model.passed_validation is not true then
      raise exception 'validated_active_model_required';
    end if;

    select coalesce(max(observation_count),0)
    into v_backtest_matches
    from public.composition_backtest_runs
    where target_model_id=v_model.id and status='succeeded';
    if v_backtest_matches < v_settings.min_backtest_matches then
      raise exception 'successful_backtest_required';
    end if;

    select count(*)::integer,
           avg(power(p.predicted_win_probability - case when o.outcome='win' then 1 else 0 end,2)),
           avg(case when o.outcome='win' then 1.0 else 0.0 end)
    into v_shadow_matches, v_shadow_brier, v_shadow_rate
    from public.composition_shadow_predictions p
    join public.composition_match_observations o on o.id=p.observation_id
    where p.model_id=v_model.id;

    if v_shadow_matches < v_settings.min_shadow_matches then
      raise exception 'shadow_sample_required';
    end if;
    v_shadow_baseline_brier := v_shadow_rate * (1 - v_shadow_rate);
    if v_shadow_brier is null or v_shadow_baseline_brier is null or v_shadow_brier >= v_shadow_baseline_brier then
      raise exception 'shadow_validation_failed';
    end if;
  end if;

  update public.echo_brain_settings
  set learning_enabled = coalesce(p_learning_enabled, false),
      max_influence = v_next_influence,
      updated_by = auth.uid()
  where brain_key = 'composition'
  returning * into v_settings;

  insert into public.echo_brain_actions(action_type, model_id, actor_id, details)
  values ('runtime_update', v_settings.active_model_id, auth.uid(), jsonb_build_object(
    'learning_enabled_before', v_before_enabled,
    'learning_enabled_after', v_settings.learning_enabled,
    'max_influence_before', v_before_influence,
    'max_influence_after', v_settings.max_influence,
    'shadow_matches', case when v_settings.learning_enabled then v_shadow_matches else null end,
    'shadow_brier', case when v_settings.learning_enabled then v_shadow_brier else null end,
    'shadow_baseline_brier', case when v_settings.learning_enabled then v_shadow_baseline_brier else null end,
    'backtest_matches', case when v_settings.learning_enabled then v_backtest_matches else null end
  ));

  return to_jsonb(v_settings);
end;
$$;

comment on function public.admin_echo_brain_set_runtime(boolean,numeric) is
  'Echo Brain: runtime admin-only. Liberar influência exige modelo ativo validado, Replay/Backtest concluído e Shadow prospectivo com Brier melhor que baseline.';
