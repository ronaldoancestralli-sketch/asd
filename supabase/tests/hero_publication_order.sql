-- A validação de publicação deve aguardar o estado final da transação.
-- Este teste é read-only; o teste de escrita usa uma transação descartável no
-- ambiente de implantação.
do $$
declare
  v_deferrable boolean;
  v_initially_deferred boolean;
begin
  select tgdeferrable, tginitdeferred
    into v_deferrable, v_initially_deferred
  from pg_trigger
  where tgrelid = 'public.heroes'::regclass
    and tgname = 'heroes_enforce_publication_integrity'
    and not tgisinternal;

  if not coalesce(v_deferrable, false) or not coalesce(v_initially_deferred, false) then
    raise exception 'hero_publication_order_test_failed: integrity trigger is not initially deferred';
  end if;
end $$;

select
  tgname,
  tgdeferrable,
  tginitdeferred
from pg_trigger
where tgrelid = 'public.heroes'::regclass
  and tgname = 'heroes_enforce_publication_integrity';
