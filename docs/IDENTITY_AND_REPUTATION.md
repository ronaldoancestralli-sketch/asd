# Echo Identity + Echo Scouts

## Objetivo

O EchoArena separa **identidade pública**, **reputação comunitária** e **autoridade institucional**. A separação é uma barreira de segurança, não apenas uma escolha visual.

## 1. Identidade pública não é Auth

O e-mail existe para autenticação e recuperação de conta. Ele não é nome público, handle, badge nem identificador social.

A identidade pública vive em `echo_public_profiles` e contém somente campos destinados à experiência social: `public_handle`, bio curta, accent visual, visibilidade e preferência futura de mensagens.

Perfis migrados recebem um handle técnico `player-...` derivado apenas do UUID e começam `private`. O site não deve exibir esse valor como apelido escolhido pelo jogador. O primeiro rollout público deverá pedir um apelido explicitamente e só então tornar o perfil público.

Handles são ASCII, normalizados em minúsculas e têm nomes reservados para reduzir impersonação de Staff/ZeptoLab/EchoArena. Alterações posteriores possuem cooldown.

## 2. Reputação conquistada

A trilha comunitária é calculada pelo servidor a partir de contribuições revisadas:

`Member → Echo Scout → Rastreador → Cartógrafo → Analista → Vanguarda → Lenda da Arena`

Pontos sozinhos não bastam. A política `quality-v2` exige combinação de pontos, quantidade de verificadas e, a partir de Rastreador, taxa mínima de aceitação. Lenda da Arena também exige primeiras descobertas.

A reputação nunca é consultada por `is_admin()`, nunca concede acesso ao painel e nunca cria badge institucional.

## 3. Autoridade institucional concedida

`echo_identity_badges` aceita somente `creator`, `partner`, `moderator` e `developer`.

**ADMIN não é badge.** A aparência `ADMIN` deriva da autoridade administrativa real e é protegida por MFA/AAL2.

**FOUNDER não é badge e não é concedível por Admin.** `echo_founder_authority` é singleton e a transferência usa operação server-side deliberada via `service_role`. A conta alvo precisa já ser Admin ativa.

Precedência visual planejada:

`FOUNDER > ADMIN > DEVELOPER > MODERATOR > PARTNER > CREATOR > MEMBER`

A progressão Echo Scout é exibida em paralelo e não substitui identidade institucional.

## 4. Creator Verification

Criar conta ou declarar-se criador não gera badge. O usuário solicita verificação para URL HTTPS de canal. O servidor gera um desafio temporário `ECHO-XXXXXXXXXX`; somente revisão Admin AAL2 aprovada concede `creator`.

`partner` permanece nomeação independente.

## 5. Echo Research

A contribuição comunitária segue obrigatoriamente:

`envio → pending → revisão → corroborated/verified/rejected/contested/superseded`

Nunca: `envio → Brain`.

O RPC público força `pending`, `is_first_discovery=false`, limita volume e tamanho de payload. Usuários não alteram status, revisão ou pontos diretamente.

## 6. Superfície pública segura

`echo_public_identity_cards_v1()` e `echo_public_profile_v1()` retornam apenas identidade pública e não bloqueada. Não devolvem e-mail, `role` bruto, `is_admin`, `is_blocked`, hash/código de Creator claim, evidência privada ou notas administrativas.

## 7. Mensagens privadas

`allow_messages` é apenas preferência futura. **Não existe DM nesta fase.** Mensagens só devem ser liberadas depois de bloqueio, denúncia, rate limit, privacidade, moderação e exclusão segura.

## 8. Estado de implantação

Esta fundação está em **Shadow interno**. O repositório e o runtime do EchoArena usam exclusivamente o Supabase **SNV** (`nqklhsfaqpbjqmfzjzxk`). Todas as migrations desta fundação têm como único destino permitido o SNV.

Antes de qualquer rollout público, o SNV deve receber as migrations pendentes, executar testes SQL, passar pelo gate de exclusividade de provedor e ter Advisors de segurança/performance revisados.

Até essa aplicação e validação, nenhuma mudança pública de cadastro/perfil depende deste schema. A versão pública continua `0.1.0-beta`.

## 9. Identity Integrity V2

A V2 adiciona hardening sem tornar identidade pública: anti-impersonação Unicode, Creator exclusivo por canal, deduplicação do Echo Research e validações transacionais conservadoras.

## 10. Gate explícito de rollout

