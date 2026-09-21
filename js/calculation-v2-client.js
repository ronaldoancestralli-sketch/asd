/** Leitura única do catálogo público do motor v2. Sem fallback legado. */

const cache = new WeakMap();
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

function validPublication(publication) {
  return record(publication)
    && publication.id !== null
    && publication.id !== undefined
    && Number.isSafeInteger(Number(publication.workspaceRevision))
    && Number(publication.workspaceRevision) > 0
    && typeof publication.fingerprint === 'string'
    && /^[a-f0-9]{64}$/i.test(publication.fingerprint)
    && nonempty(publication.publishedAt);
}

function assertPublishedEffect(effect, index) {
  const path = `equipment.effects[${index}]`;
  if (!record(effect) || !nonempty(effect.id)
    || !['numeric', 'informational', 'unresolved'].includes(effect.kind)) {
    throw new Error(`${path} não segue o contrato publicado do cálculo v2.`);
  }
  if (!nonempty(effect.description)
    || !['self', 'team'].includes(effect.scope)
    || !['source', 'recipient'].includes(effect.evaluatedOn)
    || (effect.scope === 'self' && effect.evaluatedOn !== 'source')
    || !nonempty(effect.condition)) {
    throw new Error(`${path} está sem descrição, alcance ou condição explícita.`);
  }
  if (effect.condition === 'always') {
    if (effect.conditionExpected !== null) throw new Error(`${path} possui condição always incompatível.`);
  } else if (typeof effect.conditionExpected !== 'boolean') {
    throw new Error(`${path} está sem valor esperado para a condição.`);
  }
  if (effect.kind === 'numeric') {
    if ((effect.target !== null && effect.target !== undefined && !nonempty(effect.target))
      || !['flat', 'percent'].includes(effect.operation)
      || !record(effect.values) || !record(effect.source)
      || !nonempty(effect.source.kind) || !nonempty(effect.source.reference)) {
      throw new Error(`${path} está sem vínculo numérico ou fonte verificável.`);
    }
  } else if (effect.operation !== null && effect.operation !== undefined) {
    throw new Error(`${path} não numérico contém operação numérica.`);
  }
}

function cloneValues(values) {
  if (!record(values)) return {};
  return Object.fromEntries(Object.entries(values).map(([rarity, value]) => [rarity, value]));
}

function normalizeDefinition(definition) {
  return {
    id: definition.id,
    label: definition.label || definition.id,
    unit: definition.unit || '',
    direction: definition.direction || null,
    decimals: Number.isInteger(definition.decimals) ? definition.decimals : 2,
    defaultBase: typeof definition.defaultBase === 'number' && Number.isFinite(definition.defaultBase)
      ? definition.defaultBase
      : null,
    source: {
      scope: definition.scope,
      key: definition.sourceKey,
    },
    policy: definition.policy || null,
  };
}

function normalizeEffect(effect, published) {
  const common = {
    id: effect.id,
    kind: effect.kind,
    description: effect.description || '',
    rawLabel: effect.rawLabel || effect.description || '',
    normalizedLabel: effect.normalizedLabel || null,
    scope: effect.scope,
    condition: effect.condition,
    conditionExpected: effect.conditionExpected ?? null,
    evaluatedOn: effect.evaluatedOn,
    publicationStatus: published ? 'published' : 'draft',
    source: effect.source || null,
  };
  if (effect.kind === 'numeric') {
    return {
      ...common,
      target: effect.target || null,
      operation: effect.operation,
      values: cloneValues(effect.values),
    };
  }
  if (effect.kind === 'unresolved') {
    return {
      ...common,
      ...(effect.target ? { target: effect.target } : {}),
      reason: effect.reason || '',
    };
  }
  return common;
}

/**
 * Normaliza apenas nomes estruturais publicados pelo contrato v2. Descrições
 * nunca são examinadas para inferir destino, operação, condição ou unidade.
 */
export function normalizeCalculationCatalogV2(payload) {
  let value = payload;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { /* validado abaixo */ }
  }
  if (Array.isArray(value) && value.length === 1 && record(value[0])) value = value[0];
  if (!record(value) || value.contract !== 'echo-calculation-catalog/v2') {
    throw new Error('O Supabase retornou um catálogo de cálculo incompatível.');
  }
  if (!Array.isArray(value.definitions) || !Array.isArray(value.equipment)) {
    throw new Error('O catálogo de cálculo publicado está incompleto.');
  }

  return {
    contract: value.contract,
    catalogRevision: value.catalogRevision ?? null,
    generatedAt: value.generatedAt ?? null,
    policy: value.policy ?? null,
    definitions: value.definitions.map(normalizeDefinition),
    conditions: Array.isArray(value.conditions) ? value.conditions.map(condition => ({ ...condition })) : [],
    rarities: Array.isArray(value.rarities) ? value.rarities.map(rarity => ({ ...rarity })) : [],
    equipment: value.equipment.map(item => {
      const publication = validPublication(item.publication) ? { ...item.publication } : null;
      const effects = publication && Array.isArray(item.effects) ? item.effects : [];
      effects.forEach(assertPublishedEffect);
      return {
        id: item.id,
        name: item.name || item.id,
        publication,
        // Dados não publicados jamais recebem autoridade por estarem presentes
        // acidentalmente na resposta.
        effects: publication
          ? effects.map(effect => normalizeEffect(effect, true))
          : [],
      };
    }),
  };
}

/** Carrega get_calculation_catalog_v2 e mantém a mesma Promise por cliente. */
export async function loadCalculationCatalogV2(supabase, { force = false } = {}) {
  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new TypeError('Informe um cliente Supabase válido para carregar o catálogo v2.');
  }
  if (!force && cache.has(supabase)) return cache.get(supabase);

  const pending = (async () => {
    const response = await supabase.rpc('get_calculation_catalog_v2');
    if (response?.error) {
      throw new Error(response.error.message || 'Não foi possível carregar o catálogo de cálculo v2.');
    }
    return normalizeCalculationCatalogV2(response?.data);
  })();
  cache.set(supabase, pending);
  try {
    return await pending;
  } catch (error) {
    if (cache.get(supabase) === pending) cache.delete(supabase);
    throw error;
  }
}

export function clearCalculationCatalogV2Cache(supabase) {
  if (supabase && cache.has(supabase)) cache.delete(supabase);
}
