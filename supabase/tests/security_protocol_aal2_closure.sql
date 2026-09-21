-- EchoArena — regressões dos últimos bypasses AAL2.

begin;

do $$
declare
  v_count integer;
begin
  if has_table_privilege('authenticated', 'public.profiles', 'select') then
    raise exception 'aal2_closure_regression: authenticated regained table-level SELECT on profiles';
  end if;

  if has_table_privilege('anon', 'public.profiles', 'select') then
    raise exception 'aal2_closure_regression: anon regained table-level SELECT on profiles';
  end if;

  if not has_column_privilege('authenticated', 'public.profiles', 'display_name', 'select')
     or not has_column_privilege('anon', 'public.profiles', 'display_name', 'select') then
    raise exception 'aal2_closure_regression: public profile columns are no longer readable';
  end if;

  if has_column_privilege('authenticated', 'public.profiles', 'role', 'select')
     or has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'select')
     or has_column_privilege('authenticated', 'public.profiles', 'is_blocked', 'select') then
    raise exception 'aal2_closure_regression: sensitive profile columns became globally readable';
  end if;

  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'site_pages'
    and policyname in ('site_pages_admin_delete','site_pages_admin_insert','site_pages_admin_update')
    and (
      coalesce(qual, '') ilike '%from profiles%'
      or coalesce(with_check, '') ilike '%from profiles%'
      or (coalesce(qual, '') <> '' and coalesce(qual, '') not ilike '%is_admin%')
      or (coalesce(with_check, '') <> '' and coalesce(with_check, '') not ilike '%is_admin%')
    );
  if v_count <> 0 then
    raise exception 'aal2_closure_regression: site_pages has % admin policy/policies outside centralized is_admin()', v_count;
  end if;

  select count(*) into v_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname in ('site_content_admin_delete','site_content_admin_update','site_content_admin_upload')
    and (
      coalesce(qual, '') ilike '%from profiles%'
      or coalesce(with_check, '') ilike '%from profiles%'
      or (
        coalesce(qual, '') <> ''
        and coalesce(qual, '') not ilike '%current_user_is_admin%'
      )
      or (
        coalesce(with_check, '') <> ''
        and coalesce(with_check, '') not ilike '%current_user_is_admin%'
      )
    );
  if v_count <> 0 then
    raise exception 'aal2_closure_regression: site-content Storage has % policy/policies outside centralized AAL2 helper', v_count;
  end if;
end
$$;

rollback;
