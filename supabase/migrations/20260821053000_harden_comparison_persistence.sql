-- EchoArena
-- Persistência segura de comparações sem reabrir escrita direta de usuário.
-- A tabela build_comparisons continua com escrita direta Admin-only;
-- usuários autenticados alternam salvos pela RPC abaixo, com validação explícita.

-- hero_comparisons possuía SELECT redundante com o mesmo predicado do ALL.
drop policy if exists hero_compare_read on public.hero_comparisons;

-- build_comparisons: remover sobreposição SELECT causada pelo Admin ALL.
drop policy if exists build_comparisons_admin_all on public.build_comparisons;
drop policy if exists build_comparisons_admin_insert on public.build_comparisons;
drop policy if exists build_comparisons_admin_update on public.build_comparisons;
drop policy if exists build_comparisons_admin_delete on public.build_comparisons;

create policy build_comparisons_admin_insert
on public.build_comparisons for insert to authenticated
with check ((select public.is_admin()));

create policy build_comparisons_admin_update
on public.build_comparisons for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy build_comparisons_admin_delete
on public.build_comparisons for delete to authenticated
using ((select public.is_admin()));

-- Uma mesma comparação orientada não deve ser salva mais de uma vez pelo usuário.
create unique index if not exists build_comparisons_user_pair_uidx
  on public.build_comparisons(user_id, left_build_id, right_build_id)
  where user_id is not null;

create or replace function public.toggle_build_comparison(
  p_left_build_id uuid,
  p_right_build_id uuid,
  p_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_left_hero uuid;
  v_right_hero uuid;
  v_existing_id uuid;
  v_new_id uuid;
  v_title text := nullif(left(btrim(coalesce(p_title, '')), 160), '');
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_left_build_id is null or p_right_build_id is null then
    raise exception 'comparison_build_required' using errcode = '22023';
  end if;

  if p_left_build_id = p_right_build_id then
    raise exception 'comparison_requires_distinct_builds' using errcode = '22023';
  end if;

  -- Lado esquerdo pode ser uma build própria não deletada ou uma build pública
  -- canônica. Isso preserva links que usam uma build pública como referência.
  select b.hero_id
    into v_left_hero
  from public.builds b
  where b.id = p_left_build_id
    and b.deleted_at is null
    and (
      b.user_id = v_user
      or (
        b.is_public = true
        and b.visibility = 'public'
        and b.status = 'published'
      )
    );

  if not found then
    raise exception 'left_build_not_accessible_or_missing' using errcode = '42501';
  end if;

  -- O oponente salvo precisa continuar sendo uma build comunitária realmente
  -- publicada. A função é SECURITY DEFINER, então a checagem é explícita.
  select b.hero_id
    into v_right_hero
  from public.builds b
  where b.id = p_right_build_id
    and b.is_public = true
    and b.visibility = 'public'
    and b.status = 'published'
    and b.deleted_at is null;

  if not found then
    raise exception 'right_build_not_public_or_missing' using errcode = '42501';
  end if;

  if v_left_hero is distinct from v_right_hero then
    raise exception 'comparison_hero_mismatch' using errcode = '22023';
  end if;

  delete from public.build_comparisons c
  where c.user_id = v_user
    and c.left_build_id = p_left_build_id
    and c.right_build_id = p_right_build_id
  returning c.id into v_existing_id;

  if v_existing_id is not null then
    return jsonb_build_object(
      'saved', false,
      'id', v_existing_id,
      'left_build_id', p_left_build_id,
      'right_build_id', p_right_build_id
    );
  end if;

  insert into public.build_comparisons(user_id, left_build_id, right_build_id, title)
  values (v_user, p_left_build_id, p_right_build_id, v_title)
  returning id into v_new_id;

  return jsonb_build_object(
    'saved', true,
    'id', v_new_id,
    'left_build_id', p_left_build_id,
    'right_build_id', p_right_build_id
  );
end;
$$;

revoke execute on function public.toggle_build_comparison(uuid, uuid, text)
  from public, anon;
grant execute on function public.toggle_build_comparison(uuid, uuid, text)
  to authenticated, service_role;

-- A escrita direta continua fechada para usuário comum; a RPC acima é a porta.
revoke insert, update, delete on table public.build_comparisons from anon;
