# Central de Status — contrato, operação e entrega

## Problema e escopo autorizado em 2026-09-06

O cadastro atual associa texto livre a um catálogo fixo. A frase “dispersão de
tiro da arma sem mirar” não foi reconhecida no teste do motor. A Central 2C.1
existente guarda rascunhos, mas não publica regras numéricas. Esta evolução
adiciona essa responsabilidade por um contrato novo; preserva os documentos,
evidências e migrations anteriores.

## Constatações em leitura do SNV

23 heróis, 319 variantes de 29 equipamentos, 84 habilidades. Zero documentos
2C.1 e zero pendências abertas não equivalem a ausência de problemas. Os campos
de arma detalhados estão preenchidos em 17 heróis. No Slayer, `fire_interval=183`
corresponde à pontuação do resumo exibido nas imagens; `fire_rate=0.3` aparece na
tela detalhada com “s”. `movement_speed=51` corresponde ao movimento ao mirar,
enquanto a captura mostra 171 para movimento máximo. `weapon_range=508` diverge
dos 430 da captura. Não corrigir globalmente esses campos com base em um herói.

As capturas fornecidas identificam Slayer Divino, nível máximo, e distinguem:
dispersão sem mira 50°, acréscimo ao mover +5°, dispersão com mira 5°, tempo de
mira 1,7 s, fator de dispersão 1,3. Uma imagem de equipamento mostra redução de
14% da dispersão sem mirar e outra mecânica independente para pegar melhorias.
O contexto não comprova automaticamente se uma captura é base sem equipamento;
nenhum desses valores será inserido automaticamente em produção.

## Modelo

1. **Descoberta:** ler chaves e valores de `hero_base_stats`,
   `hero_weapon_stats`, `hero_skills` e `hero_skill_levels`. Campo descoberto
   aparece como pendente até ter significado/unidade explícitos.
2. **Definição:** identidade estável, nome legível, escopo, chave de origem,
   unidade, direção de benefício, limites e evidência. Pontuação de resumo não
   aceita vínculos numéricos. Graus, segundos e tiros/s são unidades distintas;
   não há conversão implícita entre intervalo e frequência.
3. **Vínculo:** fonte identificada, linha exata e snapshot do atributo, destino,
   operador, unidade e condição. Nome nunca decide um vínculo publicado.
   Alteração posterior da linha invalida o vínculo até revisão, sem voltar
   silenciosamente ao interpretador textual. Raridades permanecem independentes.
4. **Revisões:** edição concorrente protegida por revisão esperada, snapshots
   imutáveis, motivo obrigatório, publicação separada e restauração de revisão.
   Restaurar produz um rascunho novo. Publicá-lo exige nova revisão das fontes atuais.
5. **Execução:** mesmo módulo puro no navegador e no Brain. A linha vinculada
   substitui sua interpretação legada, não soma uma segunda aplicação. A ordem
   sequencial do motor continua explícita. Condição não informada, base ausente,
   unidade incompatível ou fonte alterada bloqueiam somente o efeito e aparecem
   na trilha; indisponibilidade do registro bloqueia a análise nova.
6. **Prova:** escolher herói/equipamentos reais, comparar publicado e rascunho,
   mostrar origem da base, regra, operação, antes/depois e razão de não aplicação.
   Reconhecido, salvo, aplicável, aplicado e confirmado pelo Brain são estados
   distintos. Um cabeçalho de versão sozinho não prova igualdade dos números.

## Interface

Entrada destacada no menu administrativo e atalhos na Auditoria, no Brain e
nos editores. Áreas: diagnóstico, status, vínculos, prova do cálculo e revisões.
Formulários orientados aos nomes do jogo; IDs e payload ficam nos detalhes.
Sem métricas inventadas, resultado “saudável” em consulta falha ou preenchimento
de base ausente com zero. Alteração de base exige valor anterior, motivo e fonte.
Cadastro de habilidade mantém o editor e as regras de confiança existentes.

