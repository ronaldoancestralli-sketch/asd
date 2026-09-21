# Presente promocional central — release 0.4.0-beta

Base remota: `86128f354fc7e044fc07847ed59398d0b9509872`.
Branch: `feature/promo-central-gift-20260827`.
Escopo: experiência pública de promocode. O Admin restaurado e a V5 de perfis não são alterados.

## Auditoria do estado anterior

- O presente era um emoji de 42 px em uma faixa de 70 px acima do cabeçalho.
- O código ficava no DOM depois de `SIGNED_OUT`: o listener atendia apenas `SIGNED_IN`.
- O parâmetro `promo` e um ID pendente podiam disparar a escrita da curtida após autenticação, sem uma nova ação explícita.
- Respostas assíncronas não verificavam a identidade/campanha que iniciou a requisição.
- A animação aplicava filtros ao contêiner e o CSS mantinha animações infinitas.

## Consulta de leitura no SNV em 27/08/2026

- Existem duas campanhas marcadas como publicadas, verificadas e ativas. Ambas não informam recompensa nem expiração. Este trabalho não confirma a validade dos códigos no jogo e não cria prazo, quantidade ou recompensa fictícios.
- `public.promo_campaigns` e `public.promo_likes` têm RLS. A leitura pública de campanhas é concedida por coluna; a ausência de `SELECT` na tabela inteira não significa ausência de leitura pública.
- `private.promo_secrets` não possui RLS, mas o schema e a tabela não concedem acesso a `anon`/`authenticated`. O código é entregue pelas RPCs protegidas, não pela consulta pública.
- As duas RPCs de revelação exigem conta autenticada, verificam bloqueio e a janela de disponibilidade. `anon` não pode executá-las. A chave composta de curtidas impede duas curtidas simultâneas para a mesma conta/campanha.
- Isso não é proteção completa contra múltiplas contas, compartilhamento do código ou automação distribuída. A política atual permite que a pessoa exclua a própria curtida. Não foi introduzido limite por IP nem alterado esse contrato.
- A função atual `echo_is_admin` usa identidade de equipe e exige AAL2 especificamente para a identidade de fundador. A nova prévia visual exige adicionalmente `currentLevel === 'aal2'` para qualquer conta, além da autorização administrativa.
- Nenhum código privado foi consultado, nenhuma curtida foi criada e nenhuma alteração foi aplicada ao banco.

## Experiência proposta

Presente central em um diálogo nativo, com caixa desenhada em CSS, fita dourada, órbitas de arena e foco de teclado. A abertura tem tampa, luz e confete com corações. A comemoração acontece somente depois da resposta válida do servidor, sem afirmar que o resgate no jogo foi concluído.

Minimizar mantém um presente visível no canto inferior esquerdo. A preferência vale por campanha e por aba; não contém o código. O código permanece apenas em memória/DOM e é apagado ao sair, trocar de conta, atualizar a campanha ou expirar.

Entrar na conta apenas reabre o presente. A curtida exige o botão explícito, inclusive quando o usuário chega por um link com `promo`. Curtida já existente permite consultar o código sem nova escrita e sem repetir a celebração.

Animações são finitas e usam transformações/opacidade. Não há canvas, áudio automático, filtros animados, blur de viewport nem observador global do DOM. O brilho usa fundos e sombras estáticos; apenas as camadas decorativas se movem ou mudam de opacidade. Movimento reduzido elimina a sequência animada.

## Refinamento de movimento e brilho

A segunda iteração visual acrescentou flutuação e balanço da caixa, pequenos saltos da tampa antes de abrir, reflexos dourados, seis estrelas cintilantes, órbitas em movimento e dois anéis de luz na abertura. Os ciclos de ambientação terminam em até 14,55 segundos; não há loop permanente. A terceira iteração ajusta o ritmo da revelação conforme descrito abaixo.

A comemoração mantém três ondas: 108 partículas no desktop e 72 no mobile, com fitas, estrelas, círculos e corações. A criação acontece numa única camada; atrasos são limitados a 400 ms e durações a 2.740 ms. Um limite de 3,5 segundos protege a limpeza da camada; o encerramento após a revelação agora a remove antes disso. Não há criação de partículas a cada frame.

O controle de pausa é acessível por teclado. Pausar, minimizar, ocultar a aba ou ativar movimento reduzido durante a abertura interrompe os efeitos imediatamente, preserva somente o resultado já confirmado e não reinicia o confete ao voltar. Os listeners de visibilidade e movimento reduzido são removidos junto com o componente. A lógica de autenticação, curtida e resgate não muda nesta iteração.

