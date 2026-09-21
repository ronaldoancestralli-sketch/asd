import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEquipmentStats, buildRealStatLines } from '../js/game-stat-engine.js';
import { STATUS_REGISTRY_CONTRACT, compileStatusRegistry, validateStatusPayload, statusSource, compareStatusCalculations, statusSkillSources } from '../js/status-registry-v1.js';

// Isolated numerical fixtures. These records are never written to the SNV.
const variantId = '11111111-1111-4111-8111-111111111111';
const bindingId = '22222222-2222-4222-8222-222222222222';
const skillId = '33333333-3333-4333-8333-333333333333';
const raw = { label: 'à dispersao de tiro da arma sem mirar', value: '23%', operator: 'decrease_percent' };
function payload(overrides = {}) {
  return {
    contract: STATUS_REGISTRY_CONTRACT,
    definitions: [{ id: 'dispersion', name: 'Dispersão sem mira', scope: 'weapon', source_key: 'weapon_spread', unit: 'degree', direction: 'lower', kind: 'scalar', minimum: 0, maximum: 360, evidence: 'Fixture da captura fornecida' }],
    bindings: [{ id: bindingId, source_kind: 'equipment_variant', source_id: variantId, attribute_key: '0', source_snapshot: raw, target: 'dispersion', operator: 'decrease_percent', unit: 'percent', condition: 'always', evidence: 'Fixture numérica isolada' }],
    ...overrides
  };
}
const compile = p => compileStatusRegistry({ revision: 1, fingerprint: 'fixture', payload: p });
const source = attributes => statusSource('equipment_variant', variantId, attributes || [raw]);
const calculate = (p = payload(), base = { hero_stats: { health: 100 }, weapon_stats: { weapon_spread: 50, aimed_dispersion: 5 } }, sources = [source()], context = {}) => applyEquipmentStats(base, sources, { registry: compile(p), context });

test('explicit source binding applies 23% to degrees without using the description as a rule', () => {
  const result = calculate();
  assert.equal(result.final.dispersion, 38.5);
  assert.equal(result.final.aimed_dispersion, 5);
  assert.equal(result.final.health, 100);
  assert.equal(result.applied.length, 1);
  assert.equal(result.trace[0].status, 'applied');
  assert.deepEqual([result.trace[0].before, result.trace[0].after, result.trace[0].unit], [50, 38.5, 'degree']);
  assert.equal(result.origins.dispersion.key, 'weapon_spread');
  assert.equal(buildRealStatLines(result, 99).find(s => s.key === 'dispersion').unit, '°');
});

