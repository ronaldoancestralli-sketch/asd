-- Echo Arena — Central de Status e Bônus, Fase 2C.1.
--
-- Persistência aditiva para coleta e revisão. Esta migração NÃO converte o
-- catálogo existente, NÃO publica efeitos e NÃO habilita autoridade numérica.

create table public.equipment_effect_documents (
  id uuid primary key default gen_random_uuid(),
  subject_kind text not null check (subject_kind in ('equipment', 'equipment_variant', 'set_bonus')),
  equipment_id uuid references public.equipments(id) on delete restrict,
  variant_id uuid references public.equipment_variants(id) on delete restrict,
  set_bonus_id uuid references public.equipment_set_bonuses(id) on delete restrict,
  current_revision_id uuid,
  current_revision_number integer not null default 0 check (current_revision_number >= 0),
  workflow_status text not null default 'draft'
    check (workflow_status in ('draft', 'in_review', 'reviewed', 'changes_requested')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_effect_document_subject_v1 check (
    (subject_kind = 'equipment' and equipment_id is not null and variant_id is null and set_bonus_id is null)
    or (subject_kind = 'equipment_variant' and equipment_id is null and variant_id is not null and set_bonus_id is null)
    or (subject_kind = 'set_bonus' and equipment_id is null and variant_id is null and set_bonus_id is not null)
  )
);

create unique index equipment_effect_documents_equipment_uidx
  on public.equipment_effect_documents(equipment_id)
  where subject_kind = 'equipment';
create unique index equipment_effect_documents_variant_uidx
  on public.equipment_effect_documents(variant_id)
  where subject_kind = 'equipment_variant';
create unique index equipment_effect_documents_set_bonus_uidx
  on public.equipment_effect_documents(set_bonus_id)
  where subject_kind = 'set_bonus';
create index equipment_effect_documents_current_revision_idx
  on public.equipment_effect_documents(current_revision_id)
  where current_revision_id is not null;

create table public.equipment_effect_document_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.equipment_effect_documents(id) on delete restrict,
  revision integer not null check (revision > 0),
  contract_version text,
  registry_revision text,
  payload jsonb not null,
  evidence_manifest jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence_manifest) = 'array'),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  validation_state text not null
    check (validation_state in ('valid', 'invalid', 'unknown_version', 'unknown_registry')),
  evidence_state text not null check (evidence_state in ('complete', 'incomplete')),
  validation_issues jsonb not null default '{}'::jsonb
    check (jsonb_typeof(validation_issues) = 'object'),
  source text not null default 'admin-effect-central',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (document_id, revision)
);

create index equipment_effect_revisions_document_created_idx
  on public.equipment_effect_document_revisions(document_id, revision desc);

alter table public.equipment_effect_documents
  add constraint equipment_effect_documents_current_revision_fkey
  foreign key (current_revision_id)
  references public.equipment_effect_document_revisions(id)
  on delete restrict;

create table public.equipment_effect_evidence (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in (
    'official', 'game_screenshot', 'catalog', 'historical_audit',
    'admin_entry', 'migration', 'unknown'
  )),
  source_reference text not null check (btrim(source_reference) <> ''),
  source_uri text,
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  observed_at text,
  game_revision text,
  excerpt text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index equipment_effect_evidence_identity_uidx
  on public.equipment_effect_evidence(file_sha256, source_reference, coalesce(source_uri, ''));

create table public.equipment_effect_revision_evidence (
  revision_id uuid not null references public.equipment_effect_document_revisions(id) on delete restrict,
  evidence_id uuid not null references public.equipment_effect_evidence(id) on delete restrict,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (revision_id, evidence_id)
);

create index equipment_effect_revision_evidence_evidence_idx
  on public.equipment_effect_revision_evidence(evidence_id);

create table public.equipment_effect_review_queue (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.equipment_effect_documents(id) on delete restrict,
  revision_id uuid not null unique references public.equipment_effect_document_revisions(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'in_review', 'approved', 'changes_requested')),
  is_current boolean not null default true,
  reason text not null check (btrim(reason) <> ''),
  impact text not null check (btrim(impact) <> ''),
  required_action text not null check (btrim(required_action) <> ''),
  review_note text,
  requested_by uuid default auth.uid(),
  requested_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  superseded_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index equipment_effect_review_queue_current_uidx
  on public.equipment_effect_review_queue(document_id)
  where is_current;
create index equipment_effect_review_queue_status_idx
  on public.equipment_effect_review_queue(status, requested_at, id)
  where is_current;

alter table public.equipment_effect_documents enable row level security;
alter table public.equipment_effect_document_revisions enable row level security;
alter table public.equipment_effect_evidence enable row level security;
alter table public.equipment_effect_revision_evidence enable row level security;
alter table public.equipment_effect_review_queue enable row level security;

create policy equipment_effect_documents_admin_select
  on public.equipment_effect_documents for select to authenticated, service_role
  using ((select public.current_user_is_admin()) is true);
create policy equipment_effect_documents_admin_insert
  on public.equipment_effect_documents for insert to authenticated, service_role
  with check ((select public.current_user_is_admin()) is true);
create policy equipment_effect_documents_admin_update
  on public.equipment_effect_documents for update to authenticated, service_role
  using ((select public.current_user_is_admin()) is true)
  with check ((select public.current_user_is_admin()) is true);

create policy equipment_effect_revisions_admin_select
  on public.equipment_effect_document_revisions for select to authenticated, service_role
  using ((select public.current_user_is_admin()) is true);
create policy equipment_effect_revisions_admin_insert
  on public.equipment_effect_document_revisions for insert to authenticated, service_role
  with check ((select public.current_user_is_admin()) is true);

create policy equipment_effect_evidence_admin_select
  on public.equipment_effect_evidence for select to authenticated, service_role
  using ((select public.current_user_is_admin()) is true);
create policy equipment_effect_evidence_admin_insert
  on public.equipment_effect_evidence for insert to authenticated, service_role
  with check ((select public.current_user_is_admin()) is true);

