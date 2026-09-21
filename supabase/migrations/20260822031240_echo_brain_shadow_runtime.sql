-- Echo Brain final — controle administrativo do Shadow Mode.
-- Shadow nunca implica influência pública e é desligado automaticamente em emergência.

create or replace function public.echo_brain_guard_emergency_runtime()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.emergency_enabled is true
     and (new.learning_enabled is true
          or new.auto_training_enabled is true
          or new.auto_promotion_enabled is true
          or new.shadow_mode_enabled is true) then
    raise exception 'brain_emergency_runtime_locked';
  end if;
  return new;
end;
$$;

create or replace function public.admin_echo_brain_set_shadow_mode(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.echo_brain_settings%rowtype;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  select * into v_settings from public.echo_brain_settings where brain_key='composition' for update;
  if not found then raise exception 'brain_settings_missing'; end if;
  if coalesce(p_enabled,false) and v_settings.emergency_enabled is true then raise exception 'brain_emergency_active'; end if;

  update public.echo_brain_settings
  set shadow_mode_enabled=coalesce(p_enabled,false),updated_by=auth.uid()
  where brain_key='composition'
  returning * into v_settings;

  insert into public.echo_brain_actions(action_type,model_id,actor_id,details)
  values('runtime_update',v_settings.active_model_id,auth.uid(),jsonb_build_object('shadow_mode_enabled',v_settings.shadow_mode_enabled,'learning_enabled',v_settings.learning_enabled));
  return to_jsonb(v_settings);
end;
$$;

create or replace function public.admin_echo_brain_set_emergency(p_enabled boolean,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.echo_brain_settings%rowtype;
  v_reason text := trim(coalesce(p_reason,''));
  v_cancelled integer := 0;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if length(v_reason)<8 then raise exception 'emergency_reason_required'; end if;
  select * into v_settings from public.echo_brain_settings where brain_key='composition' for update;
  if not found then raise exception 'brain_settings_missing'; end if;

  if coalesce(p_enabled,false) then
    if v_settings.emergency_enabled is true then raise exception 'emergency_already_active'; end if;
    update public.composition_training_runs set status='cancelled',completed_at=coalesce(completed_at,now()),notes=concat_ws(' ',nullif(notes,''),'Cancelado pelo modo de emergência do Echo Brain.') where brain_key='composition' and status in ('queued','running');
    get diagnostics v_cancelled=row_count;
    update public.echo_brain_settings
    set emergency_enabled=true,emergency_reason=v_reason,emergency_activated_at=now(),emergency_activated_by=auth.uid(),emergency_cleared_at=null,emergency_cleared_by=null,emergency_clear_reason=null,learning_enabled=false,auto_training_enabled=false,auto_promotion_enabled=false,shadow_mode_enabled=false,updated_by=auth.uid()
    where brain_key='composition' returning * into v_settings;
    insert into public.echo_brain_actions(action_type,model_id,actor_id,reason,details)
    values('emergency_on',v_settings.active_model_id,auth.uid(),v_reason,jsonb_build_object('learning_enabled',false,'auto_training_enabled',false,'auto_promotion_enabled',false,'shadow_mode_enabled',false,'cancelled_training_runs',v_cancelled,'memory_preserved',true));
  else
    if v_settings.emergency_enabled is not true then raise exception 'emergency_not_active'; end if;
    update public.echo_brain_settings
    set emergency_enabled=false,emergency_cleared_at=now(),emergency_cleared_by=auth.uid(),emergency_clear_reason=v_reason,learning_enabled=false,auto_training_enabled=false,auto_promotion_enabled=false,shadow_mode_enabled=false,updated_by=auth.uid()
    where brain_key='composition' returning * into v_settings;
    insert into public.echo_brain_actions(action_type,model_id,actor_id,reason,details)
    values('emergency_off',v_settings.active_model_id,auth.uid(),v_reason,jsonb_build_object('learning_enabled',false,'auto_training_enabled',false,'auto_promotion_enabled',false,'shadow_mode_enabled',false,'requires_manual_reactivation',true,'memory_preserved',true));
  end if;
  return to_jsonb(v_settings);
end;
$$;

revoke all on function public.admin_echo_brain_set_shadow_mode(boolean) from public,anon;
grant execute on function public.admin_echo_brain_set_shadow_mode(boolean) to authenticated;
