\set ON_ERROR_STOP on
begin;

do $test$
declare
  view_definition text;
  function_definition text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='heroes'
      and column_name='gif_presentation' and is_nullable='NO'
  ) then
    raise exception 'gif_presentation column contract missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='heroes'
      and column_name='gif_background_color' and is_nullable='NO'
  ) then
    raise exception 'gif_background_color column contract missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.heroes'::regclass
      and conname='heroes_gif_presentation_check'
      and pg_get_constraintdef(oid) like '%cutout%scene%'
  ) then
    raise exception 'gif presentation check constraint missing';
  end if;

  select pg_get_viewdef('public.v_heroes_complete'::regclass,true)
    into view_definition;
  if view_definition not like '%h.gif_presentation%'
     or view_definition not like '%h.gif_background_color%' then
    raise exception 'public hero view does not expose GIF presentation';
  end if;

  if not exists (
    select 1 from pg_class
    where oid='public.v_heroes_complete'::regclass
      and 'security_invoker=true'=any(coalesce(reloptions,'{}'))
  ) then
    raise exception 'public hero view lost security_invoker';
  end if;

  select pg_get_functiondef(p.oid) into function_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='admin_save_hero_bundle_v2';
  if function_definition not like '%gif_presentation=case%'
     or function_definition not like '%gif_background_color=case%' then
    raise exception 'atomic hero RPC does not persist GIF presentation';
  end if;
end
$test$;

select 'Hero GIF scene: columns, constraints, view, RPC and security contract passed' as result;
rollback;
