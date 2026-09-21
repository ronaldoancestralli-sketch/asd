# Founder-only MFA security boundary

A partir desta revisão, TOTP/AAL2 é obrigatório somente para a autoridade Founder singleton.

- Staff administrativo comum autentica com sessão Supabase válida e só recebe capacidades dos módulos explicitamente concedidos pelo Founder.
- `echo_is_admin()` retorna `true` para staff ativo em AAL1, mas para Founder exige AAL2.
- `echo_has_admin_capability()` continua sendo a fronteira de menor privilégio: staff não herda módulos que não foram concedidos.
- Founder continua com todos os módulos implícitos; por isso AAL2 permanece obrigatório em toda superfície administrativa Founder.
- Governança continua não delegável: criar, suspender, reativar ou revogar administradores e revisar sinais de integridade permanece Founder-only.
- Auditoria continua registrando ator, módulo, capability, sessão e nível AAL em cada evento.
- `service_role` continua fora do frontend.

A remoção de TOTP dos admins não transforma senha em autorização global: a autorização efetiva continua server-side, por membership ativa + módulo/capability.
