export const PUBLIC_RELEASE_MANIFEST = [
  {
    version: '0.8.2-beta', kind: 'fix', published: true,
    title: 'Efeitos válidos continuam calculando com pendências',
    summary: 'Um bônus sem vínculo deixa de apagar os demais resultados do equipamento.',
    description: 'O cálculo passa a processar cada efeito separadamente. Status resolvidos continuam alterando a build, enquanto textos ainda sem vínculo permanecem visíveis como não calculados. Recuo da arma ganha um status próprio e um índice relativo explícito, sem ser confundido com dispersão.',
    highlights: ['Cálculo parcial por efeito', 'Pendências visíveis sem bloquear bônus válidos', 'Recuo separado de dispersão', 'Rastreio do vínculo e do resultado de cada efeito'],
    released_at: '2026-09-17'
  },
  {
    version: '0.8.1-beta', kind: 'improvement', published: true,
    title: 'Equipamentos reconhecidos e verificados desde a coleta',
    summary: 'A leitura das imagens liga cada efeito conhecido ao status correto e identifica no catálogo as coletas confirmadas.',
    description: 'O cadastro reconhece status, fórmula, raridades e origem sem exigir nomes internos ou links técnicos. Casos ambíguos ficam em uma correção curta e nunca entram no cálculo por aproximação. Equipamentos com cálculo publicado a partir de captura direta do jogo recebem o selo Verificação Master; fontes oficiais estruturadas recebem Oficial ZeptoLab.',
    highlights: ['Reconhecimento automático dos efeitos conhecidos', 'Onze raridades visíveis e editáveis', 'Correção simples para divergências reais', 'Selos derivados apenas do cálculo publicado'],
    released_at: '2026-09-16'
  },
  {
    version: '0.8.0-beta', kind: 'feature', published: true,
    title: 'Cálculos claros e verificáveis na mesa de builds',
    summary: 'A mesa calcula equipamentos em tempo real a partir de vínculos diretos com cada atributo do herói ou da arma.',
    description: 'O novo sistema separa atributos parecidos, mostra a origem de cada alteração e mantém dados ausentes ou não confirmados como pendências visíveis. O editor de equipamentos concentra a descrição uma vez e organiza os valores das onze raridades em uma tabela compacta.',
    highlights: ['Cálculo em tempo real nos seis slots', 'Vínculo direto com o atributo exato', 'Dados incertos nunca viram bônus', 'Editor compacto para todas as raridades'],
    released_at: '2026-09-15'
  },
  {
    version: '0.7.1-beta', kind: 'fix', published: true,
    title: 'Cada efeito no status e na condição corretos',
    summary: 'Efeitos de equipamentos passam a exigir um vínculo revisado para alterar os atributos da build.',
    description: 'Dispersão ao mirar e efeitos em movimento permanecem separados. Efeitos sem vínculo, com texto incompleto ou alterados após a revisão ficam pendentes. A conferência mostra a origem, a condição e o destino de cada operação.',
    highlights: ['Condições de aplicação preservadas', 'Efeitos pendentes identificados', 'Origem e destino dos efeitos conferíveis'],
    released_at: '2026-09-07'
  },
  {
    version: '0.7.0-beta', kind: 'feature', published: true,
    title: 'Atributos de equipamentos com cálculo rastreável',
    summary: 'Efeitos revisados podem se vincular ao status exato do herói ou da arma, com unidade e condição explícitas.',
    description: 'O cálculo passa a registrar a base, a origem do efeito e o valor após cada operação. Graus de dispersão, segundos e cadência permanecem separados. Dados ausentes e efeitos alterados aparecem como pendências, e a confirmação do Brain exige a mesma revisão e os mesmos resultados.',
    highlights: ['Vínculos por equipamento e raridade', 'Dispersão expressa em graus', 'Operações com origem e resultado visíveis', 'Divergências de cálculo identificadas'],
    released_at: '2026-09-07'
  },
  {
    version: '0.6.6-beta', kind: 'improvement', published: true,
    title: 'A coroa abre espaço para o herói no celular',
    summary: 'A insígnia do destaque usa uma composição horizontal nas telas menores.',
    description: 'Coroa e identificação ficam lado a lado no topo do palco em celulares e tablets, reduzindo a altura do selo e preservando mais espaço para a arte do personagem. O desktop mantém a composição vertical.',
    highlights: ['Insígnia horizontal nas telas menores', 'Mais espaço livre para a arte', 'Composição vertical preservada no desktop'],
    released_at: '2026-09-07'
  },
  {
    version: '0.6.5-beta', kind: 'fix', published: true,
    title: 'Acabamento do palco alinhado ao tema',
    summary: 'O botão do destaque mantém o dourado e a leitura nítida, inclusive ao passar o cursor.',
    description: 'A ação principal usa os tokens do tema para preservar seu acabamento dourado exclusivo, sem conflito com o gradiente roxo global. Os holofotes também ficam melhor alinhados à área do personagem no desktop, preservando os controles de navegação.',
    highlights: ['Botão dourado com contraste preservado', 'Acabamento consistente também ao passar o cursor', 'Holofotes alinhados à área do personagem'],
    released_at: '2026-09-07'
  },
  {
    version: '0.6.4-beta', kind: 'improvement', published: true,
    title: 'Um palco digno do destaque da Arena',
    summary: 'O herói editorial recebe holofotes, coroa e uma composição dourada e violeta exclusiva.',
    description: 'Feixes de luz vindos do alto, um halo gravado e uma base iluminada colocam o personagem no centro do palco. A insígnia ganha uma coroa própria e o nome recebe acabamento dourado. O tratamento aparece somente no destaque vigente; os outros heróis mantêm a apresentação de exploração. As animações respeitam a preferência por movimento reduzido.',
    highlights: ['Holofotes direcionados ao personagem', 'Coroa e palco iluminado exclusivos do destaque', 'Nome com acabamento dourado', 'Exploração e builds continuam acompanhando o herói escolhido'],
    released_at: '2026-09-07'
  },
  {
    version: '0.6.3-beta', kind: 'fix', published: true,
    title: 'Equipamentos da build aparecem na página inicial',
    summary: 'O cartão da build mostra as peças salvas em suas posições, acompanhando o herói selecionado.',
    description: 'As imagens dos equipamentos agora aparecem no cartão da página inicial. Somente posições sem peças ficam vazias, e a troca de herói atualiza os itens junto com a build. Peças sem imagem continuam identificadas pelo nome.',
    highlights: ['Equipamentos visíveis nas posições salvas', 'Itens atualizados ao trocar de herói', 'Identificação preservada quando a imagem não está disponível'],
    released_at: '2026-09-06'
  },
  {
    version: '0.6.2-beta', kind: 'fix', published: true,
    title: 'A correção da Mesa chega sem cache antigo',
    summary: 'O carregamento da Mesa de Sinergias passa a exigir o mesmo pacote que preserva o herói escolhido.',
    description: 'O preload, o entrypoint e o módulo principal da criação de build agora compartilham a versão F.2. Assim, navegadores que já visitaram a página não reutilizam a inicialização anterior que podia restaurar Slayer sobre Mirage ou outro herói selecionado.',
    highlights: ['Cache da Mesa alinhado ao contrato F.2', 'Código anterior não é reutilizado após a publicação', 'Herói escolhido preservado também em visitas recorrentes'],
    released_at: '2026-09-06'
  },
  {
    version: '0.6.1-beta', kind: 'fix', published: true,
    title: 'A mesa recebe o herói escolhido diretamente',
    summary: 'Criar build passa a resolver o personagem pela própria rota, sem depender de um rascunho temporário.',
    description: 'Ao trocar o herói na área principal e iniciar uma build, a Mesa de Sinergias usa nova=1 e o slug selecionado como autoridade após carregar o catálogo real. Uma build ou um rascunho anterior não consegue mais restaurar Slayer por cima de Mirage ou de outro herói escolhido.',
    highlights: ['Herói da home preservado na Mesa de Sinergias', 'Rascunho anterior ignorado em uma build nova', 'Rota validada depois do catálogo real carregar'],
    released_at: '2026-09-06'
  },
  {
    version: '0.6.0-beta', kind: 'feature', published: true,
    title: 'O destaque da Arena ganhou identidade própria',
    summary: 'O herói editorial se diferencia de verdade e a rotação diária ou semanal pode ser testada sem esperar o próximo ciclo.',
    description: 'Somente o destaque vigente recebe selo, aurora, órbitas, luz e composição premium. Ao usar as setas, os outros heróis voltam ao modo de exploração com builds e botões sincronizados. No Admin, a próxima virada pode ser aberta imediatamente em uma prévia sem publicação, e a automação pode ser ativada ou pausada com controle editorial.',
    highlights: ['Destaque da Arena exclusivo do herói editorial', 'Prévia imediata do próximo ciclo sem alterar a home pública', 'Rotação automática diária ou semanal', 'Builds, ficha e criação continuam seguindo o herói exibido'],
    released_at: '2026-09-06'
  },
  {
    version: '0.5.24-beta', kind: 'fix', published: true,
    title: 'Cartão de build estável durante a consulta',
    summary: 'O cartão mantém seu espaço enquanto as builds do novo herói carregam.',
    description: 'O espaço da informação de autoria fica reservado também durante o carregamento, evitando o pequeno salto vertical entre a consulta e a apresentação da build.',
    highlights: ['Altura preservada no carregamento', 'Troca de herói com moldura estável'],
    released_at: '2026-09-06'
  },
  {
    version: '0.5.23-beta', kind: 'improvement', published: true,
    title: 'Transições acompanham a troca de herói',
    summary: 'Avançar e voltar ganha movimento direcional, com controles estáveis e entrada suave da arte do personagem.',
    description: 'A área principal acompanha a direção escolhida e prepara as imagens dos heróis vizinhos. Trocas rápidas preservam o personagem mais recente, com estados claros enquanto o visual carrega e respeito à preferência por movimento reduzido.',
    highlights: ['Movimento coordenado nos dois sentidos', 'Setas e ações mantêm a posição', 'Imagens vizinhas preparadas com carregamento limitado', 'Trocas rápidas e movimento reduzido atendidos'],
    released_at: '2026-09-06'
  },
  {
    version: '0.5.22-beta', kind: 'fix', published: true,
    title: 'Os botões acompanham o herói escolhido',
    summary: 'Explorar herói abre a ficha do personagem selecionado e Criar build inicia a mesa com esse mesmo herói.',
    description: 'Os botões da área principal e dos estados sem builds passam a usar a seleção atual ao navegar. A criação segue o fluxo de uma build nova do herói escolhido, evitando abrir a mesa com o personagem anterior.',
    highlights: ['Ficha do herói escolhido aberta diretamente', 'Mesa iniciada com o personagem selecionado', 'Botões dos estados sem builds corrigidos'],
    released_at: '2026-09-05'
  },
  {
    version: '0.5.21-beta', kind: 'improvement', published: true,
    title: 'Troque de herói direto na área principal',
    summary: 'As novas setas permitem avançar e voltar pelos heróis sem precisar descer até os cards.',
    description: 'Os controles acompanham o visual da arena e percorrem o catálogo nos dois sentidos. Builds, informações e seleção dos cards seguem o personagem escolhido, preservando a busca e a identificação do destaque editorial.',
    highlights: ['Setas integradas à área principal', 'Navegação contínua entre o primeiro e o último herói', 'Builds e cards acompanham a seleção', 'Controles com suporte a toque e teclado'],
    released_at: '2026-09-05'
  },
  {
    version: '0.5.20-beta', kind: 'fix', published: true,
    title: 'Builds acompanham o herói na página inicial',
    summary: 'A área principal e as builds relacionadas seguem o personagem selecionado, com destaque editorial identificado separadamente.',
    description: 'A troca pelo card atualiza as builds públicas do herói e seus indicadores. Carregamento, ausência de builds e falha de conexão recebem estados próprios, e respostas antigas não substituem a seleção mais recente.',
    highlights: ['Builds filtradas pelo herói selecionado', 'Selo reservado ao destaque configurado', 'Informações sincronizadas nas trocas rápidas', 'Estados claros quando não há builds'],
    released_at: '2026-09-05'
  },
  {
    version: '0.5.19-beta', kind: 'fix', published: true,
    title: 'Operadores de equipamentos consistentes',
    summary: 'Aumento, redução e percentual seguem a escolha de cada atributo no cálculo e na prévia do editor.',
    description: 'O operador explícito passa a prevalecer sobre o padrão do nome do atributo. A prévia acompanha a troca no painel, o salvamento confere os valores por releitura e mudanças apenas de sinal também atualizam o histórico do Echo Brain.',
    highlights: ['Soma e percentual respeitam a escolha', 'Prévia acompanha o sinal selecionado', 'Valores e operadores conferidos após salvar', 'Brain registra mudanças de operador'],
    released_at: '2026-09-05'
  },
  {
    version: '0.5.18-beta', kind: 'fix', published: true,
    title: 'Contas institucionais saem da trilha Scout',
    summary: 'Founder e Admin deixam de receber ou exibir níveis, pontos, missões, especialidades e histórico Echo Scouts.',
    description: 'A contribuição de quem dirige e administra o Echo Arena passa a ser representada somente pela identidade institucional. O servidor impede novas participações na trilha e mantém eventuais registros anteriores preservados, porém fora da progressão pública.',
    highlights: ['Founder e Admin fora da progressão Scout', 'Sem pontos, ranks, missões ou especialidades', 'Cartões públicos sem nível comunitário', 'Histórico anterior preservado e excluído'],
    released_at: '2026-09-05'
  },
  {
    version: '0.5.17-beta', kind: 'improvement', published: true,
    title: 'A identidade por trás da arena retorna ao perfil',
    summary: 'O perfil Founder volta a mostrar sua área institucional completa, com uma apresentação mais natural e sem numeração decorativa.',
    description: 'Visão, produto e integridade aparecem novamente abaixo do dossiê, tanto no perfil público quanto na prévia de Meu Perfil. Os marcadores numéricos foram retirados sem alterar dados, permissões ou progressão.',
    highlights: ['Campo de atuação do Founder restaurado', 'Mesma seção no perfil e na conta', 'Numeração decorativa removida', 'Dados e autoridade preservados'],
    released_at: '2026-09-05'
  },
  {
    version: '0.5.16-beta', kind: 'fix', published: true,
    title: 'Perfil público alinhado à sua identidade',
    summary: 'O perfil público e a prévia de Meu Perfil passam a compartilhar a mesma apresentação, incluindo o dossiê institucional do Founder.',
    description: 'Nome, avatar, bio, acento pessoal e identidade confirmada são apresentados no mesmo modelo visual. Cargo institucional e progressão Echo Scout permanecem separados, sem alterar permissões ou conquistas.',
    highlights: ['Dossiê Founder no perfil público', 'Mesmo card na prévia da conta', 'Registro institucional e selo exclusivo', 'Privacidade e dados reais preservados'],
    released_at: '2026-09-04'
  },
  {
    version: '0.5.15-beta', kind: 'improvement', published: true,
    title: 'Autoridade acompanha comentários e builds',
    summary: 'Founder e Admin ganham presença institucional no conteúdo inteiro, enquanto cada nível Echo Scout passa a evoluir visualmente com a contribuição confirmada.',
    description: 'Comentários, respostas, conversas e builds traduzem o cargo e o nível retornados pelo servidor em moldura, cor e intensidade. Cargo institucional e mérito comunitário continuam separados e nenhum estado é concedido pelo navegador.',
    highlights: ['Founder destacado no conteúdo inteiro', 'Admin identificado pela autoridade confirmada', 'Sete níveis Echo Scout com evolução visual', 'Mesma identidade em conversas, respostas e builds'],
    released_at: '2026-09-04'
  },
  {
    version: '0.5.14-beta', kind: 'fix', published: true,
    title: 'Cálculo de equipamentos respeita cada linha',
    summary: 'A Mesa, o comparador e as análises agora aplicam aumento, redução, valor direto ou percentual conforme a regra escolhida para cada atributo.',
    description: 'Cada posição de atributo mantém a própria base de cálculo em todas as raridades. O operador explícito prevalece sobre um sinal ausente ou incorreto na coleta, sem reinterpretar automaticamente os registros antigos.',
    highlights: ['Operador independente por linha', 'Mesma regra preservada em todas as raridades', 'Sinal do OCR tratado apenas como magnitude', 'Mesa, comparação e contrafactuais alinhados'],
    released_at: '2026-09-04'
  },
  {
    version: '0.5.13-beta', kind: 'fix', published: true,
    title: 'Detalhes acompanham a troca de herói',
    summary: 'A Mesa atualiza o cartão de equipamento e as sinergias quando uma peça incompatível é removida na troca de herói.',
    description: 'Depois de trocar de herói, os detalhes mostram apenas a peça que continua equipada na posição selecionada. O catálogo aberto também acompanha a nova seleção.',
    highlights: ['Cartão de equipamento atualizado na troca de herói', 'Sinergias e catálogo acompanham a seleção'],
    released_at: '2026-09-02'
  },
  {
    version: '0.5.12-beta', kind: 'fix', published: true,
    title: 'Builds passam a respeitar equipamentos exclusivos',
    summary: 'A primeira fase do ajuste do motor impede que peças pessoais ou de classe permaneçam em heróis incompatíveis e valida posição, raridade e duplicidade.',
    description: 'A Mesa, a comparação, os contrafactuais, o Echo Brain e o salvamento passam a compartilhar a mesma regra de elegibilidade. Rascunhos são reconstruídos a partir do catálogo atual, preservando a raridade salva sem confiar em vínculos armazenados no navegador.',
    highlights: ['Exclusividade por herói e classe preservada', 'Troca de herói remove combinações inválidas', 'Peças repetidas deixam de ativar conjuntos', 'Posição e raridade validadas antes do cálculo'],
    released_at: '2026-09-01'
  },
  {
    version: '0.5.11-beta', kind: 'fix', published: true,
    title: 'Apresentação anterior dos heróis restaurada',
    summary: 'As duas experiências visuais para GIFs com fundo sólido foram removidas da página Heróis e da Mesa de Builds.',
    description: 'O Echo Arena volta a usar as mídias já cadastradas em cada superfície, sem Cena integrada, prolongamento de fundo ou portal/holograma. Banco, arquivos e cadastros existentes foram preservados enquanto uma solução visual melhor não é definida.',
    highlights: ['Cena integrada removida do Admin e de Heróis', 'Portal/holograma removido da Mesa', 'Renderização anterior restaurada', 'Banco e mídias existentes preservados'],
    released_at: '2026-08-31'
  },
  {
    version: '0.5.10-beta', kind: 'fix', published: true,
    title: 'Heróis opacos viram projeções na Mesa',
    summary: 'GIFs com fundo azul deixam de aparecer como quadrados na Mesa de Builds e passam a ocupar o anel como uma projeção integrada.',
    description: 'O card do herói, o centro da Mesa e o seletor agora dissolvem as bordas da mídia opaca em uma aura do Echo Circuit. A animação original é preservada sem criar uma segunda cópia borrada no mobile.',
    highlights: ['Bordas quadradas dissolvidas nos quatro lados', 'Projeção integrada ao anel de equipamentos', 'Card lateral e seletor seguem o mesmo tratamento', 'Uma única camada animada por superfície no mobile'],
    released_at: '2026-08-31'
  },
  {
    version: '0.5.9-beta', kind: 'improvement', published: true,
    title: 'Animações de heróis entram na arena',
    summary: 'GIFs com fundo sólido agora podem aparecer como uma cena contínua da Echo Arena, sem o aspecto de imagem retangular colada na página.',
    description: 'O destaque e a ficha pública passam a usar a animação cadastrada quando disponível. No modo Cena integrada, o fundo do arquivo é prolongado com profundidade, vinheta e detalhes discretos do Echo Circuit; GIFs transparentes preservam o recorte original.',
    highlights: ['Cena integrada para GIFs com fundo azul ou sólido', 'Animação priorizada no destaque e na ficha do herói', 'Modo transparente preservado', 'Tratamento responsivo com custo reduzido no mobile', 'Atualização distribuída de forma consistente entre as páginas'],
    released_at: '2026-08-31'
  },
  {
    version: '0.5.8-beta', kind: 'fix', published: true,
    title: 'Presentes sem fonte ficam mais claros',
    summary: 'Quando um promocode não tem link de origem, o presente deixa de tratar essa informação como obrigatória e orienta o resgate diretamente no jogo.',
    description: 'Os detalhes, a validade e as mensagens após copiar agora se adaptam à presença ou ausência de uma fonte. O código continua protegido e a abertura por curtida permanece igual.',
    highlights: ['Fonte continua disponível quando informada', 'Campanhas sem link recebem instruções honestas', 'Abertura, curtida e proteção do código preservadas'],
    released_at: '2026-08-31'
  },
  {
    version: '0.5.7-beta', kind: 'fix', published: true,
    title: 'Histórico público volta a acompanhar a evolução',
    summary: 'A página O Arena está evoluindo volta a refletir a versão real do site e passa a impedir que novas melhorias públicas fiquem fora da linha do tempo.',
    description: 'A versão do banner e da página agora nasce do mesmo manifesto. O CI compara esse manifesto com o registro de mudanças, exige uma nota para alterações públicas e mantém ajustes exclusivos do painel administrativo fora da linha do tempo.',
    highlights: ['Versão pública sincronizada em todo o site', 'Novas mudanças visíveis exigem nota no histórico', 'Ajustes exclusivos do Admin permanecem internos'],
    released_at: '2026-08-30'
  },
  {
    version: '0.5.4-beta', kind: 'fix', published: true,
    title: 'Navegação por classes preservada com a auditoria',
    summary: 'A navegação rápida entre classes continua disponível junto da nova auditoria comunitária de habilidades.',
    description: 'A evolução da ficha de heróis preserva os controles laterais para alternar entre Todos e as classes, mantendo a exploração do elenco fluida.',
    highlights: ['Troca rápida entre classes preservada', 'Auditoria e navegação funcionam juntas'],
    released_at: '2026-08-30'
  },
  {
    version: '0.5.3-beta', kind: 'feature', published: true,
    title: 'Auditoria comunitária nas habilidades',
    summary: 'A comunidade agora pode sugerir correções de habilidades com fontes. Toda contribuição passa por duas revisões independentes antes de aparecer na ficha pública.',
    description: 'As fichas de heróis passam a convidar a comunidade a validar dados, anexar evidências e receber reconhecimento público somente depois da confirmação independente.',
    highlights: ['Envio de correções com fontes', 'Duas revisões independentes antes da publicação', 'Crédito público opcional para contribuições aprovadas'],
    released_at: '2026-08-30'
  },
  {
    version: '0.5.2-beta', kind: 'feature', published: true,
    title: 'Heróis ganham navegação por classes e visão do elenco',
    summary: 'A página Heróis ganhou troca rápida entre classes e uma visão geral do elenco em Todos, sem atribuir os dados de um herói ao roster completo.',
    description: 'Uma seta lateral percorre Todos e as classes com transição fluida. A visão geral usa apenas indicadores agregados reais, enquanto os destaques individuais continuam nas classes específicas.',
    highlights: ['Troca lateral entre Todos e as classes', 'Panorama real do elenco', 'Destaques individuais preservados'],
    released_at: '2026-08-30'
  },
  {
    version: '0.4.6-beta', kind: 'feature', published: true,
    title: 'Procedência oficial nas fichas de heróis',
    summary: 'As fichas públicas passam a destacar com clareza quando uma fonte oficial da ZeptoLab está vinculada aos dados.',
    description: 'A origem dos dados fica visível e rastreável nas fichas de heróis, diferenciando a procedência oficial das referências comunitárias.',
    highlights: ['Sinal visual de fonte oficial ZeptoLab', 'Referências rastreáveis na ficha pública'],
    released_at: '2026-08-29'
  },
  {
    version: '0.4.3-beta', kind: 'fix', published: true,
    title: 'Texto do código livre da caixa de presente',
    summary: 'O texto do código promocional ganha o espaço necessário abaixo do presente aberto, sem sobreposição.',
    description: 'O presente aberto reserva sua altura antes do texto e do código, inclusive em telas baixas. O desenho, a abertura, os efeitos e a cópia continuam iguais.',
    highlights: ['Texto separado da caixa após a abertura', 'Animações e funcionamento do presente preservados'],
    released_at: '2026-08-28T00:18:06Z'
  },
  {
    version: '0.4.2-beta', kind: 'fix', published: true,
    title: 'Abertura do presente promocional corrigida',
    summary: 'Corrigida a falha que impedia abrir presentes de campanhas publicadas após curtir. A animação e a revelação do código seguem a confirmação da curtida, sem duplicar a participação.',
    description: 'A abertura de campanhas publicadas volta a confirmar a curtida e revelar o código. Repetir uma tentativa não cria outra curtida; o presente central, os efeitos e os ajustes para cada tamanho de tela permanecem iguais.',
    highlights: ['Abertura corrigida nas campanhas publicadas', 'Nova tentativa sem duplicar a curtida', 'Presente central, brilho e confetes preservados'],
    released_at: '2026-08-27T23:28:21Z'
  },
  {
    version: '0.4.1-beta', kind: 'improvement', published: true,
    title: 'O presente cabe em toda a arena',
    summary: 'O presente promocional se adapta melhor a PC, celulares e iPad: respeita recortes e barras do sistema, mantém os controles acessíveis em telas baixas e protege a abertura ao girar ou redimensionar a tela.',
    description: 'A caixa continua grande e central, mas agora reserva o espaço dos recortes da tela, adapta a altura ao navegador e mantém minimizar e pausar ao alcance em paisagem. Uma mudança de orientação encerra apenas os efeitos em andamento e preserva o resultado já confirmado.',
    highlights: ['Mais espaço seguro ao redor do presente em celulares e iPad', 'Controles acessíveis em telas baixas e orientação paisagem', 'Rotação e modo dividido preservam um código já confirmado', 'Cópia manual disponível quando o navegador não oferece cópia automática'],
    released_at: '2026-08-27T22:43:00Z'
  },
  {
    version: '0.4.0-beta', kind: 'improvement', published: true,
    title: 'Um presente especial no centro da arena',
    summary: 'O promocode ganha um presente central com mais movimento, brilho e confetes. A abertura acontece após confirmar a curtida, e o código fica em destaque para copiar. Você pode minimizar, reabrir e pausar os efeitos.',
    description: 'As promoções disponíveis ganham uma caixa maior no centro da tela, com um breve suspense antes de abrir. A celebração dá lugar ao código para facilitar a cópia. A disponibilidade e a validade continuam vinculadas a cada campanha.',
    highlights: ['Presente central com brilho, movimento e três ondas de confetes', 'Abertura após a confirmação da curtida, com o código em destaque ao final', 'Minimizar e reabrir sem perder a promoção', 'Controle para pausar efeitos e respeito à preferência por movimento reduzido'],
    released_at: '2026-08-27T22:23:00Z'
  },
  {
    version: '0.3.7-beta', kind: 'fix', published: true,
    title: 'Diversão ganha mais estabilidade no mobile',
    summary: 'A experiência Diversão fica mais resistente no celular sem perder animações, com VS centralizado e capitães mais claros.',
    description: 'A experiência reduz o custo de composição dos efeitos, protege contra telas sobrepostas presas e mantém o visual e as animações da Diversão.',
    highlights: ['Animações da Diversão preservadas', 'VS ancorado ao centro real no mobile', 'Capitães com hierarquia visual mais forte', 'Recuperação automática contra sobreposição presa'],
    released_at: '2026-08-27T01:05:00-03:00'
  },
  {
    version: '0.3.6-beta', kind: 'fix', published: true,
    title: 'Composições voltam a concluir a análise',
    summary: 'Montar trio volta a receber uma resposta conclusiva do Echo Brain, com estados claros e sem confundir evidência corroborada com verificação oficial.',
    description: 'O Semantic V4 usa evidência corroborada com confiança reduzida na leitura determinística, encerra corretamente estados de erro e mantém o aprendizado fora da nota enquanto a influência estiver em 0%.',
    highlights: ['Análise de trio volta a concluir no servidor', 'Evidência corroborada aparece com confiança reduzida', 'Erros deixam de ficar presos em “Validando no servidor”', 'Aprendizado continua fora da nota quando a influência está em 0%'],
    released_at: '2026-08-27T00:30:00-03:00'
  },
  {
    version: '0.3.5-beta', kind: 'improvement', published: true,
    title: 'Tier List, Classes e autoria ficam mais claras',
    summary: 'As áreas públicas passam a explicar para que servem, e o criador de cada build deixa de parecer um detalhe apagado.',
    description: 'Tier List agora explica como interpretar uma classificação publicada, Classes deixa claro que representa função e não força, e as superfícies de builds reforçam a autoria como parte central do conteúdo.',
    highlights: ['Tier List explica propósito e limites', 'Classes diferencia função de ranking', 'Criador da build ganha destaque visual nas superfícies públicas'],
    released_at: '2026-08-26T22:48:00-03:00'
  },
  {
    version: '0.3.4-beta', kind: 'fix', published: true,
    title: 'Comparador de builds restaurado',
    summary: 'O comparador voltou a montar a experiência completa com cards, ranking e atributos reais sem ser interrompido pelo cabeçalho global.',
    description: 'A comparação volta a funcionar de forma resiliente mesmo quando o cabeçalho global reorganiza controles da página.',
    highlights: ['Comparação completa restaurada', 'Cards e ranking reais preservados', 'Falha periférica do cabeçalho não interrompe mais o comparador'],
    released_at: '2026-08-26T18:56:00-03:00'
  },
  {
    version: '0.3.3-beta', kind: 'improvement', published: true,
    title: 'Perfil, Diversão e conta seguem um padrão global',
    summary: 'Perfil e Diversão permanecem acessíveis de forma consistente em todo o site.',
    description: 'A navegação de conta foi unificada entre as páginas públicas sem comprimir a experiência desktop.',
    highlights: ['Perfil visível no mobile', 'Conta e identidade persistentes no menu', 'Cabeçalho desktop preserva espaço da navegação'],
    released_at: '2026-08-26T11:45:00-03:00'
  },
  {
    version: '0.3.2-beta', kind: 'fix', published: true,
    title: 'Apelido acessível junto da prévia no mobile',
    summary: 'No celular, apelido e nome aparecem antes da prévia viva do card.',
    description: 'O formulário mobile foi reorganizado para manter a identidade editável sempre acessível.',
    highlights: ['Campo de @ não fica mais escondido', 'Prévia viva acompanha a edição', 'Desktop preservado'],
    released_at: '2026-08-26T11:28:00-03:00'
  },
  {
    version: '0.3.1-beta', kind: 'fix', published: true,
    title: 'Meu Perfil institucional e acesso à conta corrigidos',
    summary: 'Founder e Admin voltam a carregar o perfil de forma estável e o mobile recupera acesso claro à conta.',
    description: 'A identidade institucional deixa de cair em estado indisponível durante atualizações da página.',
    highlights: ['Refresh do perfil institucional estabilizado', 'Entrar e criar conta acessíveis no mobile', 'Meu Perfil e Sair persistentes no menu'],
    released_at: '2026-08-26T10:50:00-03:00'
  },
  {
    version: '0.3.0-beta', kind: 'feature', published: true,
    title: 'Echo Trust System',
    summary: 'Identidade, autoridade, reputação e validação passam a seguir sinais separados e consistentes.',
    description: 'O sistema de confiança diferencia claramente quem a pessoa é, o que pode fazer e como um conteúdo foi validado.',
    highlights: ['Autoria institucional consistente', 'Verificação com proveniência', 'Reputação separada de autoridade'],
    released_at: '2026-08-26T10:20:00-03:00'
  },
  {
    version: '0.2.8-beta', kind: 'fix', published: true,
    title: 'Prévia do card acompanha a edição no mobile',
    summary: 'Nome, apelido, bio, cor e identidade institucional são refletidos junto do formulário.',
    description: 'A edição da identidade ganhou feedback visual imediato no celular e tablet.',
    highlights: ['Prévia sincronizada no mobile', 'Sem duplicar estado', 'Desktop mantém card lateral'],
    released_at: '2026-08-26T09:50:00-03:00'
  },
  {
    version: '0.2.7-beta', kind: 'improvement', published: true,
    title: 'Perfis institucionais deixam a progressão comunitária',
    summary: 'Founder fica fora da progressão Echo Scouts e Admin recebe identidade funcional ligada ao painel.',
    description: 'Perfis institucionais passam a representar função e responsabilidade, não participação comunitária.',
    highlights: ['Founder fora de pontos e ranks', 'Admin com insígnia funcional', 'Autoridade separada de reputação'],
    released_at: '2026-08-26T09:30:00-03:00'
  },
  {
    version: '0.2.6-beta', kind: 'improvement', published: true,
    title: 'Founder e Admin ganham identidades visuais próprias',
    summary: 'Cards institucionais deixam de parecer uma variação de membro comum.',
    description: 'A identidade visual passa a comunicar autoridade sem acumular badges decorativos.',
    highlights: ['Founder com linguagem visual Origin', 'Admin com linguagem Control', 'Hierarquia institucional mais clara'],
    released_at: '2026-08-26T09:10:00-03:00'
  },
  {
    version: '0.2.5-beta', kind: 'fix', published: true,
    title: 'Card da Echo Identity acompanha as insígnias no mobile',
    summary: 'No celular e tablet, a prévia do card fica próxima da coleção Echo Scouts.',
    description: 'A leitura da identidade e das insígnias ficou mais direta em telas menores.',
    highlights: ['Card reposicionado no mobile', 'Relação entre identidade e progressão mais clara', 'Desktop preservado'],
    released_at: '2026-08-26T08:50:00-03:00'
  },
  {
    version: '0.2.4-beta', kind: 'fix', published: true,
    title: 'Founder sincronizado no Meu Perfil',
    summary: 'Perfis institucionais exibem Founder/Admin corretamente sem misturar cargo com nível comunitário.',
    description: 'A identidade institucional passa a refletir corretamente o papel real da conta.',
    highlights: ['Founder reconhecido no próprio perfil', 'Autoridade não inferida no cliente', 'Conta existente preservada'],
    released_at: '2026-08-26T08:30:00-03:00'
  },
  {
    version: '0.2.3-beta', kind: 'improvement', published: true,
    title: 'Echo Identity melhora leitura no mobile e especialidades',
    summary: 'Card, insígnias e especialidades ficam mais claros no celular.',
    description: 'A experiência de progressão fica mais legível sem alterar pontos, thresholds ou autoridade do servidor.',
    highlights: ['Card mobile mais compacto', 'Coleção de insígnias mais densa', 'Especialidades explicadas visualmente'],
    released_at: '2026-08-26T08:10:00-03:00'
  },
  {
    version: '0.2.2-beta', kind: 'improvement', published: true,
    title: 'Echo Identity agora está viva',
    summary: 'Teste o card antes de entrar, simule cenários de pontos e explore cada insígnia da sua jornada.',
    description: 'A Echo Identity ganhou mais vida sem perder honestidade: a entrada apresenta a novidade, o laboratório explica cenários de contribuição e o showroom permite experimentar insígnias sem fingir conquistas ou alterar pontos.',
    highlights: ['Nova vitrine interativa da Echo Identity antes do login', 'Simulador educativo usando os pesos reais da política ativa', 'Showroom das sete insígnias diretamente no card', 'Mais profundidade, movimento e respostas visuais com acessibilidade'],
    released_at: '2026-08-25T20:12:00-03:00'
  },
  {
    version: '0.2.1-beta', kind: 'improvement', published: true,
    title: 'Echo Identity: sua jornada ganha vida',
    summary: 'Veja como ganhar pontos, teste seu nick no card e acompanhe as insígnias da sua evolução.',
    description: 'Meu Perfil transforma a progressão comunitária em uma jornada visual clara: você entende o que fazer, vê como sua identidade aparece e acompanha o que falta para cada nível.',
    highlights: ['Destaque de lançamento da Echo Identity', 'Guia visual de como contribuições confirmadas geram pontos', 'Prévia ao vivo do nick e do card', 'Coleção das sete insígnias Echo Scouts'],
    released_at: '2026-08-25T19:47:00-03:00'
  },
  {
    version: '0.2.0-beta', kind: 'feature', published: true,
    title: 'Echo Identity e Meu Perfil',
    summary: 'Crie seu apelido público, acesse Meu Perfil pela conta e escolha quando sua identidade pode aparecer no Echo Arena.',
    description: 'A comunidade ganha identidade própria, controles claros de privacidade e progressão baseada em contribuições confirmadas.',
    highlights: ['Apelido público no cadastro', 'Acesso direto ao Meu Perfil', 'Perfil privado por padrão', 'Contribuições revisadas antes de pontuar'],
    released_at: '2026-08-25T19:10:00-03:00'
  },
  {
    version: '0.1.0-beta', kind: 'beta', published: true,
    title: 'Acesso Beta e transparência pública',
    summary: 'O Echo Arena passa a sinalizar claramente o estágio Beta e inaugura um histórico próprio para acompanhar a evolução do produto.',
    description: 'Esta versão cria uma experiência pública de acompanhamento das atualizações, com foco no que mudou para quem usa o Echo Arena.',
    highlights: ['Aviso Beta nas superfícies públicas', 'Histórico de versões dentro do Echo Arena', 'Páginas institucionais revisadas', 'Contato sem redirecionamento técnico'],
    released_at: '2026-08-22T09:16:00-03:00'
  }
];
