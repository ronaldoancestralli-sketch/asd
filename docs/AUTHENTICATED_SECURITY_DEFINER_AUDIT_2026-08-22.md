# EchoArena — auditoria das SECURITY DEFINER autenticadas

Data da evidência: **2026-08-22**. Adendo de classificação V5: **2026-08-25**.

Os identificadores do backend usado na coleta histórica foram deliberadamente removidos do repositório operacional. Este documento preserva somente o contrato técnico necessário para comparação e não define endpoint, `project ref` ou destino de deploy.

## Baseline de produção

A baseline de produção observada possuía **36** funções `public.SECURITY DEFINER` executáveis por `authenticated`, **0** por `anon` e **36** com `search_path` fixo. Todas preservavam `service_role`.

| Grupo funcional | Quantidade |
|---|---:|
| Admin e operações | **23** |
| Operações transacionais/pessoais | **7** |
| Helpers de RLS | **4** |
| Preview privado do Echo Pulse | **2** |

## Baseline restaurada do SNV

O inventário real coletado antes do deploy de Identity em 2026-08-25 possuía **44** funções autenticadas, não 36. A diferença são oito RPCs posteriores à fotografia histórica acima: três Admin de promoções, três pessoais de acesso/promoções, o helper `echo_admin_identity()` e a RPC pública estreita `record_analytics_event(...)`.

Todas as oito preservam `service_role`, negam `anon` exceto a RPC de analytics deliberadamente pública e possuem `search_path` fixo. As funções Admin delegam a `echo_is_admin()`/AAL2; as pessoais derivam a identidade de `auth.uid()`. Analytics limita nome e tamanho do payload, aplica janela de cinco minutos e teto de 120 eventos por ator.

## Branch Semantic v4

A branch Semantic v4 acrescentou 9 funções autenticadas ao estágio técnico, levando o catálogo esperado a **45** quando suas migrations fossem aplicadas: 7 Admin e 2 RPCs públicas estreitas.

As duas RPCs públicas estreitas do Brain são `echo_brain_equipment_freshness(text[])` e `echo_brain_register_recommendation_exposure(...)`; elas possuem contratos limitados e não expõem pesos/modelos internos.

## Echo Identity V1 + Integrity V2

Echo Identity V1 + Integrity V2 acrescentam 11 funções autenticadas em relação ao estágio 45. O catálogo esperado pós-Identity é **56**: **35** Admin/operações, **10** pessoais, **4** helpers, 2 de preview privado e **5** RPCs públicas estreitas.

As três RPCs públicas estreitas de Identity são:

1. `echo_identity_rollout_status_v1()`;
2. `echo_public_identity_cards_v1(uuid[])`;
3. `echo_public_profile_v1(text)`.

A autoridade Founder continua sem setter executável por `authenticated`; reputação comunitária não concede autoridade. `service_role` permanece explícito onde necessário.

## Echo Identity V5 Hardening

A V5 acrescenta quatro funções autenticadas. A conta histórica, que partia de 36 e incluía Semantic v4, chegava a **60** assinaturas (**37** Admin/operações e **12** pessoais), mas omitia as oito funções encontradas na baseline restaurada. A allowlist corrigida do catálogo completo é **68**: **40** Admin/operações, **15** pessoais, **5** helpers, 2 de preview privado e **6** RPCs públicas estreitas. Nenhuma das quatro funções novas da V5 concede execução a `anon`.

| Função V5 | Grupo | Barreira obrigatória |
|---|---|---|
| `admin_confirm_research_review_v1(uuid,bigint,text,text)` | Admin | `echo_is_admin()`/AAL2; autor e revisor primário não podem confirmar |
| `admin_research_review_queue_v5(text,integer)` | Admin | `echo_is_admin()`/AAL2; fila limitada e tipada |
| `echo_my_research_guardrails_v5()` | Pessoal | `auth.uid()` e perfil ativo; somente contadores próprios |
| `echo_my_research_missions_v5()` | Pessoal | `auth.uid()` e perfil ativo; `awards_reputation=false` |

Helpers de trigger, hash e recálculo introduzidos pela V5 permanecem revogados de `authenticated`; por isso não aumentam a superfície da allowlist. As duas funções Admin devolvem somente o necessário ao fluxo AAL2. As duas funções pessoais não recebem identidade arbitrária por parâmetro e derivam a conta exclusivamente de `auth.uid()`.

## Perfis de implantação suportados

O contrato executável preserva as **68** assinaturas classificadas, mas reconhece dois estágios íntegros de implantação:

1. **59 funções**: baseline restaurada de 44 + 15 de Echo Identity V1–V5, quando as migrations independentes de Semantic v4 ainda não foram instaladas;
2. **68 funções**: as mesmas 59 + o bundle completo de 9 funções de Semantic v4.

As nove funções de Semantic v4 são opcionais somente como um bundle atômico. A presença de qualquer subconjunto falha o contrato; funções fora da allowlist também continuam falhando. Esse perfil de 59 valida o SNV restaurado sem implantar, por efeito colateral, uma feature Brain alheia ao rollout de Identity.

## Decisão de segurança

Nenhuma migration da tranche de 2026-08-22 foi criada ou aplicada por aquela auditoria. Semantic v4 e Identity são trabalhos posteriores e devem ser validados no backend atual antes de rollout.

O contrato versionado falha se surgir função nova fora da allowlist, se uma função esperada desaparecer, se uma função Admin perder sua barreira, se `service_role` perder acesso, se uma função não pública recuperar `anon` ou se uma exceção pública perder seu contrato estreito.

Echo Pulse continua privado. Echo Brain e Echo Identity permanecem com defaults seguros/inertes; nenhuma mudança desta documentação autoriza promoção automática de modelo ou ativação pública.

## Referências atuais

- Supabase Advisor 0029 — authenticated SECURITY DEFINER;
- Supabase — Database Functions;
- Supabase — Row Level Security.
