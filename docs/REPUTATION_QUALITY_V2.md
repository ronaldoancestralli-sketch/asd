# Reputation Quality V2 — Echo Scouts

## Estado

`quality-v2` permanece em **Shadow**. Esta política só deve ser aplicada no Supabase SNV depois da implantação controlada das migrations de identidade. Ela não altera a versão pública enquanto o rollout estiver desligado.

## Princípio

Reputação mede contribuição comunitária revisada. Ela **não concede autoridade** institucional, acesso Admin, Creator, Partner, Moderator, Developer ou Founder.

Enviar informação não gera ponto. Todo envio nasce `pending` e só passa a contar após revisão primária e confirmação independente de um segundo Admin.

## Pontos

- contribuição `corroborated`: **+4** pontos;
- contribuição `verified`: **+10** pontos;
- `is_first_discovery=true` em contribuição `verified`: **+15** pontos extras;
- portanto uma primeira descoberta verificada vale **25 pontos** no total;
- `pending`, `rejected`, `contested` e `superseded`: **+0** pontos.

Não existe penalidade negativa direta. `rejected` e `contested` afetam a taxa de aceitação, enquanto `pending` e `superseded` ficam fora do denominador. A intenção é distinguir erro/contestação de espera ou obsolescência legítima.

## Taxa de aceitação

Fórmula:

`(verified + corroborated) / (verified + corroborated + rejected + contested)`

A taxa é recalculada pelo servidor. Quando ainda não existe nenhuma decisão, o valor materializado é 0, mas a interface apresenta `—` para não sugerir uma qualidade de 0% sem amostra.

## Níveis

| Nível | Pontos mínimos | Verificadas mínimas | Primeiras descobertas | Taxa mínima |
|---|---:|---:|---:|---:|
| Member | 0 | 0 | 0 | — |
| Echo Scout | 30 | 3 | 0 | — |
| Rastreador | 120 | 10 | 0 | 60% |
| Cartógrafo | 350 | 25 | 0 | 70% |
| Analista | 900 | 60 | 0 | 75% |
| Vanguarda | 2.500 | 150 | 0 | 80% |
| Lenda da Arena | 8.000 | 400 | 10 | 85% |

O piso de qualidade começa somente em Rastreador. Echo Scout continua acessível sem taxa mínima para não punir um colaborador que ainda possui poucas decisões.

## Fonte única de verdade

Os pesos vivem em `echo_reputation_policy_meta` e os requisitos em `echo_reputation_tier_rules`. `echo_recompute_community_reputation()` usa diretamente essas tabelas para decidir pontos, taxa e tier.

O navegador autenticado recebe apenas leitura da política. Ele não recebe `INSERT`, `UPDATE` ou `DELETE` nessas tabelas. A interface de Meu Perfil renderiza os pesos e thresholds retornados pelo servidor em vez de manter uma segunda tabela hardcoded.

`echo_community_reputation` materializa `accepted_count`, `decided_count` e `policy_version` junto aos contadores já existentes. Isso permite explicar o cálculo atual da própria conta sem acessar evidência, payload ou nota administrativa.

## Anti-farming por conhecimento

Há duas identidades diferentes para uma contribuição:

- `submission_fingerprint` identifica a submissão/evidência exata, incluindo payload e referência de evidência;
- `knowledge_fingerprint` identifica o **mesmo conhecimento**: tipo, assunto normalizado, herói/habilidade quando conhecidos e patch/versão.

Isso permite que uma pessoa envie um novo print ou uma nova evidência do mesmo fato sem perder a informação adicional, mas impede que pequenas variações de texto ou evidência multipliquem reputação. O recálculo agrupa as contribuições de cada membro por `knowledge_fingerprint`, portanto várias evidências do mesmo conhecimento rendem no máximo uma unidade de reputação para aquele membro.

Dentro de um mesmo `knowledge_fingerprint`, a precedência é `verified > corroborated > contested > rejected > neutral`. Assim uma evidência posteriormente verificada prevalece sobre uma versão apenas corroborada do mesmo fato, sem empilhar pontos. Um nível diferente, patch diferente, herói diferente ou habilidade diferente continua sendo conhecimento distinto quando os campos correspondentes diferem.

As barreiras anti-farming passam a ser complementares:

1. envio não pontua antes da revisão e da confirmação independente;
2. `submission_fingerprint`, locks por membro/conhecimento, cooldown e limites versionados de fila reduzem spam e variações artificiais de evidência;
3. `knowledge_fingerprint` impede pontuação repetida do mesmo fato para o mesmo membro;
4. níveis mais altos exigem simultaneamente pontos, volume mínimo de verificadas e taxa mínima de aceitação.

Isso torna ineficiente subir apenas enviando grande volume de observações ruins ou variações do mesmo dado. Ao mesmo tempo, especialistas não são obrigados a contribuir em categorias diferentes: qualidade e verificação importam mais que diversidade artificial.

## Primeira descoberta: uma só por conhecimento

O bônus `Primeira descoberta` não é decidido pelo usuário e não nasce no envio. Ele só pode ser marcado por revisão Admin AAL2 em uma contribuição `verified`.

