-- EchoArena
-- Otimiza chamadas auth/helper em RLS para initplan e remove duas policies
-- permissivas mais fracas que anulavam restrições de segurança paralelas.

-- comments_insert_own permitia INSERT apenas por ownership e, por ser permissiva,
-- anulava a exigência NOT is_blocked() de comments_insert.
drop policy if exists comments_insert_own on public.comments;

-- profiles_update_own permitia UPDATE por ownership e anulava, por OR permissivo,
-- as restrições de bloqueio/preservação de role de profiles_self_upd.
drop policy if exists profiles_update_own on public.profiles;

-- comments_own é duplicata legada de comments_delete_own e está em TO public.
drop policy if exists comments_own on public.comments;

-- Notifications.
drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own
on public.notifications for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_admin())
);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
on public.notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- User achievements / badges.
drop policy if exists user_achievements_read on public.user_achievements;
create policy user_achievements_read
on public.user_achievements for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_admin())
);

drop policy if exists user_badges_read on public.user_badges;
create policy user_badges_read
on public.user_badges for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_admin())
);

-- Reports.
drop policy if exists reports_insert on public.reports;
create policy reports_insert
on public.reports for insert to authenticated
with check (reporter_id = (select auth.uid()));

drop policy if exists reports_read_own on public.reports;
create policy reports_read_own
on public.reports for select to authenticated
using (
  reporter_id = (select auth.uid())
  or (select public.is_admin())
);

-- Comment likes.
drop policy if exists comment_likes_manage on public.comment_likes;
create policy comment_likes_manage
on public.comment_likes for all to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_admin())
)
with check (
  user_id = (select auth.uid())
  or (select public.is_admin())
);

-- Build ratings.
drop policy if exists build_ratings_insert_own on public.build_ratings;
create policy build_ratings_insert_own
on public.build_ratings for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.builds b
    where b.id = build_ratings.build_id
      and b.visibility = 'public'
      and b.status = 'published'
      and b.user_id <> (select auth.uid())
  )
);

drop policy if exists build_ratings_update_own on public.build_ratings;
create policy build_ratings_update_own
on public.build_ratings for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists build_ratings_delete_own on public.build_ratings;
create policy build_ratings_delete_own
on public.build_ratings for delete to authenticated
using (user_id = (select auth.uid()));

-- Site pages: preservar exatamente o critério legado, apenas evitando reavaliar
-- auth.uid() por linha.
drop policy if exists site_pages_admin_read on public.site_pages;
create policy site_pages_admin_read
on public.site_pages for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (
        coalesce(p.is_admin, false) = true
        or lower(coalesce(p.role, '')) = 'admin'
      )
  )
);

drop policy if exists site_pages_admin_insert on public.site_pages;
create policy site_pages_admin_insert
on public.site_pages for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (
        coalesce(p.is_admin, false) = true
        or lower(coalesce(p.role, '')) = 'admin'
      )
  )
);

drop policy if exists site_pages_admin_update on public.site_pages;
create policy site_pages_admin_update
on public.site_pages for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (
        coalesce(p.is_admin, false) = true
        or lower(coalesce(p.role, '')) = 'admin'
      )
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (
        coalesce(p.is_admin, false) = true
        or lower(coalesce(p.role, '')) = 'admin'
      )
  )
);

drop policy if exists site_pages_admin_delete on public.site_pages;
create policy site_pages_admin_delete
on public.site_pages for delete to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (
        coalesce(p.is_admin, false) = true
        or lower(coalesce(p.role, '')) = 'admin'
      )
  )
);

-- Comments: única policy de INSERT de usuário preserva bloqueio.
drop policy if exists comments_insert on public.comments;
create policy comments_insert
on public.comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and not (select public.is_blocked())
);

-- Profiles: única policy self-update de usuário preserva bloqueio e role atual.
drop policy if exists profiles_self_upd on public.profiles;
create policy profiles_self_upd
on public.profiles for update to authenticated
using (
  id = (select auth.uid())
  and not (select public.is_blocked())
)
with check (
  id = (select auth.uid())
  and role = (
    select p.role
    from public.profiles p
    where p.id = (select auth.uid())
  )
);
