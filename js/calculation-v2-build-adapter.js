import { calculateBuild } from './calculation-v2-engine.js?v=20260915-calculation-v2-1&partial=20260917-partial-effects-1';
import { loadCalculationCatalogV2 } from './calculation-v2-client.js?v=20260915-calculation-v2-1&partial=20260917-partial-effects-1';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function heroIdOf(hero) {
  return hero?.databaseId || hero?.id || null;
}

function equipmentIdOf(item) {
  return item?.equipmentId || item?.databaseId || item?.id || null;
}

function rarityOf(item) {
  return item?.rarity || item?.raridade || item?.raritySlug || null;
}

/**
 * Lê cada base exclusivamente do escopo e chave declarados na definição.
 * Um valor ausente, string ou inválido permanece null; nunca vira zero.
 */
export function baseFromHeroCompleteStats(catalog, heroBaseRow) {
  const base = Object.create(null);
  for (const definition of catalog?.definitions || []) {
    const scope = definition?.source?.scope;
    const key = definition?.source?.key;
    const source = scope === 'hero'
      ? heroBaseRow?.hero_stats
      : scope === 'weapon'
        ? heroBaseRow?.weapon_stats
        : null;
    const value = record(source) && typeof key === 'string' && own(source, key)
      ? source[key]
      : null;
    base[definition.id] = finite(value)
      ? value
      : finite(definition?.defaultBase)
        ? definition.defaultBase
        : null;
  }
  return base;
}

function selectedSlots(slots, equipped) {
  if (!Array.isArray(slots)) return slots;
  return slots.map(slot => {
    if (slot === null) return null;
    const item = equipped && slot?.key ? equipped[slot.key] : slot;
    if (!item) return null;
    const equipmentId = equipmentIdOf(item);
    const rarity = rarityOf(item);
    return {
      equipmentId,
      equipmentName: item.name || item.nome || null,
      rarity,
    };
  });
}

export function createCalculationV2BuildInput({
  catalog,
  heroBaseRow,
  hero,
  slots,
  equipped,
  conditions = {},
  buildId = 'build-preview',
} = {}) {
  return {
    definitions: catalog?.definitions || [],
    equipment: catalog?.equipment || [],
    build: {
      id: buildId,
      hero: {
        id: heroIdOf(hero),
        name: hero?.name || hero?.nome || '',
        base: baseFromHeroCompleteStats(catalog, heroBaseRow),
      },
      slots: selectedSlots(slots, equipped),
      conditions: record(conditions) ? { ...conditions } : conditions,
    },
  };
}

function messageFor(core, missingHeroBase = false) {
  if (core.status === 'invalid') return 'A configuração de cálculo é inválida e nenhum total foi liberado.';
  if (missingHeroBase) return 'As estatísticas-base deste herói ainda não estão disponíveis.';
  if (core.status === 'partial') {
    const count = (core.summary?.pending || 0) + (core.summary?.invalid || 0);
    return `Cálculo parcial: ${count} efeito(s) não entraram na conta; os demais resultados continuam válidos.`;
  }
  if (core.status === 'pending') {
    const count = core.summary?.pending || 0;
    return count === 1
      ? 'Há 1 efeito pendente; os atributos afetados permanecem sem total.'
      : `Há ${count} efeitos pendentes; os atributos afetados permanecem sem total.`;
  }
  return '';
}

function definitionMap(definitions) {
  return new Map((definitions || []).map(definition => [definition.id, definition]));
}

