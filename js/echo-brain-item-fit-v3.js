/*
 * Echo Brain Item Fit v3
 * ----------------------
 * Pure semantic layer: no DOM and no Supabase dependency.
 * It NEVER replaces game-stat-engine formulas. Known deltas come from the
 * numeric engine; unknown/raw effects stay explicit and lower confidence.
 */

const STAT_EFFECT_MAP = {
  damage: ['damage_per_shot'],
  health_damage: ['health_damage_multiplier'],
  armor_damage: ['armor_drone_multiplier'],
  fire_rate: ['fire_interval'],
  reload: ['reload_time'],
  ammo: ['magazine_size'],
  health: ['health'],
  armor: ['armor'],
  movement: ['max_movement_speed'],
  aimed_movement: ['aimed_movement_speed'],
  vision_range: ['vision_range'],
  weapon_range: ['aimed_range', 'hip_fire_range'],
  aiming: ['aim_time', 'dispersion', 'aimed_dispersion', 'moving_dispersion'],
  armor_penetration: ['armor_penetration'],
  penetration_power: ['penetration_power'],
  armor_resistance: ['armor_resistance'],
  penetration_resistance: ['penetration_resistance']
};

const EFFECT_PATTERNS = {
  damage: /\bdano\b(?!\s*(?:a|contra)\s*(?:a\s*)?armadura)/,
  health_damage: /dano (?:contra a )?vida|dano a vida/,
  armor_damage: /dano (?:a|contra a?) armadura|quebra de armadura|reduz.{0,45}armadura/,
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
  penetration_resistance: /resistencia (?:a|de) (?:penetracao|perfuracao)/
};

const LOWER_BETTER = new Set([
  'reload_time', 'fire_interval', 'aim_time', 'dispersion',
  'aimed_dispersion', 'moving_dispersion'
]);

const GENERIC_VALUE = {
  damage_per_shot: .36,
  health_damage_multiplier: .34,
  armor_drone_multiplier: .34,
  fire_interval: .32,
  reload_time: .28,
  magazine_size: .24,
  health: .28,
  armor: .28,
  max_movement_speed: .25,
  aimed_movement_speed: .24,
  vision_range: .22,
  aimed_range: .26,
  hip_fire_range: .22,
  aim_time: .24,
  dispersion: .24,
  aimed_dispersion: .24,
  moving_dispersion: .20,
  armor_penetration: .30,
  penetration_power: .28,
  armor_resistance: .24,
  penetration_resistance: .24
};

