-- EchoArena — catálogo padrão de habilidades de heróis.
--
-- O catálogo inicial foi criado pelas migrations seed_verified_hero_skills_*:
-- quatro linhas por herói, valores máximos normalizados em pt-BR, valores-base
-- corroborados na Wiki Bullet Echo Việt Nam e alterações oficiais da ZeptoLab
-- aplicadas quando publicadas. Esta tabela torna o mesmo método reutilizável
-- para os próximos heróis, sem depender de pesquisa paga em tempo de uso.

create table if not exists public.hero_skill_catalog (
  hero_slug text not null,
  name text not null,
  slug text not null,
  description text not null,
  skill_type text not null,
  cooldown numeric,
  duration numeric,
  energy_cost integer,
  unlock_level integer,
  max_level integer not null default 18,
  display_order integer not null,
  enabled boolean not null default true,
  baseline_source_url text not null default 'https://bullet-echo.fandom.com/vi/wiki/Skill',
  official_source_url text not null default 'https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1039-hero-weapons-and-abilities/',
  source_note text not null default 'Carga de catálogo: valores-base corroborados em fonte comunitária; alterações oficiais da ZeptoLab prevalecem.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hero_skill_catalog_pk primary key (hero_slug, slug),
  constraint hero_skill_catalog_hero_order_unique unique (hero_slug, display_order),
  constraint hero_skill_catalog_hero_slug_check check (hero_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint hero_skill_catalog_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint hero_skill_catalog_order_check check (display_order between 0 and 3),
  constraint hero_skill_catalog_max_level_check check (max_level >= 1),
  constraint hero_skill_catalog_baseline_source_check check (baseline_source_url ~* '^https://bullet-echo\.fandom\.com/'),
  constraint hero_skill_catalog_official_source_check check (official_source_url ~* '^https://(zepto\.helpshift\.com|([a-z0-9-]+\.)*zeptolab\.com)/')
);

drop trigger if exists trg_hero_skill_catalog_updated_at on public.hero_skill_catalog;
create trigger trg_hero_skill_catalog_updated_at
before update on public.hero_skill_catalog
for each row execute function public.set_updated_at();

alter table public.hero_skill_catalog enable row level security;
drop policy if exists hero_skill_catalog_admin_read on public.hero_skill_catalog;
create policy hero_skill_catalog_admin_read
on public.hero_skill_catalog for select to authenticated
using ((select public.is_admin()));
drop policy if exists hero_skill_catalog_admin_insert on public.hero_skill_catalog;
create policy hero_skill_catalog_admin_insert
on public.hero_skill_catalog for insert to authenticated
with check ((select public.is_admin()));
drop policy if exists hero_skill_catalog_admin_update on public.hero_skill_catalog;
create policy hero_skill_catalog_admin_update
on public.hero_skill_catalog for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));
drop policy if exists hero_skill_catalog_admin_delete on public.hero_skill_catalog;
create policy hero_skill_catalog_admin_delete
on public.hero_skill_catalog for delete to authenticated
using ((select public.is_admin()));

revoke all on table public.hero_skill_catalog from public, anon, authenticated;
grant select, insert, update, delete on table public.hero_skill_catalog to authenticated;

-- Replica o catálogo já aprovado no banco. A operação é idempotente e não
-- altera os registros atuais de hero_skills.
insert into public.hero_skill_catalog(
  hero_slug, name, slug, description, skill_type, cooldown, duration,
  energy_cost, unlock_level, max_level, display_order, enabled,
  baseline_source_url, official_source_url, source_note
)
select
  h.slug,
  s.name,
  s.slug,
  s.description,
  s.skill_type,
  s.cooldown,
  s.duration,
  s.energy_cost,
  s.unlock_level,
  coalesce(s.max_level, 18),
  s.display_order,
  s.enabled,
  'https://bullet-echo.fandom.com/vi/wiki/Skill',
  coalesce(
    (
      select r.url
      from public.hero_skill_source_links l
      join public.source_references r on r.id = l.source_id
      where l.skill_id = s.id
        and l.coverage = 'patch_override'
        and l.verification_status = 'verified'
        and r.source_type = 'official'
      order by l.verified_at desc nulls last, l.updated_at desc, l.created_at desc
      limit 1
    ),
    'https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1039-hero-weapons-and-abilities/'
  ),
  'Carga de catálogo: valores-base corroborados em fonte comunitária; alterações oficiais da ZeptoLab prevalecem.'
from public.hero_skills s
join public.heroes h on h.id = s.hero_id
on conflict (hero_slug, slug) do nothing;

