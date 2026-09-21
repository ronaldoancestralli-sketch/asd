-- The hero bundle RPC writes the hero row before its base stats. Defer the
-- existing integrity check until transaction end so the final bundle is
-- validated without weakening the rule for incomplete direct writes.
drop trigger if exists heroes_enforce_publication_integrity
  on public.heroes;

create constraint trigger heroes_enforce_publication_integrity
after insert or update on public.heroes
deferrable initially deferred
for each row
execute function public.enforce_hero_publication_integrity();

comment on trigger heroes_enforce_publication_integrity on public.heroes is
  'Validates class, media and base stats against the final state of the transaction.';
