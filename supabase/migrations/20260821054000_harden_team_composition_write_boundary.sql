-- EchoArena
-- Fecha o bypass de escrita direta do módulo de Composições.
-- Usuários autenticados criam trios exclusivamente por save_team_composition(),
-- que valida 3 heróis distintos/ativos e grava composição + membros na mesma
-- transação. Escrita direta permanece disponível apenas para Admin.

-- ---------------------------------------------------------------------------
-- RLS: remover ALL owner/admin que também sobrepunha SELECT.
-- ---------------------------------------------------------------------------
drop policy if exists team_comp_manage on public.team_compositions;
drop policy if exists team_comp_admin_insert on public.team_compositions;
drop policy if exists team_comp_admin_update on public.team_compositions;
drop policy if exists team_comp_admin_delete on public.team_compositions;

create policy team_comp_admin_insert
on public.team_compositions for insert to authenticated
with check ((select public.is_admin()));

create policy team_comp_admin_update
on public.team_compositions for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy team_comp_admin_delete
on public.team_compositions for delete to authenticated
using ((select public.is_admin()));

drop policy if exists team_members_manage on public.team_composition_members;
drop policy if exists team_members_admin_insert on public.team_composition_members;
drop policy if exists team_members_admin_update on public.team_composition_members;
drop policy if exists team_members_admin_delete on public.team_composition_members;

create policy team_members_admin_insert
on public.team_composition_members for insert to authenticated
with check ((select public.is_admin()));

create policy team_members_admin_update
on public.team_composition_members for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy team_members_admin_delete
on public.team_composition_members for delete to authenticated
using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Contrato da RPC: reproduzir no backend os limites reais expostos pelo form.
-- Não truncar silenciosamente; payload fora do contrato é rejeitado.
-- ---------------------------------------------------------------------------
create or replace function public.save_team_composition(
  p_title text,
  p_description text,
  p_is_public boolean,
  p_hero_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_composition uuid;
  v_hero uuid;
  v_position integer := 0;
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if nullif(v_title, '') is null then
    raise exception 'composition_title_required' using errcode = '22023';
  end if;
  if char_length(v_title) > 80 then
    raise exception 'composition_title_too_long' using errcode = '22023';
  end if;
  if v_description is not null and char_length(v_description) > 400 then
    raise exception 'composition_description_too_long' using errcode = '22023';
  end if;

  if coalesce(array_length(p_hero_ids, 1), 0) <> 3 then
    raise exception 'composition_requires_three_heroes' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_hero_ids) as x) <> 3 then
    raise exception 'composition_requires_distinct_heroes' using errcode = '22023';
  end if;
  if (
    select count(*)
    from public.heroes h
    where h.id = any(p_hero_ids)
      and coalesce(h.enabled, false) = true
  ) <> 3 then
    raise exception 'composition_contains_unavailable_hero' using errcode = '23503';
  end if;

  insert into public.team_compositions(user_id, title, description, is_public)
  values (v_user, v_title, v_description, coalesce(p_is_public, false))
  returning id into v_composition;

  foreach v_hero in array p_hero_ids loop
    v_position := v_position + 1;
    insert into public.team_composition_members(composition_id, position, hero_id)
    values (v_composition, v_position, v_hero);
  end loop;

  return v_composition;
end;
$$;

revoke execute on function public.save_team_composition(text, text, boolean, uuid[])
  from public, anon;
grant execute on function public.save_team_composition(text, text, boolean, uuid[])
  to authenticated, service_role;

-- `authenticated` mantém grants de DML necessários ao painel Admin, mas usuário
-- comum não passa pelas policies Admin-only. `anon` nunca escreve.
revoke insert, update, delete on table public.team_compositions from anon;
revoke insert, update, delete on table public.team_composition_members from anon;
