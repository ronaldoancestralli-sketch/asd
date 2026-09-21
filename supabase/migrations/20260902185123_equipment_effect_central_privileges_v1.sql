-- Echo Arena — explicit least-privilege ACLs for the Phase 2C.1 Central.
-- Corrective migration: the original SQL was already applied and is immutable.
-- Supabase defaults can grant privileges before the original explicit GRANTs.
-- Scope: five Central tables and two trigger-only functions. No data changes,
-- no global default-privilege changes, no publication or numeric activation.

revoke all privileges on table
  public.equipment_effect_documents,
  public.equipment_effect_document_revisions,
  public.equipment_effect_evidence,
  public.equipment_effect_revision_evidence,
  public.equipment_effect_review_queue
from public, anon, authenticated, service_role;

-- Invoker RPCs need SELECT/INSERT, plus UPDATE only for mutable workflow state.
-- RLS and the existing RPC/immutability guards remain in force.
grant select, insert, update on table
  public.equipment_effect_documents,
  public.equipment_effect_review_queue
to authenticated, service_role;

grant select, insert on table
  public.equipment_effect_document_revisions,
  public.equipment_effect_evidence,
  public.equipment_effect_revision_evidence
to authenticated, service_role;

-- Trigger installation is performed by the migration owner, not API roles.
-- These functions are not RPC entry points. Installed triggers still execute.
revoke all privileges on function
  public.equipment_effect_central_write_guard_v1(),
  public.equipment_effect_central_immutable_guard_v1()
from public, anon, authenticated, service_role;
