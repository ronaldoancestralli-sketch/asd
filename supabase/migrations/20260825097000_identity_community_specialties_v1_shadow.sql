-- Echo Identity — Community Specialties V1 em Shadow.
-- Especialidade é reconhecimento comunitário conquistado por área; nunca concede autoridade institucional.
-- Reutiliza a mesma reputação por conhecimento único + revisão independente.
-- Destino exclusivo: Supabase SNV.

begin;

create table if not exists public.echo_community_specialty_catalog (
  specialty_key text primary key,
  label text not null,
  description text not null,
  icon_key text not null,
  contribution_types text[] not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (specialty_key in ('hero_research','arsenal','patch_hunter','counter_research')),
  check (cardinality(contribution_types) >= 1)
);

create table if not exists public.echo_community_specialty_rules (
  policy_version text not null,
  specialty_key text not null references public.echo_community_specialty_catalog(specialty_key) on delete restrict,
  rank_key text not null,
  rank_label text not null,
  ordinal smallint not null check (ordinal between 1 and 3),
  min_points integer not null check (min_points >= 0),
  min_verified integer not null check (min_verified >= 0),
  min_acceptance_rate numeric(5,4) not null check (min_acceptance_rate between 0 and 1),
  primary key(policy_version,specialty_key,rank_key),
  unique(policy_version,specialty_key,ordinal),
  check (rank_key in ('specialist','reference','master'))
);

