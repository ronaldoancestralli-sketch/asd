# Provider / Supabase cutover — 2026-08-24

- Frontend provider atual: `https://echo-arena-restaurado-7201c6.gitlab.io/`
- Backend Supabase exclusivo: `https://nqklhsfaqpbjqmfzjzxk.supabase.co` (`nqklhsfaqpbjqmfzjzxk`)
- A `service_role`/secret key **nunca** pertence ao frontend ou ao GitLab.
- `js/supabase.js` e `js/guard.js` usam somente a publishable key do SNV.
- O endereço administrativo canônico é `./admin/index.html`; Echo Pulse é `./admin/echo-pulse.html`. `./admin-echo-pulse.html` existe apenas como alias de compatibilidade.
- Identificadores, endpoints e snapshots de qualquer outro projeto Supabase não pertencem ao repositório operacional.
- Token de cutover/cache atual: `20260824-supabase-new-2`.
