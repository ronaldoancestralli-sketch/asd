-- Echo Brain — classifica observações legadas e futuras de forma fail-closed.
-- recommended_by_brain=false sozinho não é prova de organicidade; a origem do lote
-- também precisa ser conhecida.

update public.composition_match_observations o
set observation_provenance = case
  when o.recommended_by_brain is true or o.recommendation_exposure_id is not null then 'brain_exposed'
  when b.source_type in ('official','partner','manual_verified') then 'organic'
  when b.source_type='admin_import' then 'admin_import'
  else 'unknown'
end
from public.composition_observation_batches b
where b.id=o.batch_id
  and o.observation_provenance='unknown';

create or replace function public.echo_brain_observation_provenance_guard()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_source_type text;
begin
  if new.recommendation_exposure_id is not null then
    new.recommended_by_brain := true;
    new.observation_provenance := 'brain_exposed';
    return new;
  end if;

  if new.recommended_by_brain is true then
    new.observation_provenance := 'brain_exposed';
    return new;
  end if;

  if new.observation_provenance='organic' then
    new.recommended_by_brain := false;
    return new;
  end if;

  if new.observation_provenance='unknown' and new.batch_id is not null then
    select source_type into v_source_type from public.composition_observation_batches where id=new.batch_id;
    new.observation_provenance := case
      when v_source_type in ('official','partner','manual_verified') then 'organic'
      when v_source_type='admin_import' then 'admin_import'
      else 'unknown'
    end;
  end if;

  return new;
end;
$$;

comment on function public.echo_brain_observation_provenance_guard() is
  'Classifica exposição antes de qualquer uso competitivo. Organicidade só é inferida de fontes official/partner/manual_verified sem exposição do Brain.';
