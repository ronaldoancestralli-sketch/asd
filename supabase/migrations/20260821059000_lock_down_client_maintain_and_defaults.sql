-- EchoArena — segunda etapa do lockdown estrutural da Data API.
-- Remove MAINTAIN dos objetos atuais e fecha defaults do owner postgres.
-- Não altera SELECT/INSERT/UPDATE/DELETE nem service_role.
--
-- Observação: Supabase mantém também default ACLs pertencentes a supabase_admin.
-- O role das migrations não possui permissão para ALTER DEFAULT PRIVILEGES FOR ROLE
-- supabase_admin (42501). Não incluir uma instrução impossível no replay: os grants
-- atuais são revogados abaixo e uma suíte de integridade detecta qualquer regressão
-- futura causada por defaults externos à autoridade deste role.

revoke truncate, references, trigger, maintain
on all tables in schema public
from anon, authenticated;

alter default privileges for role postgres in schema public
revoke truncate, references, trigger, maintain on tables
from anon, authenticated;