A integridade V2 usa o `knowledge_fingerprint` como identidade global desse reconhecimento. Para um mesmo conhecimento/patch pode existir **uma única** contribuição `verified` com `is_first_discovery=true`, independentemente de pequenas variações equivalentes do texto ou da evidência.

A revisão é serializada por advisory lock do conhecimento e existe também um índice parcial `UNIQUE` como segunda barreira. Se outro registro já possuir a primeira descoberta daquele conhecimento, a revisão falha com `first_discovery_already_claimed` e nenhum segundo bônus é concedido.

A migration não escolhe vencedor em histórico ambíguo. Se encontrar mais de uma primeira descoberta já marcada para o mesmo `knowledge_fingerprint`, ela aborta com `duplicate_first_discovery_requires_review` para que o conflito seja resolvido humanamente antes da implantação.

A antiga unicidade baseada apenas em texto literal de `subject_key` é substituída pela unicidade canônica por conhecimento. Isso evita simultaneamente dois problemas: não permite duas variações equivalentes do mesmo fato e não bloqueia fatos realmente diferentes que por acaso tenham o mesmo texto genérico, desde que herói/habilidade/patch produzam fingerprints diferentes.

## Revisão independente

Auto-revisão não concede reputação. Uma pessoa que também possua autoridade Admin pode precisar registrar uma decisão sobre o próprio dado por necessidade operacional, mas o evento fica inelegível e **não gera reputação para a mesma conta**.

Na V5, uma decisão primária válida também continua sem efeito de pontuação até receber um segundo parecer Admin AAL2. O confirmador precisa ser diferente do contribuidor e do revisor primário. Uma confirmação torna o evento atual elegível; uma divergência o fecha sem pontos e exige nova decisão primária com motivo auditável.

Cada mudança de decisão cria uma revisão imutável em `echo_research_review_events`. A revisão atual aponta para um único evento, e cada evento aceita no máximo um desfecho em `echo_research_review_confirmations`. Decisões antigas não voltam a contar depois de uma correção.

Primeira descoberta exige revisor diferente do contribuidor. Creator Verification também exige revisor diferente do proprietário do claim. Badges institucionais não podem ser auto-concedidos por Admin; revogação própria continua permitida.

## Especialidades conquistadas

Além do nível geral Echo Scout, o sistema mantém uma dimensão separada de **especialidade por área**. Ela não substitui o tier geral e não concede autoridade institucional.

As áreas V1 são:

- `Pesquisa de Heróis`: `hero_skill_level` + `hero_passive`;
- `Arsenal`: `equipment_stat`;
- `Caçador de Patch`: `patch_change`;
- `Counter Research`: `counter_evidence`.

Cada área usa os mesmos pesos `quality-v2`, a mesma deduplicação por `knowledge_fingerprint` e a mesma exigência de revisão independente. O usuário não escolhe nem concede a própria especialidade.

Os ranks são versionados em `specialty-v1-shadow`:

| Área | Especialista | Referência | Mestre |
|---|---|---|---|
| Pesquisa de Heróis | 120 pts · 10 verificadas · 65% | 400 pts · 30 verificadas · 75% | 1.200 pts · 80 verificadas · 82% |
| Arsenal | 120 pts · 10 verificadas · 65% | 400 pts · 30 verificadas · 75% | 1.200 pts · 80 verificadas · 82% |
| Caçador de Patch | 80 pts · 5 verificadas · 65% | 250 pts · 15 verificadas · 75% | 700 pts · 40 verificadas · 82% |
| Counter Research | 80 pts · 5 verificadas · 65% | 300 pts · 20 verificadas · 75% | 900 pts · 50 verificadas · 82% |

A diferença de volume entre áreas é deliberada: mudanças de patch e counters tendem a produzir menos unidades independentes de conhecimento do que progressão de heróis/equipamentos. A política permanece Shadow e poderá ser calibrada antes do rollout real sem fingir que esses thresholds já são definitivos para a comunidade.

`echo_community_specialty_stats` materializa somente contadores e pontos daquela área. O usuário autenticado pode ler apenas as próprias linhas; Admin pode revisar a visão completa. O cliente não recebe permissão de escrita.

## Rebaixamento e correções

A reputação é recalculada a partir do estado atual confirmado. Ao registrar uma nova decisão primária, qualquer efeito do evento anterior é retirado imediatamente e só poderá voltar após o segundo parecer. Se uma contribuição antes aceita for corrigida para outro estado, pontos, taxa, tier geral e ranks de especialidade podem diminuir. Isso é deliberado: o nível representa a qualidade atual do histórico revisado, não um troféu irreversível.

`superseded` não conta como falha de qualidade, porque uma contribuição pode ter sido válida em patch anterior e apenas ficar obsoleta.

## Transparência

Meu Perfil mostra pontos, taxa de aceitação, contadores reais, versão da política, requisitos do próximo nível e especialidades conquistadas por área. Quando a política não está disponível no backend, o cliente falha fechado e não inventa thresholds.