## Terceira iteração: presente em destaque, código ao final

- Caixa 50% maior no desktop, com escala adaptada para telas pequenas e baixas. O título ocupa menos espaço; repetição de etapas e texto decorativo foram removidos.
- A descrição completa, o nome da campanha e a fonte continuam disponíveis em um `details` nativo. A validade permanece visível mesmo com os detalhes recolhidos. O ciclo de Tab considera apenas links disponíveis e inclui o `summary`.
- Após a resposta válida do servidor, caixa e tampa se comprimem, sustentam a posição por cerca de 260 ms e saltam. O confete começa em 650 ms; o código só entra no DOM em 1.400 ms. Movimento reduzido e pausa continuam permitindo a revelação imediata sem efeitos.
- Ao revelar, o presente diminui, órbitas e estrelas saem de cena e o código recebe tipografia maior. O confete perde opacidade e é removido em 900 ms, sem cancelar o feedback independente da cópia.
- Mensagens de confirmação permanecem acessíveis ao leitor de tela, sem repetir textos ao redor do código. Falhas de cópia continuam visíveis e selecionam o código para cópia manual. A prévia descreve a abertura como simulação, sem anunciar uma curtida real.

## Verificação e prévia

- `scripts/check-promo-code-system.py` preserva os contratos de banco e Admin, verifica a nova estrutura e executa `tests/public-promo-code.test.mjs`.
- Os testes cobrem clique duplo, falha/timeout, payload inválido, curtida existente, troca de campanha/conta, logout durante resposta, expiração, prévia AAL2 e indisponibilidade de armazenamento.
- A suíte possui 36 testes, incluindo as três ondas nos dois limites de viewport, tempo de revelação e encerramento da comemoração, foco com detalhes recolhidos/abertos, pausa, mudança da preferência de movimento, aba oculta, descarte de timers/listeners e feedback de cópia após o encerramento dos efeitos. São testes de lógica e DOM simulado; não certificam renderização ou desempenho em aparelho físico.
- `scripts/build-promo-gift-preview.mjs` empacota o mesmo módulo visual e CSS num arquivo sem backend. Não inclui cliente Supabase, campanha real nem código válido. É apenas um artefato do job de prévia; não entra no deploy de produção.
- As opções Desktop/iPad/Mobile da prévia alteram dimensões de viewport. Não equivalem a teste em Safari ou em aparelho físico.
- O domínio próprio retornou erro de certificado no navegador de validação; a origem oficial GitLab Pages abriu. Nenhuma configuração de domínio foi alterada.
- A proteção contra bots do GitLab impediu a inspeção visual da branch no navegador de validação. O HTML da prévia usa o mesmo CSS e módulo visual da branch. A posterior autorização para publicar não significa que a renderização e o desempenho tenham sido certificados no navegador ou em aparelhos físicos.

## Compatibilidade 0.4.1-beta

A etapa seguinte estende o mesmo desenho a PC, celular e iPad. O diálogo combina margens mínimas com as quatro `safe-area-inset-*`, usa `100vh` como fallback e `100dvh` por detecção de suporte. Em telas baixas, reduz apenas a escala e a altura do palco; tampa, luz, estrelas e confetes continuam presentes. O cabeçalho fica acessível durante a rolagem.

Ao abrir, o estado visual do `body`, a posição da página e a rolagem são preservados. Fechar, minimizar, destruir o componente ou abrir o login restaura os valores anteriores. Uma página que já usa `body` fixo não é reposicionada. A cópia automática mantém o fallback que seleciona o código quando a Clipboard API está ausente ou falha.

Mudanças de orientação, modo dividido ou altura do navegador interrompem somente uma celebração já iniciada. Se o servidor já confirmou o código, ele aparece imediatamente e sem uma nova curtida; antes da confirmação, a mudança de viewport não revela conteúdo. O menor eixo define o limite de 72 partículas em celulares, inclusive paisagem, enquanto iPad e PC preservam 108. Os 41 testes incluem a matriz 320×568, 390×844, 844×390, 507×1024, 820×1180, 1180×820 e 1366×768. Esses cenários validam regras e ciclo de vida, mas não substituem um teste em aparelho físico.