for (const [operator, unit, expected] of [['increase_flat','degree',73],['decrease_flat','degree',27],['increase_percent','percent',61.5],['decrease_percent','percent',38.5]]) {
  test(`selected ${operator} is authoritative, independent of old value sign`, () => {
    const p = payload(); p.bindings[0].operator = operator; p.bindings[0].unit = unit;
    assert.equal(calculate(p).final.dispersion, expected);
  });
}
test('a bound line replaces the legacy rule and is never applied twice', () => {
  const p = payload(); const known = { label: 'Dispersão sem mira', value: 23, operator: 'decrease_percent' };
  p.bindings[0].source_snapshot = known;
  assert.equal(calculate(p, undefined, [source([known])]).final.dispersion, 38.5);
});
test('source edit or removal blocks the binding without reverting to textual guessing', () => {
  for (const attrs of [[{ ...raw, value: 40 }], []]) {
    const result = calculate(payload(), undefined, [source(attrs)]);
    assert.equal(result.final.dispersion, 50);
    assert.equal(result.applied.length, 0);
    assert.equal(result.trace[0].status, 'source_changed');
  }
});
test('different rarity does not inherit a binding; an unknown phrase remains unknown', () => {
  const result = calculate(payload(), undefined, [statusSource('equipment_variant', skillId, [{ label: 'efeito completamente novo', value: 23 }])]);
  assert.equal(result.final.dispersion, 50);
  assert.equal(result.trace[0].status, 'unmapped');
});
test('absent, null and empty bases are not zero; source scope cannot be borrowed from hero', () => {
  for (const value of [undefined, null, '']) {
    const result = calculate(payload(), { hero_stats: { weapon_spread: 100 }, weapon_stats: { weapon_spread: value } });
    assert.equal(result.trace[0].status, 'missing_base');
    assert.ok(!Object.hasOwn(result.final, 'dispersion'));
  }
});
test('zero base is valid for an absolute addition', () => {
  const p = payload(); p.bindings[0].operator = 'increase_flat'; p.bindings[0].unit = 'degree';
  const result = calculate(p, { weapon_stats: { weapon_spread: 0 } });
  assert.equal(result.final.dispersion, 23);
});
test('an explicit new status works without a hardcoded engine key', () => {
  const p = payload(); p.definitions[0] = { ...p.definitions[0], id: 'new_weapon_frequency', source_key: 'shots_per_second', unit: 'shot_per_second', direction: 'higher' };
  p.bindings[0].target = 'new_weapon_frequency';
  const result = calculate(p, { weapon_stats: { shots_per_second: 10, fire_interval: 183 } });
  assert.equal(result.final.new_weapon_frequency, 7.7);
  assert.equal(result.final.fire_interval, 183);
  assert.equal(buildRealStatLines(result, 99).find(s => s.key === 'new_weapon_frequency').unit, ' tiros/s');
});
test('missing condition is diagnosed; an inactive condition does not count as an error', () => {
  const p = payload(); p.bindings[0].condition = 'unaimed';
  assert.equal(calculate(p).trace[0].status, 'condition_required');
  const inactive = calculate(p, undefined, undefined, { aiming: true });
  assert.equal(inactive.trace[0].status, 'not_applicable');
  assert.deepEqual(inactive.unknown, []);
  assert.equal(calculate(p, undefined, undefined, { aiming: false }).final.dispersion, 38.5);
});
test('bounds reject invalid results instead of silently clamping', () => {
  const p = payload(); p.definitions[0].minimum = 40;
  const result = calculate(p);
  assert.equal(result.final.dispersion, 50);
  assert.equal(result.trace[0].status, 'invalid_result');
  assert.equal(result.trace[0].attempted, 38.5);
});
test('sequential effects preserve order and leave source snapshots immutable', () => {
  const p = payload(); const second = { ...p.bindings[0], id: skillId, attribute_key: '1', source_snapshot: { ...raw, value: 10 } };
  p.bindings.push(second);
  const result = calculate(p, undefined, [source([raw, second.source_snapshot])]);
  assert.equal(result.final.dispersion, 34.65);
  assert.equal(result.trace[1].before, 38.5);
  assert.equal(raw.value, '23%');
});
test('summary, unknown unit, arbitrary code and duplicate source are refused', () => {
  for (const mutate of [
    p => { p.definitions[0].kind = 'summary'; },
    p => { p.definitions[0].unit = 'unknown'; },
    p => { p.definitions[0].formula = 'eval(input)'; },
    p => { p.bindings.push({ ...p.bindings[0], id: skillId }); },
    p => { p.bindings[0].unit = 'second'; },
    p => { p.definitions[0].id = '__proto__'; }
  ]) { const p = payload(); mutate(p); assert.equal(validateStatusPayload(p).valid, false); assert.throws(() => compile(p)); }
});
test('ability effect requires an explicit active ability belonging to the hero', () => {
  const p = payload(); p.bindings[0] = { ...p.bindings[0], source_kind: 'hero_skill', source_id: skillId, attribute_key: 'duration', source_snapshot: 23, condition: 'ability_active', ability_id: skillId };
  const s = statusSource('hero_skill', skillId, { duration: 23 }, { heroId: 'hero-a', verified: true });
  assert.equal(calculate(p, undefined, [s], { heroId: 'hero-b', activeAbilities: [skillId] }).trace[0].status, 'hero_mismatch');
  assert.equal(calculate(p, undefined, [s], { heroId: 'hero-a', activeAbilities: [skillId] }).final.dispersion, 38.5);
});
test('parity needs the same registry, final values and contribution trace', () => {
  const result = calculate(), copy = structuredClone(result);
  assert.equal(compareStatusCalculations(result, copy).equal, true);
  copy.registry.revision = 2; assert.equal(compareStatusCalculations(result, copy).equal, false);
  copy.registry.revision = 1; copy.final.dispersion = 40; assert.equal(compareStatusCalculations(result, copy).equal, false);
  copy.final.dispersion = 38.5; copy.trace[0].status = 'legacy'; assert.equal(compareStatusCalculations(result, copy).equal, false);
});

