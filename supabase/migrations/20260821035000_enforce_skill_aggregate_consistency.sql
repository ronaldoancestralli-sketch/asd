-- EchoArena — o status agregado da habilidade é derivado das fontes.
-- Mesmo um UPDATE direto em hero_skills não pode marcar a habilidade como
-- verificada sem um baseline oficial verificado e sem rechecagem.

create or replace function public.validate_hero_skill_verification_aggregate()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_verified_baseline boolean := false;
  v_has_evidence boolean := false;
  v_expected_status text;
  v_expected_recheck boolean;
  v_expected_patch text;
begin
  if tg_op = 'UPDATE'
     and new.verification_status is not distinct from old.verification_status
     and new.needs_recheck is not distinct from old.needs_recheck
     and new.verified_patch is not distinct from old.verified_patch then
    return new;
  end if;

  select exists (
    select 1
    from public.hero_skill_source_links l
    join public.source_references r on r.id = l.source_id
    where l.skill_id = new.id
      and l.coverage = 'baseline_values'
      and l.verification_status = 'verified'
      and l.needs_recheck = false
      and r.source_type = 'official'
  ) into v_verified_baseline;

  select exists (
    select 1
    from public.hero_skill_source_links l
    where l.skill_id = new.id
      and l.verification_status in ('verified', 'corroborated')
  ) into v_has_evidence;

  select l.verified_patch
  into v_expected_patch
  from public.hero_skill_source_links l
  join public.source_references r on r.id = l.source_id
  where l.skill_id = new.id
    and l.coverage = 'patch_override'
    and l.verification_status = 'verified'
    and r.source_type = 'official'
    and nullif(btrim(coalesce(l.verified_patch, '')), '') is not null
  order by l.verified_at desc nulls last, l.updated_at desc, l.created_at desc
  limit 1;

  v_expected_status := case
    when v_verified_baseline then 'verified'
    when v_has_evidence then 'corroborated'
    else 'unverified'
  end;
  v_expected_recheck := not v_verified_baseline;

  if new.verification_status is distinct from v_expected_status
     or new.needs_recheck is distinct from v_expected_recheck
     or new.verified_patch is distinct from v_expected_patch then
    raise exception 'hero_skill_verification_must_match_sources'
      using errcode = '23514',
            detail = format(
              'expected status=%s, needs_recheck=%s, verified_patch=%s',
              v_expected_status,
              v_expected_recheck,
              coalesce(v_expected_patch, '<null>')
            ),
            hint = 'Altere as fontes/vínculos; o status da habilidade é calculado automaticamente.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_hero_skill_verification_aggregate()
from public, anon, authenticated;

drop trigger if exists trg_hero_skills_validate_verification_aggregate
  on public.hero_skills;
create trigger trg_hero_skills_validate_verification_aggregate
before insert or update on public.hero_skills
for each row
execute function public.validate_hero_skill_verification_aggregate();
