-- Cadastra recuo como mecânica própria e fornece uma base neutra documentada
-- para modificadores percentuais. Recuo não é sinônimo de dispersão.

begin;

alter table public.calculation_stat_definitions_v2
  add column default_base numeric;

alter table public.calculation_stat_definitions_v2
  add constraint calculation_stat_definitions_v2_default_base_check
  check (
    default_base is null
    or (
      default_base::text not in ('NaN', 'Infinity', '-Infinity')
      and abs(default_base) <= 1e308::numeric
    )
  );

comment on column public.calculation_stat_definitions_v2.default_base is
  'Optional documented neutral baseline used only when the source catalog has no physical per-hero base.';

insert into public.stat_definitions
  (key, name, category, unit, value_type, decimals, higher_is_better, description, display_order)
values
  (
    'weapon_recoil',
    'Recuo da arma',
    'weapon',
    '%',
    'percentage',
    2,
    false,
    'Índice relativo de recuo da arma. O valor neutro é 100; não representa dispersão, ângulo nem fator de dispersão.',
    260
  );

insert into public.calculation_stat_definitions_v2
  (id, label, scope, source_key, unit, direction, policy_reference, display_order, default_base)
values
  (
    'weapon.recoil',
    'Recuo da arma (índice relativo)',
    'weapon',
    'weapon_recoil',
    'percent',
    'lower',
    'Resultado = indice neutro 100 + valores fixos + (100 x soma dos percentuais / 100), sem equivalencia com dispersao.',
    260,
    100
  );

create or replace function public.calculation_definitions_json_v2()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'label', d.label,
    'scope', d.scope,
    'sourceKey', d.source_key,
    'unit', d.unit,
    'direction', d.direction,
    'defaultBase', d.default_base,
    'policy', jsonb_build_object(
      'id', d.policy_id,
      'reference', d.policy_reference,
      'rounding', 'none'
    )
  ) order by d.display_order, d.id), '[]'::jsonb)
  from public.calculation_stat_definitions_v2 d
  where d.enabled
$$;

do $$
declare
  v_definition jsonb;
begin
  select value
  into v_definition
  from jsonb_array_elements(public.calculation_definitions_json_v2())
  where value->>'id' = 'weapon.recoil';

  if v_definition is null then
    raise exception 'WEAPON_RECOIL_DEFINITION_MISSING';
  end if;

  if v_definition->>'sourceKey' <> 'weapon_recoil'
     or v_definition->>'unit' <> 'percent'
     or (v_definition->>'defaultBase')::numeric <> 100 then
    raise exception 'WEAPON_RECOIL_DEFINITION_INVALID';
  end if;

  if exists (
    select 1
    from public.calculation_stat_definitions_v2
    where id = 'weapon.recoil'
      and source_key = any(array[
        'weapon_spread', 'aimed_spread', 'moving_spread_modifier', 'spread_factor'
      ]::text[])
  ) then
    raise exception 'WEAPON_RECOIL_MUST_NOT_ALIAS_SPREAD';
  end if;
end;
$$;

commit;