`echo_identity_rollout_settings` nasce com todos os recursos desligados: master de identidade pública, handle no cadastro, perfis públicos, cards públicos, Creator Verification e envio do Echo Research.

Os recursos filhos não podem ficar ativos com o master desligado. A RPC administrativa exige Admin AAL2 e confirmação literal `ENABLE_IDENTITY_V2`. RPCs públicas retornam vazio/nulo enquanto o gate correspondente estiver desligado.

## 11. Profile Experience V3 em Shadow

A V3 transforma a fundação de identidade em uma experiência de perfil real **sem ampliar a superfície privilegiada do banco**. A assinatura `echo_public_profile_v1(text)` é preservada e enriquecida de forma aditiva; nenhuma nova `SECURITY DEFINER` é criada nesta etapa.

O perfil passa a entregar, quando os gates V2 estiverem habilitados, apelido público, avatar, bio, nível Echo Scout, quantidade de contribuições verificadas, descobertas inéditas, badges institucionais e histórico recente de contribuições `corroborated/verified`. Pontos brutos de reputação, e-mail, role interno, flags administrativas, payload/evidência privada, códigos de Creator e notas de revisão ficam fora desse contrato.

A identidade visual é derivada exclusivamente de dados autorizados pelo servidor. Founder, Admin, Developer, Moderator, Partner e Creator possuem molduras próprias; quando não há autoridade institucional, a moldura acompanha a progressão `Member → Echo Scout → Rastreador → Cartógrafo → Analista → Vanguarda → Lenda da Arena`. O cliente nunca escolhe uma moldura institucional por conta própria.

A página `perfil.html` existe apenas como superfície Shadow e permanece com `noindex,nofollow`, sem entrada na navegação pública. Ela não contém perfil de demonstração, usuário fictício ou números simulados: com os gates desligados, mostra somente o estado de preparação. Quando a RPC real não retorna um perfil, nenhuma identidade é inventada.

Mensagens privadas continuam deliberadamente fora da V3. A preferência futura pode permanecer armazenada, mas não haverá DM até existirem bloqueio, denúncia, rate limit, moderação e exclusão segura.

## 12. Meu Perfil V4 em Shadow

A V4 adiciona `meu-perfil.html` como editor autenticado e privado da própria identidade. A página permanece `noindex,nofollow`, fora da navegação pública e não amplia a autoridade do cliente. Ela reutiliza `echo_set_my_public_identity_v1()` e as policies já auditadas.

O editor permite escolher apelido público, nome de exibição, bio, acento visual e privacidade. O handle técnico `player-...` nunca é apresentado como se fosse um apelido escolhido. Enquanto os gates `public_identity_enabled`, `public_profiles_enabled` e `identity_cards_enabled` não estiverem simultaneamente ativos, a opção pública permanece desabilitada e qualquer salvamento é forçado para `private` pelo contrato existente.

A prévia local usa somente os valores digitados e o avatar real já associado à conta. Ela não simula badge, nível ou autoridade. Founder/Admin/Developer/Moderator/Partner/Creator continuam derivados no servidor e não aparecem como opções editáveis.

A mesma página mostra a progressão Echo Scout real da própria conta, os badges institucionais já concedidos e as especialidades comunitárias calculadas pelo servidor. Esses dados são somente leitura para o usuário e não alteram autoridade.

O Centro Creator fica visível apenas quando `creator_verification_enabled` estiver habilitado junto ao master. O usuário pode solicitar prova de posse para um canal HTTPS suportado e acompanhar suas próprias solicitações; o código temporário pertence ao próprio claim e nunca é exposto em perfil público. `Partner` não é solicitável por esse fluxo.

Mensagens privadas continuam inexistentes. A V4 mantém `p_allow_messages=false` e não cria inbox, conversa ou envio de mensagem.

## 13. Canonicalização Creator V4

O fluxo Creator passa a tratar a URL enviada e a identidade técnica do canal como coisas diferentes. `channel_url` preserva exatamente a evidência submetida pelo usuário; `canonical_channel_url` representa a URL normalizada usada para deduplicação e propriedade.

Para plataformas conhecidas, a canonicalização Creator valida o domínio no servidor e aceita apenas formatos de canal compatíveis. Aliases de host são reduzidos a uma forma estável — por exemplo, `www` é removido e endereços `twitter.com` são associados ao domínio canônico `x.com`. Parâmetros e fragmentos que não identificam o canal são descartados nas plataformas conhecidas. URLs de conteúdo específico, como vídeo do YouTube, não são aceitas como identidade de canal.

