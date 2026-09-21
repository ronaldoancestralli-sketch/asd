# Central de Status e Bônus — continuidade sem reinício

Complemento do plano de remediação e da MR !53. Requisitos consolidados em
02/09/2026 a partir da discussão de coleta/classificação e das quatro novas
imagens. Este documento não declara a Central já implantada no painel/banco.

## Decisão e fronteiras

Preservar Fases 1/2A, suas migrations, regras de exclusividade e testes.
Aproveitar o contrato 2B existente; não iniciar outro motor ou catálogo paralelo.
Os defeitos de perda de unidade e classificação pertencem aos caminhos ainda
pendentes de coleta/transição e aritmética, não invalidam as proteções publicadas.

O complemento 2B implementou registro extensível e diagnóstico isolados e foi
integrado pela MR !53. A continuidade 2C.1 ocorre em branch própria: adiciona
persistência e interface de coleta/revisão, sem backfill, alteração de
item/conjunto, publicação ou ativação do cálculo.

Reabrir uma parte concluída somente com reprodução de falha crítica, escopo
afetado e justificativa de por que um complemento localizado não basta.
Não alterar migration histórica nem apagar dados para adaptar o contrato.

## Como a coleta deverá funcionar na 2C

1. Rascunho separado da versão publicada. OCR/importadores sugerem, não aprovam.
2. Fonte preservada, referência persistente/hash, trecho, item, variante,
   raridade/nível e revisão do jogo quando conhecida; não depender de scratch.
3. Lista de efeitos independentes por variante: alvo, operação, valor com sinal,
   unidade, condição/duração, escopo, acumulação, evidência e revisão.
4. Formulário mostra fonte ao lado do registro estruturado. `%` nunca depende
   de palavras no nome. Número localizado pode ter conversão explícita de
   entrada; o documento canônico não aceita coerção silenciosa.
5. Validação e publicação transacionais no servidor. Cliente não pode aprovar
   o próprio payload declarando `confirmed`. RPC/importação/restauração e rotas
   diretas autorizadas obedecem às mesmas invariantes, sob RLS.
6. Mudança de valor, unidade, fonte ou regra invalida aprovação da revisão
   afetada. IDs de revisão correspondem a conteúdo imutável e verificável.
7. Rascunho inválido pode ser conservado para revisão; não substitui a versão
   publicada. Erro retorna campo, motivo e ação; fila é idempotente por revisão.
8. Efeito comprovado sem base pública pode ser publicado para exibição, com
   limitação explícita, sem execução. Não exigir um dado que o jogo não divulga.
9. Mecânica inédita preserva fonte/texto e fica sem implementação numérica.
   Novos alvos com operações existentes reutilizam o registro validado.
10. Site, Admin, comparação e Brain compartilham definições e diagnósticos.
    Brain não inventa base, fórmula ou score para preencher informação ausente.

O banco garante forma e invariantes, não a verdade do valor fotografado sem
conferência da fonte. Não prometer certeza factual de 100%. `supported` no
contrato v1 não substitui revisão de evidência nem aprovação administrativa.

## Preservar o tratamento de dados externos existente

Já existem:

- `js/equipment-data-limits.js`: `awaiting_official_data`, sem inventar base;
- `js/equipment-attribute-classifications.js`: `external_data_required`;
- `js/build-external-data-ui.js`: valor real visível, resultado não calculado;
- `admin/js/equipment-audit-external-data-ui.js`: falta de dado oficial não é erro.

Na transição, conservar essas funções e a origem das classificações. Substituir
dependência de nomes/rótulos por IDs/revisões, corrigir fallback de raridade e
paginação, e não permitir que um ajuste visual esconda cadastro inválido.
O complemento 2B apenas testa compatibilidade de significado; não modificou
esses consumidores nem os ligou ao novo contrato.

| Situação | Resultado exigido |
|---|---|
| Efeito confirmado, base não pública | Exibir valor e fonte; sem total absoluto, sem tratá-lo como erro |
| Efeito com unidade incorreta e base não pública | Mostrar ambas as condições; solicitar revisão da unidade |
| Mecânica nova comprovada | Exibir descrição e pendência de implementação, sem fórmula aproximada |
| Base disponível no jogo, mas carga falhou | Erro de carga/cobertura, não “jogo não divulga” |
| Condição conhecida mas inativa | Válido e não aplicado nesse cenário |

## Evidências das imagens e limites

| Capturas | Valor confirmado na imagem do jogo | Regressão |
|---|---|---|
| IMG_1204 / IMG_0946 | Armadura Corporal comum: +3% armadura máxima | Não converter para +3 pontos; exigir operação/unidade explícitas |
| IMG_1202 / IMG_0913 | Bornal do Slayer comum: +17 alcance com mira e −25% recuo | Preservar os dois efeitos e sinais; não mapear recuo para dispersão |

As raridades superiores estão fechadas nas imagens do jogo. Não extrapolar
valores do painel nem chamar a unidade de alcance de metros sem fonte. A
captura não informa todas as fórmulas ou revisão atual do jogo. Testes usam
identidades simbólicas e não são registros para importação no catálogo.

Identificação das fontes fornecidas pelo usuário (bytes originais, sem edição):

| Arquivo | SHA-256 |
|---|---|
| IMG_1204.png | `61ddfe782fe1355cdc8c167d11c0a9e179a5ace5f0b6b0bb8e36924952393204` |
| IMG_0946.png | `7ea1c62c19bc68918b281779da99450817d9bceec3249315c22fd08f2cf7dab3` |
| IMG_1202.png | `89728ee4650759a9b7ef950b4c7d727e05c1bfa2b31f60addee45584de354f52` |
| IMG_0913.png | `49979aba5451b6aa4776dac28d6dc16e3506c2293913655d78585d7a5538f5b7` |

