# Home — navegação na área principal, etapa B

Base: `8bbe5bba8cab9a1617044d5c890c5fd06bdb8536`, 2026-09-05.
Aplicação direta na `main` autorizada pelo usuário, em uma alteração separada.

## Comportamento

Anterior e próximo ficam agrupados à direita da identificação do herói, acima
do nome. O controle usa a paleta da arena, botões de 44 × 44 px, foco ciano e
realce discreto ao passar o mouse ou pressionar. A faixa mantém espaço para a
identificação editorial e a sincronização. No desktop, o conteúdo começa em
uma posição fixa para descrições diferentes não deslocarem as setas. A faixa
de controles fica fora da animação de entrada existente.

`stepHero()` navega circularmente pelo mesmo catálogo habilitado da etapa A,
na ordem já retornada pelo servidor. A operação chama `selectHero()` e mantém
builds, contagens, links e selo sob o mesmo estado. A seleção é imediata, mesmo
quando a busca de builds anterior ainda está em andamento. O grupo fica oculto
e os botões desabilitados quando há menos de dois heróis disponíveis.

O card selecionado recebe o estado ativo e é trazido para a área visível do
carrossel, sem deslocar a página ou mover o foco dos controles. A busca não é
apagada: as setas percorrem o catálogo completo e só ajustam o carrossel quando
o herói selecionado estiver nos resultados filtrados. As setas inferiores
continuam responsáveis pela rolagem dos cards.

Os botões nativos funcionam com Enter e Espaço, têm nomes acessíveis e indicam
nos títulos qual personagem está em cada direção. Uma região de status anuncia
o herói escolhido sem reler toda a seção. A preferência por movimento reduzido
continua atendida pela regra já existente.

## Validação e limites

- Os 12 testes passaram. A suíte da etapa A inclui três cenários de navegação: volta circular
  e selo, catálogo habilitado/vazio/unitário e cliques rápidos com respostas
  atrasadas depois de uma volta completa.
- Sintaxe, integridade dos IDs/controles HTML, governança e diff verificados.
- O pipeline existente mantém os gates de qualidade e de publicação.
- A prévia local não está disponível na política de URLs deste navegador;
  a conferência visual e funcional será feita na página pública após o deploy
  autorizado. Não atribuir a essa conferência cobertura de dispositivos que
  não tenham sido efetivamente inspecionados.

## Próxima etapa

Etapa C: transição direcional, preparação da mídia e refinamento da estabilidade
visual. Agenda automática do destaque e controles administrativos permanecem
nas etapas D e E. Esta entrega não ativa nem modifica a rotação editorial.
