import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBuild, calculateTeam, POLICY_ID } from './engine.mjs';

// Fixtures sintéticas: estes valores e esta política não afirmam regras do jogo.
const fixtureSource = () => ({ kind: 'fixture', reference: 'Teste sintético; não é evidência do jogo.' });
const definition = (id = 'hero.health') => ({
  id, label: id, unit: 'pontos',
  policy: { id: POLICY_ID, reference: 'Política sintética do teste', rounding: 'none' },
});
const effect = (id = 'effect-one', overrides = {}) => ({
  id, kind: 'numeric', description: 'Exemplo', target: 'hero.health', scope: 'self',
  operation: 'flat', values: { comum: 10, divino: 25 },
  source: fixtureSource(), ruleStatus: 'reviewed', ...overrides,
});
const item = (id = 'item-one', overrides = {}) => ({ id, effects: [effect(`${id}-effect`)], ...overrides });
const slot = (equipmentId = 'item-one', rarity = 'comum') => ({ equipmentId, rarity });
const build = (id = 'member-one', overrides = {}) => ({
  id, hero: { id: 'hero-one', base: { 'hero.health': 100 } },
  slots: [slot(), null, null, null, null, null], conditions: {}, ...overrides,
});
const fixture = () => ({ definitions: [definition()], equipment: [item()], build: build() });
const errorsOf = result => result.errors.map(entry => entry.code);
const resultValue = (input, id = 'hero.health') => calculateBuild(input).stats[id].final;
const byMemberId = result => Object.fromEntries(result.members.map(member => [member.buildId, member]));
const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

test('aplica efeito exato e apresenta base, subtotal e contribuição', () => {
  const result = calculateBuild(fixture());
  assert.equal(result.status, 'calculated');
  assert.equal(result.stats['hero.health'].base, 100);
  assert.equal(result.stats['hero.health'].final, 110);
  assert.equal(result.stats['hero.health'].knownSubtotal, 110);
  assert.equal(result.effects[0].delta, 10);
  assert.equal(result.effects[0].sourceBuildId, 'member-one');
  assert.equal(result.effects[0].recipientBuildId, 'member-one');
});

test('combinação de fixos e percentuais usa a política explícita e ignora a ordem dos seis slots', () => {
  const input = fixture();
  input.equipment = [
    item('a', { effects: [effect('a-effect', { values: { comum: 100 } })] }),
    item('b', { effects: [effect('b-effect', { operation: 'percent', values: { comum: 10 } })] }),
    item('c', { effects: [effect('c-effect', { values: { comum: -20 } })] }),
    item('d', { effects: [effect('d-effect', { operation: 'percent', values: { comum: -5 } })] }),
    item('e', { effects: [effect('e-effect', { values: { comum: 3 } })] }),
    item('f', { effects: [effect('f-effect', { values: { comum: 0 } })] }),
  ];
  input.build.slots = input.equipment.map(entry => slot(entry.id));
  const expected = calculateBuild(input);
  assert.equal(expected.stats['hero.health'].final, 188);
  for (let offset = 0; offset < 6; offset++) {
    const rotated = [...input.build.slots.slice(offset), ...input.build.slots.slice(0, offset)];
    for (const slots of [rotated, rotated.toReversed()]) {
      assert.deepEqual(calculateBuild({ ...input, build: { ...input.build, slots } }), expected);
    }
  }
});

test('recalcular após retirar equipamento retorna à base sem guardar total anterior', () => {
  const input = fixture();
  assert.equal(resultValue(input), 110);
  input.build.slots[0] = null;
  const empty = calculateBuild(input);
  assert.equal(empty.stats['hero.health'].final, 100);
  assert.equal(empty.stats['hero.health'].status, 'unchanged');
  assert.deepEqual(empty.effects, []);
  input.build.slots[0] = slot();
  assert.equal(resultValue(input), 110);
});

