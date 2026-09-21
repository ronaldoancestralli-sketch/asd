# EchoArena — Project Handoff Atual

## Central simples — continuidade de 2026-09-08

Base main `233713cc` após !69. O usuário esclareceu que o problema é conseguir
configurar e verificar os efeitos com facilidade. A continuação concentra
equipamento, raridade, destino e teste na mesma tela, com ferramentas avançadas
recolhidas. Ver `docs/STATUS_CENTRAL_SIMPLE_WORKFLOW.md` para comportamento,
controle de publicação e validação. Ajuste exclusivo do Admin; permanece a
versão pública 0.7.1-beta, com cache da Central `ux=20260908-1`.

Preservar a autorização já recebida para main e conferência visual pelo usuário
em produção, mantendo CI e deploy acoplado Brain/Pages. Não afirmar revisão
visual autenticada. Não resetar catálogo, inferir dados ausentes, modificar MFA
ou publicar vínculos reais durante os testes. Registrar a MR e os resultados
efetivos de integração/deploy ao concluir.

## Equipamentos e Central — integração autorizada (2026-09-07)

Base deste trabalho: main a91c9c85, após a integração !68. Pacote proposto 0.7.1-beta, separado em leitura/cadastro e autoridade/operabilidade da Central. Ver `docs/EQUIPMENT_EFFECT_AUTHORITY_FIX.md` para escopo, evidência das botas e limites de recuperação. O novo fluxo conserva raw e condições, exige vínculo explícito por linha/raridade, oferece destinos reais para configurar e registra ações sem justificativa obrigatória. Não inclui publicação de vínculos, alteração de números do catálogo ou mudanças na home.

No diagnóstico, o registro estava vazio: a ativação torna pendentes os equipamentos sem vínculo publicado. Não afirmar que o cadastro histórico foi recuperado nem que houve revisão visual autenticada. Não contornar MFA. Confirmar CI e política idêntica no Site e no Brain antes de considerar a produção atualizada.

Continuidade deste pacote na MR !69, branch `fix/equipment-effect-authority-20260907`. A suíte focada passou com 117 testes, incluindo os coletores reais e o submit do formulário, origem OCR, condições distintas, escopo e paridade. O commit a199bace passou no pipeline 2827383006: 107 gates, auditoria completa de segurança, nove jobs de banco e pacote de prévia.

O usuário autorizou expressamente: “Aplique na main, verifico o visual lá”. Para esta MR, a conferência visual será feita pelo usuário em produção e não bloqueia a integração. Manter os gates e a publicação acoplada Brain/Site; confirmar ambos os jobs de produção antes de afirmar que a versão está publicada. Não repetir a elevação MFA rejeitada. Não há migration nova, reconstrução de dados históricos ou publicação automática de vínculos.

Última atualização: **2026-09-07**

## Checkpoint da home — herói selecionado e destaque editorial

- as etapas A–C estão publicadas: seleção única do herói, builds e destinos
  sincronizados, setas circulares integradas e transição direcional; o refinamento
  de estabilidade correspondeu à versão pública `0.5.24-beta`;
- a etapa D foi aplicada no SNV pela migration
  `20260906034743_home_featured_rotation_phase_d.sql`; sua base preservou Slayer
  como destaque manual e uma fila inicial com 21 heróis habilitados;
- a etapa E foi aplicada no SNV pela migration
  `20260906041241_home_featured_rotation_admin_phase_e.sql`: o Admin agora possui
  um módulo próprio para troca manual auditada, ordenação da fila e planejamento
  de frequência, horário, dia e fuso, com revisão otimista e capacidades
  `publishing.view`, `publishing.edit` e `publishing.publish`;
- configuração, fila e histórico ficam no schema `private`; a home receberá apenas
  a projeção mínima de `public.home_featured_state` pela RPC security-invoker;
- o executor privado aceita frequência diária ou semanal e fuso IANA, resolve
  apenas o período vigente e é idempotente por revisão/período. Nenhum job foi
  criado ou alterado na etapa D;
- a etapa F conecta a home à projeção canônica, diferencia visualmente apenas o
  herói editorial, libera prévia administrativa do próximo ciclo sem escrita e
  adiciona ativação/pausa auditadas. O job nomeado
  `echo-home-featured-rotation-1m` apenas verifica a fronteira; a cadência real
  continua diária ou semanal;
- a prévia usa somente `?previewDestaque=proximo` e exige `publishing.view` no
  servidor; a URL não escolhe UUID ou slug. A automação não é ligada pelo deploy:
  a confirmação explícita com `publishing.publish` estabelece a âncora;
- a correção F.2 torna `nova=1&heroi=<slug>` autoridade direta da Mesa de
  Sinergias depois do catálogo carregar. A rota explícita ignora build e
  rascunho anteriores, mesmo se o transporte temporário do módulo de entrada
  falhar; Mirage foi validada na mesa publicada sem herdar Slayer;
- o usuário autorizou que esta sequência da home seja aplicada diretamente na
  `main`, preservando a separação entre as etapas e os gates antes do deploy.
