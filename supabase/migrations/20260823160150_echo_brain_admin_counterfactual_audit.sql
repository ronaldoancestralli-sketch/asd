-- Echo Brain — escrita estreita de auditoria contrafactual para ferramentas admin.

create or replace function public.admin_echo_brain_record_counterfactual(
  p_domain text,
  p_baseline_key text,
  p_candidate_key text,
  p_baseline_score numeric,
  p_candidate_score numeric,
  p_changed_components jsonb,
  p_confidence jsonb,
  p_semantic_schema text default null,
  p_model_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_id uuid;
  v_domain text := trim(coalesce(p_domain,''));
  v_baseline text := trim(coalesce(p_baseline_key,''));
  v_candidate text := trim(coalesce(p_candidate_key,''));
begin
  if not public.echo_is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if v_domain not in ('composition','build','equipment') then raise exception 'invalid_counterfactual_domain'; end if;
  if length(v_baseline)<1 or length(v_baseline)>256 then raise exception 'baseline_key_invalid'; end if;
  if length(v_candidate)<1 or length(v_candidate)>256 then raise exception 'candidate_key_invalid'; end if;
  if p_semantic_schema is not null and length(p_semantic_schema)>96 then raise exception 'semantic_schema_invalid'; end if;

  insert into public.echo_brain_counterfactual_audits(
    domain,baseline_key,candidate_key,baseline_score,candidate_score,delta,
    changed_components,confidence,semantic_schema,model_id
  ) values (
    v_domain,v_baseline,v_candidate,p_baseline_score,p_candidate_score,
    case when p_baseline_score is null or p_candidate_score is null then null else p_candidate_score-p_baseline_score end,
    coalesce(p_changed_components,'[]'::jsonb),coalesce(p_confidence,'{}'::jsonb),
    nullif(trim(coalesce(p_semantic_schema,'')),''),p_model_id
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.admin_echo_brain_record_counterfactual(text,text,text,numeric,numeric,jsonb,jsonb,text,uuid) from public,anon;
grant execute on function public.admin_echo_brain_record_counterfactual(text,text,text,numeric,numeric,jsonb,jsonb,text,uuid) to authenticated;

comment on function public.admin_echo_brain_record_counterfactual(text,text,text,numeric,numeric,jsonb,jsonb,text,uuid) is
  'Auditoria admin de uma troca contrafactual já calculada pelo motor oficial; não recalcula nem inventa score.';
