# Echo Brain V5 — Counter Knowledge (Shadow)

## Objetivo

Estruturar habilidades e passivas para que o Brain deduza counters por mecanismo, em vez de manter uma lista manual `A countera B`.

O estágio inicial é **Shadow/Admin only**. Nenhuma conclusão desta fase altera score público, composição pública ou versão Beta.

## Regra de autoridade

1. Texto bruto do jogo é evidência de origem, não fato semântico confirmado.
2. O interpretador pode criar propostas.
3. Uma proposta só participa do Counter Engine quando `review_status=confirmed`.
4. Fatos `unverified` ou `needs_recheck=true` são ignorados pelo cálculo padrão.
5. Counter é calculado nas duas direções e sempre mantém a cadeia causal.
6. Ausência de evidência não significa equilíbrio; deve resultar em `uncertain` quando a cobertura é insuficiente.
7. Revisão humana de counter é calibração semântica, nunca resultado competitivo de partida.

## Modelo de coleta por herói

### Habilidades principais

As quatro habilidades existentes continuam em `hero_skills`. Para cada habilidade, registrar/confirmar fatos semânticos derivados do texto verificado.

### Passivas

Cada passiva deve registrar:

- nome exibido no jogo;
- descrição literal ou transcrição fiel;
- tipo (`always_on`, `active_linked`, `conditional`, `aura`, `team`, `other`);
- gatilho;
- condição, se houver;
- duração/cooldown somente quando conhecidos;
- patch/versão;
- fonte;
- estado de verificação.

Não estimar número ausente.

### Fatos semânticos

Um fato possui papel:

- `capability`: o herói consegue produzir o mecanismo;
- `dependency`: parte relevante do kit depende desse mecanismo;
- `vulnerability`: o mecanismo é fraqueza explicitamente comprovada;
- `immunity`: o herói resiste/ignora o mecanismo.

Mecânicas iniciais incluem revelação, invisibilidade, silêncio, stun, slow, root, desarme, escudo, quebra de escudo, armadura, penetração, cura, anti-cura, mobilidade, alcance, tiro através de parede, visão, revive, dano em área, burst e dano ao longo do tempo.

## Exemplo causal

- Herói A: `capability=reveal` confirmado.
- Herói B: `dependency=invisibility` confirmada.
- Regra determinística: `reveal -> invisibility`.
- Resultado Shadow: pressão de counter A→B com explicação “Revelação reduz ou neutraliza a dependência de invisibilidade”.

A regra não afirma taxa de vitória.

## Coleta segura para teste

Para cada herói escolhido para o piloto:

1. cadastrar as quatro habilidades já conhecidas/confirmadas;
2. cadastrar todas as passivas observáveis, inclusive condicionais;
3. colar a descrição fiel no analisador;
4. revisar as sugestões;
5. confirmar apenas fatos que realmente estejam sustentados pelo texto/fonte;
6. marcar patch e `needs_recheck` quando a fonte não for suficiente;
7. comparar pares no laboratório Shadow;
8. registrar revisão humana quando o resultado estiver errado, incompleto ou surpreendente.

## Critério para sair de Shadow

Não publicar até existir cobertura suficiente do roster, revisão dos principais pares e ausência de regressões críticas. A futura liberação pública deverá ser tratada como evolução material do Brain e passar pela governança de versão pública.
