-- EchoArena
-- pg_trgm é relocável e o schema extensions já é usado pelo projeto.
-- Nenhuma função do projeto depende de similarity()/word_similarity() sem
-- qualificação e não há índices trigram existentes no estado auditado.

alter extension pg_trgm set schema extensions;
