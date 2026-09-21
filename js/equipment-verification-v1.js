import { loadCalculationCatalogV2 } from './calculation-v2-client.js?v=20260915-calculation-v2-1';

const cache = new WeakMap();

const BADGES = Object.freeze({
  official: Object.freeze({
    kind: 'official',
    label: 'Oficial ZeptoLab',
  }),
  master: Object.freeze({
    kind: 'master',
    label: 'Verificação Master',
  }),
});

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const SOURCE_REFERENCE_PATTERNS = Object.freeze({
  game_capture: /^game-capture:sha256:[a-f0-9]{64}$/,
  official: /^zeptolab-official:[a-z0-9][a-z0-9:._/-]{2,255}$/,
});

function validVerifiedSource(source) {
  if (!record(source) || !nonempty(source.kind) || !nonempty(source.reference)) return false;
  const pattern = SOURCE_REFERENCE_PATTERNS[source.kind];
  return pattern instanceof RegExp
    && source.reference === source.reference.trim()
    && pattern.test(source.reference);
}

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

/**
 * Resolve o selo público exclusivamente a partir de um item normalizado do
 * catálogo de cálculo v2. A ausência de evidência nunca vira selo.
 */
export function resolveEquipmentVerificationV1(equipment) {
  if (!record(equipment)
    || !validPublication(equipment.publication)
    || !Array.isArray(equipment.effects)) {
    return null;
  }

  const allowedKinds = new Set(['numeric', 'informational', 'unresolved']);
  if (equipment.effects.some(effect => !record(effect)
    || !allowedKinds.has(effect.kind)
    || effect.kind === 'unresolved')) {
    return null;
  }

  const numeric = equipment.effects.filter(effect => effect.kind === 'numeric');
  if (!numeric.length) return null;

  if (numeric.some(effect => !nonempty(effect.target)
    || !['flat', 'percent'].includes(effect.operation)
    || !record(effect.values)
    || !Object.values(effect.values).some(Number.isFinite)
    || !validVerifiedSource(effect.source))) return null;

  const sourceKinds = numeric.map(effect => effect.source.kind);
  if (sourceKinds.every(kind => kind === 'official')) return BADGES.official;
  if (sourceKinds.some(kind => kind === 'game_capture')) return BADGES.master;
  return null;
}

/** Cria um índice somente com equipamentos que possuem selo público. */
export function indexEquipmentVerificationV1(catalog) {
  const index = new Map();
  if (!record(catalog) || !Array.isArray(catalog.equipment)) return index;

  for (const equipment of catalog.equipment) {
    const badge = resolveEquipmentVerificationV1(equipment);
    if (badge && equipment?.id !== null && equipment?.id !== undefined) {
      index.set(String(equipment.id), badge);
    }
  }

  return index;
}

/** Carrega e indexa o catálogo v2, compartilhando a Promise por cliente. */
export async function loadEquipmentVerificationV1(supabase, { force = false } = {}) {
  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new TypeError('Informe um cliente Supabase válido para carregar os selos de equipamento.');
  }
  if (!force && cache.has(supabase)) return cache.get(supabase);

  const pending = loadCalculationCatalogV2(supabase, { force })
    .then(indexEquipmentVerificationV1);

  cache.set(supabase, pending);
  try {
    return await pending;
  } catch (error) {
    if (cache.get(supabase) === pending) cache.delete(supabase);
    throw error;
  }
}

export function clearEquipmentVerificationV1Cache(supabase) {
  if (supabase && cache.has(supabase)) cache.delete(supabase);
}