-- Prévia sem gravação. A resposta usa o mesmo contrato da antiga pesquisa
-- online para que o editor não precise de uma segunda tela ou de IA.
create or replace function public.admin_preview_hero_skill_catalog(p_hero_slug text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_slug text := lower(btrim(coalesce(p_hero_slug, '')));
  v_hero public.heroes%rowtype;
  v_count integer := 0;
  v_skills jsonb := '[]'::jsonb;
  v_baseline text;
  v_official text;
begin
  if not public.is_admin() then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;

  select * into v_hero from public.heroes where slug = v_slug;

  select count(*)::integer,
         min(baseline_source_url),
         min(official_source_url)
    into v_count, v_baseline, v_official
  from public.hero_skill_catalog
  where hero_slug = v_slug and enabled = true;

  if v_count <> 4 then
    return jsonb_build_object(
      'found', false,
      'mode', 'catalog',
      'heroMatch', case when v_hero.id is null then 'not_found' else 'probable' end,
      'canonicalHeroName', v_hero.name,
      'canonicalClass', null,
      'skills', '[]'::jsonb,
      'confidence', 0,
      'warnings', jsonb_build_array(
        case
          when v_count = 0 then 'Nenhum catálogo aprovado para este herói.'
          else format('O catálogo possui %s de 4 habilidades; a carga foi interrompida.', v_count)
        end,
        'Cadastre uma carga em lote revisada antes de publicar o herói.'
      ),
      'consultedSources', '[]'::jsonb,
      'searchedAt', now()
    );
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'name', c.name,
      'slug', c.slug,
      'description', c.description,
      'skillType', c.skill_type,
      'cooldown', c.cooldown,
      'duration', c.duration,
      'energyCost', c.energy_cost,
      'unlockLevel', c.unlock_level,
      'maxLevel', c.max_level,
      'displayOrder', c.display_order,
      'origin', 'catalog_seed',
      'confidence', 1,
      'evidence', jsonb_build_array(
        jsonb_build_object(
          'url', c.baseline_source_url,
          'title', 'Wiki Bullet Echo Việt Nam — valores-base',
          'coverage', 'baseline_values'
        ),
        jsonb_build_object(
          'url', c.official_source_url,
          'title', 'Central de Ajuda oficial da ZeptoLab — estrutura/patch',
          'coverage', case when c.official_source_url like '%1039-hero-weapons-and-abilities%' then 'structure' else 'patch_override' end
        )
      ),
      'warnings', jsonb_build_array(
        'Carga de catálogo revisada; valores ausentes permanecem vazios.',
        'Valores-base comunitários não são exibidos como verificação oficial completa.'
      )
    ) order by c.display_order
  ) into v_skills
  from public.hero_skill_catalog c
  where c.hero_slug = v_slug and c.enabled = true;

  return jsonb_build_object(
    'found', true,
    'mode', 'catalog',
    'heroMatch', 'exact',
    'canonicalHeroName', coalesce(v_hero.name, initcap(replace(v_slug, '-', ' '))),
    'canonicalClass', null,
    'skills', coalesce(v_skills, '[]'::jsonb),
    'confidence', 1,
    'warnings', jsonb_build_array(
      'Catálogo padrão aplicado: valores-base corroborados e alterações oficiais registradas.'
    ),
    'consultedSources', jsonb_build_array(
      jsonb_build_object('url', v_baseline, 'title', 'Wiki Bullet Echo Việt Nam — valores-base'),
      jsonb_build_object('url', v_official, 'title', 'Central de Ajuda oficial da ZeptoLab — estrutura/patch')
    ),
    'searchedAt', now()
  );
end;
$$;

revoke all on function public.admin_preview_hero_skill_catalog(text) from public, anon;
grant execute on function public.admin_preview_hero_skill_catalog(text) to authenticated;

