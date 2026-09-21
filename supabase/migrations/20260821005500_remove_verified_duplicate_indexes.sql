-- Remove somente índices byte-a-byte equivalentes verificados previamente.
-- O índice equipment_tiers_slug_key é mantido porque sustenta a constraint UNIQUE.

drop index if exists public.idx_comments_build_created;
drop index if exists public.equipment_tiers_slug_uk;
drop index if exists public.idx_equipment_hero;
