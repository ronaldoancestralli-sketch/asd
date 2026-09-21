-- Integra os novos módulos públicos ao CMS visual existente.
-- Não sobrescreve conteúdo já cadastrado no banco.
insert into public.site_pages (page_key, content, published)
values
  ('classes', '{}'::jsonb, true),
  ('guides', '{}'::jsonb, true),
  ('news', '{}'::jsonb, true),
  ('tier_list', '{}'::jsonb, true),
  ('compositions', '{}'::jsonb, true)
on conflict (page_key) do nothing;
