begin;
create or replace function public.echo_public_author_cards_v2(p_user_ids uuid[])
returns table(user_id uuid,display_name text,public_handle text,avatar_url text,community_tier text,reputation_points integer,institutional_role text,institutional_label text,primary_module text,primary_specialization text)
language plpgsql security definer stable set search_path='' as $$
begin
  if p_user_ids is null or cardinality(p_user_ids)=0 then return; end if;
  if cardinality(p_user_ids)>100 then raise exception 'too_many_author_cards' using errcode='22023'; end if;
  return query
  select p.id,
    coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.username),''),'Jogador')::text,
    case when ep.profile_visibility='public' then ep.public_handle else null end::text,
    p.avatar_url::text,
    coalesce(r.community_tier,'member')::text,
    coalesce(r.reputation_points,0)::integer,
    case when exists(select 1 from public.echo_founder_authority f where f.user_id=p.id) then 'founder' when exists(select 1 from public.admin_staff_memberships s where s.user_id=p.id and s.active=true) then 'admin' else 'member' end::text,
    case when exists(select 1 from public.echo_founder_authority f where f.user_id=p.id) then 'FUNDADOR' when exists(select 1 from public.admin_staff_memberships s where s.user_id=p.id and s.active=true) then coalesce((select upper(nullif(btrim(s.staff_label),'')) from public.admin_staff_memberships s where s.user_id=p.id and s.active=true),'ADMIN') else null end::text,
    (select g.module_key from public.admin_staff_module_grants g join public.admin_modules m on m.module_key=g.module_key where g.user_id=p.id and g.module_key not in ('dashboard','governance') and m.is_active=true order by m.sort_order,g.module_key limit 1)::text,
    (select c.label from public.echo_community_specialty_stats s join public.echo_community_specialty_catalog c on c.specialty_key=s.specialty_key where s.user_id=p.id and s.earned_rank in ('specialist','reference','master') and c.active=true order by case s.earned_rank when 'master' then 3 when 'reference' then 2 else 1 end desc,s.specialty_points desc,c.label limit 1)::text
  from public.profiles p left join public.echo_public_profiles ep on ep.user_id=p.id left join public.echo_community_reputation r on r.user_id=p.id
  where p.id=any(p_user_ids) and coalesce(p.is_blocked,false)=false;
end $$;
revoke all on function public.echo_public_author_cards_v2(uuid[]) from public;
grant execute on function public.echo_public_author_cards_v2(uuid[]) to anon,authenticated;

create or replace view public.v_popular_builds as
select b.id,b.title,b.hero_id,h.name as hero_name,p.username,p.display_name,b.likes,b.views,b.created_at,b.user_id
from public.builds b join public.heroes h on h.id=b.hero_id join public.profiles p on p.id=b.user_id
where b.is_public=true order by b.likes desc,b.views desc,b.created_at desc;
grant select on public.v_popular_builds to anon,authenticated;
commit;
