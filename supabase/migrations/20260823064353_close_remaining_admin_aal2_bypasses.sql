-- EchoArena — fechamento dos últimos caminhos administrativos fora do AAL2.
-- Complementa 20260823061000 após auditoria de privilégios efetivos.

begin;

-- ------------------------------------------------------------
-- 1. Profiles: remover o GRANT de tabela, que prevalece sobre revokes de coluna.
-- ------------------------------------------------------------

revoke select on table public.profiles from anon, authenticated;

grant select (id, username, display_name, avatar_url, created_at, updated_at)
on public.profiles to anon, authenticated;

-- ------------------------------------------------------------
-- 2. site_pages: todas as mutações administrativas passam pelo helper AAL2.
-- ------------------------------------------------------------

drop policy if exists site_pages_admin_delete on public.site_pages;
drop policy if exists site_pages_admin_insert on public.site_pages;
drop policy if exists site_pages_admin_update on public.site_pages;

create policy site_pages_admin_delete
on public.site_pages
for delete
to authenticated
using ((select public.is_admin()));

create policy site_pages_admin_insert
on public.site_pages
for insert
to authenticated
with check ((select public.is_admin()));

create policy site_pages_admin_update
on public.site_pages
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- ------------------------------------------------------------
-- 3. Storage/site-content: remove checagem direta de role e exige AAL2 centralizado.
-- ------------------------------------------------------------

drop policy if exists site_content_admin_delete on storage.objects;
drop policy if exists site_content_admin_update on storage.objects;
drop policy if exists site_content_admin_upload on storage.objects;

create policy site_content_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'game-media'
  and (storage.foldername(name))[1] = 'site-content'
  and (select public.current_user_is_admin())
);

create policy site_content_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'game-media'
  and (storage.foldername(name))[1] = 'site-content'
  and (select public.current_user_is_admin())
)
with check (
  bucket_id = 'game-media'
  and (storage.foldername(name))[1] = 'site-content'
  and (select public.current_user_is_admin())
);

create policy site_content_admin_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'game-media'
  and (storage.foldername(name))[1] = 'site-content'
  and (select public.current_user_is_admin())
);

commit;
