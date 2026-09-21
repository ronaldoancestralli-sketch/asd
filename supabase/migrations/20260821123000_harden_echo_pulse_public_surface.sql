-- EchoArena — endurece a superfície pública do Echo Pulse.
-- O frontend público não precisa ler pulse_sources: dados seguros da origem
-- são copiados para cada item e a tabela operacional continua Admin/service-only.

alter table public.pulse_items
  add column if not exists source_name text,
  add column if not exists source_platform text;

update public.pulse_items p
set
  source_name = s.name,
  source_platform = s.platform
from public.pulse_sources s
where s.id = p.source_id
  and (
    p.source_name is distinct from s.name
    or p.source_platform is distinct from s.platform
  );

alter table public.pulse_items
  alter column source_name set not null,
  alter column source_platform set not null;

create or replace function public.sync_pulse_item_source_snapshot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_platform text;
begin
  select s.name, s.platform
    into v_name, v_platform
  from public.pulse_sources s
  where s.id = new.source_id;

  if v_name is null or v_platform is null then
    raise exception 'pulse_source_not_found' using errcode = '23503';
  end if;

  new.source_name := v_name;
  new.source_platform := v_platform;
  return new;
end;
$$;

drop trigger if exists pulse_items_sync_source_snapshot on public.pulse_items;
create trigger pulse_items_sync_source_snapshot
before insert or update of source_id on public.pulse_items
for each row execute function public.sync_pulse_item_source_snapshot();

create or replace function public.propagate_pulse_source_snapshot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.name is distinct from new.name or old.platform is distinct from new.platform then
    update public.pulse_items
    set source_name = new.name,
        source_platform = new.platform
    where source_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists pulse_sources_propagate_snapshot on public.pulse_sources;
create trigger pulse_sources_propagate_snapshot
after update of name, platform on public.pulse_sources
for each row execute function public.propagate_pulse_source_snapshot();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pulse_items'::regclass
      and conname = 'pulse_items_published_content_required'
  ) then
    alter table public.pulse_items
      add constraint pulse_items_published_content_required
      check (
        status <> 'published'
        or (
          nullif(btrim(title), '') is not null
          and nullif(btrim(coalesce(summary, source_excerpt, '')), '') is not null
          and published_at is not null
        )
      );
  end if;
end;
$$;

-- Estas funções são internas a triggers; não são RPCs de cliente.
revoke all on function public.sync_pulse_item_source_snapshot() from public, anon, authenticated;
revoke all on function public.propagate_pulse_source_snapshot() from public, anon, authenticated;

comment on column public.pulse_items.source_name is
  'Snapshot público seguro do nome da fonte no momento de persistência/sincronização.';
comment on column public.pulse_items.source_platform is
  'Snapshot público seguro da plataforma da fonte; evita expor pulse_sources ao cliente público.';