## Fronteiras e validação

Registro publicado é público; rascunhos, autores, motivos e evidências de revisão
são administrativos. Permissões seguem as capacidades existentes de equipamento
e heróis, inclusive no banco. Não executar fórmulas livres ou SQL do formulário.
Não alterar grants/defaults globais, dados de equipamento ou promoção do modelo.

Testes devem cobrir os quatro operadores, graus e decimais, duplicatas, fonte
alterada, base zero/ausente, condições, limites, raridades, dupla aplicação,
concorrência, autorização, leitura pública e paridade de resultados. CI usa
PostgreSQL descartável. A migração é aditiva e exige fixture aprovada. Produção
mantém deploy Brain antes do Pages e verificação dos dois contratos.

## Estado da entrega

Checkpoint de **2026-09-07**, na branch `feat/status-central-20260906`,
[Draft MR !66](https://gitlab.com/echo-arena-gitlab-group/echo-arena-restaurado/-/merge_requests/66).
Base `6088fd18`, preservando a MR !65. Backup remoto inicial:
`backup/main-before-status-central-20260906-7b522780`. Os primeiros checkpoints
remotos são `6bf78578` e `d0694e25`; consultar o HEAD da MR para a continuação.
Não confundir os SHAs locais de recuperação com os commits criados no GitLab.

O código implementa o registro, a Central, o fluxo público, o Brain e a Auditoria.
A revisão final também cobre fontes removidas, paginação dos níveis, seleção
explícita de um único nível ativo, origem tipada no contrafactual, preservação
do cache transitivo e invalidação de provas após mudança de base ou revisão.
O rótulo de regra reconhecida não é apresentado como prova de aplicação.

### Verificações realizadas

- **35 testes específicos aprovados:** 24 do executor, 7 de integração e 4 do
  contrato de pré-deploy. Comando:
  `node --experimental-vm-modules --test tests/status-registry-v1.test.mjs tests/status-central-integration.test.mjs tests/status-deployment-contract.test.mjs`.
- **5 testes existentes de cobertura do Brain aprovados:**
  `node --test tests/echo-brain-equipment-coverage.test.mjs`.
- **105/105 comandos locais disponíveis** do workflow canônico aprovados após
  os ajustes de código. Foram excluídas somente as duas etapas de instalação e
  geração do OCR; seus artefatos locais pré-existentes foram reutilizados e não
  devem ser versionados. Isto não equivale a executar o pipeline completo.
- `scripts/check-security-full-audit.py` e `git diff --check` aprovados.

O teste de integração executa o loader e a análise públicos reais com um
catálogo isolado e compara a trilha com o modelo administrativo: redução de
23% sobre 50° seguida de −1° produz 37,5°. É uma fixture, não uma medição ou
correção da base de produção. A confirmação autenticada contra a Edge Function
publicada ainda não foi realizada para esta versão.

### Validação de banco e CI

O pipeline inicial `2824589130` expôs um erro de sintaxe SQL e referências de
cache antigas nos gates; ambos foram corrigidos. `2824595633` não executou os
jobs por `ci_quota_exceeded`. O pipeline posterior
[2825100504](https://gitlab.com/echo-arena-gitlab-group/echo-arena-restaurado/-/pipelines/2825100504),
do commit `9eb78477`, passou **11/11 jobs**, incluindo **107/107 Quality Gates**
com instalação/geração do OCR, nove fixtures de banco e a segurança do artefato
Pages. A fixture nova passou no job `16336536067` em PostgreSQL descartável.

Nesse mesmo job, o Supabase CLI gerou o nome
`20260907021850_status_central_v1.sql`. O SQL aprovado foi movido, sem mudança
funcional, de `supabase/drafts/status_central_v1.sql` para
`supabase/migrations/20260907021850_status_central_v1.sql`; a fixture passou a
ler o arquivo definitivo e a geração provisória foi retirada do CI. O pipeline
`2825106368`, do commit `ff4c1d84`, aprovou novamente esse empacotamento.

### Instalação aditiva no SNV

Após esses dois pipelines verdes, `status_central_v1` foi aplicada pelo MCP ao
SNV. O histórico real registrou **`20260907022656`**. O arquivo foi alinhado a
`supabase/migrations/20260907022656_status_central_v1.sql`, sem mudar o corpo do
SQL aprovado. A fixture e o gate de identidade apontam para essa versão.
**Não reaplicar nem renomear o registro do banco para o timestamp do scaffold.**

Verificação posterior, em 2026-09-07:

- **117 verificações de privilégios, zero divergências** entre tabelas, colunas,
  sequences e funções para `anon`, `authenticated` e `service_role`.
- RLS ativo nas três tabelas; leitura sob o papel `anon` devolveu revisão 0,
  fingerprint `unpublished`, definições e vínculos vazios.
- Zero rascunhos e zero publicações. O singleton contém apenas o estado inicial.
- Contagens e hashes idênticos antes/depois nas oito fontes: 23 heróis,
  115 bases de herói, 206 bases de arma, 84 habilidades, zero níveis de
  habilidade, 29 equipamentos, 319 variantes e 3 bônus de conjunto.
- Advisors revistos: a ausência de policy na tabela de revisões é intencional,
  pois nenhum papel de API recebe acesso direto. As cinco RPCs administrativas
  são `SECURITY DEFINER` com checagem de capacidade, grants restritos e
  `search_path` fixo; o aviso de execução por `authenticated` não concede
  capacidade administrativa. A fixture testou a rejeição sem capacidade e a
  matriz real confirmou os grants. Referências:
  [RLS sem policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  e [RPCs privilegiadas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- O advisor de `v_popular_builds` como view `SECURITY DEFINER` já existia antes
  desta instalação e permanece fora desta alteração. Não declarar a segurança
  global do projeto aprovada por causa dos testes da Central.

### Integração autorizada em 2026-09-07

O pipeline **`2825200513`**, do HEAD remoto **`17413fb0`** da MR !66, passou
novamente com a migration alinhada ao SNV. O usuário então instruiu explicitamente
**“Aplique na main”**. A branch `integration/status-central-main-20260907` parte
da main **`798c0765`**, com o conteúdo da !66 e os três ajustes posteriores da
home preservados. O ledger já publicado na main permanece integral; a release
da Central é registrada em 2026-09-07, após `0.6.6-beta`, como `0.7.0-beta`.

A revisão visual autenticada **não foi concluída**. O navegador autenticou no
GitLab, abriu o artefato aprovado e passou pelo login administrativo, mas parou
no MFA Founder. A revisão automática rejeitou a elevação a AAL2 com capacidades
totais de governança. A instrução para integrar não foi usada para repetir ou
contornar essa ação. O CI e o carregamento anterior ao login não equivalem à
validação visual da Central autenticada.

A migration já está instalada; não houve alteração de bases nem publicação de
vínculos. O build local não conseguiu consultar a configuração pública do SNV,
enquanto o mesmo build foi aprovado no CI. A confirmação do merge e do deploy
deve constar da MR de integração e do respectivo pipeline protegido; este
checkpoint registra a preparação, sem antecipar resultados de produção.

### Sequência de entrega

1. Exigir CI completo para a combinação final e reconferir a main antes do
   merge autorizado. A fixture executa apenas em `status_central_test` descartável.
2. Acompanhar o pipeline da main: disponibilidade do registro → deploy Brain →
   prova dos dois contratos → Pages. Não reaplicar a migration já instalada.
3. Confirmar a publicação e registrar a evidência na MR. Instalar a Central não
   publica automaticamente vínculos nem corrige dados dos heróis. A validação
   visual autenticada continua sendo uma limitação explícita desta entrega.
