import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateBuild, POLICY_ID } from '../js/calculation-v2-engine.js';
import {
  clearCalculationCatalogV2Cache,
  loadCalculationCatalogV2,
  normalizeCalculationCatalogV2,
} from '../js/calculation-v2-client.js';
import {
  analyzeBuildV2,
  adaptCalculationV2Result,
  baseFromHeroCompleteStats,
  createCalculationV2BuildInput,
  effectRowsForEquipment,
  loadCalculationDataV2,
} from '../js/calculation-v2-build-adapter.js';
import {
  formatCalculationValue,
  renderCalculationDetailsV2,
} from '../js/calculation-v2-view.js';

const policy = { id: POLICY_ID, reference: 'calculation-policy/additive-base-v1', rounding: 'none' };

function rawCatalog({ publication = true, effects } = {}) {
  return {
    contract: 'echo-calculation-catalog/v2',
    catalogRevision: 'catalog-revision-1',
    generatedAt: '2026-09-15T12:00:00Z',
    policy: { id: POLICY_ID },
    definitions: [
      { id: 'hero.health', label: 'Vida', scope: 'hero', sourceKey: 'health', unit: 'pontos', direction: 'higher', policy },
      { id: 'weapon.magazine_size', label: 'Carregador', scope: 'weapon', sourceKey: 'magazine_size', unit: 'tiros', direction: 'higher', policy },
      { id: 'weapon.range', label: 'Alcance', scope: 'weapon', sourceKey: 'weapon_range', unit: 'm', direction: 'higher', policy },
    ],
    conditions: [
      { id: 'moving', label: 'Em movimento' },
    ],
    rarities: [
      { id: 'rarity-common', slug: 'comum', name: 'Comum', rank: 1 },
    ],
    equipment: [{
      id: 'equipment-one',
      name: 'Módulo preciso',
      publication: publication ? {
        id: 41, workspaceRevision: 4, fingerprint: 'a'.repeat(64), publishedAt: '2026-09-15T11:00:00Z',
      } : null,
      effects: effects ?? [{
        id: 'effect-magazine',
        kind: 'numeric',
        description: 'Mesmo que este texto diga vida, o destino explícito é o carregador.',
        target: 'weapon.magazine_size',
        operation: 'flat',
        scope: 'self',
        condition: 'always',
        conditionExpected: null,
        evaluatedOn: 'source',
        source: { kind: 'official', reference: 'developer-table-1' },
        values: { comum: 2 },
      }],
    }],
  };
}

const heroBaseRow = {
  hero_id: 'hero-one',
  hero_stats: { health: 900, magazine_size: 999 },
  weapon_stats: { health: 111, magazine_size: 5, aimed_weapon_range: 430 },
};

function normalized(options) {
  return normalizeCalculationCatalogV2(rawCatalog(options));
}

function sixSlots(first = null) {
  return [first, null, null, null, null, null];
}

function inputFor(catalog, first = { equipmentId: 'equipment-one', rarity: 'comum' }, conditions = {}) {
  return createCalculationV2BuildInput({
    catalog,
    heroBaseRow,
    hero: { id: 'hero-one', name: 'Hero One' },
    slots: sixSlots(first),
    conditions,
  });
}

test('base usa somente scope/sourceKey e o texto do efeito nunca escolhe o destino', () => {
  const catalog = normalized();
  assert.deepEqual({ ...baseFromHeroCompleteStats(catalog, heroBaseRow) }, {
    'hero.health': 900,
    'weapon.magazine_size': 5,
    'weapon.range': null,
  });
  const result = calculateBuild(inputFor(catalog));
  assert.equal(result.status, 'calculated');
  assert.equal(result.stats['hero.health'].final, 900);
  assert.equal(result.stats['weapon.magazine_size'].final, 7);
  assert.equal(result.effects[0].target, 'weapon.magazine_size');
});

test('base ausente e sem efeito relacionado permanece indisponível sem bloquear a build', () => {
  const catalog = normalized();
  const result = calculateBuild(inputFor(catalog));
  assert.equal(result.status, 'calculated');
  assert.equal(result.stats['weapon.range'].status, 'unavailable');
  assert.equal(result.stats['weapon.range'].base, null);
  assert.equal(result.stats['weapon.range'].final, null);
});

