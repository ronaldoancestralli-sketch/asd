-- Diferencia falhas do cadastro de efeitos reais que ainda dependem de
-- dados-base oficiais/publicamente verificáveis do jogo.

alter table public.equipment_audit_queue
  drop constraint if exists equipment_audit_queue_issue_type_check;

alter table public.equipment_audit_queue
  add constraint equipment_audit_queue_issue_type_check
  check (issue_type in ('unknown_attribute','invalid_value','external_data_required'));

create index if not exists equipment_audit_queue_issue_type_status_idx
  on public.equipment_audit_queue (issue_type, status, updated_at desc);
