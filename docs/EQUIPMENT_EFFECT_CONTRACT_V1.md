# Contrato de efeitos de equipamentos v1 — Fase 2B

Estado: **contrato e validação isolados; autoridade numérica desativada**.

Versão canônica: `echo-equipment-effects/v1`.

Implementação: `contracts/equipment-effect-contract-v1.js`.

Fixtures: `tests/fixtures/equipment-effect-contract-v1.json`.

Regressões: `tests/equipment-effect-contract-v1.test.mjs`.

## Objetivo e fronteira

O contrato registra cada efeito de equipamento ou conjunto sem usar nome,
descrição ou proximidade textual como fórmula. Ele permite conservar uma
mecânica incompleta como pendência explícita, em vez de descartá-la ou aplicá-la
permanentemente.

A Fase 2B não:

- lê nem grava o contrato no Supabase;
- altera `attributes`, `stats` ou os três modos atuais do editor;
- importa o módulo em `game-stat-engine`, `runtime-compat`, análise, comparação
  ou Edge Functions;
- executa operações, calcula totais ou decide ordem aritmética;
- reclassifica equipamentos ou bônus reais de Slayer/Predador;
- transforma textos em alvos, unidades, condições ou fórmulas.

O objeto exportado `EQUIPMENT_EFFECT_NUMERIC_AUTHORITY` permanece com
`enabled: false`. A função de diagnóstico nunca devolve um resultado
“aplicado”; ela apenas explica por que um efeito ainda não pode ser executado.

## Envelope versionado

| Campo | Regra |
|---|---|
| `contract_version` | Exatamente `echo-equipment-effects/v1`. Versão desconhecida é preservada e bloqueada, nunca tratada como v1. |
| `document_id` | Identidade estável e não vazia do documento. |
| `data_revision` | Revisão dos dados usados para construir o documento. |
| `ruleset_revision` | Revisão das regras/contrato; não é versão do jogo. |
| `subject` | Objeto `{ kind, id }`; `kind` é `equipment`, `equipment_variant`, `set_bonus` ou `fixture`. |
| `expected_effect_count` | Inteiro não negativo quando o inventário esperado é conhecido; `null` quando ainda não há fonte suficiente. |
| `effects` | Lista de efeitos. `effect_id` é único dentro do documento. |

`expected_effect_count` mede inventário, não cálculo. Cinco efeitos esperados
com quatro representados nunca formam um documento completo, ainda que os
quatro sejam válidos.

## Campos obrigatórios por efeito

| Campo | Regra |
|---|---|
| `effect_id` / `effect_revision` | ID estável e revisão inteira positiva. |
| `origin` | Tipo e ID de origem. Variante identifica equipamento e variante; bônus de conjunto identifica conjunto e patamar. |
| `target` | Grandeza canônica do registro de capacidades, ou `null` em pendência ainda não resolvida. |
| `operation` | `add`, `relative_percent`, `percentage_points` ou `multiply`; pode ser `null` somente em pendência. |
| `value` | Número JSON finito. Strings como `"3,5"` e `"+5%"` são inválidas; pode ser `null` somente em pendência. |
| `unit` | Unidade compatível com alvo/operação; pode ser `null` somente em pendência. |
| `condition` | Condição estruturada, sem leitura do texto original. |
| `duration` | Estado explícito da duração, inclusive `unknown`. |
| `scope` | Escopo do efeito, separado da elegibilidade do item/conjunto. |
| `stacking` | Grupo, regra, semântica de patamar e limite conhecido. |
| `provenance` | Estado de verificação, data e uma ou mais fontes identificáveis. |
| `original_text` | Texto original preservado para apresentação e revisão humana. |
| `support` | `supported` ou `pending`, com motivo obrigatório na pendência. |

Os campos `applied`, `is_applied`, `executed` e `execution_result` são
rejeitados. Aplicação só pode existir no resultado de uma futura execução para
base, herói e cenário específicos.

## Grandezas, operações e unidades

