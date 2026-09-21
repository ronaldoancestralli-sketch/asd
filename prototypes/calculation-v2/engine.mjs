/**
 * Echo Arena — núcleo novo, puro e sem dependências.
 * Dados e regras usados pela demonstração NÃO são regras confirmadas do jogo.
 * Nenhum texto de descrição é interpretado como destino, condição ou fórmula.
 */

export const POLICY_ID = 'additive-base-v1';
export const POLICY_DESCRIPTION = '(base + soma dos valores fixos) + base × soma dos percentuais / 100; sem arredondamento';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const error = (code, path, message) => ({ code, path, message });

function validate(input, team) {
  const errors = [];
  const add = (code, path, message) => errors.push(error(code, path, message));
  if (!record(input)) return { errors: [error('INVALID_INPUT', '', 'A entrada deve ser um objeto.')] };
  if (!Array.isArray(input.definitions) || !input.definitions.length) add('INVALID_DEFINITIONS', 'definitions', 'Informe o catálogo de atributos.');
  if (!Array.isArray(input.equipment)) add('INVALID_EQUIPMENT', 'equipment', 'Informe o catálogo de equipamentos.');
  const builds = team ? input.builds : [input.build];
  if (!Array.isArray(builds) || !builds.length) add('INVALID_BUILDS', 'builds', 'Informe ao menos uma build.');
  if (errors.length) return { errors };
  const definitions = new Map();
  for (const [index, definition] of input.definitions.entries()) {
    const path = `definitions[${index}]`;
    if (!record(definition) || !nonempty(definition.id) || !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(definition.id)) {
      add('INVALID_STAT_ID', path, 'O atributo precisa de um identificador exato e qualificado, como weapon.spread.moving.');
      continue;
    }
    if (definitions.has(definition.id)) add('DUPLICATE_STAT_ID', path, 'Identificador de atributo repetido.');
    definitions.set(definition.id, definition);
    if (definition.policy != null && !record(definition.policy)) add('INVALID_POLICY', `${path}.policy`, 'A política deve ser um objeto ou null.');
  }
  const catalog = new Map();
  const effectIds = new Map();
  const registerEffect = (effect, path, owner) => {
    if (!record(effect) || !nonempty(effect.id)) { add('INVALID_EFFECT_ID', path, 'Efeito sem identificador estável.'); return; }
    if (effectIds.has(effect.id) && effectIds.get(effect.id) !== owner) add('DUPLICATE_EFFECT_ID', path, 'O identificador do efeito deve ser único em todo o catálogo.');
    effectIds.set(effect.id, owner);
  };
  for (const [index, item] of input.equipment.entries()) {
    const path = `equipment[${index}]`;
    if (!record(item) || !nonempty(item.id)) { add('INVALID_EQUIPMENT_ID', path, 'Equipamento sem identificador.'); continue; }
    if (catalog.has(item.id)) add('DUPLICATE_EQUIPMENT_ID', path, 'Identificador de equipamento repetido no catálogo.');
    catalog.set(item.id, item);
    if (!Array.isArray(item.effects)) { add('INVALID_EFFECTS', `${path}.effects`, 'Os efeitos devem ser uma lista.'); continue; }
    for (const [effectIndex, effect] of item.effects.entries()) {
      registerEffect(effect, `${path}.effects[${effectIndex}]`, `equipment:${item.id}:${effectIndex}`);
    }
  }
  const sets = new Map();
  if (input.sets !== undefined && !Array.isArray(input.sets)) add('INVALID_SETS', 'sets', 'Os conjuntos devem ser uma lista.');
  for (const [index, set] of (Array.isArray(input.sets) ? input.sets : []).entries()) {
    const path = `sets[${index}]`;
    if (!record(set) || !nonempty(set.id) || !Array.isArray(set.bonuses)) { add('INVALID_SET', path, 'Conjunto precisa de id e lista de bônus.'); continue; }
    if (sets.has(set.id)) add('DUPLICATE_SET_ID', path, 'Identificador de conjunto repetido.');
    sets.set(set.id, set);
    const bonusIds = new Set();
    for (const [bonusIndex, bonus] of set.bonuses.entries()) {
      const bonusPath = `${path}.bonuses[${bonusIndex}]`;
      if (!record(bonus) || !nonempty(bonus.id) || !Array.isArray(bonus.effects) || !bonus.effects.length
        || !Number.isInteger(bonus.requiredPieces) || bonus.requiredPieces < 1 || bonus.requiredPieces > 6) {
        add('INVALID_SET_BONUS', bonusPath, 'Bônus precisa de id, efeitos e um número de peças entre 1 e 6.'); continue;
      }
      if (bonusIds.has(bonus.id)) add('DUPLICATE_BONUS_ID', bonusPath, 'Identificador de bônus repetido no conjunto.');
      bonusIds.add(bonus.id);
      for (const [effectIndex, effect] of bonus.effects.entries()) registerEffect(effect, `${bonusPath}.effects[${effectIndex}]`, `set:${set.id}:${bonus.id}:${effectIndex}`);
    }
  }
  const buildIds = new Set();
  const selections = [];
  for (const [index, build] of builds.entries()) {
    const path = team ? `builds[${index}]` : 'build';
    if (!record(build) || !nonempty(build.id)) { add('INVALID_BUILD_ID', path, 'Build sem identificador.'); continue; }
    if (buildIds.has(build.id)) add('DUPLICATE_BUILD_ID', path, 'Identificador de membro repetido.');
    buildIds.add(build.id);
    if (!record(build.hero) || !nonempty(build.hero.id) || !record(build.hero.base)) {
      add('INVALID_HERO', `${path}.hero`, 'Informe o herói e um objeto com seus valores base.');
    } else {
      for (const [id, value] of Object.entries(build.hero.base)) {
        if (!definitions.has(id)) add('UNKNOWN_BASE_STAT', `${path}.hero.base.${id}`, 'Valor base aponta para um atributo inexistente.');
        if (value !== null && !finite(value)) add('INVALID_BASE_VALUE', `${path}.hero.base.${id}`, 'O valor base precisa ser um número finito ou null.');
      }
    }
    if (build.conditions !== undefined && !record(build.conditions)) add('INVALID_CONDITIONS', `${path}.conditions`, 'As condições devem ser um objeto.');
    if (record(build.conditions)) for (const [condition, value] of Object.entries(build.conditions)) {
      if (!nonempty(condition) || ![true, false, null].includes(value)) add('INVALID_CONDITION_VALUE', `${path}.conditions.${condition}`, 'Condição deve ser true, false ou null.');
    }
    if (!Array.isArray(build.slots) || build.slots.length !== 6) { add('INVALID_SLOT_COUNT', `${path}.slots`, 'Uma build precisa de exatamente 6 posições; use null nos espaços vazios.'); continue; }
    const equippedIds = new Set();
    const setCounts = new Map();
    for (const [slotIndex, slot] of build.slots.entries()) {
      const slotPath = `${path}.slots[${slotIndex}]`;
      if (slot === null) continue;
      if (!record(slot) || !nonempty(slot.equipmentId) || !nonempty(slot.rarity)) { add('INVALID_SLOT', slotPath, 'Informe equipmentId e rarity ou deixe a posição null.'); continue; }
      if (equippedIds.has(slot.equipmentId)) add('DUPLICATE_EQUIPMENT', slotPath, 'Equipamento repetido: este contrato não habilita repetições sem uma regra específica.');
      equippedIds.add(slot.equipmentId);
      const item = catalog.get(slot.equipmentId);
      if (!item) { add('UNKNOWN_EQUIPMENT', slotPath, 'Equipamento não encontrado no catálogo.'); continue; }
      if (item.setId !== undefined) {
        if (!nonempty(item.setId) || !sets.has(item.setId)) add('UNKNOWN_SET', slotPath, 'O equipamento aponta para um conjunto inexistente.');
        else setCounts.set(item.setId, (setCounts.get(item.setId) || 0) + 1);
      }
      if (!Array.isArray(item.effects)) continue;
      if (!item.effects.length) add('EMPTY_EQUIPMENT', slotPath, 'O equipamento não possui efeitos registrados; cadastre o efeito ou declare-o informativo.');
      for (const effect of item.effects) {
        if (!record(effect) || !nonempty(effect.id)) continue;
        const effectPath = `equipment.${item.id}.effects.${effect.id}`;
        validateSelectedEffect(effect, effectPath, definitions, add);
        selections.push({ item, effect, sourceBuild: build, rarity: slot.rarity, sourceKind: 'equipment' });
      }
    }
    if (record(build.hero) && build.hero.effects !== undefined && !Array.isArray(build.hero.effects)) add('INVALID_HERO_EFFECTS', `${path}.hero.effects`, 'As habilidades/passivas precisam ser uma lista de efeitos.');
    const heroEffectIds = new Set();
    for (const [effectIndex, effect] of (Array.isArray(build.hero?.effects) ? build.hero.effects : []).entries()) {
      const effectPath = `${path}.hero.effects[${effectIndex}]`;
      if (record(effect) && heroEffectIds.has(effect.id)) add('DUPLICATE_EFFECT_ID', effectPath, 'Efeito de herói repetido na mesma lista.');
      if (record(effect)) heroEffectIds.add(effect.id);
      registerEffect(effect, effectPath, `hero:${build.hero.id}:${effect?.id}`);
      if (!record(effect) || !nonempty(effect.id)) continue;
      validateSelectedEffect(effect, effectPath, definitions, add, false);
      selections.push({ item: { id: build.hero.id, name: build.hero.name }, effect, sourceBuild: build, rarity: null, sourceKind: 'hero' });
    }
    for (const [setId, pieces] of setCounts) for (const bonus of sets.get(setId).bonuses) {
      if (!record(bonus) || !Array.isArray(bonus.effects) || pieces < bonus.requiredPieces) continue;
      for (const effect of bonus.effects) {
        if (!record(effect) || !nonempty(effect.id)) continue;
        validateSelectedEffect(effect, `sets.${setId}.bonuses.${bonus.id}.effects.${effect.id}`, definitions, add, false);
        selections.push({ item: { id: setId, name: sets.get(setId).name || setId }, effect, sourceBuild: build, rarity: null,
          sourceKind: 'set', bonusId: bonus.id, requiredPieces: bonus.requiredPieces, equippedPieces: pieces });
      }
    }
  }
  return { errors, definitions, builds, selections };
}

