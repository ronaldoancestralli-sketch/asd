# Proveniência da reconstrução no GitLab

Data da reconstrução: 24/08/2026. Revisão de isolamento: 25/08/2026.

Este repositório foi reconstruído a partir de material verificável e posteriormente endurecido para que a árvore operacional reconheça somente o SNV como backend Supabase.

## Linha principal

- origem recuperada: commit Git local `84803b199faf7ca67c5c4a1213962c66314b3dd0`;
- tree original documentada: `59bec284d229e07e17149a315216fdd7b7107325`;
- classificação: checkpoint principal recuperado e sanitizado;
- nenhuma chave secreta, senha, JWT ou valor de Vault deve fazer parte do repositório.

O commit criado no GitLab é um novo baseline de recuperação. Ele não tenta imitar SHA, autoria ou metadados indisponíveis do histórico anterior.

## Linha Echo Brain

- árvore recuperada: `44b14feb93dded77ae43504a8527f9c813d97f9c`;
- branch reconstruída: `feature/echo-brain-semantic-v2`;
- a árvore da feature permanece separada da `main`;
- objetos históricos não recuperados não são inventados.

## Backend atual

O GitLab guarda código, migrations e definições de Edge Functions cujo único destino Supabase permitido é o SNV (`nqklhsfaqpbjqmfzjzxk`). Dados de produção, backups lógicos, objetos completos do Storage e segredos ficam fora do Git. O repositório não conserva snapshots identificáveis de outros projetos Supabase.
