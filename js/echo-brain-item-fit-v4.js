import { normalizeEquipmentAttributesForCalculation } from './equipment-attribute-calculation.js';
import {
  buildHeroStatAffinityV3,
  evaluateAppliedModifiersForHeroV3,
  interpretSkillForItemFitV3
} from './echo-brain-item-fit-v3.js?v=3&sc=20260906-1';

/*
 * Echo Brain Item Fit v4
 * ----------------------
 * Additive semantic behavior layer. Numeric truth still comes exclusively from
 * game-stat-engine -> Item Fit v3. v4 interprets game-rule text (trigger, scope,
 * effect and conditions) so behavior changes can alter hero-specific fit.
 */

const EFFECTS = {
  damage: /\bdano\b(?!\s*(?:a|contra)\s*(?:a\s*)?armadura)|damage/,
  health_damage: /dano (?:contra a )?vida|dano a vida|health damage/,
  armor_damage: /dano (?:a|contra a?) armadura|quebra de armadura|armor damage|armor break/,
  fire_rate: /cadencia de tiro|fire rate/,
  reload: /tempo de recarga(?: da arma)?|recarreg|reload/,
  ability_cooldown: /recarga da habilidade|cooldown da habilidade|ability cooldown/,
  ammo: /munic(?:ao|oes)|carregador|pente|magazine|ammo/,
  health: /vida maxima|max health/,
  armor: /armadura maxima|max armor/,
  movement: /velocidade de movimento|movement speed/,
  stealth_noise: /ruido de (?:movimento|corrida)|barulho|noise/,
  vision_range: /alcance de visao|\bvisao\b|vision/,
  weapon_range: /alcance de tiro|alcance de mira|weapon range|aim range/,
  aiming: /tempo de mira|dispersao|estabilidade de mira|spread|aim time/,
  armor_penetration: /penetracao de armadura|armor penetration/,
  penetration_power: /poder de perfuracao|penetration power/,
  resistance: /resistencia (?:de|a) armadura|resistencia (?:a|de) (?:penetracao|perfuracao)|resistance/,
  healing: /cura|restaura.{0,35}vida|recupera.{0,35}vida|healing/,
  armor_restore: /restaura.{0,35}armadura|recupera.{0,35}armadura/,
  shield: /escudo|parede de energia|shield/,
  control: /nao pod(?:e|em) atirar|bloqueia as armas|atord|cegueir|reduz.{0,55}(?:velocidade|cadencia)|slow|stun|blind/,
  reveal: /revela|revelad|reveal/,
  invisibility: /invis|furtiv|stealth/,
  wall_shot: /atraves de paredes|through walls/,
  deployable: /torreta|drone|implantavel|deploy/,
  collection_speed: /tempo de coleta|tempo de abertura|opening speed|pickup speed/,
  charge_restore: /restaura.{0,30}carga|recupera.{0,30}carga|charge/
};

const TRIGGERS = {
  on_hit: /ao acertar|quando acerta|apos acertar|on hit/,
  on_kill: /ao eliminar|apos eliminar|eliminar um inimigo|on kill/,
  on_damage_taken: /ao receber dano|quando recebe dano|on damage taken/,
  on_activate: /ao ativar|apos ativar|quando ativa|on activation/,
  direct_hit: /acerto direto|direct hit/,
  passive: /passiv|passive/,
  conditional: /\bse\b|\bquando\b|enquanto|durante|apenas|somente|contra|ferid|revelad/
};

const COMPLEMENTS = {
  healing: ['health', 'on_damage_taken'],
  armor_restore: ['armor', 'on_damage_taken'],
  shield: ['health', 'armor', 'active'],
  control: ['damage', 'fire_rate', 'on_hit'],
  reveal: ['weapon_range', 'aiming', 'wall_shot'],
  invisibility: ['movement', 'damage', 'on_kill'],
  wall_shot: ['penetration_power', 'damage', 'weapon_range'],
  deployable: ['active', 'ability_cooldown'],
  collection_speed: ['movement'],
  charge_restore: ['active', 'on_kill']
};

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function norm(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function signature(text = '') {
  const normalized = norm(text);
  const effects = Object.entries(EFFECTS)
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([id]) => id);
  const triggers = Object.entries(TRIGGERS)
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([id]) => id);
  const scopes = [
    /equipe|aliad|team|ally/.test(normalized) ? 'team' : null,
    /inimig|alvo|enemy|target/.test(normalized) ? 'enemy' : null,
    /raio de|em area|ao redor|nearby/.test(normalized) ? 'area' : null,
    !/equipe|aliad|team|ally|inimig|alvo|enemy|target/.test(normalized) ? 'self' : null
  ].filter(Boolean);
  return { text: normalized, effects: unique(effects), triggers: unique(triggers), scopes: unique(scopes) };
}

