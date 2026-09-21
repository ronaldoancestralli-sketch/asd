-- Registra no histórico permanente quando uma pendência real da fila é
-- resolvida, ignorada ou reaberta. Assim outras pessoas da equipe conseguem
-- acompanhar correções feitas em equipamentos, não apenas classificações.

alter table public.equipment_audit_history
  drop constraint if exists equipment_audit_history_entity_type_check;

alter table public.equipment_audit_history
  add constraint equipment_audit_history_entity_type_check
  check (entity_type in ('attribute_classification','set_bonus','queue_issue'));

create or replace function public.log_equipment_audit_queue_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_email text;
  v_label text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if old.status = 'pending' and new.status = 'resolved' then
    v_action := 'pendencia_resolvida';
  elsif old.status = 'pending' and new.status = 'ignored' then
    v_action := 'pendencia_ignorada';
  elsif new.status = 'pending' then
    v_action := 'pendencia_reaberta';
  else
    v_action := 'pendencia_status_alterado';
  end if;

  begin
    v_email := auth.jwt() ->> 'email';
  exception when others then
    v_email := null;
  end;

  v_label := coalesce(
    new.details ->> 'human_label',
    new.attribute_key,
    new.issue_type,
    'Pendência'
  );

  insert into public.equipment_audit_history (
    entity_type,
    entity_id,
    action,
    summary,
    before_data,
    after_data,
    actor_id,
    actor_email,
    metadata
  ) values (
    'queue_issue',
    new.id::text,
    v_action,
    concat(coalesce(new.equipment_name, 'Equipamento'), ' · ', v_label),
    jsonb_build_object(
      'status', old.status,
      'issue_type', old.issue_type,
      'severity', old.severity,
      'attribute_key', old.attribute_key,
      'attribute_value', old.attribute_value
    ),
    jsonb_build_object(
      'status', new.status,
      'issue_type', new.issue_type,
      'severity', new.severity,
      'attribute_key', new.attribute_key,
      'attribute_value', new.attribute_value
    ),
    auth.uid(),
    v_email,
    jsonb_build_object(
      'equipment_id', new.equipment_id,
      'rarity_slug', new.rarity_slug,
      'issue_key', new.issue_key
    )
  );

  return new;
end;
$$;

revoke all on function public.log_equipment_audit_queue_history() from public;

drop trigger if exists trg_equipment_audit_queue_history on public.equipment_audit_queue;
create trigger trg_equipment_audit_queue_history
after update of status on public.equipment_audit_queue
for each row execute function public.log_equipment_audit_queue_history();
