-- EchoArena — enforce publication integrity at the database boundary.
-- A hero may stay as a draft with incomplete data, but published heroes need
-- a class, public media and at least one real base-stat row.

-- Existing rows that already violate the verified publication requirements are
-- unpublished rather than deleted. Their data remains intact for Admin review.
update public.heroes h
set enabled = false
where h.enabled = true
  and (
    h.class_id is null
    or coalesce(
      nullif(btrim(coalesce(h.card_image_path, '')), ''),
      nullif(btrim(coalesce(h.image_path, '')), ''),
      nullif(btrim(coalesce(h.card_image_url, '')), ''),
      nullif(btrim(coalesce(h.image_url, '')), '')
    ) is null
    or not exists (
      select 1
      from public.hero_base_stats s
      where s.hero_id = h.id
    )
  );

create or replace function public.enforce_hero_publication_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_reasons text[] := array[]::text[];
begin
  if coalesce(new.enabled, false) = false then
    return new;
  end if;

  if new.class_id is null then
    v_reasons := array_append(v_reasons, 'missing_class');
  end if;

  if coalesce(
    nullif(btrim(coalesce(new.card_image_path, '')), ''),
    nullif(btrim(coalesce(new.image_path, '')), ''),
    nullif(btrim(coalesce(new.card_image_url, '')), ''),
    nullif(btrim(coalesce(new.image_url, '')), '')
  ) is null then
    v_reasons := array_append(v_reasons, 'missing_media');
  end if;

  if not exists (
    select 1
    from public.hero_base_stats s
    where s.hero_id = new.id
  ) then
    v_reasons := array_append(v_reasons, 'missing_base_stats');
  end if;

  if cardinality(v_reasons) > 0 then
    raise exception 'hero_publication_blocked:%', array_to_string(v_reasons, ',')
      using errcode = '23514',
            hint = 'Save the hero as disabled, persist its required real data, then publish it through the checked publication flow.';
  end if;

  return new;
end;
$$;

drop trigger if exists heroes_enforce_publication_integrity on public.heroes;
create trigger heroes_enforce_publication_integrity
before insert or update on public.heroes
for each row
execute function public.enforce_hero_publication_integrity();

create or replace function public.protect_published_hero_base_stats()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_hero_id uuid := old.hero_id;
begin
  if tg_op = 'UPDATE' and new.hero_id is not distinct from old.hero_id then
    return new;
  end if;

  if exists (
    select 1
    from public.heroes h
    where h.id = v_hero_id
      and h.enabled = true
  ) and not exists (
    select 1
    from public.hero_base_stats s
    where s.hero_id = v_hero_id
      and (tg_op <> 'DELETE' or s.id <> old.id)
  ) then
    raise exception 'hero_publication_blocked:missing_base_stats'
      using errcode = '23514',
            hint = 'Unpublish the hero before removing its final base-stat row.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists hero_base_stats_protect_published on public.hero_base_stats;
create trigger hero_base_stats_protect_published
before delete or update of hero_id on public.hero_base_stats
for each row
execute function public.protect_published_hero_base_stats();
