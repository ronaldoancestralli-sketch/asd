-- Integridade do modo privado do Echo Pulse.
-- O módulo público permanece "Em breve"; leitura de dados é Admin-only.

do $$
begin
  if has_table_privilege('anon','public.pulse_items','select') then
    raise exception 'anon ainda possui SELECT em pulse_items';
  end if;

  if has_table_privilege('anon','public.pulse_item_heroes','select') then
    raise exception 'anon ainda possui SELECT em pulse_item_heroes';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='pulse_items'
      and policyname='pulse_items_public_read'
  ) then
    raise exception 'policy pública pulse_items_public_read ainda existe';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='pulse_item_heroes'
      and policyname='pulse_item_heroes_public_read'
  ) then
    raise exception 'policy pública pulse_item_heroes_public_read ainda existe';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='pulse_items'
      and policyname='pulse_items_admin_all'
      and 'authenticated'=any(roles)
  ) then
    raise exception 'policy Admin de pulse_items ausente';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='community_posts'
      and policyname='community_posts_public_read'
      and qual ilike '%pulse_item_id is null%'
  ) then
    raise exception 'community_posts ainda pode expor contexto público do Pulse';
  end if;
end
$$;
