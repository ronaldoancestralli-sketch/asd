-- EchoArena
-- hero_class_aliases contém aliases públicos de classes e é usado por
-- resolver_classe(). O estado anterior tinha grants amplos, RLS ligada e zero
-- policies, bloqueando inclusive a leitura legítima.

-- Privilégios de tabela explícitos: público só lê; escrita exige authenticated
-- e continua sujeita às policies admin abaixo.
revoke all on table public.hero_class_aliases from public, anon, authenticated;
grant select on table public.hero_class_aliases to anon, authenticated;
grant select, insert, update, delete on table public.hero_class_aliases to authenticated;
grant all on table public.hero_class_aliases to service_role;

-- Policies idempotentes desta frente.
drop policy if exists hero_class_aliases_public_read on public.hero_class_aliases;
drop policy if exists hero_class_aliases_admin_insert on public.hero_class_aliases;
drop policy if exists hero_class_aliases_admin_update on public.hero_class_aliases;
drop policy if exists hero_class_aliases_admin_delete on public.hero_class_aliases;

create policy hero_class_aliases_public_read
on public.hero_class_aliases
for select
to anon, authenticated
using (true);

create policy hero_class_aliases_admin_insert
on public.hero_class_aliases
for insert
to authenticated
with check ((select public.is_admin()));

create policy hero_class_aliases_admin_update
on public.hero_class_aliases
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy hero_class_aliases_admin_delete
on public.hero_class_aliases
for delete
to authenticated
using ((select public.is_admin()));
