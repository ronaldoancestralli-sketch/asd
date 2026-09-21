-- Echo Brain — modo de emergência administrativo.
-- A emergência preserva memória/modelos, força influência a 0% e bloqueia novas
-- operações de aprendizado até liberação explícita. Nenhum dado observado é apagado.

alter table public.echo_brain_settings
  add column if not exists emergency_enabled boolean not null default false,
  add column if not exists emergency_reason text,
  add column if not exists emergency_activated_at timestamptz,
  add column if not exists emergency_activated_by uuid references auth.users(id) on delete set null,
  add column if not exists emergency_cleared_at timestamptz,
  add column if not exists emergency_cleared_by uuid references auth.users(id) on delete set null,
  add column if not exists emergency_clear_reason text;

-- A trilha operacional passa a distinguir acionamento e liberação da emergência.
alter table public.echo_brain_actions
  drop constraint if exists echo_brain_actions_action_type_check;
alter table public.echo_brain_actions
  add constraint echo_brain_actions_action_type_check
  check (action_type in ('promote','rollback','runtime_update','evaluate','suspend','emergency_on','emergency_off'));

-- Invariante de runtime: enquanto a emergência estiver ativa, nenhuma forma de
-- influência ou automação pode ser ligada, mesmo por service role.
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
          or new.auto_promotion_enabled is true) then
    raise exception 'brain_emergency_runtime_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists echo_brain_emergency_runtime_guard on public.echo_brain_settings;
create trigger echo_brain_emergency_runtime_guard
before insert or update on public.echo_brain_settings
for each row execute function public.echo_brain_guard_emergency_runtime();

-- Nenhum novo treino pode iniciar/concluir enquanto o modo de emergência está ativo.
create or replace function public.echo_brain_guard_emergency_training()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.echo_brain_settings
    where brain_key='composition' and emergency_enabled is true
  ) and new.status in ('queued','running','succeeded') then
    raise exception 'brain_emergency_training_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists echo_brain_emergency_training_guard on public.composition_training_runs;
create trigger echo_brain_emergency_training_guard
before insert or update of status on public.composition_training_runs
for each row execute function public.echo_brain_guard_emergency_training();

-- Um treino que já estava em voo não consegue publicar candidato durante emergência,
-- e nenhuma troca de modelo consegue colocar uma versão como ativa.
create or replace function public.echo_brain_guard_emergency_model_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.echo_brain_settings
    where brain_key='composition' and emergency_enabled is true
  ) and new.status in ('candidate','active')
    and (tg_op='INSERT' or new.status is distinct from old.status) then
    raise exception 'brain_emergency_model_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists echo_brain_emergency_model_guard on public.composition_model_versions;
create trigger echo_brain_emergency_model_guard
before insert or update of status on public.composition_model_versions
for each row execute function public.echo_brain_guard_emergency_model_transition();

-- Avaliações e novas ativações também ficam congeladas. A memória existente é preservada.
create or replace function public.echo_brain_guard_emergency_evaluation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.echo_brain_settings
    where brain_key='composition' and emergency_enabled is true
  ) then
    raise exception 'brain_emergency_evaluation_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists echo_brain_emergency_evaluation_guard on public.composition_model_evaluations;
create trigger echo_brain_emergency_evaluation_guard
before insert on public.composition_model_evaluations
for each row execute function public.echo_brain_guard_emergency_evaluation();

create or replace function public.echo_brain_guard_emergency_activation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.echo_brain_settings
    where brain_key='composition' and emergency_enabled is true
  ) then
    raise exception 'brain_emergency_activation_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists echo_brain_emergency_activation_guard on public.composition_model_activations;
create trigger echo_brain_emergency_activation_guard
before insert on public.composition_model_activations
for each row execute function public.echo_brain_guard_emergency_activation();

-- Aciona ou libera emergência. Em ambos os casos o aprendizado permanece desligado;
-- liberar a emergência nunca restaura influência/automação implicitamente.
create or replace function public.admin_echo_brain_set_emergency(
  p_enabled boolean,
  p_reason text
)
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
  if not public.is_admin() then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if length(v_reason) < 8 then
    raise exception 'emergency_reason_required';
  end if;

  select * into v_settings
  from public.echo_brain_settings
  where brain_key='composition'
  for update;
  if not found then raise exception 'brain_settings_missing'; end if;

  if coalesce(p_enabled,false) then
    if v_settings.emergency_enabled is true then
      raise exception 'emergency_already_active';
    end if;

    -- Primeiro cancela registros em voo enquanto a emergência ainda está false;
    -- depois o trigger impede qualquer tentativa de voltar a queued/running/succeeded.
    update public.composition_training_runs
    set status='cancelled',
        completed_at=coalesce(completed_at,now()),
        notes=concat_ws(' ',nullif(notes,''),'Cancelado pelo modo de emergência do Echo Brain.')
    where brain_key='composition' and status in ('queued','running');
    get diagnostics v_cancelled = row_count;

    update public.echo_brain_settings
    set emergency_enabled=true,
        emergency_reason=v_reason,
        emergency_activated_at=now(),
        emergency_activated_by=auth.uid(),
        emergency_cleared_at=null,
        emergency_cleared_by=null,
        emergency_clear_reason=null,
        learning_enabled=false,
        auto_training_enabled=false,
        auto_promotion_enabled=false,
        updated_by=auth.uid()
    where brain_key='composition'
    returning * into v_settings;

    insert into public.echo_brain_actions(action_type,model_id,actor_id,reason,details)
    values ('emergency_on',v_settings.active_model_id,auth.uid(),v_reason,jsonb_build_object(
      'learning_enabled',false,
      'auto_training_enabled',false,
      'auto_promotion_enabled',false,
      'cancelled_training_runs',v_cancelled,
      'memory_preserved',true
    ));
  else
    if v_settings.emergency_enabled is not true then
      raise exception 'emergency_not_active';
    end if;

    update public.echo_brain_settings
    set emergency_enabled=false,
        emergency_cleared_at=now(),
        emergency_cleared_by=auth.uid(),
        emergency_clear_reason=v_reason,
        learning_enabled=false,
        auto_training_enabled=false,
        auto_promotion_enabled=false,
        updated_by=auth.uid()
    where brain_key='composition'
    returning * into v_settings;

    insert into public.echo_brain_actions(action_type,model_id,actor_id,reason,details)
    values ('emergency_off',v_settings.active_model_id,auth.uid(),v_reason,jsonb_build_object(
      'learning_enabled',false,
      'auto_training_enabled',false,
      'auto_promotion_enabled',false,
      'requires_manual_reactivation',true,
      'memory_preserved',true
    ));
  end if;

  return to_jsonb(v_settings);
end;
$$;

revoke all on function public.admin_echo_brain_set_emergency(boolean,text) from public, anon;
grant execute on function public.admin_echo_brain_set_emergency(boolean,text) to authenticated;

comment on function public.admin_echo_brain_set_emergency(boolean,text) is
  'Echo Brain: trava operacional de emergência. Preserva memória e mantém influência/automações desligadas até ações posteriores explícitas.';
