-- EchoArena — administradores precisam conseguir revisar habilidades e níveis
-- mesmo quando o conteúdo está desativado para o público.

drop policy if exists hero_skills_admin_read_all on public.hero_skills;
create policy hero_skills_admin_read_all
on public.hero_skills
for select
to authenticated
using (public.is_admin());

drop policy if exists skill_levels_admin_read_all on public.hero_skill_levels;
create policy skill_levels_admin_read_all
on public.hero_skill_levels
for select
to authenticated
using (public.is_admin());
