-- Cobre a FK adicionada por 20260821032000 para evitar varreduras ao consultar
-- ou remover referências de fonte usadas no histórico de habilidades.
create index if not exists balance_history_source_id_idx
  on public.balance_history(source_id)
  where source_id is not null;
