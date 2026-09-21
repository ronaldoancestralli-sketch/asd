import {
  analyzeEquipmentEvolution,
  canonicalEquipmentAttribute,
  normalizeEquipmentText
} from './echo-brain-equipment-evolution-v1.js';

/*
 * Equipment Evolution v2
 * ----------------------
 * Additive layer over v1. v1 remains immutable for audit/replay. v2 upgrades
 * text changes when the same trigger keeps its wording but effect magnitude,
 * target, duration or combat mechanic changes.
 */

const EFFECT_PATTERNS = {
  damage: /dano|damage/,
  health_damage: /dano.{0,20}vida|health damage/,
  armor_damage: /dano.{0,20}armadura|armor damage|quebra de armadura/,
  fire_rate: /cadencia|fire rate/,
  reload: /recarga da arma|reload/,
  ability_cooldown: /recarga da habilidade|cooldown da habilidade|ability cooldown/,
  ammo: /munic|carregador|magazine|ammo/,
  health: /vida maxima|max health/,
  armor: /armadura maxima|max armor/,
  movement: /velocidade de movimento|movement speed/,
  vision: /visao|vision/,
  range: /alcance|range/,
  aiming: /mira|dispers|spread|aim/,
  penetration: /penetr|perfur|penetration/,
  resistance: /resistencia|resistance/,
  healing: /cura|restaura.{0,30}vida|recupera.{0,30}vida|healing/,
  shield: /escudo|parede de energia|shield/,
  control: /nao pod(?:e|em) atirar|bloqueia as armas|atord|cegueir|slow|reduz.{0,40}velocidade/,
  stealth: /invis|furtiv|stealth/,
  reveal: /revela|reveal/,
  wall_shot: /atraves de paredes|through walls/,
  deployable: /torreta|drone|deploy/,
  collection_speed: /tempo de coleta|tempo de abertura|opening speed|pickup speed/
};

const TRIGGER_PATTERNS = {
  on_hit: /ao acertar|quando acerta|on hit/,
  on_kill: /ao eliminar|apos eliminar|on kill/,
  on_damage_taken: /ao receber dano|quando recebe dano|on damage taken/,
  active: /ao ativar|quando ativa|active/,
  passive: /passiv|passive/,
  direct_hit: /acerto direto|direct hit/,
  conditional: /\bse\b|\bquando\b|enquanto|durante|apenas|somente|contra|ferid|revelad/
};

function parseLocaleNumber(raw) {
  const token = String(raw || '').replace(/\s+/g, '');
  const percent = token.includes('%');
  let value = token.replace('%', '');
  if (/^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(value)) {
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (value.includes(',') && !value.includes('.')) {
    value = value.replace(',', '.');
  } else if (value.includes(',') && value.includes('.')) {
    const comma = value.lastIndexOf(',');
    const dot = value.lastIndexOf('.');
    value = comma > dot ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
  }
  const number = Number(value);
  return Number.isFinite(number) ? `${number}${percent ? '%' : ''}` : token;
}

function numberSignature(text = '') {
  const normalized = normalizeEquipmentText(text);
  return [...normalized.matchAll(/[+-]?\s*\d+(?:[.,]\d+)*(?:\s*%)?/g)]
    .map(match => parseLocaleNumber(match[0]))
    .filter(Boolean);
}

function semanticSignature(text = '') {
  const normalized = normalizeEquipmentText(text);
  const effects = Object.entries(EFFECT_PATTERNS)
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([id]) => id)
    .sort();
  const triggers = Object.entries(TRIGGER_PATTERNS)
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([id]) => id)
    .sort();
  const scopes = [
    /equipe|aliad|team|ally/.test(normalized) ? 'team' : null,
    /inimig|alvo|enemy|target/.test(normalized) ? 'enemy' : null,
    /raio de|em area|ao redor|nearby/.test(normalized) ? 'area' : null
  ].filter(Boolean).sort();
  return { effects, triggers, scopes, numbers: numberSignature(normalized) };
}

function changed(left = [], right = []) {
  return left.join('|') !== right.join('|');
}

function semanticTextDelta(field, beforeText, afterText, extra = {}) {
  if (String(beforeText || '').trim() === String(afterText || '').trim()) return null;
  const before = semanticSignature(beforeText);
  const after = semanticSignature(afterText);
  const mechanicsChanged = changed(before.effects, after.effects) || changed(before.triggers, after.triggers) || changed(before.scopes, after.scopes);
  const numericChanged = changed(before.numbers, after.numbers);
  if (!mechanicsChanged && !numericChanged) return null;
  return {
    type: mechanicsChanged ? 'behavior_change' : 'semantic_value_change',
    category: 'behavior',
    field,
    before,
    after,
    mechanicsChanged,
    numericChanged,
    affectsBrain: true,
    ...extra
  };
}

