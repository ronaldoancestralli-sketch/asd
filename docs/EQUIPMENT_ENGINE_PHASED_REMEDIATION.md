# Ajuste do motor de equipamentos em fases

Referência da auditoria: commit-base `4dca719b3868f93d058e1efb23eba70fee5b45e7`, Supabase SNV `nqklhsfaqpbjqmfzjzxk`.

O objetivo é corrigir o motor sem misturar integridade, semântica, dados do jogo e apresentação em uma única mudança. Cada fase tem testes, migration independente quando necessário e condição de rollback. Nenhuma fase deve preencher dados do jogo por inferência textual.

## Fase 1 — integridade e elegibilidade

Estado: MR !50 integrada; pipeline de produção `2811414184` aprovado, versão `0.5.12-beta` publicada. Migration aplicada no SNV em `20260902004827`; Edge Functions `echo-brain-item-fit` v6 e `echo-brain-score` v3 ativas. Complemento visual na MR !51: atualização do cartão central, sinergias e catálogo após troca de herói, com regressões para remoção incompatível e preservação de raridade compatível.

Verificações: PostgreSQL 17 (gate `equipment-loadout-database`) aprovado; funções em produção com `security invoker`, execução negada a `anon` e permitida a `authenticated`; exclusividade pessoal confirmada sob papel `authenticated`. A versão do arquivo foi alinhada ao identificador registrado pelo Supabase para evitar reaplicação acidental.

- contrato único para equipamento genérico, de classe e de herói;
- preservação de `hero_id`, `class_id` e `is_personal` ao equipar e restaurar;
- validação de posição, raridade e identidade única da peça;
- contagem de conjunto somente para loadout válido e peças distintas;
- proteção equivalente no banco para gravação, clonagem e alteração de herói;
- registros históricos inválidos permanecem intactos e são sinalizados na leitura.

Gate: testes JS de contrato e fluxos reais, fixture Postgres 17, suítes existentes, qualidade integral e preview Pages.

Rollback: reverter runtime e migration em conjunto antes de qualquer reparo de dados. Esta fase não altera os 18 equipamentos, 198 variantes, bônus ou builds existentes.

Observação de operação: respostas `knowledge_not_current` do Echo Brain continuam bloqueando scores quando o conhecimento do catálogo não está atualizado. Essa condição preexistente não equivale a cálculo completo e segue rastreada na Fase 5.

## Fase 2 — contrato tipado de efeitos e cadastro

Achados cobertos: F02, F04, F05, F07, F09, F12, F14, F15, F20 e F21.

- persistir no Admin o escopo de herói/classe;
- armazenar alvo, operação, unidade, condição, origem e versão por efeito;
- impedir que descrição livre seja autoridade de cálculo;
- migrar efeitos existentes somente quando a correspondência for confirmada;
- classificar efeito não suportado como pendente, sem descartá-lo.

Blocos de implementação, cada um com MR e gate próprios:

1. **2A — escopo no cadastro.** Alterar `admin/js/equipment-editor-core.js`, `admin/js/equipment-api.js` e a RPC `admin_save_equipment_bundle_v2`. Preservar escopo em leitura, edição, backup/desfazer importação e gravação parcial. Campos omitidos preservam valores anteriores; limpeza de escopo precisa ser explícita. Validar herói/classe contraditórios e impedir que exclusão da classe torne uma peça genérica silenciosamente (F21).
2. **2B — efeitos estruturados.** Definir versão do contrato, alvo, operação, unidade, condição/duração, regra de acumulação e proveniência por efeito. Descrições permanecem para apresentação. Mecânica desconhecida preserva o texto e recebe estado pendente; não entra como atributo permanente. Definir cenários suportados e limites explícitos para F20.
3. **2C — transição controlada.** Validar o contrato no banco e nos consumidores. Converter apenas efeitos com correspondência comprovada; comparar caminho antigo/novo em fixtures antes de ativar a nova autoridade. Migrar dados reais na Fase 4 somente depois da aritmética da Fase 3.

Gate: ida e volta Admin → RPC → banco → site; edição parcial que não apaga escopo; importação/desfazer; unidade, decimal, condição ativa/inativa e efeito desconhecido; execução autenticada sob RLS e rejeição de acesso sem autorização.

