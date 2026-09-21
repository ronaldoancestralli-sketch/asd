-- Echo Brain — impede dois treinamentos concorrentes do mesmo cérebro.
create unique index if not exists composition_training_runs_one_inflight
  on public.composition_training_runs (brain_key)
  where status in ('queued','running');

comment on index public.composition_training_runs_one_inflight is
  'Echo Brain: no máximo um treinamento queued/running por brain_key.';
