import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  HERO_STAT_IMPORT_KEYS,
  WEAPON_MECHANICAL_IMPORT_KEYS,
  WEAPON_SUMMARY_IMPORT_KEYS,
  mapImportedHeroStats
} from '../admin/js/hero-stat-import-mapping.js';

const slayer = JSON.parse(await readFile(
  new URL('./fixtures/slayer-ocr.json', import.meta.url),
  'utf8'
));

test('Slayer preserva os cinco status distintos nas chaves canônicas', () => {
  const mapped = mapImportedHeroStats(slayer);

  assert.equal(HERO_STAT_IMPORT_KEYS.maxMovementSpeed, 'movement_speed');
  assert.equal(HERO_STAT_IMPORT_KEYS.aimedMovementSpeed, 'aimed_movement_speed');
  assert.equal(HERO_STAT_IMPORT_KEYS.movementNoiseRadius, 'movement_noise_radius');
  assert.equal(HERO_STAT_IMPORT_KEYS.armorValue, 'armor');
  assert.equal(HERO_STAT_IMPORT_KEYS.armorResistance, 'armor_resistance');

  assert.deepEqual(mapped.heroStats, {
    armor: 811,
    power: 2096,
    health: 811,
    vision_range: 600,
    movement_noise_radius: 300,
    movement_speed: 171,
    aimed_movement_speed: 51,
    penetration_resistance: 4,
    armor_resistance: 6
  });
  assert.equal(Object.hasOwn(mapped.heroStats, 'max_movement_speed'), false);
  assert.equal(Object.hasOwn(mapped.heroStats, 'armor_value'), false);
});

test('índices-resumo da arma nunca substituem os valores mecânicos', () => {
  const mapped = mapImportedHeroStats(slayer);

  assert.equal(WEAPON_SUMMARY_IMPORT_KEYS.firepower, 'weapon_firepower_score');
  assert.equal(WEAPON_SUMMARY_IMPORT_KEYS.fireRate, 'fire_rate_score');
  assert.equal(WEAPON_MECHANICAL_IMPORT_KEYS.damagePerShot, 'weapon_damage');
  assert.equal(WEAPON_MECHANICAL_IMPORT_KEYS.shotsPerSecond, 'fire_rate');

  assert.equal(mapped.weaponStats.weapon_firepower_score, 1518);
  assert.equal(mapped.weaponStats.weapon_damage, 2555);
  assert.equal(mapped.weaponStats.fire_rate_score, 183);
  assert.equal(mapped.weaponStats.fire_rate, 0.3);
  assert.equal(mapped.weaponStats.magazine_capacity_score, 38);
  assert.equal(mapped.weaponStats.magazine_size, 5);
  assert.equal(mapped.weaponStats.effective_range_score, 1500);
  assert.equal(mapped.weaponStats.weapon_range, 430);
  assert.equal(mapped.weaponName, 'RIFLE DE PRECISÃO DE SLAYER');
});

test('valor mecânico detalhado vence o cartão-resumo sem colisão heurística', () => {
  const conflicting = structuredClone(slayer);
  conflicting.status.armor = 9999;
  conflicting.status.armorValue = 811;
  conflicting.status.damage = 9999;
  conflicting.weaponDetails.damagePerShot = 2555;

  const mapped = mapImportedHeroStats(conflicting);

  assert.equal(mapped.heroStats.armor, 811);
  assert.equal(mapped.sources.hero.armor, 'status.armorValue');
  assert.equal(mapped.weaponStats.weapon_damage, 2555);
  assert.equal(mapped.sources.weapon.weapon_damage, 'weaponDetails.damagePerShot');
});
