# Home — transições e preparação de mídia, etapa C

Base: `a691b6f6bec6bc3ad5263fcd4649c41addaef78a`, 2026-09-06.
Aplicação direta na `main` autorizada pelo usuário, em uma entrega separada.
Versão pública: `0.5.23-beta`.

## Comportamento

A operação de seleção continua única. No início da troca, nome, classe,
descrição, tags, selo, ações e contexto das builds assumem o novo herói.
As proteções de consultas atrasadas e os destinos corrigidos anteriormente
continuam sob o mesmo estado. A animação nunca adia a seleção nem mantém uma
build do personagem anterior disponível para abrir.

Próximo move a saída para a esquerda e traz o novo conteúdo pela direita;
anterior inverte ambos. A direção acompanha a seta inclusive na volta entre
o primeiro e o último herói. O clique em um card segue a posição no catálogo.
O deslocamento é de 24 px, com saída de 140 ms e entrada dos textos de 240 ms
após 80 ms de espera, totalizando 320 ms. O contexto da build recebe apenas
uma entrada de opacidade. Setas, selo, ações e moldura da build não deslizam.

Uma cópia decorativa permite encerrar a saída sem misturar o estado anterior
com o atual. Ela é inerte, oculta das tecnologias assistivas, sem IDs nem
atributos editoriais. Se a arte anterior for um vídeo, seu elemento é movido
para a saída e liberado ao terminar; nenhum vídeo é duplicado para animar.
Cada nova seleção cancela animações, observadores e saídas da anterior.

O texto é medido pelo catálogo e pela largura disponível para reservar espaço
e manter a posição das ações. Um tamanho comum de título acomoda os nomes sem
cortá-los. A medição usa somente texto, após catálogo, fontes, conteúdo editorial
ou largura mudarem. As descrições continuam completas.

## Mídia e acessibilidade

A arte entra após a imagem carregar e ser decodificada, ou após o primeiro
quadro de vídeo estar disponível. Enquanto isso, aparece “Preparando visual…”.
Ausência e falha têm mensagens próprias; a espera é limitada a oito segundos.
Uma conclusão de carregamento cancelada não pode revelar mídia antiga.
O telão também aguarda seu vídeo e fica oculto quando indisponível.

São preparados no máximo dois arquivos de imagem: os vizinhos imediatos.
Vídeos não entram nessa preparação; nenhuma fila de todo o catálogo é criada.
As imagens têm prioridade baixa e deixam a fila ao perderem a vizinhança.
A preparação é desativada quando o navegador informa economia de dados ou 2G.

Com preferência por movimento reduzido, a seleção é imediata e não cria
deslocamentos ou cópias animadas. Ativar a preferência durante uma transição
também encerra as animações. O foco permanece no controle acionado e a região
de status da seleção continua sendo a fonte do anúncio acessível.

## Validação e limites

- 23 testes Node aprovados: seleção e builds, contratos reais dos destinos,
  direção nas extremidades, cancelamento de decodificação, falha e limite de
  espera, preparação limitada, trocas rápidas, vídeo sem duplicação e movimento
  reduzido, inclusive alteração da preferência durante a animação.
- Sintaxe dos módulos, referências HTML e governança de versões verificadas
  antes do commit. As suítes de seleção e transição integram o gate existente.
- A política de URLs do navegador impede a prévia local. A conferência visual
  ocorre na página pública após o deploy autorizado, sem atribuir a ela cobertura
  de Safari, iPad ou larguras móveis que não tenham sido inspecionadas.

## Refinamento após a conferência pública — 0.5.24-beta

O pipeline `2823643403` publicou a etapa C com todos os gates aprovados.
A conferência no navegador desktop confirmou Slayer, Mirage, Hurricane e a
volta circular para SHENJI, mídia pronta, direção correta, títulos sem corte
e setas/ações nas mesmas coordenadas entre seleções. Após a animação, não
restaram camadas decorativas nem IDs duplicados.

A consulta inicial esvaziava a linha de autoria do cartão e o encolhia em
13,5 px. O refinamento reserva a altura de uma linha (`1.5em`) mesmo quando
ela está vazia; o restante da composição conserva suas medidas. A conferência
da versão corretiva acompanha seu deploy, incluindo a geometria durante a
consulta e os destinos do herói escolhido.

## Próxima etapa

Etapa D: contrato e rotina de rotação do destaque no backend SNV, inicialmente
sem ativar a programação. O painel é a etapa E; a ativação editorial é a etapa F.
Esta entrega não altera o banco nem ativa a troca diária ou semanal.
