-- Mantém a proteção contra remover diretamente a última entrada de uma
-- Tier List publicada, mas não bloqueia a exclusão da própria lista e seu cascade.
create or replace function public.protect_published_tier_last_entry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_list_id uuid := coalesce(old.tier_list_id, new.tier_list_id);
  v_published boolean;
  v_count integer;
begin
  if pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select published into v_published from public.tier_lists where id = v_list_id;
  if coalesce(v_published, false) then
    select count(*) into v_count from public.tier_list_entries where tier_list_id = v_list_id;
    if tg_op = 'DELETE' and v_count <= 1 then
      raise exception 'unpublish_tier_list_before_removing_last_entry' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and old.tier_list_id = v_list_id and new.tier_list_id is distinct from old.tier_list_id and v_count <= 1 then
      raise exception 'unpublish_tier_list_before_moving_last_entry' using errcode = '23514';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
