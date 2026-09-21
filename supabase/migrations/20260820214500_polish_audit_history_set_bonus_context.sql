-- Melhora a leitura do histórico permanente: em alterações de stats de bônus,
-- registra também o nome do conjunto para que outra pessoa entenda o contexto
-- sem depender do ID interno.

create or replace function public.log_equipment_set_bonus_stats_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_set_name text;
begin
  if old.stats is not distinct from new.stats then
    return new;
  end if;

  begin
    v_email := auth.jwt() ->> 'email';
  exception when others then
    v_email := null;
  end;

  select name into v_set_name
  from public.equipment_sets
  where id = new.set_id;

  insert into public.equipment_audit_history (
    entity_type,
    entity_id,
    action,
    summary,
    before_data,
    after_data,
    actor_id,
    actor_email,
    metadata
  ) values (
    'set_bonus',
    new.id::text,
    'regra_calculo_alterada',
    concat(
      coalesce(v_set_name, 'Conjunto'),
      ' · ',
      coalesce(nullif(new.title, ''), concat(coalesce(new.required_pieces::text, '?'), ' peças'))
    ),
    jsonb_build_object('stats', old.stats, 'description', old.description),
    jsonb_build_object('stats', new.stats, 'description', new.description),
    auth.uid(),
    v_email,
    jsonb_build_object(
      'set_id', new.set_id,
      'set_name', v_set_name,
      'required_pieces', new.required_pieces
    )
  );

  return new;
end;
$$;

revoke all on function public.log_equipment_set_bonus_stats_history() from public;
