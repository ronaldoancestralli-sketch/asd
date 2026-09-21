-- A base já possuía o índice único uq_build_items_build_slot.
-- A migração transacional anterior adicionou uma constraint equivalente por
-- não existir uma constraint com o mesmo nome. Mantemos a proteção original
-- e removemos apenas a duplicação criada agora.

alter table public.build_items
  drop constraint if exists build_items_build_slot_key;