function validateSelectedEffect(effect, path, definitions, add, hasRarity = true) {
  if (!['numeric', 'informational'].includes(effect.kind)) { add('INVALID_EFFECT_KIND', `${path}.kind`, 'Declare o efeito como numeric ou informational.'); return; }
  if (!['self', 'team'].includes(effect.scope)) add('INVALID_SCOPE', `${path}.scope`, 'Declare o alcance do efeito: self ou team.');
  if (effect.condition !== undefined && !nonempty(effect.condition)) add('INVALID_CONDITION', `${path}.condition`, 'Informe a chave exata da condição ou omita a condição.');
  if (effect.evaluatedOn !== undefined && !['source', 'recipient'].includes(effect.evaluatedOn)) add('INVALID_CONDITION_ORIGIN', `${path}.evaluatedOn`, 'Origem da condição inválida.');
  if (effect.scope === 'team' && effect.condition !== undefined && !['source', 'recipient'].includes(effect.evaluatedOn)) {
    add('CONDITION_ORIGIN_REQUIRED', `${path}.evaluatedOn`, 'Em efeitos de equipe, declare se a condição pertence ao portador ou ao receptor.');
  }
  if (effect.kind === 'informational') {
    if (!nonempty(effect.description)) add('MISSING_DESCRIPTION', `${path}.description`, 'Um efeito informativo precisa de uma descrição.');
    if (effect.target !== undefined || effect.operation !== undefined || effect.values !== undefined || effect.amount !== undefined) add('INFORMATIONAL_WITH_CALCULATION', path, 'Efeito informativo não pode esconder uma operação numérica; separe os efeitos.');
    return;
  }
  if (!nonempty(effect.target) || !definitions.has(effect.target)) add('UNKNOWN_TARGET', `${path}.target`, 'Destino inexistente: o motor não tenta adivinhar pelo texto.');
  if (!['flat', 'percent'].includes(effect.operation)) add('INVALID_OPERATION', `${path}.operation`, 'Operação inválida; use flat ou percent.');
  if (own(effect, 'values') === own(effect, 'amount')) add('AMBIGUOUS_EFFECT_AMOUNT', path, 'Informe amount ou values, exclusivamente.');
  if (own(effect, 'amount') && effect.amount !== null && !finite(effect.amount)) add('INVALID_EFFECT_VALUE', `${path}.amount`, 'O valor deve ser um número finito ou null.');
  if (own(effect, 'values') && !hasRarity) add('RARITY_CONTEXT_UNAVAILABLE', `${path}.values`, 'Habilidades e bônus de conjunto usam amount; não há raridade implícita.');
  if (own(effect, 'values') && !record(effect.values)) add('INVALID_RARITY_VALUES', `${path}.values`, 'Informe um objeto com os valores por raridade.');
  else if (record(effect.values)) for (const [rarity, value] of Object.entries(effect.values)) {
    if (!nonempty(rarity) || (value !== null && !finite(value))) add('INVALID_EFFECT_VALUE', `${path}.values.${rarity}`, 'O valor de raridade deve ser um número finito ou null; vazio não é zero.');
  }
  if (!record(effect.source) || !nonempty(effect.source.kind) || !nonempty(effect.source.reference)) add('MISSING_EFFECT_SOURCE', `${path}.source`, 'Informe a origem do efeito; a descrição não comprova sua regra.');
  if (effect.ruleStatus !== undefined && !['draft', 'reviewed'].includes(effect.ruleStatus)) add('INVALID_RULE_STATUS', `${path}.ruleStatus`, 'Situação de revisão inválida.');
}

