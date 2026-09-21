/*
 * Echo Brain · composition equipment context v1
 * ------------------------------------------------
 * Deterministic, cold-start context for composition scoring.
 *
 * This module NEVER assumes that a player equipped any item. It measures only
 * how well the currently available, eligible equipment catalogue can support
 * each hero's verified mechanics. The learned Semantic v4 feature vector stays
 * untouched; this is a bounded deterministic correction to its baseline.
 */

export const COMPOSITION_EQUIPMENT_CONTEXT_V1_SCHEMA = 'composition-equipment-context-v1';
import { equipmentEligibility } from '../../../js/equipment-eligibility.js';
export const COMPOSITION_EQUIPMENT_CONTEXT_V1_MAX_ADJUSTMENT = 4;

const EFFECT_PATTERNS: Record<string, RegExp> = {
  damage: /\bdano\b(?!\s*(?:a|contra)\s*(?:a\s*)?armadura)|damage/,
  health_damage: /dano (?:contra a )?vida|dano a vida|health damage/,
  armor_damage: /dano (?:a|contra a?) armadura|quebra de armadura|armor damage|armor break/,
  fire_rate: /cadencia de tiro|fire rate/,
  reload: /tempo de recarga(?: da arma)?|recarreg|reload/,
  ability_cooldown: /recarga da habilidade|cooldown da habilidade|ability cooldown/,
  ammo: /munic(?:ao|oes)|carregador|pente|magazine|ammo/,
  health: /vida maxima|max health/,
  armor: /armadura maxima|max armor/,
  damage_reduction: /reduz.{0,50}dano recebido|menos dano recebido|damage reduction/,
  movement: /velocidade de movimento|movement speed/,
  stealth_noise: /ruido de (?:movimento|corrida)|barulho|noise/,
  vision_range: /alcance de visao|\bvisao\b|vision range/,
  weapon_range: /alcance de tiro|alcance de mira|weapon range|aim range/,
  aiming: /tempo de mira|dispersao|estabilidade de mira|spread|aim time/,
  armor_penetration: /penetracao de armadura|armor penetration/,
  penetration_power: /poder de perfuracao|penetration power/,
  resistance: /resistencia (?:de|a) armadura|resistencia (?:a|de) (?:penetracao|perfuracao)|resistance/,
  healing: /cura|restaura.{0,35}vida|recupera.{0,35}vida|healing/,
  armor_restore: /restaura.{0,35}armadura|recupera.{0,35}armadura|armor restore/,
  shield: /escudo|parede de energia|campo de forca|shield/,
  control: /nao pod(?:e|em) atirar|bloqueia as armas|atord|cegueir|reduz.{0,55}(?:velocidade|cadencia)|slow|stun|blind/,
  reveal: /revela|revelad|visao termica|reveal/,
  invisibility: /invis|furtiv|stealth/,
  wall_shot: /atraves de paredes|through walls/,
  deployable: /torreta|drone|implantavel|deploy/,
  collection_speed: /tempo de coleta|tempo de abertura|opening speed|pickup speed/,
  charge_restore: /restaura.{0,30}carga|recupera.{0,30}carga|charge/
};

const TRIGGER_PATTERNS: Record<string, RegExp> = {
  on_hit: /ao acertar|quando acerta|apos acertar|on hit/,
  on_kill: /ao eliminar|apos eliminar|eliminar um inimigo|on kill/,
  on_damage_taken: /ao receber dano|quando recebe dano|on damage taken/,
  on_activate: /ao ativar|apos ativar|quando ativa|ativa\b|on activation/,
  direct_hit: /acerto direto|direct hit/,
  passive: /passiv|passive/,
  conditional: /\bse\b|\bquando\b|enquanto|durante|apenas|somente|contra|ferid|revelad/
};

const COMPLEMENTS: Record<string, string[]> = {
  healing: ['health', 'on_damage_taken'],
  armor_restore: ['armor', 'on_damage_taken'],
  shield: ['health', 'armor', 'on_activate'],
  control: ['damage', 'fire_rate', 'on_hit'],
  reveal: ['weapon_range', 'aiming', 'wall_shot'],
  invisibility: ['movement', 'damage', 'on_kill'],
  wall_shot: ['penetration_power', 'armor_penetration', 'damage', 'weapon_range'],
  deployable: ['on_activate', 'ability_cooldown'],
  collection_speed: ['movement'],
  charge_restore: ['on_activate', 'on_kill'],
  resistance: ['armor', 'health'],
  damage_reduction: ['health', 'armor']
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function norm(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function semantics(text: string) {
  const normalized = norm(text);
  const effects = Object.entries(EFFECT_PATTERNS)
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([id]) => id);
  const triggers = Object.entries(TRIGGER_PATTERNS)
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([id]) => id);
  return {
    effects: unique(effects),
    triggers: unique(triggers),
    detected: effects.length > 0 || triggers.length > 0
  };
}

