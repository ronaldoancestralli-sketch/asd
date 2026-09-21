-- EchoArena
-- Funções RETURNS trigger são implementação interna do banco e não devem ser
-- chamáveis diretamente via PostgREST/Data API.
-- Também fixa search_path das funções antigas apontadas pelo Security Advisor.

-- search_path explícito nas funções antigas.
alter function public.set_dynamic_stats_updated_at()
  set search_path = public, pg_temp;

alter function public.set_updated_at()
  set search_path = public, pg_temp;

alter function public.sync_build_likes()
  set search_path = public, pg_temp;

alter function public.sync_role_fields()
  set search_path = public, pg_temp;

alter function public.update_search_vector()
  set search_path = public, pg_temp;

-- Nenhuma função RETURNS trigger precisa de EXECUTE direto pelos papéis do Data API.
revoke all on function public.enforce_hero_publication_integrity()
  from public, anon, authenticated, service_role;
revoke all on function public.protect_published_hero_base_stats()
  from public, anon, authenticated, service_role;
revoke all on function public.protect_published_tier_last_entry()
  from public, anon, authenticated, service_role;
revoke all on function public.set_dynamic_stats_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function public.set_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function public.sync_build_likes()
  from public, anon, authenticated, service_role;
revoke all on function public.sync_role_fields()
  from public, anon, authenticated, service_role;
revoke all on function public.update_search_vector()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_editorial_publish()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_tier_list_publish()
  from public, anon, authenticated, service_role;
