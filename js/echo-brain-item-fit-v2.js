import { normalizar } from './ui-core.js';

/*
 * Echo Brain — afinidade semântica herói x atributo.
 *
 * Esta camada NÃO altera nenhuma fórmula do jogo. Ela recebe os deltas já
 * calculados pelo game-stat-engine e responde outra pergunta: quanto aquele
 * atributo conversa com o kit, gatilhos e janela de combate deste herói?
 */

const STAT_EFFECT_MAP = {
  damage: ['damage', 'weapon_damage', 'damage_per_shot'],
  health_damage: ['health_damage_multiplier', 'damage_to_health'],
  armor_damage: ['armor_drone_multiplier', 'damage_to_armor', 'armor_break'],
  fire_rate: ['fire_rate', 'fire_interval'],
  reload: ['reload_time'],
  ammo: ['magazine_size', 'magazine_capacity'],
  health: ['health'],
  armor: ['armor', 'armor_value'],
  movement: ['movement_speed', 'max_movement_speed'],
  aimed_movement: ['aimed_movement_speed'],
  stealth_noise: ['movement_noise_radius', 'running_noise'],
  vision_range: ['vision_range'],
  weapon_range: ['weapon_range', 'firing_range', 'aimed_range', 'hip_fire_range'],
  aiming: [
    'aim_time', 'weapon_spread', 'spread_factor', 'dispersion',
    'aimed_dispersion', 'non_aimed_dispersion', 'moving_dispersion',
    'moving_spread_modifier'
  ],
  armor_penetration: ['weapon_armor_penetration', 'armor_penetration'],
  penetration_power: ['armor_penetration_power', 'penetration_power'],
  armor_resistance: ['armor_resistance'],
  penetration_resistance: ['penetration_resistance'],
  ability_cooldown: ['special_ability_cooldown', 'special_ability_cooldown_pct']
};

const EFFECT_PATTERNS = {
  damage: /\bdano\b(?!\s*(?:a|contra)\s*(?:a\s*)?armadura)/,
  health_damage: /dano (?:contra a )?vida|dano a vida/,
  armor_damage: /dano (?:a|contra a?) armadura|quebra de armadura/,
  fire_rate: /cadencia de tiro/,
  reload: /tempo de recarga(?: da arma)?|recarreg/,
  ammo: /munic(?:ao|oes)|carregador|pente/,
  health: /vida maxima|\+\s*\d+(?:[.,]\d+)?%?\s*(?:de\s*)?vida/,
  armor: /armadura maxima|\+\s*\d+(?:[.,]\d+)?%?\s*(?:de\s*)?armadura/,
  movement: /velocidade de movimento/,
  aimed_movement: /velocidade.{0,28}(?:ao|com) mirar|movimento.{0,28}(?:ao|com) mirar/,
  stealth_noise: /ruido de (?:movimento|corrida)|barulho/,
  vision_range: /alcance de visao|\bvisao\b/,
  weapon_range: /alcance de tiro|alcance de mira/,
  aiming: /tempo de mira|dispersao|estabilidade de mira/,
  armor_penetration: /penetracao de armadura/,
  penetration_power: /poder de perfuracao/,
  armor_resistance: /resistencia (?:de|a) armadura/,
  penetration_resistance: /resistencia (?:a|de) (?:penetracao|perfuracao)/,
  ability_cooldown: /tempo de recarga da habilidade|recarga da habilidade|cooldown da habilidade/
};

const LOWER_BETTER = new Set([
  'reload_time', 'fire_interval', 'weapon_spread', 'spread_factor', 'dispersion',
  'aim_time', 'aimed_dispersion', 'non_aimed_dispersion', 'moving_dispersion',
  'moving_spread_modifier', 'movement_noise_radius', 'running_noise',
  'special_ability_cooldown', 'special_ability_cooldown_pct'
]);