function attributeText(attributes: unknown) {
  if (Array.isArray(attributes)) {
    return attributes.map(row => {
      if (!row || typeof row !== 'object') return String(row || '');
      const value = row as Record<string, unknown>;
      return `${value.label || value.key || value.name || ''} ${typeof value.value === 'string' ? value.value : ''}`;
    }).join(' ');
  }
  if (attributes && typeof attributes === 'object') {
    return Object.entries(attributes as Record<string, unknown>)
      .map(([key, value]) => `${key} ${typeof value === 'string' ? value : ''}`)
      .join(' ');
  }
  return String(attributes || '');
}

function equipmentText(item: any) {
  const variantText = (item?.variants || [])
    .map((variant: any) => attributeText(variant?.attributes))
    .join(' ');
  return `${item?.name || ''} ${item?.description || ''} ${variantText}`;
}

function heroProfile(hero: any) {
  const effectStrength = new Map<string, number>();
  const triggers = new Set<string>();
  let skillCount = 0;
  let verifiedCount = 0;

  for (const skill of hero?.skills || []) {
    if (skill?.enabled === false) continue;
    skillCount += 1;
    const verified = norm(skill?.verification_status) === 'verified' && skill?.needs_recheck === false;
    if (verified) verifiedCount += 1;
    const confidence = verified ? 1 : norm(skill?.verification_status) === 'corroborated' ? .82 : .62;
    const parsed = semantics(`${skill?.name || ''} ${skill?.description || ''} ${skill?.skill_type || ''}`);
    for (const effect of parsed.effects) {
      effectStrength.set(effect, Math.max(effectStrength.get(effect) || 0, confidence));
    }
    for (const trigger of parsed.triggers) triggers.add(trigger);
  }

  return {
    effects: effectStrength,
    triggers,
    skillCount,
    verifiedCoverage: skillCount ? verifiedCount / skillCount : 0
  };
}

function eligibility(item: any, hero: any) {
  const result = equipmentEligibility(item, hero);
  return { ...result, weight: result.eligible ? ({ hero: 1, class: .9, generic: .78 }[result.scope] || 0) : 0 };
}

function complementAffinity(effect: string, profile: ReturnType<typeof heroProfile>) {
  let best = 0;
  for (const candidate of COMPLEMENTS[effect] || []) {
    if (profile.triggers.has(candidate)) best = Math.max(best, .72);
    best = Math.max(best, Number(profile.effects.get(candidate) || 0));
  }
  return clamp(best);
}

function itemAffinity(item: any, hero: any, profile: ReturnType<typeof heroProfile>) {
  const eligible = eligibility(item, hero);
  if (!eligible.eligible) return null;
  const parsed = semantics(equipmentText(item));
  if (!parsed.detected) return {
    detected: false,
    affinity: 0,
    semanticCoverage: 0,
    scope: eligible.scope,
    scopeWeight: eligible.weight,
    effects: [],
    triggers: []
  };

  const effectRows = parsed.effects.map(effect => {
    const direct = clamp(Number(profile.effects.get(effect) || 0));
    const complement = complementAffinity(effect, profile);
    return clamp(direct * .72 + complement * .28);
  });
  const effectAffinity = effectRows.length
    ? effectRows.reduce((sum, value) => sum + value, 0) / effectRows.length
    : .5;
  const triggerAffinity = parsed.triggers.length
    ? parsed.triggers.filter(trigger => profile.triggers.has(trigger)).length / parsed.triggers.length
    : .5;
  const semanticCoverage = clamp((parsed.effects.length ? .72 : 0) + (parsed.triggers.length ? .28 : 0));
  const rawAffinity = clamp(effectAffinity * .76 + triggerAffinity * .16 + semanticCoverage * .08);
  // Eligibility specificity matters, but generic items remain useful context.
  const affinity = clamp(.5 + (rawAffinity - .5) * eligible.weight);

  return {
    detected: true,
    affinity,
    semanticCoverage,
    scope: eligible.scope,
    scopeWeight: eligible.weight,
    effects: parsed.effects,
    triggers: parsed.triggers
  };
}

