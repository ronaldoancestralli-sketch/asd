/* Echo Brain semantic graph v1
 * Deterministic/auditable. It describes verified relationships; it does not
 * learn weights and it never replaces numeric game formulas.
 */

const EFFECT_TO_STATS = {
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
  penetration_resistance: ['penetration_resistance'],
  shield: ['shield'],
  healing: ['health', 'armor'],
  ability_cooldown: ['special_ability_cooldown_pct']
};

const EFFECT_PATTERNS = {
  damage: /\bdano\b/,
  health_damage: /dano (?:contra a )?vida|dano a vida/,
  armor_damage: /dano (?:a|contra a?) armadura|quebra de armadura|reduz.{0,45}armadura/,
  fire_rate: /cadencia de tiro/,
  reload: /tempo de recarga(?: da arma)?|recarreg/,
  ammo: /munic(?:ao|oes)|carregador|pente/,
  health: /vida maxima|\bvida\b/,
  armor: /armadura maxima|\barmadura\b/,
  movement: /velocidade de movimento/,
  aimed_movement: /velocidade.{0,28}(?:ao|com) mirar/,
  vision_range: /alcance de visao|\bvisao\b/,
  weapon_range: /alcance de tiro|alcance de mira/,
  aiming: /tempo de mira|dispersao|estabilidade de mira/,
  armor_penetration: /penetracao de armadura/,
  penetration_power: /poder de perfuracao/,
  armor_resistance: /resistencia (?:de|a) armadura/,
  penetration_resistance: /resistencia (?:a|de) (?:penetracao|perfuracao)/,
  shield: /escudo|parede de energia|campo de forca/,
  healing: /restaura|recupera|cura|regenera/,
  ability_cooldown: /recarga da habilidade|tempo de recarga da habilidade/
};

const TRIGGER_PATTERNS = {
  on_hit: /ao acertar|quando acerta|apos acertar/,
  on_kill: /ao eliminar|apos eliminar|eliminar um inimigo/,
  on_damage_taken: /ao receber dano|quando recebe dano/,
  active: /ao ativar|apos ativar|\bativa\b/,
  passive: /passiva|passivamente/,
  team: /equipe|aliad|talento de equipe/,
  wall_shot: /atirar atraves de paredes/,
  invisibility: /invisivel|invisibilidade/,
  deployable: /torreta|drone|mina|unidade implantavel/,
  area: /raio de \d+|em area/,
  periodic: /por segundo/,
  self_penalty: /nao pode atirar|sem poder atirar|reduz.{0,50}velocidade de movimento do heroi/
};

const EXPLANATION_SUMMARY_RELATIONS = new Set(['values_stat']);

