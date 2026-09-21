-- Echo Identity — Review Independence V2: contrato de segurança read-only.
-- Executar somente no SNV após as migrations de Identity/Reputation V2.

begin;

do $$
declare
  v_recompute text;
  v_research_review text;
  v_creator_review text;
  v_badge text;
begin
  select pg_get_functiondef('public.echo_recompute_community_reputation(uuid)'::regprocedure::oid) into v_recompute;
  if (position($needle$c.reviewed_by is distinct from c.contributor_id$needle$ in lower(v_recompute))=0
      and position($needle$e.reviewer_id is distinct from c.contributor_id$needle$ in lower(v_recompute))=0)
     or (position($needle$bool_or(c.status='verified'$needle$ in lower(v_recompute))=0
         and position($needle$bool_or(status='verified'$needle$ in lower(v_recompute))=0)
     or (position($needle$bool_or(c.status='corroborated'$needle$ in lower(v_recompute))=0
         and position($needle$bool_or(status='corroborated'$needle$ in lower(v_recompute))=0) then
    raise exception 'reputation recompute counts self-reviewed decisions';
  end if;

  select pg_get_functiondef('public.admin_review_research_contribution_v1(uuid,text,text,boolean)'::regprocedure::oid) into v_research_review;
  if position('first_discovery_self_review_not_allowed' in v_research_review)=0
     or position('v_row.contributor_id=auth.uid()' in replace(v_research_review,' ',''))=0
     or position('independent_review' in v_research_review)=0 then
    raise exception 'research review lost self-review first-discovery guard';
  end if;

  select pg_get_functiondef('public.admin_review_creator_claim_v1(uuid,text,text)'::regprocedure::oid) into v_creator_review;
  if position('creator_self_review_not_allowed' in v_creator_review)=0
     or position('v_claim.user_id=auth.uid()' in replace(v_creator_review,' ',''))=0 then
    raise exception 'creator review allows self-verification';
  end if;

  select pg_get_functiondef('public.admin_set_identity_badge_v1(uuid,text,boolean,text,text)'::regprocedure::oid) into v_badge;
  if position('institutional_badge_self_grant_not_allowed' in v_badge)=0
     or position('p_user_id=auth.uid()' in replace(v_badge,' ',''))=0 then
    raise exception 'institutional badge RPC allows self-grant';
  end if;

  if has_function_privilege('anon','public.admin_review_research_contribution_v1(uuid,text,text,boolean)','EXECUTE')
     or has_function_privilege('anon','public.admin_review_creator_claim_v1(uuid,text,text)','EXECUTE')
     or has_function_privilege('anon','public.admin_set_identity_badge_v1(uuid,text,boolean,text,text)','EXECUTE') then
    raise exception 'anon can execute an institutional/research review RPC';
  end if;
end $$;

rollback;
