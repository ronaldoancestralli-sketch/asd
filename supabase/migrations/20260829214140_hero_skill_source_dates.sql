-- EchoArena — data publicada pela fonte de habilidades.
--
-- `last_checked_at` registra quando a equipe consultou a página. Este novo
-- campo guarda apenas a data de atualização/publicação declarada pela própria
-- fonte; quando ela não existe (por exemplo, data relativa da ZeptoLab), o
-- valor permanece nulo para evitar uma precisão inventada.

alter table public.source_references
  add column if not exists source_updated_at date;

comment on column public.source_references.source_updated_at is
  'Data de publicação/atualização declarada pela fonte. Nula quando a origem não fornece uma data exata.';