create table if not exists public.echo_community_specialty_stats (
  user_id uuid not null references public.profiles(id) on delete cascade,
  specialty_key text not null references public.echo_community_specialty_catalog(specialty_key) on delete restrict,
  specialty_points integer not null default 0 check (specialty_points >= 0),
  verified_count integer not null default 0 check (verified_count >= 0),
  corroborated_count integer not null default 0 check (corroborated_count >= 0),
  first_discoveries integer not null default 0 check (first_discoveries >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  decided_count integer not null default 0 check (decided_count >= 0),
  acceptance_rate numeric(5,4) not null default 0 check (acceptance_rate between 0 and 1),
  earned_rank text not null default 'none' check (earned_rank in ('none','specialist','reference','master')),
  policy_version text not null default 'specialty-v1-shadow',
  updated_at timestamptz not null default now(),
  primary key(user_id,specialty_key)
);

insert into public.echo_community_specialty_catalog(specialty_key,label,description,icon_key,contribution_types,active,updated_at)
values
  ('hero_research','Pesquisa de Heróis','Habilidades, passivas e progressão observada de heróis.','hero',array['hero_skill_level','hero_passive'],true,now()),
  ('arsenal','Arsenal','Estatísticas e mudanças verificadas de equipamentos.','arsenal',array['equipment_stat'],true,now()),
  ('patch_hunter','Caçador de Patch','Mudanças de patch confirmadas antes de se tornarem conhecimento consolidado.','patch',array['patch_change'],true,now()),
  ('counter_research','Counter Research','Evidências verificadas de interações, dependências e counters.','counter',array['counter_evidence'],true,now())
on conflict(specialty_key) do update set
  label=excluded.label,description=excluded.description,icon_key=excluded.icon_key,
  contribution_types=excluded.contribution_types,active=excluded.active,updated_at=now();

insert into public.echo_community_specialty_rules(policy_version,specialty_key,rank_key,rank_label,ordinal,min_points,min_verified,min_acceptance_rate)
values
  ('specialty-v1-shadow','hero_research','specialist','Especialista',1,120,10,0.6500),
  ('specialty-v1-shadow','hero_research','reference','Referência',2,400,30,0.7500),
  ('specialty-v1-shadow','hero_research','master','Mestre',3,1200,80,0.8200),
  ('specialty-v1-shadow','arsenal','specialist','Especialista',1,120,10,0.6500),
  ('specialty-v1-shadow','arsenal','reference','Referência',2,400,30,0.7500),
  ('specialty-v1-shadow','arsenal','master','Mestre',3,1200,80,0.8200),
  ('specialty-v1-shadow','patch_hunter','specialist','Especialista',1,80,5,0.6500),
  ('specialty-v1-shadow','patch_hunter','reference','Referência',2,250,15,0.7500),
  ('specialty-v1-shadow','patch_hunter','master','Mestre',3,700,40,0.8200),
  ('specialty-v1-shadow','counter_research','specialist','Especialista',1,80,5,0.6500),
  ('specialty-v1-shadow','counter_research','reference','Referência',2,300,20,0.7500),
  ('specialty-v1-shadow','counter_research','master','Mestre',3,900,50,0.8200)
on conflict(policy_version,specialty_key,rank_key) do update set
  rank_label=excluded.rank_label,ordinal=excluded.ordinal,min_points=excluded.min_points,
  min_verified=excluded.min_verified,min_acceptance_rate=excluded.min_acceptance_rate;

-- O mesmo recompute continua sendo a única fonte de verdade do tier geral e agora materializa especialidades.
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
      bool_or(c.status='verified' and c.reviewed_by is distinct from c.contributor_id) as has_verified,
      bool_or(c.status='corroborated' and c.reviewed_by is distinct from c.contributor_id) as has_corroborated,
      bool_or(c.status='contested' and c.reviewed_by is distinct from c.contributor_id) as has_contested,
      bool_or(c.status='rejected' and c.reviewed_by is distinct from c.contributor_id) as has_rejected,
      bool_or(c.status='verified' and c.is_first_discovery=true and c.reviewed_by is distinct from c.contributor_id) as has_first
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
  v_rate:=case when v_decided=0 then 0 else least(1,greatest(0,v_accepted::numeric/v_decided::numeric)) end;

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

  delete from public.echo_community_specialty_stats s where s.user_id=p_user_id;

  insert into public.echo_community_specialty_stats(
    user_id,specialty_key,specialty_points,verified_count,corroborated_count,first_discoveries,
    accepted_count,decided_count,acceptance_rate,earned_rank,policy_version,updated_at
  )
  with mapped as (
    select
      case
        when c.contribution_type in ('hero_skill_level','hero_passive') then 'hero_research'
        when c.contribution_type='equipment_stat' then 'arsenal'
        when c.contribution_type='patch_change' then 'patch_hunter'
        when c.contribution_type='counter_evidence' then 'counter_research'
        else null
      end as specialty_key,
      c.knowledge_fingerprint,
      c.status,
      c.is_first_discovery,
      c.reviewed_by,
      c.contributor_id
    from public.echo_research_contributions c
    where c.contributor_id=p_user_id
  ), grouped as (
    select
      specialty_key,
      knowledge_fingerprint,
      bool_or(status='verified' and reviewed_by is distinct from contributor_id) as has_verified,
      bool_or(status='corroborated' and reviewed_by is distinct from contributor_id) as has_corroborated,
      bool_or(status='contested' and reviewed_by is distinct from contributor_id) as has_contested,
      bool_or(status='rejected' and reviewed_by is distinct from contributor_id) as has_rejected,
      bool_or(status='verified' and is_first_discovery=true and reviewed_by is distinct from contributor_id) as has_first
    from mapped
    where specialty_key is not null
    group by specialty_key,knowledge_fingerprint
  ), normalized as (
    select
      specialty_key,
      case
        when has_verified then 'verified'
        when has_corroborated then 'corroborated'
        when has_contested then 'contested'
        when has_rejected then 'rejected'
        else 'neutral'
      end as effective_status,
      has_first
    from grouped
  ), aggregated as (
    select
      specialty_key,
      count(*) filter(where effective_status='verified')::integer as verified_count,
      count(*) filter(where effective_status='corroborated')::integer as corroborated_count,
      count(*) filter(where has_first=true)::integer as first_discoveries,
      count(*) filter(where effective_status in ('verified','corroborated','rejected','contested'))::integer as decided_count
    from normalized
    group by specialty_key
  ), scored as (
    select
      a.*,
      (a.verified_count*v_verified_points + a.corroborated_count*v_corroborated_points + a.first_discoveries*v_first_bonus)::integer as specialty_points,
      (a.verified_count+a.corroborated_count)::integer as accepted_count,
      case when a.decided_count=0 then 0::numeric else least(1,greatest(0,(a.verified_count+a.corroborated_count)::numeric/a.decided_count::numeric)) end::numeric(5,4) as acceptance_rate
    from aggregated a
  )
  select
    p_user_id,
    s.specialty_key,
    s.specialty_points,
    s.verified_count,
    s.corroborated_count,
    s.first_discoveries,
    s.accepted_count,
    s.decided_count,
    s.acceptance_rate,
    coalesce((
      select r.rank_key
      from public.echo_community_specialty_rules r
      where r.policy_version='specialty-v1-shadow'
        and r.specialty_key=s.specialty_key
        and s.specialty_points>=r.min_points
        and s.verified_count>=r.min_verified
        and s.acceptance_rate>=r.min_acceptance_rate
      order by r.ordinal desc
      limit 1
    ),'none') as earned_rank,
    'specialty-v1-shadow',
    now()
  from scored s;
end;
$$;
revoke all on function public.echo_recompute_community_reputation(uuid) from public,anon,authenticated,service_role;

alter table public.echo_community_specialty_catalog enable row level security;
alter table public.echo_community_specialty_rules enable row level security;
alter table public.echo_community_specialty_stats enable row level security;

revoke all on table public.echo_community_specialty_catalog from public,anon,authenticated;
revoke all on table public.echo_community_specialty_rules from public,anon,authenticated;
revoke all on table public.echo_community_specialty_stats from public,anon,authenticated;

grant select on table public.echo_community_specialty_catalog to authenticated;
grant select on table public.echo_community_specialty_rules to authenticated;
grant select on table public.echo_community_specialty_stats to authenticated;

drop policy if exists echo_community_specialty_catalog_read on public.echo_community_specialty_catalog;
create policy echo_community_specialty_catalog_read on public.echo_community_specialty_catalog
for select to authenticated using (active=true);

drop policy if exists echo_community_specialty_rules_read on public.echo_community_specialty_rules;
create policy echo_community_specialty_rules_read on public.echo_community_specialty_rules
for select to authenticated using (policy_version='specialty-v1-shadow');

drop policy if exists echo_community_specialty_stats_self_or_admin on public.echo_community_specialty_stats;
create policy echo_community_specialty_stats_self_or_admin on public.echo_community_specialty_stats
for select to authenticated using (user_id=(select auth.uid()) or (select public.echo_is_admin()));

-- Recalcula o materializado existente com especialidades, sem entrada do cliente.
do $$
declare r record;
begin
  for r in select p.id from public.profiles p loop
    perform public.echo_recompute_community_reputation(r.id);
  end loop;
end $$;

comment on table public.echo_community_specialty_stats is
  'Especialidades comunitárias materializadas por conhecimento único e revisão independente. Não concedem autoridade.';
comment on table public.echo_community_specialty_rules is
  'Política versionada de especialidades; leitura autenticada, sem escrita pelo cliente.';
comment on function public.echo_recompute_community_reputation(uuid) is
  'Reputaçao quality-v2 + especialidades specialty-v1-shadow, ambas por conhecimento único e revisão independente.';

commit;
