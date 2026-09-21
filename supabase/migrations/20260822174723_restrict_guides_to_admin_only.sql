drop policy if exists guides_anon_read on public.guides;
drop policy if exists guides_authenticated_read on public.guides;
drop policy if exists guides_admin_select on public.guides;

create policy guides_admin_select
on public.guides
for select
to authenticated
using ((select public.echo_is_admin()));

revoke select on table public.guides from anon;
grant select on table public.guides to authenticated, service_role;
