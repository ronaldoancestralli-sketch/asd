-- Normaliza apenas a mídia legada conhecida da página Heróis.
--
-- O editor atual persiste novas mídias como URL/caminho público. Duas imagens
-- antigas de "Todos os heróis" ficaram gravadas como data:image/webp;base64 e
-- são aceitas pelo runtime público, mas bloqueiam a validação de publicação do
-- Admin. O arquivo equivalente é versionado em:
--   /assets/cms/heroes/all-heroes-legacy.webp
--
-- A migração é deliberadamente conservadora: só troca o URL quando o payload
-- ainda é WebP inline e o conteúdo binário corresponde exatamente ao hash
-- legado conhecido. Metadados de enquadramento e texto alternativo permanecem.

update public.site_pages
set content = jsonb_set(
  content,
  '{heroes_all_feature_image,url}',
  to_jsonb('/assets/cms/heroes/all-heroes-legacy.webp'::text),
  false
)
where page_key = 'heroes'
  and jsonb_typeof(content -> 'heroes_all_feature_image') = 'object'
  and coalesce(content -> 'heroes_all_feature_image' ->> 'url', '') like 'data:image/webp;base64,%'
  and md5(
    decode(
      split_part(content -> 'heroes_all_feature_image' ->> 'url', ',', 2),
      'base64'
    )
  ) = '049e8a1f6ffe135e8163d72d8195970c';

update public.site_pages
set content = jsonb_set(
  content,
  '{heroes_all_card_image,url}',
  to_jsonb('/assets/cms/heroes/all-heroes-legacy.webp'::text),
  false
)
where page_key = 'heroes'
  and jsonb_typeof(content -> 'heroes_all_card_image') = 'object'
  and coalesce(content -> 'heroes_all_card_image' ->> 'url', '') like 'data:image/webp;base64,%'
  and md5(
    decode(
      split_part(content -> 'heroes_all_card_image' ->> 'url', ',', 2),
      'base64'
    )
  ) = '049e8a1f6ffe135e8163d72d8195970c';
