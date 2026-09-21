const HERO_STAT_IMPORT_KEYS = Object.freeze({
  power: 'power',
  health: 'health',
  armor: 'armor',
  visionRange: 'vision_range',
  movementNoiseRadius: 'movement_noise_radius',
  maxMovementSpeed: 'movement_speed',
  aimedMovementSpeed: 'aimed_movement_speed',
  penetrationResistance: 'penetration_resistance',
  armorValue: 'armor',
  armorResistance: 'armor_resistance'
});

const WEAPON_SUMMARY_IMPORT_KEYS = Object.freeze({
  firepower: 'weapon_firepower_score',
  armorBreak: 'armor_break_score',
  fireRate: 'fire_rate_score',
  magazineCapacity: 'magazine_capacity_score',
  effectiveRange: 'effective_range_score',
  aimingStability: 'aiming_stability_score'
});

const WEAPON_MECHANICAL_IMPORT_KEYS = Object.freeze({
  damagePerShot: 'weapon_damage',
  healthDamageMultiplier: 'life_damage_multiplier',
  armorPenetration: 'weapon_armor_penetration',
  penetrationPower: 'armor_penetration_power',
  armorDroneMultiplier: 'armor_damage_multiplier',
  shotsPerSecond: 'fire_rate',
  reloadTime: 'reload_time',
  magazineSize: 'magazine_size',
  hipFireRange: 'weapon_range',
  aimedRange: 'aimed_weapon_range',
  dispersion: 'weapon_spread',
  movingDispersion: 'moving_spread_modifier',
  aimedDispersion: 'aimed_spread',
  aimTime: 'aim_time',
  dispersionFactor: 'spread_factor'
});

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = typeof value === 'string'
    ? value.replace(',', '.').trim()
    : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function assignStat(target, sources, statKey, value, sourcePath, priority) {
  const numeric = nullableNumber(value);
  if (numeric === null) return;
  const current = sources[statKey];
  if (current && current.priority > priority) return;
  target[statKey] = numeric;
  sources[statKey] = { sourcePath, priority };
}

function mapFields(target, sources, source, bindings, sourcePrefix, priority) {
  for (const [sourceKey, statKey] of Object.entries(bindings)) {
    assignStat(
      target,
      sources,
      statKey,
      source?.[sourceKey],
      `${sourcePrefix}.${sourceKey}`,
      priority
    );
  }
}

export function mapImportedHeroStats(data = {}) {
  const status = data.status && typeof data.status === 'object' ? data.status : {};
  const weaponSummary = data.weaponSummary && typeof data.weaponSummary === 'object'
    ? data.weaponSummary
    : {};
  const weaponDetails = data.weaponDetails && typeof data.weaponDetails === 'object'
    ? data.weaponDetails
    : {};

  const heroStats = {};
  const weaponStats = {};
  const heroSources = {};
  const weaponSources = {};

  // Os cartões-resumo de dano e armadura são apenas alternativas quando a
  // tela detalhada não foi capturada. Os valores mecânicos têm prioridade.
  assignStat(heroStats, heroSources, 'armor', status.armor, 'status.armor', 10);
  assignStat(weaponStats, weaponSources, 'weapon_damage', status.damage, 'status.damage', 10);

  mapFields(
    heroStats,
    heroSources,
    status,
    HERO_STAT_IMPORT_KEYS,
    'status',
    100
  );

  // armorValue é o valor mecânico exibido no painel detalhado e substitui
  // deliberadamente o cartão-resumo status.armor.
  assignStat(heroStats, heroSources, 'armor', status.armorValue, 'status.armorValue', 200);

  // Índices visuais não podem ocupar as chaves mecânicas da arma.
  mapFields(
    weaponStats,
    weaponSources,
    weaponSummary,
    WEAPON_SUMMARY_IMPORT_KEYS,
    'weaponSummary',
    100
  );
  mapFields(
    weaponStats,
    weaponSources,
    weaponDetails,
    WEAPON_MECHANICAL_IMPORT_KEYS,
    'weaponDetails',
    200
  );

  return {
    heroStats,
    weaponStats,
    weaponName: weaponSummary.name || weaponDetails.name || null,
    sources: {
      hero: Object.fromEntries(Object.entries(heroSources).map(([key, item]) => [key, item.sourcePath])),
      weapon: Object.fromEntries(Object.entries(weaponSources).map(([key, item]) => [key, item.sourcePath]))
    }
  };
}

export {
  HERO_STAT_IMPORT_KEYS,
  WEAPON_MECHANICAL_IMPORT_KEYS,
  WEAPON_SUMMARY_IMPORT_KEYS
};
