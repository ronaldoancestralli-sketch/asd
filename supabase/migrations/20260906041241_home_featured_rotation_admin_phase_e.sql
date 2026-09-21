begin;

-- Echo Arena — etapa E do destaque editorial da home.
-- Expõe somente comandos administrativos auditáveis. A automação e o cron
-- continuam indisponíveis até a etapa F.

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
    'phase', 'E',
    'automation_available', false,
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

create or replace function public.echo_admin_save_home_featured_plan_v1(
  p_cadence text,
  p_timezone_name text,
  p_local_time time without time zone,
  p_weekday smallint,
  p_queue uuid[],
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config private.home_featured_rotation_config%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_old_queue uuid[];
  v_invalid_count integer;
  v_new_revision bigint;
begin
  perform public.echo_require_admin_capability('publishing.edit');

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'HOME_FEATURED_EXPECTED_REVISION_REQUIRED' using errcode = '22023';
  end if;
  if p_cadence is null or p_cadence not in ('daily', 'weekly')
     or p_timezone_name is null or pg_catalog.btrim(p_timezone_name) = ''
     or p_local_time is null or p_weekday is null or p_weekday not between 0 and 6 then
    raise exception 'HOME_FEATURED_PLAN_INVALID' using errcode = '22023';
  end if;
  if p_queue is null or pg_catalog.cardinality(p_queue) = 0
     or pg_catalog.cardinality(p_queue) > 100
     or pg_catalog.array_position(p_queue, null::uuid) is not null
     or pg_catalog.cardinality(p_queue) <> (
       select pg_catalog.count(distinct item.hero_id)
       from pg_catalog.unnest(p_queue) item(hero_id)
     ) then
    raise exception 'HOME_FEATURED_QUEUE_INVALID' using errcode = '22023';
  end if;

  select * into strict v_config
  from private.home_featured_rotation_config
  where singleton_id = 1
  for update;

  if v_config.revision <> p_expected_revision then
    raise exception 'HOME_FEATURED_REVISION_CONFLICT:%:%',
      p_expected_revision, v_config.revision using errcode = '40001';
  end if;
  if v_config.automation_enabled then
    raise exception 'HOME_FEATURED_AUTOMATION_MANAGED_IN_PHASE_F' using errcode = '55000';
  end if;
  if v_config.current_hero_id is null
     or not (v_config.current_hero_id = any(p_queue)) then
    raise exception 'HOME_FEATURED_CURRENT_MUST_REMAIN_IN_QUEUE' using errcode = '22023';
  end if;

  select pg_catalog.count(*) into v_invalid_count
  from pg_catalog.unnest(p_queue) item(hero_id)
  left join public.heroes h on h.id = item.hero_id and h.enabled is true
  where h.id is null;
  if v_invalid_count > 0 then
    raise exception 'HOME_FEATURED_QUEUE_HAS_INELIGIBLE_HERO' using errcode = '22023';
  end if;

  select coalesce(pg_catalog.array_agg(q.hero_id order by q.position), array[]::uuid[])
  into v_old_queue
  from private.home_featured_rotation_queue q
  where q.singleton_id = 1;

  if v_config.cadence = p_cadence
     and v_config.timezone_name = pg_catalog.btrim(p_timezone_name)
     and v_config.local_time = p_local_time
     and v_config.weekday = p_weekday
     and v_old_queue = p_queue then
    return public.echo_admin_home_featured_rotation_v1()
      || pg_catalog.jsonb_build_object('operation', 'unchanged');
  end if;

  v_before := pg_catalog.jsonb_build_object(
    'cadence', v_config.cadence,
    'timezone_name', v_config.timezone_name,
    'local_time', v_config.local_time,
    'weekday', v_config.weekday,
    'queue', v_old_queue,
    'revision', v_config.revision
  );

  delete from private.home_featured_rotation_queue where singleton_id = 1;
  insert into private.home_featured_rotation_queue (singleton_id, position, hero_id)
  select 1, item.position::integer, item.hero_id
  from pg_catalog.unnest(p_queue) with ordinality item(hero_id, position);

  update private.home_featured_rotation_config
  set mode = 'manual',
      automation_enabled = false,
      cadence = p_cadence,
      timezone_name = pg_catalog.btrim(p_timezone_name),
      local_time = p_local_time,
      weekday = p_weekday,
      anchor_hero_id = current_hero_id,
      anchor_position = (
        select q.position
        from private.home_featured_rotation_queue q
        where q.singleton_id = 1 and q.hero_id = current_hero_id
      ),
      anchor_period_start_at = null,
      period_start_at = null,
      period_end_at = null,
      next_rotation_at = null,
      revision = revision + 1,
      last_status = 'configured',
      last_evaluated_at = null,
      updated_by = auth.uid()
  where singleton_id = 1
  returning revision into v_new_revision;

  update public.home_featured_state
  set hero_id = v_config.current_hero_id,
      automation_enabled = false,
      period_start_at = null,
      period_end_at = null,
      next_rotation_at = null,
      revision = v_new_revision,
      updated_at = pg_catalog.clock_timestamp()
  where singleton_id = 1;

  v_after := pg_catalog.jsonb_build_object(
    'cadence', p_cadence,
    'timezone_name', pg_catalog.btrim(p_timezone_name),
    'local_time', p_local_time,
    'weekday', p_weekday,
    'queue', p_queue,
    'revision', v_new_revision
  );

  insert into private.home_featured_rotation_history (
    execution_key, revision, event_type, previous_hero_id, hero_id,
    changed, source, actor_user_id, details
  ) values (
    'schedule:' || v_new_revision::text,
    v_new_revision,
    'schedule_changed',
    v_config.current_hero_id,
    v_config.current_hero_id,
    false,
    'admin',
    auth.uid(),
    v_after
  );

  perform public.echo_write_admin_audit(
    'publishing', 'publishing.edit', 'save_home_featured_plan',
    'home_featured_rotation', '1', null, v_before, v_after, null
  );

  return public.echo_admin_home_featured_rotation_v1()
    || pg_catalog.jsonb_build_object('operation', 'saved');
end;
$$;

create or replace function public.echo_admin_set_home_featured_hero_v1(
  p_hero_id uuid,
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
  v_before jsonb;
  v_after jsonb;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_position integer;
  v_new_revision bigint;
begin
  perform public.echo_require_admin_capability('publishing.publish');

  if p_hero_id is null or p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'HOME_FEATURED_HERO_AND_REVISION_REQUIRED' using errcode = '22023';
  end if;
  if pg_catalog.length(v_reason) < 4 or pg_catalog.length(v_reason) > 240 then
    raise exception 'HOME_FEATURED_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into strict v_config
  from private.home_featured_rotation_config
  where singleton_id = 1
  for update;

  if v_config.revision <> p_expected_revision then
    raise exception 'HOME_FEATURED_REVISION_CONFLICT:%:%',
      p_expected_revision, v_config.revision using errcode = '40001';
  end if;
  if v_config.automation_enabled then
    raise exception 'HOME_FEATURED_AUTOMATION_MANAGED_IN_PHASE_F' using errcode = '55000';
  end if;
  if v_config.current_hero_id = p_hero_id then
    return public.echo_admin_home_featured_rotation_v1()
      || pg_catalog.jsonb_build_object('operation', 'unchanged');
  end if;

  select q.position into v_position
  from private.home_featured_rotation_queue q
  join public.heroes h on h.id = q.hero_id and h.enabled is true
  where q.singleton_id = 1 and q.hero_id = p_hero_id;
  if v_position is null then
    raise exception 'HOME_FEATURED_HERO_NOT_ELIGIBLE' using errcode = '22023';
  end if;

  v_before := pg_catalog.jsonb_build_object(
    'hero_id', v_config.current_hero_id,
    'revision', v_config.revision,
    'mode', v_config.mode,
    'automation_enabled', v_config.automation_enabled
  );
  v_new_revision := v_config.revision + 1;

  update private.home_featured_rotation_config
  set mode = 'manual',
      automation_enabled = false,
      current_hero_id = p_hero_id,
      anchor_hero_id = p_hero_id,
      anchor_position = v_position,
      anchor_period_start_at = null,
      period_start_at = null,
      period_end_at = null,
      next_rotation_at = null,
      revision = v_new_revision,
      last_status = 'manual_override',
      last_evaluated_at = null,
      updated_by = auth.uid()
  where singleton_id = 1;

  update public.home_featured_state
  set hero_id = p_hero_id,
      automation_enabled = false,
      period_start_at = null,
      period_end_at = null,
      next_rotation_at = null,
      revision = v_new_revision,
      updated_at = pg_catalog.clock_timestamp()
  where singleton_id = 1;

  v_after := pg_catalog.jsonb_build_object(
    'hero_id', p_hero_id,
    'revision', v_new_revision,
    'mode', 'manual',
    'automation_enabled', false,
    'reason', v_reason
  );

  insert into private.home_featured_rotation_history (
    execution_key, revision, event_type, previous_hero_id, hero_id,
    changed, source, actor_user_id, details
  ) values (
    'manual:' || v_new_revision::text,
    v_new_revision,
    'manual_override',
    v_config.current_hero_id,
    p_hero_id,
    true,
    'admin',
    auth.uid(),
    pg_catalog.jsonb_build_object('reason', v_reason)
  );

  perform public.echo_write_admin_audit(
    'publishing', 'publishing.publish', 'set_home_featured_hero',
    'home_featured_rotation', '1', v_reason, v_before, v_after, null
  );

  return public.echo_admin_home_featured_rotation_v1()
    || pg_catalog.jsonb_build_object('operation', 'published');
end;
$$;

revoke all on function public.echo_admin_home_featured_rotation_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.echo_admin_save_home_featured_plan_v1(
  text, text, time without time zone, smallint, uuid[], bigint
) from public, anon, authenticated, service_role;
revoke all on function public.echo_admin_set_home_featured_hero_v1(
  uuid, bigint, text
) from public, anon, authenticated, service_role;

grant execute on function public.echo_admin_home_featured_rotation_v1()
  to authenticated;
grant execute on function public.echo_admin_save_home_featured_plan_v1(
  text, text, time without time zone, smallint, uuid[], bigint
) to authenticated;
grant execute on function public.echo_admin_set_home_featured_hero_v1(
  uuid, bigint, text
) to authenticated;

comment on function public.echo_admin_home_featured_rotation_v1() is
  'Admin-only snapshot for phase E. Requires publishing.view and never activates automation.';
comment on function public.echo_admin_save_home_featured_plan_v1(
  text, text, time without time zone, smallint, uuid[], bigint
) is 'Saves cadence, timezone, local time and queue with optimistic concurrency. Requires publishing.edit.';
comment on function public.echo_admin_set_home_featured_hero_v1(
  uuid, bigint, text
) is 'Changes the manual featured hero with reason, history and central audit. Requires publishing.publish.';

commit;
