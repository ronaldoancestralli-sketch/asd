# Echo Arena — novo motor de cálculo

Esta é uma implementação nova e independente do motor, Brain e Centrais existentes. Inclui um núcleo executável, testes e uma demonstração de editor + mesa de builds. **Ainda não substitui o cálculo do site publicado.**

## O funcionamento proposto

O administrador escolhe o atributo exato que um efeito altera, a operação e a condição. Escreve a descrição uma vez e preenche somente os valores de cada raridade. A mesma função calcula o teste do editor, os seis equipamentos de um herói e os membros da composição.

Um novo equipamento usa esse cadastro. Ele não exige aliases de texto, interpretação por IA, fórmulas escritas pelo administrador nem uma segunda configuração em outra Central.

O resultado de cada atributo tem três elementos: **base, alterações e resultado final**. Cada alteração identifica o efeito e o herói que a originou. Quando há informação faltando, o resultado final fica `null`; um subtotal conhecido, quando disponível, aparece com nome próprio e nunca como total confirmado.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `engine.mjs` | Validar entradas, selecionar condições, aplicar efeitos e explicar resultados. Sem acesso ao DOM, rede ou banco. |
| `engine.test.mjs` | Verificações independentes com dados fictícios. |
| `index.html`, `demo.css`, `demo.mjs` | Editor de efeitos e mesa de builds usando o mesmo núcleo. |
| `INTEGRACAO.md` | Contrato de dados e sequência para substituir o sistema atual. |

## O que já funciona

- Seis posições por herói, vazias ou preenchidas, sem acumular um resultado anterior.
- Efeitos pessoais, efeitos de equipe e condição avaliada explicitamente no portador ou no destinatário.
- Habilidades/passivas e bônus de conjunto por quantidade de peças usando o mesmo formato de efeito.
- Destinos distintos para atributos semelhantes: dispersão parada, em movimento e com mira podem coexistir sem se misturar.
- IDs estáveis: descrição, posição na lista e posição do slot não definem a identidade do efeito.
- Valor ausente diferente de zero. Número inválido, destino inexistente, duplicata e overflow não produzem sucesso.
- Efeito em rascunho não pode autorizar nem descartar uma alteração, mesmo se sua própria condição estiver falsa.
- Execução determinística, sem mutação dos dados recebidos.

## Política matemática da demonstração

O núcleo reconhece a política explícita `additive-base-v1`:

```
resultado = base + soma dos valores fixos + base × soma dos percentuais / 100
```

Isso faz a ordem dos slots ser irrelevante. A política requer uma referência, não é escolhida a partir da descrição do item e **não está confirmada como regra do jogo**. Se a regra real for diferente, deve ganhar uma implementação pequena e testes próprios. Uma política ausente ou não suportada produz pendência; não há fallback.

O núcleo não arredonda nem impõe limites matemáticos que não foram informados. Nesta versão, somente `rounding: 'none'` é aceito. Não se deve publicar cálculo de carregador percentual, limites máximos ou redução até zero sem primeiro confirmar e implementar essas regras. É usado Number do JavaScript; os testes de ordenação verificam determinismo, não aritmética decimal exata.

## Origem dos dados da demonstração

Bases de Slayer, Bastion e Freddie consultadas diretamente em `hero_complete_base_stats`, projeto Supabase `nqklhsfaqpbjqmfzjzxk`, em 14/09/2026. São valores do cadastro, não uma certificação dos dados oficiais do jogo.

Valores do A.R.M. Implante Sombrio consultados em `equipment_variants`: duas linhas nas dez raridades preenchidas; Lendário vazio. Os vínculos usados na demonstração são hipotéticos e identificados como teste. Os demais itens — Colete, Botas, Estabilizador, Emissor e Sinalizador — são fictícios.

`weapon_range`, `weapon_spread` e `moving_spread_modifier` não foram transformados por semelhança em alcance com mira ou dispersão total em movimento. As bases desses destinos ficam desconhecidas. Assim, a demonstração mostra o bloqueio real de um campo sem base validada.

O seletor “Confirmado para teste” só controla a demonstração em memória. Não assina, publica ou comprova uma regra oficial. A aprovação de produção deve se referir à revisão exata do cadastro, conforme `INTEGRACAO.md`.

## Executar

Requer Node.js moderno com `node:test` e `structuredClone` (verificado com Node 24; CI proposta usa Node 22).

```
node --test engine.test.mjs
python -m http.server 8771 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:8771/index.html`. A demonstração não faz chamadas de rede nem grava dados. Recarregar restaura o estado inicial.

## Verificação e limites

34 testes do núcleo passaram. Na interface, foram verificados: carregador 5 + 1 = 6; Lendário vazio como pendência; bônus fictício de +10% de vida aplicado a três membros; edição de +1 para +4 alterando a prévia e a build para 9.

A revisão encontrou e corrigiu dois problemas antes desta entrega: condição falsa de um rascunho liberava resultado; reordenar as passivas do mesmo herói em duas builds gerava conflito de identidade.

Teste visual em tela pequena permanece pendente: a ferramenta de navegador foi bloqueada pela revisão automática por limite de uso. Nenhuma mudança foi realizada no banco ou no site publicado.

Esta versão calcula atributos de um cenário. DPS, tempo para eliminar, eventos temporais, acertos, armadura inimiga, efeitos de habilidade por nível, chance e duração não são inferidos. Para incluí-los, é necessário definir suas entradas e regras verificáveis. As restrições de classe/herói/posição real dos equipamentos também precisam entrar no adaptador antes da integração pública. O tamanho e a regra de repetição de heróis da composição não foram presumidos; a tela usa três membros de demonstração.