Referências de compatibilidade: [áreas seguras no WebKit](https://webkit.org/blog/7929/designing-websites-for-iphone-x/) e [dialog e unidades dinâmicas no Safari 15.4](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/). A implementação mantém o diálogo nativo; não declara suporte a navegadores anteriores a esse recurso.

## Correção da abertura real — 0.4.2-beta

A prévia administrativa valida o desenho e a autorização AAL2, mas não grava curtidas. O relato de erro numa campanha publicada revelou uma lacuna no teste anterior: os testes de interface simulavam a resposta da RPC, e o gate SQL verificava apenas catálogo e permissões.

Os logs do SNV registraram `42702: column reference "promo_id" is ambiguous`. A função `promo_like_and_reveal` declara `promo_id` em `RETURNS TABLE` e também usava esse nome no alvo de `ON CONFLICT`. A falha ocorria na primeira escrita, antes de revelar o código. O novo teste executou a função instalada e reproduziu o mesmo erro.

A migration `promo_like_rpc_conflict_fix`, criada pela CLI, usa `ON CONFLICT ON CONSTRAINT promo_likes_pkey` e qualifica a data pela tabela de destino. A assinatura pública, `search_path`, autorização, bloqueio de conta, janela da campanha, segredo privado e permissões não mudam. Não é alterada nenhuma configuração global de resolução de nomes do PostgreSQL.

O contrato em `supabase/tests/promo_code_security.sql` agora executa onze verificações: chamada anônima negada, identidade ausente negada, ausência de revelação antes da curtida, primeira abertura, retry idempotente com data original, consulta posterior, isolamento entre contas, curtida independente, escrita e leitura negadas após expiração e ausência de curtida persistida se faltar o segredo. Ele usa identidades e campanha sintéticas dentro de uma transação encerrada por `ROLLBACK`; não lê códigos reais, não cria conta e não publica uma promoção de teste para outras sessões. Deve ser executado somente em uma conexão administrativa dedicada.

A mesma regressão passou no SNV com a função corrigida temporariamente dentro da transação, após falhar na versão anterior. A contagem de campanhas e curtidas foi conferida após o descarte. Isso valida a execução SQL com papéis reais; não equivale a um clique autenticado no Safari.

A correção foi aplicada no SNV pela migration `20260827232940_promo_like_rpc_conflict_fix`. O arquivo inicialmente criado pela CLI foi alinhado à versão efetivamente registrada pelo provedor. As onze verificações passaram novamente na função instalada; as duas campanhas permaneceram intactas, sem curtida ou fixture persistida pelo teste. ACL, assinatura e configuração da função permaneceram iguais. O advisor de segurança não apontou achados novos em relação à linha de base; achados anteriores de outras áreas não foram alterados por este hotfix.

O job obrigatório `promo-rpc-database` cria um PostgreSQL descartável no CI. As migrations promocionais são executadas sem alteração; apenas os auxiliares de identidade externos ao módulo usam fixtures. O job exige que a versão antiga reproduza `42702`, aplica a correção, executa o mesmo contrato e confirma que não restaram dados de teste. Nenhuma credencial ou conexão de produção entra nesse job. Preview e deploy dependem tanto desse teste quanto dos Quality Gates existentes.

O presente, as animações, o Admin e a V5 permanecem intocados. A publicação alinha apenas banner, manifesto e histórico público em `0.4.2-beta`, com cache atualizado.

## Publicação

Em 27/08/2026, após a terceira iteração, o usuário autorizou explicitamente aplicar esta revisão na `main`. A release foi classificada como melhoria material da experiência, com incremento minor para `0.4.0-beta`. Banner, histórico e manifesto público são atualizados juntos; o manifesto em código mantém a versão correta quando o conteúdo editorial ainda está desatualizado, sem escrita no Supabase.

O cache `pgv` do artefato Pages passa a incluir o conteúdo do manifesto público além da configuração pública de runtime. Assim, uma release atualiza a cadeia inteira de módulos, inclusive os wrappers que carregam o banner com versões antigas, sem alterar seu comportamento. O validador calcula a mesma assinatura e confere o artefato contra a fonte.

A integração deve usar o MR !37 com a revisão exata aprovada pelos gates, preservando a branch e os controles do GitLab. O merge e o deploy só podem ser considerados concluídos após a confirmação remota. A verificação visual posterior à publicação deve evitar curtidas reais ou consulta de códigos privados; a validação em Safari/iPad físico continua pendente.
