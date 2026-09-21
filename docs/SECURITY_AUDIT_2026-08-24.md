# EchoArena — auditoria defensiva pós-recuperação (2026-08-24)

Escopo: páginas públicas/Admin, JavaScript de navegador, GitLab CI/Pages, Supabase migrations/RLS/grants, Storage contracts e Edge Functions versionadas.

## Controles confirmados no repositório

- Admin protegido por sessão real + AAL2/MFA nas rotas e RPCs administrativas auditadas.
- `SECURITY DEFINER` com contratos estáticos e testes de menor privilégio.
- RLS e grants versionados; clientes não recebem privilégios estruturais de tabela.
- service role não é publicada no Pages; build faz varredura de secrets.
- Supabase JS é pinado; Pages é produzido apenas após Quality Gates.
- `main` é protegida; deploy de produção parte de `main`.

## Hardening desta auditoria

1. Trava de banco contra self-admin/self-unblock em `profiles`.
2. `make_admin` server-only em qualquer overload existente.
3. CREATE removido de `anon/authenticated` no schema `public`; schema `private` fechado aos papéis clientes.
4. RLS defense-in-depth nas tabelas privadas conhecidas quando existentes.
5. CSP por página no artefato Pages, com hashes SHA-256 para scripts inline.
6. Referrer policy global; Admin usa `no-referrer`.
7. Runtime de navegador bloqueia esquemas de navegação perigosos e endurece `target=_blank`.
8. `js/admin.js` legado é removido do artefato publicado.
9. Tesseract OCR usa versão exata.
10. Validador de CI impede regressão desses controles.

## Provedor atual

O único backend Supabase permitido é o SNV (`nqklhsfaqpbjqmfzjzxk`). SQL, Edge Functions, Auth, Cron, Vault, Admin e CI desta árvore não podem apontar para qualquer outro projeto. A aplicação de migrations e Edge Functions é uma etapa separada e deve ocorrer somente no SNV.

## Restrições de plataforma

- GitLab.com Pages não permite configurar cabeçalhos HTTP arbitrários por projeto; CSP é aplicada por `<meta http-equiv>` e o Admin recebe frame-busting adicional.
- O domínio atual é `*.gitlab.io`; DNS/TLS ficam sob a infraestrutura do GitLab. Se `echoarena.com.br` voltar a ser usado, registrar lock, MFA, DNSSEC/CAA e WAF devem ser configurados no provedor DNS/registrador.

## Fechamentos

- `echo-brain-score`: auditoria detalhada exige bearer token validado, `sub` correspondente e claim `aal2`.
- `bullet-echo-promo-radar`: limite de 64 KiB, rejeição de JSON/payload inválido, autenticação AAL2/Admin, chave de cron por hash, allowlists HTTPS e revalidação de redirect.
- Nenhuma alegação de equivalência byte-a-byte com histórico indisponível é feita.

A auditoria de repositório só é considerada pronta quando Quality Gates e diff final estiverem verdes e revisados.
