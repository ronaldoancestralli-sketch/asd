create or replace function public.admin_restore_content_version_v2(
  p_version_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_record admin_content_versions%rowtype;
  v_result jsonb;
begin
  if not (select current_user_is_admin()) then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;

  select * into v_record
  from admin_content_versions
  where id = p_version_id;

  if not found then
    raise exception 'Versão não encontrada' using errcode = 'P0002';
  end if;

  if v_record.entity_type = 'hero' then
    v_result := admin_save_hero_bundle_v2(
      v_record.entity_id,
      coalesce(v_record.snapshot->'hero', '{}'::jsonb),
      coalesce(v_record.snapshot->'base_stats', '{}'::jsonb),
      v_record.snapshot->>'weapon_name',
      coalesce(v_record.snapshot->'weapon_stats', '{}'::jsonb),
      true,
      true,
      'version-restore'
    );
  elsif v_record.entity_type = 'equipment' then
    v_result := admin_save_equipment_bundle_v2(
      v_record.entity_id,
      coalesce(v_record.snapshot->'equipment', '{}'::jsonb),
      coalesce(v_record.snapshot->'variants', '[]'::jsonb),
      coalesce(v_record.snapshot->'bonuses', '[]'::jsonb),
      true,
      true,
      'version-restore'
    );
  else
    raise exception 'Tipo de versão inválido' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'restored_version_id', v_record.id,
    'entity_type', v_record.entity_type,
    'entity_id', v_record.entity_id,
    'result', v_result
  );
end;
$$;

revoke all on function public.admin_restore_content_version_v2(uuid) from public, anon;
grant execute on function public.admin_restore_content_version_v2(uuid) to authenticated;