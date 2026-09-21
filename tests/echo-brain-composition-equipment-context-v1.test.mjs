import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessCompositionEquipmentContextV1,
  COMPOSITION_EQUIPMENT_CONTEXT_V1_MAX_ADJUSTMENT,
  COMPOSITION_EQUIPMENT_CONTEXT_V1_SCHEMA
} from '../supabase/functions/_shared/echo-brain-equipment-context-v1.ts';

const skill = (name, description, skill_type = 'Passiva') => ({
  name,
  description,
  skill_type,
  enabled: true,
  verification_status: 'verified',
  needs_recheck: false
});

const hero = (id, class_id, skills) => ({ id, class_id, skills });

const slayer = hero('slayer', 'sniper', [
  skill('Visão térmica', 'Revela inimigos, aumenta o alcance de mira e permite atirar através de paredes.'),
  skill('Perfuração', 'Aumenta o poder de perfuração, a penetração de armadura e o dano.', 'Talento de equipe')
]);
const mirage = hero('mirage', 'sniper', [
  skill('Tiro preciso', 'Aumenta alcance de tiro, dano e estabilidade de mira.'),
  skill('Mira rápida', 'Reduz o tempo de mira e melhora a dispersão.')
]);
const ghost = hero('ghost', 'scout', [
  skill('Invisibilidade', 'Ao ativar, fica invisível e aumenta a velocidade de movimento.', 'Ativa'),
  skill('Emboscada', 'Ao sair da invisibilidade, aumenta o dano e a velocidade de movimento.')
]);
const bastion = hero('bastion', 'tank', [
  skill('Escudo', 'Ao ativar cria um escudo que reduz o dano recebido.', 'Ativa'),
  skill('Blindagem', 'Aumenta a vida máxima, a armadura máxima e a resistência.')
]);
const smog = hero('smog', 'tank', [
  skill('Proteção', 'Reduz dano recebido e aumenta armadura máxima.'),
  skill('Recuperação', 'Ao receber dano, recupera vida e restaura armadura.')
]);

const item = (id, slot_id, description, extra = {}) => ({
  id,
  name: id,
  slot_id,
  description,
  variants: [],
  ...extra
});

const sniperCatalogue = [
  item('wall-lens', 'head', 'Aumenta alcance de tiro e permite atirar através de paredes.'),
  item('piercing-grip', 'hand', 'Aumenta poder de perfuração, penetração de armadura e dano.'),
  item('aim-stock', 'chest', 'Reduz tempo de mira e dispersão; aumenta alcance de mira.')
];

test('same global catalogue supports Slayer more than Bastion when mechanics differ', () => {
  const result = assessCompositionEquipmentContextV1([slayer, bastion, mirage], sniperCatalogue);
  const byHero = new Map(result.heroes.map(row => [row.heroId, row]));
  assert.ok(byHero.get('slayer').supportAffinity > byHero.get('bastion').supportAffinity);
  assert.equal(result.schemaVersion, COMPOSITION_EQUIPMENT_CONTEXT_V1_SCHEMA);
});

test('hero-specific equipment is eligible only for its owner', () => {
  const catalogue = [
    item('slayer-only', 'head', 'Atirar através de paredes e aumentar alcance de tiro.', { hero_id: 'slayer' }),
    item('generic-grip', 'hand', 'Aumenta penetração de armadura e dano.')
  ];
  const result = assessCompositionEquipmentContextV1([slayer, bastion, mirage], catalogue);
  const byHero = new Map(result.heroes.map(row => [row.heroId, row]));
  assert.equal(byHero.get('slayer').eligibleItems, 2);
  assert.equal(byHero.get('bastion').eligibleItems, 1);
  assert.equal(byHero.get('mirage').eligibleItems, 1);
});

test('class-specific equipment does not leak into another class', () => {
  const catalogue = [
    item('sniper-lens', 'head', 'Aumenta alcance de tiro e tempo de mira.', { class_id: 'sniper' }),
    item('generic-grip', 'hand', 'Aumenta dano e penetração de armadura.')
  ];
  const result = assessCompositionEquipmentContextV1([slayer, ghost, mirage], catalogue);
  const byHero = new Map(result.heroes.map(row => [row.heroId, row]));
  assert.equal(byHero.get('slayer').eligibleItems, 2);
  assert.equal(byHero.get('mirage').eligibleItems, 2);
  assert.equal(byHero.get('ghost').eligibleItems, 1);
});

test('the same catalogue creates different support potential for different trios', () => {
  const sniperTeam = assessCompositionEquipmentContextV1([slayer, mirage, ghost], sniperCatalogue);
  const tankTeam = assessCompositionEquipmentContextV1([bastion, smog, ghost], sniperCatalogue);
  assert.ok(sniperTeam.supportAffinity > tankTeam.supportAffinity);
  assert.notEqual(sniperTeam.adjustment, tankTeam.adjustment);
});

test('insufficient semantic equipment coverage is fail-closed with zero adjustment', () => {
  const sparse = [item('one-item', 'head', 'Aumenta dano.')];
  const result = assessCompositionEquipmentContextV1([slayer, mirage, ghost], sparse);
  assert.equal(result.applied, false);
  assert.equal(result.adjustment, 0);
  assert.match(result.reasons.join(' '), /nenhum ajuste/i);
});

test('equipment context never assumes an equipped loadout or set bonuses', () => {
  const result = assessCompositionEquipmentContextV1([slayer, mirage, ghost], sniperCatalogue);
  assert.equal(result.assumptions.selectedLoadoutAssumed, false);
  assert.equal(result.assumptions.setBonusesAssumed, false);
  assert.equal(result.assumptions.bestSemanticSupportPerSlotOnly, true);
});

test('adding truly inferior alternatives to an already covered slot cannot inflate team adjustment', () => {
  const baseline = assessCompositionEquipmentContextV1([slayer, mirage, ghost], sniperCatalogue);
  const inflatedCatalogue = [
    ...sniperCatalogue,
    item('extra-head-1', 'head', 'Aumenta a capacidade de munição e o tamanho do carregador.'),
    item('extra-head-2', 'head', 'Aumenta a capacidade de munição e o tamanho do carregador.'),
    item('extra-head-3', 'head', 'Aumenta a capacidade de munição e o tamanho do carregador.')
  ];
  const inflated = assessCompositionEquipmentContextV1([slayer, mirage, ghost], inflatedCatalogue);
  assert.equal(inflated.supportAffinity, baseline.supportAffinity);
  assert.equal(inflated.adjustment, baseline.adjustment);
});

test('public adjustment is strictly bounded to plus/minus four points', () => {
  const catalogues = [
    sniperCatalogue,
    [
      item('shield', 'head', 'Escudo, vida máxima, armadura máxima e redução de dano.'),
      item('heal', 'hand', 'Ao receber dano recupera vida e restaura armadura.'),
      item('move', 'foot', 'Aumenta velocidade de movimento e invisibilidade.')
    ]
  ];
  for (const catalogue of catalogues) {
    const result = assessCompositionEquipmentContextV1([slayer, mirage, ghost], catalogue);
    assert.ok(Math.abs(result.adjustment) <= COMPOSITION_EQUIPMENT_CONTEXT_V1_MAX_ADJUSTMENT);
  }
});
