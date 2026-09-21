/*
 * Echo Brain — Equipment Evolution v1
 * -----------------------------------
 * Deterministic, side-effect-free interpreter for equipment balance changes.
 * It never assumes that every numeric change is a buff/nerf: when direction
 * cannot be proven from the stat semantics it reports `numeric_change`.
 */

const LOWER_IS_BETTER = [
  /cooldown|recarga da habilidade|tempo de recarga/,
  /reload|recarga da arma/,
  /fire interval|intervalo entre tiros/,
  /aim time|tempo de mira/,
  /dispers|spread/,
  /ruido|noise/,
  /tempo de coleta|opening cooldown|crate opening/,
  /tempo de troca|switch time/
];

const HIGHER_IS_BETTER = [
  /dano|damage/,
  /vida|health/,
  /armadura|armor/,
  /cadencia|fire rate/,
  /munic|magazine|ammo/,
  /velocidade de movimento|movement speed/,
  /alcance|range/,
  /visao|vision/,
  /penetr|perfur|penetration/,
  /resistencia|resistance/,
  /cura|healing|restaura|recupera/
];

const BEHAVIOR_PATTERNS = {
  on_hit: /ao acertar|quando acerta|on hit/,
  on_kill: /ao eliminar|apos eliminar|on kill/,
  on_damage_taken: /ao receber dano|quando recebe dano|on damage taken/,
  conditional: /se |quando |enquanto |durante |apenas |somente |contra |ferid|revelad/,
  duration: /por \d+(?:[.,]\d+)?\s*s|durante \d+(?:[.,]\d+)?\s*s|segundos?/,
  cooldown: /recarga|cooldown/,
  area: /raio de|em area|ao redor|nearby/,
  team: /equipe|aliad|team|ally/,
  enemy: /inimig|alvo|enemy|target/,
  shield: /escudo|parede de energia|shield/,
  stealth: /invis|furtiv|stealth/,
  wall_shot: /atraves de paredes|through walls/,
  heal: /cura|restaura|recupera.{0,35}vida|healing/,
  armor_restore: /restaura|recupera.{0,35}armadura/,
  control: /nao pod(?:e|em) atirar|bloqueia as armas|atord|cegueir|reduz.{0,50}velocidade/,
  deployable: /torreta|drone|implantavel|deploy/,
  direct_hit: /acerto direto|direct hit/,
  ability_charge: /carga|charge/
};