/** Converte o resultado puro para o contrato consumido pelas páginas atuais. */
export function adaptCalculationV2Result(core, {
  definitions = [],
  catalogRevision = null,
  missingHeroBase = false,
  slotCount = 6,
  equippedCount = 0,
} = {}) {
  const byId = definitionMap(definitions);
  const base = Object.create(null);
  const total = Object.create(null);
  const lines = [];

  for (const definition of definitions) {
    const stat = core.stats?.[definition.id] || {
      id: definition.id, base: null, final: null, status: 'unavailable', reasons: [], trace: [],
    };
    const start = finite(stat.base) ? stat.base : null;
    const end = finite(stat.final) ? stat.final : null;
    const difference = start !== null && end !== null ? end - start : null;
    base[definition.id] = start;
    total[definition.id] = end;
    lines.push({
      key: definition.id,
      nome: definition.label || definition.id,
      unit: definition.unit || '',
      decimals: Number.isInteger(definition.decimals) ? definition.decimals : 2,
      base: start,
      valor: end,
      difference,
      status: stat.status,
      reasons: stat.reasons || [],
      trace: stat.trace || [],
      direction: byId.get(definition.id)?.direction || null,
    });
  }

  let status = core.status === 'calculated' ? 'ready' : core.status;
  if (missingHeroBase && status === 'ready') status = 'pending';
  const result = {
    engine: 'calculation-v2',
    status,
    mensagem: messageFor(core, missingHeroBase),
    catalogRevision,
    core,
    definitions,
    base,
    total,
    linhas: lines,
    estatisticas: lines,
    equipadosN: equippedCount,
    totalSlots: slotCount,
    estatisticasDesconhecidas: (core.notices || [])
      .filter(notice => ['pending', 'invalid'].includes(notice.status))
      .map(notice => notice.description || notice.equipmentName || notice.code),
  };
  return result;
}

function unavailable(status, mensagem, definitions = [], catalogRevision = null) {
  return {
    engine: 'calculation-v2',
    status,
    mensagem,
    catalogRevision,
    core: null,
    definitions,
    base: Object.create(null),
    total: Object.create(null),
    linhas: [],
    estatisticas: [],
    equipadosN: 0,
    totalSlots: 6,
    estatisticasDesconhecidas: [],
  };
}

function calculationDataFrom(context) {
  const data = context?.calculationV2 || context?.dados?.calculationV2 || null;
  return {
    catalog: context?.catalog || data?.catalog || context?.dados?.calculationV2Catalog || null,
    baseByHero: context?.baseByHero || data?.baseByHero || context?.dados?.calculationV2BaseByHero || null,
  };
}

function legacySetBonusNotices(equipped) {
  const items = Object.values(record(equipped) ? equipped : {}).filter(Boolean);
  const groups = new Map();
  for (const item of items) {
    if (!item?.setId) continue;
    const current = groups.get(item.setId) || { count: 0, set: item.set || null };
    current.count += 1;
    if (!current.set && item.set) current.set = item.set;
    groups.set(item.setId, current);
  }

  const notices = [];
  for (const [setId, group] of groups) {
    for (const bonus of group.set?.bonus || []) {
      const required = Number(bonus?.required_pieces);
      if (!Number.isFinite(required) || required < 1 || group.count < required) continue;
      notices.push({
        id: `set/${setId}/${bonus.id || required}`,
        effectId: null,
        equipmentId: null,
        equipmentName: group.set?.nome || group.set?.name || 'Bônus de conjunto',
        rarity: null,
        kind: 'unresolved',
        description: bonus.description || bonus.title || `Bônus de ${required} peças`,
        target: null,
        operation: null,
        amount: null,
        condition: null,
        conditionExpected: null,
        conditionActual: null,
        publicationStatus: null,
        status: 'pending',
        code: 'SET_BONUS_RULE_NOT_PUBLISHED',
        reason: 'O bônus de conjunto está ativo, mas ainda não possui um vínculo publicado no cálculo v2.',
        delta: null,
      });
    }
  }
  return notices;
}

/**
 * Adaptador síncrono para criar-build/comparar-build. Ele só usa o catálogo e
 * as bases previamente carregados em contexto.dados.calculationV2.
 */
