-- Echo Identity V5 Shadow — Missões Echo baseadas em progresso real.
-- Missões orientam a jornada, mas não concedem pontos, badges ou autoridade.
-- Destino exclusivo: Supabase SNV. Não habilita rollout público.

begin;

create table if not exists public.echo_research_mission_catalog (
  mission_key text primary key,
  policy_version text not null,
  sort_order smallint not null check (sort_order between 1 and 100),
  title text not null,
  description text not null,
  icon_key text not null,
  metric_key text not null check (metric_key in (
    'accepted_knowledge','verified_knowledge','decided_knowledge','first_discoveries','active_specialties'
  )),
  target_value integer not null check (target_value>=1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(policy_version,sort_order)
);

insert into public.echo_research_mission_catalog(
  mission_key,policy_version,sort_order,title,description,icon_key,metric_key,target_value,active,updated_at
) values
  ('first_signal','missions-v5-shadow',1,'Primeiro sinal','Tenha um conhecimento aceito após revisão e confirmação independentes.','signal','accepted_knowledge',1,true,now()),
  ('verified_trio','missions-v5-shadow',2,'Trilha confiável','Alcance três conhecimentos verificados e confirmados.','verified','verified_knowledge',3,true,now()),
  ('field_notebook','missions-v5-shadow',3,'Caderno de campo','Tenha cinco conhecimentos com decisão independente confirmada.','notebook','decided_knowledge',5,true,now()),
  ('two_fronts','missions-v5-shadow',4,'Duas frentes','Contribua com conhecimento aceito em duas especialidades diferentes.','compass','active_specialties',2,true,now()),
  ('first_discovery','missions-v5-shadow',5,'Marco pioneiro','Conquiste uma Primeira descoberta confirmada para um conhecimento único.','discovery','first_discoveries',1,true,now()),
  ('trusted_researcher','missions-v5-shadow',6,'Mapa em expansão','Alcance dez conhecimentos aceitos e confirmados.','map','accepted_knowledge',10,true,now())
on conflict(mission_key) do update set
  policy_version=excluded.policy_version,
  sort_order=excluded.sort_order,
  title=excluded.title,
  description=excluded.description,
  icon_key=excluded.icon_key,
  metric_key=excluded.metric_key,
  target_value=excluded.target_value,
  active=excluded.active,
  updated_at=now();

create or replace function public.echo_my_research_missions_v5()
returns table(
  mission_key text,
  title text,
  description text,
  icon_key text,
  metric_key text,
  current_value integer,
  target_value integer,
  completed boolean,
  policy_version text,
  awards_reputation boolean
)
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and coalesce(p.is_blocked,false)=false) then
    raise exception 'active_profile_required' using errcode='42501';
  end if;

  return query
  with snapshot as (
    select
      coalesce(r.accepted_count,0)::integer as accepted_knowledge,
      coalesce(r.verified_count,0)::integer as verified_knowledge,
      coalesce(r.decided_count,0)::integer as decided_knowledge,
      coalesce(r.first_discoveries,0)::integer as first_discoveries,
      coalesce((
        select count(*)::integer
        from public.echo_community_specialty_stats s
        where s.user_id=v_uid and s.accepted_count>0
      ),0)::integer as active_specialties
    from (select 1) seed
    left join public.echo_community_reputation r on r.user_id=v_uid
  ), progress as (
    select
      m.*,
      case m.metric_key
        when 'accepted_knowledge' then s.accepted_knowledge
        when 'verified_knowledge' then s.verified_knowledge
        when 'decided_knowledge' then s.decided_knowledge
        when 'first_discoveries' then s.first_discoveries
        when 'active_specialties' then s.active_specialties
        else 0
      end::integer as value_now
    from public.echo_research_mission_catalog m
    cross join snapshot s
    where m.active=true and m.policy_version='missions-v5-shadow'
  )
  select
    p.mission_key,p.title,p.description,p.icon_key,p.metric_key,
    p.value_now,p.target_value,(p.value_now>=p.target_value),p.policy_version,false
  from progress p
  order by p.sort_order;
end;
$$;
revoke all on function public.echo_my_research_missions_v5() from public,anon;
grant execute on function public.echo_my_research_missions_v5() to authenticated,service_role;

create or replace function public.echo_my_research_guardrails_v5()
returns jsonb
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_policy public.echo_research_guardrail_policy%rowtype;
  v_recent integer;
  v_pending integer;
  v_awaiting integer;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and coalesce(p.is_blocked,false)=false) then
    raise exception 'active_profile_required' using errcode='42501';
  end if;

  select * into v_policy from public.echo_research_guardrail_policy where singleton=true;
  if not found then raise exception 'research_guardrail_policy_missing' using errcode='55000'; end if;

  select count(*)::integer into v_recent
  from public.echo_research_contributions c
  where c.contributor_id=v_uid
    and c.submitted_at>now()-(v_policy.submission_window_minutes*interval '1 minute');

  select
    count(*) filter(where c.status='pending')::integer,
    count(*) filter(where c.review_confirmation_state='awaiting_confirmation')::integer
  into v_pending,v_awaiting
  from public.echo_research_contributions c
  where c.contributor_id=v_uid;

  return jsonb_build_object(
    'policy_version',v_policy.policy_version,
    'submission_window_minutes',v_policy.submission_window_minutes,
    'max_submissions_per_window',v_policy.max_submissions_per_window,
    'submissions_in_window',coalesce(v_recent,0),
    'submissions_remaining',greatest(0,v_policy.max_submissions_per_window-coalesce(v_recent,0)),
    'max_pending_per_member',v_policy.max_pending_per_member,
    'pending_total',coalesce(v_pending,0),
    'pending_capacity_remaining',greatest(0,v_policy.max_pending_per_member-coalesce(v_pending,0)),
    'max_pending_per_member_knowledge',v_policy.max_pending_per_member_knowledge,
    'knowledge_cooldown_minutes',v_policy.knowledge_cooldown_minutes,
    'awaiting_independent_confirmation',coalesce(v_awaiting,0),
    'independent_confirmation_required',v_policy.independent_confirmation_required,
    'missions_award_reputation',false,
    'scoring_mode','confirmed_current_decision_only'
  );
end;
$$;
revoke all on function public.echo_my_research_guardrails_v5() from public,anon;
grant execute on function public.echo_my_research_guardrails_v5() to authenticated,service_role;

alter table public.echo_research_mission_catalog enable row level security;
revoke all on table public.echo_research_mission_catalog from public,anon,authenticated;
grant select on table public.echo_research_mission_catalog to authenticated;

drop policy if exists echo_research_mission_catalog_read on public.echo_research_mission_catalog;
create policy echo_research_mission_catalog_read on public.echo_research_mission_catalog
for select to authenticated using (active=true and policy_version='missions-v5-shadow');

comment on table public.echo_research_mission_catalog is
  'Jornadas de orientação calculadas a partir da reputação confirmada atual. Missões nunca criam pontos, badges ou autoridade.';
comment on function public.echo_my_research_missions_v5() is
  'Retorna progresso real do usuário em missões Shadow. awards_reputation é sempre false.';
comment on function public.echo_my_research_guardrails_v5() is
  'Resumo seguro dos limites versionados e da fila própria; não expõe conteúdo de revisão nem dados de outros membros.';

commit;
