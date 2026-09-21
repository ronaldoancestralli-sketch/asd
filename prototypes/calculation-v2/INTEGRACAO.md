# Substituição do motor atual

## Decisão de arquitetura

Manter o cadastro de identidade, mídia, heróis e equipamentos. Criar um contrato único de efeitos e uma função pura que calcula a composição inteira. O editor e a mesa importam essa mesma função. O cálculo acontece no navegador a cada ajuste, sem uma chamada ao Supabase para cada tecla ou troca de slot.

O servidor guarda o catálogo e sua revisão; ele não cria outro resultado concorrente. Caso uma rota de servidor precise calcular, deve executar o mesmo módulo e a mesma revisão de dados.

```
cadastros atuais → leitura e mapeamento explícito → catálogo revisado
                                                  ↓
seis slots + cenário + composição → motor novo → resultados + memória de cálculo
```

Não há interpretação de texto no caminho da conta. O texto original continua como evidência e descrição. Nenhum rascunho da Central anterior nem resultado do Brain ganha autoridade automática.

## Contrato pequeno, sem cadastro duplicado

**Atributo**: ID qualificado, nome, unidade, campo de origem exato e política matemática conhecida. `hero.health` e `weapon.health` seriam IDs distintos. Também são distintos um modificador de dispersão e a dispersão total em movimento.

**Efeito**: ID estável, dono (equipamento, habilidade ou conjunto), texto, destino, operação, condição e valores por raridade. `scope` informa quem recebe. O efeito de conjunto informa o limiar de peças; o de habilidade informa seu valor para o cenário escolhido. Se não há uma conta aplicável, usa o tipo informativo. Se deveria existir uma conta mas falta dado, permanece numérico pendente; não se converte em informativo só para limpar um aviso.

**Build**: herói, seis posições, raridade de cada item e condições. **Composição**: lista de builds identificadas. Um efeito de equipe registra de quem veio e quem recebeu. Não se somam arbitrariamente as vidas ou o DPS dos membros para criar uma pontuação inventada de equipe.

O esquema de persistência deve ter restrições de unicidade para `(effect_id, rarity_id)`, referência válida de destino e revisão otimista. O operador é único por efeito; não é compartilhado por índice. Exceções reais por raridade viram uma regra explicitamente diferenciada, não edição de texto escondida.

## Uso do núcleo já implementado

```js
import { calculateBuild, calculateTeam } from './engine.mjs';

const result = calculateBuild({ definitions, equipment, sets, build });
const team = calculateTeam({ definitions, equipment, sets, builds });
```

Entrada mínima demonstrativa:

```js
const definitions = [{
  id: 'hero.health', label: 'Vida', unit: 'pontos',
  policy: { id: 'additive-base-v1', reference: 'Fixture de teste' }
}];
const equipment = [{
  id: 'colete', name: 'Colete fictício',
  effects: [{
    id: 'colete-vida', kind: 'numeric', description: 'Aumenta a vida',
    target: 'hero.health', operation: 'flat', values: { comum: 100 },
    scope: 'self', ruleStatus: 'reviewed',
    source: { kind: 'fixture', reference: 'Exemplo, não é regra oficial' }
  }]
}];
const build = {
  id: 'membro-1', hero: { id: 'exemplo', base: { 'hero.health': 800 } },
  slots: [{ equipmentId: 'colete', rarity: 'comum' }, null, null, null, null, null],
  conditions: { moving: false, aiming: true }
};
// result.stats['hero.health'].final === 900
```

`operation: 'flat'` ou `'percent'` usa valores com sinal. `null` ou raridade ausente significa desconhecido, nunca zero. Habilidades e bônus de conjunto usam `amount`, em vez de `values`. `condition` é uma chave explícita; ausente significa sempre. Uma condição recebida como `null` fica pendente. Condições diferentes podem ser cadastradas por chave, mas sua definição precisa ser inequívoca. Esta versão suporta uma condição por efeito; condições compostas devem ser expandidas conscientemente, não traduzidas do texto.

Conjuntos:

```js
const sets = [{ id: 'conjunto', bonuses: [{
  id: 'duas-pecas', requiredPieces: 2,
  effects: [{
    id: 'conjunto-vida', kind: 'numeric', target: 'hero.health',
    operation: 'flat', amount: 50, scope: 'self', ruleStatus: 'reviewed',
    source: { kind: 'fixture', reference: 'Exemplo de conjunto' }
  }]
}] }];
// Cada item participante informa setId: 'conjunto'.
// Limiares atingidos aplicam uma vez por portador, sem contar peças de colegas.
```

