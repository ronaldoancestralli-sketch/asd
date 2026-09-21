# Central de Status — configuração e teste no mesmo lugar

Base: main `233713cc` (MR !69), 2026-09-08. Mudança exclusiva do Admin;
a versão pública continua 0.7.1-beta. Cache administrativo `ux=20260908-1`.

## Problema e resultado esperado

Configurar uma linha exigia navegar por cinco abas, cadastrar uma definição em
outro formulário, selecionar novamente herói/equipamento e interpretar uma
tabela de todas as bases. A Central agora abre em **Configurar equipamento**:

- selecionar equipamento, raridade e herói compatível;
- escolher uma linha identificada pela variante e pela posição, com texto
  integral; linhas com nomes iguais permanecem independentes;
- definir destino, operação e condição no mesmo formulário; quando necessário,
  confirmar nome e unidade do status sem sair do efeito;
- testar com mira/movimento/habilidade explicitamente escolhidos;
- conferir antes/depois, o estado da regra publicada e outras pendências;
- revisar e aplicar somente esse efeito, com gravação, releitura, publicação
  e conferência da prova retornada pelo Brain.

Diagnóstico, cadastro completo de status, bases, conjuntos, habilidades, teste
com vários itens e revisões permanecem em **Ferramentas avançadas**. A navegação
para corrigir uma base ou montar uma prova completa leva a seleção atual.

## Autoridade e verificação

`status-central-workflow.js` usa o contrato e o motor existentes. Não interpreta
nomes como destino, não adivinha unidades, não mistura raridades, não atribui
base zero quando o valor está ausente e não transforma condição inativa em
teste aprovado. Texto marcado como incompleto continua bloqueado.

Testar não grava dados. A publicação exige um resultado ativo para a linha
selecionada. Outros efeitos pendentes ficam visíveis; confirmar uma linha não
declara o equipamento inteiro validado. Outros ajustes no rascunho bloqueiam
a publicação simples e levam à revisão avançada, evitando publicação conjunta
sem teste. Definições já publicadas são reutilizadas, não editadas pelo fluxo
simples, pois podem afetar outros itens.

Ao confirmar, o fluxo relê fontes, base, revisão e publicação. Uma divergência
interrompe a operação. A gravação é conferida por nova leitura antes de publicar;
a publicação é conferida por identidade e conteúdo. O Brain precisa confirmar
revisão, resultado e origem. Se sua consulta falhar após a publicação, a tela
informa **Publicado · confirmação pendente** e permite **Verificar no site**.

Os motivos do histórico são gerados a partir da ação. Não há justificativa
obrigatória no fluxo principal. Permissões/RPCs, MFA e políticas permanecem as
existentes; nenhuma migração é necessária.

## Validação e entrega

Testes isolados de modelo e controladores exercitam nomes repetidos, raridades,
condições, antes/depois, ausência de base, unidade obrigatória, mudanças após
o teste, conflitos de revisão, falhas de releitura e paridade do Brain. O teste
dos controles usa os handlers reais e dados fictícios em VM; não equivale a
revisão visual autenticada. Esses testes integram o gate numérico do CI.

O usuário já autorizou integração na main e conferência visual em produção.
Manter CI aprovado e confirmar os jobs protegidos do Brain e Pages antes de
informar a publicação. Nenhum herói, equipamento ou vínculo real foi apagado,
recriado ou publicado como parte do desenvolvimento desta interface.
