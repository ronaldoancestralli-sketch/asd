import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { equipmentEligibility, copyEquippedItem, validateEquipmentLoadout, restoreEquipmentLoadout } from '../js/equipment-eligibility.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slayer = { databaseId: 'slayer', classId: 'sniper' };
const mirage = { databaseId: 'mirage', classId: 'sniper' };
const tank = { databaseId: 'bastion', classId: 'tank' };
const slots = [{ key: 'head' }, { key: 'chest' }];
const personal = { databaseId: 'fones', heroId: 'slayer', classId: 'sniper', isPersonal: true,
  enabled: true, slot: 'head', raridade: 'comum', levels: [{ slug: 'comum', stats: { armor: 1 } }, { slug: 'divino', stats: { armor: 2 } }] };

for (const [name, item, hero, expected] of [
  ['personal item accepts its owner', personal, slayer, true],
  ['same class cannot override the owner', personal, mirage, false],
  ['class item rejects another class', { class_id: 'sniper' }, tank, false],
  ['generic item accepts a different class', {}, tank, true],
  ['personal flag without owner fails closed', { is_personal: true }, slayer, false],
  ['contradictory owner and class fails closed', { hero_id: 'slayer', class_id: 'tank' }, slayer, false],
  ['disabled equipment remains unavailable', { ...personal, enabled: false }, slayer, false]
]) test(name, () => assert.equal(equipmentEligibility(item, hero).eligible, expected));

test('equipped copies preserve scope and can be rejected after switching hero', () => {
  const copy = copyEquippedItem(personal);
  assert.notEqual(copy, personal);
  assert.equal(copy.heroId, 'slayer');
  assert.equal(copy.isPersonal, true);
  assert.equal(equipmentEligibility(copy, tank).eligible, false);
  copy.raridade = 'divino';
  assert.equal(personal.raridade, 'comum');
});

const restore = rows => restoreEquipmentLoadout({ rows, hero: slayer, slots, catalog: [personal], tierSlugById: new Map([['tier-divino', 'divino']]) });
for (const [name, item, expected] of [
  ['clears details for removed personal gear', personal, null],
  ['preserves a compatible item and its saved rarity', { ...personal, heroId: null, classId: null, isPersonal: false, raridade: 'divino' }, 'divino']
]) test(`hero picker ${name}`, () => {
  const source = fs.readFileSync(path.join(root, 'js/criar-build.js'), 'utf8');
  const start = source.indexOf('function renderHerois()');
  const fn = source.slice(start, source.indexOf('\n}', start) + 2);
  const nextHero = { ...tank, id: tank.databaseId, nome: 'Bastion', classe: 'Tanques' };
  const nodes = { track: { querySelectorAll: () => [] }, dots: {}, pop: { hidden: false },
    'pop-foot': {}, 'b-name': { value: 'Existing build' }, 'c-name': {} };
  const effects = { details: 'stale', synergy: 0, catalogue: 0 };
  const sandbox = { CONFIG: { herois: [nextHero], heroi: slayer, equipados: { head: item }, resumo: {} },
    heroiAtual: 'slayer', slotAtivo: 'head', $: key => nodes[key], esc: String,
    mediaExclusivaDaBuild: () => ({}), mStyle: () => '', mInner: () => '',
    configurarHeroiDaBuild: hero => hero, equipamentoCompativelComHeroi: gear => equipmentEligibility(gear, sandbox.CONFIG.heroi).eligible,
    renderHeroi() {}, renderDetalheEquipamento(gear) { effects.details = gear; },
    renderSinergia() { effects.synergy++; }, renderCatalogo() { effects.catalogue++; },
    renderBonus() {}, atualizarAnalise() {}, fecharSeletorHeroi() {}, toast() {}, progresso() {} };
  const removalStart = source.indexOf('function removerEquipamentosIncompativeis()');
  const removal = source.slice(removalStart, source.indexOf('\n}', removalStart) + 2);
  vm.createContext(sandbox); vm.runInContext(removal + '\n' + fn, sandbox);
  sandbox.renderHerois();
  nodes.track.onclick({ target: { closest: () => ({ dataset: { id: tank.databaseId } }) } });
  assert.equal(effects.details?.raridade ?? null, expected);
  assert.equal(nodes['pop-foot'].hidden, expected === null);
  assert.equal(effects.synergy, 1);
  assert.equal(effects.catalogue, 1);
});

