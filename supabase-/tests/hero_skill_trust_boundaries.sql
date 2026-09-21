-- EchoArena — testes negativos/positivos da fronteira de confiança de fontes.
-- Todas as alterações são executadas dentro de uma transação e revertidas.

begin;

do $$
declare
  v_skill uuid;
  v_wiki_source uuid;
  v_wiki_baseline_link uuid;
  v_official_source uuid;
  v_official_used uuid;
  v_patch_source uuid;
  v_link uuid;
  v_failed boolean;
begin
  select l.id, l.skill_id, l.source_id
    into v_wiki_baseline_link, v_skill, v_wiki_source
  from public.hero_skill_source_links l
  join public.source_references r on r.id = l.source_id
  where r.source_type = 'wiki'
    and l.coverage = 'baseline_values'
  order by l.created_at
  limit 1;

  if v_wiki_baseline_link is null then
    raise exception 'fixture_missing_wiki_baseline_link';
  end if;

  -- 1. Wiki não pode ser promovida a baseline verificado.
  v_failed := false;
  begin
    update public.hero_skill_source_links
       set verification_status = 'verified', needs_recheck = false, verified_at = now()
     where id = v_wiki_baseline_link;
  exception when others then
    if position('verified_skill_source_must_be_official' in sqlerrm) = 0
       and position('baseline_without_recheck_requires_verified_official_source' in sqlerrm) = 0 then
      raise;
    end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'negative_test_failed: wiki promoted to verified baseline'; end if;

  -- 2. Wiki baseline corroborada não pode sair da rechecagem.
  v_failed := false;
  begin
    update public.hero_skill_source_links
       set verification_status = 'corroborated', needs_recheck = false, verified_at = now()
     where id = v_wiki_baseline_link;
  exception when others then
    if position('baseline_without_recheck_requires_verified_official_source' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'negative_test_failed: wiki baseline escaped recheck'; end if;

  -- 3. Fonte oficial verificada não pode ser rebaixada.
  select r.id into v_official_used
  from public.source_references r
  where r.source_type = 'official'
    and exists (
      select 1 from public.hero_skill_source_links l
      where l.source_id = r.id
        and l.verification_status = 'verified'
        and l.coverage in ('structure','patch_override','baseline_values')
    )
  limit 1;

  if v_official_used is null then raise exception 'fixture_missing_verified_official_source'; end if;

  v_failed := false;
  begin
    update public.source_references set source_type = 'wiki' where id = v_official_used;
  exception when others then
    if position('trusted_official_source_cannot_be_downgraded' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'negative_test_failed: official source downgraded'; end if;

  -- 4. Fonte referenciada não pode ser apagada diretamente.
  v_failed := false;
  begin
    delete from public.source_references where id = v_official_used;
  exception when others then
    if position('referenced_skill_source_cannot_be_deleted' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'negative_test_failed: referenced source deleted'; end if;

  -- 5. Status agregado não pode ser falsificado diretamente em hero_skills.
  v_failed := false;
  begin
    update public.hero_skills
       set verification_status = 'verified', needs_recheck = false
     where id = v_skill;
  exception when others then
    if position('hero_skill_verification_must_match_sources' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'negative_test_failed: aggregate bypassed directly'; end if;

  -- 6. URL não first-party não pode ser cadastrada como fonte oficial.
  v_failed := false;
  begin
    insert into public.source_references(url, source_type, language, title, publisher)
    values ('https://example.com/echoarena-fake-official-test', 'official', 'en', 'Temporary fake official source', 'Not ZeptoLab');
  exception when others then
    if position('official_source_domain_not_allowed' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'negative_test_failed: fake official domain accepted'; end if;

  -- 7. Patch verificado precisa informar a versão/identificador publicado.
  select r.id into v_patch_source
  from public.source_references r
  where r.source_type = 'official'
    and not exists (
      select 1 from public.hero_skill_source_links l
      where l.skill_id = v_skill
        and l.source_id = r.id
        and l.coverage = 'patch_override'
    )
  order by r.created_at
  limit 1;

  if v_patch_source is null then raise exception 'fixture_missing_patch_source'; end if;

  v_failed := false;
  begin
    insert into public.hero_skill_source_links(
      skill_id, source_id, coverage, verification_status, verified_at, verified_patch, needs_recheck
    ) values (
      v_skill, v_patch_source, 'patch_override', 'verified', now(), null, false
    );
  exception when others then
    if position('verified_patch_requires_version_label' in sqlerrm) = 0 then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'negative_test_failed: verified patch without version accepted'; end if;

  -- 8. Caminho positivo: baseline oficial verificado recalcula a habilidade.
  select r.id into v_official_source
  from public.source_references r
  where r.source_type = 'official'
    and not exists (
      select 1 from public.hero_skill_source_links l
      where l.skill_id = v_skill
        and l.source_id = r.id
        and l.coverage = 'baseline_values'
    )
  order by r.created_at
  limit 1;

  if v_official_source is null then raise exception 'fixture_missing_available_official_source'; end if;

  insert into public.hero_skill_source_links(
    skill_id, source_id, coverage, is_primary,
    verification_status, verified_at, needs_recheck, public_note
  ) values (
    v_skill, v_official_source, 'baseline_values', false,
    'verified', now(), false, 'TEMPORARY TRUST TEST — rolled back'
  ) returning id into v_link;

  if not exists (
    select 1 from public.hero_skills
    where id = v_skill
      and verification_status = 'verified'
      and needs_recheck = false
  ) then
    raise exception 'positive_test_failed: official baseline did not recompute skill';
  end if;
end $$;

rollback;

select
  'passed'::text as trust_boundary_tests,
  7::int as rejected_invalid_operations,
  1::int as accepted_valid_operation,
  true as all_changes_rolled_back;