As imagens continuam nos anexos da conversa; não foram copiadas ao código.
Se faltarem na próxima sessão, recuperar os anexos ou solicitar somente a
fonte específica necessária; não afirmar que o hash substitui a inspeção.

## Sub-blocos da continuidade

| Bloco | Entrega e gate |
|---|---|
| 2B-complemento | Registro declarativo/revisão e diagnósticos independentes; regressões 1/2A/2B; autoridade numérica fechada |
| 2C.1 | Em implementação nesta branch: rascunho, fonte por hash, edição por efeito, revisão e ida/volta; exige CI PostgreSQL e aplicação posterior da migration |
| 2C.2 | Publicação transacional, autorização administrativa e validação DB; PostgreSQL 17 isolado/RLS antes de qualquer aplicação |
| 2C.3 | Leitura dupla/diagnósticos, compatibilidade e comparação site/Brain sob flag; legado permanece autoridade |
| 3 | Confirmar bases, domínios, ordem e acumulação; só então planejar ativação |
| 4 | Reparar seletivamente catálogo/histórico com fonte e backup; nenhuma reimportação geral |
| 5 | Fechar convergência, paginação, cobertura e diagnóstico do legado restante |

Não publicar interface nova que já esconda limitações sob a justificativa de
deixá-las para a Fase 5. A transparência é gate de cada consumidor integrado.

## Matriz de requisitos C01–C12

Estes são requisitos adicionais de evolução, não uma renumeração de F01–F24.
“Parcial” significa implementado apenas no módulo isolado, sem aprovação de
fonte, persistência ou integração de produção.

| ID | Requisito | Estado / destino |
|---|---|---|
| C01 | Registro extensível de grandezas/unidades/operações | Parcial: compilador declarativo na 2B; cadastro/aprovação 2C, domínios 3 |
| C02 | Efeitos independentes com valores/sinais/unidades mistos | Contrato e Bornal cobertos; formulário e revisão imutável propostos na 2C.1, pendentes de CI/aplicação |
| C03 | Fonte por efeito/raridade sem extrapolação | Manifesto exato + evidência persistente por SHA-256 propostos na 2C.1; dados reais continuam sem backfill |
| C04 | Rascunho separado da publicação aprovada pelo servidor | Parcial 2C.1: rascunho/revisão separados e nenhuma rota de publicação; publicação pertence à 2C.2 |
| C05 | Validação equivalente em todas as escritas | Parcial 2C.1: escritas da Central passam por RPC/trigger; importação/restauração e publicação aguardam 2C.2 |
| C06 | Qualidade, suporte, base e execução separados | Parcial: diagnóstico 2B + estados de validação/evidência/revisão 2C.1; consumidores aguardam 2C.3 |
| C07 | Preservar efeitos reais sem base pública | Regressão de classificação coberta; integração sem perda 2C.3/5 |
| C08 | Fila acionável, idempotente e revisão invalidada por edição | Proposta na 2C.1 com uma fila atual por documento e preservação da decisão substituída; pendente de CI/aplicação |
| C09 | Regras/dados versionados e histórico reproduzível | Pin de contrato + revisões/evidências imutáveis por hash na 2C.1; publicação e catálogo aguardam fases posteriores |
| C10 | Mesmas definições site/Brain sem score inventado | Contrato sem execução; consumidores/convergência 2C.3/5 |
| C11 | Migração seletiva, comparação e rollback preservador | Pendente 2C/4; sem migração neste complemento |
| C12 | Testes das fotos, base externa e não regressão | 54 testes 2B preservados; 8 testes JS e fixture PostgreSQL 17 da 2C.1 adicionados, ainda sujeitos ao CI integral |

## Implementação 2C.1 em branch

Artefatos adicionados sem aplicar DDL no SNV durante o desenvolvimento:

- migration aditiva aplicada `20260902173201_equipment_effect_central_phase2c1.sql`
  (nome alinhado ao histórico; SQL original preservado);
- documentos, revisões, evidências e vínculos imutáveis, todos sob RLS;
- fila idempotente por revisão; nova revisão substitui apenas o estado atual e
  conserva o parecer anterior;
- RPCs `security invoker` para salvar, listar, solicitar revisão e decidir;
- aba da Central no editor de equipamentos, isolada do salvamento legado;
- fixture exclusiva `equipment_effect_central_test` em PostgreSQL 17;
- autoridade numérica, publicação e migração do catálogo permanecem ausentes.

O painel falha fechado quando a migration não está disponível no ambiente. A
ausência do backend da Central não bloqueia nem altera o editor legado. CI verde
e revisão visual são gates antes de qualquer promoção; este texto não declara a
migration aplicada em produção.

## Rollback e aceite deste complemento

Reverter apenas o commit do complemento retorna à 2B anterior, ainda dormente.
Não há dado, coluna, migration ou Edge Function para desfazer. A reversão não
remove as proteções 1/2A. Não apagar fontes ou documentos de revisão futura.

Aceite local: 54 testes de contrato/registro, 28 de loadout/escopo e 31 de
Brain/cobertura/evolução, total 113. Sintaxe no snapshot selecionado: 120 módulos.
CI integral da MR é obrigatório; resultado local não substitui aprovação.
Nenhuma declaração deste documento autoriza merge ou produção por si só.
