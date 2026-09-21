/**
 * Echo Arena — motor de cálculo v2.
 *
 * Este módulo é deliberadamente puro: não lê banco, não interpreta descrições
 * e não conhece apelidos de atributos. Um efeito só altera um valor quando o
 * catálogo publicado informa destino, operação, valor e regra de composição.
 */

export const POLICY_ID = 'additive-base-v1';
export const POLICY_DESCRIPTION =
  '(base + soma dos valores fixos) + base × soma dos percentuais / 100; sem arredondamento';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const compare = (left, right) => String(left).localeCompare(String(right), 'en');
const issue = (code, path, message) => ({ code, path, message });

function normalizeAuditLabel(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^\s*(?:[•·*›»]\s*)?[+−–-]?\s*\d+(?:[.,]\d+)?\s*(?:%|°|x\b|s\b|m\b)?\s*/i, '')
    .replace(/^[\s•·*›»+−–-]+/, '')
    .replace(/^(?:a|ao|as|aos)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function reviewed(effect) {
  if (effect.publicationStatus !== undefined) return effect.publicationStatus === 'published';
  if (effect.ruleStatus !== undefined) return effect.ruleStatus === 'reviewed';
  if (effect.published !== undefined) return effect.published === true;
  return false;
}

function policyKnown(definition) {
  return record(definition.policy)
    && definition.policy.id === POLICY_ID
    && nonempty(definition.policy.reference)
    && (definition.policy.rounding === undefined || definition.policy.rounding === 'none');
}

function unresolvedTrace({ equipmentId, equipmentName, rarity, code, reason, effect = null }) {
  return {
    id: `${equipmentId}/${effect?.id || code}`,
    effectId: effect?.id || null,
    equipmentId,
    equipmentName: equipmentName || equipmentId,
    rarity: rarity || null,
    kind: effect?.kind || 'unresolved',
    description: effect?.description || '',
    rawLabel: effect?.rawLabel || effect?.description || '',
    normalizedLabel: effect?.normalizedLabel
      || normalizeAuditLabel(effect?.rawLabel || effect?.description),
    target: effect?.target || null,
    canonicalStatKey: effect?.target || null,
    resolved: false,
    calculated: false,
    operation: effect?.operation || null,
    amount: null,
    condition: effect?.condition || null,
    conditionExpected: effect?.conditionExpected ?? null,
    conditionActual: null,
    publicationStatus: effect?.publicationStatus || effect?.ruleStatus || null,
    status: 'pending',
    code,
    reason,
    delta: null,
  };
}

function validateDefinition(definition, index, errors, ids) {
  const path = `definitions[${index}]`;
  if (!record(definition) || !nonempty(definition.id)
    || !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(definition.id)) {
    errors.push(issue('INVALID_STAT_ID', path, 'O atributo precisa de um identificador exato e qualificado.'));
    return;
  }
  if (ids.has(definition.id)) {
    errors.push(issue('DUPLICATE_STAT_ID', path, 'Identificador de atributo repetido.'));
    return;
  }
  ids.add(definition.id);
  if (definition.policy !== null && definition.policy !== undefined && !record(definition.policy)) {
    errors.push(issue('INVALID_POLICY', `${path}.policy`, 'A política precisa ser um objeto ou null.'));
  }
}

function validateEffect(effect, path, definitions, errors) {
  if (!record(effect) || !nonempty(effect.id)) {
    errors.push(issue('INVALID_EFFECT_ID', path, 'O efeito precisa de um identificador estável.'));
    return;
  }
  if (!['numeric', 'informational', 'unresolved'].includes(effect.kind)) {
    errors.push(issue('INVALID_EFFECT_KIND', `${path}.kind`, 'Tipo de efeito inválido.'));
    return;
  }
  if (!['self', 'team'].includes(effect.scope)) {
    errors.push(issue('INVALID_SCOPE', `${path}.scope`, 'O alcance precisa ser self ou team.'));
  }
  if (!['source', 'recipient'].includes(effect.evaluatedOn)
    || (effect.scope === 'self' && effect.evaluatedOn !== 'source')) {
    errors.push(issue('INVALID_EVALUATION_TARGET', `${path}.evaluatedOn`, 'O local de avaliação da condição é inválido.'));
  }
  if (effect.source !== null && effect.source !== undefined
    && (!record(effect.source) || !nonempty(effect.source.kind) || !nonempty(effect.source.reference))) {
    errors.push(issue('INVALID_SOURCE', `${path}.source`, 'A fonte precisa informar tipo e referência verificável.'));
  }
  if (effect.condition !== undefined && !nonempty(effect.condition)) {
    errors.push(issue('INVALID_CONDITION', `${path}.condition`, 'A condição precisa de uma chave explícita.'));
  }
  if (effect.conditionExpected !== undefined && effect.conditionExpected !== null
    && typeof effect.conditionExpected !== 'boolean') {
    errors.push(issue('INVALID_CONDITION_EXPECTED', `${path}.conditionExpected`, 'O valor esperado precisa ser booleano ou null.'));
  }
  if (effect.condition === 'always' && effect.conditionExpected !== undefined && effect.conditionExpected !== null) {
    errors.push(issue('ALWAYS_WITH_EXPECTED_VALUE', `${path}.conditionExpected`, 'A condição always não recebe valor esperado.'));
  }
  if (effect.condition !== undefined && effect.condition !== 'always'
    && typeof effect.conditionExpected !== 'boolean') {
    errors.push(issue('CONDITION_EXPECTED_REQUIRED', `${path}.conditionExpected`, 'Uma condição contextual precisa declarar true ou false como valor esperado.'));
  }
  if (effect.kind === 'informational') {
    if (!nonempty(effect.description)) {
      errors.push(issue('MISSING_DESCRIPTION', `${path}.description`, 'O efeito informativo precisa de descrição.'));
    }
    if (effect.target !== undefined || effect.operation !== undefined
      || effect.values !== undefined || effect.amount !== undefined) {
      errors.push(issue('INFORMATIONAL_WITH_CALCULATION', path, 'Efeito informativo não pode conter uma operação numérica.'));
    }
    return;
  }
  if (effect.kind === 'unresolved') {
    if (!nonempty(effect.description)) {
      errors.push(issue('MISSING_DESCRIPTION', `${path}.description`, 'O efeito pendente precisa de descrição.'));
    }
    if (effect.target !== undefined && !definitions.has(effect.target)) {
      errors.push(issue('UNKNOWN_TARGET', `${path}.target`, 'O destino explícito não existe no catálogo.'));
    }
    return;
  }
  // A ausência de destino é uma pendência semântica deste efeito, não uma
  // corrupção estrutural capaz de invalidar os demais efeitos da build.
  if (nonempty(effect.target) && !definitions.has(effect.target)) {
    errors.push(issue('UNKNOWN_TARGET', `${path}.target`, 'O destino explícito não existe no catálogo.'));
  }
  if (!['flat', 'percent'].includes(effect.operation)) {
    errors.push(issue('INVALID_OPERATION', `${path}.operation`, 'Use flat ou percent.'));
  }
  if (reviewed(effect)
    && (!record(effect.source) || !nonempty(effect.source.kind) || !nonempty(effect.source.reference))) {
    errors.push(issue('SOURCE_REQUIRED', `${path}.source`, 'Um efeito numérico publicado precisa de fonte verificável.'));
  }
  if (!record(effect.values)) {
    errors.push(issue('INVALID_RARITY_VALUES', `${path}.values`, 'Informe os valores por raridade.'));
  } else {
    for (const [rarity, value] of Object.entries(effect.values)) {
      if (!nonempty(rarity) || (value !== null && !finite(value))) {
        errors.push(issue('INVALID_EFFECT_VALUE', `${path}.values.${rarity}`, 'O valor deve ser numérico ou null; vazio nunca equivale a zero.'));
      }
    }
  }
}

function invalidResult(errors) {
  return {
    status: 'invalid',
    errors,
    stats: Object.create(null),
    effects: [],
    notices: [],
    summary: { applied: 0, inactive: 0, pending: 0, informational: 0, invalid: errors.length },
  };
}

function selectedTraces({ equipment, build, definitions, effectIssues }) {
  const catalog = new Map(equipment.map(item => [item.id, item]));
  const traces = [];

  for (const slot of build.slots) {
    if (slot === null) continue;
    const item = catalog.get(slot.equipmentId);
    if (!item) {
      traces.push(unresolvedTrace({
        equipmentId: slot.equipmentId,
        equipmentName: slot.equipmentName,
        rarity: slot.rarity,
        code: 'EQUIPMENT_NOT_PUBLISHED',
        reason: 'O equipamento selecionado ainda não possui publicação no catálogo de cálculo.',
      }));
      continue;
    }
    if (!Array.isArray(item.effects) || item.effects.length === 0) {
      traces.push(unresolvedTrace({
        equipmentId: item.id,
        equipmentName: item.name,
        rarity: slot.rarity,
        code: 'EFFECTS_NOT_PUBLISHED',
        reason: 'O equipamento ainda não possui efeitos publicados para cálculo.',
      }));
      continue;
    }

    for (const effect of [...item.effects].sort((a, b) => compare(a?.id, b?.id))) {
      const base = {
        id: `${item.id}/${effect.id}`,
        effectId: effect.id,
        equipmentId: item.id,
        equipmentName: item.name || item.id,
        rarity: slot.rarity,
        kind: effect.kind,
        description: effect.description || '',
        rawLabel: effect.rawLabel || effect.description || '',
        normalizedLabel: effect.normalizedLabel
          || normalizeAuditLabel(effect.rawLabel || effect.description),
        target: effect.target || null,
        canonicalStatKey: effect.target || null,
        resolved: false,
        calculated: false,
        operation: effect.operation || null,
        scope: effect.scope || 'self',
        amount: null,
        condition: effect.condition || null,
        conditionExpected: effect.conditionExpected ?? null,
        conditionActual: null,
        publicationStatus: effect.publicationStatus || effect.ruleStatus || null,
        status: 'pending',
        code: null,
        reason: '',
        delta: null,
      };

      const localIssues = effectIssues.get(effect) || [];
      if (localIssues.length) {
        const first = localIssues[0];
        traces.push({
          ...base,
          status: 'invalid',
          code: first.code,
          reason: first.message,
          validationIssues: localIssues,
        });
        continue;
      }

      const amount = record(effect.values) && own(effect.values, slot.rarity)
        ? effect.values[slot.rarity]
        : null;

      if (effect.kind === 'unresolved') {
        traces.push({
          ...base,
          amount: finite(amount) ? amount : null,
          code: 'EFFECT_UNRESOLVED',
          reason: effect.reason || 'Status não vinculado; este efeito não entrou no cálculo.',
        });
        continue;
      }
      if (effect.kind === 'informational') {
        traces.push({ ...base, status: 'informational', code: 'INFORMATIONAL', reason: 'Efeito descritivo, preservado sem alterar números.' });
        continue;
      }
      if (!nonempty(effect.target)) {
        traces.push({
          ...base,
          amount: finite(amount) ? amount : null,
          code: 'STATUS_NOT_LINKED',
          reason: 'Status não vinculado; este efeito não entrou no cálculo.',
        });
        continue;
      }
      // A publicação é verificada antes da condição: uma regra em rascunho
      // não tem autoridade nem mesmo para declarar que o efeito está inativo.
      if (!reviewed(effect)) {
        traces.push({ ...base, code: 'RULE_NOT_PUBLISHED', reason: 'O vínculo do efeito ainda não foi publicado.' });
        continue;
      }
      // Esta mesa calcula um único portador. Aplicar um efeito de equipe sem
      // receptores explícitos inventaria um destinatário e um total falso.
      if (effect.scope === 'team') {
        traces.push({
          ...base,
          code: 'TEAM_CONTEXT_REQUIRED',
          reason: 'Este efeito depende da composição e ainda não possui um receptor selecionado nesta mesa.',
        });
        continue;
      }
      if (effect.condition !== undefined && effect.condition !== 'always') {
        const conditionValue = own(build.conditions || {}, effect.condition)
          ? build.conditions[effect.condition]
          : null;
        if (conditionValue === null || conditionValue === undefined) {
          traces.push({ ...base, code: 'CONDITION_UNKNOWN', reason: 'Falta informar se a condição está ativa.' });
          continue;
        }
        if (conditionValue !== effect.conditionExpected) {
          traces.push({
            ...base,
            conditionActual: conditionValue,
            status: 'inactive',
            code: 'CONDITION_NOT_MATCHED',
            reason: 'O estado atual não corresponde ao valor esperado pelo efeito.',
          });
          continue;
        }
        base.conditionActual = conditionValue;
      }
      if (amount === null) {
        traces.push({ ...base, code: 'RARITY_VALUE_UNKNOWN', reason: 'Não existe valor publicado para esta raridade.' });
        continue;
      }
      traces.push({
        ...base,
        amount,
        resolved: true,
        status: 'applied',
        code: 'RESOLVED',
        reason: 'Destino, operação, valor e condição são conhecidos.',
      });
    }
  }
  return traces;
}

function calculateStats(definitions, build, traces, errors) {
  const stats = Object.create(null);

  for (const definition of [...definitions.values()].sort((a, b) => compare(a.id, b.id))) {
    const base = own(build.hero.base, definition.id) ? build.hero.base[definition.id] : null;
    const relevant = traces.filter(trace => trace.target === definition.id);
    const activeRelevant = relevant.filter(trace => trace.status !== 'inactive');
    const ready = activeRelevant.filter(trace => trace.status === 'applied');
    const pending = relevant.filter(trace => trace.status === 'pending');
    const invalid = relevant.filter(trace => trace.status === 'invalid');
    const stat = {
      id: definition.id,
      label: definition.label || definition.id,
      unit: definition.unit || '',
      base,
      final: base,
      knownSubtotal: base,
      status: base === null ? 'unavailable' : 'unchanged',
      policy: definition.policy || null,
      formula: null,
      reasons: [],
      trace: relevant,
    };

    const markPending = (code, message) => {
      stat.status = 'pending';
      stat.final = null;
      if (!stat.reasons.some(reason => reason.code === code)) stat.reasons.push({ code, message });
    };

    if (activeRelevant.length && !policyKnown(definition)) {
      markPending('POLICY_UNKNOWN', 'A regra de composição deste atributo não está publicada.');
      stat.knownSubtotal = null;
      for (const trace of ready) Object.assign(trace, {
        status: 'pending', code: 'POLICY_UNKNOWN', reason: 'A regra de composição deste atributo não está publicada.',
      });
    }
    if (pending.length) markPending('EFFECT_PENDING', 'Há um efeito pendente neste atributo.');
    if (invalid.length) {
      stat.reasons.push({
        code: 'INVALID_EFFECT_IGNORED',
        message: `${invalid.length} efeito(s) inválido(s) foram ignorados somente neste atributo.`,
      });
    }
    if (ready.length && base === null) {
      markPending('BASE_UNKNOWN', 'O valor base deste atributo não está cadastrado para o herói.');
      for (const trace of ready) Object.assign(trace, {
        status: 'pending', code: 'BASE_UNKNOWN', reason: 'O efeito é conhecido, mas o valor base não está disponível.',
      });
    }

    if (base !== null && ready.length && policyKnown(definition)) {
      const flat = ready.filter(trace => trace.operation === 'flat')
        .reduce((sum, trace) => sum + trace.amount, 0);
      const percent = ready.filter(trace => trace.operation === 'percent')
        .reduce((sum, trace) => sum + trace.amount, 0);
      const percentDelta = base * (percent / 100);
      const subtotal = base + flat + percentDelta;
      const deltas = ready.map(trace => trace.operation === 'flat'
        ? trace.amount
        : base * (trace.amount / 100));
      stat.formula = { id: POLICY_ID, description: POLICY_DESCRIPTION, flat, percent, percentDelta };

      if (![flat, percent, percentDelta, subtotal, ...deltas].every(finite)) {
        stat.status = 'invalid';
        stat.final = null;
        stat.knownSubtotal = null;
        stat.reasons.push({ code: 'NUMERIC_OVERFLOW', message: 'A conta produziu um número não finito.' });
        errors.push(issue('NUMERIC_OVERFLOW', `stats.${definition.id}`, 'A conta produziu um número não finito.'));
        for (const trace of ready) Object.assign(trace, {
          status: 'invalid', code: 'NUMERIC_OVERFLOW', reason: 'Não foi possível produzir um número válido.', delta: null,
        });
      } else {
        stat.knownSubtotal = subtotal;
        ready.forEach((trace, index) => {
          trace.delta = deltas[index];
          trace.calculated = true;
        });
        if (stat.status !== 'pending') {
          stat.final = subtotal;
          stat.status = invalid.length ? 'partial' : 'calculated';
        }
      }
    }
    stats[definition.id] = stat;
  }
  return stats;
}

/** Calcula uma build de seis slots sem efeitos colaterais. */
export function calculateBuild(input) {
  try {
    const errors = [];
    if (!record(input)) return invalidResult([issue('INVALID_INPUT', '', 'A entrada precisa ser um objeto.')]);
    if (!Array.isArray(input.definitions) || input.definitions.length === 0) {
      return invalidResult([issue('INVALID_DEFINITIONS', 'definitions', 'O catálogo de atributos está ausente.')]);
    }
    if (!Array.isArray(input.equipment)) {
      return invalidResult([issue('INVALID_EQUIPMENT', 'equipment', 'O catálogo de equipamentos está ausente.')]);
    }
    if (!record(input.build) || !record(input.build.hero) || !record(input.build.hero.base)) {
      return invalidResult([issue('INVALID_BUILD', 'build', 'A build precisa de herói e valores base.')]);
    }
    if (!Array.isArray(input.build.slots) || input.build.slots.length !== 6) {
      return invalidResult([issue('INVALID_SLOT_COUNT', 'build.slots', 'A build precisa de exatamente seis slots.')]);
    }

    const definitionIds = new Set();
    input.definitions.forEach((definition, index) => validateDefinition(definition, index, errors, definitionIds));
    const definitions = new Map(input.definitions.filter(definition => record(definition) && nonempty(definition.id))
      .map(definition => [definition.id, definition]));

    const equipmentIds = new Set();
    const effectIds = new Set();
    const effectIssues = new WeakMap();
    input.equipment.forEach((item, itemIndex) => {
      const path = `equipment[${itemIndex}]`;
      if (!record(item) || !nonempty(item.id)) {
        errors.push(issue('INVALID_EQUIPMENT_ID', path, 'O equipamento precisa de id.'));
        return;
      }
      if (equipmentIds.has(item.id)) errors.push(issue('DUPLICATE_EQUIPMENT_ID', path, 'Equipamento repetido no catálogo.'));
      equipmentIds.add(item.id);
      if (item.effects !== undefined && !Array.isArray(item.effects)) {
        errors.push(issue('INVALID_EFFECTS', `${path}.effects`, 'A lista de efeitos é inválida.'));
        return;
      }
      (item.effects || []).forEach((effect, effectIndex) => {
        const localErrors = [];
        validateEffect(effect, `${path}.effects[${effectIndex}]`, definitions, localErrors);
        if (record(effect) && localErrors.length) effectIssues.set(effect, localErrors);
        if (record(effect) && nonempty(effect.id)) {
          if (effectIds.has(effect.id)) errors.push(issue('DUPLICATE_EFFECT_ID', `${path}.effects[${effectIndex}]`, 'Id de efeito repetido.'));
          effectIds.add(effect.id);
        }
      });
    });

    const equipped = new Set();
    input.build.slots.forEach((slot, index) => {
      if (slot === null) return;
      if (!record(slot) || !nonempty(slot.equipmentId) || !nonempty(slot.rarity)) {
        errors.push(issue('INVALID_SLOT', `build.slots[${index}]`, 'Use equipmentId e rarity ou null.'));
        return;
      }
      if (equipped.has(slot.equipmentId)) errors.push(issue('DUPLICATE_EQUIPMENT', `build.slots[${index}]`, 'Equipamento repetido na build.'));
      equipped.add(slot.equipmentId);
    });
    for (const [id, value] of Object.entries(input.build.hero.base)) {
      if (!definitions.has(id)) errors.push(issue('UNKNOWN_BASE_STAT', `build.hero.base.${id}`, 'A base aponta para um atributo inexistente.'));
      if (value !== null && !finite(value)) errors.push(issue('INVALID_BASE_VALUE', `build.hero.base.${id}`, 'A base precisa ser numérica ou null.'));
    }
    if (input.build.conditions !== undefined && !record(input.build.conditions)) {
      errors.push(issue('INVALID_CONDITIONS', 'build.conditions', 'As condições precisam ser um objeto.'));
    } else {
      for (const [key, value] of Object.entries(input.build.conditions || {})) {
        if (!nonempty(key) || (value !== null && typeof value !== 'boolean')) {
          errors.push(issue('INVALID_CONDITION_VALUE', `build.conditions.${key}`, 'Condição informada precisa ser booleana ou null quando ainda é desconhecida.'));
        }
      }
    }
    if (errors.length) return invalidResult(errors);

    const traces = selectedTraces({
      equipment: input.equipment,
      build: input.build,
      definitions,
      effectIssues,
    });
    const calculationErrors = [];
    const stats = calculateStats(definitions, input.build, traces, calculationErrors);
    const summary = { applied: 0, inactive: 0, pending: 0, informational: 0, invalid: 0 };
    traces.forEach(trace => { summary[trace.status] += 1; });
    const statIssues = Object.values(stats).some(stat => ['pending', 'partial', 'invalid'].includes(stat.status));
    const hasRecoverableIssues = summary.pending || summary.invalid || statIssues || calculationErrors.length;
    const status = hasRecoverableIssues
      ? summary.applied > 0
        ? 'partial'
        : calculationErrors.length || summary.invalid
          ? 'invalid'
          : 'pending'
      : 'calculated';
    return {
      buildId: input.build.id || null,
      heroId: input.build.hero.id || null,
      status,
      errors: calculationErrors,
      stats,
      effects: traces,
      notices: traces.filter(trace => ['pending', 'informational', 'invalid'].includes(trace.status)),
      summary,
    };
  } catch (error) {
    return invalidResult([issue('ENGINE_FAILURE', '', error instanceof Error ? error.message : 'Falha interna no motor.')]);
  }
}
