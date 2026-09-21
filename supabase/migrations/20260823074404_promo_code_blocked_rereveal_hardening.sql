-- EchoArena — hardening adicional dos códigos promocionais.
-- 1) Uma conta bloqueada não pode recuperar novamente um código previamente curtido.
-- 2) Qualquer exceção administrativa em RLS exige o contrato AAL2 de echo_is_admin().

begin;

create or replace function public.promo_reveal_if_liked(p_promo_id uuid)
returns table(promo_id uuid, code text, liked_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_liked_at timestamptz;
  v_code text;
begin
  if v_user_id is null then
    return;
  end if;

  if public.is_blocked() then
    raise exception 'promo_user_blocked' using errcode = '42501';
  end if;

  select l.created_at into v_liked_at
  from public.promo_likes l
  where l.promo_id = p_promo_id and l.user_id = v_user_id;

  if v_liked_at is null then
    return;
  end if;

  if not exists (
    select 1
    from public.promo_campaigns p
    where p.id = p_promo_id
      and p.published = true
      and p.verification_status = 'verified'
      and p.status = 'active'
      and (p.starts_at is null or p.starts_at <= now())
      and (p.expires_at is null or p.expires_at > now())
  ) then
    return;
  end if;

  select s.code into v_code
  from private.promo_secrets s
  where s.promo_id = p_promo_id;

  if nullif(btrim(v_code), '') is null then
    return;
  end if;

  return query select p_promo_id, v_code, v_liked_at;
end;
$function$;

revoke execute on function public.promo_reveal_if_liked(uuid) from public, anon;
grant execute on function public.promo_reveal_if_liked(uuid) to authenticated;

comment on function public.promo_reveal_if_liked(uuid) is
  'Reexibe o código somente para usuário autenticado, não bloqueado, que já curtiu uma promoção ainda ativa.';

-- Substitui as exceções administrativas AAL1 pelas mesmas garantias AAL2 do Admin real.
drop policy if exists promo_campaigns_authenticated_select on public.promo_campaigns;
create policy promo_campaigns_authenticated_select
on public.promo_campaigns
for select
to authenticated
using (
  (
    published = true
    and verification_status = 'verified'
    and status = 'active'
    and (starts_at is null or starts_at <= now())
    and (expires_at is null or expires_at > now())
  )
  or (select public.echo_is_admin())
);

drop policy if exists promo_campaigns_admin_insert on public.promo_campaigns;
create policy promo_campaigns_admin_insert
on public.promo_campaigns
for insert
to authenticated
with check ((select public.echo_is_admin()));

drop policy if exists promo_campaigns_admin_update on public.promo_campaigns;
create policy promo_campaigns_admin_update
on public.promo_campaigns
for update
to authenticated
using ((select public.echo_is_admin()))
with check ((select public.echo_is_admin()));

drop policy if exists promo_campaigns_admin_delete on public.promo_campaigns;
create policy promo_campaigns_admin_delete
on public.promo_campaigns
for delete
to authenticated
using ((select public.echo_is_admin()));

drop policy if exists promo_likes_authenticated_select on public.promo_likes;
create policy promo_likes_authenticated_select
on public.promo_likes
for select
to authenticated
using (user_id = (select auth.uid()) or (select public.echo_is_admin()));

drop policy if exists promo_likes_authenticated_delete on public.promo_likes;
create policy promo_likes_authenticated_delete
on public.promo_likes
for delete
to authenticated
using (user_id = (select auth.uid()) or (select public.echo_is_admin()));

commit;
