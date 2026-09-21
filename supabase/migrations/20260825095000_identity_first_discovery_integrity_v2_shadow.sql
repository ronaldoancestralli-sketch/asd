-- Echo Identity — First Discovery Integrity V2 em Shadow.
-- Uma primeira descoberta pertence a um único conhecimento/patch verificado.
-- Nenhum vencedor histórico é escolhido automaticamente: conflito existente aborta a migration.
-- Destino exclusivo: Supabase SNV.

begin;

-- ---------------------------------------------------------------------------
-- 1. Falha fechada para históricos ambíguos.
-- ---------------------------------------------------------------------------
do $$
declare
  v_conflict text;
begin
  select c.knowledge_fingerprint into v_conflict
  from public.echo_research_contributions c
  where c.status='verified'
    and c.is_first_discovery=true
  group by c.knowledge_fingerprint
  having count(*)>1
  limit 1;

  if v_conflict is not null then
    raise exception 'duplicate_first_discovery_requires_review' using errcode='23505';
  end if;
end $$;

-- A identidade canônica de conhecimento substitui a unicidade textual antiga.
create unique index if not exists echo_research_first_discovery_knowledge_unique
  on public.echo_research_contributions(knowledge_fingerprint)
  where status='verified' and is_first_discovery=true;

drop index if exists public.echo_research_first_discovery_unique;

-- ---------------------------------------------------------------------------
-- 2. Revisão Admin serializada pelo conhecimento.
-- A unique index permanece como segunda barreira contra corrida/erro futuro.
-- ---------------------------------------------------------------------------
create or replace function public.admin_review_research_contribution_v1(
  p_contribution_id uuid,
  p_status text,
  p_note text default null,
  p_first_discovery boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row public.echo_research_contributions%rowtype;
begin
  if not public.echo_is_admin() then
    raise exception 'admin_aal2_required' using errcode='42501';
  end if;
  if p_status not in ('corroborated','verified','rejected','contested','superseded') then
    raise exception 'invalid_research_review_status' using errcode='22023';
  end if;
  if coalesce(p_first_discovery,false) and p_status<>'verified' then
    raise exception 'first_discovery_requires_verified' using errcode='22023';
  end if;
  if p_note is not null and char_length(p_note)>1600 then
    raise exception 'research_review_note_too_long' using errcode='22023';
  end if;

  select * into v_row
  from public.echo_research_contributions
  where id=p_contribution_id
  for update;

  if not found then
    raise exception 'research_contribution_not_found' using errcode='22023';
  end if;

  if coalesce(p_first_discovery,false) then
    if v_row.knowledge_fingerprint is null then
      raise exception 'first_discovery_knowledge_missing' using errcode='55000';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_row.knowledge_fingerprint,0)
    );

    if exists(
      select 1
      from public.echo_research_contributions c
      where c.id<>p_contribution_id
        and c.knowledge_fingerprint=v_row.knowledge_fingerprint
        and c.status='verified'
        and c.is_first_discovery=true
    ) then
      raise exception 'first_discovery_already_claimed' using errcode='23505';
    end if;
  end if;

  update public.echo_research_contributions
  set status=p_status,
      is_first_discovery=coalesce(p_first_discovery,false),
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      review_note=nullif(btrim(coalesce(p_note,'')),'')
  where id=p_contribution_id;

  return jsonb_build_object(
    'contribution_id',p_contribution_id,
    'status',p_status,
    'contributor_id',v_row.contributor_id,
    'first_discovery',coalesce(p_first_discovery,false)
  );
end;
$$;
revoke all on function public.admin_review_research_contribution_v1(uuid,text,text,boolean) from public,anon;
grant execute on function public.admin_review_research_contribution_v1(uuid,text,text,boolean) to authenticated,service_role;

comment on index public.echo_research_first_discovery_knowledge_unique is
  'Garante uma única primeira descoberta verificada por knowledge_fingerprint, independentemente de variações equivalentes de evidência/texto.';
comment on function public.admin_review_research_contribution_v1(uuid,text,text,boolean) is
  'Revisão AAL2 do Echo Research; serializa primeira descoberta pelo conhecimento canônico e rejeita segunda atribuição.';

commit;
