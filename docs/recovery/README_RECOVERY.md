# EchoArena — recuperação de código verificável

Data da revisão: 25/08/2026.

Este diretório preserva somente proveniência de código e lacunas históricas úteis para auditoria Git. Ele não é fonte de configuração de backend e não deve conter identificadores, snapshots, catálogos ou ledgers de qualquer projeto Supabase diferente do SNV.

## Comece por aqui

1. Leia `RECOVERY_GAPS.md` para entender lacunas do histórico Git.
2. Leia `RECOVERY_PROVENANCE.md` para a origem da reconstrução no GitLab.
3. Trate qualquer material externo de recuperação como evidência offline, nunca como configuração do repositório atual.

## Regra de backend

O único backend Supabase permitido na árvore ativa é o SNV (`nqklhsfaqpbjqmfzjzxk`). Backups ou snapshots de outros projetos ficam fora do GitLab e não participam de migrations, deploy, CI, Admin, Cron, Vault ou autenticação.

## Segurança

O repositório não deve guardar service role key, senha, JWT, valores de Vault ou backups lógicos com dados de usuários. Chaves públicas só podem existir quando forem as chaves publicáveis deliberadamente usadas pelo SNV e passarem pelos gates de segurança.