export function interpretEquipmentBehaviorV4(texts = []) {
  const sources = (Array.isArray(texts) ? texts : [texts])
    .map(value => String(value || '').trim())
    .filter(Boolean);
  const signatures = sources.map(signature);
  return {
    sources,
    effects: unique(signatures.flatMap(item => item.effects)),
    triggers: unique(signatures.flatMap(item => item.triggers)),
    scopes: unique(signatures.flatMap(item => item.scopes)),
    semanticCoverage: sources.length
      ? clamp(signatures.reduce((sum, item) => sum + (item.effects.length ? .55 : 0) + (item.triggers.length ? .3 : 0) + (item.scopes.length ? .15 : 0), 0) / sources.length, 0, 1)
      : 0
  };
}

function heroBehaviorProfile(hero = {}, skills = [], baseStats = {}) {
  const numericProfile = buildHeroStatAffinityV3(hero, skills, baseStats);
  const effects = new Map();
  const triggers = new Set(numericProfile.mechanics || []);

  for (const [effect, value] of numericProfile.effectStrength || []) {
    effects.set(effect, Math.max(effects.get(effect) || 0, clamp(value)));
  }

  for (const skill of skills || []) {
    if (skill?.enabled === false) continue;
    const semantic = interpretSkillForItemFitV3(skill);
    const textSemantic = signature(`${skill?.name || ''} ${skill?.description || ''}`);
    for (const effect of textSemantic.effects) {
      const direct = semantic.effects.find(item => item.effect === effect)?.strength;
      effects.set(effect, Math.max(effects.get(effect) || 0, clamp(direct ?? semantic.confidence * .55)));
    }
    for (const trigger of textSemantic.triggers) triggers.add(trigger);
    if (semantic.trigger?.active) triggers.add('active');
    if (semantic.trigger?.onHit) triggers.add('on_hit');
    if (semantic.trigger?.onKill) triggers.add('on_kill');
    if (semantic.trigger?.onDamageTaken) triggers.add('on_damage_taken');
    if (semantic.trigger?.wallShot) effects.set('wall_shot', Math.max(effects.get('wall_shot') || 0, semantic.confidence));
    if (semantic.trigger?.invisibility) effects.set('invisibility', Math.max(effects.get('invisibility') || 0, semantic.confidence));
    if (semantic.trigger?.deployable) effects.set('deployable', Math.max(effects.get('deployable') || 0, semantic.confidence));
  }

  return { numericProfile, effects, triggers };
}

function complementaryAffinity(effect, profile) {
  const candidates = COMPLEMENTS[effect] || [];
  if (!candidates.length) return 0;
  let best = 0;
  for (const candidate of candidates) {
    if (profile.triggers.has(candidate)) best = Math.max(best, .7);
    best = Math.max(best, Number(profile.effects.get(candidate) || 0));
  }
  return clamp(best);
}

function behaviorReason(effect, direct, complement, triggers = []) {
  if (direct >= .55) return `O comportamento do item reforça ${effect}, que já é parte relevante do kit do herói.`;
  if (complement >= .55) return `O efeito ${effect} complementa uma mecânica forte do kit do herói.`;
  if (triggers.length) return `O item usa o gatilho ${triggers.join('/')}; o valor depende de quão bem o herói consegue repetir essa condição.`;
  return `O efeito ${effect} tem valor de combate geral, mas não é um eixo dominante identificado no kit.`;
}