O fingerprint de propriedade é calculado a partir da URL canônica, não da string original. A mesma identidade verificada continua exclusiva mesmo quando o usuário tenta reapresentar uma variação equivalente da URL. O lock transacional continua sendo adquirido pelo fingerprint antes de criar o claim.

Claims históricos que não possam ser canonicalizados não são convertidos ou aprovados silenciosamente. Um claim `verified` incompatível faz a migration falhar e exige revisão humana; um claim pendente antigo sem URL canônica precisa ser reemitido antes de poder receber Creator. O Admin continua precisando de AAL2 e continua responsável por confirmar visualmente que o código temporário está presente no canal.

Creator só pode ser concedido pela revisão de um claim válido e verificado. A RPC genérica de badges pode revogar `creator`, mas não pode concedê-lo ou reativá-lo. A revisão do claim é o único caminho autenticado que ativa o badge, enquanto o trigger `echo_guard_institutional_badge` permanece como segunda barreira de defesa.

## 14. Privacidade de nome público V4

O Echo Identity não aceita e-mail como `display_name`. O e-mail continua restrito a autenticação/recuperação e nunca deve ser convertido em identidade social apenas porque uma conta legada o armazenou como nome.

O editor detecta um `display_name` legado com formato de e-mail e deixa o campo de nome em branco. O servidor também recusa novos nomes com formato de e-mail por `display_name_email_not_allowed`. A RPC de cards públicos usa o `public_handle` como fallback se ainda existir um registro legado com formato de e-mail.

## 15. Histórico privado de contribuições V4

`meu-perfil.html` mostra uma timeline privada de até 30 contribuições recentes da própria conta. A policy `echo_research_contributions_self_or_admin` garante que o usuário autenticado só leia linhas cujo `contributor_id` corresponde ao próprio `auth.uid()`; Admin mantém a revisão autorizada.

A timeline consulta somente metadados sanitizados. `payload`, `evidence_reference`, `review_note` e outros dados internos não fazem parte da consulta do navegador.

A trilha visual Echo Scout é derivada do tier real calculado pelo servidor. Primeira descoberta só aparece como tal depois da revisão verificada e exclusiva por conhecimento.

Falhas de leitura de reputação, badges ou especialidades são exibidas como indisponibilidade explícita. O cliente não transforma erro de consulta em zero, ausência de reconhecimento ou progresso vazio.

## 16. Centro de contribuição Echo Research V4

O editor privado conecta o usuário ao RPC `echo_submit_research_contribution_v1()`. O formulário só aparece quando `public_identity_enabled` e `research_submission_enabled` estão ativos; com o gate desligado, permanece bloqueado.

O usuário informa tipo do dado, patch opcional, observação e evidência. Todo envio nasce `pending`, passa por rate limit, fingerprint/deduplicação e nunca entra automaticamente no Brain. Enviar informação não gera pontos.

Para tipos ainda sem referência estruturada própria, o assunto continua textual. Para dados de herói, a camada Research Reference Integrity V4 descrita abaixo passa a usar IDs reais quando o catálogo permite resolução segura.

`Screenshot` e `Vídeo` continuam representando tipo de evidência; upload direto de arquivo ainda não existe nesta V4. Não há simulação de anexo.

## 17. Política de reputação Quality V2 — regra exata atual

A reputação é recalculada pela função `echo_recompute_community_reputation(uuid)` e usa a política versionada `quality-v2`. Não existe pontuação concedida pelo navegador nem campo de pontos editável pelo usuário.

Pesos atuais:

- `corroborated`: **+4**;
- `verified`: **+10**;
- `verified` + primeira descoberta: **+15 extras**, totalizando **25** para aquela unidade de conhecimento;
- `pending`, `rejected`, `contested` e `superseded`: **+0**.

A pontuação é deduplicada por `knowledge_fingerprint`: múltiplos prints ou submissões do **mesmo conhecimento pelo mesmo membro** podem ajudar a revisão, mas não empilham reputação. Pessoas diferentes podem corroborar independentemente o mesmo fato e cada uma pode receber crédito pela própria contribuição revisada; o bônus de **primeira descoberta**, porém, é único globalmente por conhecimento/patch.

