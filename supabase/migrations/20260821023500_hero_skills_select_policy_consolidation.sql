-- EchoArena — evita policies SELECT permissivas sobrepostas para authenticated.
-- Anônimos continuam vendo apenas conteúdo publicado; usuários autenticados
-- veem o mesmo conteúdo público, exceto administradores, que veem tudo.

drop policy if exists hero_skills_public_read on public.hero_skills;
drop policy if exists hero_skills_admin_read_all on public.hero_skills;

create policy hero_skills_anon_read
on public.hero_skills
for select
to anon
using (
  enabled = true
  and exists (
    select 1
    from public.heroes h
    where h.id = hero_skills.hero_id
      and h.enabled = true
  )
);

create policy hero_skills_authenticated_read
on public.hero_skills
for select
to authenticated
using (
  public.is_admin()
  or (
    enabled = true
    and exists (
      select 1
      from public.heroes h
      where h.id = hero_skills.hero_id
        and h.enabled = true
    )
  )
);

drop policy if exists skill_levels_public_read on public.hero_skill_levels;
drop policy if exists skill_levels_admin_read_all on public.hero_skill_levels;

create policy skill_levels_anon_read
on public.hero_skill_levels
for select
to anon
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

create policy skill_levels_authenticated_read
on public.hero_skill_levels
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.hero_skills s
    join public.heroes h on h.id = s.hero_id
    where s.id = hero_skill_levels.skill_id
      and s.enabled = true
      and h.enabled = true
  )
);
