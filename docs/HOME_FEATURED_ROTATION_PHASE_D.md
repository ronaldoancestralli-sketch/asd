# Home — contrato seguro da rotação do destaque, etapa D

Base pública: `f667cc1bdf38ae0f716066170f2f95683768d485`, versão
`0.5.24-beta`. Migration aplicada no SNV:
`20260906034743_home_featured_rotation_phase_d.sql`.

Esta etapa prepara a rotação diária ou semanal sem ligá-la. A seleção manual
continua sendo a autoridade da página publicada; nenhum job foi criado e a
experiência pública permanece igual até a ativação editorial da etapa F.

## Modelo canônico

`private.home_featured_rotation_config` mantém uma única configuração com modo,
estado da automação, frequência, fuso IANA, horário local, dia da semana, herói
atual, âncora, intervalo vigente e revisão. A configuração nasce em modo manual,
com `automation_enabled = false`, frequência semanal e fuso
`America/Sao_Paulo`.

`private.home_featured_rotation_queue` guarda a ordem normalizada dos heróis.
A carga inicial inclui os 21 personagens habilitados e o executor ignora qualquer
personagem que seja desabilitado depois. `private.home_featured_rotation_history`
é append-only e registra uma chave única por revisão e período, heróis anterior e
novo, origem, intervalo e se houve troca efetiva.

`public.home_featured_state` é a projeção mínima que a home poderá consumir.
Configuração, fila e histórico permanecem no schema privado. Visitantes e contas
autenticadas recebem somente leitura da projeção e execução da RPC
`public.echo_home_featured_state_v1()`, que usa `security invoker`. Quando um
período automático está vencido ou aponta para um herói desabilitado, a RPC
retorna o herói como nulo e impede que uma insígnia antiga permaneça visível.

## Executor preparado

`private.run_home_featured_rotation_v1()` resolve o herói do período atual a
partir da âncora editorial. O cálculo usa o calendário local da configuração,
inclusive para os limites semanais. Um bloqueio transacional serializa chamadas
concorrentes e a chave `revisão + início do período` torna a execução idempotente.

Se a rotina atrasar, ela resolve diretamente o período vigente e grava somente
esse evento; não reproduz trocas intermediárias para o visitante. Com um único
herói elegível, confirma o mesmo personagem. Sem elegíveis, neutraliza a projeção
pública. O executor é `security definer` com `search_path` vazio e não pode ser
chamado por `anon`, `authenticated` ou `service_role` nesta etapa.

## Estado inicial e validação

O SNV preservaria um destaque editorial válido do CMS. Como a home não possuía
esse valor, Slayer foi adotado como estado manual inicial. A fila contém os 21
heróis habilitados, há um único evento de seed e a automação continua desligada.
Os dois jobs já existentes no projeto não foram alterados.

Foram executados testes transacionais no SNV para frequência diária e semanal,
fuso de São Paulo, repetição do mesmo período, execução atrasada sem backfill,
fila com um ou nenhum elegível, timezone inválido, histórico imutável e leitura
pública vencida. Todas as mutações de teste foram revertidas. A mesma cobertura
fica reproduzida em `supabase/tests/home_featured_rotation_phase_d_fixture.sql`
com PostgreSQL 17 e passa a bloquear preview, Brain e Pages no GitLab CI.

Os advisors não apontaram novo alerta de segurança relacionado à etapa. Os
quatro índices novos ainda aparecem como não utilizados porque a estrutura não
recebe tráfego antes da ativação; eles sustentam chaves estrangeiras e consultas
de estado/histórico e permanecem intencionalmente.

## Limite desta entrega

A etapa E adicionará os comandos administrativos para escolher herói, ordenar a
fila, configurar frequência, fuso, horário e ativação. A etapa F criará o
agendamento e conectará a insígnia da home à projeção pública. Até lá, não existe
troca automática do destaque.