O registro exportado `EQUIPMENT_EFFECT_CAPABILITIES_V1` mantém as definições
iniciais. `createEquipmentEffectRegistryV1` permite estendê-las por snapshot
declarativo versionado, sem alterar cada consumidor ou executar fórmulas.
O validador confere a combinação exata de alvo, operação e unidade.

Distinções obrigatórias já cobertas:

| Conceito | Alvo | Operação/unidade ilustrativa |
|---|---|---|
| Armadura máxima | `armor_capacity` | `relative_percent` + `percent` |
| Recuperação de armadura | `armor_regeneration_rate` | `add` + `armor_point_per_second` |
| Vida máxima | `health_capacity` | `add` + `health_point` |
| Recuperação de vida | `health_regeneration_rate` | `add` + `health_point_per_second` |
| Cura da habilidade | `ability_heal_amount` | `add` + `health_point`, com habilidade identificada |
| Poder de perfuração | `penetration_power` | `add` + `penetration_point` |
| Penetração de armadura | `armor_penetration` | `percentage_points` + `percentage_point`, ou percentual relativo explícito |
| Taxa de tiro | `shots_per_second` | `add` + `shot_per_second` |
| Intervalo entre tiros | `fire_interval` | `add` + `second` |

`shots_per_second` não é alias de `fire_interval`. Uma transformação recíproca
exigiria domínio válido e regra confirmada; ela não existe nesta fase.

`relative_percent` descreve alteração relativa. `percentage_points` descreve
pontos percentuais. A unidade de uma não é aceita na outra.

## Condição e duração

| Condição | Identidade exigida | Duração compatível |
|---|---|---|
| `always` | Nenhuma | `not_applicable` |
| `ability_active` | `ability_id` | `while_condition` |
| `after_event` | `event_id` | `known`, `unknown` ou `not_applicable` sob revisão |
| `mode_active` | `mode_id` | `while_condition` |
| `state_active` | `state_id` | `while_condition` |
| `unknown` / `unsupported` | `raw_text` preservado | Estado pendente obrigatório |

Duração `known` exige número finito maior que zero e unidade `second`.
Duração `unknown` exige texto explicativo e `support.status = pending`.
Portanto, “após Bandagem” sem duração confirmada não vira bônus permanente.

## Escopo do efeito

`scope.kind` é `global` ou `restricted`.

- `global` não aceita seletores residuais.
- `restricted` exige ao menos um ID em `hero_ids`, `class_ids`, `ability_ids`
  ou `mode_ids`.
- Dentro de uma categoria, os IDs representam alternativas; categorias
  diferentes deverão ser satisfeitas em conjunto quando a execução for
  implementada.
- O escopo do efeito não substitui `hero_id`, `class_id` ou `is_personal` do
  equipamento.

Assim, um conjunto elegível para uma classe pode conter um efeito restrito a
`hero:lynx`. A fixture representa esse caso sem modificar o Predador real.

## Acumulação e patamares

Todo efeito declara:

- `group`: identidade estável do grupo de acumulação;
- `rule`: `independent`, `additive`, `multiplicative`, `highest`, `lowest`,
  `replace` ou `unknown`;
- `tier_semantics`: `not_applicable`, `incremental`, `cumulative_total` ou
  `unknown`;
- `max_stacks`: inteiro positivo quando conhecido, ou `null`.

Efeito `supported` não aceita regra ou semântica `unknown`. Bônus de conjunto
não aceita `not_applicable`: precisa declarar `incremental` ou
`cumulative_total`. O contrato preserva a diferença, mas não escolhe a
aritmética nem converte textos repetidos.

## Proveniência e suporte

Um efeito suportado exige `verification_status = confirmed` e pelo menos uma
fonte, além de `verified_at` com data válida. `partially_confirmed`,
`unverified` ou `disputed` podem ser preservados, mas o efeito deve permanecer
`pending`.

Fontes aceitas no v1: `official`, `game_screenshot`, `catalog`,
`historical_audit`, `admin_entry`, `migration` e `unknown`. Cada fonte guarda
uma referência e pode guardar data observada e revisão do jogo.

