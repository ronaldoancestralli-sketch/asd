# ECHOARENA — CONTINUIDADE ATUAL

Atualizado em: **2026-08-25**

## Produção atual

- repositório: GitLab `echo-arena-gitlab-group/echo-arena-restaurado`;
- branch de produção: `main`, protegida;
- frontend: GitLab Pages;
- backend ativo e único: **SNV** (`nqklhsfaqpbjqmfzjzxk`);
- endpoint Supabase permitido: `https://nqklhsfaqpbjqmfzjzxk.supabase.co`;
- Admin/login, CSP, `js/supabase.js`, `js/guard.js` e build Pages usam o SNV.

## Exclusividade de provedor

Nenhum projeto Supabase diferente do SNV faz parte da arquitetura do repositório. Não pode existir outro:

- endpoint ou fallback de runtime;
- emissor aceito para autoridade Admin;
- destino de Edge Function/Cron;
- segredo operacional do Vault;
- alvo de migrations;
- configuração de CI/deploy;
- `project ref` ou host de banco versionado.

`scripts/check-snv-provider-isolation.py` percorre o repositório inteiro e falha se encontrar endpoint, host de banco ou `project ref` Supabase diferente do SNV.

A migration `20260825070000_snv_provider_isolation.sql` reforça, quando aplicada no SNV, o emissor JWT administrativo, URL operacional do Echo Pulse e invariantes de Cron/Vault. Seu único destino permitido é o SNV.

## Segurança atual

- autorização Admin exige identidade administrativa válida e AAL2;
- a camada de exclusividade valida o emissor JWT do SNV;
- `service_role` não pertence ao frontend;
- `main` recebe alterações somente após gates e MR;
- Echo Identity/Echo Scouts permanecem Shadow/fail-closed;
- Echo Brain mantém barreiras de proveniência e promoção;
- mudanças internas de segurança não alteram a versão pública por si só.

## Regras permanentes

- Não afirmar teste, deploy ou resultado sem evidência real.
- Não criar dados falsos.
- Todas as operações Supabase desta árvore têm como único destino permitido o SNV.
- Atualizar cache-busting ao alterar JS/CSS referenciado pelo navegador.
- Preservar funcionalidades atuais e trabalhar por branch/MR.
- CI verde não equivale a smoke test visual Safari/iPad.
- Identificadores e snapshots de projetos Supabase diferentes do SNV não pertencem ao repositório ativo.
