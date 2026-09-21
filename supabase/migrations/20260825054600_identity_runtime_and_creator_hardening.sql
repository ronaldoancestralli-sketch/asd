-- Echo Identity V1 — hardening de runtime e integridade de Creator.
-- Corrige acesso OLD/NEW por operação e impede Creator ativo sem claim verificado.

begin;

create or replace function public.echo_identity_audit_authority_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_target uuid;
  v_value text;
  v_action text;
  v_reason text;
  v_previous uuid;
begin
  if tg_table_name='echo_identity_badges' then
    if tg_op='INSERT' then
      v_target:=new.user_id; v_value:=new.badge_type; v_reason:=new.grant_reason; v_action:='grant';
    elsif tg_op='DELETE' then
      v_target:=old.user_id; v_value:=old.badge_type; v_reason:=old.grant_reason; v_action:='revoke';
    else
      v_target:=new.user_id; v_value:=new.badge_type; v_reason:=coalesce(new.grant_reason,old.grant_reason);
      v_action:=case when old.active=false and new.active=true then 'grant' when old.active=true and new.active=false then 'revoke' else 'replace' end;
    end if;
    insert into public.echo_identity_authority_audit(target_user_id,authority_kind,authority_value,action,actor_user_id,actor_role,reason,context)
    values(v_target,'badge',v_value,v_action,auth.uid(),auth.role(),v_reason,jsonb_build_object('operation',tg_op));
  else
    if tg_op='INSERT' then
      v_target:=new.user_id; v_reason:=new.assignment_reason; v_action:='grant'; v_previous:=null;
    elsif tg_op='DELETE' then
      v_target:=old.user_id; v_reason:=old.assignment_reason; v_action:='revoke'; v_previous:=old.user_id;
    else
      v_target:=new.user_id; v_reason:=coalesce(new.assignment_reason,old.assignment_reason); v_action:='transfer'; v_previous:=old.user_id;
    end if;
    insert into public.echo_identity_authority_audit(target_user_id,authority_kind,authority_value,action,actor_user_id,actor_role,reason,context)
    values(v_target,'founder','founder',v_action,auth.uid(),auth.role(),v_reason,jsonb_build_object('operation',tg_op,'previous_user_id',v_previous));
  end if;
  return null;
end;
$$;
revoke all on function public.echo_identity_audit_authority_change() from public, anon, authenticated, service_role;

create or replace function public.echo_research_reputation_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid;
begin
  if tg_op='DELETE' then v_user_id:=old.contributor_id; else v_user_id:=new.contributor_id; end if;
  perform public.echo_recompute_community_reputation(v_user_id);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.echo_research_reputation_trigger() from public, anon, authenticated, service_role;

-- Defense-in-depth: nem escrita server-side direta ativa Creator sem verificação correspondente.
create or replace function public.echo_guard_institutional_badge()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.badge_type='creator' and new.active=true and not exists(
    select 1 from public.echo_creator_claims c
    where c.user_id=new.user_id and c.status='verified'
  ) then
    raise exception 'creator_badge_requires_verified_claim' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.echo_guard_institutional_badge() from public, anon, authenticated, service_role;

drop trigger if exists echo_identity_badges_guard on public.echo_identity_badges;
create trigger echo_identity_badges_guard
before insert or update of badge_type,active on public.echo_identity_badges
for each row execute function public.echo_guard_institutional_badge();

comment on function public.echo_guard_institutional_badge() is
  'Creator ativo exige claim previamente verified; conta, pontos ou ação direta de badge não bastam.';

commit;