## Uma única tela de trabalho

1. Selecionar um equipamento.
2. Escolher o efeito e seu destino; informar operação, condição e valores.
3. Ver o cálculo provisório imediatamente no herói e cenário selecionados.
4. Salvar a revisão, com confirmação de persistência separada do resultado matemático.

O controle normal não precisa de outra Central. Campos raros de alcance de equipe, origem, limites e política ficam nos detalhes. A política pertence ao atributo e não precisa ser repetida em cada equipamento. O texto fica uma vez ao lado dos efeitos; a tabela mantém as onze raridades.

O fluxo de ativação precisa validar a revisão exata. Mudar destino, operação, valor, condição, base ou política invalida o comprovante anterior. Uma simulação de rascunho pode executar em modo provisório e rotulado; ela não deve alterar a revisão que o público recebe. Não confiar em `ruleStatus` vindo do browser como autorização de produção. O servidor deve vincular a revisão confirmada aos dados efetivamente persistidos.

## Sequência para colocar em produção

### 1. Conferir o contrato e as primeiras regras

Começar com atributos cuja base e operação possam ser verificadas. No A.R.M., o valor persistido de carregador é conhecido; o vínculo e a mecânica precisam de confirmação independente. Alcance com mira permanece pendente até validar a base exata. Não usar `weapon_range` só porque parece próximo.

Definir a combinação de percentuais, arredondamento e limites de cada atributo. A política implementada é demonstrativa. Se o jogo usa `(base + fixos) × multiplicadores`, percentuais multiplicativos, prioridade, máximo ou substituição, implementar essa política com exemplos de referência. Não escolher uma regra apenas porque produz um número plausível.

### 2. Criar persistência nova e conversão revisável

Criar as tabelas/contrato em ambiente de teste, sem sobrescrever os atributos existentes. Copiar evidências e valores do cadastro atual; não importar interpretação do motor antigo. Produzir uma lista de diferenças para revisão antes de consolidar descrições.

Na auditoria atual, 17 dos 29 equipamentos tinham textos divergentes por posição. Isso é uma fila de revisão de dados, não um motivo para criar um motor mais inteligente. O Lendário vazio do A.R.M. continua vazio. Regras novas começam sem autorização pública.

Antes de salvar, validar números, unidades, IDs e estados de ausência. Um número sem descrição/destino não pode desaparecer por filtro. A confirmação de persistência deve comparar a revisão completa com a releitura do banco.

### 3. Ligar a mesa a uma única leitura

Carregar uma revisão consistente do catálogo. Mapear campos de base por nome exato. Validar slots permitidos, classe, herói e limites da composição antes do cálculo. Essas restrições ainda não estão no núcleo desta prova de conceito.

Usar o mesmo núcleo na prévia e na mesa; recalcular do zero após cada mudança. Se uma leitura falhar, não conservar cartões antigos como se fossem o estado atual. Aplicar uma mudança à interface somente se ela corresponde à seleção e revisão mais recentes.

### 4. Verificar o fluxo completo

Testar cadastro → salvar → reler → selecionar na mesa → mudar raridade → mudar condição → remover item → reabrir a build. Comparar cada passo com exemplos de resultado esperado, obtidos independentemente da própria implementação.

Conferir em desktop e celular. Confirmar que o resultado salvo usa a mesma versão do catálogo que foi testada. Registrar os casos sem base, com dados incompletos e regras ainda não confirmadas como pendentes no resultado público.

### 5. Substituir o caminho público

Após validação, apontar a mesa para o motor novo como única autoridade. Remover imports, gravações e telas redundantes do caminho público. Manter uma versão implantável anterior para reversão, sem executar motores concorrentes nem comparar um motor antigo incorreto como se fosse referência.

## Critério de conclusão

A reformulação estará concluída quando o editor persistir esse contrato, o catálogo real estiver revisado, a mesa e as composições usarem o mesmo núcleo e o fluxo autenticado tiver passado nos testes. Esta entrega já torna o núcleo e a experiência testáveis; não declara essa integração de produção como concluída.
