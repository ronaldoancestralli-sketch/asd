-- EchoArena
-- Helpers públicos de leitura não precisam bypassar RLS.
-- As tabelas/vistas subjacentes já possuem leitura pública controlada e as views
-- v_build_details / v_hero_details são security_invoker.

alter function public.export_site()
  security invoker;

alter function public.feature_is_enabled(text)
  security invoker;

alter function public.feature_requires_login(text)
  security invoker;

alter function public.get_build(text)
  security invoker;

alter function public.get_hero(text)
  security invoker;

alter function public.get_site_settings()
  security invoker;

alter function public.site_status()
  security invoker;
