import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { compileStatusRegistry, emptyStatusPayload } from './status-registry-v1.js?sc=20260906-1&eq=20260907-effects-1';

// Each analysis load obtains a coherent snapshot. No stale localStorage copy and
// no process-wide mutable registry shared across users or Edge requests.
export async function loadStatusRegistry() {
  const { data, error } = await supabase.rpc('get_status_registry_v1');
  if (error) throw new Error(`Central de Status indisponível: ${error.message}`);
  return compileStatusRegistry(data);
}
export async function readStatusRows(table, columns, order = 'id') {
  const rows = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await supabase.from(table).select(columns).order(order).range(page * 1000, page * 1000 + 999);
    if (error || !Array.isArray(data)) throw new Error(`${table}: ${error?.message || 'resposta incompleta'}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
  throw new Error(`${table}: a leitura excedeu o limite de registros; cálculo suspenso.`);
}
export function statusOptionsForContext(context = {}) {
  const heroId = context.heroi?.databaseId || context.heroId;
  return {
    registry: context.dados?.statusRegistry || compileStatusRegistry({ revision: 0, fingerprint: 'registry-not-loaded', payload: emptyStatusPayload() }),
    sourceBase: context.dados?.statusBaseByHero?.get(heroId),
    context: { ...context.calculationConditions, heroId }
  };
}
export function itemCalculationSource(item) {
  const level = item?.levels?.find(row => row.slug === item.raridade) || item?.levels?.[0];
  return level?.calculationSource || level?.stats || null;
}