export function normalizeEquipmentText(value = '') {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalEquipmentAttribute(value = '') {
  return normalizeEquipmentText(value)
    .replace(/%/g, ' percentual ')
    .replace(/\bporcentagem\b|\bpct\b/g, ' percentual ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function parseLocaleNumber(raw) {
  const source = String(raw ?? '').trim();
  const match = source.match(/[+-]?\s*\d+(?:[.,]\d+)*(?:\s*%)?/);
  if (!match) return null;
  const token = match[0].replace(/\s+/g, '');
  const percent = token.includes('%');
  let numberText = token.replace('%', '');
  if (/^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(numberText)) {
    numberText = numberText.replace(/\./g, '').replace(',', '.');
  } else if (numberText.includes(',') && !numberText.includes('.')) {
    numberText = numberText.replace(',', '.');
  } else if (numberText.includes(',') && numberText.includes('.')) {
    const lastComma = numberText.lastIndexOf(',');
    const lastDot = numberText.lastIndexOf('.');
    if (lastComma > lastDot) numberText = numberText.replace(/\./g, '').replace(',', '.');
    else numberText = numberText.replace(/,/g, '');
  }
  const value = Number(numberText);
  return Number.isFinite(value) ? { value, percent, raw: source } : null;
}

function statDirection(label) {
  const text = normalizeEquipmentText(label);
  if (LOWER_IS_BETTER.some(pattern => pattern.test(text))) return 'lower_better';
  if (HIGHER_IS_BETTER.some(pattern => pattern.test(text))) return 'higher_better';
  return 'unknown';
}

function compareNumeric(label, beforeRaw, afterRaw) {
  const before = parseLocaleNumber(beforeRaw);
  const after = parseLocaleNumber(afterRaw);
  if (!before || !after || before.percent !== after.percent) return null;
  const delta = after.value - before.value;
  if (Math.abs(delta) <= 1e-12) return null;
  const direction = statDirection(label);
  let balance = 'numeric_change';
  if (direction === 'higher_better') balance = delta > 0 ? 'buff' : 'nerf';
  if (direction === 'lower_better') balance = delta < 0 ? 'buff' : 'nerf';
  return {
    before: before.value,
    after: after.value,
    delta: Number(delta.toFixed(6)),
    unit: before.percent ? 'percent' : 'raw',
    semanticDirection: direction,
    balance,
    confidence: direction === 'unknown' ? 0.45 : 0.9
  };
}

function behaviorSignature(text = '') {
  const normalized = normalizeEquipmentText(text);
  const mechanics = Object.entries(BEHAVIOR_PATTERNS)
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([id]) => id)
    .sort();
  return { text: normalized, mechanics };
}

function stableAttributes(attributes = []) {
  return (Array.isArray(attributes) ? attributes : [])
    .map(item => ({
      key: canonicalEquipmentAttribute(item?.label || item?.name || item?.key || ''),
      label: String(item?.label || item?.name || item?.key || '').trim(),
      value: String(item?.value ?? '').trim()
    }))
    .filter(item => item.key)
    .sort((a, b) => a.key.localeCompare(b.key) || a.value.localeCompare(b.value));
}

function rarityKey(variant = {}) {
  return String(
    variant?.equipment_rarities?.slug ||
    variant?.rarity_slug ||
    variant?.rarity_id ||
    variant?.rarityId ||
    'unknown'
  );
}

export function snapshotEquipmentBundle(bundle = {}) {
  const equipment = bundle?.equipment || {};
  const variants = (bundle?.variants || []).map(variant => ({
    rarity: rarityKey(variant),
    attributes: stableAttributes(variant?.attributes)
  })).sort((a, b) => a.rarity.localeCompare(b.rarity));
  const bonuses = (bundle?.bonuses || []).map(bonus => ({
    requiredPieces: Number(bonus?.required_pieces ?? bonus?.requiredPieces) || 0,
    title: String(bonus?.title || '').trim(),
    description: String(bonus?.description || '').trim(),
    stats: bonus?.stats && typeof bonus.stats === 'object' ? bonus.stats : null
  })).sort((a, b) => a.requiredPieces - b.requiredPieces || a.title.localeCompare(b.title));
  return {
    equipment: {
      id: equipment?.id ? String(equipment.id) : null,
      name: String(equipment?.name || '').trim(),
      slug: String(equipment?.slug || '').trim(),
      slotId: equipment?.slot_id ? String(equipment.slot_id) : null,
      setId: equipment?.set_id ? String(equipment.set_id) : null,
      description: String(equipment?.description || '').trim(),
      recommendation: String(equipment?.recommendation || '').trim(),
      enabled: equipment?.enabled !== false
    },
    variants,
    bonuses
  };
}

function attributeMap(variant) {
  return new Map((variant?.attributes || []).map(item => [item.key, item]));
}

function compareVariants(before = [], after = []) {
  const changes = [];
  const beforeMap = new Map(before.map(variant => [variant.rarity, variant]));
  const afterMap = new Map(after.map(variant => [variant.rarity, variant]));
  const rarities = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();

  for (const rarity of rarities) {
    const left = beforeMap.get(rarity);
    const right = afterMap.get(rarity);
    if (!left && right) {
      changes.push({ type: 'rarity_added', rarity, affectsBrain: true });
      continue;
    }
    if (left && !right) {
      changes.push({ type: 'rarity_removed', rarity, affectsBrain: true });
      continue;
    }
    const leftAttrs = attributeMap(left);
    const rightAttrs = attributeMap(right);
    const keys = [...new Set([...leftAttrs.keys(), ...rightAttrs.keys()])].sort();
    for (const key of keys) {
      const oldAttr = leftAttrs.get(key);
      const newAttr = rightAttrs.get(key);
      if (!oldAttr && newAttr) {
        changes.push({ type: 'attribute_added', rarity, key, label: newAttr.label, after: newAttr.value, affectsBrain: true });
        continue;
      }
      if (oldAttr && !newAttr) {
        changes.push({ type: 'attribute_removed', rarity, key, label: oldAttr.label, before: oldAttr.value, affectsBrain: true });
        continue;
      }
      if (oldAttr.value === newAttr.value && oldAttr.label === newAttr.label) continue;
      const numeric = compareNumeric(newAttr.label || oldAttr.label, oldAttr.value, newAttr.value);
      if (numeric) {
        changes.push({
          type: numeric.balance,
          category: 'numeric',
          rarity,
          key,
          label: newAttr.label || oldAttr.label,
          before: oldAttr.value,
          after: newAttr.value,
          ...numeric,
          affectsBrain: true
        });
      } else {
        const oldBehavior = behaviorSignature(`${oldAttr.label} ${oldAttr.value}`);
        const newBehavior = behaviorSignature(`${newAttr.label} ${newAttr.value}`);
        changes.push({
          type: 'attribute_behavior_change',
          category: 'behavior',
          rarity,
          key,
          before: { label: oldAttr.label, value: oldAttr.value, mechanics: oldBehavior.mechanics },
          after: { label: newAttr.label, value: newAttr.value, mechanics: newBehavior.mechanics },
          affectsBrain: true
        });
      }
    }
  }
  return changes;
}

function compareBehaviorField(field, beforeText, afterText) {
  if (String(beforeText || '').trim() === String(afterText || '').trim()) return null;
  const before = behaviorSignature(beforeText);
  const after = behaviorSignature(afterText);
  const mechanicsChanged = before.mechanics.join('|') !== after.mechanics.join('|');
  return {
    type: mechanicsChanged ? 'behavior_change' : 'text_change',
    category: mechanicsChanged ? 'behavior' : 'metadata',
    field,
    before,
    after,
    affectsBrain: mechanicsChanged
  };
}

function compareBonuses(before = [], after = []) {
  const changes = [];
  const keyFor = bonus => `${bonus.requiredPieces}:${normalizeEquipmentText(bonus.title)}`;
  const left = new Map(before.map(item => [keyFor(item), item]));
  const right = new Map(after.map(item => [keyFor(item), item]));
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort();
  for (const key of keys) {
    const oldBonus = left.get(key);
    const newBonus = right.get(key);
    if (!oldBonus) {
      changes.push({ type: 'set_bonus_added', category: 'set_bonus', key, after: newBonus, affectsBrain: true });
      continue;
    }
    if (!newBonus) {
      changes.push({ type: 'set_bonus_removed', category: 'set_bonus', key, before: oldBonus, affectsBrain: true });
      continue;
    }
    const descriptionChange = compareBehaviorField('set_bonus_description', oldBonus.description, newBonus.description);
    const statsChanged = JSON.stringify(oldBonus.stats) !== JSON.stringify(newBonus.stats);
    if (descriptionChange) changes.push({ ...descriptionChange, type: descriptionChange.affectsBrain ? 'set_bonus_behavior_change' : 'set_bonus_text_change', key });
    if (statsChanged) changes.push({ type: 'set_bonus_stats_change', category: 'set_bonus', key, before: oldBonus.stats, after: newBonus.stats, affectsBrain: true });
  }
  return changes;
}

export function analyzeEquipmentEvolution(beforeBundle, afterBundle) {
  const before = beforeBundle ? snapshotEquipmentBundle(beforeBundle) : null;
  const after = snapshotEquipmentBundle(afterBundle);
  const changes = [];

  if (!before) {
    changes.push({ type: 'equipment_created', category: 'lifecycle', affectsBrain: true });
  } else {
    changes.push(...compareVariants(before.variants, after.variants));
    changes.push(...compareBonuses(before.bonuses, after.bonuses));
    for (const field of ['description', 'recommendation']) {
      const change = compareBehaviorField(field, before.equipment[field], after.equipment[field]);
      if (change) changes.push(change);
    }
    for (const field of ['slotId', 'setId', 'enabled']) {
      if (before.equipment[field] !== after.equipment[field]) {
        changes.push({ type: `${field}_change`, category: 'structure', field, before: before.equipment[field], after: after.equipment[field], affectsBrain: true });
      }
    }
    for (const field of ['name', 'slug']) {
      if (before.equipment[field] !== after.equipment[field]) {
        changes.push({ type: `${field}_change`, category: 'metadata', field, before: before.equipment[field], after: after.equipment[field], affectsBrain: false });
      }
    }
  }

  const brainChanges = changes.filter(change => change.affectsBrain);
  const affectedRarities = [...new Set(brainChanges.map(change => change.rarity).filter(Boolean))].sort();
  const affectedAttributes = [...new Set(brainChanges.map(change => change.key).filter(Boolean))].sort();
  const behaviorChanges = brainChanges.filter(change => change.category === 'behavior' || change.category === 'set_bonus');
  const buffs = brainChanges.filter(change => change.type === 'buff');
  const nerfs = brainChanges.filter(change => change.type === 'nerf');
  const ambiguousNumeric = brainChanges.filter(change => change.type === 'numeric_change');

  let changeClass = 'no_brain_change';
  if (brainChanges.length) changeClass = 'mixed_change';
  if (brainChanges.length && behaviorChanges.length === brainChanges.length) changeClass = 'behavior_change';
  if (brainChanges.length && buffs.length === brainChanges.length) changeClass = 'buff';
  if (brainChanges.length && nerfs.length === brainChanges.length) changeClass = 'nerf';
  if (brainChanges.length && ambiguousNumeric.length === brainChanges.length) changeClass = 'numeric_change';

  const severity = behaviorChanges.length || brainChanges.some(change => ['attribute_added', 'attribute_removed', 'rarity_added', 'rarity_removed', 'set_bonus_added', 'set_bonus_removed'].includes(change.type))
    ? 'high'
    : brainChanges.length ? 'medium' : 'none';

  return {
    schemaVersion: 'echo-brain-equipment-evolution-v1',
    equipmentId: after.equipment.id,
    changeClass,
    severity,
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
    changes,
    before,
    after
  };
}
