-- EchoArena
-- Consolida policies permissivas sobrepostas do módulo de Builds SEM reabrir
-- escrita direta de usuário nas tabelas transacionais.
-- Usuários salvam/clonam builds via RPCs SECURITY DEFINER validadas;
-- escrita direta em builds/itens/tags/versões permanece exclusiva de Admin.

-- ---------------------------------------------------------------------------
-- builds
-- Leituras endurecidas já estão separadas em builds_anon_read e
-- builds_authenticated_read. Removemos apenas sobreposição do Admin ALL e
-- eventuais policies legadas de escrita direta de owner.
-- ---------------------------------------------------------------------------
drop policy if exists builds_admin_all on public.builds;
drop policy if exists builds_delete_own on public.builds;
drop policy if exists builds_insert_own on public.builds;
drop policy if exists builds_update_own on public.builds;
drop policy if exists builds_public_or_owner_read on public.builds;
drop policy if exists builds_admin_insert on public.builds;
drop policy if exists builds_admin_update on public.builds;
drop policy if exists builds_admin_delete on public.builds;

create policy builds_admin_insert
on public.builds for insert to authenticated
with check ((select public.is_admin()));

create policy builds_admin_update
on public.builds for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy builds_admin_delete
on public.builds for delete to authenticated
using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- build_items
-- Escrita direta de owner permanece fechada; save_user_build()/clone_build()
-- operam transacionalmente como SECURITY DEFINER.
-- ---------------------------------------------------------------------------
drop policy if exists build_items_admin_all on public.build_items;
drop policy if exists build_items_delete_own_build on public.build_items;
drop policy if exists build_items_insert_own_build on public.build_items;
drop policy if exists build_items_update_own_build on public.build_items;
drop policy if exists build_items_admin_insert on public.build_items;
drop policy if exists build_items_admin_update on public.build_items;
drop policy if exists build_items_admin_delete on public.build_items;

create policy build_items_admin_insert
on public.build_items for insert to authenticated
with check ((select public.is_admin()));

create policy build_items_admin_update
on public.build_items for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy build_items_admin_delete
on public.build_items for delete to authenticated
using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- build_tag_links
-- ---------------------------------------------------------------------------
drop policy if exists build_tag_links_admin_manage on public.build_tag_links;
drop policy if exists build_tag_links_owner_manage on public.build_tag_links;
drop policy if exists build_tag_links_admin_insert on public.build_tag_links;
drop policy if exists build_tag_links_admin_update on public.build_tag_links;
drop policy if exists build_tag_links_admin_delete on public.build_tag_links;

create policy build_tag_links_admin_insert
on public.build_tag_links for insert to authenticated
with check ((select public.is_admin()));

create policy build_tag_links_admin_update
on public.build_tag_links for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy build_tag_links_admin_delete
on public.build_tag_links for delete to authenticated
using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- build_ratings
-- Ratings são uma exceção intencional: o usuário pode criar/editar/remover a
-- própria avaliação. Aqui fundimos owner + admin por ação, preservando os
-- requisitos atuais de build realmente pública/publicada/não deletada.
-- ---------------------------------------------------------------------------
drop policy if exists build_ratings_admin_all on public.build_ratings;
drop policy if exists build_ratings_delete_own on public.build_ratings;
drop policy if exists build_ratings_insert_own on public.build_ratings;
drop policy if exists build_ratings_update_own on public.build_ratings;
drop policy if exists build_ratings_authenticated_insert on public.build_ratings;
drop policy if exists build_ratings_authenticated_update on public.build_ratings;
drop policy if exists build_ratings_authenticated_delete on public.build_ratings;

create policy build_ratings_authenticated_insert
on public.build_ratings for insert to authenticated
with check (
  (select public.is_admin())
  or (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.builds b
      where b.id = build_ratings.build_id
        and b.is_public = true
        and b.visibility = 'public'
        and b.status = 'published'
        and b.deleted_at is null
        and b.user_id <> (select auth.uid())
    )
  )
);

create policy build_ratings_authenticated_update
on public.build_ratings for update to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_admin())
)
with check (
  user_id = (select auth.uid())
  or (select public.is_admin())
);

create policy build_ratings_authenticated_delete
on public.build_ratings for delete to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_admin())
);

-- ---------------------------------------------------------------------------
-- build_versions
-- Usuário comum mantém somente leitura das versões de suas próprias builds.
-- INSERT/UPDATE/DELETE direto permanece exclusivo de Admin.
-- ---------------------------------------------------------------------------
drop policy if exists build_versions_admin_all on public.build_versions;
drop policy if exists build_versions_owner_insert on public.build_versions;
drop policy if exists build_versions_admin_insert on public.build_versions;
drop policy if exists build_versions_admin_update on public.build_versions;
drop policy if exists build_versions_admin_delete on public.build_versions;

create policy build_versions_admin_insert
on public.build_versions for insert to authenticated
with check ((select public.is_admin()));

create policy build_versions_admin_update
on public.build_versions for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy build_versions_admin_delete
on public.build_versions for delete to authenticated
using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- build_comparisons
-- build_compare_manage (ALL) já contém owner OR admin; SELECT separado é
-- literalmente redundante.
-- ---------------------------------------------------------------------------
drop policy if exists build_compare_read on public.build_comparisons;

-- ---------------------------------------------------------------------------
-- build_tags
-- Leitura segue pública; escrita direta é Admin-only. save_user_build() pode
-- criar/reusar tags dentro da transação validada.
-- ---------------------------------------------------------------------------
drop policy if exists build_tags_admin_manage on public.build_tags;
drop policy if exists build_tags_admin_insert on public.build_tags;
drop policy if exists build_tags_admin_update on public.build_tags;
drop policy if exists build_tags_admin_delete on public.build_tags;

create policy build_tags_admin_insert
on public.build_tags for insert to authenticated
with check ((select public.is_admin()));

create policy build_tags_admin_update
on public.build_tags for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy build_tags_admin_delete
on public.build_tags for delete to authenticated
using ((select public.is_admin()));