- a correção do card de equipamentos (`0.6.3-beta`) inclui as peças salvas na
  leitura pública da build e renderiza suas imagens pelas posições persistidas.
  A seleção e seu cache mantêm os itens vinculados ao herói atual; carregamento,
  ausência de build e erro limpam a grade. Imagem ausente mantém identificação.
  Catálogo, motor, prévia administrativa e ativação da rotação não são alterados.
- o refinamento visual `0.6.4-beta` traz holofotes dourados e violetas, coroa,
  halo gravado e base iluminada. A atmosfera fica dentro de `.hero-visual` para
  acompanhar o enquadramento em cada largura, sem alterar as coordenadas do CMS.
  O acabamento editorial continua condicionado a `data-is-featured="true"`;
  movimento reduzido desativa as animações. Não altera autoridade, cadência,
  ativação da automação, destinos dos botões ou equipamentos da build.
  O ajuste `0.6.5-beta` integra os gradientes normal/hover do botão aos tokens
  oficiais do tema e alinha as fontes de luz à área do personagem no desktop.
  Em `0.6.6-beta`, a insígnia passa a horizontal até 840px, reservando 42px de
  altura para não avançar sobre o enquadramento superior da arte no celular.

## Checkpoint de equipamentos — Fase 2C.1

- a MR !53 foi integrada à `main`; as Fases 1, 2A e 2B permanecem preservadas;
- a continuidade ocorre em branch própria e adiciona rascunhos, evidências,
  revisões e fila administrativa para o contrato de efeitos;
- não há conversão do catálogo, publicação de efeitos ou autoridade numérica;
- a MR !54 permanece Draft, com migration inicial 2C.1 já aplicada no SNV como
  `20260902173201`; seu SQL foi preservado e o nome alinhado ao histórico;
- o pós-aplicação identificou privilégios herdados não reproduzidos no CI
  inicial; a corretiva `20260902185123_equipment_effect_central_privileges_v1`
  foi aplicada após CI verde. A matriz de 120 checagens de tabela e 30 de função
  ficou sem divergências; catálogo, defaults e controles existentes preservados.
  Evidências e limites: `docs/EQUIPMENT_EFFECT_CENTRAL_PHASE2C1.md`;
- o gate PostgreSQL 17 deve reproduzir os defaults reais e provar a correção
  antes de qualquer aplicação corretiva; consultar a MR !54 para o último
  commit/pipeline e resultado pós-aplicação, sem reaplicar migrations antigas;
- revisão visual e autorização explícita continuam obrigatórias antes do merge.
- a retomada de 2026-09-03 isolou o loading infinito: o artefato excluía o
  contrato importado pelo core. A correção inclui somente esse arquivo público,
  valida imports no artefato e trata falha de carregamento no editor;
  consultar a MR !54 para o commit/CI, sem confundir regressão automatizada com
  validação visual autenticada. O catálogo real continua sem alterações de teste.

## Estado operacional atual

- repositório ativo: GitLab `echo-arena-gitlab-group/echo-arena-restaurado`;
- branch protegida de produção: `main`;
- frontend ativo: GitLab Pages;
- backend ativo e único permitido: **SNV** (`nqklhsfaqpbjqmfzjzxk`);
- endpoint permitido: `https://nqklhsfaqpbjqmfzjzxk.supabase.co`;
- versão deste pacote: **0.7.1-beta**. A confirmação da publicação deve ser
  consultada na MR !69 e nos jobs protegidos do Brain e do Pages na main.

## Regra obrigatória de provedor

Todo runtime, Admin, build, Edge Function, migration, Cron e automação do EchoArena deve operar exclusivamente com o SNV. Nenhum outro project ref, endpoint `*.supabase.co`, emissor JWT, destino de Cron/Vault, projeto de banco ou destino de deploy é permitido nesta árvore.

O Admin usa o cliente Supabase central de `js/supabase.js`, fixado no SNV. A autorização administrativa forte valida o emissor JWT do SNV e AAL2. O gate `scripts/check-snv-provider-isolation.py` percorre o repositório e falha quando encontra um endpoint, host de banco ou `project ref` Supabase diferente do SNV.

Todas as migrations desta árvore têm como destino exclusivo o SNV.

## Segurança e fluxo de mudança

- `main` permanece protegida; alterações entram por branch/MR e são integradas somente depois dos gates;
- não inventar dados, resultados, testes, acesso ou comportamento;
- não usar `service_role` no frontend;
- atualizar cache-busting sempre que um arquivo carregado pelo navegador for modificado;
- não promover Echo Brain automaticamente sem avaliação apropriada;
- CI verde não substitui teste visual/browser quando houver mudança visual.

## Echo Identity V7

As migrations Identity V1–V5 estão implantadas no SNV e os seis gates públicos estão ativos: identidade, handle no cadastro, perfis públicos, cards, Creator Verification e Echo Research.

O cadastro guarda o handle solicitado apenas como preferência de metadado até o usuário confirmá-lo em **Meu Perfil**. O perfil permanece privado por padrão e a RPC server-side continua sendo a única autoridade para validar handle, nomes reservados, cooldown e visibilidade. Metadados de usuário nunca concedem função, badge, reputação ou acesso administrativo.

