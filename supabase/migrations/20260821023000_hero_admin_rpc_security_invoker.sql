-- EchoArena — os RPCs administrativos de heróis não precisam elevar privilégios.
-- Mantemos a checagem public.is_admin() e deixamos o RLS proteger cada tabela.

alter function public.admin_save_hero_skill(uuid, jsonb, jsonb) security invoker;
alter function public.admin_hero_publication_check(uuid) security invoker;
alter function public.admin_hero_publication_checks() security invoker;
alter function public.admin_set_hero_enabled_checked(uuid, boolean) security invoker;