Estado do bloco 2A: banco aplicado e verificado em produção; publicação do Admin vinculada à MR !52. O editor passa a exigir escopo explícito (`generic`, `class` ou `hero`), sem escolha inicial para novos itens; carrega classes e heróis do catálogo, preserva o valor em backup/desfazer e envia a forma canônica à RPC. A migration rejeita combinações contraditórias, exige escopo em novos cadastros, preserva atualizações parciais e troca o `ON DELETE SET NULL` da classe por `ON DELETE RESTRICT`. A restauração de versões traduz os vínculos já salvos em snapshots para o contrato explícito; versões contraditórias exigem revisão, e versões sem nenhum campo de escopo preservam os vínculos atuais. Nenhum registro de equipamento ou bônus do jogo é reclassificado neste bloco.

Evidências 2A (02/09/2026): pipeline da MR `2812039596` aprovado, incluindo o gate isolado PostgreSQL 17. Migration `20260902061709_equipment_scope_admin_phase2a` aplicada no projeto `nqklhsfaqpbjqmfzjzxk`. CHECK validado, FK de classe com `ON DELETE RESTRICT`, ambas as RPCs `security invoker` e sem execução para `anon`; chamadas sem administrador rejeitadas em transação revertida. Os 29 equipamentos conservaram exatamente os vínculos anteriores (fingerprint `f4ab4ba69ae841d2925880e33b1f61b1`). Advisors de segurança e desempenho sem novos achados em relação ao baseline. Testes de criação/edição/restauração completos executados no banco isolado, sem inserir itens de teste no catálogo de produção.

Promoção 2A concluída: MR !52 integrada em `f83ec9963afaf5cf65a1779f2cb5bee414bc625c`; pipeline final da MR `2812060998` e pipeline de `main`/produção `2812065752` aprovados. A migration está aplicada uma única vez. O rollback do Admin mantém as barreiras do banco; não restaurar a RPC antiga enquanto houver editor novo ativo, pois ela ignoraria os vínculos enviados.

Estado do bloco 2B: contrato isolado `echo-equipment-effects/v1` implementado em `contracts/equipment-effect-contract-v1.js`, com alvos, operações, unidades, condições, duração, escopo, acumulação, proveniência e suporte explícitos. Versões e mecânicas desconhecidas são preservadas em estado bloqueado; valores não são inferidos do texto. O diagnóstico de cenário nunca aplica um efeito e a autoridade numérica permanece desativada por `EQUIPMENT_EFFECT_NUMERIC_AUTHORITY.enabled = false` até os gates de 2C e da Fase 3.

Evidências 2B (02/09/2026): fixtures cobrem grandezas distintas, condições por habilidade/evento, duração desconhecida, escopo específico da Lince, patamares incremental/cumulativo, número decimal inválido, inventário incompleto e versão futura. O contrato rejeita estado de execução no cadastro e não é importado pelo Admin, motores, comparação, cobertura ou Edge Functions. Não há migration, escrita no Supabase, alteração do catálogo real de Slayer/Predador, deploy de função ou ativação do novo caminho numérico neste bloco.

Gate e rollback 2B: a suíte dedicada deve passar no Quality Gates junto às regressões existentes. Como o módulo é dormente e aditivo, o rollback consiste em remover módulo, documentação, fixtures, teste e entrada do gate; não há dado ou schema para reverter. A promoção para 2C exige definir persistência, edição explícita, leitura dupla e comparação antigo/novo sem mudar a autoridade numérica.

Complemento 2B na MR !53: preserva a implementação existente e acrescenta registro declarativo extensível, pin de revisão e diagnóstico independente de qualidade declarada, suporte da mecânica, disponibilidade da base e execução. Efeito confirmado sem base pública conserva `awaiting_official_data`; unidade inválida não é escondida por essa classificação. Fotos da Armadura Corporal (+3%) e Bornal do Slayer (+17 alcance/−25% recuo) têm regressões sem extrapolar raridades. A autoridade numérica permanece fechada e nenhum consumidor ativo, dado ou migration foi alterado.

Os requisitos novos C01–C12, fontes e sub-blocos 2C.1/2C.2/2C.3 estão em `docs/EQUIPMENT_COLLECTION_CENTRAL_REQUIREMENTS.md`. Registro válido não equivale a fonte aprovada ou cadastro salvo corretamente no banco. Rascunhos, revisão, publicação transacional e integração com o painel/site/Brain seguem pendentes na 2C. Não reiniciar 1/2A nem empilhar a 2C antes da revisão/promoção explícita da MR !53.

## Fase 3 — aritmética determinística e domínios

Achados cobertos: F04, F05, F06, F13, F14 e F17.

- separar capacidade máxima, regeneração por segundo e cura de habilidade;
- validar domínios para impedir tempos negativos;
- confirmar bases neutras e chaves canônicas de multiplicadores/dispersão;
- definir ordem/empilhamento independente da sequência de cliques;
- preservar precisão decimal na interface.

