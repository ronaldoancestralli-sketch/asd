-- EchoArena — fase compatível do hardening da superfície de perfis.
-- Cria a leitura Admin encapsulada e consolida RLS sem revogar ainda o SELECT amplo.
-- O fechamento de colunas sensíveis deve ocorrer em migration posterior, após o frontend novo estar implantado.
-- Não altera dados existentes nem o trigger de criação de perfil.

create or replace function public.admin_profiles_page(
  p_search text default null,
  p_role text default null,
  p_status text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_search text := nullif(btrim(p_search), '');
  v_role text := nullif(btrim(p_role), '');
  v_status text := nullif(btrim(p_status), '');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint := 0;
  v_users jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select count(*)
    into v_total
    from public.profiles p
   where (
          v_search is null
          or coalesce(p.username, '') ilike '%' || v_search || '%'
          or coalesce(p.display_name, '') ilike '%' || v_search || '%'
        )
     and (v_role is null or v_role = 'all' or p.role = v_role)
     and (
          v_status is null
          or v_status = 'all'
          or (v_status = 'blocked' and p.is_blocked = true)
          or (v_status = 'active' and p.is_blocked = false)
        );

  select coalesce(
           jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc nulls last, page_row.id),
           '[]'::jsonb
         )
    into v_users
    from (
      select
        p.id,
        p.username,
        p.display_name,
        p.avatar_url,
        p.role,
        p.is_blocked,
        p.blocked_reason,
        p.blocked_at,
        p.created_at,
        p.updated_at
      from public.profiles p
      where (
             v_search is null
             or coalesce(p.username, '') ilike '%' || v_search || '%'
             or coalesce(p.display_name, '') ilike '%' || v_search || '%'
            )
        and (v_role is null or v_role = 'all' or p.role = v_role)
        and (
             v_status is null
             or v_status = 'all'
             or (v_status = 'blocked' and p.is_blocked = true)
             or (v_status = 'active' and p.is_blocked = false)
            )
      order by p.created_at desc nulls last, p.id
      limit v_limit
      offset v_offset
    ) page_row;

  select jsonb_build_object(
           'total', count(*),
           'admins', count(*) filter (
             where lower(coalesce(p.role, '')) = 'admin' or p.is_admin = true
           ),
           'blocked', count(*) filter (where p.is_blocked = true),
           'recent_30d', count(*) filter (
             where p.created_at >= now() - interval '30 days'
           )
         )
    into v_summary
    from public.profiles p;

  return jsonb_build_object(
    'users', v_users,
    'total_count', v_total,
    'summary', v_summary
  );
end;
$function$;

revoke execute on function public.admin_profiles_page(text, text, text, integer, integer)
from public, anon;
grant execute on function public.admin_profiles_page(text, text, text, integer, integer)
to authenticated;

-- Consolida policies sem alterar a visibilidade efetiva nesta fase.
drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_public_read on public.profiles;
drop policy if exists profiles_admin_all on public.profiles;
drop policy if exists profiles_self_upd on public.profiles;
drop policy if exists profiles_update_self_or_admin on public.profiles;
drop policy if exists profiles_admin_insert on public.profiles;
drop policy if exists profiles_admin_delete on public.profiles;

create policy profiles_public_read
on public.profiles
for select
to anon, authenticated
using (true);

create policy profiles_admin_insert
on public.profiles
for insert
to authenticated
with check ((select public.is_admin()));

create policy profiles_admin_delete
on public.profiles
for delete
to authenticated
using ((select public.is_admin()));

create policy profiles_update_self_or_admin
on public.profiles
for update
to authenticated
using (
  (select public.is_admin())
  or (
    id = (select auth.uid())
    and not (select public.is_blocked())
  )
)
with check (
  (select public.is_admin())
  or id = (select auth.uid())
);

comment on function public.admin_profiles_page(text, text, text, integer, integer)
is 'Leitura paginada de perfis para o painel Admin. Exige is_admin() e prepara a remoção futura do SELECT amplo em profiles.';