create policy equipment_effect_revision_evidence_admin_select
  on public.equipment_effect_revision_evidence for select to authenticated, service_role
  using ((select public.current_user_is_admin()) is true);
create policy equipment_effect_revision_evidence_admin_insert
  on public.equipment_effect_revision_evidence for insert to authenticated, service_role
  with check ((select public.current_user_is_admin()) is true);

create policy equipment_effect_review_queue_admin_select
  on public.equipment_effect_review_queue for select to authenticated, service_role
  using ((select public.current_user_is_admin()) is true);
create policy equipment_effect_review_queue_admin_insert
  on public.equipment_effect_review_queue for insert to authenticated, service_role
  with check ((select public.current_user_is_admin()) is true);
create policy equipment_effect_review_queue_admin_update
  on public.equipment_effect_review_queue for update to authenticated, service_role
  using ((select public.current_user_is_admin()) is true)
  with check ((select public.current_user_is_admin()) is true);

revoke all on table public.equipment_effect_documents from public, anon;
revoke all on table public.equipment_effect_document_revisions from public, anon;
revoke all on table public.equipment_effect_evidence from public, anon;
revoke all on table public.equipment_effect_revision_evidence from public, anon;
revoke all on table public.equipment_effect_review_queue from public, anon;

grant select, insert, update on table public.equipment_effect_documents to authenticated, service_role;
grant select, insert on table public.equipment_effect_document_revisions to authenticated, service_role;
grant select, insert on table public.equipment_effect_evidence to authenticated, service_role;
grant select, insert on table public.equipment_effect_revision_evidence to authenticated, service_role;
grant select, insert, update on table public.equipment_effect_review_queue to authenticated, service_role;

create or replace function public.equipment_effect_central_write_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_setting('app.equipment_effect_central_write_v1', true) is distinct from 'rpc' then
    raise exception 'equipment_effect_central_rpc_required' using errcode = '42501';
  end if;
  if (select public.current_user_is_admin()) is not true then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.equipment_effect_central_immutable_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_setting('app.equipment_effect_central_write_v1', true) is distinct from 'rpc' then
    raise exception 'equipment_effect_central_rpc_required' using errcode = '42501';
  end if;
  if (select public.current_user_is_admin()) is not true then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'equipment_effect_evidence_and_revisions_are_immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger equipment_effect_documents_write_guard
before insert or update or delete on public.equipment_effect_documents
for each row execute function public.equipment_effect_central_write_guard_v1();
create trigger equipment_effect_revisions_immutable_guard
before insert or update or delete on public.equipment_effect_document_revisions
for each row execute function public.equipment_effect_central_immutable_guard_v1();
create trigger equipment_effect_evidence_immutable_guard
before insert or update or delete on public.equipment_effect_evidence
for each row execute function public.equipment_effect_central_immutable_guard_v1();
create trigger equipment_effect_revision_evidence_immutable_guard
before insert or update or delete on public.equipment_effect_revision_evidence
for each row execute function public.equipment_effect_central_immutable_guard_v1();
create trigger equipment_effect_review_queue_write_guard
before insert or update or delete on public.equipment_effect_review_queue
for each row execute function public.equipment_effect_central_write_guard_v1();

create or replace function public.equipment_effect_payload_has_forbidden_key_v1(p_payload jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$
  with recursive nodes(value) as (
    select p_payload
    union all
    select child.value
    from nodes n
    cross join lateral (
      select e.value
      from jsonb_each(case when jsonb_typeof(n.value) = 'object' then n.value else '{}'::jsonb end) e
      union all
      select a.value
      from jsonb_array_elements(case when jsonb_typeof(n.value) = 'array' then n.value else '[]'::jsonb end) a
    ) child
  )
  select exists (
    select 1
    from nodes n
    cross join lateral jsonb_object_keys(
      case when jsonb_typeof(n.value) = 'object' then n.value else '{}'::jsonb end
    ) as keys(key)
    where lower(key) = any(array[
      'applied', 'is_applied', 'executed', 'execution_result', 'execution_status',
      'final_value', 'computed_value', 'computed_total', 'calculated_value',
      'formula', 'expression', 'script', 'sql', 'numeric_authority'
    ])
  );
$$;

create or replace function public.equipment_effect_builtin_capability_v1(p_target text)
returns jsonb
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$
  select case p_target
    when 'health_capacity' then '{"pairs":["add:health_point","relative_percent:percent"]}'::jsonb
    when 'armor_capacity' then '{"pairs":["add:armor_point","relative_percent:percent"]}'::jsonb
    when 'health_regeneration_rate' then '{"pairs":["add:health_point_per_second","relative_percent:percent"]}'::jsonb
    when 'armor_regeneration_rate' then '{"pairs":["add:armor_point_per_second","relative_percent:percent"]}'::jsonb
    when 'ability_heal_amount' then '{"pairs":["add:health_point","relative_percent:percent"],"conditions":["ability_active","after_event","unknown","unsupported"]}'::jsonb
    when 'penetration_power' then '{"pairs":["add:penetration_point","relative_percent:percent"]}'::jsonb
    when 'armor_penetration' then '{"pairs":["percentage_points:percentage_point","relative_percent:percent"]}'::jsonb
    when 'reload_duration' then '{"pairs":["add:second","relative_percent:percent"]}'::jsonb
    when 'aim_duration' then '{"pairs":["add:second","relative_percent:percent"]}'::jsonb
    when 'crate_open_duration' then '{"pairs":["add:second","relative_percent:percent"]}'::jsonb
    when 'ability_duration' then '{"pairs":["add:second","relative_percent:percent"],"conditions":["ability_active","after_event","unknown","unsupported"]}'::jsonb
    when 'ability_cooldown_duration' then '{"pairs":["add:second","relative_percent:percent"]}'::jsonb
    when 'weapon_mode_switch_duration' then '{"pairs":["add:second","relative_percent:percent"]}'::jsonb
    when 'movement_noise' then '{"pairs":["add:noise_unit","relative_percent:percent"]}'::jsonb
    when 'vision_range' then '{"pairs":["add:distance_unit","relative_percent:percent"]}'::jsonb
    when 'aimed_range' then '{"pairs":["add:distance_unit","relative_percent:percent"]}'::jsonb
    when 'magazine_capacity' then '{"pairs":["add:ammo_round","relative_percent:percent"]}'::jsonb
    when 'movement_speed' then '{"pairs":["add:distance_unit_per_second","relative_percent:percent"]}'::jsonb
    when 'aimed_movement_speed' then '{"pairs":["add:distance_unit_per_second","relative_percent:percent"]}'::jsonb
    when 'weapon_damage_to_health' then '{"pairs":["relative_percent:percent","multiply:multiplier"]}'::jsonb
    when 'weapon_damage_to_armor' then '{"pairs":["relative_percent:percent","multiply:multiplier"]}'::jsonb
    when 'shots_per_second' then '{"pairs":["add:shot_per_second","relative_percent:percent"]}'::jsonb
    when 'fire_interval' then '{"pairs":["add:second","relative_percent:percent"]}'::jsonb
    else null
  end;
$$;

create or replace function public.equipment_effect_issue_v1(
  p_path text,
  p_code text,
  p_message text,
  p_severity text default 'error'
)
returns jsonb
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'path', p_path,
    'code', p_code,
    'message', p_message,
    'severity', p_severity
  );
