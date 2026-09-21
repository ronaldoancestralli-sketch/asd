-- EchoArena
-- Reduz exposição anônima de helpers de autorização sem alterar acesso legítimo.

-- equipments_admin_all já cobre leitura administrativa autenticada.
-- A policy pública só precisa liberar equipamentos habilitados.
drop policy if exists equipments_public_read on public.equipments;
create policy equipments_public_read
on public.equipments
for select
to anon, authenticated
using (enabled = true);

-- Esses fluxos exigem auth.uid() por definição; restringir a authenticated torna
-- explícita a intenção e permite retirar is_blocked() da superfície anon.
drop policy if exists comments_insert on public.comments;
create policy comments_insert
on public.comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and not public.is_blocked()
);

drop policy if exists profiles_self_upd on public.profiles;
create policy profiles_self_upd
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  and not public.is_blocked()
)
with check (
  id = auth.uid()
  and role = (
    select p.role
    from public.profiles p
    where p.id = auth.uid()
  )
);

-- echo_is_admin só é usado por policies authenticated.
revoke execute on function public.echo_is_admin() from public, anon;
grant execute on function public.echo_is_admin() to authenticated, service_role;

-- current_user_is_admin deixa de ser necessário para anon após simplificar
-- equipments_public_read.
revoke execute on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_admin() to authenticated, service_role;

-- is_blocked só é necessário para políticas de usuário autenticado.
revoke execute on function public.is_blocked() from public, anon;
grant execute on function public.is_blocked() to authenticated, service_role;
