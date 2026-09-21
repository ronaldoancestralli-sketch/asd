-- EchoArena — consolidação de RLS de team_synergies.
-- Leitura já é pública; Admin conserva escrita, sem policy ALL sobreposta ao SELECT.

drop policy if exists team_synergy_admin on public.team_synergies;

drop policy if exists team_synergy_admin_insert on public.team_synergies;
drop policy if exists team_synergy_admin_update on public.team_synergies;
drop policy if exists team_synergy_admin_delete on public.team_synergies;

create policy team_synergy_admin_insert
on public.team_synergies for insert to authenticated
with check ((select public.is_admin()));

create policy team_synergy_admin_update
on public.team_synergies for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy team_synergy_admin_delete
on public.team_synergies for delete to authenticated
using ((select public.is_admin()));
