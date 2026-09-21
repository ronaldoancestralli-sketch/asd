-- Echo Identity — Reputation Quality V2 em Shadow.
-- Política de progressão versionada, transparente e calculada inteiramente no servidor.
-- Destino exclusivo: Supabase SNV. Nenhum rollout público é ativado por esta migration.

begin;

-- ---------------------------------------------------------------------------
-- 1. Fonte única de verdade da política de reputação.
-- Usuários autenticados podem LER a política; ninguém recebe write via cliente.
-- ---------------------------------------------------------------------------
create table if not exists public.echo_reputation_policy_meta (
  singleton boolean primary key default true check (singleton = true),
  policy_version text not null,
  verified_points integer not null check (verified_points >= 0),
  corroborated_points integer not null check (corroborated_points >= 0),
  first_discovery_bonus integer not null check (first_discovery_bonus >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.echo_reputation_tier_rules (
  policy_version text not null,
  tier text not null check (tier in ('member','echo_scout','tracker','cartographer','analyst','vanguard','arena_legend')),
  ordinal smallint not null check (ordinal between 0 and 6),
  label text not null,
  min_points integer not null check (min_points >= 0),
  min_verified integer not null check (min_verified >= 0),
  min_first_discoveries integer not null default 0 check (min_first_discoveries >= 0),
  min_acceptance_rate numeric(5,4) not null default 0 check (min_acceptance_rate between 0 and 1),
  primary key (policy_version,tier),
  unique (policy_version,ordinal)
);

insert into public.echo_reputation_policy_meta(singleton,policy_version,verified_points,corroborated_points,first_discovery_bonus,updated_at)
values(true,'quality-v2',10,4,15,now())
on conflict(singleton) do update set
  policy_version=excluded.policy_version,
  verified_points=excluded.verified_points,
  corroborated_points=excluded.corroborated_points,
  first_discovery_bonus=excluded.first_discovery_bonus,
  updated_at=now();

insert into public.echo_reputation_tier_rules(
  policy_version,tier,ordinal,label,min_points,min_verified,min_first_discoveries,min_acceptance_rate
) values
  ('quality-v2','member',0,'Member',0,0,0,0),
  ('quality-v2','echo_scout',1,'Echo Scout',30,3,0,0),
  ('quality-v2','tracker',2,'Rastreador',120,10,0,0.6000),
  ('quality-v2','cartographer',3,'Cartógrafo',350,25,0,0.7000),
  ('quality-v2','analyst',4,'Analista',900,60,0,0.7500),
  ('quality-v2','vanguard',5,'Vanguarda',2500,150,0,0.8000),
  ('quality-v2','arena_legend',6,'Lenda da Arena',8000,400,10,0.8500)
on conflict(policy_version,tier) do update set
  ordinal=excluded.ordinal,
  label=excluded.label,
  min_points=excluded.min_points,
  min_verified=excluded.min_verified,
  min_first_discoveries=excluded.min_first_discoveries,
  min_acceptance_rate=excluded.min_acceptance_rate;

-- ---------------------------------------------------------------------------
-- 2. Estado materializado da conta ganha contexto suficiente para explicar o cálculo.
-- Esses campos continuam privados/self-or-admin pela policy existente.
-- ---------------------------------------------------------------------------
alter table public.echo_community_reputation
  add column if not exists accepted_count integer not null default 0 check (accepted_count >= 0),
  add column if not exists decided_count integer not null default 0 check (decided_count >= 0),
  add column if not exists policy_version text not null default 'quality-v2';

-- ---------------------------------------------------------------------------
-- 3. Recalculo determinístico usando a MESMA política exibida ao usuário.
-- Rejected/contested não retiram pontos diretamente; reduzem a taxa de aceitação.
-- Superseded e pending não entram no denominador: obsolescência/espera não significam erro.
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

  select
    count(*) filter(where status='verified')::integer,
    count(*) filter(where status='corroborated')::integer,
    count(*) filter(where status='verified' and is_first_discovery=true)::integer,
    count(*) filter(where status in ('verified','corroborated','rejected','contested'))::integer
  into v_verified,v_corroborated,v_first,v_decided
  from public.echo_research_contributions
  where contributor_id=p_user_id;

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

-- Recalcula todos os registros existentes com a nova política. A função não usa entrada do cliente.
do $$
declare r record;
begin
  for r in select p.id from public.profiles p loop
    perform public.echo_recompute_community_reputation(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Política é transparente, porém imutável pelo cliente.
-- ---------------------------------------------------------------------------
alter table public.echo_reputation_policy_meta enable row level security;
alter table public.echo_reputation_tier_rules enable row level security;

revoke all on table public.echo_reputation_policy_meta from public,anon,authenticated;
revoke all on table public.echo_reputation_tier_rules from public,anon,authenticated;

grant select on table public.echo_reputation_policy_meta to authenticated;
grant select on table public.echo_reputation_tier_rules to authenticated;

drop policy if exists echo_reputation_policy_meta_read on public.echo_reputation_policy_meta;
create policy echo_reputation_policy_meta_read on public.echo_reputation_policy_meta
for select to authenticated using (true);

drop policy if exists echo_reputation_tier_rules_read on public.echo_reputation_tier_rules;
create policy echo_reputation_tier_rules_read on public.echo_reputation_tier_rules
for select to authenticated using (true);

comment on table public.echo_reputation_policy_meta is
  'Pesos versionados da reputação Echo Scouts. Leitura autenticada; nenhuma escrita pelo cliente.';
comment on table public.echo_reputation_tier_rules is
  'Requisitos transparentes e versionados de cada nível Echo Scout; usados diretamente pelo recompute do servidor.';
comment on column public.echo_community_reputation.accepted_count is
  'Quantidade atual de contribuições corroborated + verified.';
comment on column public.echo_community_reputation.decided_count is
  'Quantidade atual de contribuições verified/corroborated/rejected/contested; base da taxa de aceitação.';
comment on column public.echo_community_reputation.policy_version is
  'Versão da política usada no último recálculo server-side.';
comment on function public.echo_recompute_community_reputation(uuid) is
  'Recalcula pontos, taxa e tier usando a política versionada das tabelas echo_reputation_policy_*; não concede autoridade institucional.';

commit;
