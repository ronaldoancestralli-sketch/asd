-- EchoArena
-- Centraliza a escrita de Builds nas RPCs transacionais e deriva o estado público
-- de visibility/status/deleted_at. Não altera cálculo de atributos de jogo.

create or replace function public.normalize_build_publication_state()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.is_public := (
    new.deleted_at is null
    and new.visibility = 'public'
    and new.status = 'published'
  );

  if new.is_public then
    new.published_at := coalesce(new.published_at, now());
  else
    new.published_at := null;
  end if;

  return new;
end;
$$;

revoke execute on function public.normalize_build_publication_state()
  from public, anon, authenticated;

drop trigger if exists builds_normalize_publication_state on public.builds;
create trigger builds_normalize_publication_state
before insert or update of visibility, status, deleted_at, is_public
on public.builds
for each row
execute function public.normalize_build_publication_state();

-- A leitura pública usa um único contrato canônico de publicação.
drop policy if exists builds_public_or_owner_read on public.builds;
drop policy if exists builds_anon_read on public.builds;
drop policy if exists builds_authenticated_read on public.builds;

create policy builds_anon_read
on public.builds for select to anon
using (
  is_public = true
  and visibility = 'public'
  and status = 'published'
  and deleted_at is null
);

create policy builds_authenticated_read
on public.builds for select to authenticated
using (
  (
    is_public = true
    and visibility = 'public'
    and status = 'published'
    and deleted_at is null
  )
  or user_id = (select auth.uid())
  or (select public.is_admin())
);

-- Filhos públicos seguem exatamente o mesmo contrato da build pai.
drop policy if exists build_items_anon_read on public.build_items;
drop policy if exists build_items_authenticated_read on public.build_items;
create policy build_items_anon_read
on public.build_items for select to anon
using (
  exists (
    select 1 from public.builds b
    where b.id = build_items.build_id
      and b.is_public = true
      and b.visibility = 'public'
      and b.status = 'published'
      and b.deleted_at is null
  )
);
create policy build_items_authenticated_read
on public.build_items for select to authenticated
using (
  exists (
    select 1 from public.builds b
    where b.id = build_items.build_id
      and (
        (
          b.is_public = true
          and b.visibility = 'public'
          and b.status = 'published'
          and b.deleted_at is null
        )
        or b.user_id = (select auth.uid())
        or (select public.is_admin())
      )
  )
);

drop policy if exists build_tag_links_anon_read on public.build_tag_links;
drop policy if exists build_tag_links_authenticated_read on public.build_tag_links;
create policy build_tag_links_anon_read
on public.build_tag_links for select to anon
using (
  exists (
    select 1 from public.builds b
    where b.id = build_tag_links.build_id
      and b.is_public = true
      and b.visibility = 'public'
      and b.status = 'published'
      and b.deleted_at is null
  )
);
create policy build_tag_links_authenticated_read
on public.build_tag_links for select to authenticated
using (
  exists (
    select 1 from public.builds b
    where b.id = build_tag_links.build_id
      and (
        (
          b.is_public = true
          and b.visibility = 'public'
          and b.status = 'published'
          and b.deleted_at is null
        )
        or b.user_id = (select auth.uid())
        or (select public.is_admin())
      )
  )
);

drop policy if exists build_ratings_anon_read on public.build_ratings;
drop policy if exists build_ratings_authenticated_read on public.build_ratings;
create policy build_ratings_anon_read
on public.build_ratings for select to anon
using (
  exists (
    select 1 from public.builds b
    where b.id = build_ratings.build_id
      and b.is_public = true
      and b.visibility = 'public'
      and b.status = 'published'
      and b.deleted_at is null
  )
);
create policy build_ratings_authenticated_read
on public.build_ratings for select to authenticated
using (
  exists (
    select 1 from public.builds b
    where b.id = build_ratings.build_id
      and (
        (
          b.is_public = true
          and b.visibility = 'public'
          and b.status = 'published'
          and b.deleted_at is null
        )
        or b.user_id = (select auth.uid())
        or (select public.is_admin())
      )
  )
);

