# EchoArena — governança de mudanças e versões

## Objetivo

Toda alteração que diga respeito ao EchoArena deve deixar uma trilha compreensível, além do histórico bruto do Git. O projeto mantém duas superfícies diferentes:

1. **Registro interno** — obrigatório para mudanças de site, Admin, conteúdo, backend, Supabase, Edge Functions, Brain, motor de cálculo, deploy, infraestrutura e segurança.
2. **Versões & evolução** — público e sanitizado; mostra apenas mudanças úteis para quem usa o EchoArena.

O registro interno nunca substitui o Git: ele explica a intenção e o impacto. O Git continua sendo a fonte técnica exata de arquivos, commits e diffs.

## Versão pública atual

A versão pública deve acompanhar a release mais recente registrada no ledger e exposta pela superfície pública.

A versão pública só avança quando existe uma mudança que faça sentido para o usuário. Segurança, infraestrutura e manutenção interna não alteram a versão pública por si só.

## O que entra no histórico público

- nova função, módulo ou fluxo visível;
- melhoria percebida de navegação, interface ou experiência;
- correção que afete o uso normal;
- conteúdo novo ou revisão relevante para jogadores;
- evolução do Brain ou do motor de cálculo quando ela muda materialmente qualidade, precisão, contexto, recomendações ou resultados apresentados ao usuário.

Quando Brain/motor de cálculo forem publicados, descrever **o ganho para o usuário**, não arquitetura interna, modelos, chaves, tabelas, policies, hashes ou detalhes exploráveis.

## O que fica somente no registro interno

- segurança e hardening;
- RLS, grants, migrations e políticas de acesso;
- chaves, tokens, segredos e rotação de credenciais — nunca registrar valores;
- deploy, CI/CD, DNS, hospedagem e recuperação de provedor sem impacto funcional deliberado;
- refatorações e manutenção interna;
- alterações de backend sem efeito percebido pelo usuário;
- ajustes exclusivos do painel Admin, seus importadores, editores, automações e ferramentas de revisão.

Mesmo o registro interno deve evitar segredos, credenciais, passos de exploração e detalhes que aumentem risco operacional. Registrar o fato, objetivo, escopo e resultado.

## Regra de versão durante o Beta

- **patch** — `0.1.0-beta → 0.1.1-beta`: correções, polimento, conteúdo e melhorias pequenas percebidas.
- **minor** — `0.1.x-beta → 0.2.0-beta`: nova função/módulo ou evolução material do Brain/motor de cálculo/experiência.
- **major** — reservado para mudança de produto incompatível ou marco explicitamente aprovado.
- **1.0.0** — somente quando o Beta for encerrado de forma explícita.

Mudanças exclusivamente internas usam `version_impact: "none"` e não criam versão pública.

## Registro estruturado obrigatório

O arquivo `docs/CHANGELOG_INTERNAL.jsonl` é append-only: um objeto JSON por linha, em ordem cronológica. Campos obrigatórios:

- `id`: identificador único e estável;
- `occurred_at`: `YYYY-MM-DD` ou ISO-8601;
- `area`: área do produto;
- `change_type`: tipo da mudança;
- `title` e `summary`: descrição interna, sem segredos;
- `user_visible`: se o usuário percebe a mudança;
- `public`: se deve aparecer em Versões & evolução;
- `public_version`: versão pública ou `null`;
- `public_category`: `beta`, `feature`, `improvement`, `fix`, `content` ou `null`;
- `public_note`: texto sanitizado para o usuário ou `null`;
- `version_impact`: `none`, `patch`, `minor`, `major` ou `baseline`;
- `public_sync`: `synced` para mudança pública já publicada; `not_required` para interna;
- `security_sensitive`: marca mudanças de segurança;
- `backend_only`: marca mudanças cuja implementação é somente backend;
- `source_ref`: commit/MR conhecido ou `null`.

Uma entrada corretiva de governança pode usar `supersedes_public_versions` para retirar classificações públicas antigas feitas por engano, sem apagar o registro técnico original.

Quando uma release ainda não chegou à produção porque o pipeline falhou, uma correção puramente técnica do próprio manifesto pode usar `repairs_public_version`. A exceção é restrita à versão pública atual, não pode avançar a versão nem alterar outra superfície pública e deve permanecer como entrada interna.

## Regra de sincronização pública

Uma mudança com `public: true` só pode ser considerada pronta para merge quando:

1. recebeu nova versão maior que a versão pública anterior;
2. possui nota pública sanitizada;
3. está representada no manifesto público versionado em código e, quando disponível, sincronizada no conteúdo editorial de `site_pages.page_key = versions`;
4. o banner Beta e a página pública passam a refletir essa versão;
5. o CI confirma que o conjunto efetivo de versões públicas do ledger é idêntico ao manifesto.

O manifesto público versionado em código funciona como **fallback anti-atraso**: se o CMS editorial estiver temporariamente atrás ou indisponível, a página Versões & evolução não pode esconder releases que já foram publicadas pelo código e registradas no ledger. O CMS continua podendo enriquecer a apresentação editorial, mas não pode regredir a versão nem apagar historicamente uma release válida.

O CI não recebe `service_role` e não deve escrever no Supabase para cumprir essa regra. A sincronização editorial continua sendo uma ação administrativa explícita; a ausência temporária dessa escrita não pode fazer a superfície pública mentir sobre a versão que já está efetivamente em produção.

## Proteção contra exposição acidental

A página pública aceita somente categorias públicas conhecidas (`beta`, `feature`, `improvement`, `fix`, `content`). Entradas como `security`, `backend`, `ops` ou qualquer categoria desconhecida são ignoradas mesmo se um dado malformado vier marcado como publicado.

## Regra permanente para desenvolvimento

Antes de qualquer merge que altere o EchoArena:

- classificar a mudança;
- acrescentar entrada no registro interno;
- decidir explicitamente se é pública;
- se pública, versionar, atualizar o manifesto público e sincronizar a nota editorial quando o fluxo administrativo estiver disponível;
- se a alteração estiver restrita ao painel Admin, registrá-la apenas como interna e não avançar a versão pública;
- se segurança/backend interno, manter fora da superfície pública;
- atualizar cache-busting de todo arquivo browser alterado;
- executar os Quality Gates.