test('zero explícito é válido; null ou raridade ausente não viram zero', () => {
  const input = fixture();
  input.equipment[0].effects[0].values.comum = 0;
  let result = calculateBuild(input);
  assert.equal(result.status, 'calculated');
  assert.equal(result.effects[0].delta, 0);
  assert.equal(result.stats['hero.health'].final, 100);
  for (const values of [{ comum: null }, {}]) {
    input.equipment[0].effects[0].values = values;
    result = calculateBuild(input);
    assert.equal(result.status, 'pending');
    assert.equal(result.effects[0].code, 'RARITY_VALUE_UNKNOWN');
    assert.equal(result.stats['hero.health'].final, null);
    assert.equal(result.stats['hero.health'].knownSubtotal, 100);
  }
});

test('base zero é conhecida; base null ou ausente impede o valor final', () => {
  const input = fixture();
  input.build.hero.base['hero.health'] = 0;
  assert.equal(resultValue(input), 10);
  for (const base of [{ 'hero.health': null }, {}]) {
    input.build.hero.base = base;
    const result = calculateBuild(input);
    assert.equal(result.status, 'pending');
    assert.equal(result.stats['hero.health'].final, null);
    assert.equal(result.effects[0].code, 'BASE_UNKNOWN');
    assert.equal(result.summary.applied, 0);
  }
});

test('destino desconhecido é inválido mesmo quando a descrição parece um atributo válido', () => {
  const input = fixture();
  input.equipment[0].effects[0].target = 'hero.healt';
  input.equipment[0].effects[0].description = 'hero.health / Vida do herói +10';
  const result = calculateBuild(input);
  assert.equal(result.status, 'invalid');
  assert.ok(errorsOf(result).includes('UNKNOWN_TARGET'));
  assert.equal(Object.keys(result.stats).length, 0);
  assert.equal(result.effects.length, 0);
});

test('base aponta somente para atributos existentes', () => {
  const input = fixture();
  input.build.hero.base['weapon.unknown'] = 1;
  const result = calculateBuild(input);
  assert.ok(errorsOf(result).includes('UNKNOWN_BASE_STAT'));
});

test('política ausente, desconhecida, sem referência ou com arredondamento não suportado é pendência', () => {
  const input = fixture();
  for (const policy of [undefined, null, {}, { id: POLICY_ID },
    { id: 'other-policy', reference: 'fixture' },
    { id: POLICY_ID, reference: 'fixture', rounding: 'nearest' }]) {
    input.definitions[0].policy = policy;
    const result = calculateBuild(input);
    assert.equal(result.status, 'pending');
    assert.equal(result.stats['hero.health'].final, null);
    assert.equal(result.stats['hero.health'].knownSubtotal, null);
    assert.equal(result.effects[0].code, 'POLICY_UNKNOWN');
  }
});

test('uma base sem efeitos pode ser exibida sem exigir política de combinação', () => {
  const input = fixture();
  input.build.slots.fill(null);
  delete input.definitions[0].policy;
  assert.equal(resultValue(input), 100);
});

test('efeito numérico exige origem da regra, mesmo que esteja marcado revisado', () => {
  for (const source of [undefined, null, {}, { kind: 'fixture' }, { reference: 'fixture' }]) {
    const input = fixture();
    input.equipment[0].effects[0].source = source;
    const result = calculateBuild(input);
    assert.equal(result.status, 'invalid');
    assert.ok(errorsOf(result).includes('MISSING_EFFECT_SOURCE'));
  }
});

test('regra em rascunho ou sem revisão mantém resultado final pendente', () => {
  for (const ruleStatus of ['draft', undefined]) {
    const input = fixture();
    input.equipment[0].effects[0].ruleStatus = ruleStatus;
    const result = calculateBuild(input);
    assert.equal(result.status, 'pending');
    assert.equal(result.effects[0].code, 'RULE_NOT_REVIEWED');
    assert.equal(result.stats['hero.health'].final, null);
    assert.equal(result.summary.applied, 0);
  }
});

test('regra em rascunho não libera resultado final usando sua própria condição falsa', () => {
  const input = fixture();
  Object.assign(input.equipment[0].effects[0], { ruleStatus: 'draft', condition: 'moving' });
  input.build.conditions.moving = false;
  const result = calculateBuild(input);
  assert.equal(result.status, 'pending');
  assert.equal(result.stats['hero.health'].final, null);
  assert.equal(result.effects[0].code, 'RULE_NOT_REVIEWED');
  assert.equal(result.summary.inactive, 0);
});