`support.status = supported` significa apenas que o efeito está completo no
contrato. Não significa que o runtime atual o execute, que a base exista ou que
o resultado final esteja completo.

O diagnóstico separa `declared_value_visible` de
`relative_effect_visible`. Um valor declarado e válido pode continuar visível
mesmo sem base; o segundo só é verdadeiro para operação relativa, pontos
percentuais ou multiplicador. Nenhum dos dois abre `execution_eligible` na 2B.

## Leitura fail-closed

`readEquipmentEffectDocument` separa cinco estados:

- `valid`: documento v1 válido sem efeitos pendentes;
- `pending`: documento v1 válido com ao menos uma pendência;
- `invalid`: v1 estrutural ou semanticamente inválido;
- `unknown_version`: versão não reconhecida, preservada integralmente.
- `unknown_registry`: documento aponta para revisão de registro não carregada;
  preservado integralmente, sem classificá-lo como dado comprovadamente errado.

Uma versão futura fica em `preserved`, com `document = null` e autoridade
numérica fechada. Não há downgrade, descarte de extensões ou tentativa de
executar a versão como v1.

## Compatibilidade com o legado

O Admin atual usa `legacy`, `calculated` e `informational`. A ponte
`inspectLegacyBonusTransitionV1` é apenas diagnóstica:

| Modo atual | Estado de transição | Comportamento 2B |
|---|---|---|
| `legacy` | `pending_manual_mapping` | Preserva descrição/stats; não interpreta o texto. |
| `calculated` | `pending_dual_run_validation` | Preserva stats ativos; contrato só poderá substituí-los após comparação 2C. |
| `informational` | `pending_contract_review` | Preserva `__echo_mode` e descrição; não cria número. |

A tabela `LEGACY_BONUS_STAT_TRANSITION_V1` inventaria todas as chaves fixas que
o editor atual emite e associa cada uma a um candidato de alvo/operação/unidade.
O teste lê `admin/js/equipment-bonus-structure.js` e falha se uma chave for
adicionada ou removida sem atualizar esse inventário. Chave personalizada fica
`unregistered_legacy_key`; valor em string fica `requires_review`.

Mesmo para uma chave inventariada, o estado é
`candidate_requires_phase_2c_validation`, `executable: false`, porque ainda
faltam fonte, condição, duração, escopo e acumulação. A ponte sempre retorna
`generated_effects: []`. A persistência, leitura dupla, conversão de
correspondências comprovadas e edição do novo formato pertencem à Fase 2C.

## Exemplos mínimos

Válido:

```json
{
  "target": "armor_regeneration_rate",
  "operation": "add",
  "value": 3,
  "unit": "armor_point_per_second",
  "condition": { "kind": "always" },
  "duration": { "kind": "not_applicable" },
  "support": { "status": "supported", "reason_code": null }
}
```

Pendente, sem deduzir `%`:

```json
{
  "target": "aim_duration",
  "operation": null,
  "value": -10,
  "unit": null,
  "original_text": "-10 ao tempo de mira; unidade ausente",
  "support": {
    "status": "pending",
    "reason_code": "unit_unconfirmed"
  }
}
```

Inválido:

```json
{
  "target": "armor_capacity",
  "operation": "relative_percent",
  "value": "3,5",
  "unit": "percent"
}
```

Os exemplos completos, incluindo origem, escopo, acumulação e proveniência,
estão nas fixtures.

## Critérios de aceite da Fase 2B

- [x] versão, revisão de dados/regras e identidade estável;
- [x] alvo, operação, número finito e unidade compatíveis;
- [x] capacidade, recuperação/s, cura de habilidade e atributos de arma
  separados;
