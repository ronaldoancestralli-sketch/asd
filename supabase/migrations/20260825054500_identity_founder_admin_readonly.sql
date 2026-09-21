-- Echo Identity V1 — leitura administrativa do Founder, sem capacidade de transferência.
-- A transferência continua exclusivamente em echo_set_founder_server_only(service_role).

begin;

create or replace function public.admin_identity_founder_status_v1()
returns jsonb
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_user_id uuid;
begin
  if not public.echo_is_admin() then
    raise exception 'admin_aal2_required' using errcode='42501';
  end if;
  select f.user_id into v_user_id from public.echo_founder_authority f where f.singleton=true;
  return jsonb_build_object('user_id',v_user_id,'configured',v_user_id is not null,'mutable_from_admin',false);
end;
$$;

revoke all on function public.admin_identity_founder_status_v1() from public, anon;
grant execute on function public.admin_identity_founder_status_v1() to authenticated;

comment on function public.admin_identity_founder_status_v1() is
  'Leitura AAL2 do Founder para governança Admin. Não concede nem transfere autoridade.';

commit;