const GENERIC_VALUE = {
  damage: 0.34,
  weapon_damage: 0.34,
  damage_per_shot: 0.36,
  health_damage_multiplier: 0.34,
  damage_to_health: 0.34,
  armor_drone_multiplier: 0.34,
  damage_to_armor: 0.34,
  armor_break: 0.32,
  fire_rate: 0.32,
  fire_interval: 0.32,
  reload_time: 0.28,
  magazine_size: 0.24,
  magazine_capacity: 0.24,
  health: 0.28,
  armor: 0.28,
  armor_value: 0.28,
  movement_speed: 0.25,
  max_movement_speed: 0.25,
  aimed_movement_speed: 0.24,
  movement_noise_radius: 0.18,
  running_noise: 0.18,
  vision_range: 0.22,
  weapon_range: 0.26,
  firing_range: 0.26,
  aimed_range: 0.26,
  hip_fire_range: 0.22,
  aim_time: 0.24,
  weapon_spread: 0.24,
  spread_factor: 0.24,
  dispersion: 0.24,
  aimed_dispersion: 0.24,
  non_aimed_dispersion: 0.2,
  moving_dispersion: 0.2,
  moving_spread_modifier: 0.2,
  weapon_armor_penetration: 0.3,
  armor_penetration: 0.3,
  armor_penetration_power: 0.28,
  penetration_power: 0.28,
  armor_resistance: 0.24,
  penetration_resistance: 0.24,
  special_ability_cooldown: 0.3,
  special_ability_cooldown_pct: 0.3
};

function clamp(v, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(v) || 0));
}

