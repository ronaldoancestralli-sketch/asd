# Central de Status e Bônus — Fase 2C.1

Estado: **Fase 2C.1 integrada pela MR !54; correção de usabilidade em branch
separada, sem alteração de banco**.

A MR !54 foi integrada em 2026-09-03 pelo commit
`5cfc8a47051c12c153c7b339973a7386497af11c`. O pipeline pós-merge
`2815163571` passou com todos os gates PostgreSQL e o deploy de Pages. A
autoridade numérica, a publicação e os cálculos continuam desligados.

Esta fase continua o contrato `echo-equipment-effects/v1` integrado pela MR
!53. Ela cria a fronteira de coleta e revisão, sem converter o catálogo, sem
publicar efeitos e sem habilitar o motor numérico.

## Persistência

| Estrutura | Responsabilidade |
|---|---|
| `equipment_effect_documents` | Um documento atual por equipamento, variante ou bônus de conjunto |
| `equipment_effect_document_revisions` | Payload e manifesto de evidência imutáveis, numerados e identificados por SHA-256 |
| `equipment_effect_evidence` | Referência persistente, hash do arquivo, trecho e contexto observável |
| `equipment_effect_revision_evidence` | Vínculo imutável entre revisão e evidência válida |
| `equipment_effect_review_queue` | Solicitação e parecer atuais; decisões substituídas permanecem no histórico |

Todas as tabelas usam RLS e grants explícitos. `anon` não lê nem executa as
RPCs. O papel autenticado precisa satisfazer `current_user_is_admin()`. Escrita
direta é recusada por trigger; as funções permanecem `security invoker` com
`search_path = public, pg_temp`.

### Correção dos privilégios herdados

No SNV, `authenticated` e `service_role` receberam privilégios extras por
default, incluindo `TRUNCATE`, `REFERENCES`, `TRIGGER`, `DELETE` e `UPDATE` nas
tabelas imutáveis. O `GRANT` original não removeu esses defaults. RLS e triggers
de linha não protegem operações de tabela inteira, como `TRUNCATE`.

A migration corretiva `equipment_effect_central_privileges_v1` revoga os
privilégios dos cinco objetos e concede somente a matriz necessária:

| Objeto | `authenticated` / `service_role` | `anon` / `PUBLIC` |
|---|---|---|
| Documentos e fila | SELECT, INSERT, UPDATE, sujeitos aos controles existentes | Nenhum |
| Revisões, evidências e vínculos | SELECT, INSERT, sujeitos aos controles existentes | Nenhum |
| Duas funções usadas exclusivamente por triggers | Sem EXECUTE direto | Nenhum |
| Oito RPCs/helpers existentes | EXECUTE preservado | Nenhum |

Não modifica defaults globais, funções numéricas, regras de RLS, dados nem
objetos de outros módulos. A fixture passa a reproduzir defaults permissivos,
prova que a matriz original falha e exige que a correção passe duas vezes
(idempotência), incluindo ausência de grant option e `MAINTAIN` no PostgreSQL 17.
Os testes de save/review existentes comprovam a execução dos triggers mesmo sem
permissão de chamada direta pelos papéis da API. O teste de `TRUNCATE` negado só
existe no banco descartável; nunca deve ser executado no SNV.

