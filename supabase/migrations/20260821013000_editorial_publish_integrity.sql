-- Regras de publicação: conteúdo público só pode ser marcado como publicado
-- quando possui os dados mínimos necessários. Rascunhos continuam livres.
create or replace function public.validate_editorial_publish()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.published then
    if nullif(btrim(coalesce(new.title, '')), '') is null then
      raise exception 'publication_title_required' using errcode = '23514';
    end if;
    if nullif(btrim(coalesce(new.slug, '')), '') is null then
      raise exception 'publication_slug_required' using errcode = '23514';
    end if;
    if nullif(btrim(coalesce(new.summary, '')), '') is null then
      raise exception 'publication_summary_required' using errcode = '23514';
    end if;
    if nullif(btrim(coalesce(new.content, '')), '') is null then
      raise exception 'publication_content_required' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guides_publish_integrity on public.guides;
create trigger trg_guides_publish_integrity
before insert or update of published, title, slug, summary, content
on public.guides
for each row execute function public.validate_editorial_publish();

drop trigger if exists trg_news_publish_integrity on public.news;
create trigger trg_news_publish_integrity
before insert or update of published, title, slug, summary, content
on public.news
for each row execute function public.validate_editorial_publish();

create or replace function public.validate_tier_list_publish()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.published then
    if nullif(btrim(coalesce(new.title, '')), '') is null
       or nullif(btrim(coalesce(new.slug, '')), '') is null then
      raise exception 'tier_list_identity_required' using errcode = '23514';
    end if;
    if new.id is null or not exists (
      select 1 from public.tier_list_entries e where e.tier_list_id = new.id
    ) then
      raise exception 'tier_list_requires_entries_before_publish' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tier_lists_publish_integrity on public.tier_lists;
create trigger trg_tier_lists_publish_integrity
before insert or update of published, title, slug
on public.tier_lists
for each row execute function public.validate_tier_list_publish();

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

drop trigger if exists trg_tier_entries_protect_published_last on public.tier_list_entries;
create trigger trg_tier_entries_protect_published_last
before delete or update of tier_list_id
on public.tier_list_entries
for each row execute function public.protect_published_tier_last_entry();
