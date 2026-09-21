# Correção de equipamentos e autoridade da Central

Pedido de 2026-09-07, preparado sobre main a91c9c85 (MR !68). A home e a rotação editorial não fazem parte desta alteração.

## Etapa 1 — leitura e cadastro

- Unir continuações textuais na mesma leitura/região, sem atravessar uma raridade ou o próximo efeito.
- Preservar descrição integral, raw, unidade e confiança. Chaves importadas permanecem apenas como importedKey, sem autoridade matemática.
- Sinalizar frases interrompidas (por exemplo, “QUANDO EM”) para revisão. Nunca completar palavras não lidas.
- Exibir o texto em campo multilinha e oferecer acesso ao original da leitura.
- Usar a mesma coleta por linha no salvamento e no backup para desfazer importações, sem confundir a descrição multilinha com o valor. Um rótulo legado abreviado não oculta uma leitura original incompleta; a edição explícita do texto é preservada, sem conceder autoridade de cálculo.

## Etapa 2 — vínculo e cálculo

- Um efeito/raridade/linha exige vínculo explícito publicado. Sem vínculo, o motor com registro retorna pendência e mantém a base.
- O alvo informa escopo e campo, e o vínculo define operação, unidade e condição. Movimento, mira e ausência de mira não são sinônimos.
- “Dispersão total em movimento” não é automaticamente o campo incremental moving_dispersion. A Central exige escolha explícita, com unidade confirmada; nenhum cadastro inicial é inferido.
- O dropdown oferece campos reais ainda não configurados. Selecioná-los abre a definição da unidade e retorna à vinculação.
- Referências adicionais são opcionais. O histórico registra a ação estruturada automaticamente; permissões, revisões otimistas, publicação e releitura permanecem obrigatórias.
- A prova apresenta origem, raridade, destino no herói/arma, condição, conta e pendências. A comparação com Brain exige a mesma política de aplicação.

## Evidência recebida e limite da recuperação

A captura IMG_1167.png mostra a raridade Estelar das Botas da Specnaz do Slayer: −26% à dispersão de tiro da arma quando em movimento e +10 ao poder de perfuração da arma. O banco já contém esses números, mas perdeu o qualificador do primeiro texto. Outras raridades apresentam frases genéricas e ruído de OCR; o Imortal tem um valor zero suspeito. Sem captura de cada variante, o pacote não inventa números nem sobrescreve o catálogo em lote.

A inspeção inicial do registro encontrou zero definições e vínculos publicados. Ao ativar o comportamento obrigatório, equipamentos ainda não revisados deixam de alterar totais até que os vínculos sejam configurados e publicados. As pendências ficam na Central e na análise da build.

## Validação e implantação

Regressões automatizadas cobrem texto quebrado, condições diferentes, raridades, persistência da origem, vínculo alterado, registro vazio, destino por escopo, quatro operadores e paridade da prova. Executar Quality Gates e a publicação acoplada Site/Brain antes de considerar a produção atualizada. O contrato SQL existente preserva o JSON integral; esta correção não exige migration nem publica vínculos automaticamente.

A revisão visual autenticada da Central exige uma sessão administrativa válida. Não contornar MFA ou repetir a elevação rejeitada no trabalho anterior. A validação por testes não equivale a conferência visual autenticada.

Em 2026-09-07, após o CI completo da MR !69 passar, o usuário autorizou: “Aplique na main, verifico o visual lá”. A conferência visual deste pacote passa para o usuário em produção; a integração mantém os gates e o deploy acoplado Brain/Site. Não declarar a revisão visual concluída por esta autorização.