-- Avaliar uma build exige o mesmo estado público canônico.
drop policy if exists build_ratings_insert_own on public.build_ratings;
create policy build_ratings_insert_own
on public.build_ratings for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.builds b
    where b.id = build_ratings.build_id
      and b.is_public = true
      and b.visibility = 'public'
      and b.status = 'published'
      and b.deleted_at is null
      and b.user_id <> (select auth.uid())
  )
);

-- Usuário comum não escreve diretamente nas tabelas de composição da build.
-- save_user_build/clone_build são SECURITY DEFINER e continuam sendo as portas transacionais.
drop policy if exists builds_insert_own on public.builds;
drop policy if exists builds_update_own on public.builds;
drop policy if exists builds_delete_own on public.builds;

drop policy if exists build_items_insert_own_build on public.build_items;
drop policy if exists build_items_update_own_build on public.build_items;
drop policy if exists build_items_delete_own_build on public.build_items;

drop policy if exists build_tag_links_owner_manage on public.build_tag_links;
drop policy if exists build_versions_owner_insert on public.build_versions;

-- Soft delete/restauração da própria build sem DELETE físico.
create or replace function public.set_user_build_deleted(
  p_build_id uuid,
  p_deleted boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_result public.builds%rowtype;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  update public.builds b
  set deleted_at = case when coalesce(p_deleted, true) then now() else null end,
      updated_at = now()
  where b.id = p_build_id
    and b.user_id = v_user
  returning b.* into v_result;

  if not found then
    raise exception 'build_not_owned_or_missing' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', v_result.id,
    'deleted', v_result.deleted_at is not null,
    'visibility', v_result.visibility,
    'status', v_result.status,
    'is_public', v_result.is_public
  );
end;
$$;

revoke execute on function public.set_user_build_deleted(uuid, boolean)
  from public, anon;
grant execute on function public.set_user_build_deleted(uuid, boolean)
  to authenticated, service_role;

-- Moderação Admin mantém semântica coerente com o estado canônico.
create or replace function public.admin_set_build_flag(
  build_id uuid,
  flag text,
  value boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  author uuid;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if flag not in ('is_featured', 'is_public', 'deleted') then
    raise exception 'Campo inválido.' using errcode = '22023';
  end if;

  select b.user_id into author
  from public.builds b
  where b.id = $1;

  if not found then
    raise exception 'Build não encontrada.' using errcode = 'P0002';
  end if;

  if flag = 'deleted' then
    update public.builds b
    set deleted_at = case when value then now() else null end,
        updated_at = now()
    where b.id = $1;
  elsif flag = 'is_public' then
    if value then
      update public.builds b
      set visibility = 'public',
          status = 'published',
          deleted_at = null,
          published_at = coalesce(b.published_at, now()),
          updated_at = now()
      where b.id = $1;
    else
      update public.builds b
      set visibility = case when b.visibility = 'public' then 'private' else b.visibility end,
          updated_at = now()
      where b.id = $1;
    end if;
  else
    update public.builds b
    set is_featured = value,
        updated_at = now()
    where b.id = $1;
  end if;

  insert into public.user_moderation_log(target_id, actor_id, action, details)
  values (
    author,
    auth.uid(),
    'build_' || flag,
    jsonb_build_object('build_id', $1, 'valor', value)
  );
end;
$$;

revoke execute on function public.admin_set_build_flag(uuid, text, boolean)
  from public, anon;
grant execute on function public.admin_set_build_flag(uuid, text, boolean)
  to authenticated, service_role;

-- Menor privilégio: papéis de Data API não precisam criar constraints/triggers nem truncar tabelas.
revoke truncate, references, trigger on table public.builds from anon, authenticated;
revoke truncate, references, trigger on table public.build_items from anon, authenticated;
revoke truncate, references, trigger on table public.build_tag_links from anon, authenticated;
revoke truncate, references, trigger on table public.build_tags from anon, authenticated;
revoke truncate, references, trigger on table public.build_versions from anon, authenticated;
