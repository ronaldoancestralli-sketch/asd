# Lacunas de recuperação Git

Data da revisão: 25/08/2026.

## Dependências históricas ainda não recuperadas

1. **PR #42 — Promo Radar.** O head conhecido era `412acbf8006bd9d7c02dac592b2dab0ec2f6641c`, mas o objeto Git não existe nas cópias locais encontradas. Branch, diff, comentários, checks e relação exata com o PR continuam sem evidência suficiente para reconstrução byte-a-byte.
2. **PR #27 — Echo Brain semantic audit v4.** A árvore `44b14feb93dded77ae43504a8527f9c813d97f9c` foi recuperada e validada, mas o objeto do head remoto anteriormente observado, `77757a56…`, não está disponível localmente.
3. **Histórico e refs completos.** Não há garantia de preservação integral de branches, tags, commits órfãos, releases ou artefatos externos do repositório anterior.
4. **Issues, Discussions, Projects e anexos do GitHub.** Não foram recuperados.
5. **Configuração externa.** Proteções, environments, secrets, deploy keys, webhooks, DNS/TLS e permissões de organização precisam ser tratados pelos provedores atuais.

## Backend

Materiais de recuperação de projetos Supabase diferentes do SNV foram retirados desta árvore. Eles não podem ser usados para decidir endpoint, `project ref`, autenticação, migrations, Cron, Vault ou deploy. Qualquer evidência que ainda precise ser mantida deve permanecer offline e separada do repositório operacional.

## Conteúdo não validado como atual

Pacotes históricos de código não substituem o checkpoint Git mais recente. Trabalho não commitado deve passar por auditoria funcional antes de qualquer integração.

## Regra de continuidade

A reconstrução atual segue somente a `main` protegida do GitLab, os gates versionados e o SNV como backend exclusivo. Nenhuma lacuna histórica autoriza inventar commits, dados, configurações ou resultados.
