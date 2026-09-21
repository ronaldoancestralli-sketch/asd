-- EchoArena
-- Índices de cobertura apenas para FKs dos próximos módulos funcionais.
-- Não duplica índices já existentes em team_composition_members/team_compositions.

create index if not exists idx_build_comparisons_left_build_id
  on public.build_comparisons(left_build_id);

create index if not exists idx_build_comparisons_right_build_id
  on public.build_comparisons(right_build_id);

create index if not exists idx_build_versions_hero_id
  on public.build_versions(hero_id);

create index if not exists idx_build_versions_created_by
  on public.build_versions(created_by);

create index if not exists idx_hero_comparisons_left_hero_id
  on public.hero_comparisons(left_hero_id);

create index if not exists idx_hero_comparisons_right_hero_id
  on public.hero_comparisons(right_hero_id);

create index if not exists idx_hero_class_aliases_class_id
  on public.hero_class_aliases(class_id);
