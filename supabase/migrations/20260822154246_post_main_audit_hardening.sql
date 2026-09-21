-- EchoArena — hardening pós-auditoria da integração.
--
-- As funções abaixo são implementações internas de triggers do Echo Brain.
-- O PostgreSQL executa triggers sem exigir que os papéis do Data API tenham
-- EXECUTE direto; portanto, nenhum cliente deve conseguir chamá-las como RPC.

revoke all on function public.echo_brain_guard_emergency_activation()
  from public, anon, authenticated, service_role;
revoke all on function public.echo_brain_guard_emergency_evaluation()
  from public, anon, authenticated, service_role;
revoke all on function public.echo_brain_guard_emergency_model_transition()
  from public, anon, authenticated, service_role;
revoke all on function public.echo_brain_guard_emergency_runtime()
  from public, anon, authenticated, service_role;
revoke all on function public.echo_brain_guard_emergency_training()
  from public, anon, authenticated, service_role;
revoke all on function public.echo_brain_guard_processing_during_emergency()
  from public, anon, authenticated, service_role;

comment on function public.echo_brain_guard_emergency_activation()
  is 'Internal Echo Brain trigger implementation; direct Data API execution is revoked.';
comment on function public.echo_brain_guard_emergency_evaluation()
  is 'Internal Echo Brain trigger implementation; direct Data API execution is revoked.';
comment on function public.echo_brain_guard_emergency_model_transition()
  is 'Internal Echo Brain trigger implementation; direct Data API execution is revoked.';
comment on function public.echo_brain_guard_emergency_runtime()
  is 'Internal Echo Brain trigger implementation; direct Data API execution is revoked.';
comment on function public.echo_brain_guard_emergency_training()
  is 'Internal Echo Brain trigger implementation; direct Data API execution is revoked.';
comment on function public.echo_brain_guard_processing_during_emergency()
  is 'Internal Echo Brain trigger implementation; direct Data API execution is revoked.';