$$;

create or replace function public.validate_equipment_effect_document_draft_v1(
  p_payload jsonb,
  p_subject_kind text,
  p_subject_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_effect jsonb;
  v_source jsonb;
  v_capability jsonb;
  v_support text;
  v_target text;
  v_operation text;
  v_unit text;
  v_condition text;
  v_effect_ids text[] := '{}';
  v_index integer := 0;
  v_source_index integer;
  v_path text;
  v_expected integer;
  v_state text;
begin
  if (select public.current_user_is_admin()) is not true then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;

  if p_subject_kind is null
    or p_subject_kind not in ('equipment', 'equipment_variant', 'set_bonus')
    or p_subject_id is null then
    v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
      'subject', 'invalid_subject', 'Sujeito persistente inválido.'
    ));
  end if;

  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' then
    v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
      '$', 'document_object_required', 'O contrato deve ser um objeto JSON.'
    ));
    return jsonb_build_object(
      'valid', false,
      'state', 'invalid',
      'errors', v_errors,
      'warnings', v_warnings,
      'numeric_authority', jsonb_build_object(
        'enabled', false, 'phase', '2C.1',
        'reason', 'phase_3_numeric_authority_required'
      )
    );
  end if;

  if public.equipment_effect_payload_has_forbidden_key_v1(p_payload) then
    v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
      '$', 'execution_or_formula_field_forbidden',
      'O cadastro não aceita fórmula, código nem resultado de execução.'
    ));
  end if;

  if p_payload->>'contract_version' is distinct from 'echo-equipment-effects/v1' then
    v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
      'contract_version', 'unsupported_contract_version',
      'Versão desconhecida preservada sem downgrade.'
    ));
  end if;
  if p_payload->>'registry_revision' is distinct from 'echo-equipment-effects/v1:builtins-1' then
    v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
      'registry_revision', 'registry_revision_mismatch',
      'A revisão do registro não está instalada no servidor.'
    ));
  end if;
  if nullif(btrim(coalesce(p_payload->>'document_id', '')), '') is null then
    v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
      'document_id', 'document_id_required', 'document_id é obrigatório.'
    ));
  end if;
  if nullif(btrim(coalesce(p_payload->>'data_revision', '')), '') is null then
    v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
      'data_revision', 'data_revision_required', 'data_revision é obrigatória.'
    ));
  end if;
  if nullif(btrim(coalesce(p_payload->>'ruleset_revision', '')), '') is null then
    v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
      'ruleset_revision', 'ruleset_revision_required', 'ruleset_revision é obrigatória.'
    ));
  end if;

  if jsonb_typeof(p_payload->'subject') <> 'object'
    or p_payload#>>'{subject,kind}' is distinct from p_subject_kind
    or p_payload#>>'{subject,id}' is distinct from p_subject_id::text then
    v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
      'subject', 'subject_mismatch', 'O sujeito do contrato não corresponde ao registro selecionado.'
    ));
  end if;

  if p_payload ? 'expected_effect_count' and jsonb_typeof(p_payload->'expected_effect_count') <> 'null' then
    if jsonb_typeof(p_payload->'expected_effect_count') <> 'number'
      or (p_payload->>'expected_effect_count') !~ '^\d+$'
      or length(p_payload->>'expected_effect_count') > 9 then
      v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
        'expected_effect_count', 'invalid_expected_effect_count',
        'A contagem esperada deve ser inteiro não negativo ou null.'
      ));
    else
      v_expected := (p_payload->>'expected_effect_count')::integer;
    end if;
  end if;

  if jsonb_typeof(p_payload->'effects') is distinct from 'array' then
    v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
      'effects', 'effects_array_required', 'effects deve ser uma lista.'
    ));
  else
    if v_expected is not null and jsonb_array_length(p_payload->'effects') > v_expected then
      v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
        'expected_effect_count', 'represented_effects_exceed_expected',
        'Há mais efeitos representados que a contagem esperada.'
      ));
    end if;

    for v_effect in select value from jsonb_array_elements(p_payload->'effects') loop
      v_path := format('effects[%s]', v_index);
      if jsonb_typeof(v_effect) <> 'object' then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path, 'effect_object_required', 'Cada efeito deve ser um objeto.'
        ));
        v_index := v_index + 1;
        continue;
      end if;

      if nullif(btrim(coalesce(v_effect->>'effect_id', '')), '') is null then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path || '.effect_id', 'effect_id_required', 'effect_id é obrigatório.'
        ));
      elsif (v_effect->>'effect_id') = any(v_effect_ids) then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path || '.effect_id', 'duplicate_effect_id', 'effect_id deve ser único no documento.'
        ));
      else
        v_effect_ids := array_append(v_effect_ids, v_effect->>'effect_id');
      end if;

      if jsonb_typeof(v_effect->'effect_revision') is distinct from 'number'
        or (v_effect->>'effect_revision') !~ '^\d+$'
        or length(v_effect->>'effect_revision') > 9 then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path || '.effect_revision', 'invalid_effect_revision',
          'effect_revision deve ser inteiro positivo.'
        ));
      elsif (v_effect->>'effect_revision')::numeric < 1 then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path || '.effect_revision', 'invalid_effect_revision',
          'effect_revision deve ser inteiro positivo.'
        ));
      end if;

      if jsonb_typeof(v_effect->'origin') <> 'object'
        or v_effect#>>'{origin,kind}' is distinct from p_subject_kind
        or v_effect#>>'{origin,id}' is null
        or (p_subject_kind = 'equipment' and v_effect#>>'{origin,equipment_id}' is distinct from p_subject_id::text)
        or (p_subject_kind = 'equipment_variant' and v_effect#>>'{origin,variant_id}' is distinct from p_subject_id::text)
        or (p_subject_kind = 'set_bonus' and v_effect#>>'{origin,set_id}' is null) then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path || '.origin', 'origin_mismatch', 'A origem precisa identificar o sujeito do documento.'
        ));
      end if;

      v_support := v_effect#>>'{support,status}';
      if v_support is null or v_support not in ('supported', 'pending') then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path || '.support.status', 'invalid_support_status',
          'support.status deve ser supported ou pending.'
        ));
      elsif v_support = 'pending' and nullif(btrim(coalesce(v_effect#>>'{support,reason_code}', '')), '') is null then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path || '.support.reason_code', 'pending_reason_required',
          'Pendência exige motivo explícito.'
        ));
      end if;

      v_target := nullif(v_effect->>'target', '');
      v_operation := nullif(v_effect->>'operation', '');
      v_unit := nullif(v_effect->>'unit', '');
      v_capability := public.equipment_effect_builtin_capability_v1(v_target);

      if v_support = 'supported' and (
        v_target is null or v_operation is null or v_unit is null
        or jsonb_typeof(v_effect->'value') is distinct from 'number'
      ) then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path, 'supported_effect_requires_semantics',
          'Efeito suportado exige alvo, operação, valor e unidade explícitos.'
        ));
      end if;

      if v_target is not null and v_capability is null then
        if v_support = 'pending' then
          v_warnings := v_warnings || jsonb_build_array(public.equipment_effect_issue_v1(
            v_path || '.target', 'unknown_target',
            'Alvo não registrado; preservado como pendência.', 'warning'
          ));
        else
          v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
            v_path || '.target', 'unknown_target', 'Alvo não registrado na revisão instalada.'
          ));
        end if;
      end if;

      if v_operation is not null and v_operation not in (
        'add', 'relative_percent', 'percentage_points', 'multiply'
      ) then
        if v_support = 'pending' then
          v_warnings := v_warnings || jsonb_build_array(public.equipment_effect_issue_v1(
            v_path || '.operation', 'unknown_operation',
            'Operação não registrada; preservada como pendência.', 'warning'
          ));
        else
          v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
            v_path || '.operation', 'unknown_operation', 'Operação não registrada.'
          ));
        end if;
      end if;

      if v_effect ? 'value' and jsonb_typeof(v_effect->'value') not in ('number', 'null') then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path || '.value', 'value_must_be_json_number',
          'Valor deve ser número JSON; strings não são aceitas.'
        ));
      end if;

      if v_unit is not null and v_unit not in (
        'health_point', 'armor_point', 'health_point_per_second', 'armor_point_per_second',
        'second', 'percent', 'percentage_point', 'multiplier', 'penetration_point',
        'distance_unit', 'distance_unit_per_second', 'ammo_round', 'shot_per_second', 'noise_unit'
      ) then
        if v_support = 'pending' then
          v_warnings := v_warnings || jsonb_build_array(public.equipment_effect_issue_v1(
            v_path || '.unit', 'unknown_unit',
            'Unidade não registrada; preservada como pendência.', 'warning'
          ));
        else
          v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
            v_path || '.unit', 'unknown_unit', 'Unidade não registrada.'
          ));
        end if;
      end if;

      if v_capability is not null and v_operation is not null and v_unit is not null
        and not ((v_capability->'pairs') ? (v_operation || ':' || v_unit)) then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path || '.unit', 'unit_or_operation_incompatible_with_target',
          'Operação e unidade não correspondem à grandeza selecionada.'
        ));
      end if;

      if jsonb_typeof(v_effect->'condition') <> 'object'
        or v_effect#>>'{condition,kind}' is null
        or v_effect#>>'{condition,kind}' not in (
          'always', 'ability_active', 'after_event', 'mode_active', 'state_active', 'unknown', 'unsupported'
        ) then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path || '.condition', 'invalid_condition', 'Condição precisa ser explícita e registrada.'
        ));
      else
        v_condition := v_effect#>>'{condition,kind}';
        if v_capability ? 'conditions' and not ((v_capability->'conditions') ? v_condition) then
          v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
            v_path || '.condition.kind', 'condition_incompatible_with_target',
            'A condição não corresponde à grandeza selecionada.'
          ));
        end if;
      end if;

      if jsonb_typeof(v_effect->'duration') <> 'object'
        or v_effect#>>'{duration,kind}' is null
        or v_effect#>>'{duration,kind}' not in ('not_applicable', 'while_condition', 'known', 'unknown') then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path || '.duration', 'invalid_duration', 'Duração precisa ser explícita e registrada.'
        ));
      end if;
      if jsonb_typeof(v_effect->'scope') <> 'object'
        or v_effect#>>'{scope,kind}' is null
        or v_effect#>>'{scope,kind}' not in ('global', 'restricted') then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path || '.scope', 'invalid_scope', 'Escopo precisa ser global ou restrito.'
        ));
      end if;
      if jsonb_typeof(v_effect->'stacking') <> 'object'
        or v_effect#>>'{stacking,rule}' is null
        or v_effect#>>'{stacking,rule}' not in (
          'independent', 'additive', 'multiplicative', 'highest', 'lowest', 'replace', 'unknown'
        )
        or v_effect#>>'{stacking,tier_semantics}' is null
        or v_effect#>>'{stacking,tier_semantics}' not in (
          'not_applicable', 'incremental', 'cumulative_total', 'unknown'
        ) then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path || '.stacking', 'invalid_stacking', 'Empilhamento e patamar precisam ser explícitos.'
        ));
      end if;

      if nullif(btrim(coalesce(v_effect->>'original_text', '')), '') is null then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path || '.original_text', 'original_text_required',
          'Preserve o texto original da fonte.'
        ));
      end if;

      if jsonb_typeof(v_effect->'provenance') <> 'object'
        or v_effect#>>'{provenance,verification_status}' is null
        or v_effect#>>'{provenance,verification_status}' not in (
          'confirmed', 'partially_confirmed', 'unverified', 'disputed'
        ) then
        v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
          v_path || '.provenance', 'invalid_provenance', 'Proveniência precisa ser explícita.'
        ));
      else
        if v_support = 'supported' and v_effect#>>'{provenance,verification_status}' <> 'confirmed' then
          v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
            v_path || '.provenance.verification_status', 'supported_effect_requires_confirmed_source',
            'Efeito suportado exige fonte confirmada.'
          ));
        end if;
        if v_support = 'supported'
          and nullif(btrim(coalesce(v_effect#>>'{provenance,verified_at}', '')), '') is null then
          v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
            v_path || '.provenance.verified_at', 'supported_effect_requires_verification_date',
            'Efeito suportado exige data de verificação.'
          ));
        end if;
        if jsonb_typeof(v_effect#>'{provenance,sources}') <> 'array'
          or jsonb_array_length(coalesce(v_effect#>'{provenance,sources}', '[]'::jsonb)) = 0 then
          v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
            v_path || '.provenance.sources', 'provenance_source_required',
            'Preserve ao menos uma fonte.'
          ));
        else
          v_source_index := 0;
          for v_source in select value from jsonb_array_elements(v_effect#>'{provenance,sources}') loop
            if jsonb_typeof(v_source) <> 'object'
              or v_source->>'kind' is null
              or v_source->>'kind' not in (
                'official', 'game_screenshot', 'catalog', 'historical_audit',
                'admin_entry', 'migration', 'unknown'
              )
              or nullif(btrim(coalesce(v_source->>'reference', '')), '') is null then
              v_errors := v_errors || jsonb_build_array(public.equipment_effect_issue_v1(
                format('%s.provenance.sources[%s]', v_path, v_source_index),
                'invalid_provenance_source', 'Fonte exige tipo e referência.'
              ));
            end if;
            v_source_index := v_source_index + 1;
          end loop;
        end if;
      end if;

      v_index := v_index + 1;
    end loop;
  end if;

  v_state := case
    when p_payload->>'contract_version' is distinct from 'echo-equipment-effects/v1' then 'unknown_version'
    when p_payload->>'registry_revision' is distinct from 'echo-equipment-effects/v1:builtins-1' then 'unknown_registry'
    when jsonb_array_length(v_errors) > 0 then 'invalid'
    else 'valid'
  end;

  return jsonb_build_object(
    'valid', jsonb_array_length(v_errors) = 0,
    'state', v_state,
    'errors', v_errors,
    'warnings', v_warnings,
    'numeric_authority', jsonb_build_object(
      'enabled', false, 'phase', '2C.1',
      'reason', 'phase_3_numeric_authority_required'
    )
  );
end;
$$;

create or replace function public.admin_save_equipment_effect_draft_v1(
  p_subject_kind text,
  p_subject_id uuid,
  p_payload jsonb,
  p_evidence jsonb default '[]'::jsonb,
  p_document_id uuid default null,
  p_source text default 'admin-effect-central'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_document public.equipment_effect_documents%rowtype;
  v_revision public.equipment_effect_document_revisions%rowtype;
  v_validation jsonb;
  v_validation_state text;
  v_evidence_state text := 'complete';
  v_evidence_errors jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_evidence_id uuid;
  v_source_reference text;
  v_revision_number integer;
  v_content_sha256 text;
  v_is_duplicate boolean := false;
begin
  if (select public.current_user_is_admin()) is not true then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;
  if p_subject_kind is null
    or p_subject_kind not in ('equipment', 'equipment_variant', 'set_bonus')
    or p_subject_id is null then
    raise exception 'Sujeito inválido' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_evidence, '[]'::jsonb)) <> 'array' then
    raise exception 'evidence precisa ser uma lista JSON' using errcode = '22023';
  end if;
  if p_payload is null then
    raise exception 'payload precisa ser um objeto JSON' using errcode = '22023';
  end if;

  if p_subject_kind = 'equipment' and not exists (
    select 1 from public.equipments where id = p_subject_id
  ) then
    raise exception 'Equipamento não encontrado' using errcode = 'P0002';
  elsif p_subject_kind = 'equipment_variant' and not exists (
    select 1 from public.equipment_variants where id = p_subject_id
  ) then
    raise exception 'Variante não encontrada' using errcode = 'P0002';
  elsif p_subject_kind = 'set_bonus' and not exists (
    select 1 from public.equipment_set_bonuses where id = p_subject_id
  ) then
    raise exception 'Bônus de conjunto não encontrado' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_subject_kind), hashtext(p_subject_id::text));
  perform set_config('app.equipment_effect_central_write_v1', 'rpc', true);

  if p_document_id is not null then
    select * into v_document
    from public.equipment_effect_documents
    where id = p_document_id
    for update;
    if not found then
      raise exception 'Documento não encontrado' using errcode = 'P0002';
    end if;
    if v_document.subject_kind <> p_subject_kind
      or (p_subject_kind = 'equipment' and v_document.equipment_id <> p_subject_id)
      or (p_subject_kind = 'equipment_variant' and v_document.variant_id <> p_subject_id)
      or (p_subject_kind = 'set_bonus' and v_document.set_bonus_id <> p_subject_id) then
      raise exception 'Documento não corresponde ao sujeito selecionado' using errcode = '22023';
    end if;
  else
    select * into v_document
    from public.equipment_effect_documents d
    where (p_subject_kind = 'equipment' and d.subject_kind = p_subject_kind and d.equipment_id = p_subject_id)
       or (p_subject_kind = 'equipment_variant' and d.subject_kind = p_subject_kind and d.variant_id = p_subject_id)
       or (p_subject_kind = 'set_bonus' and d.subject_kind = p_subject_kind and d.set_bonus_id = p_subject_id)
    for update;

    if not found then
      insert into public.equipment_effect_documents(
        subject_kind, equipment_id, variant_id, set_bonus_id
      ) values (
        p_subject_kind,
        case when p_subject_kind = 'equipment' then p_subject_id end,
        case when p_subject_kind = 'equipment_variant' then p_subject_id end,
        case when p_subject_kind = 'set_bonus' then p_subject_id end
      ) returning * into v_document;
    end if;
  end if;

  v_validation := public.validate_equipment_effect_document_draft_v1(
    p_payload, p_subject_kind, p_subject_id
  );
  v_validation_state := v_validation->>'state';

  if jsonb_array_length(coalesce(p_evidence, '[]'::jsonb)) = 0 then
    v_evidence_state := 'incomplete';
    v_evidence_errors := v_evidence_errors || jsonb_build_array(public.equipment_effect_issue_v1(
      'evidence', 'persistent_evidence_required',
      'Ao menos uma evidência persistente, com SHA-256, é obrigatória para revisão.'
    ));
  end if;

  for v_entry in select value from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) loop
    if jsonb_typeof(v_entry) <> 'object'
      or v_entry->>'source_kind' is null
      or v_entry->>'source_kind' not in (
        'official', 'game_screenshot', 'catalog', 'historical_audit',
        'admin_entry', 'migration', 'unknown'
      )
      or nullif(btrim(coalesce(v_entry->>'source_reference', '')), '') is null
      or lower(coalesce(v_entry->>'file_sha256', '')) !~ '^[a-f0-9]{64}$'
      or (v_entry ? 'metadata' and jsonb_typeof(v_entry->'metadata') <> 'object') then
      v_evidence_state := 'incomplete';
      v_evidence_errors := v_evidence_errors || jsonb_build_array(public.equipment_effect_issue_v1(
        'evidence', 'invalid_persistent_evidence',
        'Evidência exige tipo, referência, SHA-256 e metadados JSON válidos.'
      ));
    end if;
  end loop;

  for v_source_reference in
    select distinct source.value->>'reference'
    from jsonb_array_elements(
      case when jsonb_typeof(p_payload->'effects') = 'array'
        then p_payload->'effects' else '[]'::jsonb end
    ) effect
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(effect.value#>'{provenance,sources}') = 'array'
        then effect.value#>'{provenance,sources}' else '[]'::jsonb end
    ) source
    where nullif(btrim(coalesce(source.value->>'reference', '')), '') is not null
  loop
    if not exists (
      select 1
      from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) evidence
      where evidence.value->>'source_reference' = v_source_reference
        and lower(coalesce(evidence.value->>'file_sha256', '')) ~ '^[a-f0-9]{64}$'
    ) then
      v_evidence_state := 'incomplete';
      v_evidence_errors := v_evidence_errors || jsonb_build_array(public.equipment_effect_issue_v1(
        'evidence', 'effect_source_not_persisted',
        'Cada referência de fonte usada por um efeito exige evidência persistente correspondente.'
      ));
    end if;
  end loop;

  v_content_sha256 := encode(extensions.digest(convert_to(jsonb_build_object(
    'payload', p_payload,
    'evidence', coalesce(p_evidence, '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex');

  if v_document.current_revision_id is not null then
    select * into v_revision
    from public.equipment_effect_document_revisions
    where id = v_document.current_revision_id;
    v_is_duplicate := v_revision.content_sha256 = v_content_sha256;
  end if;

  if not v_is_duplicate then
    v_revision_number := v_document.current_revision_number + 1;
    insert into public.equipment_effect_document_revisions(
      document_id, revision, contract_version, registry_revision,
      payload, evidence_manifest, content_sha256, validation_state,
      evidence_state, validation_issues, source
    ) values (
      v_document.id,
      v_revision_number,
      p_payload->>'contract_version',
      p_payload->>'registry_revision',
      p_payload,
      coalesce(p_evidence, '[]'::jsonb),
      v_content_sha256,
      v_validation_state,
      v_evidence_state,
      jsonb_build_object(
        'contract', v_validation,
        'evidence', jsonb_build_object(
          'state', v_evidence_state,
          'errors', v_evidence_errors
        )
      ),
      coalesce(nullif(btrim(p_source), ''), 'admin-effect-central')
    ) returning * into v_revision;

    for v_entry in select value from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) loop
      if jsonb_typeof(v_entry) = 'object'
        and v_entry->>'source_kind' is not null
        and v_entry->>'source_kind' in (
          'official', 'game_screenshot', 'catalog', 'historical_audit',
          'admin_entry', 'migration', 'unknown'
        )
        and nullif(btrim(coalesce(v_entry->>'source_reference', '')), '') is not null
        and lower(coalesce(v_entry->>'file_sha256', '')) ~ '^[a-f0-9]{64}$'
        and (not (v_entry ? 'metadata') or jsonb_typeof(v_entry->'metadata') = 'object') then
        v_evidence_id := null;
        insert into public.equipment_effect_evidence(
          source_kind, source_reference, source_uri, file_sha256,
          observed_at, game_revision, excerpt, metadata
        ) values (
          v_entry->>'source_kind',
          btrim(v_entry->>'source_reference'),
          nullif(btrim(coalesce(v_entry->>'source_uri', '')), ''),
          lower(v_entry->>'file_sha256'),
          nullif(btrim(coalesce(v_entry->>'observed_at', '')), ''),
          nullif(btrim(coalesce(v_entry->>'game_revision', '')), ''),
          nullif(v_entry->>'excerpt', ''),
          coalesce(v_entry->'metadata', '{}'::jsonb)
        ) on conflict do nothing
        returning id into v_evidence_id;

        if v_evidence_id is null then
          select e.id into v_evidence_id
          from public.equipment_effect_evidence e
          where e.file_sha256 = lower(v_entry->>'file_sha256')
            and e.source_reference = btrim(v_entry->>'source_reference')
            and e.source_uri is not distinct from nullif(btrim(coalesce(v_entry->>'source_uri', '')), '');
        end if;

        insert into public.equipment_effect_revision_evidence(revision_id, evidence_id)
        values (v_revision.id, v_evidence_id)
        on conflict do nothing;
      end if;
    end loop;

    update public.equipment_effect_review_queue
    set is_current = false,
        superseded_at = now(),
        updated_at = now()
    where document_id = v_document.id and is_current;

    update public.equipment_effect_documents
    set current_revision_id = v_revision.id,
        current_revision_number = v_revision_number,
        workflow_status = 'draft',
        updated_at = now()
    where id = v_document.id
    returning * into v_document;
  end if;

  perform set_config('app.equipment_effect_central_write_v1', '', true);
  return jsonb_build_object(
    'document_id', v_document.id,
    'revision_id', v_revision.id,
    'revision', v_revision.revision,
    'created_revision', not v_is_duplicate,
    'workflow_status', v_document.workflow_status,
    'validation_state', v_revision.validation_state,
    'evidence_state', v_revision.evidence_state,
    'validation_issues', v_revision.validation_issues,
    'numeric_authority', jsonb_build_object(
      'enabled', false, 'phase', '2C.1',
      'reason', 'phase_3_numeric_authority_required'
    )
  );
end;
$$;

create or replace function public.admin_request_equipment_effect_review_v1(
  p_revision_id uuid,
  p_reason text,
  p_impact text,
  p_required_action text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_revision public.equipment_effect_document_revisions%rowtype;
  v_document public.equipment_effect_documents%rowtype;
  v_review public.equipment_effect_review_queue%rowtype;
  v_subject_id uuid;
  v_validation jsonb;
  v_created_review boolean := false;
begin
  if (select public.current_user_is_admin()) is not true then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null
    or nullif(btrim(coalesce(p_impact, '')), '') is null
    or nullif(btrim(coalesce(p_required_action, '')), '') is null then
    raise exception 'Motivo, impacto e ação necessária são obrigatórios' using errcode = '22023';
  end if;

  select * into v_revision
  from public.equipment_effect_document_revisions
  where id = p_revision_id;
  if not found then
    raise exception 'Revisão não encontrada' using errcode = 'P0002';
  end if;

  select * into v_document
  from public.equipment_effect_documents
  where id = v_revision.document_id
  for update;
  if v_document.current_revision_id <> v_revision.id then
    raise exception 'Somente a revisão atual pode entrar na fila' using errcode = '55000';
  end if;

  v_subject_id := case v_document.subject_kind
    when 'equipment' then v_document.equipment_id
    when 'equipment_variant' then v_document.variant_id
    when 'set_bonus' then v_document.set_bonus_id
  end;
  v_validation := public.validate_equipment_effect_document_draft_v1(
    v_revision.payload, v_document.subject_kind, v_subject_id
  );
  if (v_validation->>'valid')::boolean is not true
    or v_revision.validation_state <> 'valid' then
    raise exception 'Revisão inválida ou com contrato desconhecido' using errcode = '22023';
  end if;
  if v_revision.evidence_state <> 'complete'
    or not exists (
      select 1 from public.equipment_effect_revision_evidence
      where revision_id = v_revision.id
    ) then
    raise exception 'Evidência persistente completa é obrigatória' using errcode = '22023';
  end if;

  perform set_config('app.equipment_effect_central_write_v1', 'rpc', true);

  select * into v_review
  from public.equipment_effect_review_queue
  where revision_id = v_revision.id;

  if not found then
    update public.equipment_effect_review_queue
    set is_current = false, superseded_at = now(), updated_at = now()
    where document_id = v_document.id and is_current;

    insert into public.equipment_effect_review_queue(
      document_id, revision_id, status, reason, impact, required_action
    ) values (
      v_document.id, v_revision.id, 'pending',
      btrim(p_reason), btrim(p_impact), btrim(p_required_action)
    ) returning * into v_review;
    v_created_review := true;
  elsif not v_review.is_current then
    raise exception 'Solicitação de revisão já foi substituída' using errcode = '55000';
  elsif v_review.status in ('approved', 'changes_requested') then
    raise exception 'A revisão atual já recebeu decisão' using errcode = '55000';
  end if;

  update public.equipment_effect_documents
  set workflow_status = 'in_review', updated_at = now()
  where id = v_document.id;

  perform set_config('app.equipment_effect_central_write_v1', '', true);
  return jsonb_build_object(
    'review_id', v_review.id,
    'revision_id', v_revision.id,
    'status', v_review.status,
    'workflow_status', 'in_review',
    'created_review', v_created_review,
    'numeric_authority', jsonb_build_object('enabled', false, 'phase', '2C.1')
  );
end;
$$;

create or replace function public.admin_review_equipment_effect_revision_v1(
  p_revision_id uuid,
  p_decision text,
  p_review_note text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_review public.equipment_effect_review_queue%rowtype;
  v_document public.equipment_effect_documents%rowtype;
  v_revision public.equipment_effect_document_revisions%rowtype;
  v_subject_id uuid;
  v_validation jsonb;
  v_workflow text;
begin
  if (select public.current_user_is_admin()) is not true then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved', 'changes_requested') then
    raise exception 'Decisão deve ser approved ou changes_requested' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_review_note, '')), '') is null then
    raise exception 'Parecer de revisão é obrigatório' using errcode = '22023';
  end if;

  select * into v_review
  from public.equipment_effect_review_queue
  where revision_id = p_revision_id and is_current
  for update;
  if not found then
    raise exception 'Revisão atual não está na fila' using errcode = 'P0002';
  end if;
  if v_review.status not in ('pending', 'in_review') then
    raise exception 'A revisão atual já recebeu decisão' using errcode = '55000';
  end if;

  select * into v_revision
  from public.equipment_effect_document_revisions
  where id = p_revision_id;
  select * into v_document
  from public.equipment_effect_documents
  where id = v_review.document_id
  for update;

  if v_document.current_revision_id <> v_revision.id then
    raise exception 'A revisão foi substituída' using errcode = '55000';
  end if;
  v_subject_id := case v_document.subject_kind
    when 'equipment' then v_document.equipment_id
    when 'equipment_variant' then v_document.variant_id
    when 'set_bonus' then v_document.set_bonus_id
  end;
  v_validation := public.validate_equipment_effect_document_draft_v1(
    v_revision.payload, v_document.subject_kind, v_subject_id
  );
  if (v_validation->>'valid')::boolean is not true
    or v_revision.validation_state <> 'valid'
    or v_revision.evidence_state <> 'complete' then
    raise exception 'Revisão deixou de atender aos gates de validação' using errcode = '22023';
  end if;

  perform set_config('app.equipment_effect_central_write_v1', 'rpc', true);
  update public.equipment_effect_review_queue
  set status = p_decision,
      review_note = btrim(p_review_note),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = v_review.id
  returning * into v_review;

  v_workflow := case when p_decision = 'approved' then 'reviewed' else 'changes_requested' end;
  update public.equipment_effect_documents
  set workflow_status = v_workflow, updated_at = now()
  where id = v_document.id;

  perform set_config('app.equipment_effect_central_write_v1', '', true);
  return jsonb_build_object(
    'review_id', v_review.id,
    'revision_id', v_revision.id,
    'status', v_review.status,
    'workflow_status', v_workflow,
    'published', false,
    'numeric_authority', jsonb_build_object('enabled', false, 'phase', '2C.1')
  );
end;
$$;

create or replace function public.admin_list_equipment_effect_drafts_v1(p_equipment_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_documents jsonb;
begin
  if (select public.current_user_is_admin()) is not true then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;
  if not exists (select 1 from public.equipments where id = p_equipment_id) then
    raise exception 'Equipamento não encontrado' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'document_id', d.id,
      'subject_kind', d.subject_kind,
      'subject_id', case d.subject_kind
        when 'equipment' then d.equipment_id
        when 'equipment_variant' then d.variant_id
        when 'set_bonus' then d.set_bonus_id
      end,
      'workflow_status', d.workflow_status,
      'current_revision_number', d.current_revision_number,
      'current_revision', case when r.id is null then null else jsonb_build_object(
        'id', r.id,
        'revision', r.revision,
        'contract_version', r.contract_version,
        'registry_revision', r.registry_revision,
        'payload', r.payload,
        'evidence_manifest', r.evidence_manifest,
        'content_sha256', r.content_sha256,
        'validation_state', r.validation_state,
        'evidence_state', r.evidence_state,
        'validation_issues', r.validation_issues,
        'created_at', r.created_at
      ) end,
      'evidence', coalesce((
        select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
        from public.equipment_effect_revision_evidence re
        join public.equipment_effect_evidence e on e.id = re.evidence_id
        where re.revision_id = r.id
      ), '[]'::jsonb),
      'review', (
        select to_jsonb(q)
        from public.equipment_effect_review_queue q
        where q.document_id = d.id and q.is_current
        limit 1
      )
    ) order by d.updated_at desc, d.id
  ), '[]'::jsonb)
  into v_documents
  from public.equipment_effect_documents d
  left join public.equipment_effect_document_revisions r on r.id = d.current_revision_id
  left join public.equipment_variants ev on ev.id = d.variant_id
  left join public.equipment_set_bonuses sb on sb.id = d.set_bonus_id
  left join public.equipments se on se.set_id = sb.set_id
  where d.equipment_id = p_equipment_id
     or ev.equipment_id = p_equipment_id
     or se.id = p_equipment_id;

  return jsonb_build_object(
    'equipment_id', p_equipment_id,
    'documents', v_documents,
    'publication_available', false,
    'numeric_authority', jsonb_build_object(
      'enabled', false, 'phase', '2C.1',
      'reason', 'phase_3_numeric_authority_required'
    )
  );