-- Aplica uma carga aprovada de forma atômica após a criação de um herói.
-- Não cria níveis fictícios: o padrão original só preenche a ficha de nível
-- máximo e deixa hero_skill_levels vazio quando a progressão completa não foi
-- publicada.
create or replace function public.admin_apply_hero_skill_catalog(p_hero_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_hero public.heroes%rowtype;
  v_catalog public.hero_skill_catalog%rowtype;
  v_skill_id uuid;
  v_count integer := 0;
  v_baseline_id uuid;
  v_official_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;

  select * into v_hero from public.heroes where id = p_hero_id for update;
  if not found then
    raise exception 'Herói não encontrado' using errcode = '23503';
  end if;

  if (select count(*) from public.hero_skill_catalog where hero_slug = v_hero.slug and enabled = true) <> 4 then
    return jsonb_build_object(
      'applied', false,
      'hero_id', p_hero_id,
      'hero_slug', v_hero.slug,
      'applied_count', 0,
      'reason', 'catalog_incomplete'
    );
  end if;

  for v_catalog in
    select *
    from public.hero_skill_catalog
    where hero_slug = v_hero.slug and enabled = true
    order by display_order
  loop
    insert into public.source_references(url, source_type, language, title, publisher, last_checked_at)
    values (
      v_catalog.baseline_source_url,
      'wiki',
      case when v_catalog.baseline_source_url like '%/vi/%' then 'vi' else 'en' end,
      'Wiki Bullet Echo — valores-base',
      'Comunidade Fandom',
      now()
    )
    on conflict (url) do update set last_checked_at = excluded.last_checked_at;

    select id into v_baseline_id
    from public.source_references
    where url = v_catalog.baseline_source_url;

    insert into public.source_references(url, source_type, language, title, publisher, last_checked_at)
    values (
      v_catalog.official_source_url,
      'official',
      'en',
      case when v_catalog.official_source_url like '%1039-hero-weapons-and-abilities%'
        then 'Armas e habilidades dos heróis — Central de Ajuda'
        else 'Patch oficial de balanceamento — Central de Ajuda'
      end,
      'ZeptoLab',
      now()
    )
    on conflict (url) do update set last_checked_at = excluded.last_checked_at;

    select id into v_official_id
    from public.source_references
    where url = v_catalog.official_source_url;

    insert into public.hero_skills(
      hero_id, name, slug, description, skill_type, cooldown, duration,
      energy_cost, unlock_level, max_level, display_order, enabled
    ) values (
      v_hero.id, v_catalog.name, v_catalog.slug, v_catalog.description,
      v_catalog.skill_type, v_catalog.cooldown, v_catalog.duration,
      v_catalog.energy_cost, v_catalog.unlock_level, v_catalog.max_level,
      v_catalog.display_order, v_catalog.enabled
    )
    on conflict (hero_id, slug) do update set
      name = excluded.name,
      description = excluded.description,
      skill_type = excluded.skill_type,
      cooldown = excluded.cooldown,
      duration = excluded.duration,
      energy_cost = excluded.energy_cost,
      unlock_level = excluded.unlock_level,
      max_level = excluded.max_level,
      display_order = excluded.display_order,
      enabled = excluded.enabled
    returning id into v_skill_id;

    insert into public.hero_skill_source_links(
      skill_id, source_id, coverage, is_primary, verification_status,
      verified_at, verified_patch, needs_recheck, public_note
    ) values (
      v_skill_id, v_baseline_id, 'baseline_values', true, 'corroborated',
      now(), null, true, v_catalog.source_note
    )
    on conflict (skill_id, source_id, coverage) do update set
      is_primary = excluded.is_primary,
      verification_status = excluded.verification_status,
      verified_at = excluded.verified_at,
      needs_recheck = excluded.needs_recheck,
      public_note = excluded.public_note;

    insert into public.hero_skill_source_links(
      skill_id, source_id, coverage, is_primary, verification_status,
      verified_at, verified_patch, needs_recheck, public_note
    ) values (
      v_skill_id, v_official_id,
      case when v_catalog.official_source_url like '%1039-hero-weapons-and-abilities%' then 'structure' else 'patch_override' end,
      false, 'verified', now(),
      case when v_catalog.official_source_url like '%1039-hero-weapons-and-abilities%' then 'Estrutura oficial de habilidades' else 'Patch oficial registrado no catálogo' end,
      false,
      'A ZeptoLab é a fonte oficial para a estrutura e para alterações de balanceamento publicadas; a ficha-base permanece identificada separadamente.'
    )
    on conflict (skill_id, source_id, coverage) do update set
      is_primary = excluded.is_primary,
      verification_status = excluded.verification_status,
      verified_at = excluded.verified_at,
      verified_patch = excluded.verified_patch,
      needs_recheck = excluded.needs_recheck,
      public_note = excluded.public_note;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'applied', true,
    'hero_id', p_hero_id,
    'hero_slug', v_hero.slug,
    'applied_count', v_count,
    'levels_created', 0,
    'mode', 'catalog'
  );
end;
$$;

revoke all on function public.admin_apply_hero_skill_catalog(uuid) from public, anon;
grant execute on function public.admin_apply_hero_skill_catalog(uuid) to authenticated;

comment on table public.hero_skill_catalog is
  'Carga padrão de quatro habilidades por herói. Valores-base comunitários corroborados; patches oficiais preservados como proveniência.';