test('uma pendência não esconde contribuições conhecidas nem libera subtotal como final', () => {
  const input = fixture();
  input.equipment[0].effects.push(effect('pending-effect', { values: { comum: null } }));
  const result = calculateBuild(input);
  assert.equal(result.stats['hero.health'].final, null);
  assert.equal(result.stats['hero.health'].knownSubtotal, 110);
  assert.equal(result.summary.applied, 1);
  assert.equal(result.summary.pending, 1);
});

test('condição desconhecida é pendência; falsa é inativa; verdadeira aplica', () => {
  const input = fixture();
  input.equipment[0].effects[0].condition = 'aiming';
  let result = calculateBuild(input);
  assert.equal(result.effects[0].code, 'CONDITION_UNKNOWN');
  assert.equal(result.stats['hero.health'].final, null);
  input.build.conditions.aiming = false;
  result = calculateBuild(input);
  assert.equal(result.status, 'calculated');
  assert.equal(result.effects[0].status, 'inactive');
  assert.equal(result.stats['hero.health'].final, 100);
  input.build.conditions.aiming = true;
  assert.equal(resultValue(input), 110);
});

test('condição falsa não exige base de composição para efeito inativo', () => {
  const input = fixture();
  delete input.definitions[0].policy;
  input.equipment[0].effects[0].condition = 'aiming';
  input.build.conditions.aiming = false;
  assert.equal(resultValue(input), 100);
});

test('dispersão parada, em movimento e com mira têm destinos independentes', () => {
  const ids = ['weapon.spread.stationary', 'weapon.spread.moving', 'weapon.spread.aimed'];
  const input = fixture();
  input.definitions = ids.map(definition);
  input.build.hero.base = Object.fromEntries(ids.map(id => [id, 100]));
  input.equipment[0].effects = [
    effect('moving', { target: ids[1], values: { comum: -5 } }),
    effect('aimed', { target: ids[2], values: { comum: -15 } }),
  ];
  const result = calculateBuild(input);
  assert.deepEqual(ids.map(id => result.stats[id].final), [100, 95, 85]);
  assert.equal(result.stats[ids[0]].trace.length, 0);
});

test('efeito de equipe condicionado no portador usa somente a condição da origem', () => {
  const input = fixture();
  Object.assign(input.equipment[0].effects[0], { scope: 'team', condition: 'aiming', evaluatedOn: 'source' });
  const team = { ...input, builds: [build('a', { conditions: { aiming: true } }), build('b', { slots: Array(6).fill(null), conditions: { aiming: false } })] };
  let members = byMemberId(calculateTeam(team));
  assert.equal(members.a.stats['hero.health'].final, 110);
  assert.equal(members.b.stats['hero.health'].final, 110);
  assert.equal(members.b.effects[0].sourceBuildId, 'a');
  assert.equal(members.b.effects[0].recipientBuildId, 'b');
  assert.equal(members.b.effects[0].condition.buildId, 'a');
  team.builds[0].conditions.aiming = false;
  members = byMemberId(calculateTeam(team));
  assert.equal(members.a.stats['hero.health'].final, 100);
  assert.equal(members.b.stats['hero.health'].final, 100);
});

test('efeito de equipe condicionado no receptor avalia cada receptor separadamente', () => {
  const input = fixture();
  Object.assign(input.equipment[0].effects[0], { scope: 'team', condition: 'aiming', evaluatedOn: 'recipient' });
  const team = { ...input, builds: [build('a', { conditions: { aiming: true } }), build('b', { slots: Array(6).fill(null), conditions: { aiming: false } }), build('c', { slots: Array(6).fill(null) })] };
  const members = byMemberId(calculateTeam(team));
  assert.equal(members.a.stats['hero.health'].final, 110);
  assert.equal(members.b.stats['hero.health'].final, 100);
  assert.equal(members.c.stats['hero.health'].final, null);
  assert.equal(members.c.effects[0].code, 'CONDITION_UNKNOWN');
  assert.equal(members.c.effects[0].condition.buildId, 'c');
});