function norm(value = '') {
  return String(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function canonical(value = '') {
  return norm(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function verificationConfidence(skill = {}) {
  const status = norm(skill.verification_status);
  if (status === 'verified' && skill.needs_recheck === false) return 1;
  if (status === 'corroborated') return .82;
  return .62;
}

function edgeKey(edge) {
  return [edge.sourceType, edge.sourceId, edge.relation, edge.targetType, edge.targetId].join('|');
}

function addEdge(map, edge) {
  if (!edge.sourceId || !edge.targetId || !edge.relation) return;
  const next = {
    sourceType: edge.sourceType || 'entity',
    sourceId: String(edge.sourceId),
    relation: String(edge.relation),
    targetType: edge.targetType || 'entity',
    targetId: String(edge.targetId),
    weight: Math.max(-1, Math.min(1, Number(edge.weight ?? 1))),
    confidence: clamp(edge.confidence ?? 1),
    evidence: edge.evidence || {}
  };
  const key = edgeKey(next);
  const previous = map.get(key);
  if (!previous || next.confidence > previous.confidence || Math.abs(next.weight) > Math.abs(previous.weight)) map.set(key, next);
}

function skillRelations(hero, skill, edges) {
  const heroId = hero?.id || hero?.databaseId;
  const skillId = skill?.id || `${heroId}:${canonical(skill?.name || skill?.slug || 'skill')}`;
  if (!heroId || !skillId) return;
  const confidence = verificationConfidence(skill);
  const text = norm(`${skill?.name || ''} ${skill?.description || ''} ${skill?.skill_type || ''}`);

  addEdge(edges, { sourceType: 'hero', sourceId: heroId, relation: 'has_skill', targetType: 'skill', targetId: skillId, confidence, evidence: { skillName: skill?.name || null } });

  for (const [effect, pattern] of Object.entries(EFFECT_PATTERNS)) {
    if (!pattern.test(text)) continue;
    addEdge(edges, { sourceType: 'skill', sourceId: skillId, relation: 'produces_effect', targetType: 'effect', targetId: effect, confidence, evidence: { skillName: skill?.name || null, description: skill?.description || '' } });
    for (const stat of EFFECT_TO_STATS[effect] || []) {
      addEdge(edges, { sourceType: 'effect', sourceId: effect, relation: 'maps_to_stat', targetType: 'stat', targetId: stat, confidence: .98, evidence: { semanticContract: 'effect-to-stat-v1' } });
      addEdge(edges, { sourceType: 'hero', sourceId: heroId, relation: 'values_stat', targetType: 'stat', targetId: stat, confidence, weight: .65, evidence: { viaSkill: skill?.name || null, effect, derivedSummary: true } });
    }
  }

  for (const [trigger, pattern] of Object.entries(TRIGGER_PATTERNS)) {
    if (!pattern.test(text)) continue;
    addEdge(edges, { sourceType: 'skill', sourceId: skillId, relation: 'uses_trigger', targetType: 'trigger', targetId: trigger, confidence, evidence: { skillName: skill?.name || null } });
  }
}

function variantAttributes(item) {
  const rows = [];
  for (const variant of item?.variants || item?.levels || []) {
    const attrs = variant?.attributes ?? variant?.stats ?? {};
    if (Array.isArray(attrs)) {
      for (const attr of attrs) if (attr?.label) rows.push([attr.label, attr.value, variant?.rarity_slug || variant?.slug || null]);
    } else {
      for (const [key, value] of Object.entries(attrs || {})) rows.push([key, value, variant?.rarity_slug || variant?.slug || null]);
    }
  }
  return rows;
}

function equipmentRelations(item, edges) {
  const itemId = item?.id || item?.databaseId;
  if (!itemId) return;
  for (const [rawKey, value, rarity] of variantAttributes(item)) {
    const stat = canonical(rawKey);
    addEdge(edges, {
      sourceType: 'equipment', sourceId: itemId, relation: 'modifies_stat', targetType: 'stat', targetId: stat,
      confidence: 1, weight: Number(value) < 0 ? -.5 : .5,
      evidence: { value, rarity, source: 'equipment_variant' }
    });
  }
  const text = norm(`${item?.name || ''} ${item?.description || ''} ${item?.recommendation_text || item?.recommendation || ''}`);
  for (const [trigger, pattern] of Object.entries(TRIGGER_PATTERNS)) {
    if (pattern.test(text)) addEdge(edges, { sourceType: 'equipment', sourceId: itemId, relation: 'uses_trigger', targetType: 'trigger', targetId: trigger, confidence: .9, evidence: { description: item?.description || '' } });
  }
  for (const [effect, pattern] of Object.entries(EFFECT_PATTERNS)) {
    if (pattern.test(text)) addEdge(edges, { sourceType: 'equipment', sourceId: itemId, relation: 'produces_effect', targetType: 'effect', targetId: effect, confidence: .9, evidence: { description: item?.description || '' } });
  }
}

function bonusRelations(bonus, edges) {
  const bonusId = bonus?.id || `${bonus?.set_id || bonus?.setId || 'set'}:${bonus?.required_pieces || bonus?.requiredPieces || 0}`;
  const setId = bonus?.set_id || bonus?.setId;
  if (setId) addEdge(edges, { sourceType: 'set', sourceId: setId, relation: 'unlocks_bonus', targetType: 'set_bonus', targetId: bonusId, confidence: 1, evidence: { requiredPieces: bonus?.required_pieces ?? bonus?.requiredPieces ?? null } });
  const text = norm(`${bonus?.title || ''} ${bonus?.description || ''}`);
  for (const [effect, pattern] of Object.entries(EFFECT_PATTERNS)) {
    if (pattern.test(text)) addEdge(edges, { sourceType: 'set_bonus', sourceId: bonusId, relation: 'produces_effect', targetType: 'effect', targetId: effect, confidence: .92, evidence: { description: bonus?.description || '' } });
  }
  const stats = bonus?.stats || {};
  for (const [key, value] of Object.entries(stats)) {
    addEdge(edges, { sourceType: 'set_bonus', sourceId: bonusId, relation: 'modifies_stat', targetType: 'stat', targetId: canonical(key), confidence: 1, weight: Number(value) < 0 ? -.5 : .5, evidence: { value } });
  }
}

export function buildEchoBrainSemanticGraph({ heroes = [], equipments = [], setBonuses = [] } = {}) {
  const edges = new Map();
  for (const hero of heroes) for (const skill of hero?.skills || []) if (skill?.enabled !== false) skillRelations(hero, skill, edges);
  for (const equipment of equipments) equipmentRelations(equipment, edges);
  for (const bonus of setBonuses) bonusRelations(bonus, edges);
  const list = [...edges.values()].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)));
  return {
    schemaVersion: 'echo-brain-semantic-graph-v1',
    edges: list,
    counts: {
      heroes: new Set(list.filter(e => e.sourceType === 'hero').map(e => e.sourceId)).size,
      equipment: new Set(list.filter(e => e.sourceType === 'equipment').map(e => e.sourceId)).size,
      skills: new Set(list.filter(e => e.sourceType === 'skill').map(e => e.sourceId)).size,
      edges: list.length
    }
  };
}

function findSemanticPath(edges, source, target, maxDepth) {
  const adjacency = new Map();
  for (const edge of edges) {
    const key = `${edge.sourceType}:${edge.sourceId}`;
    if (!adjacency.has(key)) adjacency.set(key, []);
    adjacency.get(key).push(edge);
  }
  const start = `${source.type}:${source.id}`;
  const goal = `${target.type}:${target.id}`;
  if (start === goal) return { found: true, path: [] };
  const queue = [{ node: start, path: [] }];
  const visited = new Set([start]);
  while (queue.length) {
    const current = queue.shift();
    if (current.path.length >= maxDepth) continue;
    for (const edge of adjacency.get(current.node) || []) {
      const next = `${edge.targetType}:${edge.targetId}`;
      if (visited.has(next)) continue;
      const path = [...current.path, edge];
      if (next === goal) return { found: true, path };
      visited.add(next);
      queue.push({ node: next, path });
    }
  }
  return { found: false, path: [] };
}

export function explainSemanticPath(graph, source, target, maxDepth = 4) {
  const edges = graph?.edges || [];
  const causalEdges = edges.filter(edge => !EXPLANATION_SUMMARY_RELATIONS.has(edge.relation));
  const causal = findSemanticPath(causalEdges, source, target, maxDepth);
  if (causal.found) return causal.path;
  return findSemanticPath(edges, source, target, maxDepth).path;
}

export function semanticGraphFingerprint(graph) {
  return (graph?.edges || []).map(edge => [edge.sourceType, edge.sourceId, edge.relation, edge.targetType, edge.targetId, edge.weight, edge.confidence].join(':')).join('|');
}
