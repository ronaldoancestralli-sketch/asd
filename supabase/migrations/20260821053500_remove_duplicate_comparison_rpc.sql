-- EchoArena
-- `toggle_saved_build_comparison` já é a API consumida pelo frontend e possui
-- o contrato de integridade necessário. Remover a RPC equivalente introduzida
-- posteriormente evita duas portas que poderiam divergir.

drop function if exists public.toggle_build_comparison(uuid, uuid, text);

revoke execute on function public.toggle_saved_build_comparison(uuid, uuid, text)
  from public, anon;
grant execute on function public.toggle_saved_build_comparison(uuid, uuid, text)
  to authenticated, service_role;
