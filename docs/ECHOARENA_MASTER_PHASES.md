# EchoArena — Plano Mestre de Fases

Atualizado em: 2026-08-21

Este arquivo é a fonte versionada para continuidade do desenvolvimento pesado do EchoArena / Echo Pulse. O objetivo é impedir perda de contexto entre chats, branches ou tranches de implementação.

## Regras permanentes

1. Não inventar dados, resultados de teste, estado de deploy, comportamento de navegador ou estado do banco.
2. Preservar funcionalidades existentes; remoções somente quando explicitamente justificadas/autorizadas.
3. Criar backup antes de fases estruturais.
4. Migrations sempre versionadas.
5. Atualizar cache-busting quando arquivos frontend referenciados forem alterados.
6. `js/game-stat-engine.js` não deve ser alterado por conveniência.
7. Quality Gates precisam ficar verdes antes de avançar preview/main.
8. Testes estáticos/CI não podem ser apresentados como testes visuais de Safari/iPad.
9. Produção não deve ser usada para testes destrutivos quando staging estiver disponível.
10. PR #4 permanece Draft e não deve ser mergeada sem autorização explícita.
11. Echo Pulse permanece privado enquanto `pulse_public_enabled`/equivalente não for explicitamente liberado.
12. IA pode classificar/resumir/traduzir, mas nunca vira fonte factual.

## Sequência oficial

### Fase 0 — Baseline e continuidade
Congelar estado atual de Git, Supabase, CI, preview, backups, migrations, funções, RLS e riscos conhecidos. Criar documento de handoff versionado.

### Fase 1 — Staging seguro
Criar Supabase development/staging, aplicar migrations, separar configurações de preview e produção e validar que testes destrutivos não atingem produção.

### Fase 2 — Segurança estrutural
Auditar `SECURITY DEFINER`, privilégios EXECUTE, schemas privados, GRANTs explícitos, Auth, senha vazada, sessão Admin e superfícies administrativas.

### Fase 3 — RLS e performance básica
Consolidar policies redundantes sem mudar semântica, adicionar índices de FK relevantes e revisar advisors sem remover índices apenas por baixo uso atual.

### Fase 4 — Pulse Ingestion Engine 2.0
Separar observação bruta de história editorial; introduzir identidade canônica de fonte, quarentena, normalização, dedupe, versionamento/hash, respeito a `poll_interval_minutes` e jobs desacoplados.

### Fase 5 — Conectores confiáveis
Endurecer ZeptoLab News; adicionar Support; reintroduzir YouTube somente com channel ID canônico e fixtures; avaliar Reddit e Discord apenas por mecanismos autorizados; cadastrar criadores com identidade própria.

### Fase 6 — Modelo editorial completo
Criar Pulse Stories, agrupamento de observações, múltiplas fontes por história, corpo editorial rico, tradução preliminar PT-BR, histórico editorial, agendamento, embargo, publicação e retratação.

### Fase 7 — Grafo de entidades
Relacionar Pulse a heróis, habilidades, equipamentos, classes, builds, temporadas, composições e guias de modo genérico e auditável.

### Fase 8 — Patch Radar
Modelar alterações verificáveis com antes/depois quando a fonte informar valores; nunca inferir números ausentes; manter proveniência por patch/entidade.

### Fase 9 — Comunidade 2.0
Tornar a comunidade contextual em Heróis, Builds, Equipamentos, Pulse e Comparações; finalizar respostas aninhadas, editar/excluir, denúncias, moderação, anti-spam e mute.

### Fase 10 — Acompanhamento e notificações
Permitir acompanhar conversa, herói, build e assunto; integrar a tabela de notificações com preferências e sem gamificação forçada.

### Fase 11 — Analytics confiável
Instrumentar `analytics_events` com contrato explícito e privacidade: hero_view, build_view, favorite, comparison, community, pulse etc.

### Fase 12 — Meta em Movimento
Somente com analytics real e amostra mínima. Trabalhar janelas 24h/7d/30d, usuários únicos e confiança; mostrar dados insuficientes quando necessário.

### Fase 13 — Busca global
Busca transversal por heróis, builds, equipamentos, guias, Pulse, comunidade e patches.

### Fase 14 — Agenda Echo
Modelo próprio de evento com início/fim/timezone/fonte/status e relações com entidades.

### Fase 15 — Criadores e Além do Bullet
Criadores verificados pelo EchoArena sem confundir com fonte oficial ZeptoLab; notícias externas somente sob regras rígidas de relevância para o público Bullet Echo.

### Fase 16 — Admin operacional completo
Transformar o Admin em cockpit de fontes, quarentena, duplicatas, traduções, histórias, comunidade, denúncias, analytics e ações por fonte.

### Fase 17 — Observabilidade
Saúde por fonte, falhas consecutivas, latência de ingestão, pendências, traduções, duplicatas, alertas e histórico operacional.

### Fase 18 — Escalabilidade
Paginação/cursor server-side, filtros no banco, payloads menores, RPCs paginadas, Realtime incremental e revisão de query plans.

### Fase 19 — UX e acessibilidade pesada
Revisão específica iPad/tablet, tipografia, contraste, touch targets >= 44–48 px, scroll spy, foco, teclado, reduced motion e estados de carregamento.

### Fase 20 — Echo Pulse público definitivo
Transformar a superfície pública em experiência editorial/social, não dashboard; manter infraestrutura operacional fora da visão do visitante.

### Fase 21 — Segurança e abuso pré-lançamento
Testes positivos/negativos de RLS, abuso, spam, alteração de autoria/status/contadores, acesso RPC e bloqueios no staging.

### Fase 22 — Testes de carga
Simular grande volume de posts, comentários, reações, itens Pulse, fontes e sessões; avaliar índices, Realtime e payloads.

### Fase 23 — QA real de navegador
Checklist manual em iPad portrait/landscape, iPhone, Android, Safari e Chrome para login, touch, scroll, comunidade, moderação e teclado virtual.

### Fase 24 — Preview oficial
Migrar do raw.githack para preview first-party do frontend ligado ao staging.

### Fase 25 — Preparação de lançamento
Checklist final de segurança, performance, QA, backups, observabilidade, moderação, anti-spam, políticas, mídia, analytics e feature flags.

### Fase 26 — Lançamento controlado
Owner-only -> grupo autorizado -> usuários selecionados -> público, sempre com kill switch/feature flag.

### Fase 27 — Pós-lançamento
Usar dados reais para otimizar índices, ranking, fontes, notificações, UX e políticas. Não remover/otimizar apenas por suposição.

## Protocolo obrigatório de encerramento de fase

Cada fase deve terminar com:

- backup de entrada;
- branch e HEAD final;
- commits da fase;
- migrations/Edge Functions afetadas;
- ambiente afetado (staging ou produção);
- Quality Gates/run e conclusão;
- testes executados de verdade;
- o que NÃO foi testado;
- pendências conhecidas;
- próxima ação exata;
- bloco `ECHOARENA — CONTINUIDADE` pronto para copiar para outro chat.

## Regra de avanço

Uma fase não avança com pendência crítica não registrada da fase anterior. Pendências não bloqueantes podem seguir somente se forem explicitamente documentadas no handoff.
