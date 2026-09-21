# Echo Identity V12 — prévia viva durante a edição

## Objetivo

No mobile, o usuário precisa enxergar imediatamente como nome, apelido, bio e cor afetam o card sem perder o contexto da coleção Echo Scouts — e os campos essenciais da identidade precisam continuar acessíveis em modo retrato.

## Comportamento

- O card principal continua junto das insígnias em telas de até 900 px.
- No formulário mobile, **Apelido público** e **Nome de exibição** aparecem primeiro e permanecem sempre acessíveis.
- A segunda prévia visual é inserida no fluxo do próprio formulário logo depois desses dois campos e antes da Bio.
- A prévia usa posicionamento estático no mobile e tem a ordem de layout neutralizada, impedindo que regras antigas de `order: -1` a coloquem por cima dos campos.
- A segunda prévia é um espelho do mesmo card: não possui IDs internos próprios, não recebe listeners e não cria estado paralelo.
- Alterações no card principal são observadas e refletidas no espelho, incluindo nome, apelido, bio, cor, nível comunitário e apresentação institucional Founder/Admin.
- O fluxo não depende de girar o aparelho: retrato e paisagem preservam acesso ao `@`.
- Em desktop, o espelho é removido e permanece apenas o card lateral original.

## Segurança e fonte de verdade

A prévia adicional não consulta nem grava dados. Reputação, badges e autoridade continuam vindo das mesmas fontes server-side já existentes. Nenhuma migration ou alteração de Supabase faz parte desta mudança.
