-- Echo Pulse: prévia privada vinculada explicitamente ao único administrador atual.
-- Não transforma "ser admin" em direito automático de prévia.

create table if not exists public.pulse_preview_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid null references auth.users(id) on delete set null
);

alter table public.pulse_preview_access enable row level security;

revoke all on table public.pulse_preview_access from public, anon, authenticated;

-- A migração só prossegue se houver exatamente um administrador ativo agora.
-- Esse usuário é incluído uma única vez. Administradores criados depois NÃO herdam acesso.
do $$
declare
  v_admin_count integer;
begin
  select count(*)::integer
    into v_admin_count
  from public.profiles
  where (role = 'admin' or is_admin = true)
    and coalesce(is_blocked, false) = false;

  if v_admin_count <> 1 then
    raise exception 'Echo Pulse owner preview exige exatamente 1 administrador ativo no momento da concessão; encontrados: %', v_admin_count;
  end if;

  insert into public.pulse_preview_access (user_id, granted_by)
  select id, id
  from public.profiles
  where (role = 'admin' or is_admin = true)
    and coalesce(is_blocked, false) = false
  on conflict (user_id) do nothing;
end
$$;

create or replace function public.echo_can_preview_pulse()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.pulse_preview_access ppa
      where ppa.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.is_admin = true)
        and coalesce(p.is_blocked, false) = false
    );
$$;

revoke all on function public.echo_can_preview_pulse() from public, anon;
grant execute on function public.echo_can_preview_pulse() to authenticated, service_role;

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

  return jsonb_build_object(
    'allowed', true,
    'mode', 'owner_private_preview',
    'items', v_items,
    'generated_at', now()
  );
end
$$;

revoke all on function public.echo_pulse_private_preview_feed() from public, anon;
grant execute on function public.echo_pulse_private_preview_feed() to authenticated, service_role;
