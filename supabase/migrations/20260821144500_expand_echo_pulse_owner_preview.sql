-- Echo Pulse owner preview: expande o feed privado com sinais reais do próprio EchoArena.
-- Continua acessível somente a UIDs presentes em pulse_preview_access.

create or replace function public.echo_pulse_private_preview_feed()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_allowed boolean;
  v_items jsonb;
  v_sources jsonb;
  v_community jsonb;
  v_overview jsonb;
  v_build_activity jsonb;
begin
  select public.echo_can_preview_pulse() into v_allowed;

  if v_allowed is not true then
    raise exception 'echo_pulse_preview_forbidden' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'title', i.title,
        'summary', i.summary,
        'source_excerpt', i.source_excerpt,
        'image_url', i.image_url,
        'category', i.category,
        'status', i.status,
        'trust_level', i.trust_level,
        'relevance_score', i.relevance_score,
        'source_name', i.source_name,
        'source_platform', i.source_platform,
        'canonical_url', i.canonical_url,
        'source_published_at', i.source_published_at,
        'collected_at', i.collected_at,
        'is_featured', i.is_featured,
        'discussion_enabled', i.discussion_enabled,
        'metadata', jsonb_build_object(
          'editorial_language', i.metadata->>'editorial_language',
          'source_language', i.metadata->>'source_language',
          'translation_status', i.metadata->>'translation_status'
        )
      )
      order by coalesce(i.source_published_at, i.collected_at) desc
    ),
    '[]'::jsonb
  )
  into v_items
  from public.pulse_items i
  where i.status <> 'ignored';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', s.name,
        'source_type', s.source_type,
        'platform', s.platform,
        'adapter', s.adapter,
        'enabled', s.enabled,
        'auto_collect', s.auto_collect,
        'last_success_at', s.last_success_at,
        'last_error', s.last_error
      )
      order by s.source_type, s.name
    ),
    '[]'::jsonb
  )
  into v_sources
  from public.pulse_sources s
  where s.enabled = true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'title', q.title,
        'body', q.body,
        'kind', q.kind,
        'reaction_count', q.reaction_count,
        'reply_count', q.reply_count,
        'created_at', q.created_at,
        'author_name', coalesce(p.display_name, p.username, 'Jogador')
      )
      order by q.created_at desc
    ),
    '[]'::jsonb
  )
  into v_community
  from (
    select cp.*
    from public.community_posts cp
    where coalesce(cp.status, 'active') not in ('hidden', 'deleted')
    order by cp.created_at desc
    limit 6
  ) q
  left join public.profiles p on p.id = q.author_id;

  select jsonb_build_object(
    'pulse_items', (select count(*) from public.pulse_items where status <> 'ignored'),
    'official_items', (select count(*) from public.pulse_items where status <> 'ignored' and trust_level = 'official'),
    'updates', (select count(*) from public.pulse_items where status <> 'ignored' and category = 'update'),
    'patches', (select count(*) from public.pulse_items where status <> 'ignored' and category = 'patch'),
    'events', (select count(*) from public.pulse_items where status <> 'ignored' and category = 'event'),
    'creator_items', (select count(*) from public.pulse_items where status <> 'ignored' and category = 'creator'),
    'gaming_items', (select count(*) from public.pulse_items where status <> 'ignored' and category = 'gaming'),
    'community_items', (select count(*) from public.pulse_items where status <> 'ignored' and category = 'community'),
    'community_posts', (select count(*) from public.community_posts where coalesce(status, 'active') not in ('hidden', 'deleted')),
    'community_comments', (select count(*) from public.community_comments where coalesce(status, 'active') not in ('hidden', 'deleted')),
    'sources_enabled', (select count(*) from public.pulse_sources where enabled = true),
    'sources_auto', (select count(*) from public.pulse_sources where enabled = true and auto_collect = true),
    'last_collected_at', (select max(collected_at) from public.pulse_items where status <> 'ignored')
  ) into v_overview;

  select jsonb_build_object(
    'public_builds', count(*),
    'engaged_builds', count(*) filter (where coalesce(b.views,0)+coalesce(b.likes,0)+coalesce(b.comments_count,0)+coalesce(b.favorites_count,0)+coalesce(b.rating_count,0) > 0),
    'views', coalesce(sum(b.views),0),
    'likes', coalesce(sum(b.likes),0),
    'comments', coalesce(sum(b.comments_count),0),
    'favorites', coalesce(sum(b.favorites_count),0),
    'ratings', coalesce(sum(b.rating_count),0)
  )
  into v_build_activity
  from public.builds b
  where b.deleted_at is null
    and (b.is_public = true or b.visibility = 'public');

  return jsonb_build_object(
    'allowed', true,
    'mode', 'owner_private_preview',
    'items', v_items,
    'sources', v_sources,
    'community', v_community,
    'overview', v_overview,
    'build_activity', v_build_activity,
    'generated_at', now()
  );
end
$$;

revoke all on function public.echo_pulse_private_preview_feed() from public, anon;
grant execute on function public.echo_pulse_private_preview_feed() to authenticated, service_role;
