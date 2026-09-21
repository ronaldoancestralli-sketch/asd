import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalItemStat,
  evaluateAppliedModifiersForHeroV3,
  interpretSkillForItemFitV3
} from '../js/echo-brain-item-fit-v3.js';

const verified = (name, description, skill_type = 'Passiva', cooldown = null, duration = null) => ({
  name,
  description,
  skill_type,
  cooldown,
  duration,
  enabled: true,
  verification_status: 'verified',
  needs_recheck: false
});

const mirageAgility = verified(
  'Agilidade',
  'No nível máximo, ao acertar um inimigo, concede +55 de velocidade de movimento e +20% de cadência de tiro para toda a equipe em um raio de 400 por 3,5 s.',
  'Talento de equipe', null, 3.5
);

const slayerThermal = verified(
  'Visão Térmica',
  'No nível máximo, permite atirar através de paredes por 9 s, reduz a velocidade de movimento em 70% e concede +10 de poder de perfuração. Eliminar um inimigo durante o efeito restaura 1 carga; após ativar, o herói não pode atirar por 0,5 s.',
  'Ativa', 9, 9
);

const neutralSkill = verified(
  'Reserva',
  'Concede passivamente +25% de vida máxima.',
  'Passiva'
);

const base = {
  damage_per_shot: 100,
  fire_interval: 0.5,
  reload_time: 2,
  penetration_power: 4,
  max_movement_speed: 100,
  health: 1000,
  armor: 500
};

function impact(result, stat) {
  const found = result.impacts.find(entry => entry.stat === stat);
  assert.ok(found, `impacto ausente: ${stat}`);
  return found;
}

test('normalização de atributo mantém aliases pct na forma canônica usada pelo Brain', () => {
  assert.equal(canonicalItemStat('special_ability_cooldown_pct'), 'special_ability_cooldown_percentual');
  assert.equal(canonicalItemStat('Crate Opening Cooldown %'), 'crate_opening_cooldown_percentual');
});

test('mesma melhoria de cadência vale mais para kit dependente de acertos/cadência', () => {
  const applied = [{ target: 'fire_interval', before: .5, after: .4 }];
  const mirage = evaluateAppliedModifiersForHeroV3({ hero: { id: 'mirage' }, skills: [mirageAgility], baseStats: base, applied });
  const neutral = evaluateAppliedModifiersForHeroV3({ hero: { id: 'neutral' }, skills: [neutralSkill], baseStats: base, applied });
  assert.equal(impact(mirage, 'fire_interval').direction, 'benefit');
  assert.ok(impact(mirage, 'fire_interval').kitAffinity > impact(neutral, 'fire_interval').kitAffinity);
  assert.ok(impact(mirage, 'fire_interval').relevance > impact(neutral, 'fire_interval').relevance);
});

test('poder de perfuração é especialmente relevante para Slayer com tiro através de paredes', () => {
  const applied = [{ target: 'penetration_power', before: 4, after: 7 }];
  const slayer = evaluateAppliedModifiersForHeroV3({ hero: { id: 'slayer' }, skills: [slayerThermal], baseStats: base, applied });
  const neutral = evaluateAppliedModifiersForHeroV3({ hero: { id: 'neutral' }, skills: [neutralSkill], baseStats: base, applied });
  assert.ok(slayer.mechanics.includes('wall_shot'));
  assert.ok(slayer.mechanics.includes('self_movement_penalty'));
  assert.ok(impact(slayer, 'penetration_power').kitAffinity > impact(neutral, 'penetration_power').kitAffinity);
});

test('direção de stats lower-is-better é respeitada', () => {
  const good = evaluateAppliedModifiersForHeroV3({
    hero: { id: 'x' }, skills: [neutralSkill], baseStats: base,
    applied: [{ target: 'reload_time', before: 2, after: 1.6 }]
  });
  const bad = evaluateAppliedModifiersForHeroV3({
    hero: { id: 'x' }, skills: [neutralSkill], baseStats: base,
    applied: [{ target: 'reload_time', before: 2, after: 2.4 }]
  });
  assert.equal(impact(good, 'reload_time').direction, 'benefit');
  assert.equal(impact(bad, 'reload_time').direction, 'penalty');
  assert.ok(good.fitScore > bad.fitScore);
});

test('efeito real sem base numérica não vira neutro nem desaparece', () => {
  const result = evaluateAppliedModifiersForHeroV3({
    hero: { id: 'slayer' },
    skills: [slayerThermal],
    baseStats: base,
    applied: [],
    unknown: ['special_ability_cooldown_pct (sem base oficial)'],
    rawModifiers: [{ special_ability_cooldown_pct: -10 }]
  });
  assert.equal(result.completeCalculation, false);
  assert.equal(result.calculationCoverage, 0);
  assert.equal(result.unresolvedModifiers.length, 1);
  assert.equal(result.unresolvedModifiers[0].stat, 'special_ability_cooldown_percentual');
  assert.equal(result.unresolvedModifiers[0].kind, 'ability_cooldown');
  assert.ok(result.unresolvedModifiers[0].relevance >= .7);
  assert.ok(result.explanationConfidence < 1);
});

test('utilidade de coleta desconhecida é preservada mas não recebe peso de combate alto', () => {
  const result = evaluateAppliedModifiersForHeroV3({
    hero: { id: 'mirage' },
    skills: [mirageAgility],
    baseStats: base,
    applied: [],
    unknown: ['crate_opening_cooldown_pct (sem base oficial)'],
    rawModifiers: [{ crate_opening_cooldown_pct: -50 }]
  });
  assert.equal(result.unresolvedModifiers[0].kind, 'loot_speed');
  assert.ok(result.unresolvedModifiers[0].relevance < .2);
});

test('parser do item fit reconhece penalidade de movimento implícita de habilidade ativa', () => {
  const semantic = interpretSkillForItemFitV3(slayerThermal);
  assert.equal(semantic.trigger.active, true);
  assert.equal(semantic.trigger.selfMovementPenalty, true);
  assert.equal(semantic.trigger.wallShot, true);
});
