# EchoArena — Admin Browser Security P2

Data: 2026-08-23

## Escopo aplicado nesta tranche

As páginas `admin/login.html` e `admin/mfa.html` recebem proteção adicional no próprio HTML:

- `robots=noindex,nofollow,noarchive,nosnippet`;
- `referrer=no-referrer`;
- Content Security Policy sem `unsafe-inline` e sem `unsafe-eval`;
- scripts limitados a arquivos locais e `https://esm.sh`;
- estilos/fontes limitados aos arquivos locais e Google Fonts já utilizados;
- conexões de rede limitadas ao próprio site e ao projeto Supabase do EchoArena;
- objetos e frames internos bloqueados;
- mídia bloqueada e imagens restritas a `self`, `data:` e `blob:` para suportar o QR TOTP;
- `upgrade-insecure-requests`.

O gate `scripts/check-admin-auth-browser-security.py` impede regressões nessas garantias e também rejeita script/style inline nas duas páginas.

## Limitação consciente da CSP via `<meta>`

A CSP desta tranche é entregue por `<meta http-equiv="Content-Security-Policy">` porque o repositório não possui, pelas integrações atualmente disponíveis, controle comprovado dos headers HTTP da hospedagem.

Diretivas que dependem de header de resposta, em especial `frame-ancestors`, não são tratadas como implementadas por esta tranche. Da mesma forma, HSTS, `X-Content-Type-Options` e uma política de Permissions Policy precisam ser configurados no provedor/edge que efetivamente serve `echoarena.com.br`.

Não se deve declarar proteção anti-clickjacking por `frame-ancestors` até o header real da produção ser verificado.

## Dependência Supabase JS

A aplicação ainda possui `js/supabase.js` importando `@supabase/supabase-js@2?bundle`. O pin exato da dependência foi deliberadamente separado desta tranche porque o módulo é compartilhado por muitas páginas e qualquer alteração exige atualizar todas as referências/cache-busting de forma completa.

A próxima tranche deve:

1. enumerar todas as importações diretas de `js/supabase.js`;
2. fixar uma versão exata testada;
3. atualizar o cache-busting de todos os importadores afetados;
4. executar os Quality Gates e smoke tests do Admin e páginas públicas antes de integração.

Fazer apenas parte dessa migração criaria um estado misto de cache e não é aceitável.

## Pendências de plataforma

- Supabase Auth `Leaked Password Protection`: ainda depende de configuração da plataforma não exposta pela integração usada nesta auditoria.
- Cloudflare media worker: o código endurecido está versionado, mas a versão efetivamente implantada precisa ser confirmada/publicada pela conta Cloudflare.
- Headers HTTP de produção: precisam ser verificados no host/edge real antes de declarar HSTS, anti-clickjacking e demais headers como ativos.
