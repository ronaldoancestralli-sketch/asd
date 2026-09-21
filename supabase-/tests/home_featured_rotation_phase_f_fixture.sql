\set ON_ERROR_STOP on

-- Reutiliza o contrato completo e os testes da etapa E; o banco do job é
-- efêmero e termina com uma configuração manual conhecida na revisão 3.
\ir home_featured_rotation_phase_e_fixture.sql

-- Stub estrito do pg_cron para o PostgreSQL limpo do CI. Em produção, a mesma
-- assinatura pertence à extensão pg_cron já habilitada no SNV.
create schema cron;
create table cron.job (
  jobid bigint generated always as identity primary key,
  schedule text not null,
  command text not null,
  database text not null default current_database(),
  username text not null default current_user,
  active boolean not null default true,
  jobname text not null unique
);

create or replace function cron.schedule(
  p_job_name text,
  p_schedule text,
  p_command text
)
returns bigint
language plpgsql
as $$
declare
  v_jobid bigint;
begin
  insert into cron.job (jobname, schedule, command)
  values (p_job_name, p_schedule, p_command)
  on conflict (jobname) do update
  set schedule = excluded.schedule,
      command = excluded.command,
      active = true
  returning jobid into v_jobid;
  return v_jobid;
end;
$$;

\ir ../migrations/20260906131109_home_featured_rotation_activation_phase_f.sql

do $fixture$
declare
  v_snapshot jsonb;
  v_preview jsonb;
  v_activation jsonb;
  v_run jsonb;
  v_pause jsonb;
  v_period_end timestamptz;
  v_revision bigint;
  v_history_before bigint;
  v_audit_before bigint;
