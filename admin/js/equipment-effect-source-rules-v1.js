/**
 * Snapshot administrativo das regras observadas na Bullet Echo Fandom Wiki.
 *
 * Este arquivo NÃO lê os atributos numéricos já cadastrados no Echo Arena e
 * NÃO publica efeitos. Valores ausentes permanecem null: nunca extrapolar uma
 * progressão entre raridades.
 */

export const EQUIPMENT_EFFECT_SOURCE_RULESET_REVISION =
  'bullet-echo-fandom-gears/2026-09-03.1';

export const BULLET_ECHO_FANDOM_GEARS_URL =
  'https://bullet-echo.fandom.com/wiki/Gears';

export const EQUIPMENT_RARITY_ORDER = Object.freeze([
  'comum', 'raro', 'epico', 'lendario', 'mitico', 'supremo',
  'grandioso', 'celestial', 'estelar', 'imortal', 'divino'
]);

function freezeRule(rule) {
  for (const effect of rule.effects) {
    Object.freeze(effect.values);
    Object.freeze(effect);
  }
  Object.freeze(rule.effects);
  Object.freeze(rule.aliases);
  Object.freeze(rule.evidence);
  return Object.freeze(rule);
}

/**
 * As entradas sem tabela completa preservam somente o alvo e a direção visíveis
 * na página Gears. Elas não escolhem entre valor absoluto e percentual. A Faixa
 * de Combate inclui os dez valores legíveis na captura IMG_1244.jpeg. Divino
 * fica vazio porque não aparece naquela evidência.
 */
