begin;

-- Echo Arena — etapa F da rotação do herói em destaque.
-- Ativa a autoridade canônica da home, acrescenta prévia administrativa sem
-- mutação e instala um único verificador idempotente no Cron do SNV.

do $preflight$
begin
  if pg_catalog.to_regnamespace('cron') is null
     or pg_catalog.to_regprocedure('cron.schedule(text,text,text)') is null then
    raise exception 'HOME_FEATURED_CRON_UNAVAILABLE' using errcode = '55000';
  end if;
end;
$preflight$;

create or replace function private.home_featured_next_preview_v1(
  p_at timestamptz default pg_catalog.statement_timestamp()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_config private.home_featured_rotation_config%rowtype;
  v_heroes uuid[];
  v_count integer;
  v_current_index integer;
  v_next_hero_id uuid;
  v_scheduled_for timestamptz;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  if p_at is null then
    raise exception 'HOME_FEATURED_PREVIEW_TIME_REQUIRED' using errcode = '22023';
  end if;

  select * into strict v_config
  from private.home_featured_rotation_config
  where singleton_id = 1;

  select pg_catalog.array_agg(q.hero_id order by q.position)
  into v_heroes
  from private.home_featured_rotation_queue q
  join public.heroes h on h.id = q.hero_id and h.enabled is true
  where q.singleton_id = 1;

  v_count := coalesce(pg_catalog.array_length(v_heroes, 1), 0);
  if v_count = 0 or v_config.current_hero_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'unavailable',
      'reason', 'no_eligible_heroes',
      'revision', v_config.revision
    );
  end if;

  v_current_index := pg_catalog.array_position(v_heroes, v_config.current_hero_id);
  if v_current_index is null then
    v_next_hero_id := v_heroes[1];
  else
    v_next_hero_id := v_heroes[1 + (v_current_index % v_count)];
  end if;

  if v_config.automation_enabled
     and v_config.period_end_at is not null
     and v_config.period_end_at > p_at then
    v_scheduled_for := v_config.period_end_at;
  else
    select w.period_start_at, w.period_end_at
    into v_window_start, v_window_end
    from private.home_featured_rotation_window_v1(
      p_at,
      v_config.cadence,
      v_config.timezone_name,
      v_config.local_time,
      v_config.weekday
    ) w;
    v_scheduled_for := v_window_end;
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'ready',
    'kind', 'next_period',
    'mutates_state', false,
    'revision', v_config.revision,
    'automation_enabled', v_config.automation_enabled,
    'cadence', v_config.cadence,
    'timezone_name', v_config.timezone_name,
    'scheduled_for', v_scheduled_for,
    'current_hero', (
      select pg_catalog.jsonb_build_object('id', h.id, 'name', h.name, 'slug', h.slug)
      from public.heroes h where h.id = v_config.current_hero_id
    ),
    'next_hero', (
      select pg_catalog.jsonb_build_object('id', h.id, 'name', h.name, 'slug', h.slug)
      from public.heroes h where h.id = v_next_hero_id and h.enabled is true
    )
  );
end;
$$;

