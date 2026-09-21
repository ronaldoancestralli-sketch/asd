/* Shared, deterministic status contract. No network, DOM, eval or global state. */
export const STATUS_REGISTRY_CONTRACT = 'echo-status-registry/v1';
export const STATUS_UNITS = Object.freeze({
  degree: { label: 'Graus (°)', symbol: '°' },
  second: { label: 'Segundos (s)', symbol: ' s' },
  shot_per_second: { label: 'Tiros por segundo', symbol: ' tiros/s' },
  health_point: { label: 'Pontos de vida', symbol: ' PV' },
  armor_point: { label: 'Pontos de armadura', symbol: ' PA' },
  damage_point: { label: 'Pontos de dano', symbol: '' },
  distance_unit: { label: 'Unidades de distância do jogo', symbol: ' un.' },
  distance_per_second: { label: 'Distância por segundo', symbol: ' un./s' },
  percent: { label: 'Percentual (%)', symbol: '%' },
  multiplier: { label: 'Multiplicador', symbol: '×' },
  ammo_round: { label: 'Munições', symbol: '' },
  point: { label: 'Pontos', symbol: '' },
  count: { label: 'Quantidade', symbol: '' },
  unknown: { label: 'Unidade ainda não confirmada', symbol: '' }
});
export const STATUS_OPERATORS = Object.freeze({
  increase_flat: { label: '+ Somar', operation: 'add', sign: 1 },
  decrease_flat: { label: '− Subtrair', operation: 'add', sign: -1 },
  increase_percent: { label: '+% Aumentar em percentual', operation: 'percent', sign: 1 },
  decrease_percent: { label: '−% Reduzir em percentual', operation: 'percent', sign: -1 }
});
export const STATUS_CONDITIONS = Object.freeze({ always: 'Sempre', aiming: 'Ao mirar', unaimed: 'Sem mirar', moving: 'Em movimento', ability_active: 'Habilidade ativa' });
export const STATUS_REASONS = Object.freeze({
  applied: 'Aplicado por vínculo publicado', legacy: 'Aplicado pela regra legada',
  unmapped: 'Pendente: vincule esta linha na Central de Status', missing_base: 'Base não cadastrada',
  source_changed: 'O atributo mudou desde a revisão do vínculo',
  source_incomplete: 'Texto incompleto: corrija a leitura do equipamento antes de vincular',
  invalid_value: 'Valor numérico inválido', unknown_unit: 'Unidade não confirmada',
  invalid_unit: 'Unidade incompatível com a operação', invalid_result: 'Resultado fora dos limites do status',
  condition_required: 'Informe a condição para calcular este efeito', not_applicable: 'Condição não ativa neste cenário',
  skill_unverified: 'Habilidade exige revisão de confiança', hero_mismatch: 'Habilidade pertence a outro herói', ambiguous_binding: 'Mais de um vínculo para a mesma linha'
});
const ID = /^[a-z][a-z0-9_]{1,79}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const plain = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const identifier = s => typeof s === 'string' && ID.test(s) && !forbidden.has(s);
export function finiteStatusNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value.trim())) return null;
  const n = Number(value.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
export function statusMagnitude(value, unit) {
  if (typeof value !== 'string') return finiteStatusNumber(value);
  // A reviewed operator remains authoritative over a legacy '%' decoration.
  // Physical suffixes are accepted only for the explicitly selected unit.
  let text = value.trim().replace(/[−–—]/g, '-').replace(/\s*%$/, '');
  const suffix = { degree: /\s*[°º]$/, second: /\s*s$/i, shot_per_second: /\s*tiros\/s$/i,
    percent: /\s*%$/, health_point: /\s*PV$/i, armor_point: /\s*PA$/i,
    distance_unit: /\s*un\.?$/i, distance_per_second: /\s*un\.?\/s$/i, multiplier: /\s*×$/ }[unit];
  if (suffix) text = text.replace(suffix, '');
  return finiteStatusNumber(text);
}
export function stableStatusJson(value) {
  if (Array.isArray(value)) return '[' + value.map(v => stableStatusJson(v) ?? 'null').join(',') + ']';
  if (plain(value)) return '{' + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stableStatusJson(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function emptyStatusPayload() { return { contract: STATUS_REGISTRY_CONTRACT, definitions: [], bindings: [] }; }
export function validateStatusPayload(payload, { evidence = false } = {}) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });
  if (!plain(payload) || payload.contract !== STATUS_REGISTRY_CONTRACT || !Array.isArray(payload.definitions) || !Array.isArray(payload.bindings)) {
    return { valid: false, errors: [{ path: '$', message: 'Contrato ou listas do registro inválidos.' }] };
  }
  if (payload.definitions.length > 500 || payload.bindings.length > 5000) err('$', 'Registro excede o limite de segurança.');
  const defs = new Map(), bindings = new Set(), sources = new Set(), origins = new Set();
  for (const [i, d] of payload.definitions.entries()) {
    const p = `definitions[${i}]`;
    if (!plain(d)) { err(p, 'Status inválido.'); continue; }
    if (!identifier(d.id) || defs.has(d.id)) err(p, 'Identidade do status inválida ou repetida.');
    defs.set(d.id, d);
    if (typeof d.name !== 'string' || !d.name.trim() || d.name.length > 160) err(p, 'Nome do status obrigatório.');
    if (!['hero', 'weapon', 'skill', 'skill_level'].includes(d.scope) || !identifier(d.source_key)) err(p, 'Origem do status inválida.');
    const origin = [d.scope, d.skill_id || '', d.level_id || '', d.source_key].join(':');
    if (origins.has(origin)) err(p, 'Este campo já possui uma definição. Revise o status existente.');
    origins.add(origin);
    if (['skill','skill_level'].includes(d.scope) && !UUID.test(d.skill_id || '')) err(p, 'Escolha a habilidade de origem.');
    if (d.scope === 'skill_level' && !UUID.test(d.level_id || '')) err(p, 'Escolha o nível da habilidade.');
    if (!own(STATUS_UNITS, d.unit) || !['higher', 'lower', 'neutral'].includes(d.direction) || !['scalar', 'summary'].includes(d.kind)) err(p, 'Unidade, direção ou tipo inválido.');
    for (const key of ['minimum', 'maximum']) if (d[key] != null && (typeof d[key] !== 'number' || !Number.isFinite(d[key]))) err(p, 'Limite precisa ser numérico.');
    if (d.minimum != null && d.maximum != null && d.minimum > d.maximum) err(p, 'Limites invertidos.');
    if (evidence && (typeof d.evidence !== 'string' || d.evidence.trim().length < 3 || d.evidence.length > 2000)) err(p, 'Registre a evidência da definição (3 a 2000 caracteres).');
    const allowed = ['id','name','scope','source_key','skill_id','level_id','unit','direction','kind','minimum','maximum','evidence'];
    if (Object.keys(d).some(k => !allowed.includes(k))) err(p, 'Campo de definição não permitido.');
  }
  for (const [i, b] of payload.bindings.entries()) {
    const p = `bindings[${i}]`;
    if (!plain(b)) { err(p, 'Vínculo inválido.'); continue; }
    if (!UUID.test(b.id || '') || bindings.has(b.id)) err(p, 'Identidade de vínculo inválida ou repetida.');
    bindings.add(b.id);
    if (!['equipment_variant','set_bonus','hero_skill','hero_skill_level'].includes(b.source_kind) || !UUID.test(b.source_id || '') || typeof b.attribute_key !== 'string' || b.attribute_key.length > 240 || forbidden.has(b.attribute_key)) err(p, 'Fonte do vínculo inválida.');
    const locator = [b.source_kind, b.source_id, b.attribute_key].join(':');
    if (sources.has(locator)) err(p, 'Uma linha não pode ter dois destinos. Crie efeitos independentes na fonte.');
    sources.add(locator);
    const d = defs.get(b.target);
    if (!d || d.kind !== 'scalar' || d.unit === 'unknown') err(p, 'Destino precisa ser um status calculável com unidade confirmada.');
    const op = STATUS_OPERATORS[b.operator];
    if (!op) err(p, 'Escolha um dos quatro operadores.');
    if (b.unit !== (op?.operation === 'percent' ? 'percent' : d?.unit)) err(p, 'Unidade incompatível.');
    if (!own(STATUS_CONDITIONS, b.condition) || (b.condition === 'ability_active' && !UUID.test(b.ability_id || ''))) err(p, 'Condição inválida.');
    if (b.source_kind === 'hero_skill' && (b.condition !== 'ability_active' || b.ability_id !== b.source_id)) err(p, 'Efeito de habilidade exige a própria habilidade ativa.');
    if (b.source_kind === 'hero_skill_level' && b.condition !== 'ability_active') err(p, 'Efeito de nível exige habilidade ativa.');
    if (!own(b, 'source_snapshot') || b.source_snapshot === null) err(p, 'Falta a cópia da linha revisada.');
    if (b.source_snapshot?.textReview) err(p, 'Corrija o texto incompleto do equipamento antes de vincular.');
    if (evidence && (typeof b.evidence !== 'string' || b.evidence.trim().length < 3 || b.evidence.length > 2000)) err(p, 'Registre a evidência do vínculo (3 a 2000 caracteres).');
    const allowed = ['id','source_kind','source_id','attribute_key','source_snapshot','target','operator','unit','condition','ability_id','evidence'];
    if (Object.keys(b).some(k => !allowed.includes(k))) err(p, 'Campo de vínculo não permitido.');
  }
  if (Object.keys(payload).some(k => !['contract','definitions','bindings'].includes(k))) err('$', 'Campo de registro não permitido.');
  return { valid: errors.length === 0, errors };
}
export function compileStatusRegistry(snapshot) {
  if (!((Number.isSafeInteger(snapshot?.revision) && snapshot.revision >= 0) || /^draft:\d+$/.test(snapshot?.revision || '')) || typeof snapshot?.fingerprint !== 'string' || !snapshot.fingerprint.trim()) throw new Error('Revisão ou identidade do registro ausente.');
  const validation = validateStatusPayload(snapshot?.payload);
  if (!validation.valid) throw new Error(validation.errors.map(e => e.message).join(' '));
  const copy = JSON.parse(JSON.stringify(snapshot));
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  return freeze(copy);
}
export function statusSource(kind, id, attributes, metadata = {}) {
  return { ...metadata, statusSource: true, kind, id: String(id), attributes };
}
export function statusAttributeRows(attributes) {
  if (Array.isArray(attributes)) return attributes.map((raw, i) => ({ key: String(i), label: String(raw?.label || ''), value: raw?.value, operator: raw?.operator, raw }));
  if (plain(attributes)) return Object.entries(attributes).map(([key, value]) => ({ key, label: key, value, raw: value }));
  return [];
}
export function registryStatDefinitions(registry) {
  return Object.fromEntries((registry?.payload?.definitions || []).map(d => [d.id, {
    nome: d.name, unit: STATUS_UNITS[d.unit]?.symbol || '', lowerBetter: d.direction === 'lower',
    icone: d.unit === 'degree' ? '∠' : '◇', cor: '#74ded0', decimals: 2, summary: d.kind === 'summary', direction: d.direction
  }]));
}
export function resolveRegistryBase(baseInput, registry, legacyNormalize) {
  const scoped = plain(baseInput?.hero_stats) || plain(baseInput?.weapon_stats);
  const raw = scoped ? { ...baseInput.hero_stats, ...baseInput.weapon_stats } : baseInput;
  const claimed = new Set(registry.payload.definitions.filter(d => ['hero','weapon'].includes(d.scope)).map(d => d.source_key));
  const base = legacyNormalize(Object.fromEntries(Object.entries(raw || {}).filter(([key,value]) => !claimed.has(key) && finiteStatusNumber(value) !== null))), origins = {};
  for (const d of registry.payload.definitions) {
    const source = d.scope === 'skill_level'
      ? (baseInput?.skill_levels || []).find(s => s.id === d.level_id && s.skill_id === d.skill_id)
      : d.scope === 'skill'
      ? (baseInput?.skills || []).find(s => s.id === d.skill_id)
      : scoped ? baseInput[d.scope === 'hero' ? 'hero_stats' : 'weapon_stats'] : raw;
    // An installed definition owns its target. A missing source must not inherit
    // a similarly named legacy alias or treat null/empty as zero.
    delete base[d.id];
    const sourceSkill = ['skill','skill_level'].includes(d.scope) ? (baseInput?.skills || []).find(s => s.id === d.skill_id) : null;
    const trusted = !['skill','skill_level'].includes(d.scope) || (sourceSkill?.enabled === true && sourceSkill.needs_recheck === false && ['verified','corroborated'].includes(sourceSkill.verification_status));
    const n = trusted && own(source, d.source_key) ? finiteStatusNumber(source[d.source_key]) : null;
    origins[d.id] = { scope: d.scope, key: d.source_key, skillId: d.skill_id || null, levelId: d.level_id || null, value: n, unit: d.unit, status: n === null ? 'missing_base' : 'read' };
    if (n !== null) base[d.id] = n;
  }
  return { base, origins };
}
function conditionStatus(binding, context) {
  if (binding.condition === 'always') return null;
  if (binding.condition === 'ability_active') {
    if (!Array.isArray(context.activeAbilities)) return 'condition_required';
    return context.activeAbilities.includes(binding.ability_id) ? null : 'not_applicable';
  }
  const key = binding.condition === 'unaimed' ? 'aiming' : binding.condition;
  if (typeof context[key] !== 'boolean') return 'condition_required';
  const active = binding.condition === 'unaimed' ? !context[key] : context[key];
  return active ? null : 'not_applicable';
}
export function applyStatusRegistry(baseInput, sources, registry, { legacyApply, legacyNormalize, normalizeAttributes, context = {} }) {
  const { base, origins } = resolveRegistryBase(baseInput, registry, legacyNormalize);
  const final = { ...base }, applied = [], unknown = [], trace = [];
  const defs = new Map(registry.payload.definitions.map(d => [d.id, d]));
  const bySource = new Map();
  for (const binding of registry.payload.bindings) {
    const k = `${binding.source_kind}:${binding.source_id}:${binding.attribute_key}`;
    if (!bySource.has(k)) bySource.set(k, []);
    bySource.get(k).push(binding);
  }
  const reject = (entry, status) => {
    trace.push({ ...entry, status, reason: STATUS_REASONS[status] });
    if (status !== 'not_applicable') unknown.push(`${entry.sourceKey}: ${STATUS_REASONS[status] || status}`);
  };
  for (const [sourceIndex, source] of (sources || []).entries()) {
    const typed = source?.statusSource === true;
    const rows = statusAttributeRows(typed ? source.attributes : source);
    for (const row of rows) {
      const entry = { sourceIndex, sourceKey: row.label, attributeKey: row.key,
        source: typed ? { kind: source.kind, id: source.id, name: source.name || '', rarity: source.rarity || '' } : null,
        registryRevision: registry.revision, fingerprint: registry.fingerprint };
      const matches = typed ? bySource.get(`${source.kind}:${source.id}:${row.key}`) || [] : [];
      if (row.raw?.textReview) { reject(entry, 'source_incomplete'); continue; }
      if (matches.length > 1) { reject(entry, 'ambiguous_binding'); continue; }
      if (!matches.length) {
        if (typed && ['hero_skill','hero_skill_level'].includes(source.kind)) continue; // skills never enter numeric totals by text inference
        if (row.value == null || (typeof row.value === 'string' && !row.value.trim())) { reject(entry, 'invalid_value'); continue; }
        reject(entry, 'unmapped');
        continue;
      }
      const b = matches[0], d = defs.get(b.target), op = STATUS_OPERATORS[b.operator];
      Object.assign(entry, { bindingId: b.id, target: b.target, unit: d?.unit, operator: b.operator, condition: b.condition, abilityId: b.ability_id || null,
        targetScope: d?.scope, targetSourceKey: d?.source_key, sourceValue: row.value });
      if (stableStatusJson(row.raw) !== stableStatusJson(b.source_snapshot)) { reject(entry, 'source_changed'); continue; }
      if (['hero_skill','hero_skill_level'].includes(source.kind) && source.heroId !== context.heroId) { reject(entry, 'hero_mismatch'); continue; }
      if (['hero_skill','hero_skill_level'].includes(source.kind) && source.verified !== true) { reject(entry, 'skill_unverified'); continue; }
      const condition = conditionStatus(b, context);
      if (condition) { reject(entry, condition); continue; }
      if (source.kind === 'hero_skill_level') {
        if (source.skillId !== b.ability_id) { reject(entry, 'hero_mismatch'); continue; }
        if (!context.skillLevels?.[source.skillId]) { reject(entry, 'condition_required'); continue; }
        if (context.skillLevels[source.skillId] !== source.id) { reject(entry, 'not_applicable'); continue; }
      }
      if (!d || d.unit === 'unknown') { reject(entry, 'unknown_unit'); continue; }
      if (!op || b.unit !== (op.operation === 'percent' ? 'percent' : d.unit)) { reject(entry, 'invalid_unit'); continue; }
      const magnitude = statusMagnitude(row.value, b.unit);
      if (magnitude === null) { reject(entry, 'invalid_value'); continue; }
      if (!own(final, b.target) || finiteStatusNumber(final[b.target]) === null) { reject(entry, 'missing_base'); continue; }
      const before = final[b.target], value = op.sign * Math.abs(magnitude);
      const after = op.operation === 'percent' ? before * (1 + value / 100) : before + value;
      if (!Number.isFinite(after) || (d.minimum != null && after < d.minimum) || (d.maximum != null && after > d.maximum)) { reject({ ...entry, before, attempted: after }, 'invalid_result'); continue; }
      final[b.target] = after;
      const step = { ...entry, status: 'applied', reason: typeof registry.revision === 'string' ? 'Aplicado na prévia do rascunho' : STATUS_REASONS.applied, before, after, value, operation: op.operation, resolverSource: 'Central de Status', benefitDirection: d.direction, confidence: 1 };
      trace.push(step); applied.push(step);
    }
    if (typed) {
      const keys = new Set(rows.map(r => r.key));
      for (const b of registry.payload.bindings.filter(b => b.source_kind === source.kind && b.source_id === source.id && !keys.has(b.attribute_key))) {
        reject({ sourceIndex, sourceKey: 'Linha removida', attributeKey: b.attribute_key, target: b.target, bindingId: b.id,
          source: { kind: source.kind, id: source.id, name: source.name || '', rarity: source.rarity || '' } }, 'source_changed');
      }
    }
  }
  return { complete: unknown.length === 0, equipmentPolicy: 'explicit-bindings/v1', base, final, applied, unknown: [...new Set(unknown)], trace, origins,
    definitions: registryStatDefinitions(registry), registry: { contract: STATUS_REGISTRY_CONTRACT, revision: registry.revision, fingerprint: registry.fingerprint } };
}
export function compareStatusCalculations(local, remote) {
  if (local?.registry?.contract !== STATUS_REGISTRY_CONTRACT || remote?.registry?.contract !== STATUS_REGISTRY_CONTRACT || !local?.final || !remote?.final || !Array.isArray(local.trace) || !Array.isArray(remote.trace)) return { equal: false, reason: 'Não há duas provas completas para comparar.' };
  if (local.equipmentPolicy !== remote.equipmentPolicy) return { equal: false, reason: 'Site e Brain usam políticas diferentes de vínculo. Atualize os dois serviços.' };
  if (local.registry.revision !== remote.registry.revision || local.registry.fingerprint !== remote.registry.fingerprint) return { equal: false, reason: 'Site e Brain carregaram revisões diferentes.' };
  const keys = new Set([...Object.keys(local.final), ...Object.keys(remote.final)]);
  const different = [...keys].filter(k => !own(local.final, k) || !own(remote.final, k) || typeof local.final[k] !== 'number' || typeof remote.final[k] !== 'number' || !Number.isFinite(local.final[k]) || !Number.isFinite(remote.final[k]) || Math.abs(local.final[k] - remote.final[k]) > 1e-8);
  const traceShape = result => (result.trace || []).map(t => ({ source: t.source ? { kind: t.source.kind, id: t.source.id } : null, attributeKey: t.attributeKey, target: t.target, status: t.status, before: t.before, after: t.after, bindingId: t.bindingId }));
  const traceEqual = stableStatusJson(traceShape(local)) === stableStatusJson(traceShape(remote));
  return { equal: !different.length && traceEqual, different, reason: different.length ? 'Valores finais divergentes.' : !traceEqual ? 'A origem ou aplicação dos efeitos divergiu.' : 'Mesma revisão, mesmos resultados e mesma trilha de aplicação.' };
}

export function statusSkillSources(registry, skills, levels = []) {
  const bound = new Set(registry.payload.bindings.filter(b => ['hero_skill','hero_skill_level'].includes(b.source_kind)).map(b => `${b.source_kind}:${b.source_id}`));
  const sources = [];
  const meta = skill => ({ heroId: skill.hero_id, verified: skill.enabled === true && skill.needs_recheck === false && ['verified','corroborated'].includes(skill.verification_status) });
  for (const skill of skills) if (bound.has(`hero_skill:${skill.id}`)) sources.push(statusSource('hero_skill',skill.id,{ cooldown: skill.cooldown, duration: skill.duration, energy_cost: skill.energy_cost },meta(skill)));
  for (const level of levels) {
    const skill = skills.find(s => s.id === level.skill_id);
    if (skill && bound.has(`hero_skill_level:${level.id}`)) sources.push(statusSource('hero_skill_level',level.id,Object.fromEntries(['damage','healing','shield','cooldown','duration','radius','range','speed','energy_cost'].map(k => [k,level[k]])),{ ...meta(skill), skillId: skill.id }));
  }
  return sources.sort((a,b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}