export function evaluateEquipmentBehaviorForHeroV4({
  hero = {}, skills = [], baseStats = {}, behaviorTexts = []
} = {}) {
  const behavior = interpretEquipmentBehaviorV4(behaviorTexts);
  const profile = heroBehaviorProfile(hero, skills, baseStats);

  if (!behavior.effects.length && !behavior.triggers.length) {
    return {
      schemaVersion: 'echo-brain-item-behavior-v4',
      detected: false,
      score: 50,
      affinity: 0,
      semanticCoverage: behavior.semanticCoverage,
      effects: [],
      triggers: behavior.triggers,
      scopes: behavior.scopes,
      reasons: []
    };
  }

  const effectRows = behavior.effects.map(effect => {
    const direct = clamp(profile.effects.get(effect) || 0);
    const complement = complementaryAffinity(effect, profile);
    const affinity = clamp(direct * .72 + complement * .28);
    return {
      effect,
      directAffinity: Number(direct.toFixed(3)),
      complementaryAffinity: Number(complement.toFixed(3)),
      affinity: Number(affinity.toFixed(3)),
      reason: behaviorReason(effect, direct, complement, behavior.triggers)
    };
  });

  const triggerMatches = behavior.triggers.filter(trigger => profile.triggers.has(trigger));
  const triggerAffinity = behavior.triggers.length ? triggerMatches.length / behavior.triggers.length : .5;
  const effectAffinity = effectRows.length
    ? effectRows.reduce((sum, row) => sum + row.affinity, 0) / effectRows.length
    : .5;
  const affinity = clamp(effectAffinity * .78 + triggerAffinity * .22);

  // Conservative semantic range: behavior can move fit, but cannot override the
  // official numeric engine by itself.
  const score = Math.round(clamp(.38 + affinity * .44 + behavior.semanticCoverage * .18, 0, 1) * 100);

  return {
    schemaVersion: 'echo-brain-item-behavior-v4',
    detected: true,
    score,
    affinity: Number(affinity.toFixed(3)),
    semanticCoverage: Number(behavior.semanticCoverage.toFixed(3)),
    effects: effectRows,
    triggers: behavior.triggers,
    triggerMatches,
    scopes: behavior.scopes,
    reasons: effectRows.sort((a, b) => b.affinity - a.affinity).slice(0, 4).map(row => row.reason)
  };
}

export function evaluateAppliedModifiersForHeroV4({
  hero = {}, skills = [], baseStats = {}, applied = [], unknown = [], rawModifiers = [], behaviorTexts = []
} = {}) {
  const numericModifiers = rawModifiers.map(source => source?.statusSource ? normalizeEquipmentAttributesForCalculation(source.attributes) : source);
  const numeric = evaluateAppliedModifiersForHeroV3({ hero, skills, baseStats, applied, unknown, rawModifiers: numericModifiers });
  const behavior = evaluateEquipmentBehaviorForHeroV4({ hero, skills, baseStats, behaviorTexts });

  const hasNumericEvidence = Array.isArray(numeric.impacts) && numeric.impacts.length > 0;
  const behaviorWeight = behavior.detected ? (hasNumericEvidence ? .3 : .65) : 0;
  const numericWeight = 1 - behaviorWeight;
  const fitScore = Math.round(clamp((Number(numeric.fitScore || 50) / 100) * numericWeight + (Number(behavior.score || 50) / 100) * behaviorWeight, 0, 1) * 100);
  const semanticAffinity = clamp(Number(numeric.semanticAffinity || 0) * numericWeight + Number(behavior.affinity || 0) * behaviorWeight);
  const explanationConfidence = clamp(Number(numeric.explanationConfidence || 0) * (behavior.detected ? (.82 + behavior.semanticCoverage * .18) : 1));

  return {
    ...numeric,
    schemaVersion: 'echo-brain-item-fit-v4',
    numericFitScore: numeric.fitScore,
    fitScore,
    semanticAffinity: Number(semanticAffinity.toFixed(3)),
    explanationConfidence: Number(explanationConfidence.toFixed(3)),
    behavior,
    behaviorWeight: Number(behaviorWeight.toFixed(2)),
    behaviorAware: behavior.detected
  };
}
