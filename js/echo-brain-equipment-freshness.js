import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';

const freshness = new Map();
let loaded = false;
let available = false;
let loadError = null;

function rowsFrom(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.rows)) return data.rows;
  return [];
}

export async function loadEquipmentFreshnessCache() {
  if (loaded) return { available, error: loadError, size: freshness.size };
  loaded = true;
  try {
    // Não assume `enabled`, `status` ou outro predicado legado: a própria RLS
    // pública decide quais equipamentos este cliente pode enxergar.
    const { data: equipments, error: equipmentError } = await supabase
      .from('equipments')
      .select('id');
    if (equipmentError) throw equipmentError;
    const ids = (equipments || []).map(item => String(item.id)).filter(Boolean);
    if (!ids.length) {
      available = true;
      return { available, error: null, size: 0 };
    }
    const { data, error } = await supabase.rpc('echo_brain_equipment_freshness', {
      p_equipment_ids: ids
    });
    if (error) throw error;
    freshness.clear();
    for (const row of rowsFrom(data)) {
      const id = String(row?.equipmentId || row?.equipment_id || '');
      if (!id) continue;
      freshness.set(id, {
        equipmentId: id,
        version: Number(row?.version) || 0,
        gameVersion: row?.gameVersion || row?.game_version || null,
        fingerprint: row?.fingerprint || null,
        changedAt: row?.changedAt || row?.changed_at || null,
        pendingInvalidations: Math.max(0, Number(row?.pendingInvalidations ?? row?.pending_invalidations) || 0)
      });
    }
    available = true;
    loadError = null;
  } catch (error) {
    available = false;
    loadError = error;
    console.warn('[echo-brain-equipment-freshness] memória de versões indisponível; análise numérica continua, confiança semântica fica sem confirmação de frescor.', error?.message || error);
  }
  return { available, error: loadError, size: freshness.size };
}

export function getEquipmentFreshness(equipmentId) {
  const id = String(equipmentId || '');
  if (!id) return { available, known: false, fresh: false, pendingInvalidations: 0, version: 0 };
  const row = freshness.get(id) || null;
  return {
    available,
    known: Boolean(row),
    fresh: Boolean(row) && Number(row.pendingInvalidations || 0) === 0,
    pendingInvalidations: Number(row?.pendingInvalidations || 0),
    version: Number(row?.version || 0),
    gameVersion: row?.gameVersion || null,
    changedAt: row?.changedAt || null,
    fingerprint: row?.fingerprint || null,
    error: loadError
  };
}

export function equipmentFreshnessState() {
  return { loaded, available, error: loadError, size: freshness.size };
}

await loadEquipmentFreshnessCache();
