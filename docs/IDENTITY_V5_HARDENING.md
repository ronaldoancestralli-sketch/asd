# Echo Identity V5 Hardening — Shadow

## Estado e limite de escopo

A V5 é uma camada aditiva sobre o Meu Perfil V4. Ela permanece em **Shadow**, fora da navegação pública, sem ativar os gates de identidade, Echo Research, Creator ou perfis públicos. O destino exclusivo é o Supabase SNV; o projeto legado não pode receber estas migrations.

O objetivo é impedir que volume, reenvios equivalentes, autoavaliação, correções silenciosas ou corridas de recálculo se transformem em reputação. A experiência ganha missões e feedback de progresso, mas nenhuma recompensa é calculada no navegador.

## Estado de implantação

Em 2026-08-25, a cadeia completa das 19 migrations Identity V1–V5 foi aplicada ao banco principal do SNV após dry-run transacional com rollback. Uma migration posterior criou 13 índices de cobertura para eliminar todo o delta de foreign keys sem índice. Os 17 contratos SQL passaram no banco real, os três perfis foram preservados e os seis gates continuam desligados. A evidência completa está em `docs/IDENTITY_V5_SNV_AUDIT_20260825.md`.

## Modelo de ameaça

| Tentativa | Barreira V5 | Resultado esperado |
|---|---|---|
| Alterar a evidência depois do envio | Trigger de submissão imutável | atualização rejeitada |
| Variar link/payload do mesmo fato para lotar a fila | lock e limites por `knowledge_fingerprint` | submissão bloqueada ou resfriada |
| Disparar envios concorrentes para escapar do limite | advisory locks em ordem fixa: membro → conhecimento | contagem serializada |
| Ganhar pontos com a primeira decisão Admin | confirmação independente obrigatória | zero ponto enquanto aguarda |
| Auto-revisar ou auto-confirmar | autor, revisor e confirmador separados | evento inelegível/rejeitado |
| Trocar repetidamente uma decisão | revisões limitadas e motivo obrigatório | mudança auditada e limitada |
| Manter pontos antigos durante uma correção | recálculo imediato na nova decisão primária | efeito anterior removido |
| Recalcular especialidades ao mesmo tempo | lock transacional por usuário | snapshot serializado |
| Editar/apagar histórico administrativo | ledgers append-only com hashes encadeados | escrita rejeitada e alteração detectável |
| Explorar missões como nova fonte de pontos | progresso somente de snapshots confirmados; `awards_reputation=false` | orientação sem prêmio paralelo |

## Limites versionados

`echo_research_guardrail_policy` usa a política `research-hardening-v5-shadow`:

- janela de submissão: 24 horas;
- máximo de 30 submissões por membro na janela;
- máximo de 12 pendências totais por membro;
- máximo de 2 pendências do mesmo membro para o mesmo conhecimento;
- máximo global de 12 pendências por conhecimento;
- cooldown de 6 horas por membro e conhecimento;
- máximo de 6 revisões do mesmo registro por janela;
- confirmação independente obrigatória.

Os valores são conservadores para o piloto e devem ser calibrados com telemetria real, sem alterar retroativamente a versão gravada em cada submissão.

## Fluxo de decisão

1. O membro envia evidência; o estado nasce `pending` e vale zero.
2. Um Admin AAL2 registra a decisão primária. O trigger cria um evento imutável e encadeado.
3. A contribuição passa a `awaiting_confirmation`. O recálculo remove qualquer efeito anterior e o novo evento continua valendo zero.
4. Outro Admin AAL2 inspeciona a mesma evidência:
   - `confirmed`: o evento atual entra no recálculo;
   - `disputed`: o evento vale zero e exige nova decisão primária com motivo.
5. Pontos, taxa, tier e especialidades são materializados sob um lock por usuário e usam somente a decisão atual confirmada.

O bônus de Primeira descoberta continua único por conhecimento/patch. Antes da confirmação, a interface o chama de **candidato**, nunca de conquista definitiva.

## Auditoria

`echo_research_review_events` preserva cada revisão com o hash do evento anterior daquela contribuição. `echo_research_review_confirmations` preserva um único segundo parecer para cada evento. Todos os timestamps incluídos nos hashes são canonizados como microssegundos desde o Unix epoch, portanto a verificação não muda com o fuso horário da sessão. A auditoria de autoridade institucional também passa a ser append-only e encadeada por uma linha singleton bloqueada durante cada inserção.