test('null de raridade nunca vira zero nem libera total falso', () => {
  const raw = rawCatalog();
  raw.equipment[0].effects[0].values.comum = null;
  const catalog = normalizeCalculationCatalogV2(raw);
  const result = calculateBuild(inputFor(catalog));
  assert.equal(result.status, 'pending');
  assert.equal(result.effects[0].code, 'RARITY_VALUE_UNKNOWN');
  assert.equal(result.effects[0].amount, null);
  assert.equal(result.stats['weapon.magazine_size'].final, null);
  assert.equal(result.stats['weapon.magazine_size'].knownSubtotal, 5);
});

test('equipamento sem publicação vira pendência explícita e não reutiliza atributos legados', () => {
  const catalog = normalized({ publication: false });
  assert.equal(catalog.equipment[0].effects.length, 0);
  const result = calculateBuild(inputFor(catalog));
  assert.equal(result.status, 'pending');
  assert.equal(result.effects[0].code, 'EFFECTS_NOT_PUBLISHED');
  assert.equal(result.summary.applied, 0);
  assert.equal(result.stats['hero.health'].final, 900);
  assert.equal(result.stats['hero.health'].knownSubtotal, 900);
  assert.equal(result.stats['weapon.magazine_size'].final, 5);
  assert.equal(result.stats['weapon.magazine_size'].knownSubtotal, 5);
});

test('equipamento selecionado ausente do catálogo não produz falso positivo', () => {
  const catalog = normalized();
  const result = calculateBuild(inputFor(catalog, { equipmentId: 'not-published', rarity: 'comum' }));
  assert.equal(result.status, 'pending');
  assert.equal(result.effects[0].code, 'EQUIPMENT_NOT_PUBLISHED');
  assert.equal(result.summary.applied, 0);
});

test('efeito em rascunho continua pendente mesmo quando a condição atual não corresponde', () => {
  const catalog = normalized();
  const effect = catalog.equipment[0].effects[0];
  effect.publicationStatus = 'draft';
  effect.condition = 'moving';
  effect.conditionExpected = true;
  const result = calculateBuild(inputFor(catalog, undefined, { moving: false }));
  assert.equal(result.status, 'pending');
  assert.equal(result.effects[0].code, 'RULE_NOT_PUBLISHED');
  assert.equal(result.summary.inactive, 0);
});

test('moving true e stationary moving=false são condições distintas e explícitas', () => {
  const raw = rawCatalog({ effects: [
    {
      id: 'moving-effect', kind: 'numeric', description: 'Durante movimento',
      target: 'weapon.magazine_size', operation: 'flat', scope: 'self',
      condition: 'moving', conditionExpected: true, evaluatedOn: 'source',
      source: { kind: 'official', reference: 'source-moving' }, values: { comum: 2 },
    },
    {
      id: 'stationary-effect', kind: 'numeric', description: 'Enquanto parado',
      target: 'weapon.magazine_size', operation: 'flat', scope: 'self',
      condition: 'moving', conditionExpected: false, evaluatedOn: 'source',
      source: { kind: 'official', reference: 'source-stationary' }, values: { comum: 3 },
    },
  ] });
  const catalog = normalizeCalculationCatalogV2(raw);

  let result = calculateBuild(inputFor(catalog, undefined, { moving: true }));
  assert.equal(result.stats['weapon.magazine_size'].final, 7);
  assert.deepEqual(result.effects.map(effect => effect.status), ['applied', 'inactive']);

  result = calculateBuild(inputFor(catalog, undefined, { moving: false }));
  assert.equal(result.stats['weapon.magazine_size'].final, 8);
  assert.deepEqual(result.effects.map(effect => effect.status), ['inactive', 'applied']);

  result = calculateBuild(inputFor(catalog));
  assert.equal(result.status, 'pending');
  assert.equal(result.stats['weapon.magazine_size'].final, null);
  assert.ok(result.effects.every(effect => effect.code === 'CONDITION_UNKNOWN'));
});