function norm(v = '') {
  return String(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalStat(key = '') {
  return normalizar(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function skillConfidence(skill) {
  const status = norm(skill?.verification_status);
  if (status === 'verified' && skill?.needs_recheck === false) return 1;
  if (status === 'corroborated') return 0.82;
  return 0.62;
}

function numbersNear(text, pattern) {
  pattern.lastIndex = 0;
  const match = pattern.exec(text);
  if (!match) return [];
  const at = match.index || 0;
  return [...text.matchAll(/[+-]?\s*(\d+(?:[.,]\d+)?)\s*(%?)/g)]
    .map(m => ({
      value: Number(m[1].replace(',', '.')) || 0,
      percent: m[2] === '%',
      distance: Math.abs((m.index || 0) - at)
    }))
    .filter(n => n.distance <= 90)
    .sort((a, b) => a.distance - b.distance);
}

function semanticMagnitude(text, pattern) {
  const values = numbersNear(text, pattern);
  if (!values.length) return 0.45;
  const best = values[0];
  return best.percent
    ? clamp(0.35 + best.value / 120, 0.35, 1)
    : clamp(0.35 + Math.log10(1 + best.value) / 3.5, 0.35, 1);
}

function triggerProfile(text, type) {
  const onHit = /ao acertar|quando acerta|apos acertar/.test(text);
  const onKill = /ao eliminar|apos eliminar|eliminar um inimigo/.test(text);
  const onDamageTaken = /ao receber dano|quando recebe dano/.test(text);
  const active = /ativa/.test(type) || /ao ativar|apos ativar/.test(text);
  const passive = /passiva/.test(type) || /passivamente/.test(text);
  const team = /equipe|aliad/.test(text) || /talento de equipe/.test(type);

  return { onHit, onKill, onDamageTaken, active, passive, team };
}

function activeAvailability(skill, trigger) {
  if (!trigger.active) return 1;
  const duration = Number(skill?.duration);
  const cooldown = Number(skill?.cooldown);
  if (Number.isFinite(duration) && duration > 0 && Number.isFinite(cooldown) && cooldown > 0) {
    return clamp(0.45 + (duration / (duration + cooldown)) * 0.55, 0.45, 1);
  }
  if (Number.isFinite(duration) && duration > 0) return clamp(0.5 + duration / 25, 0.5, 0.85);
  return 0.58;
}

export function interpretSkillForItemFit(skill = {}) {
  const text = norm(`${skill?.name || ''} ${skill?.description || ''}`);
  const type = norm(skill?.skill_type || '');
  const confidence = skillConfidence(skill);
  const trigger = triggerProfile(text, type);
  const availability = activeAvailability(skill, trigger);
  const scopeFactor = trigger.team ? 0.88 : 1;
  const effects = [];

  for (const [effect, pattern] of Object.entries(EFFECT_PATTERNS)) {
    pattern.lastIndex = 0;
    if (!pattern.test(text)) continue;
    effects.push({
      effect,
      strength: clamp(semanticMagnitude(text, pattern) * confidence * availability * scopeFactor, 0, 1)
    });
  }

  return {
    name: skill?.name || 'Habilidade',
    confidence,
    trigger,
    availability,
    effects
  };
}

function reasonFor(effect, skillName, trigger) {
  const labels = {
    damage: 'dano', health_damage: 'dano contra vida', armor_damage: 'pressão contra armadura',
    fire_rate: 'cadência de tiro', reload: 'recarga', ammo: 'capacidade de munição',
    health: 'vida', armor: 'armadura', movement: 'mobilidade', aimed_movement: 'movimento ao mirar',
    stealth_noise: 'furtividade por ruído', vision_range: 'visão', weapon_range: 'alcance',
    aiming: 'precisão/mira', armor_penetration: 'penetração de armadura',
    penetration_power: 'poder de perfuração', armor_resistance: 'resistência de armadura',
    penetration_resistance: 'resistência à perfuração', ability_cooldown: 'disponibilidade da habilidade'
  };
  const suffix = trigger.onHit ? ' e depende de acertos'
    : trigger.onKill ? ' e recompensa eliminações'
      : trigger.onDamageTaken ? ' e é acionada sob pressão'
        : trigger.active ? ' durante a janela ativa'
          : '';
  return `${skillName} valoriza ${labels[effect] || effect}${suffix}.`;
}

export function buildHeroStatAffinity(hero = {}, skills = [], baseStats = {}) {
  const affinity = new Map();
  const reasons = new Map();
  const effectStrength = new Map();

  const add = (key, value, reason) => {
    const canonical = canonicalStat(key);
    if (!canonical) return;
    affinity.set(canonical, clamp((affinity.get(canonical) || 0) + value, 0, 1));
    if (reason) {
      if (!reasons.has(canonical)) reasons.set(canonical, []);
      const list = reasons.get(canonical);
      if (!list.includes(reason)) list.push(reason);
    }
  };

  for (const skill of skills || []) {
    if (skill?.enabled === false) continue;
    const semantic = interpretSkillForItemFit(skill);

    for (const detected of semantic.effects) {
      const mapped = STAT_EFFECT_MAP[detected.effect] || [];
      const strength = detected.strength;
      effectStrength.set(
        detected.effect,
        clamp((effectStrength.get(detected.effect) || 0) + strength * 0.55, 0, 1)
      );
      for (const stat of mapped) {
        add(stat, 0.34 * strength, reasonFor(detected.effect, semantic.name, semantic.trigger));
      }
    }

    /* Gatilhos mudam o valor marginal de atributos mesmo quando o texto da
       habilidade não cita diretamente aquele atributo. */
    if (semantic.trigger.onHit) {
      for (const stat of ['fire_rate', 'weapon_damage', 'damage_per_shot', 'weapon_range', 'aimed_range', 'aim_time']) {
        add(stat, 0.11 * semantic.confidence, `${semantic.name} ganha consistência quando o herói acerta mais ou cria mais oportunidades de acerto.`);
      }
    }
    if (semantic.trigger.onKill) {
      for (const stat of ['weapon_damage', 'damage_per_shot', 'fire_rate', 'reload_time', 'armor_penetration', 'penetration_power']) {
        add(stat, 0.1 * semantic.confidence, `${semantic.name} depende de converter pressão em eliminação.`);
      }
    }
    if (semantic.trigger.onDamageTaken) {
      for (const stat of ['health', 'armor', 'armor_resistance', 'penetration_resistance']) {
        add(stat, 0.1 * semantic.confidence, `${semantic.name} precisa de sobrevivência suficiente para aproveitar seu gatilho sob dano.`);
      }
    }
    if (semantic.trigger.active) {
      add('special_ability_cooldown', 0.12 * semantic.confidence, `${semantic.name} é ativa; reduzir sua recarga aumenta a frequência da janela de poder.`);
      add('special_ability_cooldown_pct', 0.12 * semantic.confidence, `${semantic.name} é ativa; reduzir sua recarga aumenta a frequência da janela de poder.`);
    }
  }

  const base = Object.fromEntries(
    Object.entries(baseStats || {}).map(([key, value]) => [canonicalStat(key), Number(value) || 0])
  );

  /* A base só dá um piso pequeno de relevância. Ela não pode sobrepor o kit:
     dano alto não significa automaticamente que todo item de dano seja o melhor. */
  if ((base.damage_per_shot || base.weapon_damage || 0) > 0) {
    add('damage_per_shot', 0.06, 'O atributo escala o dano base real da arma.');
    add('weapon_damage', 0.06, 'O atributo escala o dano base real da arma.');
  }
  if ((base.aimed_range || base.weapon_range || base.firing_range || 0) > 0) {
    add('aimed_range', 0.04, 'O atributo conversa com a janela natural de alcance da arma.');
    add('weapon_range', 0.04, 'O atributo conversa com a janela natural de alcance da arma.');
  }
  if ((base.health || 0) > 0) add('health', 0.04, 'Aumenta a reserva base de vida do herói.');
  if ((base.armor || base.armor_value || 0) > 0) add('armor', 0.04, 'Aumenta a reserva base de armadura do herói.');

  return {
    heroId: hero.databaseId || hero.id || null,
    affinity,
    reasons,
    effectStrength,
    skillsConsidered: (skills || []).filter(skill => skill?.enabled !== false).length
  };
}

function appliedStatKey(mod = {}) {
  return canonicalStat(mod.target || mod.statKey || mod.stat_key || mod.key || mod.attribute || mod.name || '');
}

function appliedDelta(mod = {}) {
  const before = Number(mod.before);
  const after = Number(mod.after);
  if (Number.isFinite(before) && Number.isFinite(after)) return after - before;
  const direct = Number(mod.delta ?? mod.change ?? mod.appliedValue ?? mod.value);
  return Number.isFinite(direct) ? direct : 0;
}

function relativeMagnitude(mod = {}, delta = 0) {
  const before = Math.abs(Number(mod.before));
  if (Number.isFinite(before) && before > 1e-9) return clamp(Math.abs(delta) / before, 0, 1);
  return clamp(Math.log10(1 + Math.abs(delta)) / 3, 0, 1);
}

function directionFor(key, delta) {
  if (Math.abs(delta) <= 1e-12) return 0;
  return LOWER_BETTER.has(key) ? (delta < 0 ? 1 : -1) : (delta > 0 ? 1 : -1);
}

export function evaluateAppliedModifiersForHero({ hero = {}, skills = [], baseStats = {}, applied = [] } = {}) {
  const profile = buildHeroStatAffinity(hero, skills, baseStats);
  const impacts = [];
  let weightedScore = 0;
  let totalWeight = 0;
  let directKitWeight = 0;
  let directTotalWeight = 0;

  for (const mod of applied || []) {
    const key = appliedStatKey(mod);
    if (!key) continue;

    const delta = appliedDelta(mod);
    const direction = directionFor(key, delta);
    if (!direction) continue;

    const kitAffinity = clamp(profile.affinity.get(key) || 0, 0, 1);
    const generic = GENERIC_VALUE[key] ?? 0.16;
    const magnitude = relativeMagnitude(mod, delta);
    const relevance = clamp(generic * 0.46 + kitAffinity * 0.54, 0.08, 1);
    const materiality = clamp(0.38 + magnitude * 0.62, 0.38, 1);
    const score = direction * relevance * materiality;
    const weight = clamp(0.35 + relevance * 0.65, 0.35, 1);

    weightedScore += score * weight;
    totalWeight += weight;
    directKitWeight += kitAffinity * materiality;
    directTotalWeight += materiality;

    impacts.push({
      stat: key,
      delta: Number(delta.toFixed(6)),
      before: Number.isFinite(Number(mod.before)) ? Number(mod.before) : null,
      after: Number.isFinite(Number(mod.after)) ? Number(mod.after) : null,
      magnitude: Number(magnitude.toFixed(3)),
      kitAffinity: Number(kitAffinity.toFixed(3)),
      relevance: Number(relevance.toFixed(3)),
      score: Number(score.toFixed(3)),
      direction: direction > 0 ? 'benefit' : 'penalty',
      reasons: [...(profile.reasons.get(key) || [])].slice(0, 4)
    });
  }

  impacts.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  const normalized = totalWeight ? clamp(weightedScore / totalWeight, -1, 1) : 0;
  const semanticAffinity = directTotalWeight ? clamp(directKitWeight / directTotalWeight, 0, 1) : 0;
  const fitScore = totalWeight
    ? Math.round(clamp(0.5 + normalized * 0.32 + semanticAffinity * 0.18, 0, 1) * 100)
    : 50;

  const activeSkills = (skills || []).filter(skill => skill?.enabled !== false);
  const explanationConfidence = activeSkills.length
    ? clamp(activeSkills.reduce((sum, skill) => sum + skillConfidence(skill), 0) / activeSkills.length, 0, 1)
    : 0;

  return {
    schemaVersion: 'echo-brain-item-fit-v2',
    heroId: profile.heroId,
    skillsConsidered: profile.skillsConsidered,
    fitScore,
    semanticAffinity: Number(semanticAffinity.toFixed(3)),
    impacts,
    strongestSynergies: impacts.filter(impact => impact.direction === 'benefit' && impact.kitAffinity >= 0.28).slice(0, 5),
    genericBenefits: impacts.filter(impact => impact.direction === 'benefit' && impact.kitAffinity < 0.28).slice(0, 5),
    conflicts: impacts.filter(impact => impact.direction === 'penalty').slice(0, 5),
    explanationConfidence: Number(explanationConfidence.toFixed(3))
  };
}
