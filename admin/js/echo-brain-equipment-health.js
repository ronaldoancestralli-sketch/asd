import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

async function count(table, configure = query => query) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  query = configure(query);
  const { count: value, error } = await query;
  return { count: error ? null : (value ?? 0), error: error || null };
}

export async function loadEquipmentBrainHealth() {
  const [pendingQueue, pendingInvalidations, trainingInvalidations, versions] = await Promise.all([
    count('equipment_brain_change_queue', query => query.in('status', ['pending', 'processing'])),
    count('equipment_brain_invalidations', query => query.eq('status', 'pending')),
    count('equipment_brain_invalidations', query => query.eq('status', 'pending').eq('scope', 'training')),
    count('equipment_brain_versions')
  ]);

  const errors = [pendingQueue.error, pendingInvalidations.error, trainingInvalidations.error, versions.error].filter(Boolean);
  if (errors.length) {
    return {
      available: false,
      pendingItems: null,
      pendingInvalidations: null,
      pendingTraining: null,
      versions: null,
      stale: null,
      error: errors[0]
    };
  }

  const pendingItems = Number(pendingQueue.count || 0);
  const pending = Number(pendingInvalidations.count || 0);
  const pendingTraining = Number(trainingInvalidations.count || 0);
  return {
    available: true,
    pendingItems,
    pendingInvalidations: pending,
    pendingTraining,
    versions: Number(versions.count || 0),
    stale: pendingItems > 0 || pending > 0,
    requiresRetraining: pendingTraining > 0,
    error: null
  };
}

export function equipmentBrainHealthCopy(health) {
  if (!health?.available) return 'Memória de equipamentos indisponível';
  if (health.pendingTraining > 0) return `${health.pendingTraining} alteração(ões) de comportamento aguardam reconciliação/treino`;
  if (health.pendingItems > 0) return `${health.pendingItems} equipamento(s) alterado(s) aguardam reconciliação`;
  if (health.pendingInvalidations > 0) return `${health.pendingInvalidations} recomendação(ões) estão marcadas para reavaliação`;
  return `${health.versions} versão(ões) semântica(s) de equipamentos registradas · conhecimento atual`;
}
