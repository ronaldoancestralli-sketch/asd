\set ON_ERROR_STOP on
select current_database() = 'equipment_effect_central_test' as isolated_database \gset
\if :isolated_database
\else
  \echo Refusing to run outside equipment_effect_central_test.
  \quit 1
\endif
begin;

insert into public.equipment_rarities(id, name, slug, rank) values
  ('10000000-0000-4000-8000-000000000001', 'Comum', 'comum', 1);
insert into public.equipment_sets(id, name) values
  ('20000000-0000-4000-8000-000000000001', 'Conjunto de teste');
insert into public.equipments(id, name, set_id) values
  ('30000000-0000-4000-8000-000000000001', 'Armadura Corporal', null),
  ('30000000-0000-4000-8000-000000000002', 'Bornal', null),
  ('30000000-0000-4000-8000-000000000003', 'Item sem fonte',
    '20000000-0000-4000-8000-000000000001');
insert into public.equipment_variants(id, equipment_id, rarity_id) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001');
insert into public.equipment_set_bonuses(id, set_id, required_pieces) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 2);

do $$
begin
  assert not has_function_privilege(
    'anon', 'public.admin_save_equipment_effect_draft_v1(text,uuid,jsonb,jsonb,uuid,text)', 'execute'
  ), 'anon must not execute the draft RPC';
  assert not has_function_privilege(
    'anon', 'public.admin_request_equipment_effect_review_v1(uuid,text,text,text)', 'execute'
  ), 'anon must not request review';
  assert not has_function_privilege(
    'anon', 'public.admin_review_equipment_effect_revision_v1(uuid,text,text)', 'execute'
  ), 'anon must not review';
  assert has_function_privilege(
    'authenticated', 'public.admin_save_equipment_effect_draft_v1(text,uuid,jsonb,jsonb,uuid,text)', 'execute'
  ), 'authenticated Admin needs the draft RPC';
  assert not has_table_privilege('anon', 'public.equipment_effect_documents', 'select'),
    'anon must not read the Central';
  assert not has_table_privilege(
    'authenticated', 'public.equipment_effect_document_revisions', 'update'
  ), 'immutable revisions must not be updateable';
  assert not has_table_privilege(
    'authenticated', 'public.equipment_effect_evidence', 'delete'
  ), 'immutable evidence must not be deleteable';
  assert not (
    select p.prosecdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_save_equipment_effect_draft_v1'
  ), 'draft RPC must be security invoker';
  assert (
    select c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'equipment_effect_documents'
  ), 'documents need RLS';
  assert not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin_publish_equipment_effect%'
  ), 'Phase 2C.1 must not expose publication';
end;
$$;

set local role authenticated;
select set_config('test.equipment_admin', 'true', true);
select set_config('test.user_id', '90000000-0000-4000-8000-000000000001', true);

-- Even an authenticated administrator cannot bypass row-level guards by using
-- TRUNCATE. Run only in the disposable database; no production catalog is used.
do $$
declare v_failed boolean := false;
begin
  begin
    truncate table public.equipment_effect_documents,
      public.equipment_effect_document_revisions,
      public.equipment_effect_evidence,
      public.equipment_effect_revision_evidence,
      public.equipment_effect_review_queue;
  exception when insufficient_privilege then
    v_failed := true;
  end;
  assert v_failed, 'TRUNCATE must fail at the ACL boundary, even for an admin';
end;
$$;

do $$
declare
  v_body_variant constant uuid := '40000000-0000-4000-8000-000000000001';
  v_pouch_variant constant uuid := '40000000-0000-4000-8000-000000000002';
  v_missing_bonus constant uuid := '50000000-0000-4000-8000-000000000001';
  v_body jsonb;
  v_body_r2 jsonb;
  v_pouch jsonb;
  v_unknown jsonb;
  v_empty jsonb;
  v_evidence jsonb;
  v_response jsonb;
  v_review jsonb;
  v_document_id uuid;
  v_revision_id uuid;
  v_old_revision_id uuid;
  v_missing_revision_id uuid;
  v_unknown_revision_id uuid;
  v_failed boolean;
