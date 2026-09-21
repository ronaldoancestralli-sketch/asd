-- EchoArena — confiança de fonte na fronteira do banco.
-- Impede que uma fonte comunitária seja promovida acidentalmente a verificação
-- oficial e centraliza o status agregado da habilidade no Supabase.

create or replace function public.validate_hero_skill_source_trust()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_source_type text;
begin
  select r.source_type
  into v_source_type
  from public.source_references r
  where r.id = new.source_id;

  if v_source_type is null then
    raise exception 'skill_source_not_found'
      using errcode = '23503';
  end if;

  if new.coverage in ('baseline_values', 'structure', 'patch_override')
     and new.verification_status = 'verified'
     and v_source_type <> 'official' then
    raise exception 'verified_skill_source_must_be_official'
      using errcode = '23514',
            hint = 'Use corroborated para wiki/fórum/comunidade ou vincule uma fonte oficial.';
  end if;

  if new.coverage = 'baseline_values'
     and new.needs_recheck = false
     and not (
       new.verification_status = 'verified'
       and v_source_type = 'official'
     ) then
    raise exception 'baseline_without_recheck_requires_verified_official_source'
      using errcode = '23514',
            hint = 'Valores-base só podem sair da fila de rechecagem quando uma fonte oficial os verificar.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_hero_skill_source_trust() from public, anon, authenticated;

drop trigger if exists trg_hero_skill_source_links_validate_trust
  on public.hero_skill_source_links;
create trigger trg_hero_skill_source_links_validate_trust
before insert or update of source_id, coverage, verification_status, needs_recheck
on public.hero_skill_source_links
for each row
execute function public.validate_hero_skill_source_trust();

create or replace function public.protect_trusted_source_type()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.source_type = 'official'
     and new.source_type is distinct from old.source_type
     and exists (
       select 1
       from public.hero_skill_source_links l
       where l.source_id = old.id
         and l.coverage in ('baseline_values', 'structure', 'patch_override')
         and l.verification_status = 'verified'
     ) then
    raise exception 'trusted_official_source_cannot_be_downgraded'
      using errcode = '23514',
            hint = 'Reclassifique primeiro todos os vínculos verificados que dependem desta fonte.';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_trusted_source_type() from public, anon, authenticated;

drop trigger if exists trg_source_references_protect_trust
  on public.source_references;
create trigger trg_source_references_protect_trust
before update of source_type
on public.source_references
for each row
execute function public.protect_trusted_source_type();

create or replace function public.recompute_hero_skill_verification(p_skill_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_verified_baseline boolean := false;
  v_has_evidence boolean := false;
  v_patch text;
  v_patch_at timestamptz;
begin
  if p_skill_id is null then
    return;
  end if;

  if not exists (select 1 from public.hero_skills where id = p_skill_id) then
    return;
  end if;

  select exists (
    select 1
    from public.hero_skill_source_links l
    join public.source_references r on r.id = l.source_id
    where l.skill_id = p_skill_id
      and l.coverage = 'baseline_values'
      and l.verification_status = 'verified'
      and l.needs_recheck = false
      and r.source_type = 'official'
  ) into v_verified_baseline;

  select exists (
    select 1
    from public.hero_skill_source_links l
    where l.skill_id = p_skill_id
      and l.verification_status in ('verified', 'corroborated')
  ) into v_has_evidence;

  select l.verified_patch, l.verified_at
  into v_patch, v_patch_at
  from public.hero_skill_source_links l
  join public.source_references r on r.id = l.source_id
  where l.skill_id = p_skill_id
    and l.coverage = 'patch_override'
    and l.verification_status = 'verified'
    and r.source_type = 'official'
    and nullif(btrim(coalesce(l.verified_patch, '')), '') is not null
  order by l.verified_at desc nulls last, l.updated_at desc, l.created_at desc
  limit 1;

  update public.hero_skills
  set verification_status = case
        when v_verified_baseline then 'verified'
        when v_has_evidence then 'corroborated'
        else 'unverified'
      end,
      needs_recheck = not v_verified_baseline,
      verified_at = case
        when v_verified_baseline then now()
        when v_has_evidence then coalesce(v_patch_at, now())
        else null
      end,
      verified_patch = v_patch,
      verification_note = case
        when v_verified_baseline then
          'Valores-base vinculados a uma fonte oficial verificada e sem rechecagem pendente.'
        when v_has_evidence then
          'Há fontes verificadas ou corroboradas, mas os valores-base ainda não possuem verificação oficial completa.'
        else
          'Nenhuma evidência verificável está vinculada a esta habilidade.'
      end
  where id = p_skill_id;
end;
$$;

revoke all on function public.recompute_hero_skill_verification(uuid) from public, anon, authenticated;
grant execute on function public.recompute_hero_skill_verification(uuid) to authenticated;

create or replace function public.sync_hero_skill_verification_from_source_link()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_hero_skill_verification(old.skill_id);
    return old;
  end if;

  perform public.recompute_hero_skill_verification(new.skill_id);

  if tg_op = 'UPDATE' and old.skill_id is distinct from new.skill_id then
    perform public.recompute_hero_skill_verification(old.skill_id);
  end if;

  return new;
end;
$$;

revoke all on function public.sync_hero_skill_verification_from_source_link() from public, anon, authenticated;

drop trigger if exists trg_hero_skill_source_links_sync_skill_verification
  on public.hero_skill_source_links;
create trigger trg_hero_skill_source_links_sync_skill_verification
after insert or update or delete
on public.hero_skill_source_links
for each row
execute function public.sync_hero_skill_verification_from_source_link();

-- Recalcula o catálogo existente usando a regra nova, sem alterar fontes/vínculos.
do $$
declare
  v_skill record;
begin
  for v_skill in select id from public.hero_skills loop
    perform public.recompute_hero_skill_verification(v_skill.id);
  end loop;
end $$;
