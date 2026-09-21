import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';

export const PUBLIC_ITEM_FIT_SCHEMA_V4 = 'echo-brain-item-fit-public-v4';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let requestSequence = 0;

const invalid = detail => ({
  ok: false,
  error: 'invalid_item_fit_response',
  detail,
  fallback: 'none',
  localInfluence: 0,
  result: null
});

function finiteInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function cleanText(value, max) {
  const result = String(value || '').trim();
  return result && result.length <= max ? result : null;
}

function normalizeContext(context = {}) {
  const heroId = cleanText(context?.heroi?.databaseId, 36);
  if (!heroId || !UUID_RE.test(heroId)) return null;
  const items = [];
  for (const [slotKey, item] of Object.entries(context.equipados || {})) {
    if (!item) continue;
    const equipmentId = cleanText(item.databaseId || item.id, 36);
    const slot = cleanText(slotKey, 80);
    const raritySlug = cleanText(item.raridade, 80);
    if (!equipmentId || !UUID_RE.test(equipmentId) || !slot || !raritySlug) return null;
    items.push({ slot, equipmentId, raritySlug });
  }
  if (items.length > 12 || new Set(items.map(item => item.slot)).size !== items.length) return null;
  return { heroId, items };
}

function validKnowledge(knowledge, expected) {
  if (!knowledge || knowledge.fresh !== true || !knowledge.hero || !Array.isArray(knowledge.equipment)) return false;
  if (knowledge.hero.id !== expected.heroId || !Number.isInteger(knowledge.hero.version) || knowledge.hero.version < 1) return false;
  if (!String(knowledge.hero.gameVersion || '') || !/^(?:[0-9a-f]{32}|[0-9a-f]{64})$/i.test(String(knowledge.hero.fingerprint || ''))) return false;
  if (knowledge.equipment.length !== expected.items.length) return false;
  const expectedIds = new Set(expected.items.map(item => item.equipmentId));
  return knowledge.equipment.every(row =>
    expectedIds.has(String(row?.id || ''))
    && Number.isInteger(row?.version) && row.version > 0
    && String(row?.gameVersion || '') === String(knowledge.hero.gameVersion)
    && /^(?:[0-9a-f]{32}|[0-9a-f]{64})$/i.test(String(row?.fingerprint || ''))
  );
}

function validBrain(brain, expected) {
  if (!brain || brain.schemaVersion !== 'echo-brain-item-fit-v4' || brain.heroId !== expected.heroId) return false;
  if (!finiteInRange(brain.buildFitScore, 0, 100) || !finiteInRange(brain.buildNumericFitScore, 0, 100)) return false;
  if (!finiteInRange(brain.explanationConfidence, 0, 1) || !finiteInRange(brain.calculationCoverage, 0, 1)) return false;
  if (brain.knowledgeStatus !== 'current' || brain.knowledgeFresh !== true) return false;
  if (!Array.isArray(brain.itens) || brain.itens.length !== expected.items.length) return false;
  const bySlot = new Map(expected.items.map(item => [item.slot, item]));
  return brain.itens.every(item => {
    const wanted = bySlot.get(String(item?.slot || ''));
    return Boolean(
      wanted && String(item?.equipmentId || '') === wanted.equipmentId
      && finiteInRange(item?.fitScore, 0, 100)
      && finiteInRange(item?.numericFitScore, 0, 100)
      && finiteInRange(item?.calculationCoverage, 0, 1)
      && item?.freshness?.fresh === true
      && Number.isInteger(item?.freshness?.version) && item.freshness.version > 0
    );
  });
}

export function validatePublicItemFitResponseV4(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.ok !== true) return invalid('response_not_ok');
  if (value.schemaVersion !== PUBLIC_ITEM_FIT_SCHEMA_V4) return invalid('schema_mismatch');
  if (value.authority !== 'server' || value.fallback !== 'none' || value.localInfluence !== 0) return invalid('authority_contract_invalid');
  if (String(value.requestId || '') !== String(expected.requestId || '')) return invalid('request_identity_mismatch');
  if (!validKnowledge(value.knowledge, expected) || !validBrain(value.result, expected)) return invalid('result_contract_invalid');
  if (!String(value.exposureId || '')) return invalid('exposure_provenance_missing');
  return value;
}

export async function scorePublicItemFitV4(context = {}, surface = 'build_lab') {
  const normalized = normalizeContext(context);
  if (!normalized) return invalid('invalid_item_fit_request');
  const requestId = `item-fit-${Date.now()}-${++requestSequence}`;
  const expected = { requestId, ...normalized };
  const { data, error } = await supabase.functions.invoke('echo-brain-item-fit', {
    body: { ...expected, calculationContext: context.calculationConditions || {}, surface: surface === 'comparison' ? 'comparison' : 'build_lab' }
  });
  if (error) {
    console.warn('[echo-brain-item-fit-client-v4] autoridade do servidor indisponível; nenhum score local será publicado.', error?.message || error);
    return { ...invalid('server_unavailable'), error: error?.message || 'item_fit_unavailable' };
  }
  const value = validatePublicItemFitResponseV4(data, expected);
  if (!value.ok) {
    console.warn('[echo-brain-item-fit-client-v4] resposta incompatível rejeitada; nenhum score local será publicado.', value.detail);
  }
  return value;
}