begin
  v_failed := false;
  begin
    insert into public.equipment_effect_documents(subject_kind, variant_id)
    values ('equipment_variant', v_body_variant);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  assert v_failed, 'direct table writes must require a Central RPC';

  v_body := jsonb_build_object(
    'contract_version', 'echo-equipment-effects/v1',
    'document_id', 'equipment-variant:' || v_body_variant,
    'registry_revision', 'echo-equipment-effects/v1:builtins-1',
    'data_revision', 'body-armor:common:r1',
    'ruleset_revision', 'phase2c1-collection-only',
    'subject', jsonb_build_object('kind', 'equipment_variant', 'id', v_body_variant),
    'expected_effect_count', 1,
    'effects', jsonb_build_array(jsonb_build_object(
      'effect_id', 'effect:body-armor:common:armor-capacity',
      'effect_revision', 1,
      'origin', jsonb_build_object(
        'kind', 'equipment_variant', 'id', 'equipment-variant:' || v_body_variant,
        'equipment_id', '30000000-0000-4000-8000-000000000001',
        'variant_id', v_body_variant, 'set_id', null, 'required_pieces', null
      ),
      'target', 'armor_capacity', 'operation', 'relative_percent',
      'value', 3, 'unit', 'percent',
      'condition', jsonb_build_object(
        'kind', 'always', 'ability_id', null, 'event_id', null,
        'mode_id', null, 'state_id', null, 'raw_text', null
      ),
      'duration', jsonb_build_object(
        'kind', 'not_applicable', 'value', null, 'unit', null, 'raw_text', null
      ),
      'scope', jsonb_build_object(
        'kind', 'global', 'hero_ids', jsonb_build_array(), 'class_ids', jsonb_build_array(),
        'ability_ids', jsonb_build_array(), 'mode_ids', jsonb_build_array()
      ),
      'stacking', jsonb_build_object(
        'group', 'equipment:body-armor:armor-capacity', 'rule', 'additive',
        'tier_semantics', 'not_applicable', 'max_stacks', 1
      ),
      'provenance', jsonb_build_object(
        'verification_status', 'confirmed', 'verified_at', '2026-09-02T00:00:00Z',
        'sources', jsonb_build_array(jsonb_build_object(
          'kind', 'game_screenshot', 'reference', 'fixture:body-armor:common',
          'observed_at', '2026-09-02', 'game_revision', null
        ))
      ),
      'original_text', '+3% à armadura máxima do herói',
      'support', jsonb_build_object(
        'status', 'supported', 'reason_code', null,
        'details', 'Representação contratual; execução numérica fechada.'
      )
    ))
  );
  v_evidence := jsonb_build_array(jsonb_build_object(
    'source_kind', 'game_screenshot',
    'source_reference', 'fixture:body-armor:common',
    'source_uri', null,
    'file_sha256', repeat('a', 64),
    'observed_at', '2026-09-02',
    'game_revision', null,
    'excerpt', '+3% à armadura máxima do herói',
    'metadata', jsonb_build_object('fixture', true)
  ));

  v_response := public.validate_equipment_effect_document_draft_v1(
    v_body, 'equipment_variant', v_body_variant
  );
  assert (v_response->>'valid')::boolean, v_response::text;
  assert (v_response#>>'{numeric_authority,enabled}')::boolean is false,
    'validation must keep numeric authority disabled';

  v_response := public.admin_save_equipment_effect_draft_v1(
    'equipment_variant', v_body_variant, v_body, v_evidence
  );
  v_document_id := (v_response->>'document_id')::uuid;
  v_revision_id := (v_response->>'revision_id')::uuid;
  v_old_revision_id := v_revision_id;
  assert v_response->>'validation_state' = 'valid';
  assert v_response->>'evidence_state' = 'complete';
  assert (v_response->>'created_revision')::boolean;
  assert (v_response#>>'{numeric_authority,enabled}')::boolean is false;
  assert exists (
    select 1
    from public.equipment_effect_document_revisions r
    where r.id = v_revision_id
      and r.payload#>>'{effects,0,value}' = '3'
      and r.payload#>>'{effects,0,operation}' = 'relative_percent'
      and r.payload#>>'{effects,0,unit}' = 'percent'
  ), 'Body Armor +3% must survive the database round trip';

  v_failed := false;
  begin
    update public.equipment_effect_documents
    set updated_at = now()
    where id = v_document_id;
  exception when insufficient_privilege then
    v_failed := true;
  end;
  assert v_failed, 'RPC write capability must be cleared before returning';

  v_response := public.admin_save_equipment_effect_draft_v1(
    'equipment_variant', v_body_variant, v_body, v_evidence, v_document_id
  );
  assert not (v_response->>'created_revision')::boolean,
    'identical save must be idempotent';
  assert (select count(*) from public.equipment_effect_document_revisions
          where document_id = v_document_id) = 1;

  v_review := public.admin_request_equipment_effect_review_v1(
    v_revision_id,
    'Confirmar transcrição e unidade',
    'Mantém o contrato rastreável sem aplicar cálculo',
    'Revisar evidência e semântica'
  );
  assert (v_review->>'created_review')::boolean;
  v_review := public.admin_request_equipment_effect_review_v1(
    v_revision_id,
    'Confirmar transcrição e unidade',
    'Mantém o contrato rastreável sem aplicar cálculo',
    'Revisar evidência e semântica'
  );
  assert not (v_review->>'created_review')::boolean,
    'review request must be idempotent';

  v_review := public.admin_review_equipment_effect_revision_v1(
    v_revision_id, 'approved', 'Fonte e representação conferidas.'
  );
  assert v_review->>'workflow_status' = 'reviewed';
  assert (v_review->>'published')::boolean is false,
    'review approval must not publish';
  assert (v_review#>>'{numeric_authority,enabled}')::boolean is false;

  v_body_r2 := jsonb_set(v_body, '{data_revision}', '"body-armor:common:r2"'::jsonb);
  v_response := public.admin_save_equipment_effect_draft_v1(
    'equipment_variant', v_body_variant, v_body_r2, v_evidence, v_document_id
  );
  v_revision_id := (v_response->>'revision_id')::uuid;
  assert (v_response->>'revision')::integer = 2;
  assert v_response->>'workflow_status' = 'draft';
  assert exists (
    select 1 from public.equipment_effect_review_queue
    where revision_id = v_old_revision_id and status = 'approved'
      and not is_current and superseded_at is not null
  ), 'new revision must preserve and supersede the old approval';

  v_pouch := jsonb_build_object(
    'contract_version', 'echo-equipment-effects/v1',
    'document_id', 'equipment-variant:' || v_pouch_variant,
    'registry_revision', 'echo-equipment-effects/v1:builtins-1',
    'data_revision', 'slayer-pouch:common:r1',
    'ruleset_revision', 'phase2c1-collection-only',
    'subject', jsonb_build_object('kind', 'equipment_variant', 'id', v_pouch_variant),
    'expected_effect_count', 2,
    'effects', jsonb_build_array(
      jsonb_build_object(
        'effect_id', 'effect:slayer-pouch:common:aimed-range', 'effect_revision', 1,
        'origin', jsonb_build_object(
          'kind', 'equipment_variant', 'id', 'equipment-variant:' || v_pouch_variant,
          'equipment_id', '30000000-0000-4000-8000-000000000002',
          'variant_id', v_pouch_variant, 'set_id', null, 'required_pieces', null
        ),
        'target', 'aimed_range', 'operation', 'add', 'value', 17, 'unit', 'distance_unit',
        'condition', jsonb_build_object('kind', 'always', 'ability_id', null, 'event_id', null,
          'mode_id', null, 'state_id', null, 'raw_text', null),
        'duration', jsonb_build_object('kind', 'not_applicable', 'value', null, 'unit', null, 'raw_text', null),
        'scope', jsonb_build_object('kind', 'restricted', 'hero_ids', jsonb_build_array('hero:slayer'),
          'class_ids', jsonb_build_array(), 'ability_ids', jsonb_build_array(), 'mode_ids', jsonb_build_array()),
        'stacking', jsonb_build_object('group', 'equipment:pouch:aimed-range', 'rule', 'additive',
          'tier_semantics', 'not_applicable', 'max_stacks', 1),
        'provenance', jsonb_build_object('verification_status', 'confirmed',
          'verified_at', '2026-09-02T00:00:00Z', 'sources', jsonb_build_array(jsonb_build_object(
            'kind', 'game_screenshot', 'reference', 'fixture:pouch:common',
            'observed_at', '2026-09-02', 'game_revision', null))),
        'original_text', '+17 ao alcance do tiro com mira do herói',
        'support', jsonb_build_object('status', 'supported', 'reason_code', null,
          'details', 'Representação apenas')
      ),
      jsonb_build_object(
        'effect_id', 'effect:slayer-pouch:common:weapon-recoil', 'effect_revision', 1,
        'origin', jsonb_build_object(
          'kind', 'equipment_variant', 'id', 'equipment-variant:' || v_pouch_variant,
          'equipment_id', '30000000-0000-4000-8000-000000000002',
          'variant_id', v_pouch_variant, 'set_id', null, 'required_pieces', null
        ),
        'target', 'weapon_recoil', 'operation', 'relative_percent', 'value', -25, 'unit', 'percent',
        'condition', jsonb_build_object('kind', 'always', 'ability_id', null, 'event_id', null,
          'mode_id', null, 'state_id', null, 'raw_text', null),
        'duration', jsonb_build_object('kind', 'not_applicable', 'value', null, 'unit', null, 'raw_text', null),
        'scope', jsonb_build_object('kind', 'restricted', 'hero_ids', jsonb_build_array('hero:slayer'),
          'class_ids', jsonb_build_array(), 'ability_ids', jsonb_build_array(), 'mode_ids', jsonb_build_array()),
        'stacking', jsonb_build_object('group', 'equipment:pouch:weapon-recoil', 'rule', 'independent',
          'tier_semantics', 'not_applicable', 'max_stacks', 1),
        'provenance', jsonb_build_object('verification_status', 'unverified', 'verified_at', null,
          'sources', jsonb_build_array(jsonb_build_object(
            'kind', 'game_screenshot', 'reference', 'fixture:pouch:common',
            'observed_at', '2026-09-02', 'game_revision', null))),
        'original_text', '-25% ao recuo da arma do herói',
        'support', jsonb_build_object('status', 'pending',
          'reason_code', 'registry_extension_requires_review', 'details', 'Alvo ainda não registrado')
      )
    )
  );
  v_evidence := jsonb_build_array(jsonb_build_object(
    'source_kind', 'game_screenshot', 'source_reference', 'fixture:pouch:common',
    'source_uri', null, 'file_sha256', repeat('b', 64), 'observed_at', '2026-09-02',
    'game_revision', null, 'excerpt', '+17 alcance; -25% recuo',
    'metadata', jsonb_build_object('fixture', true)
  ));
  v_response := public.validate_equipment_effect_document_draft_v1(
    v_pouch, 'equipment_variant', v_pouch_variant
  );
  assert (v_response->>'valid')::boolean, v_response::text;
  assert jsonb_array_length(v_response->'warnings') = 1,
    'unknown recoil target must remain a warning only while pending';
  v_response := public.admin_save_equipment_effect_draft_v1(
    'equipment_variant', v_pouch_variant, v_pouch, v_evidence
  );
  assert exists (
    select 1 from public.equipment_effect_document_revisions r
    where r.id = (v_response->>'revision_id')::uuid
      and jsonb_array_length(r.payload->'effects') = 2
      and r.payload#>>'{effects,0,value}' = '17'
      and r.payload#>>'{effects,0,operation}' = 'add'
      and r.payload#>>'{effects,0,unit}' = 'distance_unit'
      and r.payload#>>'{effects,1,value}' = '-25'
      and r.payload#>>'{effects,1,operation}' = 'relative_percent'
      and r.payload#>>'{effects,1,unit}' = 'percent'
  ), 'Pouch must persist two independent effects without flattening';

  v_empty := jsonb_build_object(
    'contract_version', 'echo-equipment-effects/v1',
    'document_id', 'set-bonus:' || v_missing_bonus,
    'registry_revision', 'echo-equipment-effects/v1:builtins-1',
    'data_revision', 'set-bonus:r1', 'ruleset_revision', 'phase2c1-collection-only',
    'subject', jsonb_build_object('kind', 'set_bonus', 'id', v_missing_bonus),
    'expected_effect_count', 0, 'effects', jsonb_build_array()
  );
  v_response := public.admin_save_equipment_effect_draft_v1(
    'set_bonus', v_missing_bonus, v_empty, '[]'::jsonb
  );
  v_missing_revision_id := (v_response->>'revision_id')::uuid;
  assert v_response->>'validation_state' = 'valid';
  assert v_response->>'evidence_state' = 'incomplete';
  v_failed := false;
  begin
    perform public.admin_request_equipment_effect_review_v1(
      v_missing_revision_id, 'Revisar', 'Sem impacto numérico', 'Anexar fonte persistente'
    );
  exception when invalid_parameter_value then
    v_failed := true;
  end;
  assert v_failed, 'incomplete source must never enter review';

  v_unknown := jsonb_build_object(
    'contract_version', 'echo-equipment-effects/v99',
    'document_id', 'equipment:30000000-0000-4000-8000-000000000003',
    'registry_revision', 'echo-equipment-effects/v1:builtins-1',
    'data_revision', 'future:r1', 'ruleset_revision', 'future',
    'subject', jsonb_build_object('kind', 'equipment',
      'id', '30000000-0000-4000-8000-000000000003'),
    'expected_effect_count', 0, 'effects', jsonb_build_array()
  );
  v_evidence := jsonb_build_array(jsonb_build_object(
    'source_kind', 'historical_audit', 'source_reference', 'fixture:future-contract',
    'source_uri', null, 'file_sha256', repeat('c', 64), 'observed_at', '2026-09-02',
    'game_revision', null, 'excerpt', null, 'metadata', jsonb_build_object('fixture', true)
  ));
  v_response := public.admin_save_equipment_effect_draft_v1(
    'equipment', '30000000-0000-4000-8000-000000000003', v_unknown, v_evidence
  );
  v_unknown_revision_id := (v_response->>'revision_id')::uuid;
  assert v_response->>'validation_state' = 'unknown_version';
  assert exists (
    select 1 from public.equipment_effect_document_revisions
    where id = v_unknown_revision_id and payload = v_unknown
  ), 'unknown contracts must be preserved byte-semantically as JSONB without downgrade';
  v_failed := false;
  begin
    perform public.admin_request_equipment_effect_review_v1(
      v_unknown_revision_id, 'Revisar versão futura', 'Contrato desconhecido', 'Instalar versão'
    );
  exception when invalid_parameter_value then
    v_failed := true;
  end;
  assert v_failed, 'unknown contract must not enter review';

  v_failed := false;
  begin
    perform public.validate_equipment_effect_document_draft_v1(
      jsonb_set(v_body, '{effects,0,formula}', '"base * 1.03"'::jsonb),
      'equipment_variant', v_body_variant
    );
  exception when others then
    raise exception 'validator must diagnose forbidden formulas, not crash: %', sqlerrm;
  end;
  v_response := public.validate_equipment_effect_document_draft_v1(
    jsonb_set(v_body, '{effects,0,formula}', '"base * 1.03"'::jsonb),
    'equipment_variant', v_body_variant
  );
  assert not (v_response->>'valid')::boolean;
  assert v_response->'errors' @> '[{"code":"execution_or_formula_field_forbidden"}]'::jsonb;

  v_response := public.admin_list_equipment_effect_drafts_v1(
    '30000000-0000-4000-8000-000000000001'
  );
  assert jsonb_array_length(v_response->'documents') = 1;
  assert (v_response#>>'{publication_available}')::boolean is false;
  assert (v_response#>>'{numeric_authority,enabled}')::boolean is false;

  perform set_config('test.equipment_admin', 'false', true);
  v_failed := false;
  begin
    perform public.admin_list_equipment_effect_drafts_v1(
      '30000000-0000-4000-8000-000000000001'
    );
  exception when insufficient_privilege then
    v_failed := true;
  end;
  assert v_failed, 'authenticated non-admin must not read the Central';
end;
$$;

rollback;