test('only the explicitly selected ability level contributes, never all levels at once', () => {
  const level1 = '44444444-4444-4444-8444-444444444444', level2 = '55555555-5555-4555-8555-555555555555';
  const p = payload();
  p.bindings = [level1, level2].map((id,i) => ({ ...p.bindings[0], id, source_kind: 'hero_skill_level', source_id: id, attribute_key: 'damage', source_snapshot: i ? 20 : 10, condition: 'ability_active', ability_id: skillId }));
  const skills = [{ id: skillId, hero_id: 'hero-a', enabled: true, verification_status: 'verified', needs_recheck: false }];
  const levels = [{ id: level1, skill_id: skillId, damage: 10 }, { id: level2, skill_id: skillId, damage: 20 }];
  const sources = statusSkillSources(compile(p), skills, levels);
  const context = { heroId: 'hero-a', activeAbilities: [skillId] };
  assert.equal(calculate(p, undefined, sources, context).applied.length, 0);
  const result = calculate(p, undefined, sources, { ...context, skillLevels: { [skillId]: level2 } });
  assert.equal(result.final.dispersion, 40);
  assert.equal(result.applied.length, 1);
  assert.equal(result.trace.filter(t => t.status === 'not_applicable').length, 1);
});
test('an explicitly renamed status owns its source without a second legacy alias', () => {
  const p = payload(); p.definitions[0].id = 'hip_angle'; p.bindings[0].target = 'hip_angle';
  const result = calculate(p);
  assert.equal(result.final.hip_angle, 38.5);
  assert.equal(Object.hasOwn(result.final, 'dispersion'), false);
});
test('an unbound known row remains pending even with a compatible installed definition', () => {
  const p = payload(); p.bindings = []; p.definitions[0].minimum = 40;
  const result = calculate(p, undefined, [source([{ label: 'Dispersão sem mira', value: 23, operator: 'decrease_percent' }])]);
  assert.equal(result.final.dispersion, 50);
  assert.equal(result.trace[0].status, 'unmapped');
});
test('null legacy bases cannot be converted to zero by compatibility normalization', () => {
  const p = payload({ definitions: [], bindings: [] });
  const result = calculate(p, { hero_stats: { health: null }, weapon_stats: {} }, [source([{ label: 'Vida', value: 10, operator: 'increase_flat' }])]);
  assert.equal(Object.hasOwn(result.final, 'health'), false);
  assert.equal(result.applied.length, 0);
});
test('duplicate source definitions and a missing registry identity are rejected', () => {
  const p = payload(); p.definitions.push({ ...p.definitions[0], id: 'another_angle' });
  assert.throws(() => compile(p));
  assert.throws(() => compileStatusRegistry({ payload: payload() }));
});
test('parity rejects nonfinite values and an incomplete or different trace contract', () => {
  const result = calculate();
  for (const alter of [r => { r.final.dispersion = NaN; }, r => { r.final.dispersion = null; }, r => { delete r.trace; }, r => { r.registry.contract = 'other'; }]) {
    const copy = structuredClone(result); alter(copy); assert.equal(compareStatusCalculations(result, copy).equal, false);
  }
});
test('physical units accept a degree suffix but never convert seconds into degrees', () => {
  const p=payload(); p.bindings[0].operator='decrease_flat'; p.bindings[0].unit='degree';
  for (const [value,expected] of [['5°',45],['5º',45],['5 s',50]]) {
    p.bindings[0].source_snapshot={...raw,value};
    const result=calculate(p,undefined,[source([p.bindings[0].source_snapshot])]);
    assert.equal(result.final.dispersion,expected);
    if(value==='5 s') assert.equal(result.trace[0].status,'invalid_value');
  }
});