function conditionState(effect, sourceBuild, recipient) {
  if (effect.condition === undefined) return { state: 'true', evaluatedOn: null, key: null };
  const evaluatedOn = effect.scope === 'team' ? effect.evaluatedOn : 'source';
  const owner = evaluatedOn === 'recipient' ? recipient : sourceBuild;
  const value = own(owner.conditions || {}, effect.condition) ? owner.conditions[effect.condition] : null;
  return { state: value === true ? 'true' : value === false ? 'false' : 'unknown', evaluatedOn, key: effect.condition, buildId: owner.id };
}

function traceFor(selection, recipient) {
  const { item, effect, sourceBuild, rarity, sourceKind } = selection;
  const condition = conditionState(effect, sourceBuild, recipient);
  const trace = {
    id: `${sourceBuild.id}/${effect.id}/${recipient.id}`,
    effectId: effect.id, sourceKind, sourceId: item.id,
    equipmentId: sourceKind === 'equipment' ? item.id : null, equipmentName: item.name || item.id,
    bonusId: selection.bonusId || null, requiredPieces: selection.requiredPieces || null, equippedPieces: selection.equippedPieces || null,
    sourceBuildId: sourceBuild.id, recipientBuildId: recipient.id, rarity,
    kind: effect.kind, target: effect.target || null, scope: effect.scope,
    description: effect.description || '', operation: effect.operation || null,
    amount: effect.kind === 'numeric' ? own(effect, 'amount') ? effect.amount : own(effect.values, rarity) ? effect.values[rarity] : null : null,
    condition, ruleStatus: effect.ruleStatus || 'draft', source: effect.source || null,
    status: 'pending', code: null, delta: null,
  };
  // Uma condição ainda em rascunho também não tem autoridade para excluir o efeito.
  if (effect.kind === 'numeric' && effect.ruleStatus !== 'reviewed') return { ...trace, code: 'RULE_NOT_REVIEWED', reason: 'O vínculo, a condição e a operação ainda não foram revisados.' };
  if (condition.state === 'false') return { ...trace, status: 'inactive', code: 'CONDITION_FALSE', reason: 'A condição não está ativa.' };
  if (condition.state === 'unknown') return { ...trace, code: 'CONDITION_UNKNOWN', reason: 'Falta informar a condição.' };
  if (effect.kind === 'informational') return { ...trace, status: 'informational', code: 'INFORMATIONAL', reason: 'Efeito descritivo; não participa dos valores numéricos.' };
  if (trace.amount === null) return { ...trace, code: rarity ? 'RARITY_VALUE_UNKNOWN' : 'EFFECT_AMOUNT_UNKNOWN', reason: rarity ? 'Não existe valor conhecido para esta raridade.' : 'O valor deste efeito não é conhecido.' };
  return { ...trace, status: 'applied', code: 'RESOLVED', reason: 'Destino, operação, valor e condição conhecidos.' };
}

