-- EchoArena — habilidades de heróis + validação de publicação.
-- Esta migração não cria nem estima dados de jogo.

-- Integridade estrutural dos níveis. O valor real continua sendo informado
-- manualmente pelo Admin; apenas números de nível inválidos são rejeitados.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.hero_skill_levels'::regclass
      and conname = 'hero_skill_levels_level_positive'
  ) then
    alter table public.hero_skill_levels
      add constraint hero_skill_levels_level_positive
      check (level >= 1);
  end if;
end $$;

create index if not exists hero_skills_hero_enabled_order_idx
  on public.hero_skills(hero_id, enabled, display_order);

-- Habilidades de heróis em rascunho não podem vazar pelo acesso público.
drop policy if exists hero_skills_public_read on public.hero_skills;
create policy hero_skills_public_read
on public.hero_skills
for select
to anon, authenticated
using (
  enabled = true
  and exists (
    select 1
    from public.heroes h
    where h.id = hero_skills.hero_id
      and h.enabled = true
  )
);

-- Níveis só são públicos quando a habilidade e o herói pai também estão
-- publicados. A policy administrativa permissiva continua garantindo acesso
-- integral aos administradores autenticados.
drop policy if exists skill_levels_public_read on public.hero_skill_levels;
create policy skill_levels_public_read
on public.hero_skill_levels
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.hero_skills s
    join public.heroes h on h.id = s.hero_id
    where s.id = hero_skill_levels.skill_id
      and s.enabled = true
      and h.enabled = true
  )
);

