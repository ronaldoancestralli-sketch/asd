# Contrato de publicação Site ↔ Echo Brain

Data de vigência: 2026-09-04.

## Invariante de produção

O GitLab Pages e a Edge Function `echo-brain-item-fit` formam uma única unidade
de promoção. Em todo push para `main`, a função é publicada primeiro no backend
oficial SNV (`nqklhsfaqpbjqmfzjzxk`) e precisa anunciar o contrato
`equipment-attribute-operator-v1`. Somente depois dessa verificação o job
`pages-production` pode iniciar.

Se o deploy, o probe ou a credencial falhar, a pipeline falha fechada e conserva a
versão pública anterior do Pages. Assim o site não avança usando uma versão antiga
do cálculo autoritativo do Brain.

## Credencial e segurança

O GitLab precisa manter `SUPABASE_ACCESS_TOKEN` como variável CI/CD **masked** e
**protected**, disponível somente à branch protegida `main`. O project ref não
vem da credencial nem de entrada de pipeline: permanece fixado no repositório e é
rejeitado pelo verificador se divergir do SNV.

A função é pública porque o navegador a invoca sem exigir sessão administrativa.
Ela não devolve a service role, não aceita gravação arbitrária e continua
selecionando somente o conjunto de dados necessário ao cálculo. O token de deploy
existe apenas no job de produção.

## Compatibilidade do bundle

Os módulos públicos mantêm seus parâmetros `?v=` para controle de cache no
navegador. Antes de chamar o CLI, o job remove somente esses parâmetros dos
imports locais no workspace efêmero do runner, porque o empacotador da Edge
Function os interpreta como parte do nome do arquivo. A preparação valida a
quantidade exata de substituições e falha se o grafo mudar; nenhum arquivo
versionado ou módulo entregue pelo Pages é reescrito.

## Evidência e comunicação

O job `echo-brain-production` registra no log a função, o destino e o commit,
sem imprimir segredos. Após o deploy, um probe `OPTIONS` exige o header
`X-Echo-Calculation-Contract: equipment-attribute-operator-v1`. O resultado é
salvo por 30 dias no artefato
`deployment-evidence/echo-brain-item-fit.json`, com commit, pipeline, job,
contrato e horário da confirmação.

## Ordem obrigatória

1. Quality Gates e fixtures.
2. Leitura pública de `get_status_registry_v1` no SNV. Uma migration ausente ou um contrato inválido bloqueia a etapa antes de alterar a função.
3. Deploy da `echo-brain-item-fit` no SNV.
4. Probe dos contratos `equipment-attribute-operator-v1` e `echo-status-registry/v1`.
5. Publicação do GitLab Pages.

Nenhuma etapa posterior usa `allow_failure`. A dependência explícita do Pages no
job do Brain é a barreira que impede promoção parcial.
