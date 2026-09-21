-- Backfill conservador dos efeitos já existentes que são conhecidos,
-- mas ainda não possuem base pública suficiente para cálculo.
-- Não altera atributos dos equipamentos; apenas registra o estado na Auditoria.

with source_rows as (
  select
    ev.equipment_id::text as equipment_id,
    e.name as equipment_name,
    er.slug as rarity_slug,
    er.name as rarity_name,
    attr->>'label' as attribute_key,
    attr->>'value' as attribute_value,
    case
      when lower(attr->>'label') = lower('VelocidadeParaPegarMelhoriasPercentual')
        then 'improvement_pickup_speed'
      when lower(attr->>'label') in (
        'crate_opening_cooldown_pct',
        'tempo de abertura de caixa',
        'tempo de abertura de caixas',
        'tempo para abrir caixa',
        'tempo para abrir caixas'
      ) then 'crate_opening_time'
      else null
    end as external_effect_id
  from public.equipment_variants ev
  join public.equipments e on e.id = ev.equipment_id
  left join public.equipment_rarities er on er.id = ev.rarity_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(ev.attributes) = 'array' then ev.attributes else '[]'::jsonb end
  ) attr
), mapped as (
  select *,
    case external_effect_id
      when 'improvement_pickup_speed' then 'Velocidade de coleta de melhorias'
      when 'crate_opening_time' then 'Tempo de abertura de caixas'
    end as human_label,
    case external_effect_id
      when 'improvement_pickup_speed' then 'Valor-base oficial da coleta de melhorias e sua regra exata de aplicação.'
      when 'crate_opening_time' then 'Valor-base oficial do tempo de abertura de caixas.'
    end as missing_data
  from source_rows
  where external_effect_id is not null
)
insert into public.equipment_audit_queue (
  equipment_id, equipment_name, issue_key, source, severity, issue_type, status,
  rarity_slug, rarity_name, attribute_key, attribute_value, normalized_key,
  suggested_target, suggested_operation, confidence, details, updated_at, resolved_at
)
select
  equipment_id,
  equipment_name,
  'external_data_required|' || coalesce(rarity_slug, 'raridade') || '|' || external_effect_id,
  'external-data-backfill',
  'info',
  'external_data_required',
  'pending',
  rarity_slug,
  rarity_name,
  attribute_key,
  attribute_value,
  'external:' || external_effect_id,
  human_label,
  'not_calculated',
  1,
  jsonb_build_object(
    'recognized', false,
    'external_data', true,
    'external_effect_id', external_effect_id,
    'human_label', human_label,
    'missing_data', missing_data,
    'external_reason', 'O efeito existe no equipamento, mas o jogo não disponibiliza publicamente uma base confiável para calcular o resultado final.'
  ),
  now(),
  null
from mapped
on conflict (equipment_id, issue_key) do update set
  equipment_name = excluded.equipment_name,
  source = excluded.source,
  severity = excluded.severity,
  issue_type = excluded.issue_type,
  status = 'pending',
  rarity_name = excluded.rarity_name,
  attribute_key = excluded.attribute_key,
  attribute_value = excluded.attribute_value,
  normalized_key = excluded.normalized_key,
  suggested_target = excluded.suggested_target,
  suggested_operation = excluded.suggested_operation,
  confidence = excluded.confidence,
  details = excluded.details,
  updated_at = now(),
  resolved_at = null;