function rebuild(result, changes) {
  const brainChanges = changes.filter(change => change.affectsBrain);
  const behaviorChanges = brainChanges.filter(change => change.category === 'behavior' || change.category === 'set_bonus');
  const buffs = brainChanges.filter(change => change.type === 'buff');
  const nerfs = brainChanges.filter(change => change.type === 'nerf');
  const ambiguousNumeric = brainChanges.filter(change => ['numeric_change', 'semantic_value_change'].includes(change.type));
  const affectedRarities = [...new Set(brainChanges.map(change => change.rarity).filter(Boolean))].sort();
  const affectedAttributes = [...new Set(brainChanges.map(change => change.key).filter(Boolean))].sort();

  let changeClass = 'no_brain_change';
  if (brainChanges.length) changeClass = 'mixed_change';
  if (brainChanges.length && behaviorChanges.length === brainChanges.length) changeClass = 'behavior_change';
  if (brainChanges.length && buffs.length === brainChanges.length) changeClass = 'buff';
  if (brainChanges.length && nerfs.length === brainChanges.length) changeClass = 'nerf';
  if (brainChanges.length && ambiguousNumeric.length === brainChanges.length) changeClass = 'numeric_change';

  const highImpact = behaviorChanges.length || brainChanges.some(change => [
    'attribute_added', 'attribute_removed', 'rarity_added', 'rarity_removed',
    'set_bonus_added', 'set_bonus_removed', 'semantic_value_change'
  ].includes(change.type));

  return {
    ...result,
    schemaVersion: 'echo-brain-equipment-evolution-v2',
    changeClass,
    severity: highImpact ? 'high' : brainChanges.length ? 'medium' : 'none',
    affectsBrain: brainChanges.length > 0,
    requiresReevaluation: brainChanges.length > 0,
    requiresRetraining: behaviorChanges.length > 0,
    affectedRarities,
    affectedAttributes,
    summary: {
      totalChanges: changes.length,
      brainChanges: brainChanges.length,
      buffs: buffs.length,
      nerfs: nerfs.length,
      ambiguousNumeric: ambiguousNumeric.length,
      behaviorChanges: behaviorChanges.length
    },
    changes
  };
}

function operatorSnapshot(bundle) {
  return (bundle?.variants || []).flatMap(variant => {
    const rarity = String(variant.equipment_rarities?.slug || variant.rarity_slug || variant.rarity_id || variant.rarityId || 'unknown');
    return (Array.isArray(variant.attributes) ? variant.attributes : []).map((attribute, position) => ({
      rarity, position,
      key: canonicalEquipmentAttribute(attribute?.label || attribute?.name || attribute?.key || ''),
      label: String(attribute?.label || attribute?.name || attribute?.key || '').trim(),
      value: String(attribute?.value ?? '').trim(),
      operator: String(attribute?.operator || '')
    }));
  }).sort((a, b) => a.rarity.localeCompare(b.rarity) || a.position - b.position);
}

export function analyzeEquipmentEvolutionV2(beforeBundle, afterBundle) {
  const base = analyzeEquipmentEvolution(beforeBundle, afterBundle);
  const beforeOperators = operatorSnapshot(beforeBundle);
  const afterOperators = operatorSnapshot(afterBundle);
  // V1 permanece imutável; V2 acrescenta ao snapshot o campo descartado por V1.
  if (base.before) base.before.attributeOperators = beforeOperators;
  base.after.attributeOperators = afterOperators;
  if (!base.before) return { ...base, schemaVersion: 'echo-brain-equipment-evolution-v2' };

  const changes = [...base.changes];
  const previous = new Map(beforeOperators.map(row => [`${row.rarity}:${row.position}`, row]));
  for (const row of afterOperators) {
    const old = previous.get(`${row.rarity}:${row.position}`);
    if (!old || old.operator === row.operator) continue;
    changes.push({
      type: 'attribute_operator_change', category: 'behavior',
      rarity: row.rarity, key: row.key, position: row.position,
      before: old.operator, after: row.operator, affectsBrain: true
    });
  }
  const upgradeField = (field, beforeText, afterText) => {
    const semantic = semanticTextDelta(field, beforeText, afterText);
    if (!semantic) return;
    for (let index = changes.length - 1; index >= 0; index -= 1) {
      const candidate = changes[index];
      if (candidate.field === field && ['text_change', 'behavior_change'].includes(candidate.type)) changes.splice(index, 1);
    }
    changes.push(semantic);
  };

  upgradeField('description', base.before.equipment.description, base.after.equipment.description);
  upgradeField('recommendation', base.before.equipment.recommendation, base.after.equipment.recommendation);

  const bonusKey = bonus => `${bonus.requiredPieces}:${normalizeEquipmentText(bonus.title)}`;
  const oldBonuses = new Map((base.before.bonuses || []).map(bonus => [bonusKey(bonus), bonus]));
  const newBonuses = new Map((base.after.bonuses || []).map(bonus => [bonusKey(bonus), bonus]));
  for (const key of new Set([...oldBonuses.keys(), ...newBonuses.keys()])) {
    const before = oldBonuses.get(key);
    const after = newBonuses.get(key);
    if (!before || !after) continue;
    const semantic = semanticTextDelta('set_bonus_description', before.description, after.description, { key, category: 'set_bonus' });
    if (!semantic) continue;
    for (let index = changes.length - 1; index >= 0; index -= 1) {
      const candidate = changes[index];
      if (candidate.key === key && ['set_bonus_text_change', 'set_bonus_behavior_change'].includes(candidate.type)) changes.splice(index, 1);
    }
    changes.push({ ...semantic, type: semantic.mechanicsChanged ? 'set_bonus_behavior_change' : 'set_bonus_semantic_value_change' });
  }

  return rebuild(base, changes);
}