-- Salva uma habilidade e todos os níveis enviados em uma única transação.
-- Campos sem dado oficial podem permanecer nulos; nenhum valor é estimado.
create or replace function public.admin_save_hero_skill(
  p_hero_id uuid,
  p_skill jsonb,
  p_levels jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_skill_id uuid;
  v_level jsonb;
  v_name text;
  v_slug text;
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.heroes h where h.id = p_hero_id) then
    raise exception 'hero_not_found' using errcode = '23503';
  end if;

  if p_skill is null or jsonb_typeof(p_skill) <> 'object' then
    raise exception 'skill_payload_invalid' using errcode = '22023';
  end if;

  if p_levels is null then
    p_levels := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_levels) <> 'array' then
    raise exception 'skill_levels_payload_invalid' using errcode = '22023';
  end if;

  v_name := nullif(btrim(coalesce(p_skill->>'name', '')), '');
  v_slug := nullif(btrim(coalesce(p_skill->>'slug', '')), '');

  if v_name is null then
    raise exception 'skill_name_required' using errcode = '22023';
  end if;

  if v_slug is null then
    raise exception 'skill_slug_required' using errcode = '22023';
  end if;

  if nullif(p_skill->>'id', '') is not null then
    begin
      v_skill_id := (p_skill->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'skill_id_invalid' using errcode = '22023';
    end;
  end if;

  if v_skill_id is null then
    insert into public.hero_skills(
      hero_id,
      name,
      slug,
      description,
      skill_type,
      cooldown,
      duration,
      energy_cost,
      unlock_level,
      max_level,
      display_order,
      enabled
    )
    values (
      p_hero_id,
      v_name,
      v_slug,
      nullif(btrim(coalesce(p_skill->>'description', '')), ''),
      nullif(btrim(coalesce(p_skill->>'skill_type', '')), ''),
      nullif(p_skill->>'cooldown', '')::numeric,
      nullif(p_skill->>'duration', '')::numeric,
      nullif(p_skill->>'energy_cost', '')::integer,
      nullif(p_skill->>'unlock_level', '')::integer,
      nullif(p_skill->>'max_level', '')::integer,
      coalesce(nullif(p_skill->>'display_order', '')::integer, 0),
      coalesce(nullif(p_skill->>'enabled', '')::boolean, true)
    )
    returning id into v_skill_id;
  else
    update public.hero_skills
    set
      name = v_name,
      slug = v_slug,
      description = nullif(btrim(coalesce(p_skill->>'description', '')), ''),
      skill_type = nullif(btrim(coalesce(p_skill->>'skill_type', '')), ''),
      cooldown = nullif(p_skill->>'cooldown', '')::numeric,
      duration = nullif(p_skill->>'duration', '')::numeric,
      energy_cost = nullif(p_skill->>'energy_cost', '')::integer,
      unlock_level = nullif(p_skill->>'unlock_level', '')::integer,
      max_level = nullif(p_skill->>'max_level', '')::integer,
      display_order = coalesce(nullif(p_skill->>'display_order', '')::integer, 0),
      enabled = coalesce(nullif(p_skill->>'enabled', '')::boolean, true)
    where id = v_skill_id
      and hero_id = p_hero_id;

    if not found then
      raise exception 'skill_not_found_for_hero' using errcode = '23503';
    end if;
  end if;

  delete from public.hero_skill_levels
  where skill_id = v_skill_id;

  for v_level in
    select value
    from jsonb_array_elements(p_levels)
  loop
    if jsonb_typeof(v_level) <> 'object' then
      raise exception 'skill_level_payload_invalid' using errcode = '22023';
    end if;

    if nullif(v_level->>'level', '') is null then
      raise exception 'skill_level_required' using errcode = '22023';
    end if;

    insert into public.hero_skill_levels(
      skill_id,
      level,
      damage,
      healing,
      shield,
      cooldown,
      duration,
      radius,
      range,
      speed,
      energy_cost,
      description
    )
    values (
      v_skill_id,
      (v_level->>'level')::integer,
      nullif(v_level->>'damage', '')::numeric,
      nullif(v_level->>'healing', '')::numeric,
      nullif(v_level->>'shield', '')::numeric,
      nullif(v_level->>'cooldown', '')::numeric,
      nullif(v_level->>'duration', '')::numeric,
      nullif(v_level->>'radius', '')::numeric,
      nullif(v_level->>'range', '')::numeric,
      nullif(v_level->>'speed', '')::numeric,
      nullif(v_level->>'energy_cost', '')::integer,
      nullif(btrim(coalesce(v_level->>'description', '')), '')
    );
  end loop;

  return v_skill_id;
end;
$$;

revoke all on function public.admin_save_hero_skill(uuid, jsonb, jsonb) from public;
revoke execute on function public.admin_save_hero_skill(uuid, jsonb, jsonb) from anon;
grant execute on function public.admin_save_hero_skill(uuid, jsonb, jsonb) to authenticated;

-- Diagnóstico objetivo de publicação. Classe, mídia principal/card e pelo
-- menos um status base real são bloqueios. Habilidades e arma são avisos para
-- preservar os heróis já publicados enquanto o conteúdo oficial é cadastrado.
create or replace function public.admin_hero_publication_check(p_hero_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_hero public.heroes%rowtype;
  v_base_stats bigint := 0;
  v_weapon_stats bigint := 0;
  v_skills bigint := 0;
  v_enabled_skills bigint := 0;
  v_blocking jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select * into v_hero
  from public.heroes
  where id = p_hero_id;

  if not found then
    return jsonb_build_object(
      'hero_id', p_hero_id,
      'exists', false,
      'ready', false,
      'blocking', jsonb_build_array(
        jsonb_build_object('code', 'hero_not_found', 'label', 'Herói não encontrado.')
      ),
      'warnings', '[]'::jsonb,
      'counts', jsonb_build_object('base_stats', 0, 'weapon_stats', 0, 'skills', 0, 'enabled_skills', 0)
    );
  end if;

  select count(*) into v_base_stats
  from public.hero_base_stats
  where hero_id = p_hero_id;

  select count(*) into v_weapon_stats
  from public.hero_weapon_stats
  where hero_id = p_hero_id;

  select count(*), count(*) filter (where enabled = true)
  into v_skills, v_enabled_skills
  from public.hero_skills
  where hero_id = p_hero_id;

  if v_hero.class_id is null then
    v_blocking := v_blocking || jsonb_build_array(
      jsonb_build_object('code', 'missing_class', 'label', 'Defina a classe do herói.')
    );
  end if;

  if coalesce(
    nullif(btrim(coalesce(v_hero.card_image_path, '')), ''),
    nullif(btrim(coalesce(v_hero.image_path, '')), ''),
    nullif(btrim(coalesce(v_hero.card_image_url, '')), ''),
    nullif(btrim(coalesce(v_hero.image_url, '')), '')
  ) is null then
    v_blocking := v_blocking || jsonb_build_array(
      jsonb_build_object('code', 'missing_media', 'label', 'Cadastre a imagem principal ou a imagem do card.')
    );
  end if;

  if v_base_stats = 0 then
    v_blocking := v_blocking || jsonb_build_array(
      jsonb_build_object('code', 'missing_base_stats', 'label', 'Cadastre ao menos um status base real do herói.')
    );
  end if;

  if nullif(btrim(coalesce(v_hero.description, '')), '') is null then
    v_warnings := v_warnings || jsonb_build_array(
      jsonb_build_object('code', 'missing_description', 'label', 'Descrição ainda não cadastrada.')
    );
  end if;

  if v_skills = 0 then
    v_warnings := v_warnings || jsonb_build_array(
      jsonb_build_object('code', 'missing_skills', 'label', 'Nenhuma habilidade cadastrada ainda.')
    );
  elsif v_enabled_skills = 0 then
    v_warnings := v_warnings || jsonb_build_array(
      jsonb_build_object('code', 'no_enabled_skills', 'label', 'Há habilidades cadastradas, mas nenhuma está publicada.')
    );
  end if;

  if v_weapon_stats = 0 then
    v_warnings := v_warnings || jsonb_build_array(
      jsonb_build_object('code', 'missing_weapon_stats', 'label', 'Dados de arma ainda não cadastrados.')
    );
  end if;

  return jsonb_build_object(
    'hero_id', v_hero.id,
    'exists', true,
    'enabled', v_hero.enabled,
    'ready', jsonb_array_length(v_blocking) = 0,
    'blocking', v_blocking,
    'warnings', v_warnings,
    'counts', jsonb_build_object(
      'base_stats', v_base_stats,
      'weapon_stats', v_weapon_stats,
      'skills', v_skills,
      'enabled_skills', v_enabled_skills
    )
  );
end;
$$;

revoke all on function public.admin_hero_publication_check(uuid) from public;
revoke execute on function public.admin_hero_publication_check(uuid) from anon;
grant execute on function public.admin_hero_publication_check(uuid) to authenticated;

create or replace function public.admin_hero_publication_checks()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(public.admin_hero_publication_check(h.id) order by h.display_order, h.name),
    '[]'::jsonb
  )
  into v_result
  from public.heroes h;

  return v_result;
end;
$$;

revoke all on function public.admin_hero_publication_checks() from public;
revoke execute on function public.admin_hero_publication_checks() from anon;
grant execute on function public.admin_hero_publication_checks() to authenticated;

create or replace function public.admin_set_hero_enabled_checked(
  p_hero_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_check jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  v_check := public.admin_hero_publication_check(p_hero_id);

  if coalesce((v_check->>'exists')::boolean, false) = false then
    return jsonb_build_object('updated', false, 'enabled', null, 'check', v_check);
  end if;

  if coalesce(p_enabled, false) = true
     and coalesce((v_check->>'ready')::boolean, false) = false then
    return jsonb_build_object('updated', false, 'enabled', false, 'check', v_check);
  end if;

  update public.heroes
  set enabled = coalesce(p_enabled, false)
  where id = p_hero_id;

  v_check := public.admin_hero_publication_check(p_hero_id);

  return jsonb_build_object(
    'updated', true,
    'enabled', coalesce(p_enabled, false),
    'check', v_check
  );
end;
$$;

revoke all on function public.admin_set_hero_enabled_checked(uuid, boolean) from public;
revoke execute on function public.admin_set_hero_enabled_checked(uuid, boolean) from anon;
grant execute on function public.admin_set_hero_enabled_checked(uuid, boolean) to authenticated;
