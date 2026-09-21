begin;
create or replace function public.echo_public_content_verifications_v1(p_content_type text,p_content_ids text[])
returns table(content_id text,status text,verification_kind text,module_key text,verified_at timestamptz,game_patch text,criteria text,verifier_name text,verifier_role text)
language plpgsql security definer stable set search_path='' as $$
begin
  if p_content_ids is null or cardinality(p_content_ids)=0 then return; end if;
  if cardinality(p_content_ids)>100 then raise exception 'too_many_content_ids' using errcode='22023'; end if;
  if char_length(coalesce(p_content_type,''))>80 then raise exception 'invalid_content_type' using errcode='22023'; end if;
  return query
  select v.content_id,v.status,v.verification_kind,v.module_key,v.verified_at,v.game_patch,v.criteria,
    coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.username),''),'Echo Arena')::text,
    case when exists(select 1 from public.echo_founder_authority f where f.user_id=v.verified_by) then 'FUNDADOR' else coalesce((select upper(nullif(btrim(s.staff_label),'')) from public.admin_staff_memberships s where s.user_id=v.verified_by and s.active=true),'ECHO ARENA') end::text
  from public.echo_content_verifications v left join public.profiles p on p.id=v.verified_by
  where v.content_type=p_content_type and v.content_id=any(p_content_ids);
end $$;
revoke all on function public.echo_public_content_verifications_v1(text,text[]) from public;
grant execute on function public.echo_public_content_verifications_v1(text,text[]) to anon,authenticated;
commit;