/* Keys are stored in the same canonical form produced by canonicalItemStat. */
const RAW_EFFECT_KNOWLEDGE = {
  special_ability_cooldown_percentual: {
    kind: 'ability_cooldown',
    label: 'recarga da habilidade especial',
    combat: true,
    calculableWithoutBase: false
  },
  special_ability_cooldown: {
    kind: 'ability_cooldown',
    label: 'recarga da habilidade especial',
    combat: true,
    calculableWithoutBase: false
  },
  crate_opening_cooldown_percentual: {
    kind: 'loot_speed',
    label: 'tempo de abertura de caixa',
    combat: false,
    calculableWithoutBase: false
  },
  tempo_de_troca_de_modo_da_arma_primaria_percentual: {
    kind: 'weapon_mode_switch',
    label: 'troca de modo da arma primária',
    combat: true,
    calculableWithoutBase: false
  }
};

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function norm(value = '') {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalItemStat(key = '') {
  return norm(key)
    .replace(/_/g, ' ')
    .replace(/%/g, ' percentual ')
    .replace(/\b(?:porcentagem|pct)\b/g, ' percentual ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function parsePtNumber(raw = '') {
  const value = String(raw).trim().replace(/\s+/g, '');
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(value)) {
    return Number(value.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return Number(value.replace(',', '.')) || 0;
}

function skillConfidence(skill) {
  const status = norm(skill?.verification_status);
  if (status === 'verified' && skill?.needs_recheck === false) return 1;
  if (status === 'corroborated') return .82;
  return .62;
}

function numbersNear(text, pattern) {
  pattern.lastIndex = 0;
  const match = pattern.exec(text);
  if (!match) return [];
  const at = match.index || 0;
  return [...text.matchAll(/[+-]?\s*(\d+(?:[.,]\d+)*)\s*(%?)/g)]
    .map(m => ({
      value: parsePtNumber(m[1]),
      percent: m[2] === '%',
      distance: Math.abs((m.index || 0) - at)
    }))
    .filter(entry => entry.distance <= 100)
    .sort((a, b) => a.distance - b.distance);
}

function semanticMagnitude(text, pattern) {
  const values = numbersNear(text, pattern);
  if (!values.length) return .45;
  const best = values[0];
  return best.percent
    ? clamp(.35 + best.value / 120, .35, 1)
    : clamp(.35 + Math.log10(1 + best.value) / 3.5, .35, 1);
}

function triggerProfile(text, type) {
  const implicitActiveSelfMovementPenalty = /reduz(?: a)? velocidade de movimento em \d+(?:[.,]\d+)?%/.test(text)
    && !/inimig.{0,90}velocidade de movimento|velocidade de movimento dos inimig/.test(text);
  return {
    onHit: /ao acertar|quando acerta|apos acertar/.test(text),
    onKill: /ao eliminar|apos eliminar|eliminar um inimigo/.test(text),
    onDamageTaken: /ao receber dano|quando recebe dano/.test(text),
    active: /ativa/.test(type) || /ao ativar|apos ativar/.test(text),
    passive: /passiva/.test(type) || /passivamente/.test(text),
    team: /equipe|aliad/.test(text) || /talento de equipe/.test(type),
    wallShot: /atirar atraves de paredes/.test(text),
    invisibility: /invisivel|invisibilidade/.test(text),
    deployable: /torreta/.test(text),
    area: /raio de \d+/.test(text),
    periodic: /por segundo/.test(text),
    selfMovementPenalty: /reduz.{0,65}velocidade de movimento do heroi|velocidade de movimento cai/.test(text) || implicitActiveSelfMovementPenalty,
    enemyArmorDebuff: /reduz.{0,60}armadura.{0,60}(?:inimig|dele)|armadura dos inimigos.{0,55}(?:reduz|-)/.test(text)
  };
}

function activeAvailability(skill, trigger) {
  if (!trigger.active) return 1;
  const duration = Number(skill?.duration);
  const cooldown = Number(skill?.cooldown);
  if (Number.isFinite(duration) && duration > 0 && Number.isFinite(cooldown) && cooldown > 0) {
    return clamp(.45 + (duration / (duration + cooldown)) * .55, .45, 1);
  }
  if (Number.isFinite(duration) && duration > 0) return clamp(.5 + duration / 25, .5, .85);
  return .58;
}

export function interpretSkillForItemFitV3(skill = {}) {
  const text = norm(`${skill?.name || ''} ${skill?.description || ''}`);
  const type = norm(skill?.skill_type || '');
  const confidence = skillConfidence(skill);
  const trigger = triggerProfile(text, type);
  const availability = activeAvailability(skill, trigger);
  const scopeFactor = trigger.team ? .88 : 1;
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

function effectLabel(effect) {
  return ({
    damage: 'dano', health_damage: 'dano contra vida', armor_damage: 'pressão contra armadura',
    fire_rate: 'cadência de tiro', reload: 'recarga', ammo: 'capacidade de munição',
    health: 'vida', armor: 'armadura', movement: 'mobilidade', aimed_movement: 'movimento ao mirar',
    stealth_noise: 'furtividade por ruído', vision_range: 'visão', weapon_range: 'alcance',
    aiming: 'precisão/mira', armor_penetration: 'penetração de armadura',
    penetration_power: 'poder de perfuração', armor_resistance: 'resistência de armadura',
    penetration_resistance: 'resistência à perfuração'
  })[effect] || effect;
}

function reasonFor(effect, skillName, trigger) {
  const suffix = trigger.onHit ? ' e depende de acertos'
    : trigger.onKill ? ' e recompensa eliminações'
      : trigger.onDamageTaken ? ' e é acionada sob pressão'
        : trigger.active ? ' durante a janela ativa'
          : '';
  return `${skillName} valoriza ${effectLabel(effect)}${suffix}.`;
}

export function buildHeroStatAffinityV3(hero = {}, skills = [], baseStats = {}) {
  const affinity = new Map();
  const reasons = new Map();
  const effectStrength = new Map();
  const mechanics = new Set();

  const add = (key, value, reason) => {
    const canonical = canonicalItemStat(key);
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
    const semantic = interpretSkillForItemFitV3(skill);

    for (const detected of semantic.effects) {
      const mapped = STAT_EFFECT_MAP[detected.effect] || [];
      const strength = detected.strength;
      effectStrength.set(detected.effect, clamp((effectStrength.get(detected.effect) || 0) + strength * .55, 0, 1));
      for (const stat of mapped) add(stat, .34 * strength, reasonFor(detected.effect, semantic.name, semantic.trigger));
    }

    if (semantic.trigger.onHit) {
      mechanics.add('on_hit');
      for (const stat of ['fire_interval', 'damage_per_shot', 'aimed_range', 'aim_time', 'aimed_dispersion']) {
        add(stat, .13 * semantic.confidence, `${semantic.name} depende de acertar: frequência e consistência de acerto aumentam o valor do gatilho.`);
      }
    }
    if (semantic.trigger.onKill) {
      mechanics.add('on_kill');
      for (const stat of ['damage_per_shot', 'fire_interval', 'reload_time', 'armor_penetration', 'penetration_power']) {
        add(stat, .11 * semantic.confidence, `${semantic.name} recompensa eliminações; atributos que convertem pressão em abate ganham prioridade.`);
      }
    }
    if (semantic.trigger.onDamageTaken) {
      mechanics.add('on_damage_taken');
      for (const stat of ['health', 'armor', 'armor_resistance', 'penetration_resistance']) {
        add(stat, .13 * semantic.confidence, `${semantic.name} é acionada sob dano; sobreviver à troca aumenta a chance de aproveitar o gatilho.`);
      }
    }
    if (semantic.trigger.active) {
      mechanics.add('active');
      add('special_ability_cooldown_pct', .16 * semantic.confidence, `${semantic.name} é ativa; a frequência da habilidade é semanticamente relevante.`);
    }
    if (semantic.trigger.wallShot) {
      mechanics.add('wall_shot');
      add('penetration_power', .24 * semantic.confidence, `${semantic.name} permite tiros através de paredes; poder de perfuração é diretamente coerente com essa janela.`);
      add('damage_per_shot', .08 * semantic.confidence, `${semantic.name} cria janelas de tiro através de cobertura; dano por acerto ajuda a aproveitar cada janela.`);
    }
    if (semantic.trigger.invisibility) {
      mechanics.add('invisibility');
      add('max_movement_speed', .12 * semantic.confidence, `${semantic.name} usa invisibilidade para reposicionamento; mobilidade reforça entrada e saída.`);
      add('damage_per_shot', .08 * semantic.confidence, `${semantic.name} cria uma janela de emboscada; dano ajuda a converter a abertura.`);
    }
    if (semantic.trigger.deployable) {
      mechanics.add('deployable');
      add('special_ability_cooldown_pct', .12 * semantic.confidence, `${semantic.name} depende de uma unidade implantável; disponibilidade da habilidade afeta a frequência da pressão criada.`);
    }
    if (semantic.trigger.selfMovementPenalty) {
      mechanics.add('self_movement_penalty');
      add('max_movement_speed', .10 * semantic.confidence, `${semantic.name} impõe penalidade de movimento; mobilidade tem valor adicional para reduzir a vulnerabilidade fora ou ao redor dessa janela.`);
    }
    if (semantic.trigger.enemyArmorDebuff) {
      mechanics.add('enemy_armor_debuff');
      add('damage_per_shot', .08 * semantic.confidence, `${semantic.name} reduz armadura inimiga; dano ajuda a converter a janela de vulnerabilidade.`);
      add('armor_drone_multiplier', .08 * semantic.confidence, `${semantic.name} pressiona armadura inimiga; dano contra armadura complementa essa função.`);
    }
  }

  const base = Object.fromEntries(Object.entries(baseStats || {}).map(([key, value]) => [canonicalItemStat(key), Number(value) || 0]));
  if ((base.damage_per_shot || 0) > 0) add('damage_per_shot', .06, 'O atributo escala o dano base real da arma.');
  if ((base.aimed_range || 0) > 0) add('aimed_range', .04, 'O atributo conversa com a janela natural de alcance da arma.');
  if ((base.health || 0) > 0) add('health', .04, 'Aumenta a reserva base real de vida do herói.');
  if ((base.armor || 0) > 0) add('armor', .04, 'Aumenta a reserva base real de armadura do herói.');

  return {
    heroId: hero.databaseId || hero.id || null,
    affinity,
    reasons,
    effectStrength,
    mechanics: [...mechanics],
    skillsConsidered: (skills || []).filter(skill => skill?.enabled !== false).length
  };
}

function appliedStatKey(mod = {}) {
  return canonicalItemStat(mod.target || mod.statKey || mod.stat_key || mod.key || mod.attribute || mod.name || '');
}

function appliedDelta(mod = {}) {
  const before = Number(mod.before), after = Number(mod.after);
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

function rawEntries(rawModifiers = []) {
  const sources = Array.isArray(rawModifiers) ? rawModifiers : [rawModifiers];
  return sources.flatMap(source => Object.entries(source || {}));
}

function unknownKey(entry = '') {
  return canonicalItemStat(String(entry).split(' (')[0]);
}

function unresolvedKnowledge(key, profile) {
  const known = RAW_EFFECT_KNOWLEDGE[key];
  if (known) {
    let relevance = known.combat ? .22 : .08;
    const reasons = [];
    if (known.kind === 'ability_cooldown' && profile.mechanics.includes('active')) {
      relevance = .72;
      reasons.push('O herói possui habilidade ativa, então este efeito é semanticamente relevante, mas falta a base oficial para quantificar o delta final.');
    } else if (known.kind === 'loot_speed') {
      reasons.push('É utilidade de coleta; não deve ser tratada como ganho direto de combate sem contexto de modo/objetivo.');
    } else if (known.kind === 'weapon_mode_switch') {
      reasons.push('O efeito existe, mas o tempo-base e a regra interna da troca de modo não são públicos o suficiente para cálculo seguro.');
    }
    return { ...known, relevance, reasons };
  }
  return {
    kind: 'unmapped',
    label: key.replaceAll('_', ' '),
    combat: null,
    calculableWithoutBase: false,
    relevance: .12,
    reasons: ['Efeito cadastrado sem regra numérica oficial suficiente no motor; o Brain não assume impacto zero.']
  };
}

export function evaluateAppliedModifiersForHeroV3({
  hero = {}, skills = [], baseStats = {}, applied = [], unknown = [], rawModifiers = []
} = {}) {
  const profile = buildHeroStatAffinityV3(hero, skills, baseStats);
  const impacts = [];
  let weightedScore = 0, totalWeight = 0, directKitWeight = 0, directTotalWeight = 0;

  for (const mod of applied || []) {
    const key = appliedStatKey(mod);
    if (!key) continue;
    const delta = appliedDelta(mod);
    const direction = mod.benefitDirection === 'neutral' ? 0
      : mod.benefitDirection === 'lower' ? -Math.sign(delta)
      : mod.benefitDirection === 'higher' ? Math.sign(delta) : directionFor(key, delta);
    if (!direction) continue;

    const kitAffinity = clamp(profile.affinity.get(key) || 0, 0, 1);
    const generic = GENERIC_VALUE[key] ?? .16;
    const magnitude = relativeMagnitude(mod, delta);
    const relevance = clamp(generic * .44 + kitAffinity * .56, .08, 1);
    const materiality = clamp(.38 + magnitude * .62, .38, 1);
    const score = direction * relevance * materiality;
    const weight = clamp(.35 + relevance * .65, .35, 1);

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

  const unknownKeys = new Set((unknown || []).map(unknownKey).filter(Boolean));
  const rawMap = new Map(rawEntries(rawModifiers).map(([key, value]) => [canonicalItemStat(key), value]));
  const unresolvedModifiers = [...unknownKeys].map(key => {
    const knowledge = unresolvedKnowledge(key, profile);
    return { stat: key, rawValue: rawMap.has(key) ? rawMap.get(key) : null, ...knowledge };
  });

  const normalized = totalWeight ? clamp(weightedScore / totalWeight, -1, 1) : 0;
  const semanticAffinity = directTotalWeight ? clamp(directKitWeight / directTotalWeight, 0, 1) : 0;
  const knownFit = totalWeight ? clamp(.5 + normalized * .32 + semanticAffinity * .18, 0, 1) : .5;
  const knownModifierCount = impacts.length;
  const unresolvedCount = unresolvedModifiers.length;
  const calculationCoverage = (knownModifierCount + unresolvedCount)
    ? knownModifierCount / (knownModifierCount + unresolvedCount)
    : 1;
  const uncertaintyPenalty = unresolvedModifiers.reduce((sum, entry) => sum + Number(entry.relevance || 0), 0) / Math.max(1, unresolvedCount);
  const fitScore = Math.round(clamp(knownFit - (1 - calculationCoverage) * uncertaintyPenalty * .10, 0, 1) * 100);

  const activeSkills = (skills || []).filter(skill => skill?.enabled !== false);
  const sourceConfidence = activeSkills.length
    ? clamp(activeSkills.reduce((sum, skill) => sum + skillConfidence(skill), 0) / activeSkills.length, 0, 1)
    : 0;
  const explanationConfidence = clamp(sourceConfidence * (.72 + calculationCoverage * .28), 0, 1);

  return {
    schemaVersion: 'echo-brain-item-fit-v3',
    heroId: profile.heroId,
    skillsConsidered: profile.skillsConsidered,
    mechanics: profile.mechanics,
    fitScore,
    semanticAffinity: Number(semanticAffinity.toFixed(3)),
    calculationCoverage: Number(calculationCoverage.toFixed(3)),
    completeCalculation: unresolvedCount === 0,
    impacts,
    unresolvedModifiers,
    strongestSynergies: impacts.filter(impact => impact.direction === 'benefit' && impact.kitAffinity >= .28).slice(0, 5),
    genericBenefits: impacts.filter(impact => impact.direction === 'benefit' && impact.kitAffinity < .28).slice(0, 5),
    conflicts: impacts.filter(impact => impact.direction === 'penalty').slice(0, 5),
    explanationConfidence: Number(explanationConfidence.toFixed(3))
  };
}