Reputação só nasce de contribuições confirmadas por revisão independente em duas etapas. Submissão, missão e primeira revisão não pontuam por si mesmas.

“Meu Perfil” apresenta a novidade com destaque, explica como pontuar, mostra a prévia ao vivo do nick/card e renderiza a coleção das sete insígnias comunitárias. A V7 foi publicada como **0.2.1-beta** e permanece preservada como base informativa.

### Echo Identity V8

A versão pública atual desta evolução é **0.2.2-beta**.

A V8 torna a experiência mais viva: a entrada sem sessão ganhou uma vitrine pública interativa, o perfil autenticado ganhou um simulador educativo baseado nos pesos recebidos do servidor, as insígnias podem ser exploradas no card sem fingir conquista e as superfícies principais recebem microinterações com suporte a movimento reduzido. Pesos, thresholds, nível e reconhecimentos continuam vindo do servidor; quando esses dados falham, a interface não inventa valores. A V8 não adiciona migration nem outro ambiente Supabase.

## Regra de recuperação

O repositório ativo não deve armazenar identificadores, endpoints ou snapshots de qualquer projeto Supabase que não seja o SNV. Materiais de recuperação externos ao SNV devem permanecer em backups offline e fora da árvore operacional.


## Publicação acoplada Site ↔ Brain

Desde 2026-09-04, o deploy de produção é fail-closed: a Edge Function
`echo-brain-item-fit` precisa ser publicada e responder com o contrato
`equipment-attribute-operator-v1` no SNV antes de o GitLab Pages iniciar. Falha,
credencial protegida ausente ou contrato divergente bloqueiam a promoção do site.
O job guarda evidência com commit/pipeline por 30 dias. Procedimento completo:
`docs/SITE_BRAIN_DEPLOYMENT_CONTRACT.md`.

## Central de Status — retomada de 2026-09-07

- Implementação preservada na branch `feat/status-central-20260906`, MR !66,
  baseada em `6088fd18`. Em 2026-09-07, o usuário autorizou explicitamente:
  **“Aplique na main”**. A integração usa `integration/status-central-main-20260907`,
  a partir da main `798c0765`, preservando os três commits seguintes da home.
- Implementados registro versionado, vínculos exatos por fonte/raridade,
  unidades e condições, prova numérica compartilhada, revisão e integração
  com Auditoria. Fontes alteradas/removidas e bases ausentes ficam explícitas;
  a Central não presume a aplicação pelo simples reconhecimento de texto.
- Última bateria local: **35 testes específicos**, **5 testes de cobertura**,
  **105/105 comandos disponíveis** do workflow e auditoria estática de segurança
  aprovados. Instalação/geração do OCR não foi repetida; artefatos locais
  pré-existentes foram reutilizados. Não equivale a CI ou teste visual aprovado.
- Após o bloqueio por `ci_quota_exceeded` do pipeline `2824595633`, o pipeline
  **`2825100504`** do commit remoto **`9eb78477`** passou **11/11 jobs**, incluindo
  **107/107 Quality Gates**, nove fixtures PostgreSQL e segurança do Pages.
  Não houve compra de cota, runner novo ou mudança de billing pelo agente.
- O CLI do job `16336536067` gerou a migration
  `supabase/migrations/20260907021850_status_central_v1.sql`, com o SQL da fixture
  aprovada. O pipeline **`2825106368`**, commit remoto **`ff4c1d84`**, aprovou esse
  empacotamento. A aplicação aditiva foi então concluída no SNV com a versão
  real **`20260907022656`**, e o arquivo/fixture foram alinhados a ela.
  **Não reaplicar a migration** nem executar a fixture no SNV de produção.
- Pós-aplicação: **117 verificações de privilégios sem divergências**, RLS nas
  três tabelas, leitura anônima em revisão 0, zero revisões/publicações. Contagens
  e hashes das oito fontes permaneceram idênticos. Advisors e limites estão
  registrados em `docs/STATUS_CENTRAL_V1.md`.
- O HEAD original `17413fb0` passou novamente no pipeline **`2825200513`**.
  A combinação com a main exige novo CI antes do merge e do deploy protegido
  Brain → Pages. Nenhuma regra é publicada automaticamente por essa integração.
- A revisão visual autenticada permanece **não concluída**. O navegador abriu
  o artefato aprovado e chegou ao MFA do Founder; a revisão automática rejeitou
  a elevação para AAL2 com capacidades totais. A autorização de aplicar na main
  não foi tratada como autorização para contornar esse bloqueio. Nenhuma nova
  tentativa de MFA foi feita. Echo Pulse permanece pausado.
- Procedimento, evidências, limites e próximos passos:
  `docs/STATUS_CENTRAL_V1.md`. Não reiniciar a implementação nem confundir
  commits locais de recuperação com os SHAs remotos da MR.
- Antes do merge, reconferir o SHA da main e o CI da MR de integração. Depois,
  registrar nela os SHAs, pipeline e evidência dos contratos do Brain e Pages;
  esses resultados não devem ser presumidos a partir deste checkpoint.
