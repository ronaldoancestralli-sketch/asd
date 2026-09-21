begin;

create table if not exists public.echo_content_verifications(
  id bigint generated always as identity primary key,
  content_type text not null,
  content_id text not null,
  status text not null default 'verified' check(status in('verified','review_required','revoked')),
  verification_kind text not null default 'verified' check(verification_kind in('verified','official')),
  module_key text references public.admin_modules(module_key),
  verified_by uuid references auth.users(id),
  verified_at timestamptz not null default now(),
  game_patch text,
  criteria text,
  notes text,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  unique(content_type,content_id)
);
create table if not exists public.echo_content_revisions(
  id bigint generated always as identity primary key,
  content_type text not null,
  content_id text not null,
  revision_no integer not null,
  editor_id uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  material_change boolean not null default true,
  summary text,
  unique(content_type,content_id,revision_no)
);
create table if not exists public.echo_specializations(
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  specialization_key text not null,
  label text not null,
  earned_at timestamptz not null default now(),
  source text not null default 'earned',
  unique(user_id,specialization_key)
);
create table if not exists public.echo_seasons(
  id bigint generated always as identity primary key,
  season_key text unique not null,
  label text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check(status in('scheduled','active','closed'))
);
create table if not exists public.echo_season_reputation(
  season_id bigint not null references public.echo_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  points bigint not null default 0,
  useful_contributions integer not null default 0,
  primary key(season_id,user_id)
);
create table if not exists public.echo_rare_achievements(
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,
  label text not null,
  earned_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(user_id,achievement_key)
);
create table if not exists public.echo_endorsements(
  id bigint generated always as identity primary key,
  content_type text not null,
  content_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  endorsement_kind text not null default 'player' check(endorsement_kind in('player','specialist')),
  created_at timestamptz not null default now(),
  unique(content_type,content_id,user_id)
);
create table if not exists public.echo_achievement_feed(
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  event_type text not null,
  title text not null,
  visibility text not null default 'public' check(visibility in('public','private')),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.echo_reputation_abuse_signals(
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id),
  signal_type text not null,
  severity text not null default 'attention',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  status text not null default 'open'
);

create or replace function public.echo_mark_content_verified(
  p_content_type text,p_content_id text,p_module_key text,p_kind text,p_patch text,p_criteria text,p_notes text default null
) returns bigint language plpgsql security definer set search_path=public,auth as $$
declare v_id bigint; v_cap text;
begin
  v_cap:=case p_module_key when 'heroes' then 'heroes.validate' when 'equipment' then 'equipment.validate' when 'publishing' then 'publishing.publish' else null end;
  if v_cap is null or not public.echo_has_admin_capability(v_cap) then raise exception 'MODULE_VALIDATION_DENIED' using errcode='42501'; end if;
  if p_kind not in('verified','official') then raise exception 'INVALID_VERIFICATION_KIND'; end if;
  insert into public.echo_content_verifications(content_type,content_id,status,verification_kind,module_key,verified_by,game_patch,criteria,notes)
  values(p_content_type,p_content_id,'verified',p_kind,p_module_key,auth.uid(),p_patch,p_criteria,p_notes)
  on conflict(content_type,content_id) do update set status='verified',verification_kind=excluded.verification_kind,module_key=excluded.module_key,verified_by=auth.uid(),verified_at=now(),game_patch=excluded.game_patch,criteria=excluded.criteria,notes=excluded.notes,revoked_at=null,revoked_by=null
  returning id into v_id;
  perform public.echo_write_admin_audit(p_module_key,v_cap,'verify_content',p_content_type,p_content_id,p_notes,null,jsonb_build_object('verification_id',v_id,'patch',p_patch,'kind',p_kind),null);
  return v_id;
end $$;

create or replace function public.echo_mark_verification_review_required(p_content_type text,p_content_id text,p_reason text)
returns boolean language plpgsql security definer set search_path=public,auth as $$
begin
  update public.echo_content_verifications set status='review_required',notes=concat_ws(E'\n',notes,p_reason)
  where content_type=p_content_type and content_id=p_content_id
    and exists(select 1 from public.admin_capabilities c where c.module_key=echo_content_verifications.module_key and c.capability_key in('heroes.validate','equipment.validate','publishing.publish') and public.echo_has_admin_capability(c.capability_key));
  if not found then raise exception 'VERIFICATION_NOT_FOUND_OR_DENIED' using errcode='42501'; end if;
  return true;
end $$;

alter table public.echo_content_verifications enable row level security;
alter table public.echo_content_revisions enable row level security;
alter table public.echo_specializations enable row level security;
alter table public.echo_seasons enable row level security;
alter table public.echo_season_reputation enable row level security;
alter table public.echo_rare_achievements enable row level security;
alter table public.echo_endorsements enable row level security;
alter table public.echo_achievement_feed enable row level security;
alter table public.echo_reputation_abuse_signals enable row level security;

create policy trust_verifications_public_read on public.echo_content_verifications for select using(true);
create policy trust_revisions_public_read on public.echo_content_revisions for select using(true);
create policy trust_specializations_public_read on public.echo_specializations for select using(true);
create policy trust_seasons_public_read on public.echo_seasons for select using(true);
create policy trust_season_rep_public_read on public.echo_season_reputation for select using(true);
create policy trust_rare_public_read on public.echo_rare_achievements for select using(true);
create policy trust_endorsements_public_read on public.echo_endorsements for select using(true);
create policy trust_feed_public_read on public.echo_achievement_feed for select using(visibility='public');
create policy trust_abuse_founder_read on public.echo_reputation_abuse_signals for select to authenticated using(public.echo_is_founder_identity() and public.echo_is_admin());

revoke all on function public.echo_mark_content_verified(text,text,text,text,text,text,text) from public,anon;
grant execute on function public.echo_mark_content_verified(text,text,text,text,text,text,text) to authenticated;
revoke all on function public.echo_mark_verification_review_required(text,text,text) from public,anon;
grant execute on function public.echo_mark_verification_review_required(text,text,text) to authenticated;

commit;
