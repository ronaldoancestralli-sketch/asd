-- EchoArena — consolida SELECT da tabela principal de heróis sem alterar visibilidade.
-- anon: somente enabled=true. authenticated: enabled=true OU Admin (inclui inativos para o painel).

drop policy if exists heroes_public_read on public.heroes;
drop policy if exists heroes_admin_read_all on public.heroes;
drop policy if exists heroes_anon_read on public.heroes;
drop policy if exists heroes_authenticated_read on public.heroes;

create policy heroes_anon_read
on public.heroes for select to anon
using (enabled = true);

create policy heroes_authenticated_read
on public.heroes for select to authenticated
using (enabled = true or (select public.is_admin()));
