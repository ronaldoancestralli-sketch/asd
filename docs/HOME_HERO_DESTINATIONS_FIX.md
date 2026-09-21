# Home — correção dos destinos de herói e criação

Base: `a7facca66b2268c90aa39fbe182cb93adc79ce06`, 2026-09-05.
Correção separada, com aplicação direta na `main` autorizada na conversa.

## Causa

A seleção e as builds da home estavam sincronizadas, mas os CTAs enviavam
`hero`. A página de Heróis lê `heroi` como slug, e a entrada da Mesa de Builds
espera `nova=1&heroi=<slug>` para iniciar uma nova combinação. O ID enviado
pela home não era consumido pela entrada; a mesa seguia sua restauração normal
de rascunho ou o primeiro herói do catálogo.

## Correção

O estado de seleção passa a fornecer os dois destinos usando o slug atual.
Explorar herói abre a ficha por `heroi`. Criar build usa a entrada explícita de
nova build já existente. O CTA principal, o CTA do card sem builds e o da lista
vazia compartilham essa ação. A consulta ao estado ocorre no clique; não depende
de atributos de um botão renderizado anteriormente. Heróis sem slug válido
não geram destinos para outro personagem.

A entrada da mesa e o motor de equipamentos não foram alterados. Criar uma
build nova segue a regra existente de começar sem itens do rascunho anterior;
a navegação comum para retomar rascunhos e abrir builds salvas mantém seu fluxo.

## Validação

- Quinze testes Node aprovados, incluindo os do carrossel e da sincronização.
- Teste dos destinos após trocar e retornar de herói.
- Execução da entrada real `criar-build-entry.js`, substituindo apenas a consulta
  de rede e a importação da mesa por fixtures: um rascunho anterior de Slayer
  não substitui Mirage na criação explícita; o envelope temporário é removido.
- A entrada comum sem intenção de nova build mantém o rascunho da fixture.
- Sintaxe e integridade dos arquivos verificadas.
- No navegador público, o destino correto abriu a ficha de Mirage; o CTA dessa
  ficha carregou Mirage na mesa e no nome da build. A confirmação do clique da
  home acompanha o deploy, que utiliza o pipeline existente.

Esta correção não avança a etapa C das transições nem ativa a agenda editorial.
