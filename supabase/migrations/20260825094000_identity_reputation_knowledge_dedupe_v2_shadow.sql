-- Echo Identity — Knowledge Dedupe V2 em Shadow.
-- Evidências diferentes do mesmo fato podem coexistir, mas um membro não recebe
-- reputação repetida pelo mesmo conhecimento/patch.
-- Destino exclusivo: Supabase SNV.

begin;

-- ---------------------------------------------------------------------------
-- 1. Fingerprint do CONHECIMENTO, separado do fingerprint da submissão.
-- Submission fingerprint identifica a evidência exata; knowledge fingerprint
-- identifica o fato documentado.
-- A normalização é deliberadamente conservadora: colapsa espaços e separadores
-- com espaços dos dois lados, mas preserva pontuação numérica/semântica como
-- 1.8, -70%, +10 e 0,5 para não fundir fatos diferentes.
-- ---------------------------------------------------------------------------
create or replace function public.echo_research_normalize_subject_v1(p_subject text)
returns text
language sql
immutable
set search_path=''
as $$
  select lower(
    regexp_replace(
      regexp_replace(
        btrim(coalesce(p_subject,'')),
        '[[:space:]]+[-–—|]+[[:space:]]+',
        ' ',
        'g'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;
revoke all on function public.echo_research_normalize_subject_v1(text) from public,anon,authenticated,service_role;

create or replace function public.echo_research_knowledge_fingerprint_v1(
  p_contribution_type text,
  p_subject_key text,
  p_hero_id uuid,
  p_skill_id uuid,
  p_game_version text
)
returns text
language sql
immutable
set search_path=''
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'contribution_type',lower(btrim(coalesce(p_contribution_type,''))),
          'subject_key',public.echo_research_normalize_subject_v1(p_subject_key),
          'hero_id',coalesce(p_hero_id::text,''),
          'skill_id',coalesce(p_skill_id::text,''),
          'game_version',lower(btrim(coalesce(p_game_version,'')))
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;
revoke all on function public.echo_research_knowledge_fingerprint_v1(text,text,uuid,uuid,text) from public,anon,authenticated,service_role;

alter table public.echo_research_contributions
  add column if not exists knowledge_fingerprint text;

update public.echo_research_contributions
set knowledge_fingerprint=public.echo_research_knowledge_fingerprint_v1(
  contribution_type,subject_key,hero_id,skill_id,game_version
)
where knowledge_fingerprint is null;

alter table public.echo_research_contributions
  alter column knowledge_fingerprint set not null;

alter table public.echo_research_contributions
  drop constraint if exists echo_research_knowledge_fingerprint_format;
alter table public.echo_research_contributions
  add constraint echo_research_knowledge_fingerprint_format
  check (knowledge_fingerprint ~ '^[a-f0-9]{64}$');

create index if not exists echo_research_knowledge_fingerprint_idx
  on public.echo_research_contributions(contributor_id,knowledge_fingerprint,submitted_at desc);

create or replace function public.echo_research_set_knowledge_fingerprint_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.knowledge_fingerprint:=public.echo_research_knowledge_fingerprint_v1(
    new.contribution_type,new.subject_key,new.hero_id,new.skill_id,new.game_version
  );
  return new;
end;
$$;
revoke all on function public.echo_research_set_knowledge_fingerprint_v1() from public,anon,authenticated,service_role;

drop trigger if exists echo_research_set_knowledge_fingerprint on public.echo_research_contributions;
create trigger echo_research_set_knowledge_fingerprint
before insert or update of contribution_type,subject_key,hero_id,skill_id,game_version
on public.echo_research_contributions
for each row execute function public.echo_research_set_knowledge_fingerprint_v1();

-- ---------------------------------------------------------------------------
-- 2. Reputação agrupa por conhecimento por membro.
-- Precedência por conhecimento: verified > corroborated > contested > rejected.
-- Múltiplas evidências aceitas do mesmo fato não multiplicam pontos.
-- ---------------------------------------------------------------------------
create or replace function public.echo_recompute_community_reputation(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_verified integer;
  v_corroborated integer;
  v_first integer;
  v_decided integer;
  v_accepted integer;
  v_points integer;
  v_rate numeric(5,4);
  v_tier text := 'member';
  v_policy text;
  v_verified_points integer;
  v_corroborated_points integer;
  v_first_bonus integer;
begin
  select m.policy_version,m.verified_points,m.corroborated_points,m.first_discovery_bonus
  into v_policy,v_verified_points,v_corroborated_points,v_first_bonus
  from public.echo_reputation_policy_meta m
  where m.singleton=true;

  if v_policy is null then
    raise exception 'reputation_policy_missing' using errcode='55000';
  end if;

  with grouped as (
    select
      c.knowledge_fingerprint,
      bool_or(c.status='verified') as has_verified,
      bool_or(c.status='corroborated') as has_corroborated,
      bool_or(c.status='contested') as has_contested,
      bool_or(c.status='rejected') as has_rejected,
      bool_or(c.status='verified' and c.is_first_discovery=true) as has_first
    from public.echo_research_contributions c
    where c.contributor_id=p_user_id
    group by c.knowledge_fingerprint
  ), normalized as (
    select
      case
        when has_verified then 'verified'
        when has_corroborated then 'corroborated'
        when has_contested then 'contested'
        when has_rejected then 'rejected'
        else 'neutral'
      end as effective_status,
      has_first
    from grouped
  )
  select
    count(*) filter(where effective_status='verified')::integer,
    count(*) filter(where effective_status='corroborated')::integer,
    count(*) filter(where has_first=true)::integer,
    count(*) filter(where effective_status in ('verified','corroborated','rejected','contested'))::integer
  into v_verified,v_corroborated,v_first,v_decided
  from normalized;

  v_verified:=coalesce(v_verified,0);
  v_corroborated:=coalesce(v_corroborated,0);
  v_first:=coalesce(v_first,0);
  v_decided:=coalesce(v_decided,0);
  v_accepted:=v_verified+v_corroborated;
  v_points:=v_verified*v_verified_points + v_corroborated*v_corroborated_points + v_first*v_first_bonus;
  v_rate:=case
    when v_decided=0 then 0
    else least(1,greatest(0,v_accepted::numeric/v_decided::numeric))
  end;

  select r.tier into v_tier
  from public.echo_reputation_tier_rules r
  where r.policy_version=v_policy
    and v_points>=r.min_points
    and v_verified>=r.min_verified
    and v_first>=r.min_first_discoveries
    and v_rate>=r.min_acceptance_rate
  order by r.ordinal desc
  limit 1;
  v_tier:=coalesce(v_tier,'member');

  insert into public.echo_community_reputation(
    user_id,reputation_points,community_tier,verified_count,corroborated_count,first_discoveries,
    acceptance_rate,accepted_count,decided_count,policy_version,updated_at
  ) values(
    p_user_id,v_points,v_tier,v_verified,v_corroborated,v_first,
    v_rate,v_accepted,v_decided,v_policy,now()
  )
  on conflict(user_id) do update set
    reputation_points=excluded.reputation_points,
    community_tier=excluded.community_tier,
    verified_count=excluded.verified_count,
    corroborated_count=excluded.corroborated_count,
    first_discoveries=excluded.first_discoveries,
    acceptance_rate=excluded.acceptance_rate,
    accepted_count=excluded.accepted_count,
    decided_count=excluded.decided_count,
    policy_version=excluded.policy_version,
    updated_at=now();
end;
$$;
revoke all on function public.echo_recompute_community_reputation(uuid) from public,anon,authenticated,service_role;

-- Recalcula contas existentes sob a regra de conhecimento único.
do $$
declare r record;
begin
  for r in select p.id from public.profiles p loop
    perform public.echo_recompute_community_reputation(r.id);
  end loop;
end $$;

comment on column public.echo_research_contributions.knowledge_fingerprint is
  'Identidade server-side do fato/patch documentado. Evidências diferentes podem compartilhar o mesmo conhecimento.';
comment on function public.echo_research_normalize_subject_v1(text) is
  'Normalização conservadora do assunto: colapsa espaços/separadores visuais, preservando pontuação que pode alterar valores numéricos.';
comment on function public.echo_research_knowledge_fingerprint_v1(text,text,uuid,uuid,text) is
  'Fingerprint de conhecimento independente de payload/evidência; usado para impedir farming de reputação por variações do mesmo fato.';
comment on function public.echo_recompute_community_reputation(uuid) is
  'Recalcula reputação por conhecimento único do membro, usando a política versionada quality-v2; múltiplas evidências do mesmo fato não empilham pontos.';

commit;