Revisão feita pela própria conta contribuinte pode existir por necessidade operacional, mas é excluída de pontos, taxa, tier e primeira descoberta. A reputação só considera revisão independente.

A taxa de aceitação é:

`(verified + corroborated) / (verified + corroborated + rejected + contested)`

`pending` e `superseded` ficam fora do denominador. Sem decisões, o materializado é 0 e a interface exibe `—` para não sugerir “0% de qualidade” sem amostra.

Requisitos atuais:

- `Member`: estado inicial;
- `Echo Scout`: 30 pontos + 3 verificadas;
- `Rastreador`: 120 pontos + 10 verificadas + **60%** de aceitação;
- `Cartógrafo`: 350 pontos + 25 verificadas + **70%**;
- `Analista`: 900 pontos + 60 verificadas + **75%**;
- `Vanguarda`: 2.500 pontos + 150 verificadas + **80%**;
- `Lenda da Arena`: 8.000 pontos + 400 verificadas + 10 primeiras descobertas + **85%**.

Os pesos vivem em `echo_reputation_policy_meta` e os thresholds em `echo_reputation_tier_rules`. “Meu Perfil” lê essas tabelas em modo somente leitura e renderiza a mesma política que o servidor usa; o cliente não mantém uma cópia hardcoded dos thresholds.

A reputação representa o histórico revisado atual e pode cair se uma decisão anterior for corrigida. `superseded` não é tratado como falha de qualidade porque um dado pode ter sido válido em patch anterior e apenas ter ficado obsoleto.

## 18. Research Reference Integrity V4

Contribuições estruturadas de herói não confiam nos UUIDs enviados pelo navegador. `echo_submit_research_contribution_v1()` revalida no servidor que o herói existe e está ativo, que a habilidade existe e está ativa e que `hero_skills.hero_id` corresponde ao herói selecionado.

Para `hero_skill_level`, o envio exige `hero_id`, `skill_id` e `payload.skill_level`. O nível precisa ser inteiro e ficar entre 1 e o `max_level` real daquela habilidade no catálogo. Se o catálogo não tiver um limite seguro, o envio falha fechado em vez de assumir 18.

O `subject_key` de `hero_skill_level` não é aceito como identidade livre: o servidor o reconstrói como `Herói · Habilidade · nível N` usando os nomes do catálogo. Isso impede que pequenas variações manuais do assunto fragmentem o mesmo nível para farming ou deduplicação inconsistente.

Para `hero_passive`, o herói é obrigatório, mas `skill_id` é recusado porque passivas são entidades separadas das quatro habilidades. O sistema não finge que uma passiva é `hero_skill` só para preencher um ID.

A interface carrega `heroes` e `hero_skills` reais, filtra habilidades pelo herói e lê `max_level` do catálogo. Esses valores melhoram a UX, mas continuam sem autoridade: todos são validados novamente pelo RPC no momento do envio.

Esta camada mantém o mesmo RPC e a mesma assinatura privilegiada já auditada; não cria uma nova função pública de escrita. O estado continua Shadow e nenhuma migration é executada fora do SNV.

## 19. Lançamento público V6

Em 25 de agosto de 2026, os seis gates de Echo Identity foram ativados deliberadamente no SNV e a experiência deixou de exibir os rótulos de pré-lançamento. Esta seção atualiza o estado operacional descrito nas etapas históricas acima; os registros V1–V5 continuam preservados como trilha de desenvolvimento.

O cadastro passa a solicitar um apelido público quando `public_identity_enabled` e `signup_handle_enabled` estão ativos. A preferência é armazenada em `auth.raw_user_meta_data.public_handle` apenas para preencher o editor depois da confirmação do e-mail. Esse metadado de cadastro não concede autoridade, badge, função administrativa, visibilidade pública ou reputação. A gravação efetiva continua dependendo da ação explícita do usuário e da validação server-side de `echo_set_my_public_identity_v1()`.

Contas autenticadas recebem a ação **Meu Perfil** nos cabeçalhos. O perfil nasce e permanece **privado por padrão**; só fica público quando o usuário escolhe essa visibilidade e os gates de identidade, perfis e cards continuam ativos. O e-mail não é usado como nome público nem como rótulo da conta.

O Echo Research e o Centro Creator aparecem somente após confirmação dos respectivos gates. Enviar uma contribuição continua valendo zero ponto, e qualquer reputação depende de decisão e confirmação independentes no servidor. Nenhuma migration ou tabela nova foi necessária para a V6.

