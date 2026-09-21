-- Echo Brain — promoção manual de candidato validado.
-- Promover NÃO liga a influência: o kill switch permanece desligado até ação separada.
create or replace function public.admin_echo_brain_promote_model(p_model_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_model public.composition_model_versions%rowtype;
  v_run public.composition_training_runs%rowtype;
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select * into v_model
  from public.composition_model_versions
  where id = p_model_id
  for update;

  if not found then raise exception 'model_not_found'; end if;
  if v_model.status <> 'candidate' then raise exception 'candidate_required'; end if;
  if v_model.passed_validation is not true then raise exception 'validated_candidate_required'; end if;

  select * into v_run
  from public.composition_training_runs
  where candidate_model_id = p_model_id
    and status = 'succeeded'
    and passed_validation is true
  order by completed_at desc nulls last, created_at desc
  limit 1;

  if not found then raise exception 'successful_training_run_required'; end if;

  update public.composition_model_versions
  set status = 'retired', retired_at = now()
  where brain_key = v_model.brain_key
    and status = 'active'
    and id <> p_model_id;

  update public.composition_model_versions
  set status = 'active', activated_at = now(), retired_at = null
  where id = p_model_id
  returning * into v_model;

  update public.echo_brain_settings
  set active_model_id = p_model_id,
      learning_enabled = false,
      updated_by = auth.uid()
  where brain_key = v_model.brain_key;

  return jsonb_build_object(
    'model', to_jsonb(v_model) - 'weights',
    'learning_enabled', false,
    'message', 'model_promoted_with_kill_switch_off'
  );
end;
$$;

revoke all on function public.admin_echo_brain_promote_model(uuid) from public, anon;
grant execute on function public.admin_echo_brain_promote_model(uuid) to authenticated;
