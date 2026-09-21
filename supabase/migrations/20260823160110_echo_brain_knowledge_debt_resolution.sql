-- Echo Brain — dívida de conhecimento de herói só é encerrada depois de um
-- modelo Semantic v4 ativo e validado em janela posterior à mudança.

create or replace function public.echo_brain_resolve_knowledge_training_debt()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_validation_from timestamptz;
  v_validation_until timestamptz;
  v_train_until timestamptz;
begin
  if new.status <> 'active' or new.passed_validation is not true then return new; end if;
  if new.feature_schema_version <> 'composition-semantic-context-v4' then return new; end if;

  begin v_validation_from := nullif(new.metrics->>'validationObservedFrom','')::timestamptz; exception when others then v_validation_from := null; end;
  begin v_validation_until := nullif(new.metrics->>'validationObservedUntil','')::timestamptz; exception when others then v_validation_until := null; end;
  begin v_train_until := nullif(new.metrics->>'trainObservedUntil','')::timestamptz; exception when others then v_train_until := null; end;

  if v_validation_from is null or v_validation_until is null or v_train_until is null then return new; end if;

  update public.echo_brain_knowledge_invalidations i
  set status='resolved',resolved_at=now(),metadata=i.metadata || jsonb_build_object(
    'resolvedByModelId',new.id,
    'resolvedByModelVersion',new.version,
    'validationObservedFrom',v_validation_from,
    'validationObservedUntil',v_validation_until,
    'trainObservedUntil',v_train_until,
    'resolutionRule','semantic-v4-post-change-validation-v1'
  )
  where i.status='pending'
    and i.scope='training'
    and i.created_at < v_validation_from
    and v_train_until > i.created_at
    and v_validation_until > i.created_at;

  return new;
end;
$$;

revoke all on function public.echo_brain_resolve_knowledge_training_debt() from public,anon,authenticated;

drop trigger if exists trg_echo_brain_resolve_knowledge_training_debt on public.composition_model_versions;
create trigger trg_echo_brain_resolve_knowledge_training_debt
after insert or update of status,passed_validation,activated_at on public.composition_model_versions
for each row execute function public.echo_brain_resolve_knowledge_training_debt();

comment on function public.echo_brain_resolve_knowledge_training_debt() is
  'Resolve somente dívida competitiva de conhecimento cujo patch é anterior à janela temporal de validação do modelo Semantic v4 ativo. Não resolve simulation_readiness.';
