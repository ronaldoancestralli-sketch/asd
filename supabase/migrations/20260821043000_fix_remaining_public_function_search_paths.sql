-- EchoArena
-- Fixa search_path nas funções public ainda apontadas pelo Security Advisor.
-- Nenhuma função abaixo é SECURITY DEFINER; a mudança elimina resolução ambígua
-- sem alterar as regras de acesso/RLS.

alter function public.api_get_settings()
  set search_path = public, pg_temp;

alter function public.api_get_hero(text)
  set search_path = public, pg_temp;

alter function public.api_get_builds()
  set search_path = public, pg_temp;

alter function public.api_get_build(text)
  set search_path = public, pg_temp;

alter function public.api_get_tier_list()
  set search_path = public, pg_temp;

alter function public.mime_of(text)
  set search_path = public, pg_temp;

alter function public.resolver_classe(text)
  set search_path = public, pg_temp;

alter function public.normalizar_texto(text)
  set search_path = public, pg_temp;

alter function public.equipamentos_do_heroi(uuid)
  set search_path = public, pg_temp;