function heroEquipmentSupport(hero: any, catalogue: any[]) {
  const profile = heroProfile(hero);
  const eligibleItems = catalogue
    .map(item => ({ item, eligibility: eligibility(item, hero) }))
    .filter(row => row.eligibility.eligible);

  const semanticRows = eligibleItems.map(row => {
    const fit = itemAffinity(row.item, hero, profile);
    return fit?.detected ? { item: row.item, fit } : null;
  }).filter(Boolean) as { item: any; fit: NonNullable<ReturnType<typeof itemAffinity>> }[];

  const bySlot = new Map<string, { item: any; fit: NonNullable<ReturnType<typeof itemAffinity>> }[]>();
  for (const row of semanticRows) {
    const slot = String(row.item?.slot_id || row.item?.slot || 'unknown');
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot)!.push(row);
  }

  const bestBySlot = [...bySlot.entries()].map(([slot, rows]) => {
    const sorted = [...rows].sort((a, b) => b.fit.affinity - a.fit.affinity);
    const best = sorted[0];
    return {
      slot,
      affinity: best.fit.affinity,
      itemId: best.item?.id || null,
      itemName: best.item?.name || null,
      scope: best.fit.scope
    };
  });

  const meanAffinity = bestBySlot.length
    ? bestBySlot.reduce((sum, row) => sum + row.affinity, 0) / bestBySlot.length
    : .5;
  const catalogueSemanticCoverage = eligibleItems.length
    ? semanticRows.length / eligibleItems.length
    : 0;
  const slotCoverage = Math.min(1, bestBySlot.length / 3);
  const confidence = clamp(
    profile.verifiedCoverage * .42 +
    catalogueSemanticCoverage * .30 +
    slotCoverage * .28
  );
  const sufficient = Boolean(
    profile.skillCount > 0 &&
    profile.verifiedCoverage >= .5 &&
    eligibleItems.length >= 2 &&
    semanticRows.length >= 2 &&
    bestBySlot.length >= 2 &&
    catalogueSemanticCoverage >= .25 &&
    confidence >= .5
  );

  return {
    heroId: hero?.id || null,
    eligibleItems: eligibleItems.length,
    semanticItems: semanticRows.length,
    coveredSlots: bestBySlot.length,
    semanticCoverage: round(catalogueSemanticCoverage),
    verifiedSkillCoverage: round(profile.verifiedCoverage),
    supportAffinity: round(meanAffinity),
    confidence: round(confidence),
    sufficient,
    bestBySlot: bestBySlot.map(row => ({ ...row, affinity: round(row.affinity) }))
  };
}

export function assessCompositionEquipmentContextV1(heroes: any[] = [], catalogue: any[] = []) {
  const team = (heroes || []).filter(Boolean).slice(0, 3);
  const assumptions = {
    mode: 'available-equipment-support-potential',
    selectedLoadoutAssumed: false,
    setBonusesAssumed: false,
    catalogueSizeDoesNotDirectlyIncreaseScore: true,
    bestSemanticSupportPerSlotOnly: true
  };

  if (team.length !== 3 || new Set(team.map(hero => hero?.id).filter(Boolean)).size !== 3) {
    return {
      schemaVersion: COMPOSITION_EQUIPMENT_CONTEXT_V1_SCHEMA,
      complete: false,
      applied: false,
      adjustment: 0,
      confidence: 0,
      assumptions,
      heroes: [],
      reasons: ['O contexto de equipamentos exige três heróis diferentes.']
    };
  }

  const heroRows = team.map(hero => heroEquipmentSupport(hero, catalogue || []));
  const sufficient = heroRows.every(row => row.sufficient);
  const meanAffinity = heroRows.reduce((sum, row) => sum + row.supportAffinity, 0) / 3;
  const confidence = heroRows.reduce((sum, row) => sum + row.confidence, 0) / 3;

  // Strictly bounded. .5 is neutral; even perfect catalogue support can add
  // at most +4 and complete mismatch can subtract at most -4.
  const rawAdjustment = (meanAffinity - .5) * (COMPOSITION_EQUIPMENT_CONTEXT_V1_MAX_ADJUSTMENT * 2);
  const adjustment = sufficient
    ? Math.max(-COMPOSITION_EQUIPMENT_CONTEXT_V1_MAX_ADJUSTMENT, Math.min(COMPOSITION_EQUIPMENT_CONTEXT_V1_MAX_ADJUSTMENT, rawAdjustment))
    : 0;

  const reasons: string[] = [];
  if (!sufficient) {
    reasons.push('O catálogo não tem cobertura semântica suficiente para os três heróis; nenhum ajuste de composição foi aplicado.');
  } else if (adjustment >= 1) {
    reasons.push('O catálogo atual oferece suporte semântico consistente às mecânicas dos três heróis, sem presumir um loadout específico.');
  } else if (adjustment <= -1) {
    reasons.push('O catálogo elegível atual oferece pouco suporte direto às mecânicas dominantes do trio, sem presumir um loadout específico.');
  } else {
    reasons.push('O suporte potencial do catálogo é próximo do neutro para este trio.');
  }

  return {
    schemaVersion: COMPOSITION_EQUIPMENT_CONTEXT_V1_SCHEMA,
    complete: true,
    applied: sufficient,
    adjustment: round(adjustment, 2),
    confidence: round(confidence),
    supportAffinity: round(meanAffinity),
    assumptions,
    heroes: heroRows,
    reasons
  };
}