## 20. Experiência V7 — identidade, pontos e insígnias

A Experiência V7 transforma “Meu Perfil” numa apresentação clara da novidade Echo Identity. O lançamento ganha um hero próprio e explica o ciclo completo em quatro verbos: explorar, comprovar, confirmar e evoluir. A tela também torna explícito que o envio vale zero e direciona o membro às operações de campo sem criar recompensa paralela.

Os cards de pontuação e o resumo do lançamento não mantêm pesos hardcoded: os valores vêm da política versionada do servidor, lida em `echo_reputation_policy_meta`. Quando a política está indisponível ou inválida, os valores permanecem `—` e nenhuma pontuação é presumida. A tabela completa continua derivada de `echo_reputation_tier_rules`.

O editor passa a ter uma prévia ao vivo mais fiel do card. Nome, nick, bio, acento e privacidade respondem às escolhas locais; nível e reconhecimentos institucionais aparecem somente quando confirmados pelo backend. O espaço de badges nasce vazio e só recebe entradas ativas da allowlist server-side, sem exemplos que possam ser confundidos com autoridade conquistada.

A coleção exibe as sete insígnias comunitárias com estados conquistada, atual e bloqueada. Requisitos e thresholds são renderizados a partir das regras do servidor. A moldura comunitária continua separada de Founder, Admin, Developer, Moderator, Partner e Creator.

As missões mostram porcentagem, progresso confirmado e o aviso “0 pontos próprios”. Elas continuam sendo orientação; não escrevem reputação, não concedem insígnia e não alteram autoridade. Esta versão é inteiramente de frontend e não cria migration, branch Supabase ou custo adicional.

## 21. Experiência V8 — uma identidade com mais vida

A Experiência V8 amplia a apresentação da Echo Identity sem transformar decoração em autoridade. A entrada sem sessão deixa de ser um bloqueio vazio e passa a funcionar como vitrine pública: explica a proposta, demonstra um card fictício marcado como prévia, permite testar cores e conduz o visitante ao fluxo real de autenticação. Essa superfície não consulta nem exibe dados de membros.

Dentro de “Meu Perfil”, o Laboratório de Sinais funciona como simulador educativo. As quantidades escolhidas permanecem somente no navegador e o cálculo usa os valores confirmados em `echo_reputation_policy_meta`. Se a política estiver ausente ou inválida, o total fica indisponível. O simulador não escreve reputação, não prevê aprovação e não promove nível; ele apenas explica a composição matemática de corroboradas, verificadas e primeiras descobertas.

A coleção passa a funcionar também como showroom de insígnias. O membro pode selecionar qualquer uma das sete molduras para vê-la no próprio card, mas a interface mantém um aviso explícito de simulação visual e diferencia nível atual, já conquistado e bloqueado. A ação “Voltar ao meu nível” restaura imediatamente o tier confirmado pelo servidor. Reconhecimentos institucionais não participam desse showroom.

Movimento de profundidade no card, pulsos, scanlines e revelação progressiva dão resposta às ações sem ocultar conteúdo ou criar dependência de animação. `prefers-reduced-motion` remove os movimentos contínuos, controles têm foco visível e toda interação essencial permanece disponível por teclado. A V8 é somente frontend: não cria migration, tabela, projeto ou branch paga no Supabase.

## 22. Auditoria comunitária de habilidades

Cada habilidade pública pode receber uma conferência estruturada. O membro informa se os dados estão corretos ou precisam de correção, descreve o que verificou e pode anexar uma evidência HTTPS. O envio nasce `pending`, reutiliza rate limit e deduplicação do Echo Research e vale zero ponto até passar pela decisão e pela confirmação de duas pessoas independentes do contribuidor e entre si.

Somente auditorias `verified` ou `corroborated` com confirmação independente podem aparecer como **“Auditado por”**. O crédito público também exige perfil completo, público e não bloqueado; payload, evidência e notas internas nunca entram na RPC pública. Quando a mesma pessoa possui crédito confirmado em todas as quatro habilidades ativas, o herói pode exibir **“Herói auditado por”**.

Fontes antigas continuam admissíveis como evidência histórica e recebem data e aviso de revisão, em vez de serem descartadas ou substituídas por estimativas. Se a pesquisa não localizar todas as habilidades, o editor mantém quatro posições visíveis, mas bloqueia a gravação das posições sem evidência.
