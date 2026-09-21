# Home — seleção de herói e builds, etapa A

Base: `e01a377454c1cdbd0084fc2e33bc32ae5cb75755`, 2026-09-05.
Aplicação direta na `main` autorizada pelo usuário nesta conversa, mantendo as
etapas separadas. Setas, nova transição e agenda automática são etapas seguintes.

## Resultado

`js/home-hero-selection.mjs` mantém a seleção local, a referência editorial e
o carregamento das builds. A home busca na tabela `builds` por `hero_id` antes
do limite, usando publicação, visibilidade pública e ausência de exclusão como
condições explícitas. Ordenação: curtidas, visualizações, criação e ID.

Card principal, lista, resumo comunitário da comparação e indicadores derivam
da mesma seleção. Respostas de uma geração anterior são descartadas, inclusive
no percurso A → B → A. Cache de 30 segundos por herói; falhas não são guardadas.
Estados vazios e falhas limpam a build e o destino anterior, oferecendo criar
uma build ou tentar novamente. Nenhum rascunho é sobrescrito.

O selo depende da igualdade com o `featured_hero_id` configurado no CMS. Quando
não há configuração válida, a vitrine permanece utilizável com “Explorar heróis”.
O primeiro carregamento editorial pode definir a seleção antes da interação;
atualizações seguintes preservam a escolha do visitante. As tags editoriais só
aparecem no herói configurado e quando possuem conteúdo explícito.

A seleção pelo card não recria o catálogo, preservando busca, foco e posição.
Foram removidos os valores fixos de comparação associados ao resumo de build;
a análise completa continua responsável pelos cálculos reais.

## Validação

- Nove testes Node: ordem de chegada do CMS, distinção do selo, respostas fora
  de ordem, retorno ao mesmo herói, vazio/erro/retry, cache, catálogo removido,
  build fora das 20 primeiras gerais e rejeição de dados incompatíveis.
- Sintaxe de `app.js`, `home-hero-selection.mjs`, `site-content.js` e `stats.js`.
- IDs HTML sem duplicação e todos os alvos DOM literais usados pela home presentes.
- Consulta REST pública real do SNV com a mesma projeção, relacionamento de
  autor, filtros e ordenação: HTTP 200; seis resultados do herói solicitado.
- Políticas de leitura examinadas no SNV; nenhuma migration ou escrita no banco.
- Revisão visual local tentada, mas indisponível: o navegador bloqueou o acesso
  à prévia local pela política de URLs. Não foi alegada validação visual de
  mobile, iPad ou desktop. Os testes funcionais não substituem essa inspeção.

Os testes da etapa foram adicionados ao workflow usado pelos quality gates.
A publicação deve passar pelo pipeline existente, incluindo o contrato Site ↔ Brain.

## Continuidade

Próxima etapa: setas anterior/próximo integradas à área principal usando
`selectHero()`. Depois, refinamento da transição. A rotação editorial será
implementada e validada separadamente no servidor e no painel.
