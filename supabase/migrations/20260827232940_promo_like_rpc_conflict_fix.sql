-- SNV: corrige a ambiguidade entre promo_id de RETURNS TABLE e do ON CONFLICT.
-- Preserva contrato, autorização, segredo privado e uma curtida por conta/campanha.
create or replace function public.promo_like_and_reveal(p_promo_id uuid)
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
    raise exception 'promo_authentication_required' using errcode = '42501';
  end if;

  if public.is_blocked() then
    raise exception 'promo_user_blocked' using errcode = '42501';
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
    raise exception 'promo_not_available' using errcode = '22023';
  end if;

  insert into public.promo_likes as existing_like(promo_id, user_id)
  values (p_promo_id, v_user_id)
  on conflict on constraint promo_likes_pkey do update
    set created_at = existing_like.created_at
  returning existing_like.created_at into v_liked_at;

  select s.code into v_code
  from private.promo_secrets s
  where s.promo_id = p_promo_id;

  if nullif(btrim(v_code), '') is null then
    raise exception 'promo_code_unavailable' using errcode = 'P0001';
  end if;

  return query select p_promo_id, v_code, v_liked_at;
end;
$function$;

revoke execute on function public.promo_like_and_reveal(uuid) from public, anon;
grant execute on function public.promo_like_and_reveal(uuid) to authenticated;
