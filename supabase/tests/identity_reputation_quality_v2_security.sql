-- Echo Identity — Reputation Quality V2: contrato de segurança e transparência.
-- Executar somente no SNV após a migration V2 de reputação.

begin;
do $$
declare
  v_meta public.echo_reputation_policy_meta%rowtype;
  v_rules integer;
  v_def text;
begin
  select * into v_meta from public.echo_reputation_policy_meta where singleton=true;
  if v_meta.policy_version is distinct from 'quality-v2'
     or v_meta.verified_points <> 10
     or v_meta.corroborated_points <> 4
     or v_meta.first_discovery_bonus <> 15 then
    raise exception 'reputation policy weights mismatch';
  end if;

  select count(*) into v_rules
  from public.echo_reputation_tier_rules
  where policy_version='quality-v2';
  if v_rules <> 7 then raise exception 'reputation tier rule count mismatch'; end if;

  if not exists(select 1 from public.echo_reputation_tier_rules where policy_version='quality-v2' and tier='echo_scout' and min_points=30 and min_verified=3 and min_acceptance_rate=0) then
    raise exception 'echo_scout rule mismatch';
  end if;
  if not exists(select 1 from public.echo_reputation_tier_rules where policy_version='quality-v2' and tier='tracker' and min_points=120 and min_verified=10 and min_acceptance_rate=0.6000) then
    raise exception 'tracker quality rule mismatch';
  end if;
  if not exists(select 1 from public.echo_reputation_tier_rules where policy_version='quality-v2' and tier='cartographer' and min_points=350 and min_verified=25 and min_acceptance_rate=0.7000) then
    raise exception 'cartographer quality rule mismatch';
  end if;
  if not exists(select 1 from public.echo_reputation_tier_rules where policy_version='quality-v2' and tier='analyst' and min_points=900 and min_verified=60 and min_acceptance_rate=0.7500) then
    raise exception 'analyst quality rule mismatch';
  end if;
  if not exists(select 1 from public.echo_reputation_tier_rules where policy_version='quality-v2' and tier='vanguard' and min_points=2500 and min_verified=150 and min_acceptance_rate=0.8000) then
    raise exception 'vanguard quality rule mismatch';
  end if;
  if not exists(select 1 from public.echo_reputation_tier_rules where policy_version='quality-v2' and tier='arena_legend' and min_points=8000 and min_verified=400 and min_first_discoveries=10 and min_acceptance_rate=0.8500) then
    raise exception 'arena_legend quality rule mismatch';
  end if;

  if not has_table_privilege('authenticated','public.echo_reputation_policy_meta','SELECT')
     or not has_table_privilege('authenticated','public.echo_reputation_tier_rules','SELECT') then
    raise exception 'authenticated cannot read transparent reputation policy';
  end if;
  if has_table_privilege('authenticated','public.echo_reputation_policy_meta','INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.echo_reputation_tier_rules','INSERT,UPDATE,DELETE') then
    raise exception 'authenticated can mutate reputation policy';
  end if;
  if has_table_privilege('anon','public.echo_reputation_policy_meta','SELECT')
     or has_table_privilege('anon','public.echo_reputation_tier_rules','SELECT') then
    raise exception 'shadow reputation policy leaked to anon';
  end if;

  select pg_get_functiondef('public.echo_recompute_community_reputation(uuid)'::regprocedure::oid) into v_def;
  if position('echo_reputation_policy_meta' in v_def)=0
     or position('echo_reputation_tier_rules' in v_def)=0
     or position('min_acceptance_rate' in v_def)=0
     or position('verified' in v_def)=0
     or position('corroborated' in v_def)=0
     or position('rejected' in v_def)=0
     or position('contested' in v_def)=0 then
    raise exception 'reputation recompute is not policy-driven';
  end if;
  if position('superseded' in v_def)>0 then
    raise exception 'superseded contribution was treated as quality failure';
  end if;
  if has_function_privilege('authenticated','public.echo_recompute_community_reputation(uuid)','EXECUTE') then
    raise exception 'client can invoke private reputation recompute directly';
  end if;

  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='echo_community_reputation' and column_name='accepted_count'
  ) or not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='echo_community_reputation' and column_name='decided_count'
  ) or not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='echo_community_reputation' and column_name='policy_version'
  ) then
    raise exception 'reputation transparency columns missing';
  end if;
end $$;
rollback;
