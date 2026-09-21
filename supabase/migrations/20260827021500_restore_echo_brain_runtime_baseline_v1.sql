-- Restore the Echo Brain runtime after the 2026-08-24 provider recovery.
-- This migration does not enable learned influence. It only rebuilds a versioned
-- baseline from the live catalogue so Semantic V4 can validate provenance again.

do $$
declare
  v_season_id uuid;
  v_game_version text;
  v_slug text := 'restored-current-baseline-20260827';
begin
  select id, game_version
    into v_season_id, v_game_version
  from public.seasons
  where active is true
  order by starts_at desc nulls last, created_at desc
  limit 1;

  if v_season_id is null then
    select coalesce(
      (
        select nullif(trim(patch_version), '')
        from public.balance_history
        where patch_version is not null and trim(patch_version) <> ''
        order by created_at desc
        limit 1
      ),
      'restored-current-baseline'
    ) into v_game_version;

    select id into v_season_id
    from public.seasons
    where slug = v_slug
    limit 1;

    if v_season_id is null then
      insert into public.seasons(name, slug, game_version, starts_at, active, notes)
      values(
        'Baseline atual restaurada',
        v_slug,
        v_game_version,
        now(),
        true,
        'Baseline operacional criada após a recuperação do provedor. O rótulo de versão é derivado do histórico de balanceamento disponível e não ativa aprendizado.'
      )
      returning id into v_season_id;
    else
      update public.seasons
      set active = true,
          game_version = coalesce(nullif(trim(game_version), ''), v_game_version),
          starts_at = coalesce(starts_at, now()),
          notes = coalesce(notes, 'Baseline operacional restaurada; aprendizado permanece sob governança explícita.')
      where id = v_season_id;

      select game_version into v_game_version from public.seasons where id = v_season_id;
    end if;
  end if;

  if v_season_id is null or coalesce(trim(v_game_version), '') = '' then
    raise exception 'active_season_baseline_required';
  end if;

  -- Build a real snapshot of each current equipment. Baseline rows never create
  -- competitive debt because they describe the state already live at restore time.
  with snapshots as (
    select
      e.id::text as equipment_id,
      jsonb_build_object(
        'equipment', to_jsonb(e),
        'variants', coalesce((
          select jsonb_agg(to_jsonb(v) order by v.id)
          from public.equipment_variants v
          where v.equipment_id = e.id
        ), '[]'::jsonb),
        'setBonuses', coalesce((
          select jsonb_agg(to_jsonb(b) order by b.id)
          from public.equipment_set_bonuses b
          where e.set_id is not null and b.set_id = e.set_id
        ), '[]'::jsonb)
      ) as snapshot
    from public.equipments e
  ), rows_to_insert as (
    select
      s.equipment_id,
      s.snapshot,
      coalesce((select max(v.version) from public.equipment_brain_versions v where v.equipment_id=s.equipment_id), 0) + 1 as next_version
    from snapshots s
    where not exists (
      select 1
      from public.equipment_brain_versions v
      where v.equipment_id=s.equipment_id
        and v.season_id=v_season_id
        and v.game_version=v_game_version
    )
  )
  insert into public.equipment_brain_versions(
    equipment_id, version, season_id, game_version, source, change_class, severity,
    affects_brain, requires_reevaluation, requires_retraining, semantic_fingerprint,
    before_snapshot, after_snapshot, analysis
  )
  select
    equipment_id, next_version, v_season_id, v_game_version,
    'provider-restore-baseline', 'baseline_restore', 'none',
    false, false, false, md5(snapshot::text), null, snapshot,
    jsonb_build_object('baseline', true, 'restore', '2026-08-27', 'learnedInfluenceChanged', false)
  from rows_to_insert;

  update public.equipment_brain_change_queue q
  set status='resolved', resolved_at=now(), updated_at=now()
  where exists (
    select 1 from public.equipment_brain_versions v
    where v.equipment_id=q.equipment_id
      and v.season_id=v_season_id
      and v.game_version=v_game_version
  );

  -- Version every hero profile from the actual live hero, verified skills and
  -- current stat tables. No local score or learned model is generated here.
  with snapshots as (
    select
      h.id::text as entity_id,
      jsonb_build_object(
        'hero', to_jsonb(h),
        'skills', coalesce((
          select jsonb_agg(to_jsonb(s) order by s.display_order, s.id)
          from public.hero_skills s
          where s.hero_id=h.id
        ), '[]'::jsonb),
        'baseStats', coalesce((
          select jsonb_object_agg(b.stat_key, b.value order by b.stat_key)
          from public.hero_base_stats b
          where b.hero_id=h.id
        ), '{}'::jsonb),
        'weaponStats', coalesce((
          select jsonb_object_agg(w.stat_key, w.value order by w.stat_key)
          from public.hero_weapon_stats w
          where w.hero_id=h.id
        ), '{}'::jsonb)
      ) as snapshot
    from public.heroes h
  ), rows_to_insert as (
    select
      s.entity_id,
      s.snapshot,
      coalesce((select max(v.version) from public.echo_brain_knowledge_versions v where v.entity_type='hero_profile' and v.entity_id=s.entity_id), 0) + 1 as next_version
    from snapshots s
    where not exists (
      select 1
      from public.echo_brain_knowledge_versions v
      where v.entity_type='hero_profile'
        and v.entity_id=s.entity_id
        and v.season_id=v_season_id
        and v.game_version=v_game_version
    )
  )
  insert into public.echo_brain_knowledge_versions(
    entity_type, entity_id, version, season_id, game_version, source,
    change_class, semantic_fingerprint, snapshot
  )
  select
    'hero_profile', entity_id, next_version, v_season_id, v_game_version,
    'provider-restore-baseline', 'baseline_restore', md5(snapshot::text), snapshot
  from rows_to_insert;

  update public.echo_brain_knowledge_change_queue q
  set status='resolved', resolved_at=now(), updated_at=now()
  where q.entity_type='hero_profile'
    and exists (
      select 1 from public.echo_brain_knowledge_versions v
      where v.entity_type='hero_profile'
        and v.entity_id=q.entity_id
        and v.season_id=v_season_id
        and v.game_version=v_game_version
    );
end;
$$;

-- Baseline restore itself is not a patch change, therefore it must not fabricate
-- invalidations or historical influence. Existing genuine invalidations are kept.