begin
  if has_function_privilege(
       'anon', 'public.echo_admin_preview_home_featured_rotation_v1()', 'EXECUTE'
     )
     or has_function_privilege(
       'service_role', 'public.echo_admin_set_home_featured_automation_v1(boolean,bigint,text)', 'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated', 'public.echo_admin_preview_home_featured_rotation_v1()', 'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated', 'public.echo_admin_set_home_featured_automation_v1(boolean,bigint,text)', 'EXECUTE'
     )
     or has_function_privilege(
       'authenticated', 'private.home_featured_next_preview_v1(timestamp with time zone)', 'EXECUTE'
     ) then
    raise exception 'privilégios da ativação e da prévia divergiram';
  end if;

  if (select count(*)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'echo_admin_home_featured_rotation_v1',
          'echo_admin_preview_home_featured_rotation_v1',
          'echo_admin_set_home_featured_automation_v1'
        )
        and p.prosecdef
        and coalesce(pg_catalog.array_to_string(p.proconfig, ','), '') like '%search_path=""%'
     ) <> 3 then
    raise exception 'RPCs da etapa F precisam ser security definer com search_path vazio';
  end if;

  if (select count(*) from cron.job where jobname = 'echo-home-featured-rotation-1m') <> 1
     or not (select active from cron.job where jobname = 'echo-home-featured-rotation-1m')
     or (select schedule from cron.job where jobname = 'echo-home-featured-rotation-1m') <> '* * * * *'
     or position(
       'private.run_home_featured_rotation_v1' in
       (select command from cron.job where jobname = 'echo-home-featured-rotation-1m')
     ) = 0 then
    raise exception 'worker único do destaque não foi instalado corretamente';
  end if;

  perform cron.schedule(
    'echo-home-featured-rotation-1m', '* * * * *',
    'select private.run_home_featured_rotation_v1(pg_catalog.clock_timestamp());'
  );
  if (select count(*) from cron.job where jobname = 'echo-home-featured-rotation-1m') <> 1 then
    raise exception 'reagendamento pelo mesmo nome duplicou o worker';
  end if;

  v_snapshot := public.echo_admin_home_featured_rotation_v1();
  if v_snapshot ->> 'phase' <> 'F'
     or not (v_snapshot ->> 'automation_available')::boolean
     or (v_snapshot #>> '{config,automation_enabled}')::boolean
     or v_snapshot #>> '{config,current_hero_name}' <> 'Alpha'
     or v_snapshot #>> '{preview,next_hero,name}' <> 'Charlie'
     or (v_snapshot #>> '{preview,mutates_state}')::boolean
     or not (v_snapshot #>> '{worker,active}')::boolean
     or v_snapshot #>> '{worker,schedule}' <> '* * * * *' then
    raise exception 'snapshot da etapa F divergiu: %', v_snapshot;
  end if;

  select revision into v_revision
  from private.home_featured_rotation_config where singleton_id = 1;
  select count(*) into v_history_before from private.home_featured_rotation_history;
  select count(*) into v_audit_before from public.fixture_admin_audit;

  v_preview := public.echo_admin_preview_home_featured_rotation_v1();
  if v_preview ->> 'status' <> 'ready'
     or v_preview #>> '{current_hero,name}' <> 'Alpha'
     or v_preview #>> '{next_hero,name}' <> 'Charlie'
     or (v_preview ->> 'mutates_state')::boolean
     or (select revision from private.home_featured_rotation_config where singleton_id = 1) <> v_revision
     or (select count(*) from private.home_featured_rotation_history) <> v_history_before
     or (select count(*) from public.fixture_admin_audit) <> v_audit_before then
    raise exception 'prévia sem mutação divergiu: %', v_preview;
  end if;

  v_activation := public.echo_admin_set_home_featured_automation_v1(
    true, v_revision, 'Iniciar ciclo editorial diário'
  );
  if v_activation ->> 'operation' <> 'enabled'
     or not (v_activation #>> '{config,automation_enabled}')::boolean
     or v_activation #>> '{config,mode}' <> 'automatic'
     or v_activation #>> '{config,current_hero_name}' <> 'Alpha'
     or (v_activation #>> '{config,revision}')::bigint <> v_revision + 1
     or v_activation #>> '{config,next_rotation_at}' is null
     or not (select automation_enabled from public.home_featured_state where singleton_id = 1)
     or (select hero_id from public.home_featured_state where singleton_id = 1)
        <> '11111111-1111-1111-1111-111111111111'::uuid
     or (select count(*) from private.home_featured_rotation_history where event_type = 'resumed') <> 1
     or (select count(*) from public.fixture_admin_audit where action = 'enable_home_featured_rotation') <> 1 then
    raise exception 'ativação automática divergiu: %', v_activation;
  end if;

  select period_end_at into v_period_end
  from private.home_featured_rotation_config where singleton_id = 1;
  v_history_before := (select count(*) from private.home_featured_rotation_history);
  v_audit_before := (select count(*) from public.fixture_admin_audit);

  v_activation := public.echo_admin_set_home_featured_automation_v1(
    true, v_revision + 1, 'Repetição idempotente'
  );
  if v_activation ->> 'operation' <> 'unchanged'
     or (select count(*) from private.home_featured_rotation_history) <> v_history_before
     or (select count(*) from public.fixture_admin_audit) <> v_audit_before then
    raise exception 'ativação repetida não permaneceu idempotente';
  end if;

  v_run := private.run_home_featured_rotation_v1(v_period_end + interval '1 second');
  if v_run ->> 'status' <> 'rotated'
     or v_run ->> 'hero_id' <> '33333333-3333-3333-3333-333333333333'
     or (select hero_id from public.home_featured_state where singleton_id = 1)
        <> '33333333-3333-3333-3333-333333333333'::uuid then
    raise exception 'virada do período seguinte divergiu: %', v_run;
  end if;

  v_pause := public.echo_admin_set_home_featured_automation_v1(
    false, v_revision + 1, 'Pausar após validar o ciclo'
  );
  if v_pause ->> 'operation' <> 'paused'
     or (v_pause #>> '{config,automation_enabled}')::boolean
     or v_pause #>> '{config,mode}' <> 'manual'
     or v_pause #>> '{config,current_hero_name}' <> 'Charlie'
     or (v_pause #>> '{config,revision}')::bigint <> v_revision + 2
     or (select automation_enabled from public.home_featured_state where singleton_id = 1)
     or (select hero_id from public.home_featured_state where singleton_id = 1)
        <> '33333333-3333-3333-3333-333333333333'::uuid
     or (select count(*) from private.home_featured_rotation_history where event_type = 'paused') <> 1
     or (select count(*) from public.fixture_admin_audit where action = 'pause_home_featured_rotation') <> 1 then
    raise exception 'pausa automática divergiu: %', v_pause;
  end if;

  begin
    perform public.echo_admin_set_home_featured_automation_v1(
      true, v_revision + 1, 'Revisão antiga rejeitada'
    );
    raise exception 'revisão obsoleta de ativação foi aceita';
  exception
    when sqlstate '40001' then
      if position('HOME_FEATURED_REVISION_CONFLICT' in sqlerrm) = 0 then raise; end if;
  end;

  update public.fixture_admin_capabilities
  set allowed = false where capability = 'publishing.publish';
  begin
    perform public.echo_admin_set_home_featured_automation_v1(
      true, v_revision + 2, 'Tentativa sem autorização'
    );
    raise exception 'ativação sem capacidade foi aceita';
  exception
    when sqlstate '42501' then
      if position('ADMIN_CAPABILITY_DENIED' in sqlerrm) = 0 then raise; end if;
  end;
  update public.fixture_admin_capabilities
  set allowed = true where capability = 'publishing.publish';

  update public.fixture_admin_capabilities
  set allowed = false where capability = 'publishing.view';
  begin
    perform public.echo_admin_preview_home_featured_rotation_v1();
    raise exception 'prévia sem capacidade foi aceita';
  exception
    when sqlstate '42501' then
      if position('ADMIN_CAPABILITY_DENIED' in sqlerrm) = 0 then raise; end if;
  end;
  update public.fixture_admin_capabilities
  set allowed = true where capability = 'publishing.view';
end;
$fixture$;

set role authenticated;
select public.echo_admin_preview_home_featured_rotation_v1();
reset role;

select 'home_featured_rotation_phase_f_fixture_ok' as result;
