/* Shared by browser and Edge Functions. Names/descriptions never grant access. */
const id = value => String(value ?? '').trim();
const heroIdOf = hero => id(hero?.databaseId || hero?.id);
const equipmentIdOf = item => id(item?.databaseId || item?.id);

export function equipmentEligibility(item, hero) {
  const heroId = heroIdOf(hero);
  const owner = id(item?.heroId || item?.hero_id);
  const itemClass = id(item?.classId || item?.class_id);
  const heroClass = id(hero?.classId || hero?.class_id);
  const personal = item?.isPersonal === true || item?.is_personal === true;
  const scope = owner || personal ? 'hero' : itemClass ? 'class' : 'generic';
  let reason = null;
  if (!item || !heroId || hero?.enabled === false) reason = 'hero_unavailable';
  else if (item.enabled === false) reason = 'equipment_unavailable';
  else if (personal && !owner) reason = 'personal_owner_missing';
  else if (owner && owner !== heroId) reason = 'equipment_hero_incompatible';
  else if (itemClass && itemClass !== heroClass) reason = 'equipment_class_incompatible';
  return { eligible: reason === null, scope, reason };
}

export function copyEquippedItem(item, rarity = item?.raridade) {
  return { ...item, raridade: rarity };
}

export function validateEquipmentLoadout({ heroi, slots = [], equipados = {} } = {}) {
  const allowedSlots = new Set(slots.map(slot => id(slot.key)));
  const seen = new Set();
  const issues = [];
  const items = [];
  for (const [slot, item] of Object.entries(equipados)) {
    if (!item) continue;
    const equipmentId = equipmentIdOf(item);
    const eligibility = equipmentEligibility(item, heroi);
    let reason = eligibility.reason;
    if (!reason && !equipmentId) reason = 'equipment_identity_missing';
    if (!reason && (!allowedSlots.has(slot) || id(item.slot) !== slot)) reason = 'equipment_slot_incompatible';
    if (!reason && seen.has(equipmentId)) reason = 'duplicate_equipment';
    if (!reason && !(item.levels || []).some(level => level.slug === item.raridade)) reason = 'equipment_variant_incompatible';
    if (reason) issues.push({ slot, equipmentId, reason });
    else items.push(item);
    if (equipmentId) seen.add(equipmentId);
  }
  return { valid: issues.length === 0, issues, items };
}

/* Rehydrate only from the current catalog; a stored draft cannot supply scope. */
export function restoreEquipmentLoadout({ rows = [], hero, slots = [], catalog = [], tierSlugById = new Map() }) {
  const byId = new Map(catalog.map(item => [equipmentIdOf(item), item]));
  const equipados = {};
  const issues = [];
  for (const row of rows) {
    const item = byId.get(id(row.equipment_id));
    const slotNumber = Number(row.slot);
    const slot = Number.isInteger(slotNumber) && slotNumber > 0 ? slots[slotNumber - 1] : null;
    if (!item || !slot) {
      issues.push({ equipmentId: id(row.equipment_id), reason: 'equipment_or_slot_unavailable' });
      continue;
    }
    if (equipados[slot.key]) {
      issues.push({ equipmentId: equipmentIdOf(item), reason: 'duplicate_slot' });
      continue;
    }
    // Legacy builds stored a null tier and used the common variant. An unknown
    // non-null tier never falls back to another rarity.
    const rarity = row.tier_id == null ? 'comum' : tierSlugById.get(row.tier_id);
    if (!rarity) {
      issues.push({ equipmentId: equipmentIdOf(item), reason: 'equipment_variant_incompatible' });
      continue;
    }
    const candidate = { ...equipados, [slot.key]: copyEquippedItem(item, rarity) };
    const validation = validateEquipmentLoadout({ heroi: hero, slots, equipados: candidate });
    if (!validation.valid) issues.push(...validation.issues);
    else equipados[slot.key] = candidate[slot.key];
  }
  return { equipados, issues };
}
