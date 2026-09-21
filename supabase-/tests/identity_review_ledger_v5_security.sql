-- Echo Identity V5 — ledger imutável, segundo parecer e recálculo confirmado.
-- Executar somente no SNV após 20260825111000.
begin;

do $$
declare
  v_primary text;
  v_confirm text;
  v_recompute text;
  v_queue text;
  v_original_timezone text:=current_setting('TimeZone');
  v_review_hash_utc text;
  v_review_hash_local text;
  v_authority_hash_utc text;
  v_authority_hash_local text;
begin
  if not exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='echo_research_review_events' and c.relrowsecurity
  ) or not exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='echo_research_review_confirmations' and c.relrowsecurity
  ) then raise exception 'V5 review ledger RLS missing'; end if;

  if has_table_privilege('authenticated','public.echo_research_review_events','INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.echo_research_review_confirmations','INSERT,UPDATE,DELETE')
     or has_table_privilege('anon','public.echo_research_review_events','SELECT')
     or has_table_privilege('anon','public.echo_research_review_confirmations','SELECT') then
    raise exception 'V5 review ledger privileges are unsafe';
  end if;

  if not has_column_privilege('authenticated','public.echo_research_contributions','status','SELECT')
     or has_column_privilege('authenticated','public.echo_research_contributions','payload','SELECT')
     or has_column_privilege('authenticated','public.echo_research_contributions','evidence_reference','SELECT')
     or has_column_privilege('authenticated','public.echo_research_contributions','review_note','SELECT')
     or has_column_privilege('authenticated','public.echo_research_contributions','reviewed_by','SELECT') then
    raise exception 'V5 member can read internal research evidence or review notes';
  end if;

  if not exists(
    select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='echo_research_review_events'
      and t.tgname='echo_research_review_events_immutable_v5' and not t.tgisinternal
  ) or not exists(
    select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='echo_research_review_confirmations'
      and t.tgname='echo_research_review_confirmations_immutable_v5' and not t.tgisinternal
  ) then raise exception 'V5 immutable review triggers missing'; end if;

  select pg_get_functiondef('public.admin_review_research_contribution_v1(uuid,text,text,boolean)'::regprocedure::oid)
  into v_primary;
  if position('research_rereview_reason_required' in v_primary)=0
     or position('research_review_revision_limited' in v_primary)=0
     or position($needle$review_confirmation_state<>'disputed'$needle$ in replace(v_primary,' ',''))=0
     or position('perform public.echo_recompute_community_reputation(v_row.contributor_id)' in lower(v_primary))=0
     or position('none_until_independent_confirmation' in v_primary)=0 then
    raise exception 'V5 primary review does not invalidate stale scoring safely';
  end if;

  select pg_get_functiondef('public.admin_confirm_research_review_v1(uuid,bigint,text,text)'::regprocedure::oid)
  into v_confirm;
  if position('research_reviewer_cannot_self_confirm' in v_confirm)=0
     or position('research_contributor_cannot_confirm' in v_confirm)=0
     or position('self_review_not_confirmation_eligible' in v_confirm)=0
     or position('research_confirmation_stale_decision' in v_confirm)=0
     or position('research_dispute_reason_required' in v_confirm)=0
     or position('created_at_epoch_us' in v_confirm)=0
     or position('extract(epoch from v_created_at)' in lower(v_confirm))=0
     or position('perform public.echo_recompute_community_reputation(v_row.contributor_id)' in lower(v_confirm))=0 then
    raise exception 'V5 independent confirmation guards incomplete';
  end if;

  select pg_get_functiondef('public.echo_recompute_community_reputation(uuid)'::regprocedure::oid)
  into v_recompute;
  if position('echo-community-reputation:' in v_recompute)=0
     or position($needle$c.review_confirmation_state='confirmed'$needle$ in lower(v_recompute))=0
     or position($needle$f.outcome='confirmed'$needle$ in lower(v_recompute))=0
     or position('c.current_review_event_id' in lower(v_recompute))=0
     or position('e.reviewer_id is distinct from c.contributor_id' in lower(v_recompute))=0
     or position('delete from public.echo_community_specialty_stats' in lower(v_recompute))=0 then
    raise exception 'V5 recompute accepts unconfirmed or concurrent state';
  end if;

  if not has_function_privilege('authenticated','public.admin_confirm_research_review_v1(uuid,bigint,text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.admin_confirm_research_review_v1(uuid,bigint,text,text)','EXECUTE')
     or has_function_privilege('anon','public.admin_confirm_research_review_v1(uuid,bigint,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.echo_recompute_community_reputation(uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.echo_research_review_event_hash_v1(uuid,uuid,text,integer,text,text,boolean,boolean,uuid,timestamptz,text,text,text)','EXECUTE') then
    raise exception 'V5 review function privileges are unsafe';
  end if;

  select lower(pg_get_functiondef('public.admin_research_review_queue_v5(text,integer)'::regprocedure::oid))
  into v_queue;
  if not has_function_privilege('authenticated','public.admin_research_review_queue_v5(text,integer)','EXECUTE')
     or not has_function_privilege('service_role','public.admin_research_review_queue_v5(text,integer)','EXECUTE')
     or has_function_privilege('anon','public.admin_research_review_queue_v5(text,integer)','EXECUTE')
     or position('public.echo_is_admin()' in v_queue)=0
     or position('invalid_research_review_queue' in v_queue)=0
     or position($needle$p_queue = 'pending'$needle$ in v_queue)=0
     or position($needle$p_queue = 'confirmation'$needle$ in v_queue)=0
     or position('order by c.submitted_at, c.id' in v_queue)=0
     or position('order by c.reviewed_at, c.id' in v_queue)=0 then
    raise exception 'V5 AAL2 research queue contract incomplete';
  end if;

  if to_regclass('public.echo_research_review_events_contribution_idx') is not null then
    raise exception 'V5 redundant review-event contribution index present';
  end if;
  if to_regclass('public.echo_research_confirmation_queue_v5_idx') is null
     or position('reviewed_at, id' in lower(pg_get_indexdef(
       'public.echo_research_confirmation_queue_v5_idx'::regclass
     )))=0
     or position('review_confirmation_state' in lower(pg_get_indexdef(
       'public.echo_research_confirmation_queue_v5_idx'::regclass
     )))=0 then
    raise exception 'V5 confirmation queue index missing or misaligned';
  end if;

  perform set_config('TimeZone','UTC',true);
  select public.echo_research_review_event_hash_v1(
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid,
    repeat('a',64),1,'pending','verified',false,true,
    '00000000-0000-0000-0000-000000000003'::uuid,
    '2026-08-25 12:34:56.123456+00'::timestamptz,null,null,'timezone-test-v5'
  ) into v_review_hash_utc;
  select public.echo_identity_authority_event_hash_v1(
    1,null,'00000000-0000-0000-0000-000000000004'::uuid,
    'role','research_admin','granted','00000000-0000-0000-0000-000000000005'::uuid,
    'admin','timezone test','{}'::jsonb,
    '2026-08-25 12:34:56.123456+00'::timestamptz,'authority-audit-v5'
  ) into v_authority_hash_utc;

  perform set_config('TimeZone','America/Sao_Paulo',true);
  select public.echo_research_review_event_hash_v1(
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid,
    repeat('a',64),1,'pending','verified',false,true,
    '00000000-0000-0000-0000-000000000003'::uuid,
    '2026-08-25 12:34:56.123456+00'::timestamptz,null,null,'timezone-test-v5'
  ) into v_review_hash_local;
  select public.echo_identity_authority_event_hash_v1(
    1,null,'00000000-0000-0000-0000-000000000004'::uuid,
    'role','research_admin','granted','00000000-0000-0000-0000-000000000005'::uuid,
    'admin','timezone test','{}'::jsonb,
    '2026-08-25 12:34:56.123456+00'::timestamptz,'authority-audit-v5'
  ) into v_authority_hash_local;
  perform set_config('TimeZone',v_original_timezone,true);

  if v_review_hash_utc is distinct from v_review_hash_local
     or v_authority_hash_utc is distinct from v_authority_hash_local then
    raise exception 'V5 ledger hashes depend on session timezone';
  end if;

  if exists(
    select 1 from public.echo_research_review_events e
    where e.event_hash is distinct from public.echo_research_review_event_hash_v1(
      e.contribution_id,e.contributor_id,e.knowledge_fingerprint,e.revision,e.previous_status,e.new_status,
      e.previous_first_discovery,e.new_first_discovery,e.reviewer_id,e.reviewed_at,e.review_note_hash,
      e.previous_event_hash,e.guardrail_policy_version
    )
  ) then raise exception 'V5 review event hash mismatch'; end if;

  if exists(
    select 1
    from public.echo_research_review_confirmations f
    join public.echo_research_review_events e on e.id=f.decision_event_id
    where f.confirmation_hash is distinct from encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'confirmation_id',f.id,
            'decision_event_id',f.decision_event_id,
            'decision_event_hash',e.event_hash,
            'contribution_id',f.contribution_id,
            'confirmer_id',f.confirmer_id,
            'outcome',f.outcome,
            'confirmation_note_hash',f.confirmation_note_hash,
            'created_at_epoch_us',(extract(epoch from f.created_at)*1000000)::bigint
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  ) then raise exception 'V5 confirmation hash mismatch'; end if;

  if exists(
    with chain as (
      select e.contribution_id,e.revision,e.previous_event_hash,
        lag(e.event_hash) over(partition by e.contribution_id order by e.revision) as expected_previous
      from public.echo_research_review_events e
    )
    select 1 from chain where previous_event_hash is distinct from expected_previous
  ) then raise exception 'V5 review event chain broken'; end if;

  if exists(
    select 1 from public.echo_research_contributions c
    left join public.echo_research_review_events e on e.id=c.current_review_event_id
    where c.current_review_event_id is not null and (
      e.id is null or e.contribution_id<>c.id or e.revision<>c.review_revision
      or e.new_status<>c.status or e.new_first_discovery<>c.is_first_discovery
      or e.reviewer_id is distinct from c.reviewed_by
    )
  ) then raise exception 'V5 current review pointer inconsistent'; end if;

  if exists(
    select 1 from public.echo_research_contributions c
    left join public.echo_research_review_confirmations f on f.decision_event_id=c.current_review_event_id
    where (c.review_confirmation_state in ('confirmed','disputed') and f.outcome is distinct from c.review_confirmation_state)
       or (c.review_confirmation_state='awaiting_confirmation' and f.id is not null)
       or (c.review_confirmation_state='confirmed' and c.reviewed_by=c.contributor_id)
  ) then raise exception 'V5 confirmation state inconsistent'; end if;

  if not exists(
    select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='echo_identity_authority_audit'
      and t.tgname='echo_identity_authority_audit_chain_v5' and not t.tgisinternal
  ) or not exists(
    select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='echo_identity_authority_audit'
      and t.tgname='echo_identity_authority_audit_immutable_v5' and not t.tgisinternal
  ) then raise exception 'V5 authority audit chain/immutability missing'; end if;

  if exists(
    select 1 from public.echo_identity_authority_audit a
    where a.event_hash is distinct from public.echo_identity_authority_event_hash_v1(
      a.id,a.previous_event_hash,a.target_user_id,a.authority_kind,a.authority_value,a.action,
      a.actor_user_id,a.actor_role,a.reason,a.context,a.created_at,a.chain_version
    )
  ) then raise exception 'V5 authority audit hash mismatch'; end if;

  if exists(
    select 1 from public.echo_identity_authority_audit a
    where a.previous_event_hash is not null
      and not exists(select 1 from public.echo_identity_authority_audit p where p.event_hash=a.previous_event_hash)
  ) or exists(
    select 1 from public.echo_identity_authority_audit a
    where a.previous_event_hash is not null
    group by a.previous_event_hash having count(*)>1
  ) or (select count(*) from public.echo_identity_authority_audit where previous_event_hash is null)>1 then
    raise exception 'V5 authority audit chain broken or branched';
  end if;

  if not exists(
    select 1 from public.echo_identity_authority_audit_chain_state where singleton=true
  ) or exists(
    select 1
    from public.echo_identity_authority_audit_chain_state s
    left join public.echo_identity_authority_audit a on a.id=s.last_event_id
    where s.singleton=true and (
      (s.last_event_id is null and exists(select 1 from public.echo_identity_authority_audit))
      or (s.last_event_id is not null and (a.id is null or a.event_hash is distinct from s.last_event_hash))
      or exists(
        select 1 from public.echo_identity_authority_audit child
        where child.previous_event_hash=s.last_event_hash
      )
    )
  ) then raise exception 'V5 authority audit chain-state pointer inconsistent'; end if;
end $$;

rollback;