create or replace function public.echo_admin_home_featured_rotation_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.echo_require_admin_capability('publishing.view');

  select pg_catalog.jsonb_build_object(
    'phase', 'F',
    'automation_available', true,
    'server_now', pg_catalog.statement_timestamp(),
    'permissions', pg_catalog.jsonb_build_object(
      'view', public.echo_has_admin_capability('publishing.view'),
      'edit', public.echo_has_admin_capability('publishing.edit'),
      'publish', public.echo_has_admin_capability('publishing.publish')
    ),
    'config', pg_catalog.jsonb_build_object(
      'mode', c.mode,
      'automation_enabled', c.automation_enabled,
      'cadence', c.cadence,
      'timezone_name', c.timezone_name,
      'local_time', c.local_time::text,
      'weekday', c.weekday,
      'current_hero_id', c.current_hero_id,
      'current_hero_name', current_hero.name,
      'current_hero_slug', current_hero.slug,
      'period_start_at', c.period_start_at,
      'period_end_at', c.period_end_at,
      'next_rotation_at', c.next_rotation_at,
      'revision', c.revision,
      'last_status', c.last_status,
      'updated_at', c.updated_at
    ),
    'preview', private.home_featured_next_preview_v1(pg_catalog.statement_timestamp()),
    'worker', pg_catalog.jsonb_build_object(
      'job_name', 'echo-home-featured-rotation-1m',
      'active', coalesce((
        select j.active from cron.job j
        where j.jobname = 'echo-home-featured-rotation-1m'
        limit 1
      ), false),
      'schedule', (
        select j.schedule from cron.job j
        where j.jobname = 'echo-home-featured-rotation-1m'
        limit 1
      )
    ),
    'heroes', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', h.id,
          'name', h.name,
          'slug', h.slug,
          'display_order', h.display_order,
          'enabled', h.enabled
        ) order by h.display_order, h.name, h.id
      )
      from public.heroes h
      where h.enabled is true
    ), '[]'::jsonb),
    'queue', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'position', q.position,
          'hero_id', q.hero_id,
          'name', h.name,
          'slug', h.slug,
          'enabled', h.enabled,
          'is_current', q.hero_id = c.current_hero_id
        ) order by q.position
      )
      from private.home_featured_rotation_queue q
      join public.heroes h on h.id = q.hero_id
      where q.singleton_id = c.singleton_id
    ), '[]'::jsonb),
    'history', coalesce((
      select pg_catalog.jsonb_agg(entry.item order by entry.id desc)
      from (
        select history.id,
               pg_catalog.jsonb_build_object(
                 'id', history.id,
                 'event_type', history.event_type,
                 'previous_hero_id', history.previous_hero_id,
                 'previous_hero_name', previous_hero.name,
                 'hero_id', history.hero_id,
                 'hero_name', selected_hero.name,
                 'changed', history.changed,
                 'source', history.source,
                 'period_start_at', history.period_start_at,
                 'period_end_at', history.period_end_at,
                 'executed_at', history.executed_at,
                 'details', history.details
               ) as item
        from private.home_featured_rotation_history history
        left join public.heroes previous_hero on previous_hero.id = history.previous_hero_id
        left join public.heroes selected_hero on selected_hero.id = history.hero_id
        order by history.id desc
        limit 12
      ) entry
    ), '[]'::jsonb)
  ) into v_result
  from private.home_featured_rotation_config c
  left join public.heroes current_hero on current_hero.id = c.current_hero_id
  where c.singleton_id = 1;

  if v_result is null then
    raise exception 'HOME_FEATURED_CONFIGURATION_MISSING' using errcode = '55000';
  end if;

  return v_result;
end;
$$;

create or replace function public.echo_admin_preview_home_featured_rotation_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.echo_require_admin_capability('publishing.view');
  return private.home_featured_next_preview_v1(pg_catalog.statement_timestamp());
end;
$$;