test('efeito informativo fica visível e efeito unresolved mantém a build pendente', () => {
  const catalog = normalized({ effects: [
    {
      id: 'info-effect', kind: 'informational', description: 'Mecânica conhecida sem número.',
      scope: 'self', condition: 'always', conditionExpected: null, evaluatedOn: 'source',
    },
    {
      id: 'unresolved-effect', kind: 'unresolved', description: 'Dado reservado aos desenvolvedores.',
      scope: 'self', condition: 'always', conditionExpected: null, evaluatedOn: 'source',
    },
  ] });
  const result = calculateBuild(inputFor(catalog));
  assert.equal(result.status, 'pending');
  assert.equal(result.summary.informational, 1);
  assert.equal(result.summary.pending, 1);
  assert.equal(result.stats['hero.health'].final, 900);
  assert.equal(result.stats['hero.health'].knownSubtotal, 900);
});

test('analyzeBuildV2 expõe mapas namespaced, mantém null e formato de linhas', () => {
  const catalog = normalized();
  const context = {
    heroi: { databaseId: 'hero-one', nome: 'Hero One' },
    slots: [{ key: 'slot-one' }, { key: 'slot-two' }, { key: 'slot-three' }, { key: 'slot-four' }, { key: 'slot-five' }, { key: 'slot-six' }],
    equipados: { slot_one_typo: null, 'slot-one': { databaseId: 'equipment-one', raridade: 'comum', nome: 'Módulo preciso' } },
    dados: { calculationV2: { catalog, baseByHero: new Map([['hero-one', heroBaseRow]]) } },
  };
  const analysis = analyzeBuildV2(context);
  assert.equal(analysis.engine, 'calculation-v2');
  assert.equal(analysis.status, 'ready');
  assert.equal(analysis.catalogRevision, 'catalog-revision-1');
  assert.equal(analysis.base['weapon.magazine_size'], 5);
  assert.equal(analysis.total['weapon.magazine_size'], 7);
  assert.equal(analysis.total['weapon.range'], null);
  assert.equal(analysis.linhas, analysis.estatisticas);
  assert.ok(analysis.linhas.some(line => line.key === 'weapon.magazine_size' && line.difference === 2));
});

test('effectRowsForEquipment separa item pendente, informativo e valor numérico', () => {
  const unpublished = effectRowsForEquipment(normalized({ publication: false }), 'equipment-one', 'comum');
  assert.equal(unpublished[0].status, 'pending');
  assert.equal(unpublished[0].value, null);

  const numeric = effectRowsForEquipment(normalized(), 'equipment-one', 'comum');
  assert.deepEqual(numeric.map(row => [row.target, row.value, row.status]), [
    ['weapon.magazine_size', 2, 'ready'],
  ]);
});

test('cliente chama somente get_calculation_catalog_v2, usa cache e descarta cache com erro', async () => {
  let calls = 0;
  const supabase = {
    async rpc(name) {
      calls += 1;
      assert.equal(name, 'get_calculation_catalog_v2');
      return { data: rawCatalog(), error: null };
    },
  };
  const first = await loadCalculationCatalogV2(supabase);
  const second = await loadCalculationCatalogV2(supabase);
  assert.equal(first, second);
  assert.equal(calls, 1);
  clearCalculationCatalogV2Cache(supabase);
  await loadCalculationCatalogV2(supabase);
  assert.equal(calls, 2);

  const failing = { async rpc() { return { data: null, error: { message: 'rpc unavailable' } }; } };
  await assert.rejects(loadCalculationCatalogV2(failing), /rpc unavailable/);
  await assert.rejects(loadCalculationCatalogV2(failing), /rpc unavailable/);
});