end;
$$;

revoke all on function public.equipment_effect_central_write_guard_v1() from public, anon;
revoke all on function public.equipment_effect_central_immutable_guard_v1() from public, anon;
revoke all on function public.equipment_effect_payload_has_forbidden_key_v1(jsonb) from public, anon;
revoke all on function public.equipment_effect_builtin_capability_v1(text) from public, anon;
revoke all on function public.equipment_effect_issue_v1(text, text, text, text) from public, anon;
revoke all on function public.validate_equipment_effect_document_draft_v1(jsonb, text, uuid) from public, anon;
revoke all on function public.admin_save_equipment_effect_draft_v1(text, uuid, jsonb, jsonb, uuid, text) from public, anon;
revoke all on function public.admin_request_equipment_effect_review_v1(uuid, text, text, text) from public, anon;
revoke all on function public.admin_review_equipment_effect_revision_v1(uuid, text, text) from public, anon;
revoke all on function public.admin_list_equipment_effect_drafts_v1(uuid) from public, anon;

grant execute on function public.equipment_effect_payload_has_forbidden_key_v1(jsonb) to authenticated, service_role;
grant execute on function public.equipment_effect_builtin_capability_v1(text) to authenticated, service_role;
grant execute on function public.equipment_effect_issue_v1(text, text, text, text) to authenticated, service_role;
grant execute on function public.validate_equipment_effect_document_draft_v1(jsonb, text, uuid) to authenticated, service_role;
grant execute on function public.admin_save_equipment_effect_draft_v1(text, uuid, jsonb, jsonb, uuid, text) to authenticated, service_role;
grant execute on function public.admin_request_equipment_effect_review_v1(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.admin_review_equipment_effect_revision_v1(uuid, text, text) to authenticated, service_role;
grant execute on function public.admin_list_equipment_effect_drafts_v1(uuid) to authenticated, service_role;
