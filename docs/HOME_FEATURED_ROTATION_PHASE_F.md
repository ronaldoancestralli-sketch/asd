# Home — destaque canônico, prévia e ativação, etapa F

Data: 2026-09-06. Aplicação direta na `main` autorizada pelo usuário.
Versão pública: `0.6.0-beta`.

## Resultado desta etapa

A página inicial deixa de tratar o campo legado do CMS como autoridade normal.
Ela lê `public.echo_home_featured_state_v1()` antes de montar o catálogo e usa o
CMS apenas como contingência quando a RPC inteira está indisponível. Uma resposta
canônica sem herói não ressuscita um selo antigo. Seleção do visitante e destaque
editorial continuam independentes; builds, ficha e criação seguem sempre o herói
selecionado.

Somente quando `selectedHeroId === featuredHeroId` a área principal assume o
modo `featured`: texto literal **Herói em destaque**, selo **Destaque da Arena**,
aurora, dois circuitos orbitais, pontos de energia, feixe, recorte cromático da
arte, nome luminoso, controles e moldura da build reforçados. Qualquer herói
alcançado pelas setas que não seja o canônico recebe o modo `explore`, com o texto
**Explorar heróis** e sem os símbolos editoriais. Ao retornar ao destaque, a
transição direcional existente também revela o tratamento premium.

As animações decorativas ficam fora da árvore acessível e são interrompidas por
`prefers-reduced-motion`. O selo é texto real, não apenas cor. A prévia possui uma
faixa explícita para nunca ser confundida com o estado público.

## Teste imediato, sem esperar um dia

O Admin calcula o próximo herói a partir da fila vigente e a próxima fronteira
real do calendário. **Abrir prévia** usa a rota
`?previewDestaque=proximo`; a URL não recebe UUID nem slug livre. A home só aceita
essa intenção depois que `echo_admin_preview_home_featured_rotation_v1()` valida
`publishing.view` e devolve o próximo herói. Sem autorização ou em caso de falha,
a página mostra a autoridade canônica normal.

A prévia não atualiza configuração, projeção pública, histórico ou auditoria.
Ela permite conferir imediatamente selo, arte, transição, build e destinos do
próximo herói. Fechar a aba ou abrir a home sem o parâmetro encerra a simulação.

## Ativação e pausa

`echo_admin_set_home_featured_automation_v1()` exige `publishing.publish`, motivo
de 4 a 240 caracteres e a revisão esperada. Ativar transforma o destaque atual
na âncora do período vigente, preserva o herói público e define a próxima virada.
Pausar mantém o herói atual como destaque manual e limpa apenas a janela ativa.
Ambas as ações escrevem no histórico append-only e na auditoria administrativa.

Enquanto a rotação está ativa, frequência, calendário, fila e troca manual ficam
bloqueados na interface. Isso impede mudar a regra sob um ciclo em execução; o
operador precisa pausar, editar e ativar novamente, estabelecendo uma nova âncora.

## Worker

O job nomeado `echo-home-featured-rotation-1m` chama diretamente o executor
privado no banco a cada minuto. `cron.schedule` faz upsert pelo nome, portanto a
migration não duplica o job. Quando a automação está desligada, o executor retorna
`inactive` sem alterar estado ou histórico. Quando ligada, a chave
revisão/período torna chamadas repetidas idempotentes. A frequência editorial
continua sendo diária ou semanal; um minuto é apenas a resolução do verificador.

Nenhuma chave, endpoint HTTP, Edge Function ou `service_role` participa do job.
Os dois jobs existentes de outros módulos não são alterados.

## Gates

- testes Node cobrem precedência canônica, fallback, estado vazio, prévia
  autorizada, rejeição de URL livre, textos dos três modos e payload de ativação;
- fixture PostgreSQL 17 cobre privilégios, prévia sem escrita, ativação, repetição,
  virada seguinte, pausa, concorrência por revisão, autorização e job único;
- gate estático vincula visual premium ao atributo `data-is-featured="true"`,
  exige movimento reduzido, cache-busting, contrato público e dependências do CI;
- a migration deve ser aplicada somente ao SNV `nqklhsfaqpbjqmfzjzxk` e os
  advisors precisam ser revisados após a aplicação.

## Operação no Admin

1. Salvar frequência, horário, fuso e fila com a automação pausada.
2. Usar **Abrir prévia** para validar imediatamente o próximo herói na home.
3. Informar um motivo e usar **Ativar rotação** quando o plano estiver aprovado.
4. Para qualquer alteração posterior, pausar, editar e reativar.

O deploy desta etapa disponibiliza o controle; ele não liga a automação sem uma
confirmação editorial explícita no Admin.