function policyKnown(definition) {
  return record(definition.policy) && definition.policy.id === POLICY_ID && nonempty(definition.policy.reference)
    && (definition.policy.rounding === undefined || definition.policy.rounding === 'none');
}

function calculateMember(build, definitions, selections) {
  const traces = selections
    .filter(selection => selection.effect.scope === 'team' || selection.sourceBuild.id === build.id)
    .sort((a, b) => compare(a.sourceBuild.id, b.sourceBuild.id) || compare(a.effect.id, b.effect.id))
    .map(selection => traceFor(selection, build));
  const stats = Object.create(null);
  const errors = [];
  for (const definition of definitions.values()) {
    const id = definition.id;
    const base = own(build.hero.base, id) ? build.hero.base[id] : null;
    const statTraces = traces.filter(trace => trace.target === id);
    const relevant = statTraces.filter(trace => trace.status !== 'inactive');
    const stat = { id, label: definition.label || id, unit: definition.unit || '', base, final: base,
      knownSubtotal: base, status: 'unchanged', policy: definition.policy || null,
      formula: null, reasons: [], trace: statTraces };
    const block = (code, message) => { stat.reasons.push({ code, message }); stat.status = 'pending'; stat.final = null; };
    if (base === null) block('BASE_UNKNOWN', 'O valor base deste atributo não é conhecido.');
    if (relevant.length && !policyKnown(definition)) {
      block('POLICY_UNKNOWN', 'Falta uma política de cálculo reconhecida com sua referência.');
      stat.knownSubtotal = null;
      for (const trace of relevant) if (trace.status === 'applied') Object.assign(trace, { status: 'pending', code: 'POLICY_UNKNOWN', reason: 'A política de cálculo não foi definida.' });
    }
    if (relevant.some(trace => trace.status === 'pending')) block('EFFECT_PENDING', 'Há efeitos com informações pendentes; o resultado final não foi liberado.');
    if (base === null) {
      for (const trace of relevant) if (trace.status === 'applied') Object.assign(trace, { status: 'pending', code: 'BASE_UNKNOWN', reason: 'A alteração é conhecida, mas falta o valor base.' });
    }
    if (base !== null && relevant.length && policyKnown(definition)) {
      const ready = relevant.filter(trace => trace.status === 'applied');
      const flat = ready.filter(trace => trace.operation === 'flat').reduce((sum, trace) => sum + trace.amount, 0);
      const percent = ready.filter(trace => trace.operation === 'percent').reduce((sum, trace) => sum + trace.amount, 0);
      const percentDelta = base * (percent / 100);
      const subtotal = (base + flat) + percentDelta;
      stat.formula = { id: POLICY_ID, description: POLICY_DESCRIPTION, flat, percent, percentDelta };
      const deltas = ready.map(trace => trace.operation === 'flat' ? trace.amount : base * (trace.amount / 100));
      if (![flat, percent, percentDelta, subtotal, ...deltas].every(finite)) {
        stat.status = 'invalid'; stat.final = null; stat.knownSubtotal = null;
        stat.reasons.push({ code: 'NUMERIC_OVERFLOW', message: 'A operação ultrapassou os limites numéricos.' });
        errors.push(error('NUMERIC_OVERFLOW', `build.${build.id}.stats.${id}`, 'A conta produziu um número não finito.'));
        for (const trace of ready) Object.assign(trace, { status: 'invalid', code: 'NUMERIC_OVERFLOW', reason: 'Não foi possível produzir um resultado numérico válido.' });
      } else {
        stat.knownSubtotal = subtotal;
        for (const trace of ready) trace.delta = trace.operation === 'flat' ? trace.amount : base * (trace.amount / 100);
        if (stat.status !== 'pending') { stat.final = subtotal; stat.status = 'calculated'; }
      }
    }
    stats[id] = stat;
  }
  const summary = { applied: 0, inactive: 0, pending: 0, informational: 0, invalid: 0 };
  for (const trace of traces) summary[trace.status] += 1;
  const status = errors.length ? 'invalid'
    : Object.values(stats).some(stat => stat.status === 'pending') || summary.pending ? 'pending' : 'calculated';
  return { buildId: build.id, heroId: build.hero.id, status, errors, stats, effects: traces, summary,
    notices: traces.filter(trace => trace.kind === 'informational') };
}

function invalid(errors) {
  return { status: 'invalid', errors, stats: Object.create(null), effects: [], notices: [],
    summary: { applied: 0, inactive: 0, pending: 0, informational: 0, invalid: errors.length } };
}

/** Pure calculation for one hero. Team effects in its equipment also affect the wearer. */
export function calculateBuild(input) {
  const prepared = validate(input, false);
  if (prepared.errors.length) return invalid(prepared.errors);
  return calculateMember(prepared.builds[0], prepared.definitions, prepared.selections);
}

/** Pure team calculation. Member IDs identify recipients; no mutable intermediate totals. */
export function calculateTeam(input) {
  const prepared = validate(input, true);
  if (prepared.errors.length) return { ...invalid(prepared.errors), members: [] };
  const members = prepared.builds.map(build => calculateMember(build, prepared.definitions, prepared.selections));
  const errors = members.flatMap(member => member.errors);
  return { status: errors.length ? 'invalid' : members.some(member => member.status === 'pending') ? 'pending' : 'calculated',
    errors, members };
}
