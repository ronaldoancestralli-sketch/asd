-- EchoArena — hardening estrutural dos papéis expostos à Data API.
-- Clientes anon/authenticated nunca precisam criar triggers/FKs nem truncar relações.
-- Não altera SELECT/INSERT/UPDATE/DELETE nem service_role.

revoke truncate, references, trigger
on all tables in schema public
from anon, authenticated;

-- Evita que migrations futuras recriem esses grants para objetos de tabela
-- criados pelo owner atual das migrations.
alter default privileges in schema public
revoke truncate, references, trigger on tables
from anon, authenticated;