- [x] condição, duração e escopo específico de efeito;
- [x] patamar incremental distinto de total cumulativo;
- [x] proveniência e estado de confirmação;
- [x] texto original preservado sem autoridade numérica;
- [x] mecânica ambígua/versão futura preservada e bloqueada;
- [x] contagem esperada impede falso completo;
- [x] ponte legada sem conversão automática;
- [x] inventário sincronizado das chaves fixas do editor atual;
- [x] teste incluído no Quality Gates;
- [x] nenhum import em consumidores numéricos, migration ou alteração de
  catálogo.

## Gates para 2C e Fase 3

O primeiro bloco da continuidade está documentado em
`docs/EQUIPMENT_EFFECT_CENTRAL_PHASE2C1.md`. A implementação em branch cobre
persistência de rascunho, evidência e revisão, mas ainda depende do CI
PostgreSQL, aplicação posterior da migration e revisão visual. Ela não satisfaz
os gates de publicação, transição de consumidores ou aritmética abaixo.

2C só pode avançar depois de definir:

1. local de persistência e validação no banco sem reescrever migrations
   aplicadas;
2. leitura compatível do legado e de versões futuras;
3. editor explícito por efeito, incluindo pendências;
4. conversões permitidas por chave exata e fonte confirmada;
5. comparação antiga/nova por fixture e diagnóstico de divergência;
6. paridade entre navegador, servidor, cobertura e comparação;
7. feature flag/rollback que preserve o documento novo.

A Fase 3 deverá então confirmar bases, domínios, ordem e acumulação antes de
abrir a autoridade numérica. Nenhuma das duas fases pode inferir fórmula pelo
texto.

## Rollback

Como a Fase 2B não altera banco, catálogo ou imports de runtime, seu rollback
consiste em reverter o módulo dormente, fixtures, teste, documentação e comando
do Quality Gates. Não há dado de produção a apagar ou converter. As barreiras
das Fases 1 e 2A permanecem intactas.

## Limitações preservadas

- A unidade real do valor `-10` de tempo de mira continua não confirmada.
- A duração após Bandagem continua não confirmada.
- As fixtures usam identidades simbólicas e evidência histórica; não são
  migrations nem registros para importação.
- As imagens completas ausentes impedem reparo final de catálogo, mas não
  impedem definir o estado pendente.
- Bases neutras, fórmulas, ordem e arredondamento continuam fora da 2B.

## Complemento 2B — registro extensível e estados independentes

Continuação da MR !53, sem reiniciar as Fases 1/2A/2B. Os requisitos de coleta
e publicação estão em `docs/EQUIPMENT_COLLECTION_CENTRAL_REQUIREMENTS.md`.
Não há integração com o Admin, Supabase ou motor ativo neste complemento.

### Snapshot do registro

`createEquipmentEffectRegistryV1(snapshot)` retorna
`{ valid, registry, errors, preserved }`. Um snapshot inválido ou de versão
futura retorna `registry: null` e conserva a entrada para revisão. Não há
interpretação de texto nem aceitação de expressões JavaScript/SQL.

```json
{
  "registry_version": "echo-equipment-effect-registry/v1",
  "revision": "example:recoil:1",
  "additional_units": [],
  "definitions": [{
    "target": "weapon_recoil",
    "dimension": "weapon.recoil",
    "operations": { "relative_percent": ["percent"] },
    "condition_kinds": ["always"],
    "requires_base_for_absolute_total": true,
    "source_references": ["game_screenshot:IMG_0913.png:common"]
  }]
}
```

O exemplo descreve a redução percentual de recuo observada na captura; não
declara base, fórmula de empilhamento ou implementação numérica. O registro
compilado mantém `numeric_runtime: not_implemented` para toda extensão.

Regras:

- IDs canônicos, sem redefinir grandezas/unidades já existentes nesta versão;
- revisão própria e lista explícita de unidades adicionais;
- apenas operações e condições conhecidas pelo contrato;
- percentual relativo, pontos percentuais e multiplicador exigem suas unidades
  específicas; `add` não aceita essas unidades relativas;