create or replace function public.echo_admin_set_home_featured_automation_v1(
  p_enabled boolean,
  p_expected_revision bigint,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config private.home_featured_rotation_config%rowtype;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_position integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_new_revision bigint;
  v_before jsonb;
  v_after jsonb;
  v_event_type text;
begin
  perform public.echo_require_admin_capability('publishing.publish');

  if p_enabled is null or p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'HOME_FEATURED_AUTOMATION_ARGUMENT_REQUIRED' using errcode = '22023';
  end if;
  if pg_catalog.length(v_reason) < 4 or pg_catalog.length(v_reason) > 240 then
    raise exception 'HOME_FEATURED_REASON_REQUIRED' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('echo_home_featured_rotation_v1', 0)
  );

  select * into strict v_config
  from private.home_featured_rotation_config
  where singleton_id = 1
  for update;

  if v_config.revision <> p_expected_revision then
    raise exception 'HOME_FEATURED_REVISION_CONFLICT:%:%',
      p_expected_revision, v_config.revision using errcode = '40001';
  end if;
  if v_config.automation_enabled = p_enabled then
    return public.echo_admin_home_featured_rotation_v1()
      || pg_catalog.jsonb_build_object('operation', 'unchanged');
  end if;

  select q.position into v_position
  from private.home_featured_rotation_queue q
  join public.heroes h on h.id = q.hero_id and h.enabled is true
  where q.singleton_id = 1 and q.hero_id = v_config.current_hero_id;
  if v_position is null then
    raise exception 'HOME_FEATURED_CURRENT_NOT_ELIGIBLE' using errcode = '22023';
  end if;

  v_new_revision := v_config.revision + 1;
  v_before := pg_catalog.jsonb_build_object(
    'mode', v_config.mode,
    'automation_enabled', v_config.automation_enabled,
    'hero_id', v_config.current_hero_id,
    'revision', v_config.revision,
    'next_rotation_at', v_config.next_rotation_at
  );

  if p_enabled then
    select w.period_start_at, w.period_end_at
    into v_period_start, v_period_end
    from private.home_featured_rotation_window_v1(
      pg_catalog.statement_timestamp(),
      v_config.cadence,
      v_config.timezone_name,
      v_config.local_time,
      v_config.weekday
    ) w;

    update private.home_featured_rotation_config
    set mode = 'automatic',
        automation_enabled = true,
        anchor_hero_id = current_hero_id,
        anchor_position = v_position,
        anchor_period_start_at = v_period_start,
        period_start_at = v_period_start,
        period_end_at = v_period_end,
        next_rotation_at = v_period_end,
        revision = v_new_revision,
        last_evaluated_at = pg_catalog.statement_timestamp(),
        last_status = 'resumed',
        updated_by = auth.uid()
    where singleton_id = 1;
    v_event_type := 'resumed';
  else
    update private.home_featured_rotation_config
    set mode = 'manual',
        automation_enabled = false,
        anchor_hero_id = current_hero_id,
        anchor_position = v_position,
        anchor_period_start_at = null,
        period_start_at = null,
        period_end_at = null,
        next_rotation_at = null,
        revision = v_new_revision,
        last_evaluated_at = pg_catalog.statement_timestamp(),
        last_status = 'paused',
        updated_by = auth.uid()
    where singleton_id = 1;
    v_period_start := null;
    v_period_end := null;
    v_event_type := 'paused';
  end if;

  update public.home_featured_state
  set hero_id = v_config.current_hero_id,
      automation_enabled = p_enabled,
      period_start_at = v_period_start,
      period_end_at = v_period_end,
      next_rotation_at = v_period_end,
      revision = v_new_revision,
      updated_at = pg_catalog.clock_timestamp()
  where singleton_id = 1;

  v_after := pg_catalog.jsonb_build_object(
    'mode', case when p_enabled then 'automatic' else 'manual' end,
    'automation_enabled', p_enabled,
    'hero_id', v_config.current_hero_id,
    'revision', v_new_revision,
    'period_start_at', v_period_start,
    'period_end_at', v_period_end,
    'next_rotation_at', v_period_end,
    'reason', v_reason
  );

  insert into private.home_featured_rotation_history (
    execution_key, revision, event_type, previous_hero_id, hero_id,
    period_start_at, period_end_at, changed, source, actor_user_id,
    details, executed_at
  ) values (
    'automation:' || v_event_type || ':' || v_new_revision::text,
    v_new_revision,
    v_event_type,
    v_config.current_hero_id,
    v_config.current_hero_id,
    v_period_start,
    v_period_end,
    false,
    'admin',
    auth.uid(),
    pg_catalog.jsonb_build_object('reason', v_reason),
    pg_catalog.statement_timestamp()
  );

  perform public.echo_write_admin_audit(
    'publishing',
    'publishing.publish',
    case when p_enabled then 'enable_home_featured_rotation' else 'pause_home_featured_rotation' end,
    'home_featured_rotation',
    '1',
    v_reason,
    v_before,
    v_after,
    null
  );

  return public.echo_admin_home_featured_rotation_v1()
    || pg_catalog.jsonb_build_object(
      'operation', case when p_enabled then 'enabled' else 'paused' end
    );
end;
$$;

revoke all on function private.home_featured_next_preview_v1(timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.echo_admin_preview_home_featured_rotation_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.echo_admin_set_home_featured_automation_v1(boolean,bigint,text)
  from public, anon, authenticated, service_role;

grant execute on function public.echo_admin_preview_home_featured_rotation_v1()
  to authenticated;
grant execute on function public.echo_admin_set_home_featured_automation_v1(boolean,bigint,text)
  to authenticated;

-- O nome é estável: cron.schedule faz upsert e nunca duplica este worker.
select cron.schedule(
  'echo-home-featured-rotation-1m',
  '* * * * *',
  'select private.run_home_featured_rotation_v1(pg_catalog.clock_timestamp());'
);

comment on function private.home_featured_next_preview_v1(timestamptz) is
  'Computes the next eligible hero and real boundary without mutating canonical state.';
comment on function public.echo_admin_preview_home_featured_rotation_v1() is
  'Admin-only preview authority for the next rotation. Requires publishing.view and never writes.';
comment on function public.echo_admin_set_home_featured_automation_v1(boolean,bigint,text) is
  'Enables or pauses anchored rotation with optimistic revision, immutable history and central audit.';
comment on function public.echo_admin_home_featured_rotation_v1() is
  'Phase F admin snapshot with canonical state, next-period preview and Cron health.';

commit;
