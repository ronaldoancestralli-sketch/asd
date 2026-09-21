-- Echo Brain — RPCs administrativas de temporadas sob RLS (SECURITY INVOKER).
-- Aplicada em produção como echo_brain_seasons_invoker_rpcs.

create or replace function public.admin_echo_brain_upsert_season(
  p_season_id uuid,
  p_name text,
  p_slug text,
  p_game_version text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes text
)
returns public.seasons
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.seasons%rowtype;
  v_name text := trim(coalesce(p_name,''));
  v_slug text := lower(trim(coalesce(p_slug,'')));
  v_version text := trim(coalesce(p_game_version,''));
  v_notes text := nullif(trim(coalesce(p_notes,'')),'');
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'season_name_invalid'; end if;
  if length(v_slug) < 1 or length(v_slug) > 80 or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'season_slug_invalid'; end if;
  if length(v_version) < 1 or length(v_version) > 40 then raise exception 'season_game_version_invalid'; end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then raise exception 'season_date_order_invalid'; end if;
  if v_notes is not null and length(v_notes) > 500 then raise exception 'season_notes_too_long'; end if;

  if p_season_id is null then
    insert into public.seasons(name,slug,game_version,starts_at,ends_at,active,notes)
    values(v_name,v_slug,v_version,p_starts_at,p_ends_at,false,v_notes)
    returning * into v_row;
  else
    update public.seasons
    set name=v_name,slug=v_slug,game_version=v_version,starts_at=p_starts_at,ends_at=p_ends_at,notes=v_notes
    where id=p_season_id
    returning * into v_row;
    if not found then raise exception 'season_not_found'; end if;
  end if;
  return v_row;
exception
  when unique_violation then raise exception 'season_slug_already_exists';
end;
$$;

create or replace function public.admin_echo_brain_set_active_season(p_season_id uuid,p_active boolean)
returns public.seasons
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.seasons%rowtype;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if p_season_id is null then raise exception 'season_id_required'; end if;
  select * into v_row from public.seasons where id=p_season_id for update;
  if not found then raise exception 'season_not_found'; end if;

  if coalesce(p_active,false) then
    if v_row.active is true then return v_row; end if;
    update public.seasons set active=false where active is true and id<>p_season_id;
    update public.seasons set active=true where id=p_season_id returning * into v_row;
  else
    if v_row.active is not true then raise exception 'season_not_active'; end if;
    update public.seasons set active=false where id=p_season_id returning * into v_row;
  end if;
  return v_row;
end;
$$;

revoke all on function public.admin_echo_brain_upsert_season(uuid,text,text,text,timestamptz,timestamptz,text) from public,anon;
revoke all on function public.admin_echo_brain_set_active_season(uuid,boolean) from public,anon;
grant execute on function public.admin_echo_brain_upsert_season(uuid,text,text,text,timestamptz,timestamptz,text) to authenticated;
grant execute on function public.admin_echo_brain_set_active_season(uuid,boolean) to authenticated;