test('efeito condicional de equipe sem origem declarada é inválido', () => {
  const input = fixture();
  Object.assign(input.equipment[0].effects[0], { scope: 'team', condition: 'aiming' });
  const result = calculateBuild(input);
  assert.equal(result.status, 'invalid');
  assert.ok(errorsOf(result).includes('CONDITION_ORIGIN_REQUIRED'));
});

test('efeito pessoal não vaza para colegas e a ordem da equipe não altera resultados', () => {
  const input = fixture();
  const team = { ...input, builds: [build('a'), build('b', { slots: Array(6).fill(null) })] };
  let members = byMemberId(calculateTeam(team));
  assert.equal(members.a.stats['hero.health'].final, 110);
  assert.equal(members.b.stats['hero.health'].final, 100);
  input.equipment[0].effects[0].scope = 'team';
  team.builds.push(build('c'));
  members = byMemberId(calculateTeam(team));
  const reversed = byMemberId(calculateTeam({ ...team, builds: team.builds.toReversed() }));
  assert.deepEqual(reversed, members);
  assert.equal(members.a.stats['hero.health'].final, 120);
  assert.equal(members.b.stats['hero.health'].final, 120);
  assert.equal(members.c.stats['hero.health'].final, 120);
  assert.equal(new Set(members.b.effects.map(entry => entry.id)).size, 2);
});

test('conjuntos ativam cada limiar 2/4/6 uma única vez por portador', () => {
  const input = fixture();
  input.equipment = Array.from({ length: 6 }, (_, index) => item(`piece-${index}`, { setId: 'set-one', effects: [effect(`piece-${index}-effect`, { values: { comum: 0 } })] }));
  input.sets = [{ id: 'set-one', bonuses: [2, 4, 6].map(pieces => ({
    id: `bonus-${pieces}`, requiredPieces: pieces,
    effects: [effect(`set-effect-${pieces}`, { amount: pieces, values: undefined })],
  })) }];
  for (const bonus of input.sets[0].bonuses) delete bonus.effects[0].values;
  for (const [count, expectedBonus, expectedTraceCount] of [[0, 0, 0], [1, 0, 0], [2, 2, 1], [3, 2, 1], [4, 6, 2], [5, 6, 2], [6, 12, 3]]) {
    input.build.slots = Array.from({ length: 6 }, (_, index) => index < count ? slot(`piece-${index}`) : null);
    const result = calculateBuild(input);
    assert.equal(result.stats['hero.health'].final, 100 + expectedBonus);
    const setTraces = result.effects.filter(entry => entry.sourceKind === 'set');
    assert.equal(setTraces.length, expectedTraceCount);
    assert.ok(setTraces.every(entry => entry.equippedPieces === count));
    assert.equal(new Set(setTraces.map(entry => entry.bonusId)).size, expectedTraceCount);
  }
});

test('conjuntos de um membro não contam peças equipadas por outro membro', () => {
  const input = fixture();
  input.equipment[0].setId = 'set-one';
  const setEffect = effect('set-effect', { amount: 20 });
  delete setEffect.values;
  input.sets = [{ id: 'set-one', bonuses: [{ id: 'two', requiredPieces: 2, effects: [setEffect] }] }];
  const result = calculateTeam({ ...input, builds: [build('a'), build('b')] });
  assert.ok(result.members.every(member => member.stats['hero.health'].final === 110));
  assert.ok(result.members.every(member => member.effects.every(entry => entry.sourceKind !== 'set')));
});

test('habilidade/passiva numérica usa valor próprio e condição explícita', () => {
  const input = fixture();
  input.build.slots.fill(null);
  const ability = effect('hero-passive', { amount: 30, condition: 'ability-active' });
  delete ability.values;
  input.build.hero.effects = [ability];
  input.build.conditions['ability-active'] = true;
  const result = calculateBuild(input);
  assert.equal(result.stats['hero.health'].final, 130);
  assert.equal(result.effects[0].sourceKind, 'hero');
  assert.equal(result.effects[0].sourceId, 'hero-one');
  assert.equal(result.effects[0].rarity, null);
});

