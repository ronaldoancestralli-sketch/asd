import { applyEquipmentStats, canonicalKey, STAT_DEFINITIONS } from '../../js/game-stat-engine.js?v=15&sc=20260906-1&eq=20260907-effects-1';
import { equipmentEligibility } from '../../js/equipment-eligibility.js?v=1';
import { compileStatusRegistry, statusSkillSources, finiteStatusNumber, statusAttributeRows, statusSource, stableStatusJson } from '../../js/status-registry-v1.js?sc=20260906-1&eq=20260907-effects-1';

export function discoverStatusFields(data) {
  const fields = new Map();
  const add = (scope, key, value, heroId, skill = null, level = null) => {
    const id = [scope, skill?.id || '', level?.id || '', key].join(':');
    if (!fields.has(id)) fields.set(id, { locator: id, scope, source_key: key, skill_id: skill?.id || null, level_id: level?.id || null,
      name: STAT_DEFINITIONS[canonicalKey(key)]?.nome || key.replaceAll('_', ' '), samples: [], heroIds: new Set() });
    const field = fields.get(id), n = finiteStatusNumber(value);
    if (n !== null) { field.samples.push({ heroId, value: n }); field.heroIds.add(heroId); }
    if (skill) field.name = `${skill.name}${level ? ` · nível ${level.level}` : ''} · ${key}`;
  };
  for (const base of data.bases) {
    for (const [key,value] of Object.entries(base.hero_stats || {})) add('hero',key,value,base.hero_id);
    for (const [key,value] of Object.entries(base.weapon_stats || {})) add('weapon',key,value,base.hero_id);
  }
  for (const skill of data.skills) {
    for (const key of ['cooldown','duration','energy_cost']) if (skill[key] != null) add('skill',key,skill[key],skill.hero_id,skill);
  }
  for (const level of data.levels) {
    const skill = data.skills.find(s => s.id === level.skill_id);
    if (!skill) continue;
    for (const key of ['damage','healing','shield','cooldown','duration','radius','range','speed','energy_cost']) if (level[key] != null) add('skill_level',key,level[key],skill.hero_id,skill,level);
  }
  return [...fields.values()].map(f => ({ ...f, heroes: f.heroIds.size })).sort((a,b) => a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name,'pt-BR'));
}
export function inventoryStatusEffects(data, registry) {
  const rows = [];
  const add = (kind,id,attributes,meta) => {
    for (const row of statusAttributeRows(attributes)) {
      const bindings = registry.payload.bindings.filter(b => b.source_kind === kind && b.source_id === id && b.attribute_key === row.key);
      const binding = bindings[0];
      const status = bindings.length > 1 ? 'ambiguous' : binding ? stableStatusJson(binding.source_snapshot) === stableStatusJson(row.raw) ? 'bound' : 'changed' : 'unmapped';
      rows.push({ ...row, source_kind: kind, source_id: id, ...meta, binding, status });
    }
  };
  for (const variant of data.variants) {
    const item = data.equipments.find(e => e.id === variant.equipment_id), rarity = data.rarities.find(r => r.id === variant.rarity_id);
    if (!item) continue;
    add('equipment_variant',variant.id,variant.attributes,{ equipmentId: item.id, name: item.name, enabled: item.enabled, rarity: rarity?.name || 'Raridade não encontrada', raritySlug: rarity?.slug || '', rank: rarity?.rank || 0 });
  }
  for (const bonus of data.bonuses) add('set_bonus',bonus.id,bonus.stats,{ name: bonus.title, requiredPieces: bonus.required_pieces, rarity: `${bonus.required_pieces} peças`, rank: 0 });
  for (const binding of registry.payload.bindings.filter(b => ['equipment_variant','set_bonus'].includes(b.source_kind))) {
    if (rows.some(row => row.source_kind === binding.source_kind && row.source_id === binding.source_id && row.key === binding.attribute_key)) continue;
    const variant = data.variants.find(v => v.id === binding.source_id), item = data.equipments.find(e => e.id === variant?.equipment_id);
    rows.push({ key: binding.attribute_key, label: 'Linha removida ou fonte indisponível', value: null, source_kind: binding.source_kind, source_id: binding.source_id, equipmentId: item?.id,
      name: item?.name || data.bonuses.find(b => b.id === binding.source_id)?.title || 'Fonte indisponível', rarity: data.rarities.find(r => r.id === variant?.rarity_id)?.name || '', binding, status: 'changed', missing: true });
  }
  return rows;
}
export function buildStatusProof(data, heroId, selections, registry, conditions = {}) {
  const hero = data.heroes.find(h => h.id === heroId), base = data.bases.find(b => b.hero_id === heroId);
  if (!hero || !base) throw new Error('Escolha um herói que tenha dados-base cadastrados.');
  const sources = [], items = [], usedSlots = new Set(), usedItems = new Set(), sets = new Map();
  for (const choice of selections) {
    const item = data.equipments.find(e => e.id === choice.equipmentId), variant = data.variants.find(v => v.id === choice.variantId && v.equipment_id === item?.id);
    const slot = data.slots.find(s => s.id === item?.slot_id), rarity = data.rarities.find(r => r.id === variant?.rarity_id);
    if (!item || !variant || !slot || !rarity || !item.enabled) throw new Error('Equipamento, posição ou raridade indisponível.');
    if (!equipmentEligibility(item,hero).eligible) throw new Error(`${item.name} não é compatível com ${hero.name}.`);
    if (usedSlots.has(slot.id) || usedItems.has(item.id)) throw new Error('A prova não permite posição ou equipamento repetido.');
    usedSlots.add(slot.id); usedItems.add(item.id);
    if (item.set_id) sets.set(item.set_id,(sets.get(item.set_id)||0)+1);
    sources.push(statusSource('equipment_variant',variant.id,variant.attributes,{ name: item.name, rarity: rarity.name }));
    items.push({ equipmentId: item.id, slot: slot.slug, raritySlug: rarity.slug });
  }
  for (const b of data.bonuses.filter(b => (sets.get(b.set_id)||0)>=b.required_pieces).sort((a,b) => a.id.localeCompare(b.id))) sources.push(statusSource('set_bonus',b.id,b.stats,{ name: b.title }));
  const skills = data.skills.filter(s => s.hero_id === heroId && s.enabled && ['verified','corroborated'].includes(s.verification_status));
  const skill_levels = data.levels.filter(l => skills.some(s => s.id === l.skill_id));
  sources.push(...statusSkillSources(registry,skills,skill_levels));
  const calculation = applyEquipmentStats({ ...base, skills, skill_levels },sources,{ registry, context: { heroId, ...conditions } });
  return { calculation, items, hero, sources };
}
export function draftStatusRegistry(central, payload = central.draft) {
  return compileStatusRegistry({ revision: `draft:${central.draft_revision || 0}`, fingerprint: 'unpublished-draft', payload });
}

export function statusTargetChoices(fields, draft) {
  const registered = draft.definitions.filter(d => d.kind === 'scalar' && d.unit !== 'unknown');
  const pending = fields.filter(f => !registered.some(d => d.scope === f.scope && d.source_key === f.source_key && (d.skill_id || null) === (f.skill_id || null) && (d.level_id || null) === (f.level_id || null)));
  return { registered, pending };
}

export function suggestedStatusId(field) {
  const owner = field.level_id || field.skill_id;
  return `${field.scope}_${owner ? owner.replaceAll('-', '').slice(0, 12) + '_' : ''}${field.source_key}`.slice(0, 80);
}

export function statusActionRecord(action, detail) {
  return `Central de Status: ${action}. ${detail}`.slice(0, 2000);
}