test('loadCalculationDataV2 carrega RPC e view oficial sem misturar os escopos', async () => {
  const supabase = {
    async rpc(name) {
      assert.equal(name, 'get_calculation_catalog_v2');
      return { data: rawCatalog(), error: null };
    },
    from(name) {
      assert.equal(name, 'hero_complete_base_stats');
      return {
        async select(columns) {
          assert.equal(columns, 'hero_id,hero_stats,weapon_stats');
          return { data: [heroBaseRow], error: null };
        },
      };
    },
  };
  const data = await loadCalculationDataV2(supabase);
  assert.equal(data.catalogRevision, 'catalog-revision-1');
  assert.equal(data.baseByHero.get('hero-one'), heroBaseRow);
});

test('seis slots são obrigatórios e condição informada precisa ser booleana', () => {
  const catalog = normalized();
  let input = inputFor(catalog);
  input.build.slots = input.build.slots.slice(0, 5);
  assert.equal(calculateBuild(input).errors[0].code, 'INVALID_SLOT_COUNT');

  input = inputFor(catalog);
  input.build.conditions.moving = 'false';
  const result = calculateBuild(input);
  assert.equal(result.status, 'invalid');
  assert.ok(result.errors.some(error => error.code === 'INVALID_CONDITION_VALUE'));
});

test('condição null permanece desconhecida e bloqueia só o destino do efeito', () => {
  const raw = rawCatalog();
  raw.equipment[0].effects[0].condition = 'moving';
  raw.equipment[0].effects[0].conditionExpected = true;
  const catalog = normalizeCalculationCatalogV2(raw);
  const result = calculateBuild(inputFor(catalog, undefined, { moving: null }));
  assert.equal(result.status, 'pending');
  assert.equal(result.effects[0].code, 'CONDITION_UNKNOWN');
  assert.equal(result.stats['weapon.magazine_size'].final, null);
  assert.equal(result.stats['hero.health'].final, 900);
});

test('efeito de equipe não é aplicado a um portador sem contexto de composição', () => {
  const raw = rawCatalog();
  raw.equipment[0].effects[0].scope = 'team';
  raw.equipment[0].effects[0].evaluatedOn = 'recipient';
  const catalog = normalizeCalculationCatalogV2(raw);
  const result = calculateBuild(inputFor(catalog));
  assert.equal(result.status, 'pending');
  assert.equal(result.effects[0].code, 'TEAM_CONTEXT_REQUIRED');
  assert.equal(result.stats['weapon.magazine_size'].final, null);
});

test('publicação incompleta nunca concede autoridade aos efeitos', () => {
  const withoutPublicationProof = rawCatalog();
  withoutPublicationProof.equipment[0].publication = {};
  const catalog = normalizeCalculationCatalogV2(withoutPublicationProof);
  assert.equal(catalog.equipment[0].publication, null);
  assert.deepEqual(catalog.equipment[0].effects, []);

  const malformedEffect = rawCatalog();
  delete malformedEffect.equipment[0].effects[0].scope;
  assert.throws(
    () => normalizeCalculationCatalogV2(malformedEffect),
    /sem descrição, alcance ou condição explícita/
  );
});

test('bônus de conjunto sem contrato v2 fica pendente sem apagar efeitos calculáveis', () => {
  const raw = rawCatalog();
  raw.equipment.push({
    ...structuredClone(raw.equipment[0]),
    id: 'equipment-two',
    name: 'Segundo módulo',
    publication: { ...raw.equipment[0].publication, id: 42 },
    effects: [{ ...raw.equipment[0].effects[0], id: 'effect-two', values: { comum: 1 } }],
  });
  const catalog = normalizeCalculationCatalogV2(raw);
  const set = {
    id: 'set-one',
    nome: 'Conjunto auditável',
    bonus: [{ id: 'bonus-two', required_pieces: 2, description: 'Bônus legado ainda sem vínculo.' }],
  };
  const equipped = {
    first: { databaseId: 'equipment-one', raridade: 'comum', setId: 'set-one', set },
    second: { databaseId: 'equipment-two', raridade: 'comum', setId: 'set-one', set },
  };
  const analysis = analyzeBuildV2({
    heroi: { databaseId: 'hero-one' },
    slots: [{ key: 'first' }, { key: 'second' }, null, null, null, null],
    equipados: equipped,
    dados: { calculationV2: { catalog, baseByHero: new Map([['hero-one', heroBaseRow]]) } },
  });
  assert.equal(analysis.status, 'partial');
  assert.equal(analysis.total['hero.health'], 900);
  assert.equal(analysis.total['weapon.magazine_size'], 8);
  assert.ok(analysis.core.effects.some(effect => effect.code === 'SET_BONUS_RULE_NOT_PUBLISHED'));
});

