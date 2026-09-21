-- EchoArena — consolida policies permissivas de comments sem mudar a semântica efetiva.
-- SELECT autenticado já contém público/owner/admin; as escritas passam a ter um único OR explícito por ação.

drop policy if exists comments_admin_all on public.comments;
drop policy if exists comments_insert on public.comments;
drop policy if exists comments_update_own on public.comments;
drop policy if exists comments_delete_own on public.comments;
drop policy if exists comments_update on public.comments;
drop policy if exists comments_delete on public.comments;

create policy comments_insert
on public.comments for insert to authenticated
with check (
  (select public.is_admin())
  or (
    user_id = (select auth.uid())
    and not (select public.is_blocked())
  )
);

create policy comments_update
on public.comments for update to authenticated
using (
  (select public.is_admin())
  or user_id = (select auth.uid())
)
with check (
  (select public.is_admin())
  or user_id = (select auth.uid())
);

create policy comments_delete
on public.comments for delete to authenticated
using (
  (select public.is_admin())
  or user_id = (select auth.uid())
);
