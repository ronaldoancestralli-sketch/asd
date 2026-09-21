-- EchoArena
-- Persistência de comparações salvas. A tabela guarda apenas a relação entre
-- builds; resultados numéricos continuam sendo recalculados pelo motor atual.

create unique index if not exists build_comparisons_user_pair_uidx
  on public.build_comparisons(user_id, left_build_id, right_build_id)
  where user_id is not null;

-- Usuário lê as próprias comparações; Admin pode auditar/gerenciar.
drop policy if exists build_compare_manage on public.build_comparisons;
drop policy if exists build_comparisons_owner_read on public.build_comparisons;
drop policy if exists build_comparisons_admin_all on public.build_comparisons;

create policy build_comparisons_owner_read
on public.build_comparisons for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_admin())
);

create policy build_comparisons_admin_all
on public.build_comparisons for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create or replace function public.toggle_saved_build_comparison(
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
  v_is_admin boolean := public.is_admin();
  v_left public.builds%rowtype;
  v_right public.builds%rowtype;
  v_existing uuid;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_left_build_id is null or p_right_build_id is null or p_left_build_id = p_right_build_id then
    raise exception 'invalid_build_comparison_pair' using errcode = '22023';
  end if;

  select b.* into v_left
  from public.builds b
  where b.id = p_left_build_id
    and b.deleted_at is null;

  if not found then
    raise exception 'comparison_left_build_unavailable' using errcode = '42501';
  end if;

  if not (
    v_left.user_id = v_user
    or v_is_admin
    or (
      v_left.is_public = true
      and v_left.visibility = 'public'
      and v_left.status = 'published'
    )
  ) then
    raise exception 'comparison_left_build_unavailable' using errcode = '42501';
  end if;

  select b.* into v_right
  from public.builds b
  where b.id = p_right_build_id
    and b.deleted_at is null
    and b.is_public = true
    and b.visibility = 'public'
    and b.status = 'published';

  if not found then
    raise exception 'comparison_right_build_must_be_public' using errcode = '42501';
  end if;

  if v_left.hero_id is distinct from v_right.hero_id then
    raise exception 'comparison_heroes_must_match' using errcode = '22023';
  end if;

  select c.id into v_existing
  from public.build_comparisons c
  where c.user_id = v_user
    and c.left_build_id = p_left_build_id
    and c.right_build_id = p_right_build_id
  limit 1;

  if v_existing is not null then
    delete from public.build_comparisons c where c.id = v_existing;
    return jsonb_build_object(
      'saved', false,
      'id', v_existing,
      'left_build_id', p_left_build_id,
      'right_build_id', p_right_build_id
    );
  end if;

  insert into public.build_comparisons(
    user_id, left_build_id, right_build_id, title
  ) values (
    v_user,
    p_left_build_id,
    p_right_build_id,
    left(nullif(btrim(coalesce(p_title, '')), ''), 160)
  )
  returning id into v_id;

  return jsonb_build_object(
    'saved', true,
    'id', v_id,
    'left_build_id', p_left_build_id,
    'right_build_id', p_right_build_id
  );
end;
$$;

revoke execute on function public.toggle_saved_build_comparison(uuid, uuid, text)
  from public, anon;
grant execute on function public.toggle_saved_build_comparison(uuid, uuid, text)
  to authenticated, service_role;

-- Data API: nenhuma leitura anônima nem privilégios de DDL/estrutura.
revoke all privileges on table public.build_comparisons from anon;
revoke truncate, references, trigger on table public.build_comparisons from authenticated;
-- authenticated conserva SELECT e DML para a policy Admin; usuário comum fica
-- sem policy de escrita e grava somente pela RPC acima.