export function analyzeBuildV2(context = {}) {
  const hero = context.heroi || context.hero || null;
  const heroId = heroIdOf(hero);
  if (!heroId) return unavailable('waiting-hero', 'Selecione um herói para iniciar o cálculo.');

  const { catalog, baseByHero } = calculationDataFrom(context);
  if (!catalog) return unavailable('catalog-unavailable', 'O catálogo público de cálculo v2 não foi carregado.');

  const heroBaseRow = context.heroBaseRow
    || (baseByHero instanceof Map ? baseByHero.get(heroId) : baseByHero?.[heroId])
    || null;
  const slots = context.slots;
  const equipped = context.equipados || context.equipped || null;
  const selected = selectedSlots(slots, equipped);
  const equippedCount = Array.isArray(selected) ? selected.filter(Boolean).length : 0;
  const input = createCalculationV2BuildInput({
    catalog,
    heroBaseRow,
    hero,
    slots,
    equipped,
    conditions: context.conditions || {},
    buildId: context.buildId || `hero-${heroId}`,
  });
  const core = calculateBuild(input);
  const setNotices = legacySetBonusNotices(equipped);
  if (setNotices.length && core.status !== 'invalid') {
    core.effects.push(...setNotices);
    core.notices.push(...setNotices);
    core.summary.pending += setNotices.length;
    core.status = core.summary.applied > 0 ? 'partial' : 'pending';
  }
  return adaptCalculationV2Result(core, {
    definitions: catalog.definitions,
    catalogRevision: catalog.catalogRevision || null,
    missingHeroBase: !heroBaseRow,
    slotCount: Array.isArray(slots) ? slots.length : 0,
    equippedCount,
  });
}

/** Carrega catálogo publicado e bases oficiais para uso pelo adaptador síncrono. */
export async function loadCalculationDataV2(supabase, { force = false } = {}) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new TypeError('Informe um cliente Supabase válido para carregar as bases v2.');
  }
  const [catalog, baseResponse] = await Promise.all([
    loadCalculationCatalogV2(supabase, { force }),
    supabase.from('hero_complete_base_stats').select('hero_id,hero_stats,weapon_stats'),
  ]);
  if (baseResponse?.error) {
    throw new Error(baseResponse.error.message || 'Não foi possível carregar as estatísticas-base dos heróis.');
  }
  const baseByHero = new Map();
  for (const row of baseResponse?.data || []) {
    if (row?.hero_id) baseByHero.set(row.hero_id, row);
  }
  return {
    contract: catalog.contract,
    catalogRevision: catalog.catalogRevision || null,
    catalog,
    baseByHero,
  };
}

/** Linhas objetivas usadas no detalhe do equipamento da mesa de builds. */
export function effectRowsForEquipment(catalog, equipmentId, rarity) {
  const item = (catalog?.equipment || []).find(entry => entry.id === equipmentId);
  if (!item || !item.publication || !Array.isArray(item.effects) || item.effects.length === 0) {
    return [{
      id: null,
      description: 'Efeitos ainda não publicados para cálculo.',
      target: null,
      operation: null,
      value: null,
      unit: '',
      status: 'pending',
      code: 'EFFECTS_NOT_PUBLISHED',
    }];
  }
  const definitions = definitionMap(catalog.definitions);
  return item.effects.map(effect => {
    const definition = effect.target ? definitions.get(effect.target) : null;
    const value = effect.kind === 'numeric' && record(effect.values) && own(effect.values, rarity)
      && finite(effect.values[rarity])
      ? effect.values[rarity]
      : null;
    const status = effect.kind === 'informational'
      ? 'informational'
      : effect.kind === 'unresolved' || value === null
        ? 'pending'
        : 'ready';
    return {
      id: effect.id,
      description: effect.description || '',
      target: effect.target || null,
      targetLabel: definition?.label || null,
      operation: effect.operation || null,
      value,
      unit: definition?.unit || '',
      condition: effect.condition || 'always',
      conditionExpected: effect.conditionExpected ?? null,
      status,
      code: status === 'pending'
        ? effect.kind === 'unresolved' ? 'EFFECT_UNRESOLVED' : 'RARITY_VALUE_UNKNOWN'
        : effect.kind === 'informational' ? 'INFORMATIONAL' : 'RESOLVED',
    };
  });
}