test('saved rarity survives rehydration with current scope', () => {
  const r = restore([{ equipment_id: 'fones', slot: 1, tier_id: 'tier-divino', heroId: 'forged' }]);
  assert.equal(r.issues.length, 0);
  assert.equal(r.equipados.head.raridade, 'divino');
  assert.equal(r.equipados.head.heroId, 'slayer');
});
test('unknown non-null tier never falls back to common', () => {
  const r = restore([{ equipment_id: 'fones', slot: 1, tier_id: 'missing-tier' }]);
  assert.equal(r.issues[0].reason, 'equipment_variant_incompatible');
  assert.deepEqual(r.equipados, {});
});
test('legacy null tier uses only the existing common variant', () => {
  const r = restore([{ equipment_id: 'fones', slot: 1, tier_id: null }]);
  assert.equal(r.equipados.head.raridade, 'comum');
});
test('wrong slots and duplicate saved rows are reported', () => {
  assert.equal(restore([{ equipment_id: 'fones', slot: 2 }]).issues[0].reason, 'equipment_slot_incompatible');
  const r = restore([{ equipment_id: 'fones', slot: 1 }, { equipment_id: 'fones', slot: 1 }]);
  assert.equal(r.issues[0].reason, 'duplicate_slot');
});
test('a draft cannot restore personal gear onto another sniper', () => {
  const r = restoreEquipmentLoadout({ rows: [{ equipment_id: 'fones', slot: 1 }], hero: mirage, slots, catalog: [personal] });
  assert.deepEqual(r.equipados, {});
  assert.equal(r.issues[0].reason, 'equipment_hero_incompatible');
});
test('repeated equipment identity and unknown rarity invalidate the loadout', () => {
  assert.equal(validateEquipmentLoadout({ heroi: slayer, slots, equipados: { head: personal, chest: { ...personal, slot: 'chest' } } }).issues[0].reason, 'duplicate_equipment');
  assert.equal(validateEquipmentLoadout({ heroi: slayer, slots, equipados: { head: { ...personal, raridade: 'missing' } } }).valid, false);
});

test('real equipar function preserves restrictions and refuses wrong slot', () => {
  const source = fs.readFileSync(path.join(root, 'js/criar-build.js'), 'utf8');
  const start = source.indexOf('function equipar(');
  const fn = source.slice(start, source.indexOf('\n}', start) + 2);
  const sandbox = { CONFIG: { heroi: slayer, slots, equipados: {} }, slotAtivo: 'head',
    copyEquippedItem, validateEquipmentLoadout, $: () => ({}),
    renderSlots() {}, renderCatalogo() {}, renderDetalheEquipamento() {}, renderSinergia() {},
    renderBonus() {}, atualizarAnalise() {}, toast() {}, fecharPop() {}, progresso() {} };
  vm.createContext(sandbox); vm.runInContext(fn, sandbox);
  sandbox.equipar(personal);
  assert.equal(sandbox.CONFIG.equipados.head.heroId, 'slayer');
  sandbox.slotAtivo = 'chest'; sandbox.equipar(personal);
  assert.equal(sandbox.CONFIG.equipados.chest, undefined);
});

async function analysisModule() {
  const context = vm.createContext({ console, Map, Set, URL, Number, String, Math, Date, JSON, Array, Object, Promise, globalThis: {} });
  const cache = new Map();
  async function load(file) {
    file = file.split('?')[0];
    if (cache.has(file)) return cache.get(file);
    const source = file.endsWith('/supabase.js') ? 'export const supabase = {};' : fs.readFileSync(file, 'utf8');
    const mod = new vm.SourceTextModule(source, { context, identifier: file });
    cache.set(file, mod);
    await mod.link((specifier, parent) => load(path.resolve(path.dirname(parent.identifier), specifier.split('?')[0])));
    return mod;
  }
  const module = await load(path.join(root, 'js/build-analise.js'));
  await module.evaluate();
  return module.namespace;
}
test('real analysis counts distinct valid pieces and blocks invalid numeric calculation', async () => {
  const analysis = await analysisModule();
  const set = { nome: 'Example', bonus: [{ id: 'bonus-2', required_pieces: 2 }] };
  const one = { ...personal, setId: 'set-1', set };
  const two = { ...one, databaseId: 'bornal', slot: 'chest' };
  const valid = { heroi: slayer, slots, equipados: { head: one, chest: two } };
  assert.equal(analysis.calcularBonusAtivos(valid).length, 1);
  const duplicate = { ...valid, equipados: { head: one, chest: { ...one, slot: 'chest' } } };
  assert.equal(analysis.calcularBonusAtivos(duplicate).length, 0);
  assert.equal(analysis.calcularMacros(duplicate).status, 'invalid-loadout');
  const incompatible = { ...valid, heroi: mirage };
  assert.equal(analysis.calcularMacros(incompatible).status, 'invalid-loadout');
});
