-- EchoArena — agenda o coletor do Echo Pulse somente após a Edge Function validada.

-- Satisfaz também o Advisor sem expor o segredo aos clientes.
drop policy if exists pulse_runtime_secrets_service_role on public.pulse_runtime_secrets;
create policy pulse_runtime_secrets_service_role
on public.pulse_runtime_secrets
for all
to service_role
using (true)
with check (true);

-- Recriação idempotente do job.
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'echo-pulse-ingest-30m'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end;
$$;

select cron.schedule(
  'echo-pulse-ingest-30m',
  '*/30 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='echo_pulse_project_url' limit 1)
        || '/functions/v1/echo-pulse-ingest',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey',(select decrypted_secret from vault.decrypted_secrets where name='echo_pulse_publishable_key' limit 1),
        'x-echo-pulse-key',(select decrypted_secret from vault.decrypted_secrets where name='echo_pulse_cron_key' limit 1)
      ),
      body := jsonb_build_object('trigger','cron','scheduled_at',now()),
      timeout_milliseconds := 15000
    );
  $job$
);
