-- EchoArena — etapa de compatibilidade para rollout MFA sem downtime.
-- Esta migration é deliberadamente aditiva: cria apenas o helper que o novo
-- frontend usa para reconhecer uma conta administrativa em AAL1 e permitir
-- a inscrição/desafio TOTP. Ela NÃO concede privilégio administrativo e NÃO
-- altera is_admin()/RLS/policies existentes. O enforcement AAL2 vem nas
-- migrations 20260823061000 e 20260823061500.

begin;

create or replace function public.echo_admin_identity()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      left join public.roles r on r.id = p.role_id
      where p.id = auth.uid()
        and coalesce(p.is_blocked, false) = false
        and (
          coalesce(p.is_admin, false) = true
          or lower(coalesce(p.role, '')) = 'admin'
          or lower(coalesce(r.name, '')) = 'admin'
        )
    );
$function$;

revoke execute on function public.echo_admin_identity() from public, anon;
grant execute on function public.echo_admin_identity() to authenticated;

comment on function public.echo_admin_identity()
is 'Compatibilidade do rollout MFA: identifica conta admin ativa em AAL1 somente para permitir inscrição/desafio TOTP; não concede privilégio administrativo.';

commit;