export const EQUIPMENT_EFFECT_SOURCE_RULES_V1 = Object.freeze([
  freezeRule({
    id: 'combat_headband',
    name: 'Faixa de Combate',
    sourceUrl: 'https://bullet-echo.fandom.com/wiki/Combat_Headband',
    aliases: ['combat headband', 'faixa de combate', 'bandana de combate'],
    coverage: 'verified_values',
    evidence: {
      sourceKind: 'catalog',
      sourceReference: 'Bullet Echo Fandom Wiki — Combat Headband — Modifier Table',
      sourceUri: 'https://bullet-echo.fandom.com/wiki/Combat_Headband',
      fileSha256: '42f564476c60e7743a4744c30cefba2bc69b0c68c8a57c2e95ab9afa2604bd7c',
      observedAt: '2026-09-03',
      excerpt: 'A tabela aumenta o alcance da mira por raridade; Divino não aparece na captura.',
      metadata: { evidence_file: 'IMG_1244.jpeg', source_scope: 'user_supplied_fandom_capture' }
    },
    effects: [{
      key: 'aimed_range',
      target: 'aimed_range',
      direction: 'increase',
      operator: 'increase_flat',
      originalText: "When Equipped, it increases hero's aimed fire range.",
      values: {
        comum: 10, raro: 12, epico: 14, lendario: 16, mitico: 18,
        supremo: 20, grandioso: 22, celestial: 23, estelar: 24,
        imortal: 25, divino: null
      }
    }]
  }),
  freezeRule({
    id: 'protective_glasses',
    name: 'Óculos de Proteção',
    sourceUrl: 'https://bullet-echo.fandom.com/wiki/Protective_Glasses',
    aliases: ['protective glasses', 'oculos de protecao', 'óculos de proteção'],
    coverage: 'semantics_only',
    evidence: {
      sourceKind: 'catalog', sourceReference: 'Bullet Echo Fandom Wiki — Gears',
      sourceUri: BULLET_ECHO_FANDOM_GEARS_URL,
      fileSha256: 'f834c29e2e1b6bc6eb3933a61b62ddb2c2f5a7966b4f7459454a275d3016f692',
      observedAt: '2026-09-03', excerpt: 'Increases hero vision range.',
      metadata: { evidence_file: 'IMG_1242.jpeg', source_scope: 'user_supplied_fandom_capture' }
    },
    effects: [{ key: 'vision_range', target: 'vision_range', direction: 'increase', operator: null,
      originalText: 'Increases hero vision range.', values: {} }]
  }),
  freezeRule({
    id: 'commanders_beret',
    name: 'Boina do Comandante',
    sourceUrl: "https://bullet-echo.fandom.com/wiki/Commander's_Beret",
    aliases: ["commander's beret", 'commanders beret', 'boina do comandante'],
    coverage: 'semantics_only',
    evidence: {
      sourceKind: 'catalog', sourceReference: 'Bullet Echo Fandom Wiki — Gears',
      sourceUri: BULLET_ECHO_FANDOM_GEARS_URL,
      fileSha256: 'f834c29e2e1b6bc6eb3933a61b62ddb2c2f5a7966b4f7459454a275d3016f692',
      observedAt: '2026-09-03', excerpt: 'Decreases hero running loudness.',
      metadata: { evidence_file: 'IMG_1242.jpeg', source_scope: 'user_supplied_fandom_capture' }
    },
    effects: [{ key: 'movement_noise', target: 'movement_noise', direction: 'decrease', operator: null,
      originalText: 'Decreases hero running loudness.', values: {} }]
  }),
  freezeRule({
    id: 'tactical_optics',
    name: 'Óptica Tática',
    sourceUrl: 'https://bullet-echo.fandom.com/wiki/Tactical_Optics',
    aliases: ['tactical optics', 'optica tatica', 'óptica tática'],
    coverage: 'target_requires_registry',
    evidence: {
      sourceKind: 'catalog', sourceReference: 'Bullet Echo Fandom Wiki — Gears',
      sourceUri: BULLET_ECHO_FANDOM_GEARS_URL,
      fileSha256: 'f834c29e2e1b6bc6eb3933a61b62ddb2c2f5a7966b4f7459454a275d3016f692',
      observedAt: '2026-09-03', excerpt: 'Decreases hero firing spread without aiming.',
      metadata: { evidence_file: 'IMG_1242.jpeg', source_scope: 'user_supplied_fandom_capture' }
    },
    effects: [{ key: 'unaimed_fire_spread', target: 'unaimed_fire_spread', direction: 'decrease', operator: null,
      originalText: 'Decreases hero firing spread without aiming.', values: {} }]
  }),
  freezeRule({
    id: 'healing_implant',
    name: 'Implante de Cura',
    sourceUrl: 'https://bullet-echo.fandom.com/wiki/Healing_Implant',
    aliases: ['healing implant', 'implante de cura'],
    coverage: 'semantics_only',
    evidence: {
      sourceKind: 'catalog', sourceReference: 'Bullet Echo Fandom Wiki — Gears',
      sourceUri: BULLET_ECHO_FANDOM_GEARS_URL,
      fileSha256: 'f834c29e2e1b6bc6eb3933a61b62ddb2c2f5a7966b4f7459454a275d3016f692',
      observedAt: '2026-09-03', excerpt: 'Gives hero health per second.',
      metadata: { evidence_file: 'IMG_1242.jpeg', source_scope: 'user_supplied_fandom_capture' }
    },
    effects: [{ key: 'health_regeneration_rate', target: 'health_regeneration_rate', direction: 'increase', operator: null,
      originalText: 'Gives hero health per second.', values: {} }]
  }),
  freezeRule({
    id: 'infantry_vest',
    name: 'Colete de Infantaria',
    sourceUrl: 'https://bullet-echo.fandom.com/wiki/Infantry_Vest',
    aliases: ['infantry vest', 'colete de infantaria'],
    coverage: 'semantics_only',
    evidence: {
      sourceKind: 'catalog', sourceReference: 'Bullet Echo Fandom Wiki — Gears',
      sourceUri: BULLET_ECHO_FANDOM_GEARS_URL,
      fileSha256: 'f834c29e2e1b6bc6eb3933a61b62ddb2c2f5a7966b4f7459454a275d3016f692',
      observedAt: '2026-09-03', excerpt: 'Increases hero maximum health.',
      metadata: { evidence_file: 'IMG_1242.jpeg', source_scope: 'user_supplied_fandom_capture' }
    },
    effects: [{ key: 'health_capacity', target: 'health_capacity', direction: 'increase', operator: null,
      originalText: 'Increases hero maximum health.', values: {} }]
  }),
  freezeRule({
    id: 'regular_body_armour',
    name: 'Armadura Corporal',
    sourceUrl: 'https://bullet-echo.fandom.com/wiki/Regular_Body_Armour',
    aliases: ['regular body armour', 'regular body armor', 'armadura corporal'],
    coverage: 'semantics_only',
    evidence: {
      sourceKind: 'catalog', sourceReference: 'Bullet Echo Fandom Wiki — Regular Body Armour',
      sourceUri: 'https://bullet-echo.fandom.com/wiki/Regular_Body_Armour',
      fileSha256: 'f834c29e2e1b6bc6eb3933a61b62ddb2c2f5a7966b4f7459454a275d3016f692',
      observedAt: '2026-09-03', excerpt: 'Increases hero maximum armour; a tabela numérica não aparece neste snapshot.',
      metadata: { evidence_file: 'IMG_1242.jpeg', source_scope: 'user_supplied_fandom_capture' }
    },
    effects: [{ key: 'armor_capacity', target: 'armor_capacity', direction: 'increase', operator: null,
      originalText: 'Increases hero maximum armour.', values: {} }]
  }),
  freezeRule({
    id: 'reflex_implant',
    name: 'Implante de Reflexo',
    sourceUrl: 'https://bullet-echo.fandom.com/wiki/Reflex_Implant',
    aliases: ['reflex implant', 'implante de reflexo'],
    coverage: 'target_requires_registry',
    evidence: {
      sourceKind: 'catalog', sourceReference: 'Bullet Echo Fandom Wiki — Gears',
      sourceUri: BULLET_ECHO_FANDOM_GEARS_URL,
      fileSha256: 'f834c29e2e1b6bc6eb3933a61b62ddb2c2f5a7966b4f7459454a275d3016f692',
      observedAt: '2026-09-03', excerpt: 'Decreases hero primary weapon recoil.',
      metadata: { evidence_file: 'IMG_1242.jpeg', source_scope: 'user_supplied_fandom_capture' }
    },
    effects: [{ key: 'weapon_recoil', target: 'weapon_recoil', direction: 'decrease', operator: null,
      originalText: 'Decreases hero primary weapon recoil.', values: {} }]
  })
]);

export function normalizeEquipmentSourceName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function findEquipmentSourceRule(value) {
  const normalized = normalizeEquipmentSourceName(value);
  if (!normalized) return null;
  return EQUIPMENT_EFFECT_SOURCE_RULES_V1.find(rule =>
    rule.aliases.some(alias => normalizeEquipmentSourceName(alias) === normalized)
  ) || null;
}

export function sourceRuleCoverage(rule) {
  const values = (rule?.effects || []).flatMap(effect =>
    Object.values(effect.values || {}).filter(value => value !== null && value !== undefined)
  );
  return {
    effectCount: rule?.effects?.length || 0,
    valueCount: values.length,
    complete: Boolean(rule?.effects?.length) && rule.effects.every(effect =>
      EQUIPMENT_RARITY_ORDER.every(rarity =>
        effect.values?.[rarity] !== null && effect.values?.[rarity] !== undefined
      )
    )
  };
}
