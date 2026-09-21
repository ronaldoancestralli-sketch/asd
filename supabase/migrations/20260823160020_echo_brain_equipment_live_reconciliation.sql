-- Echo Brain — reconciliação de equipamentos: live build vs aprendizado pós-patch.
-- Item Fit/Build são determinísticos e leem o estado atual a cada análise; portanto
-- não mantêm dívida persistente após uma versão ser registrada. Já composição e
-- aprendizado competitivo permanecem pendentes até haver evidência pós-patch.

create or replace function public.echo_brain_auto_resolve_live_equipment_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.scope in ('item_fit','build_recommendations') then
    new.status := 'resolved';
    new.resolved_at := coalesce(new.resolved_at, now());
    new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
      'resolution','live_deterministic_v4',
      'reason','current_item_state_is_evaluated_on_read'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.echo_brain_auto_resolve_live_equipment_scope() from public, anon, authenticated;

drop trigger if exists equipment_brain_invalidations_live_scope on public.equipment_brain_invalidations;
create trigger equipment_brain_invalidations_live_scope
before insert or update of scope,status on public.equipment_brain_invalidations
for each row execute function public.echo_brain_auto_resolve_live_equipment_scope();

-- Corrige linhas eventualmente criadas antes desta migration.
update public.equipment_brain_invalidations
set status='resolved',
    resolved_at=coalesce(resolved_at,now()),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'resolution','live_deterministic_v4',
      'reason','current_item_state_is_evaluated_on_read'
    )
where scope in ('item_fit','build_recommendations')
  and status='pending';

-- Todo buff/nerf/mudança de combate pode deslocar o meta. Mesmo quando a
-- semântica do item não mudou, o aprendizado competitivo precisa observar o
-- período pós-patch antes de ser considerado atualizado.
create or replace function public.echo_brain_require_learning_after_equipment_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.affects_brain is true then
    insert into public.equipment_brain_invalidations(
      equipment_id,equipment_version_id,scope,status,reason,
      affected_rarities,affected_attributes,metadata
    )
    values(
      new.equipment_id,new.id,'training','pending','equipment_balance_changed',
      coalesce((select array_agg(value order by value) from jsonb_array_elements_text(coalesce(new.analysis->'affectedRarities','[]'::jsonb))),'{}'::text[]),
      coalesce((select array_agg(value order by value) from jsonb_array_elements_text(coalesce(new.analysis->'affectedAttributes','[]'::jsonb))),'{}'::text[]),
      jsonb_build_object(
        'severity',new.severity,
        'game_version',new.game_version,
        'change_class',new.change_class,
        'requires_semantic_retraining',new.requires_retraining
      )
    )
    on conflict (equipment_version_id,scope) do update set
      status='pending', resolved_at=null,
      reason='equipment_balance_changed',
      metadata=excluded.metadata;
  end if;
  return new;
end;
$$;

revoke all on function public.echo_brain_require_learning_after_equipment_change() from public, anon, authenticated;

drop trigger if exists equipment_brain_versions_learning_debt on public.equipment_brain_versions;
create trigger equipment_brain_versions_learning_debt
after insert on public.equipment_brain_versions
for each row execute function public.echo_brain_require_learning_after_equipment_change();

-- Corrige versões de combate já registradas nesta instalação que ainda não
-- possuem uma dívida de treino explícita.
insert into public.equipment_brain_invalidations(
  equipment_id,equipment_version_id,scope,status,reason,
  affected_rarities,affected_attributes,metadata
)
select
  v.equipment_id,v.id,'training','pending','equipment_balance_changed',
  coalesce((select array_agg(value order by value) from jsonb_array_elements_text(coalesce(v.analysis->'affectedRarities','[]'::jsonb))),'{}'::text[]),
  coalesce((select array_agg(value order by value) from jsonb_array_elements_text(coalesce(v.analysis->'affectedAttributes','[]'::jsonb))),'{}'::text[]),
  jsonb_build_object('severity',v.severity,'game_version',v.game_version,'change_class',v.change_class,'requires_semantic_retraining',v.requires_retraining)
from public.equipment_brain_versions v
where v.affects_brain is true
on conflict (equipment_version_id,scope) do nothing;

-- Frescor público de BUILD: fila suja + escopos live ainda pendentes. Dívida de
-- composição/treino não contamina o cálculo atual da build; ela aparece no
-- painel administrativo do Brain como dívida competitiva separada.
create or replace function public.echo_brain_equipment_freshness(p_equipment_ids text[])
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'equipmentId', latest.equipment_id,
    'version', latest.version,
    'gameVersion', latest.game_version,
    'fingerprint', latest.semantic_fingerprint,
    'changedAt', latest.created_at,
    'pendingInvalidations', latest.pending_build_invalidations + latest.pending_changes,
    'pendingBuildInvalidations', latest.pending_build_invalidations,
    'pendingChanges', latest.pending_changes
  ) order by latest.equipment_id),'[]'::jsonb)
  from (
    select distinct on (v.equipment_id)
      v.equipment_id,
      v.version,
      v.game_version,
      v.semantic_fingerprint,
      v.created_at,
      (select count(*)
         from public.equipment_brain_invalidations i
        where i.equipment_version_id=v.id
          and i.status='pending'
          and i.scope in ('item_fit','build_recommendations')) as pending_build_invalidations,
      (select count(*)
         from public.equipment_brain_change_queue q
        where q.equipment_id=v.equipment_id
          and q.status in ('pending','processing')) as pending_changes
    from public.equipment_brain_versions v
    where v.equipment_id = any(coalesce(p_equipment_ids,'{}'::text[]))
    order by v.equipment_id, v.version desc
  ) latest;
$$;

revoke all on function public.echo_brain_equipment_freshness(text[]) from public;
grant execute on function public.echo_brain_equipment_freshness(text[]) to anon, authenticated;

comment on function public.echo_brain_equipment_freshness(text[]) is
  'Frescor público mínimo para builds: considera versão atual, fila suja e apenas invalidações live. Dívida competitiva fica privada no painel Brain.';
