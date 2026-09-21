-- EchoArena — origem oficial precisa ser verificável na fronteira do banco.
-- Para habilidades, `official` significa conteúdo first-party da ZeptoLab:
--   - zeptolab.com (incluindo subdomínios)
--   - zepto.helpshift.com (central oficial de suporte)
-- Qualquer nova origem oficial deve ser deliberadamente adicionada à regra.

create or replace function public.validate_official_skill_source_origin()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_url text := lower(btrim(coalesce(new.url, '')));
begin
  if new.source_type = 'official'
     and not (
       v_url ~ '^https://([a-z0-9-]+\.)*zeptolab\.com([/:?#]|$)'
       or v_url ~ '^https://zepto\.helpshift\.com([/:?#]|$)'
     ) then
    raise exception 'official_source_domain_not_allowed'
      using errcode = '23514',
            detail = coalesce(new.url, '<null>'),
            hint = 'Use wiki/forum/community/other para origens não first-party ou atualize explicitamente a whitelist após verificar uma nova origem oficial.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_official_skill_source_origin()
from public, anon, authenticated;

drop trigger if exists trg_source_references_validate_official_origin
  on public.source_references;
create trigger trg_source_references_validate_official_origin
before insert or update of source_type, url
on public.source_references
for each row
execute function public.validate_official_skill_source_origin();

-- Endurece também o conceito de patch oficial: um vínculo verificado de patch
-- precisa informar qual patch/versão foi realmente conferido.
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

  if new.coverage = 'patch_override'
     and new.verification_status = 'verified'
     and nullif(btrim(coalesce(new.verified_patch, '')), '') is null then
    raise exception 'verified_patch_requires_version_label'
      using errcode = '23514',
            hint = 'Informe o identificador publicado do patch/atualização antes de marcar a alteração como verificada.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_hero_skill_source_trust()
from public, anon, authenticated;