Gate: fixtures confirmadas do jogo e testes de propriedades matemáticas, incluindo salvar/reabrir/clonar com o mesmo resultado.

## Fase 4 — reparo de Slayer, Predador e builds históricas

Achados cobertos: F01, F06, F09, F10, F11 e F18.

- vincular as peças pessoais somente ao Slayer depois da Fase 2;
- cadastrar bônus incrementais 2/4/6 com condições tipadas;
- completar o Predador sem perder o escopo específico da Lince;
- revisar a variante lendária vazia e as cinco posições históricas divergentes;
- preservar versão reproduzível da build e da variante.

Gate: comparação 1–6 peças, mistura de conjuntos, herói errado da mesma/outra classe e conferência visual com as capturas do jogo.

## Fase 5 — transparência, cobertura e convergência

Achados cobertos: F08, F12, F16, F19, F22, F23 e F24.

- estado por efeito: aplicado, condicionado, base ausente, inválido ou pendente;
- selo de cálculo baseado em execução real, não apenas em `stats` não vazio;
- mesmo resolvedor em runtime, auditoria, comparação e Edge Functions;
- paginação e erro de carga incompleta explícitos;
- consolidação das versões antigas do motor depois de provar paridade.

Gate: paridade navegador/servidor, cobertura contra inventário esperado e auditoria completa sem falsos 100%.

## Critério de promoção entre fases

Uma fase só avança quando migration, testes, pipeline, preview e pós-deploy ficam verdes. Dados ambíguos continuam pendentes; o processo não os transforma em números supostos para cumprir cronograma.

## Rastreabilidade dos 24 achados

Uma proteção implementada não encerra o reparo dos registros antigos. A conclusão depende do critério de aceite da fase indicada.

| Achado | Encaminhamento | Estado após Fase 2B |
|---|---|---|
| F01 — Slayer sem bônus/exclusividade | 4 | Pendente: dados não alterados |
| F02 — editor/RPC sem escopo | 2A | Resolvido e publicado pela MR !52 |
| F03 — restrições divergentes/descartadas | 1 | Regra unificada publicada |
| F04 — regeneração vira capacidade | 2B, 3 | Grandezas e unidades distintas no contrato; aritmética pendente na Fase 3 |
| F05 — tempo de mira negativo | 2B, 3 | `-10` sem unidade permanece pendente; domínio e aritmética aguardam a Fase 3 |
| F06 — efeito reconhecido não aplicado | 3, 4, 5 | Contrato não declara aplicação; execução e dados reais permanecem pendentes |
| F07 — condição de habilidade perdida | 2B, 3 | Condição, identidade e duração representáveis; execução pendente na Fase 3 |
| F08 — selo não comprova cálculo | 5 | Pendente |
| F09 — Predador parcial e escopo da Lince | 2B, 4 | Escopo específico de efeito coberto por contrato/fixture; Predador real inalterado até a Fase 4 |
| F10 — slot/duplicidade/variante | 1, 4 | Novas gravações protegidas; históricos pendentes |
| F11 — substituição de raridade | 1, 4 | Restauração protegida; variante vazia pendente |
| F12 — cobertura após descarte inválido | 2B, 5 | Número em string é inválido e inventário esperado fica explícito; integração de cobertura aguarda a Fase 5 |
| F13 — dependência da ordem | 3 | Pendente |
| F14 — chave/operação/unidade | 2B, 3 | Compatibilidade e dimensões tipadas no contrato; conversões e cálculo aguardam a Fase 3 |
| F15 — patamares cumulativos por texto | 2B, 4 | `incremental` e `cumulative_total` explícitos; dados reais aguardam a Fase 4 |
| F16 — classificação diverge do motor | 5 | Pendente |
| F17 — precisão decimal | 3 | Pendente |
| F18 — histórico omite loadout/versões | 4 | Pendente |
| F19 — resumo/dificuldade parciais | 5 | Pendente |
| F20 — cenários/estados não modelados | 2B, 3 | Condições, duração e diagnóstico de cenário modelados; execução numérica aguarda a Fase 3 |
| F21 — perda silenciosa de escopo | 1, 2A | Resolvido e publicado pelas Fases 1 e 2A |
| F22 — paginação/erro de carga | 5 | Pendente |
| F23 — múltiplos motores/fallbacks | 5 | Contrato novo permanece dormente; convergência de consumidores aguarda a Fase 5 |
| F24 — potencial de composição não é loadout | 5 | Pendente |
