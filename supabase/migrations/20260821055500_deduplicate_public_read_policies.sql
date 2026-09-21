-- EchoArena — remove policies de leitura literalmente duplicadas sem alterar acesso.
-- Onde havia Admin ALL + leitura pública total, mantém leitura pública e separa escrita Admin.

-- hero_classes já possui escrita Admin separada; basta remover a leitura PUBLIC redundante.
drop policy if exists "classes leitura publica" on public.hero_classes;

-- system_settings: uma única leitura pública + escrita Admin separada.
drop policy if exists "settings leitura publica" on public.system_settings;
drop policy if exists settings_admin_all on public.system_settings;
drop policy if exists settings_admin_insert on public.system_settings;
drop policy if exists settings_admin_update on public.system_settings;
drop policy if exists settings_admin_delete on public.system_settings;

create policy settings_admin_insert
on public.system_settings for insert to authenticated
with check ((select public.is_admin()));

create policy settings_admin_update
on public.system_settings for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy settings_admin_delete
on public.system_settings for delete to authenticated
using ((select public.is_admin()));

-- equipment_set_bonuses: preserva uma única leitura pública USING true.
drop policy if exists equipment_bonuses_public_read on public.equipment_set_bonuses;
drop policy if exists equipment_set_bonuses_admin_all on public.equipment_set_bonuses;
drop policy if exists equipment_set_bonuses_admin_insert on public.equipment_set_bonuses;
drop policy if exists equipment_set_bonuses_admin_update on public.equipment_set_bonuses;
drop policy if exists equipment_set_bonuses_admin_delete on public.equipment_set_bonuses;

create policy equipment_set_bonuses_admin_insert
on public.equipment_set_bonuses for insert to authenticated
with check ((select public.current_user_is_admin()));

create policy equipment_set_bonuses_admin_update
on public.equipment_set_bonuses for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));

create policy equipment_set_bonuses_admin_delete
on public.equipment_set_bonuses for delete to authenticated
using ((select public.current_user_is_admin()));