function bornalInput({ recoilTarget = null, invalidThird = false } = {}) {
  const definitions = [
    {
      id: 'weapon.aimed_range', label: 'Alcance da arma ao mirar', scope: 'weapon',
      source: { scope: 'weapon', key: 'aimed_weapon_range' }, unit: 'game_value',
      direction: 'higher', policy,
    },
    {
      id: 'weapon.recoil', label: 'Recuo da arma (índice relativo)', scope: 'weapon',
      source: { scope: 'weapon', key: 'weapon_recoil' }, unit: 'percent',
      direction: 'lower', defaultBase: 100, policy,
    },
  ];
  const effects = [
    {
      id: 'bornal-aimed-range', kind: 'numeric',
      description: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI',
      rawLabel: '+26 AO ALCANCE DO TIRO COM MIRA DO HERÓI',
      target: 'weapon.aimed_range', operation: 'flat', scope: 'self',
      condition: 'always', evaluatedOn: 'source', ruleStatus: 'reviewed',
      source: { kind: 'game_capture', reference: 'game-capture:bornal-divino' },
      values: { divino: 26 },
    },
    {
      id: 'bornal-recoil', kind: 'numeric',
      description: 'AO RECUO DA ARMA DO HERÓI',
      rawLabel: '-38% AO RECUO DA ARMA DO HERÓI',
      target: recoilTarget, operation: 'percent', scope: 'self',
      condition: 'always', evaluatedOn: 'source', ruleStatus: 'reviewed',
      source: { kind: 'game_capture', reference: 'game-capture:bornal-divino' },
      values: { divino: -38 },
    },
  ];
  if (invalidThird) {
    effects.push({
      id: 'invalid-third', kind: 'numeric', description: 'Efeito inválido de teste',
      target: 'weapon.aimed_range', operation: 'multiply', scope: 'self',
      condition: 'always', evaluatedOn: 'source', ruleStatus: 'reviewed',
      source: { kind: 'admin_observation', reference: 'regression-invalid-third' },
      values: { divino: 999 },
    });
  }
  return {
    definitions,
    equipment: [{ id: 'bornal', name: 'Bornal da Specnaz do Slayer', effects }],
    build: {
      id: 'bornal-divino',
      hero: { id: 'slayer', base: { ...baseFromHeroCompleteStats({ definitions }, heroBaseRow) } },
      slots: [{ equipmentId: 'bornal', rarity: 'divino' }, null, null, null, null, null],
      conditions: {},
    },
  };
}

test('Bornal calcula alcance e mantém recuo não vinculado visível sem bloquear o resultado', () => {
  const input = bornalInput();
  const result = calculateBuild(input);
  assert.equal(result.status, 'partial');
  assert.equal(result.stats['weapon.aimed_range'].final, 456);
  assert.equal(result.stats['weapon.recoil'].base, 100);
  assert.equal(result.stats['weapon.recoil'].final, 100);

  const aimedRange = result.effects.find(effect => effect.effectId === 'bornal-aimed-range');
  const recoil = result.effects.find(effect => effect.effectId === 'bornal-recoil');
  assert.equal(aimedRange.resolved, true);
  assert.equal(aimedRange.calculated, true);
  assert.equal(aimedRange.canonicalStatKey, 'weapon.aimed_range');
  assert.equal(recoil.status, 'pending');
  assert.equal(recoil.code, 'STATUS_NOT_LINKED');
  assert.equal(recoil.amount, -38);
  assert.equal(recoil.resolved, false);
  assert.equal(recoil.calculated, false);
  assert.equal(recoil.normalizedLabel, 'recuo da arma do heroi');

  const adapted = adaptCalculationV2Result(result, { definitions: input.definitions });
  const container = { innerHTML: '' };
  renderCalculationDetailsV2(adapted, container);
  assert.match(container.innerHTML, /Cálculo parcial/);
  assert.match(container.innerHTML, /Não calculado/);
  assert.match(container.innerHTML, /-38%/);
  assert.match(container.innerHTML, /456/);
});