Referências: [Supabase — grants/defaults](https://supabase.com/docs/guides/api/securing-your-api)
e [PostgreSQL 17 — RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

### Identidade das migrations e limite operacional

- Inicial aplicada: `20260902173201_equipment_effect_central_phase2c1.sql`.
- O nome anterior começava por `20260902122219`. O arquivo foi apenas renomeado
  para coincidir com o histórico real; **não é uma segunda aplicação**.
- SHA-256 do SQL original, igual ao `schema_migrations` do SNV:
  `17945f4c4f435237383141288a9894604776bee20ae320759168aa5b46bd506a`.
  Um teste Node impede alteração de conteúdo ou retorno do identificador antigo.
- Corretiva aplicada: `20260902185123_equipment_effect_central_privileges_v1.sql`.
  O nome candidato começava por `20260902184021`; somente o nome foi alinhado
  depois da aplicação. SHA-256 idêntico ao SQL testado e ao histórico do SNV:
  `6f1975c7e2c6ab8f6b99132117b6c030dca058b60020152a0cbb966d54d19f98`.
  Nunca repetir `apply_migration` para alinhar nomes.
- O usuário autorizou, nesta retomada, o fluxo GitLab/Supabase sem CLI local.
  A exceção não concede autorização de merge nem de ativação numérica.

### Pós-aplicação confirmado em 2026-09-02

- 120 combinações de papel/tabela/privilégio e 30 de papel/função conferidas;
  divergências caíram de 56 para zero nas tabelas e de quatro para zero nas funções.
- Sem RLS desativado ou grant option; oito RPCs/helpers com EXECUTE preservado,
  dois guards sem chamada direta pelos papéis da API.
- As cinco tabelas continuam vazias. Os hashes integrais do catálogo ficaram
  iguais antes/depois: 29 equipamentos, 319 variantes e três bônus.
- Definições das funções, políticas, triggers, defaults globais e ACLs de outras
  tabelas/funções públicas também ficaram iguais. Comparar JSON canônico, sem
  tratar a ordem de chaves dos objetos como alteração de conteúdo.
- Consulta reproduzível, exclusivamente de leitura:
  `supabase/tests/equipment_effect_central_privileges_postflight.sql`. Executar
  as duas consultas separadamente em clientes que retornam só o último resultado.
- Nenhum TRUNCATE, exemplo ou escrita de dados de teste foi executado no SNV.
- O pipeline posterior ao alinhamento de nomes e o checklist atualizado ficam
  registrados na MR !54; a prévia gerada pelo CI não equivale a teste visual real.

## Estados separados

- `validation_state`: `valid`, `invalid`, `unknown_version` ou
  `unknown_registry`;
- `evidence_state`: `complete` ou `incomplete`;
- `workflow_status`: `draft`, `in_review`, `reviewed` ou
  `changes_requested`;
- `support.status` continua distinguindo mecânica suportada de pendência;
- base pública, falha de carregamento e execução continuam fora deste banco de
  coleta e mantêm os diagnósticos definidos na 2B.

Uma fonte incompleta pode permanecer no manifesto do rascunho, mas não entra
na fila. Uma versão desconhecida é preservada como JSONB e também não entra na
fila. Aprovação retorna `published: false`; não existe RPC de publicação.

## RPCs administrativas

| RPC | Efeito |
|---|---|
| `validate_equipment_effect_document_draft_v1` | Valida contrato/registro instalado sem interpretar texto |
| `admin_save_equipment_effect_draft_v1` | Cria revisão somente quando conteúdo ou manifesto mudam |
| `admin_list_equipment_effect_drafts_v1` | Relê documento, payload, evidências e parecer atual |
| `admin_request_equipment_effect_review_v1` | Enfileira somente revisão atual, válida e com evidência persistente |
| `admin_review_equipment_effect_revision_v1` | Aprova ou solicita ajustes sem publicar |

## Interface

A correção de usabilidade da MR !55 substitui a edição isolada de cada variante
por uma **matriz por bônus**. O fluxo principal tem três etapas: escolher a
referência, montar os bônus e registrar a evidência. Cada cartão representa um
bônus independente e contém:

1. a grandeza afetada;
2. um único operador para todas as raridades daquele bônus;
3. uma grade compacta com um campo numérico para cada raridade;
4. texto original e detalhes de auditoria recolhidos.

Os quatro operadores visíveis são semanticamente completos:

| Escolha | Payload persistido | Regra declarativa |
|---|---|---|
| **+** | add ou percentage_points, unidade da grandeza, valor positivo | base + bônus |
| **−** | add ou percentage_points, unidade da grandeza, valor negativo | base − bônus |
| **+%** | relative_percent, percent, valor positivo | base × (1 + bônus / 100) |
| **−%** | relative_percent, percent, valor negativo | base × (1 − bônus / 100) |

O campo de cada raridade aceita somente a magnitude. Portanto, um primeiro
bônus pode usar **+** e um segundo bônus pode usar **−%** sem repetir sinais ou
o caractere de percentual nas onze classificações. Operador e unidade continuam
explícitos no payload; essas regras apenas projetam o formulário sobre o
contrato já aplicado.

A ação **Salvar todos os rascunhos** transforma cada coluna em seu documento de
variante e chama a RPC existente sequencialmente. Uma falha informa a raridade
e quantos documentos já foram processados, preserva os campos locais e permite
tentativa idempotente. Não foi criada migration nem RPC matricial. Revisão
administrativa continua escolhendo uma raridade por vez.

IDs, códigos internos, hashes, condições, escopo, acumulação e parecer ficam em
divulgações progressivas. O cadastro mantém, sem perda, alvo, operação, valor
com sinal, unidade, condição, duração, escopo, empilhamento, texto original,
fonte e estados de suporte separados.

A aba legada **Raridades** mantém seus campos para não alterar dados de
produção, mas passa a avisar que sinais e percentuais não devem ser repetidos
nos nomes e oferece acesso direto à matriz auditada da aba **Efeitos**.

### Referência externa e exclusão do catálogo numérico

O snapshot **bullet-echo-fandom-gears/2026-09-03.1** usa a página **Gears** da
Bullet Echo Fandom Wiki e as capturas fornecidas pelo usuário como fonte
administrativa. A consulta do editor ao equipamento seleciona somente id e
name; a consulta das variantes seleciona identidade, raridade e ordem. O campo
legado equipment_variants.attributes não é lido, comparado nem convertido.

A captura da tabela da Faixa de Combate comprova os valores Comum 10, Raro 12,
Épico 14, Lendário 16, Mítico 18, Supremo 20, Grandioso 22, Celestial 23,
Estelar 24 e Imortal 25. Divino permanece vazio porque não aparece na evidência
usada nesta revisão. Para os demais itens visíveis na página geral, o snapshot
preserva somente grandeza e direção quando a tabela numérica específica não foi
comprovada. Nesses casos, a regra não pré-seleciona valor absoluto ou percentual:
o painel informa se a fonte diz aumentar ou reduzir e exige confirmação explícita
entre **+**/**+%** ou **−**/**−%**. Somente a Faixa de Combate recebe operador
automático porque sua tabela mostra valores absolutos. Nenhuma progressão é
extrapolada.

O alvo aimed_range é apresentado como **alcance/tamanho da mira**, isto é, o
comprimento do cone ao mirar. Ele permanece distinto de vision_range e de
unaimed_fire_spread, que representa a largura/dispersão sem mirar.

As regras externas preenchem rascunhos como pending; uma captura confirmada não
declara que a mecânica está instalada, não concede autoridade numérica e não
substitui a revisão administrativa.

O arquivo escolhido no navegador não é enviado: ele serve apenas para calcular
o SHA-256. A pessoa administradora precisa informar uma referência persistente;
o painel declara essa limitação. Se as RPCs ainda não existirem no ambiente, a
aba mostra o bloqueio e não interfere no cadastro normal.

## Gates e rollback

### Retomada do carregamento do preview — 2026-09-03

A captura trazida pelo usuário registra a sessão administrativa no PC com a
Central presa em “Carregando a Central…”. A causa foi confirmada no código:
o builder publicava apenas `admin`, `assets`, `css` e `js`, mas o core da Central
importa `contracts/equipment-effect-contract-v1.js`. O validador conferia HTML
e CSS sem conferir os imports dentro dos módulos JavaScript. O contrato existia
no repositório, mas não no artefato.

Correção restrita a esta regressão:

- inclusão explícita somente desse contrato; os demais arquivos de `contracts`
  continuam fora da publicação, com recusa de symlinks e contratos não autorizados;
- conferência dos imports/reexports literais em JS/MJS e scripts inline, incluindo
  `new URL(..., import.meta.url)`, contra os arquivos do artefato e não a fonte;
- import da Central protegido no editor, com erro visível e continuação dos
  demais aprimoramentos se a dependência falhar;
- regressões executam o builder e o validador reais em diretório descartável,
  reproduzem a omissão antiga e importam o core real do artefato corrigido;
- nenhum mock ou preloader desses testes é incluído no preview; a verificação
  da configuração pública do build real permanece inalterada.

O gate estático cobre referências literais, não resolve caminhos calculados em
runtime e não substitui o teste visual autenticado. O carregamento foi aprovado
e a MR !54 integrada; a correção de usabilidade posterior exige novo checkpoint
visual próprio. CI, commit e próximo ponto exato devem ser consultados na MR da
correção.
Não reaplicar migrations, registrar equipamentos fictícios no SNV, publicar
efeitos, ativar cálculo ou efetuar merge por causa desta correção.

O job `equipment-effect-central-database` cria o banco descartável
`equipment_effect_central_test` em PostgreSQL 17.11. A fixture recusa qualquer
outro nome de banco e cobre RLS/grants, escrita direta, idempotência, revisão,
invalidação por edição, versão futura, fonte incompleta e a ida/volta dos casos:

- Armadura Corporal comum: `+3`, `relative_percent`, `percent`;
- Bornal comum: `+17`, `add`, `distance_unit`, e `-25`,
  `relative_percent`, `percent`, em efeitos independentes.

As migrations aplicadas não devem ser removidas nem ter seu SQL reescrito.
Se uma RPC perder uma permissão necessária, corrigir somente esse grant em
migration posterior testada, sem restaurar `GRANT ALL`, defaults globais ou
`TRUNCATE`. A Central pode continuar sem uso enquanto o reparo é validado; não
apagar tabelas, evidências ou revisões como rollback. As Fases 1, 2A e 2B e o
caminho numérico legado permanecem preservados. Teste visual em PC/iPad/mobile
e autorização explícita de merge continuam obrigatórios para toda correção
posterior. O feedback atual invalida apenas a aceitação de usabilidade da tela
anterior; não invalida os gates de banco nem autoriza reabrir migrations.