test('habilidade não recebe raridade implícita nem transforma amount null em zero', () => {
  const input = fixture();
  input.build.slots.fill(null);
  input.build.hero.effects = [effect('hero-passive')];
  assert.ok(errorsOf(calculateBuild(input)).includes('RARITY_CONTEXT_UNAVAILABLE'));
  delete input.build.hero.effects[0].values;
  input.build.hero.effects[0].amount = null;
  const result = calculateBuild(input);
  assert.equal(result.status, 'pending');
  assert.equal(result.effects[0].code, 'EFFECT_AMOUNT_UNKNOWN');
  assert.equal(result.stats['hero.health'].final, null);
});

test('efeito apenas informativo fica visível sem fabricar alteração numérica', () => {
  const input = fixture();
  input.equipment[0].effects = [{ id: 'info', kind: 'informational', scope: 'self', description: 'Mecânica sem valor numérico conhecido.' }];
  const result = calculateBuild(input);
  assert.equal(result.stats['hero.health'].final, 100);
  assert.equal(result.summary.applied, 0);
  assert.equal(result.summary.informational, 1);
  assert.equal(result.notices[0].description, 'Mecânica sem valor numérico conhecido.');
  input.equipment[0].effects[0].target = 'hero.health';
  assert.ok(errorsOf(calculateBuild(input)).includes('INFORMATIONAL_WITH_CALCULATION'));
});

test('valores JSON malformados são rejeitados sem exceção nem falso resultado calculado', () => {
  for (const input of [null, [], '', 123, {}, { definitions: [], equipment: [], build: null }]) {
    let result;
    assert.doesNotThrow(() => { result = calculateBuild(input); });
    assert.equal(result.status, 'invalid');
  }
  for (const badValue of ['10', '', false, true, [], {}, NaN, Infinity, -Infinity]) {
    const input = fixture();
    input.equipment[0].effects[0].values.comum = badValue;
    const result = calculateBuild(input);
    assert.equal(result.status, 'invalid');
    assert.ok(errorsOf(result).includes('INVALID_EFFECT_VALUE'));
  }
});

test('valores malformados em base, condição, operação e quantidade ambígua são rejeitados', () => {
  for (const [mutate, code] of [
    [input => { input.build.hero.base['hero.health'] = '100'; }, 'INVALID_BASE_VALUE'],
    [input => { input.build.conditions.aiming = 'true'; }, 'INVALID_CONDITION_VALUE'],
    [input => { input.equipment[0].effects[0].operation = 'multiply'; }, 'INVALID_OPERATION'],
    [input => { input.equipment[0].effects[0].amount = 1; }, 'AMBIGUOUS_EFFECT_AMOUNT'],
    [input => { delete input.equipment[0].effects[0].values; }, 'AMBIGUOUS_EFFECT_AMOUNT'],
  ]) {
    const input = fixture(); mutate(input);
    const result = calculateBuild(input);
    assert.equal(result.status, 'invalid');
    assert.ok(errorsOf(result).includes(code));
  }
});

test('overflow numérico invalida a conta e não expõe Infinity como valor final', () => {
  const input = fixture();
  input.build.hero.base['hero.health'] = Number.MAX_VALUE;
  input.equipment[0].effects[0].values.comum = Number.MAX_VALUE;
  const result = calculateBuild(input);
  assert.equal(result.status, 'invalid');
  assert.ok(errorsOf(result).includes('NUMERIC_OVERFLOW'));
  assert.equal(result.stats['hero.health'].final, null);
  assert.equal(result.stats['hero.health'].knownSubtotal, null);
  assert.equal(result.effects[0].status, 'invalid');
  assert.equal(result.effects[0].delta, null);
});

