# Exclusividade de provedor — SNV

Data: 2026-08-25

## Regra de arquitetura

O repositório opera exclusivamente com o **SNV** (`nqklhsfaqpbjqmfzjzxk`) como backend. Nenhum outro projeto Supabase pode ser endpoint, fallback, emissor de sessão, alvo de Cron, segredo operacional, fonte de autorização do Admin, destino de migration ou referência de deploy.

O repositório ativo também não deve conservar identificadores ou snapshots de outros projetos Supabase. Evidência externa necessária para recuperação deve ficar fora da árvore operacional.

## Barreiras

- `echo_admin_identity()` exige que o claim JWT `iss` seja exatamente `https://nqklhsfaqpbjqmfzjzxk.supabase.co/auth/v1`;
- `echo_is_admin()` continua exigindo AAL2 e herda o lock de emissor do SNV;
- URL e chave publicável do Echo Pulse/Cron são reconciliadas para o SNV;
- a migration rejeita endpoint Supabase diferente do SNV no Cron/Vault do Echo Pulse;
- CI percorre arquivos versionados e bloqueia endpoint, host de banco ou `project ref` Supabase diferente do SNV;
- Pages/Admin permanecem fixados no endpoint do SNV.

## Implantação

Esta mudança é de isolamento e segurança. As migrations pendentes têm como único destino o SNV. A estrutura de perfis permanece em Shadow até que a exclusividade seja validada também no banco SNV e seus Advisors de segurança/performance sejam revisados.
