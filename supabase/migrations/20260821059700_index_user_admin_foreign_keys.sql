-- EchoArena — índices direcionados da frente de usuários/Admin.
-- Cobrem apenas FKs apontadas pelo Advisor neste módulo.

create index if not exists idx_profiles_role_id
  on public.profiles(role_id);

create index if not exists idx_user_moderation_log_actor_id
  on public.user_moderation_log(actor_id);
