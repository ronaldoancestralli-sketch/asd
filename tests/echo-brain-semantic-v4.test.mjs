import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SEMANTIC_CONTEXT_FEATURE_NAMES,
  SEMANTIC_CONTEXT_FEATURE_SCHEMA_VERSION,
  semanticContextFeatureVector,
  skillSemanticsV3
} from '../supabase/functions/_shared/echo-brain-semantic.ts';
import {
  SEMANTIC_CONTEXT_V4_FEATURE_NAMES,
  SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION,
  featureNamesForSchemaV4,
  featureVectorV4,
  isSupportedFeatureSchemaV4,
  semanticContextV4FeatureVector,
  semanticCorrectionsV4
} from '../supabase/functions/_shared/echo-brain-semantic-v4.ts';

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

const slayerThermal = verified(
  'Visão Térmica',
  'No nível máximo, permite atirar através de paredes por 9 s, reduz a velocidade de movimento em 70% e concede +10 de poder de perfuração. Eliminar um inimigo durante o efeito restaura 1 carga; após ativar, o herói não pode atirar por 0,5 s.',
  'Ativa', 9, 9
);

const smogLauncher = verified(
  'Lança-granadas',
  'No nível máximo, dispara um projétil explosivo que causa até 1.455 de dano em um raio de 200. Um acerto direto remove escudos móveis e paredes de energia.',
  'Ativa', 2, null
);

const smogRecovery = verified(
  'Kit de Combate',
  'No nível máximo, reduz a velocidade de movimento do herói em 90% por 5 s e impede disparos durante esse período. Após 5 s, restaura 1.220 de vida e armadura; também concede +550 de vida máxima e +550 de armadura máxima por 10 s.',
  'Ativa de recuperação', 10, null
);

const ghostInvisibility = verified(
  'Invisibilidade',
  'No nível máximo, torna o herói invisível por 7 s; receber dano encerra a invisibilidade. Durante o efeito, a velocidade de movimento aumenta 20%. Ao sair da invisibilidade, o dano aumenta 30% por 2 s e o herói fica sem poder atirar por 0,5 s.',
  'Ativa', 5, 7
);

const leviathanOppression = verified(
  'Opressão',
  'No nível máximo, ao eliminar um inimigo, reduz em 50% a cadência de tiro e em 55% a velocidade de movimento dos inimigos em um raio de 400 por 4,5 s.',
  'Talento de equipe', null, 4.5
);

const blotWall = verified(
  'Campo de Força',
  'No nível máximo, cria uma parede de energia com durabilidade 28 que bloqueia dano de armas por 9 s e concede +45 de alcance de mira e +45 de alcance de tiro. Inimigos que atravessam a parede não podem atirar e têm a velocidade de movimento reduzida em 90%.',
  'Ativa', 4, 9
);

const hero = (id, class_id, skills) => ({ id, class_id, skills });

function featureValue(names, vector, name) {
  const index = names.indexOf(name);
  assert.notEqual(index, -1, `feature ausente: ${name}`);
  return vector[index];
}

test('v4 é aditiva e preserva exatamente o prefixo v3', () => {
  const team = [
    hero('slayer', 'sniper', [slayerThermal]),
    hero('smog', 'tank', [smogLauncher, smogRecovery]),
    hero('ghost', 'scout', [ghostInvisibility])
  ];
  const v3 = semanticContextFeatureVector(team);
  const v4 = semanticContextV4FeatureVector(team);
  assert.equal(v3.length, SEMANTIC_CONTEXT_FEATURE_NAMES.length);
  assert.equal(v4.length, SEMANTIC_CONTEXT_V4_FEATURE_NAMES.length);
  assert.ok(v4.length > v3.length);
  assert.deepEqual(v4.slice(0, v3.length), v3);
});

test('v4 continua reconhecendo v1-v3 e reconhece o novo schema', () => {
  assert.equal(isSupportedFeatureSchemaV4(SEMANTIC_CONTEXT_FEATURE_SCHEMA_VERSION), true);
  assert.equal(isSupportedFeatureSchemaV4(SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION), true);
  assert.deepEqual(featureNamesForSchemaV4(SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION), SEMANTIC_CONTEXT_V4_FEATURE_NAMES);
});

test('Slayer: penalidade própria não é confundida com controle inimigo', () => {
  const semantic = semanticCorrectionsV4(slayerThermal);
  assert.ok(semantic.effects.self_weapon_disable > 0);
  assert.ok(semantic.effects.self_movement_penalty > 0);
  assert.ok(semantic.effects.active_penalty_burden > 0);
  assert.equal(semantic.effects.enemy_weapon_disable, undefined);
});

test('Smog Kit de Combate: entende canal de recuperação com custo próprio e atraso', () => {
  const semantic = semanticCorrectionsV4(smogRecovery);
  assert.ok(semantic.effects.self_weapon_disable > 0);
  assert.ok(semantic.effects.self_movement_penalty > 0);
  assert.ok(semantic.effects.self_recovery_channel > 0);
  assert.ok(semantic.effects.delayed_recovery > 0);
});

test('Ghost: entende invisibilidade, interrupção e janela ofensiva após sair', () => {
  const v3 = skillSemanticsV3(ghostInvisibility);
  const v4 = semanticCorrectionsV4(ghostInvisibility);
  assert.ok(v3.contextEffects.invisibility > 0);
  assert.equal(v3.contextTriggers.interrupted_on_damage, true);
  assert.ok(v4.effects.post_stealth_damage_window > 0);
  assert.ok(v4.effects.self_weapon_disable > 0);
});

test('Smog lança-granadas: 1.455 é lido como milhar e acerto direto remove escudo', () => {
  const v3 = skillSemanticsV3(smogLauncher);
  const v4 = semanticCorrectionsV4(smogLauncher);
  assert.ok(v3.contextEffects.ability_damage >= 0.75, `força inesperada: ${v3.contextEffects.ability_damage}`);
  assert.ok(v3.contextEffects.shield_break > 0);
  assert.equal(v3.contextTriggers.direct_hit, true);
  assert.ok(v4.effects.direct_hit_shield_break > 0);
});

test('controle inimigo é separado de penalidade própria', () => {
  const wall = semanticCorrectionsV4(blotWall);
  const oppression = semanticCorrectionsV4(leviathanOppression);
  assert.ok(wall.effects.enemy_weapon_disable > 0);
  assert.equal(wall.effects.self_weapon_disable, undefined);
  assert.ok(oppression.effects.enemy_movement_slow > 0);
  assert.equal(oppression.effects.self_movement_penalty, undefined);
});

test('vetor v4 materializa sinais corretivos em posições estáveis', () => {
  const team = [
    hero('slayer', 'sniper', [slayerThermal]),
    hero('smog', 'tank', [smogLauncher, smogRecovery]),
    hero('ghost', 'scout', [ghostInvisibility])
  ];
  const vector = featureVectorV4(team, SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION);
  assert.ok(featureValue(SEMANTIC_CONTEXT_V4_FEATURE_NAMES, vector, 'correction_self_weapon_disable') > 0);
  assert.ok(featureValue(SEMANTIC_CONTEXT_V4_FEATURE_NAMES, vector, 'correction_self_movement_penalty') > 0);
  assert.ok(featureValue(SEMANTIC_CONTEXT_V4_FEATURE_NAMES, vector, 'correction_post_stealth_damage_window') > 0);
  assert.ok(featureValue(SEMANTIC_CONTEXT_V4_FEATURE_NAMES, vector, 'correction_direct_hit_shield_break') > 0);
});