test('duplicatas de equipamento, atributo, efeito e seleção são rejeitadas', () => {
  for (const [mutate, code] of [
    [input => input.definitions.push(structuredClone(input.definitions[0])), 'DUPLICATE_STAT_ID'],
    [input => input.equipment.push(structuredClone(input.equipment[0])), 'DUPLICATE_EQUIPMENT_ID'],
    [input => input.equipment[0].effects.push(structuredClone(input.equipment[0].effects[0])), 'DUPLICATE_EFFECT_ID'],
    [input => { input.build.slots[1] = slot(); }, 'DUPLICATE_EQUIPMENT'],
  ]) {
    const input = fixture(); mutate(input);
    const result = calculateBuild(input);
    assert.equal(result.status, 'invalid');
    assert.ok(errorsOf(result).includes(code));
  }
  const input = fixture();
  const team = calculateTeam({ ...input, builds: [build('same'), build('same')] });
  assert.equal(team.status, 'invalid');
  assert.ok(errorsOf(team).includes('DUPLICATE_BUILD_ID'));
});

test('seis posições são obrigatórias e referências inexistentes são rejeitadas', () => {
  const input = fixture();
  input.build.slots = [slot()];
  assert.ok(errorsOf(calculateBuild(input)).includes('INVALID_SLOT_COUNT'));
  input.build.slots = [slot('missing'), null, null, null, null, null];
  assert.ok(errorsOf(calculateBuild(input)).includes('UNKNOWN_EQUIPMENT'));
  input.build.slots[0] = slot();
  input.equipment[0].setId = 'missing';
  assert.ok(errorsOf(calculateBuild(input)).includes('UNKNOWN_SET'));
});

test('entrada profundamente congelada permanece idêntica após cálculos repetidos', () => {
  const input = fixture();
  const before = structuredClone(input);
  deepFreeze(input);
  const first = calculateBuild(input);
  const second = calculateBuild(input);
  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  const team = deepFreeze({ ...input, builds: [build('a'), build('b')] });
  const teamBefore = structuredClone(team);
  calculateTeam(team);
  assert.deepEqual(team, teamBefore);
});

test('ordem de armazenamento dos efeitos não muda o resultado nem a identificação das contribuições', () => {
  const input = fixture();
  input.equipment[0].effects = [
    effect('c', { values: { comum: 0.3 } }),
    effect('a', { values: { comum: 0.1 } }),
    effect('b', { operation: 'percent', values: { comum: 0.2 } }),
  ];
  const expected = calculateBuild(input);
  input.equipment[0].effects.reverse();
  input.build.slots.reverse();
  assert.deepEqual(calculateBuild(input), expected);
  assert.deepEqual(expected.effects.map(entry => entry.effectId), ['a', 'b', 'c']);
});

test('soma em ponto flutuante permanece determinística quando mudam as posições dos itens', () => {
  const input = fixture();
  input.equipment = [
    item('large', { effects: [effect('a', { values: { comum: 1e16 } })] }),
    item('small', { effects: [effect('b', { values: { comum: 1 } })] }),
    item('negative', { effects: [effect('c', { values: { comum: -1e16 } })] }),
  ];
  input.build.slots = [slot('large'), slot('small'), slot('negative'), null, null, null];
  const expected = calculateBuild(input);
  // Este teste exige determinismo de execução; não afirma aritmética decimal exata.
  for (const order of [
    ['negative', 'small', 'large'], ['small', 'large', 'negative'], ['large', 'negative', 'small'],
  ]) {
    input.build.slots = [...order.map(id => slot(id)), null, null, null];
    assert.deepEqual(calculateBuild(input), expected);
  }
});

test('mesmo herói em dois membros preserva identidade das passivas mesmo com lista reordenada', () => {
  const input = fixture();
  const passiveA = effect('passive-a', { amount: 2 }); delete passiveA.values;
  const passiveB = effect('passive-b', { amount: 3 }); delete passiveB.values;
  const heroA = { id: 'hero-one', base: { 'hero.health': 100 }, effects: [passiveA, passiveB] };
  const heroB = { id: 'hero-one', base: { 'hero.health': 100 }, effects: [passiveB, passiveA] };
  const team = { ...input, builds: [
    build('a', { hero: heroA, slots: Array(6).fill(null) }),
    build('b', { hero: heroB, slots: Array(6).fill(null) }),
  ] };
  const result = calculateTeam(team);
  assert.equal(result.status, 'calculated');
  assert.equal(result.members[0].stats['hero.health'].final, 105);
  assert.equal(result.members[1].stats['hero.health'].final, 105);
});
