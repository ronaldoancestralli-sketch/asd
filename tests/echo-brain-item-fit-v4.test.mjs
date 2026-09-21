import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateEquipmentBehaviorForHeroV4,
  evaluateAppliedModifiersForHeroV4,
  interpretEquipmentBehaviorV4
} from '../js/echo-brain-item-fit-v4.js';

const verified = {
  enabled: true,
  verification_status: 'verified',
  needs_recheck: false
};

const slayerSkills = [
  { ...verified, name: 'Visão Térmica', skill_type: 'Ativa', cooldown: 9, duration: 9, description: 'Permite atirar através de paredes por 9 s e concede +10 de poder de perfuração. Ao eliminar um inimigo durante o efeito restaura 1 carga.' },
  { ...verified, name: 'Mira', skill_type: 'Talento de equipe', duration: 5.5, description: 'Ao acertar um inimigo, concede +50% de dano e reduz em 35% a dispersão ao mirar para a equipe.' }
];

const bastionSkills = [
  { ...verified, name: 'Escudo', skill_type: 'Ativa', cooldown: 9, duration: 8, description: 'Cria um escudo móvel que bloqueia dano por 8 s.' },
  { ...verified, name: 'Blindado', skill_type: 'Passiva', description: 'Concede +25% de armadura máxima e +20% de vida máxima. Ao receber dano, restaura armadura.' }
];

const base = {
  damage_per_shot: 100,
  fire_interval: 1,
  reload_time: 2,
  magazine_size: 10,
  health: 1000,
  armor: 500,
  penetration_power: 10,
  aimed_range: 800,
  aim_time: 1
};

test('parser separa efeito, gatilho e escopo de comportamento do item', () => {
  const result = interpretEquipmentBehaviorV4('Ao acertar um inimigo, concede +20% de dano à equipe em um raio de 400 por 3 s.');
  assert.equal(result.effects.includes('damage'), true);
  assert.equal(result.triggers.includes('on_hit'), true);
  assert.equal(result.scopes.includes('team'), true);
  assert.equal(result.scopes.includes('area'), true);
});

test('mesmo efeito de tiro através de paredes é mais aderente ao Slayer que a um tanque defensivo', () => {
  const text = 'Ao ativar, permite atirar através de paredes e aumenta o poder de perfuração por 6 s.';
  const slayer = evaluateEquipmentBehaviorForHeroV4({ hero: { id: 'slayer' }, skills: slayerSkills, baseStats: base, behaviorTexts: [text] });
  const bastion = evaluateEquipmentBehaviorForHeroV4({ hero: { id: 'bastion' }, skills: bastionSkills, baseStats: base, behaviorTexts: [text] });
  assert.ok(slayer.affinity > bastion.affinity, `Slayer ${slayer.affinity} deveria superar Bastion ${bastion.affinity}`);
  assert.ok(slayer.score > bastion.score);
});

test('gatilho on-hit reforça herói com mecânica on-hit', () => {
  const onHit = evaluateEquipmentBehaviorForHeroV4({
    hero: { id: 'slayer' }, skills: slayerSkills, baseStats: base,
    behaviorTexts: ['Ao acertar um inimigo, concede +20% de dano por 3 s.']
  });
  const onDamage = evaluateEquipmentBehaviorForHeroV4({
    hero: { id: 'slayer' }, skills: slayerSkills, baseStats: base,
    behaviorTexts: ['Ao receber dano, concede +20% de dano por 3 s.']
  });
  assert.equal(onHit.triggerMatches.includes('on_hit'), true);
  assert.ok(onHit.affinity > onDamage.affinity);
});

test('mudança de comportamento altera o fit mesmo mantendo o mesmo bônus numérico', () => {
  const common = {
    hero: { id: 'slayer' },
    skills: slayerSkills,
    baseStats: base,
    applied: [{ target: 'damage_per_shot', before: 100, after: 120 }],
    unknown: [],
    rawModifiers: [{ damage_per_shot: 20 }]
  };
  const hit = evaluateAppliedModifiersForHeroV4({ ...common, behaviorTexts: ['Ao acertar um inimigo, concede +20% de dano por 3 s.'] });
  const taken = evaluateAppliedModifiersForHeroV4({ ...common, behaviorTexts: ['Ao receber dano, concede +20% de dano por 3 s.'] });
  assert.equal(hit.numericFitScore, taken.numericFitScore);
  assert.notEqual(hit.fitScore, taken.fitScore);
  assert.ok(hit.fitScore > taken.fitScore);
});

test('comportamento sem números ainda influencia sem substituir a verdade numérica', () => {
  const result = evaluateAppliedModifiersForHeroV4({
    hero: { id: 'bastion' },
    skills: bastionSkills,
    baseStats: base,
    applied: [],
    unknown: [],
    rawModifiers: [],
    behaviorTexts: ['Ao receber dano, cria um escudo para o herói.']
  });
  assert.equal(result.behaviorAware, true);
  assert.equal(result.behaviorWeight, 0.65);
  assert.ok(result.fitScore >= 50);
  assert.ok(result.behavior.effects.some(row => row.effect === 'shield'));
});
