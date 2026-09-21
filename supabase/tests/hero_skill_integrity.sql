-- EchoArena — testes reprodutíveis de integridade do módulo de Heróis/Habilidades.
-- Este arquivo é somente teste: não cria nem altera dados.
-- Sucesso = bloco DO concluído sem exceção.

do $$
declare
  v_count bigint;
begin
  -- Todo herói publicado deve ter exatamente quatro habilidades publicadas.
  select count(*) into v_count
  from public.heroes h
  where h.enabled = true
    and 4 <> (
      select count(*)
      from public.hero_skills s
      where s.hero_id = h.id and s.enabled = true
    );
  if v_count <> 0 then
    raise exception 'integrity_test_failed: published heroes without exactly four enabled skills = %', v_count;
  end if;

  -- Regra oficial atual: habilidades cadastradas publicamente possuem 18 níveis máximos.
  select count(*) into v_count
  from public.hero_skills s
  join public.heroes h on h.id = s.hero_id
  where h.enabled = true and s.enabled = true
    and s.max_level is distinct from 18;
  if v_count <> 0 then
    raise exception 'integrity_test_failed: published skills with max_level <> 18 = %', v_count;
  end if;

  -- Não publicar habilidade sem nome/slug/descrição real.
  select count(*) into v_count
  from public.hero_skills s
  join public.heroes h on h.id = s.hero_id
  where h.enabled = true and s.enabled = true
    and (
      nullif(btrim(s.name), '') is null
      or nullif(btrim(s.slug), '') is null
      or nullif(btrim(coalesce(s.description, '')), '') is null
    );
  if v_count <> 0 then
    raise exception 'integrity_test_failed: published skills with blank required text = %', v_count;
  end if;

  -- Toda habilidade pública precisa de proveniência e de uma fonte de valores-base.
  select count(*) into v_count
  from public.hero_skills s
  join public.heroes h on h.id = s.hero_id
  where h.enabled = true and s.enabled = true
    and not exists (
      select 1 from public.hero_skill_source_links l
      where l.skill_id = s.id
    );
  if v_count <> 0 then
    raise exception 'integrity_test_failed: published skills without any source = %', v_count;
  end if;

  select count(*) into v_count
  from public.hero_skills s
  join public.heroes h on h.id = s.hero_id
  where h.enabled = true and s.enabled = true
    and not exists (
      select 1 from public.hero_skill_source_links l
      where l.skill_id = s.id and l.coverage = 'baseline_values'
    );
  if v_count <> 0 then
    raise exception 'integrity_test_failed: published skills without baseline source = %', v_count;
  end if;

  -- Estrutura 4×18 deve estar explicitamente vinculada à fonte oficial.
  select count(*) into v_count
  from public.hero_skills s
  join public.heroes h on h.id = s.hero_id
  where h.enabled = true and s.enabled = true
    and not exists (
      select 1
      from public.hero_skill_source_links l
      join public.source_references r on r.id = l.source_id
      where l.skill_id = s.id
        and l.coverage = 'structure'
        and l.verification_status = 'verified'
        and l.needs_recheck = false
        and r.source_type = 'official'
    );
  if v_count <> 0 then
    raise exception 'integrity_test_failed: published skills without verified official structure source = %', v_count;
  end if;

  -- Um patch classificado como oficial não pode apontar para wiki/fórum/comunidade.
  select count(*) into v_count
  from public.hero_skill_source_links l
  join public.source_references r on r.id = l.source_id
  where l.coverage = 'patch_override'
    and l.verification_status = 'verified'
    and r.source_type <> 'official';
  if v_count <> 0 then
    raise exception 'integrity_test_failed: verified patch links with non-official source = %', v_count;
  end if;

  -- URLs de fontes precisam permanecer públicas e navegáveis por HTTP(S).
  select count(*) into v_count
  from public.source_references r
  where r.url !~* '^https?://';
  if v_count <> 0 then
    raise exception 'integrity_test_failed: invalid source URLs = %', v_count;
  end if;

  -- Histórico oficialmente atribuído sempre deve guardar a fonte usada.
  select count(*) into v_count
  from public.balance_history b
  where b.skill_id is not null
    and b.change_type in ('patch_oficial', 'sincronizacao_patch_oficial')
    and b.source_id is null;
  if v_count <> 0 then
    raise exception 'integrity_test_failed: official skill history without source = %', v_count;
  end if;

  -- Se níveis detalhados forem cadastrados no futuro, nunca podem sair de 1..max_level.
  select count(*) into v_count
  from public.hero_skill_levels l
  join public.hero_skills s on s.id = l.skill_id
  where l.level < 1 or l.level > s.max_level;
  if v_count <> 0 then
    raise exception 'integrity_test_failed: skill levels outside 1..max_level = %', v_count;
  end if;

  -- A fronteira de publicação continua íntegra.
  select count(*) into v_count
  from public.heroes h
  where h.enabled = true
    and (
      h.class_id is null
      or coalesce(
        nullif(btrim(coalesce(h.card_image_path, '')), ''),
        nullif(btrim(coalesce(h.image_path, '')), ''),
        nullif(btrim(coalesce(h.card_image_url, '')), ''),
        nullif(btrim(coalesce(h.image_url, '')), '')
      ) is null
      or not exists (
        select 1 from public.hero_base_stats bs where bs.hero_id = h.id
      )
    );
  if v_count <> 0 then
    raise exception 'integrity_test_failed: published heroes violating publication integrity = %', v_count;
  end if;

  -- Correções provenientes do patch Noir/Alter precisam permanecer refletidas.
  select count(*) into v_count
  from (
    values
      ('smog', 'tanque', 'reduz em 25% a vida máxima'),
      ('bastion', 'defensor', 'reduz em 20% a penetração de armadura'),
      ('sparkle', 'iniciadora', 'a cada instância de dano recebida'),
      ('sparkle', 'curandeira', 'reduz em 25% o tempo de recarga da arma'),
      ('hurricane', 'recalibracao', 'reduz em 30% a penetração de armadura')
  ) expected(hero_slug, skill_slug, required_text)
  where not exists (
    select 1
    from public.heroes h
    join public.hero_skills s on s.hero_id = h.id
    where h.slug = expected.hero_slug
      and s.slug = expected.skill_slug
      and position(expected.required_text in s.description) > 0
  );
  if v_count <> 0 then
    raise exception 'integrity_test_failed: official Noir/Alter corrections missing = %', v_count;
  end if;

  -- Privilégios mínimos das tabelas novas: anon somente leitura; authenticated CRUD, sem privilégios DDL/administrativos.
  if not has_table_privilege('anon', 'public.source_references', 'SELECT')
     or not has_table_privilege('anon', 'public.hero_skill_source_links', 'SELECT')
     or has_table_privilege('anon', 'public.source_references', 'INSERT')
     or has_table_privilege('anon', 'public.source_references', 'UPDATE')
     or has_table_privilege('anon', 'public.source_references', 'DELETE')
     or has_table_privilege('anon', 'public.hero_skill_source_links', 'INSERT')
     or has_table_privilege('anon', 'public.hero_skill_source_links', 'UPDATE')
     or has_table_privilege('anon', 'public.hero_skill_source_links', 'DELETE') then
    raise exception 'integrity_test_failed: anon grants on provenance tables are not read-only';
  end if;

  if not has_table_privilege('authenticated', 'public.source_references', 'SELECT, INSERT, UPDATE, DELETE')
     or not has_table_privilege('authenticated', 'public.hero_skill_source_links', 'SELECT, INSERT, UPDATE, DELETE')
     or has_table_privilege('authenticated', 'public.source_references', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.source_references', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.source_references', 'TRIGGER')
     or has_table_privilege('authenticated', 'public.hero_skill_source_links', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.hero_skill_source_links', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.hero_skill_source_links', 'TRIGGER') then
    raise exception 'integrity_test_failed: authenticated grants on provenance tables are broader/narrower than intended';
  end if;
end $$;

select
  (select count(*) from public.heroes where enabled = true) as published_heroes,
  (select count(*) from public.hero_skills s join public.heroes h on h.id=s.hero_id where s.enabled=true and h.enabled=true) as published_skills,
  (select count(*) from public.source_references) as source_references,
  (select count(*) from public.hero_skill_source_links) as source_links,
  (select count(*) from public.balance_history where skill_id is not null) as skill_history_rows,
  (select count(*) from public.hero_skill_levels) as detailed_skill_levels;