- origem da definição obrigatória; referência não equivale a aprovação factual;
- nenhuma propriedade de fórmula, handler ou código executável;
- resultado imutável, sem congelar/mutar o objeto recebido;
- nova mecânica que não cabe nas operações existentes permanece pendente;
- mudanças incompatíveis das definições iniciais exigirão versão/migração
  explícita, não redefinição silenciosa.

As funções `validateEquipmentEffectDocumentV1`, `readEquipmentEffectDocument`,
`serializeEquipmentEffectDocumentV1` e `summarizeEquipmentEffectDocument`
recebem `{ registry }` como segundo argumento opcional. Documentos que usam
extensões exigem `registry_revision` igual à revisão carregada. Sem opções, o
contrato usa `DEFAULT_EQUIPMENT_EFFECT_REGISTRY_V1`, preservando a API anterior.
Um leitor sem a revisão necessária conserva o documento como `unknown_registry`.

`assessEquipmentEffectExecutionV1(effect, context, { registry })` aceita o
registro no terceiro argumento. Por diagnosticar um efeito isolado, não valida
a revisão do envelope: o consumidor deve antes passar o documento pelo leitor.

Compilação válida significa **formato válido**, não autorização. O registro
deverá vir da revisão aprovada no servidor na 2C; sua identidade será imutável.
O controle em memória que impede passar objetos não compilados não substitui
RLS, aprovação, assinatura/hash ou validação de fontes no banco. Dois snapshots
com mesmo nome de revisão não são certificados como iguais por este módulo;
essa unicidade de conteúdo deverá ser imposta na persistência.

### Diagnóstico sem misturar veracidade e cálculo

O diagnóstico acrescenta `diagnostics_version` e os seguintes eixos:

| Campo | Significado |
|---|---|
| `data_quality.status` | Estrutura inválida ou estado de confirmação declarado na proveniência |
| `data_quality.authority` | Sempre `declared_evidence_not_server_approval`: não é aprovação do servidor |
| `mechanic_support` | `phase_3_required` para definições iniciais, `not_implemented` para extensões, `unregistered` para alvo desconhecido |
| `base_availability.status` | `available`, `not_public`, `unconfirmed`, `load_error`, `invalid`, `not_required` ou `unclassified` |
| `external_data_status` | `awaiting_official_data` somente para efeito contratualmente válido, fonte declarada confirmada e base explicitamente não pública |
| `execution_status` | Sempre `not_executed` nesta fase |

Um número finito recebido em `context.base_values` é apenas um valor disponível
no contexto, não uma base oficial certificada ou de domínio já validado.
`null`, strings e valores não finitos não contam como base disponível. Zero é
preservado como fornecido; não é uma base neutra inventada nem prova de domínio
válido para a futura fórmula.

Para distinguir ausência pública de falha de carga, o consumidor pode enviar:

```json
{
  "base_values": {},
  "base_availability": {
    "crate_open_duration": {
      "status": "not_public",
      "source_reference": "classification:crate_opening_time:v2",
      "missing_data": "Valor-base oficial do tempo de abertura de caixas."
    }
  }
}
```

`not_public` exige referência explícita e explicação do que falta. Ausência
simples fica `unconfirmed`; erro de carga deve ser informado como `load_error`.
Declarações contraditórias, como base fornecida e simultaneamente não pública,
ficam `invalid` no eixo de disponibilidade. Os metadados também são entradas
de contexto, não constatação independente da veracidade pelo módulo.

Uma unidade incorreta continua inválida mesmo quando a base realmente não é
pública. O diagnóstico não altera o cadastro, não retira o efeito do inventário
e não gera valor final, score, aprovação ou solicitação persistente de revisão.

### Testes do complemento

`tests/equipment-effect-registry.test.mjs` cobre registro e unidades adicionais,
operações incompatíveis, revisão desconhecida, preservação de JSON, efeitos
mistos do Bornal, +3% da Armadura Corporal, base externa, falha de carga e
ausência de imports autoritativos. Os 23 testes originais permanecem no gate.
As fixtures das fotos cobrem a raridade comum; não certificam raridades
ocultas, unidades físicas não publicadas ou regras de empilhamento do jogo.
