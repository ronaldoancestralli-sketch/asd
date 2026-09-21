# Consistência dos operadores de equipamentos

Base verificada: GitLab `ad620d241b7557d8beda06d4345f105edd186b71`.
Branch: `fix/equipment-operator-consistency-20260905`.
Release candidata: `0.5.19-beta`.

## Falhas reproduzidas

- O assistente lia somente o nome e ignorava `attributes[].operator`.
- Trocar o operador atualizava o indicador, mas não solicitava nova análise da linha.
- Remover o marcador de percentual não força operação absoluta: velocidade de
  movimento e velocidade de recarga ainda caíam no default percentual do alias.
- A conversão de `health_max_pct` removia parte da chave e perdia o alvo.
- O snapshot herdado de Equipment Evolution V1 descartava o operador. Mudanças
  apenas de sinal podiam manter fingerprint e classificação de mudança antigos.
- A confirmação de salvamento não relia os atributos para conferir o RPC.

Exemplo reproduzido antes da correção: velocidade base 200 com `increase_flat`
e magnitude 3 retornava 206. Os resultados esperados para essa base são:

| Escolha | Resultado |
| --- | ---: |
| +3 | 203 |
| −3 | 197 |
| +3% | 206 |
| −3% | 194 |

## Implementação

O formato persistido continua sendo `{label, value, operator}`. O adaptador
legado preserva a chave original e transporta também a operação absoluta com
o sufixo `absoluto`, simétrico ao sufixo `percentual`. Esses marcadores são
emitidos da escolha explícita; não introduzem inferência de unidade por OCR.
O motor resolve o alvo original e dá precedência à operação transportada.
O comportamento de registros sem operador permanece no caminho legado.

A prévia usa a mesma normalização e o mesmo resolvedor do Site e de
`echo-brain-item-fit`. Um evento explícito atualiza as linhas sem observar
as próprias mutações do assistente e sem criar um ciclo de renderização.
O painel distingue prévia de formulário e confirmação de persistência.

Após salvar, a API relê as variantes e compara todo o conteúdo de `attributes`,
incluindo operadores e ordem das linhas, tolerando somente a ordenação de
chaves de objetos JSONB. Falha de leitura não refaz o RPC nem apresenta os
atributos como confirmados. O Brain reaproveita esse snapshot de leitura.

Equipment Evolution V1 permanece imutável. V2 acrescenta `attributeOperators`
ao snapshot e registra `attribute_operator_change`. A reconciliação preserva
operadores e ordem original ao reconstruir o snapshot. Essa mudança solicita
reavaliação; não executa treinamento nem promove pesos automaticamente.

## Validação e limites

- 176 testes de regressão passaram; 233 arquivos JavaScript passaram na análise de sintaxe.
- Matriz numérica dos quatro operadores nos 20 conceitos do catálogo.
- Casos dos prints, aliases, chaves estruturadas, vírgula decimal e sinal Unicode.
- Atualização das 11 raridades usando funções reais do editor e assistente em DOM simulado.
- Fluxo real da API com transporte de banco simulado: envio, releitura,
  confirmação, divergência e leitura indisponível após gravação bem-sucedida.
- Snapshot do Brain e reconciliação idempotente quando o operador não mudou.
- Contratos e gates das fases anteriores preservados; autoridade numérica
  do contrato da Central continua desativada.

Consultas ao SNV foram somente de leitura. Nenhum atributo real foi alterado
para testes e não houve backfill, migration, alteração de permissões ou deploy.

O navegador do ambiente bloqueou URLs da fixture local por política de
segurança. Não houve validação visual autenticada em PC, iPad ou celular.
DOM simulado e testes numéricos não substituem esse gate. Antes de integrar,
conferir os quatro seletores no editor real, salvar uma alteração autorizada,
reabrir o mesmo equipamento e conferir sinal, prévia e recibo de releitura.

O merge exige revisão visual e autorização explícita conforme PROJECT_HANDOFF.md.
A publicação futura deve respeitar `SITE_BRAIN_DEPLOYMENT_CONTRACT.md`:
Brain implantado e verificado antes de liberar o Pages.

## Retomada da MR !64 em 2026-09-05

- Estado confirmado no GitLab: MR aberta como Draft, branch acima, commit
  `2d2cb35958183bc09dde4ea0575f044c8eea5026`, com `main` ainda em
  `ad620d241b7557d8beda06d4345f105edd186b71`.
- O pipeline `2823029512` falhou no gate 28/101: duas asserções em
  `scripts/check-diversao-experience.py` ainda esperavam imports sem o parâmetro
  `ops=20260905`, já presente em `diversao-responsive.js` e no runner isolado.
  Os cinco jobs PostgreSQL passaram; a verificação do artefato Pages foi pulada.
- Os 792 arquivos desse commit foram recuperados e seus hashes Git conferidos
  com a árvore remota antes de editar. As duas falhas foram reproduzidas.
- Após destravar o gate 28, a execução local identificou no gate 30/101 a
  mesma referência antiga no import do CMS autorizado de Guias. Essa terceira
  asserção também foi alinhada ao `ops=20260905` já presente no código.
- A retomada atualiza somente três referências nos gates e a documentação
  interna; as verificações de isolamento mobile, áudio, animações e CMS permanecem.
  Nenhum runtime, atributo real, migration ou permissão foi alterado.
- Após a correção, o gate Diversão e a validação estrutural de governança
  passaram. Os 43 testes das suítes de cálculo de atributos, persistência,
  editor de operadores e Equipment Evolution V2 passaram, sem casos pulados.
- A sequência local completou os 101 gates do workflow, com retomada no gate
  30 após a terceira correção, e passou na auditoria completa de segurança.
- A validação completa do commit da retomada deve ser conferida no pipeline
  vinculado à mesma MR !64. Os limites de validação visual e as condições de
  merge e publicação descritos acima continuam válidos.