O encadeamento evidencia alterações acidentais ou fora do fluxo normal, mas não substitui backup, logs externos ou controle de acesso ao banco: um superusuário comprometido poderia reescrever dados e hashes. Para uma garantia independente futura, snapshots dos hashes finais devem ser exportados periodicamente para um destino imutável fora do projeto.

## Missões sem gamificação explorável

As seis missões `missions-v5-shadow` usam apenas `echo_community_reputation` e `echo_community_specialty_stats`, ambos derivados do conhecimento único confirmado. Elas ajudam o membro a visualizar marcos como primeiro sinal, três verificações, duas especialidades e primeira descoberta.

Missões não inserem pontos, não criam badges, não concedem autoridade e não possuem RPC de conclusão. O servidor retorna `awards_reputation=false`; se esse contrato faltar, o cliente falha fechado e não exibe progresso provisório.

## Privilégios e exposição

- todas as novas tabelas têm RLS explícita;
- `anon` não lê política Shadow, missões, eventos ou confirmações;
- `authenticated` lê somente catálogos transparentes e, por RLS, eventos administrativos apenas quando `echo_is_admin()` é verdadeiro;
- nenhuma tabela nova concede `INSERT`, `UPDATE` ou `DELETE` ao cliente;
- o membro recebe `SELECT` apenas das colunas sanitizadas de sua contribuição; payload, referência de evidência, `review_note` e identidade do revisor ficam fora da permissão de coluna;
- o painel obtém a fila completa somente por `admin_research_review_queue_v5()`, que exige Admin AAL2 antes de retornar evidência para revisão;
- as filas `pending` e `confirmation` usam ordenação e índices próprios; a fila de segunda confirmação tem índice parcial apenas sobre registros `awaiting_confirmation`;
- as RPCs usam `SECURITY DEFINER`, `search_path=''`, revogação de `PUBLIC`/`anon` e validação de identidade ou Admin AAL2 dentro da função;
- evidência, payload e notas de revisão continuam fora do histórico privado do membro.

## Riscos residuais

A V5 reduz farming mecânico, mas não declara resolvidos:

- múltiplas contas controladas pela mesma pessoa;
- conluio entre dois administradores;
- fatos semanticamente equivalentes escritos com assuntos canônicos diferentes;
- evidência externa que muda ou desaparece depois da revisão;
- sessão Admin comprometida apesar de AAL2;
- abuso distribuído abaixo dos limites individuais.

O piloto deve observar concentração por IP/dispositivo apenas com política de privacidade aprovada, taxa de divergência por revisor, revisões excessivas, clusters de conhecimento semelhantes e crescimento anormal de aceitação entre pares de contas. Nenhum bloqueio automático de usuário deve ser criado a partir desses sinais sem revisão humana.

## Sequência de implantação no SNV

1. Confirmar projeto `nqklhsfaqpbjqmfzjzxk`, backup recuperável e gates desligados.
2. Reexecutar todos os Quality Gates e validar que a V5 não entrou na navegação pública.
3. Confirmar no histórico do banco que todas as migrations de Identidade V1–V4 anteriores a `20260825110000` já foram aplicadas. Se qualquer pré-requisito estiver ausente, **não executar a V5 isoladamente**: validar primeiro a cadeia completa e ordenada em uma branch de desenvolvimento e preparar um plano separado para produção.
4. Executar preflight de dados: decisões aceitas sem `reviewed_by` ou primeira descoberta duplicada devem abortar a implantação.
5. Com os pré-requisitos comprovados, aplicar nesta ordem:
   - `20260825110000_identity_research_guardrails_v5_shadow.sql`;
   - `20260825111000_identity_review_ledger_and_scoring_v5_shadow.sql`;
   - `20260825112000_identity_research_missions_v5_shadow.sql`;
   - `20260825113000_identity_foreign_key_indexes_v5.sql`.
6. Executar todos os testes SQL de identidade, inclusive os quatro contratos V5.
7. Comparar Advisors de segurança/desempenho com a linha de base anterior; não aceitar regressão criada pela V5.
8. Testar com pelo menos três contas distintas: membro, revisor primário e confirmador; cobrir confirmação, divergência, correção, concorrência e limites.
9. Validar desktop e celular. Manter os gates desligados até decisão explícita posterior.

Não há rollback destrutivo automático. Diante de falha, os gates permanecem desligados, novas ações são interrompidas e o banco é restaurado a partir do backup/checkpoint aprovado. A remoção manual de tabelas ou colunas não deve ser usada como recuperação improvisada.
