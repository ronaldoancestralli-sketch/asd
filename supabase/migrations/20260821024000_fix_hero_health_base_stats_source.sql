-- EchoArena — corrige um falso positivo no diagnóstico administrativo.
-- hero_complete_base_stats usa LEFT JOIN e sempre produz uma linha por herói,
-- mesmo quando nenhum status base existe. Para detectar ausência real, a fonte
-- correta é public.hero_base_stats.

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.echo_admin_module_health()'::regprocedure)
  into v_definition;

  if position('hero_complete_base_stats' in v_definition) = 0 then
    raise exception 'echo_admin_module_health_source_not_found';
  end if;

  execute replace(v_definition, 'hero_complete_base_stats', 'hero_base_stats');

  select pg_get_functiondef('public.echo_admin_system_health()'::regprocedure)
  into v_definition;

  if position('hero_complete_base_stats' in v_definition) = 0 then
    raise exception 'echo_admin_system_health_source_not_found';
  end if;

  execute replace(v_definition, 'hero_complete_base_stats', 'hero_base_stats');
end $$;
