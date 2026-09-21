# Implantação auditada — Echo Identity V1–V5 no SNV

Data: **2026-08-25**  
Projeto: `nqklhsfaqpbjqmfzjzxk` (SNV, plano Free)  
Fonte das 19 migrations de Identity: `68405dcae360818b68c8b80cf8828797946fb4ae`  
Estado de rollout: **Shadow; os seis gates públicos continuam desligados**

## Conclusão

A cadeia completa Echo Identity V1–V5 foi aplicada com sucesso no banco principal autorizado do SNV. O plano Free cobre esse projeto principal; o custo apresentado anteriormente era somente para uma branch de desenvolvimento isolada do Supabase. Como o plano atual não oferece Supabase Branching e o usuário não quis contratar um ambiente de teste, nenhuma branch paga foi criada.

Antes da escrita persistente, as 19 migrations foram executadas juntas em um dry-run transacional no próprio SNV e integralmente revertidas. Depois da validação do rollback, elas foram aplicadas em ordem. A auditoria de desempenho encontrou 13 foreign keys novas sem índice; uma vigésima migration aditiva, também ensaiada com rollback, criou apenas os índices de cobertura.

Nenhum gate foi ativado, nenhuma contribuição/revisão foi criada e os três perfis existentes foram preservados.

## Recuperação no plano Free

Como o plano Free não oferece backup diário automático, foi criado antes do deploy o checkpoint lógico privado `identity-v1-v5-68405dca-before` em `private.echo_identity_deploy_checkpoints`. Ele preserva os três perfis, definições e ACLs das quatro funções substituídas, estrutura relevante de `profiles`, policies/triggers e o histórico de migrations anterior.

A tabela tem RLS habilitada, nenhuma policy e nenhum privilégio para `public`, `anon`, `authenticated` ou `service_role`. Esse checkpoint é uma proteção de recuperação no mesmo banco, não um backup externo; ele deve ser mantido até existir backup independente ou uma janela operacional validada.

## Método de implantação

1. Preflight somente leitura: projeto saudável, PostgreSQL 17.6/UTC, zero sessões concorrentes relevantes, extensões necessárias presentes e três perfis compatíveis.
2. Conteúdo das 19 migrations obtido diretamente do GitLab no SHA acima; nenhuma cópia antiga ou GitHub foi usada.
3. Dry-run único com `BEGIN`, advisory lock, `lock_timeout`, `statement_timeout`, invariantes pós-DDL e `ROLLBACK`.
4. Confirmação de que o dry-run deixou zero tabelas Identity persistidas.
5. Aplicação sequencial das 19 migrations, registradas entre `20260825205436` e `20260825210207`.
6. Auditoria e aplicação de `20260825113000_identity_foreign_key_indexes_v5.sql`, registrada como `20260825211647`.
7. Execução dos 17 contratos SQL e dos Quality Gates estáticos.

O bundle independente Semantic v4/Echo Brain não foi aplicado por efeito colateral. O contrato de privilégios aceita somente dois estados íntegros: ausência completa das nove RPCs Semantic ou presença do bundle inteiro; instalação parcial falha.

## Estado final comprovado

| Invariante | Resultado |
|---|---:|
| Migrations registradas | 24 = 4 restauração + 19 Identity + 1 índices |
| Tabelas Identity presentes / com RLS | 19 / 19 |
| Perfis preservados | 3 |
| Perfis públicos Shadow / reputações inicializadas | 3 / 3 |
| Contribuições / eventos / confirmações | 0 / 0 / 0 |
| Missões ativas | 6 |
| Gates públicos ligados | 0 de 6 |
| `SECURITY DEFINER` para `authenticated` | 59; 59 com `search_path` fixo |
| `SECURITY DEFINER` para `anon` | 4; todas classificadas no contrato |
| Referências Vault/Cron para outro Supabase | 0 |
| URL operacional do Vault | travada no projeto SNV |

A política ativa é `research-hardening-v5-shadow`: 12 pendências por membro, 2 por membro/conhecimento, 12 globais por conhecimento, cooldown de 360 minutos e confirmação independente obrigatória.

## Testes no banco real

Os 17 contratos SQL passaram: segurança V1/V2, experiência V3, hardening V4, reputação/deduplicação/primeira descoberta/especialidades, independência de revisão, os três contratos V5, índices de foreign key e os dois contratos gerais de privilégios.

Quatro falsos negativos do conjunto legado foram corrigidos sem alterar funções de produção:

- deduplicação exigia uma forma textual antiga de `bool_or`, anterior à revisão independente;
- referência de pesquisa removia espaços da função, mas comparava com uma expressão ainda espaçada;
- especialidades dependiam da formatação exata de `pg_get_functiondef`;
- a allowlist geral ignorava oito RPCs já existentes no SNV restaurado e presumia que Semantic v4 estivesse instalada.

O contrato corrigido classifica 68 assinaturas no catálogo completo ou 59 sem o bundle Semantic. No SNV atual ele comprovou 59 funções autenticadas, quatro públicas e nenhuma função inesperada.

Testes funcionais adicionais, sempre revertidos, comprovaram deduplicação por conhecimento, rejeição de herói desabilitado, construção server-side do assunto de habilidade e ausência de fixtures persistidas.

## Advisors: baseline e resultado

| Advisor | Antes | Final | Interpretação |
|---|---:|---:|---|
| Segurança total | 61 | 82 | 21 avisos esperados/classificados pela nova superfície |
| Segurança WARN / INFO | 46 / 15 | 64 / 18 | +15 RPCs autenticadas, +3 RPCs públicas e +3 tabelas fechadas sem policy |
| Desempenho total | 242 | 267 | somente INFO |
| Foreign keys sem índice | 53 | 53 | nenhuma foreign key de Identity permanece sem índice |
| Índices sem uso observado | 189 | 214 | 25 índices novos ainda sem tráfego porque os gates estão desligados |

As três tabelas novas marcadas como “RLS sem policy” são deliberadamente fechadas: o checkpoint privado, `echo_founder_authority` e `echo_identity_authority_audit_chain_state`. Os avisos de execução `SECURITY DEFINER` são cobertos pelos contratos de identidade, AAL2, vínculo a `auth.uid()`, superfície pública mínima e `service_role` explícito.

Os avisos legados restantes — inclusive proteção contra senhas vazadas e quatro tabelas privadas antigas com RLS desabilitada — não foram alterados automaticamente para evitar regressão fora do escopo. Remediação: [Supabase Database Advisors](https://supabase.com/docs/guides/database/database-advisors).

## Próximo gate

- manter os seis gates desligados;
- validar o fluxo com três contas distintas: membro, revisor primário e confirmador Admin AAL2;
- revisar desktop e celular antes de qualquer exposição pública;
- manter o checkpoint lógico até haver recuperação externa comprovada;
- tratar avisos legados em uma tranche separada.

A MR V5 continua Draft e apontando para a V4. O deploy no banco não autoriza merge automático na branch Git `main` nem ativação pública.
