-- EchoArena — fontes usadas são registros de auditoria e não podem desaparecer
-- por uma exclusão direta. Primeiro é preciso tratar vínculos/histórico.

create or replace function public.protect_referenced_skill_source_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.hero_skill_source_links l
    where l.source_id = old.id
  ) then
    raise exception 'referenced_skill_source_cannot_be_deleted'
      using errcode = '23503',
            hint = 'Desvincule explicitamente a fonte das habilidades antes de removê-la do catálogo.';
  end if;

  if exists (
    select 1
    from public.balance_history b
    where b.source_id = old.id
  ) then
    raise exception 'historical_skill_source_cannot_be_deleted'
      using errcode = '23503',
            hint = 'Fontes usadas em histórico oficial devem ser preservadas para auditoria.';
  end if;

  return old;
end;
$$;

revoke all on function public.protect_referenced_skill_source_delete()
from public, anon, authenticated;

drop trigger if exists trg_source_references_protect_delete
  on public.source_references;
create trigger trg_source_references_protect_delete
before delete on public.source_references
for each row
execute function public.protect_referenced_skill_source_delete();
