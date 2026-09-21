-- EchoArena — primeira tranche da auditoria SECURITY DEFINER.
-- Funções administrativas já exigem public.is_admin() internamente; uma sessão
-- anon não pode satisfazer essa condição. Removemos o EXECUTE herdado de PUBLIC
-- e preservamos authenticated para o painel Admin, que continua protegido pela
-- checagem de perfil dentro de cada função.

revoke execute on function public.admin_change_master_password(text, text)
from public, anon;
grant execute on function public.admin_change_master_password(text, text)
to authenticated, service_role;

revoke execute on function public.admin_set_build_flag(uuid, text, boolean)
from public, anon;
grant execute on function public.admin_set_build_flag(uuid, text, boolean)
to authenticated, service_role;

revoke execute on function public.admin_set_comment_flag(uuid, text, boolean)
from public, anon;
grant execute on function public.admin_set_comment_flag(uuid, text, boolean)
to authenticated, service_role;

revoke execute on function public.admin_set_maintenance(boolean, text)
from public, anon;
grant execute on function public.admin_set_maintenance(boolean, text)
to authenticated, service_role;

revoke execute on function public.admin_set_user_blocked(uuid, boolean, text)
from public, anon;
grant execute on function public.admin_set_user_blocked(uuid, boolean, text)
to authenticated, service_role;

revoke execute on function public.admin_set_user_role(uuid, text)
from public, anon;
grant execute on function public.admin_set_user_role(uuid, text)
to authenticated, service_role;

revoke execute on function public.admin_sync_hero_media(uuid)
from public, anon;
grant execute on function public.admin_sync_hero_media(uuid)
to authenticated, service_role;
