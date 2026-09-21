# Home — autoridade administrativa do destaque, etapa E

Base da etapa: `489baf63d869f44029ed1cd92e3edf957840065c`. Versão
pública preservada: `0.5.24-beta`. Migration aplicada no SNV:
`20260906041241_home_featured_rotation_admin_phase_e.sql`.

Esta etapa entrega o controle editorial da rotação no Admin sem ligar o
agendador. A troca manual do destaque, a frequência, o calendário e a fila
passam pela mesma configuração canônica criada na etapa D. A home publicada
continua com o comportamento atual até a integração deliberada da etapa F.

## Autoridade e permissões

`echo_admin_home_featured_rotation_v1()` exige `publishing.view` e devolve o
estado necessário ao painel: configuração, heróis habilitados, fila ordenada,
histórico recente e as capacidades da sessão. Configuração privada e histórico
continuam fora do acesso direto pelo Data API.

`echo_admin_save_home_featured_plan_v1()` exige `publishing.edit`. O comando
valida frequência diária ou semanal, fuso IANA, horário, dia e fila. A fila não
pode ficar vazia, repetir personagens, incluir heróis desabilitados nem remover
o destaque vigente. Salvar valores idênticos é idempotente e não cria revisão
ou auditoria artificial.

`echo_admin_set_home_featured_hero_v1()` exige `publishing.publish`, motivo entre
4 e 240 caracteres e um herói habilitado presente na fila. A troca atualiza a
configuração privada e a projeção pública mínima de forma transacional, registra
`manual_override` no histórico append-only e escreve na auditoria administrativa
central.

As duas mutações recebem `expected_revision`. Se outro administrador salvar
antes, a revisão divergente encerra a transação com conflito e a interface
recarrega o estado atual. As três RPCs usam `security definer`, `search_path`
vazio, execução exclusiva de `authenticated` e a checagem de capacidade já
adotada pelo painel. `anon` e `service_role` não recebem execução.

## Experiência administrativa

O módulo **Destaque da home** fica em **Conteúdo e publicação** e apresenta:

- destaque, modo, revisão e estado da automação em um resumo único;
- galeria pesquisável de heróis com distinção clara entre seleção e destaque
  vigente;
- confirmação final da troca manual, incluindo a rota anterior, novo herói e
  motivo auditável;
- configuração diária ou semanal, horário local, fuso IANA e dia da semana;
- fila ordenável por controles direcionais, com proteção do destaque atual;
- histórico editorial recente e mensagens explícitas de permissão ou conflito.

A composição se adapta a desktop e celular, mantém alvos de toque de 44 px,
foco visível e respeito a movimento reduzido. O botão de publicação permanece
indisponível enquanto houver planejamento local não salvo, evitando decisões
com base em duas revisões diferentes.

## Validação e limite

Uma transação de produção no SNV confirmou leitura por capacidade, salvamento,
no-op idempotente, conflito de revisão, troca manual, histórico, auditoria,
rejeição de filas inválidas e automação sempre desligada; todos os dados do teste
foram revertidos. A fixture PostgreSQL 17 reproduz esse contrato no pipeline e
passa a bloquear preview, Brain e Pages. O modelo de interface possui testes
Node para normalização, edição da fila, validação, detecção de alterações,
payload e separação de capacidades.

O advisor de segurança não apontou erro novo ligado ao destaque. Ele sinaliza as
três RPCs como funções `security definer` executáveis por `authenticated`; esse é
o caminho intencional do Admin, protegido internamente por capacidade e AAL,
com execução revogada de `anon` e `service_role`. A orientação geral desse aviso
está no [linter 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
O advisor de desempenho mantém os quatro índices da etapa D como ainda não
utilizados enquanto a rotação não recebe tráfego; a referência é o
[linter 0005](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

Não há criação ou alteração de Cron nesta entrega. O painel exibe a ativação
como protegida e nenhuma RPC aceita um campo para ligá-la. A etapa F conectará a
home à projeção canônica, criará o agendamento e só então permitirá ativação
controlada da frequência preparada aqui.