test('catálogo publicado preserva observação numérica sem vínculo e calcula os demais efeitos', () => {
  const raw = rawCatalog();
  raw.definitions.push({
    id: 'weapon.recoil', label: 'Recuo da arma (índice relativo)',
    scope: 'weapon', sourceKey: 'weapon_recoil', unit: 'percent',
    direction: 'lower', defaultBase: 100, policy,
  });
  raw.equipment[0].effects.push({
    id: 'pending-recoil', kind: 'numeric', description: 'AO RECUO DA ARMA DO HERÓI',
    target: null, operation: 'percent', scope: 'self', condition: 'always',
    conditionExpected: null, evaluatedOn: 'source',
    source: { kind: 'game_capture', reference: 'game-capture:pending-recoil' },
    values: { comum: -38 },
  });

  const catalog = normalizeCalculationCatalogV2(raw);
  assert.equal(catalog.definitions.find(definition => definition.id === 'weapon.recoil').defaultBase, 100);
  const result = calculateBuild(inputFor(catalog));
  assert.equal(result.status, 'partial');
  assert.equal(result.stats['weapon.magazine_size'].final, 7);
  assert.equal(result.stats['weapon.recoil'].final, 100);
  assert.equal(result.effects.find(effect => effect.effectId === 'pending-recoil').amount, -38);
});

test('Bornal mapeado calcula alcance e recuo como índice próprio, nunca como dispersão', () => {
  const result = calculateBuild(bornalInput({ recoilTarget: 'weapon.recoil' }));
  assert.equal(result.status, 'calculated');
  assert.equal(result.stats['weapon.aimed_range'].final, 456);
  assert.equal(result.stats['weapon.recoil'].final, 62);
  assert.equal(result.effects.every(effect => effect.status === 'applied' && effect.calculated), true);
  assert.equal(result.effects[1].canonicalStatKey, 'weapon.recoil');
  assert.notEqual(result.effects[1].canonicalStatKey, 'weapon.spread');
});

test('um terceiro efeito inválido não apaga os dois efeitos válidos do Bornal', () => {
  const result = calculateBuild(bornalInput({ recoilTarget: 'weapon.recoil', invalidThird: true }));
  assert.equal(result.status, 'partial');
  assert.equal(result.stats['weapon.aimed_range'].final, 456);
  assert.equal(result.stats['weapon.recoil'].final, 62);
  assert.equal(result.summary.applied, 2);
  assert.equal(result.summary.invalid, 1);
  assert.equal(result.effects.find(effect => effect.effectId === 'invalid-third').status, 'invalid');
});

test('view preserva null, apresenta unidade humana e condição inativa auditável', () => {
  assert.equal(formatCalculationValue(null, { unit: 'health_point', decimals: null }), '—');
  assert.equal(formatCalculationValue(25, { unit: 'health_point', decimals: 0 }), '25 PV');

  const raw = rawCatalog();
  raw.equipment[0].effects[0].condition = 'moving';
  raw.equipment[0].effects[0].conditionExpected = true;
  const catalog = normalizeCalculationCatalogV2(raw);
  const core = calculateBuild(inputFor(catalog, undefined, { moving: false }));
  const result = {
    status: 'ready', catalogRevision: 'rev', mensagem: '', core,
    linhas: [{
      key: 'weapon.magazine_size', nome: 'Carregador', unit: 'ammo_round', decimals: 0,
      direction: 'higher', base: 5, valor: 5, status: 'unchanged', reasons: [],
      trace: core.stats['weapon.magazine_size'].trace,
    }],
  };
  const container = { innerHTML: '' };
  renderCalculationDetailsV2(result, container);
  assert.match(container.innerHTML, /moving = sim/);
  assert.match(container.innerHTML, /O estado atual não corresponde/);
  assert.doesNotMatch(container.innerHTML, />0 tiros</);
});
