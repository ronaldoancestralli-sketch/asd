import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import { analyzeEquipmentEvolutionV2 } from '../../js/echo-brain-equipment-evolution-v2.js?v=3';
import { getEquipmentBundle, listEquipments } from './equipment-api.js?v=brain-evolution-4&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1';

function unwrap(data) {
  return Array.isArray(data) ? (data[0] || null) : data;
}

function rehydrateSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    equipment: {
      id: snapshot.equipment?.id ?? null,
      name: snapshot.equipment?.name ?? '',
      slug: snapshot.equipment?.slug ?? '',
      slot_id: snapshot.equipment?.slotId ?? snapshot.equipment?.slot_id ?? null,
      set_id: snapshot.equipment?.setId ?? snapshot.equipment?.set_id ?? null,
      description: snapshot.equipment?.description ?? '',
      recommendation: snapshot.equipment?.recommendation ?? '',
      enabled: snapshot.equipment?.enabled !== false
    },
    variants: (snapshot.variants || []).map(variant => {
      const rarity = variant.rarity ?? variant.rarity_slug ?? variant.rarity_id ?? 'unknown';
      const rows = snapshot.attributeOperators?.filter(row => row.rarity === rarity);
      return {
        rarity_slug: rarity,
        attributes: rows?.length
          ? [...rows].sort((a, b) => a.position - b.position).map(row => ({
              label: row.label, value: row.value, ...(row.operator ? { operator: row.operator } : {})
            }))
          : variant.attributes || []
      };
    }),
    bonuses: (snapshot.bonuses || []).map(bonus => ({
      required_pieces: bonus.requiredPieces ?? bonus.required_pieces ?? 0,
      title: bonus.title || '',
      description: bonus.description || '',
      stats: bonus.stats ?? null
    }))
  };
}

function tombstoneBundle(equipmentId, previousSnapshot = null) {
  const previous = rehydrateSnapshot(previousSnapshot);
  return {
    equipment: {
      id: String(equipmentId),
      name: previous?.equipment?.name || 'Equipamento removido',
      slug: previous?.equipment?.slug || `removed-${equipmentId}`,
      slot_id: null,
      set_id: null,
      description: '',
      recommendation: '',
      enabled: false
    },
    variants: [],
    bonuses: []
  };
}

async function record(equipmentId, source, analysis) {
  const { data, error } = await supabase.rpc('admin_echo_brain_record_equipment_change', {
    p_equipment_id: String(equipmentId),
    p_source: source,
    p_analysis: analysis
  });
  if (error) throw error;
  return unwrap(data);
}

async function latestVersion(equipmentId) {
  const { data, error } = await supabase
    .from('equipment_brain_versions')
    .select('id,equipment_id,version,after_snapshot,semantic_fingerprint,created_at')
    .eq('equipment_id', String(equipmentId))
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function equipmentExists(equipmentId) {
  const { data, error } = await supabase
    .from('equipments')
    .select('id')
    .eq('id', equipmentId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

function baselineAnalysis(bundle) {
  const detected = analyzeEquipmentEvolutionV2(null, bundle);
  return {
    ...detected,
    changeClass: 'baseline',
    severity: 'none',
    affectsBrain: false,
    requiresReevaluation: false,
    requiresRetraining: false,
    summary: {
      ...detected.summary,
      brainChanges: 0,
      buffs: 0,
      nerfs: 0,
      ambiguousNumeric: 0,
      behaviorChanges: 0
    },
    changes: detected.changes.map(change => ({
      ...change,
      type: change.type === 'equipment_created' ? 'baseline_created' : change.type,
      affectsBrain: false
    }))
  };
}

function deletionAnalysis(equipmentId, previousSnapshot = null) {
  const before = previousSnapshot ? rehydrateSnapshot(previousSnapshot) : null;
  const after = tombstoneBundle(equipmentId, previousSnapshot);
  const detected = analyzeEquipmentEvolutionV2(before, after);
  const removal = {
    type: previousSnapshot ? 'equipment_removed' : 'equipment_removed_without_baseline',
    category: 'lifecycle',
    affectsBrain: true
  };
  const changes = [removal, ...detected.changes.filter(change => change.type !== 'equipment_created')];
  return {
    ...detected,
    changeClass: 'equipment_removed',
    severity: 'critical',
    affectsBrain: true,
    requiresReevaluation: true,
    requiresRetraining: true,
    summary: {
      ...detected.summary,
      totalChanges: changes.length,
      brainChanges: Math.max(1, detected.summary?.brainChanges || 0) + 1,
      behaviorChanges: Math.max(1, detected.summary?.behaviorChanges || 0)
    },
    changes
  };
}

export async function bootstrapEquipmentBrainKnowledge({ limit = 500 } = {}) {
  const equipments = (await listEquipments()).slice(0, Math.max(1, Number(limit) || 500));
  const { data: versions, error } = await supabase
    .from('equipment_brain_versions')
    .select('equipment_id');
  if (error) throw error;

  const versioned = new Set((versions || []).map(row => String(row.equipment_id)));
  const missing = equipments.filter(item => !versioned.has(String(item.id)));
  const results = [];

  for (const item of missing) {
    try {
      const bundle = await getEquipmentBundle(item.id);
      const memory = await record(item.id, 'baseline-bootstrap', baselineAnalysis(bundle));
      results.push({ equipmentId: String(item.id), status: memory?.status || 'versioned', version: memory?.equipmentVersion || 1 });
    } catch (error) {
      results.push({ equipmentId: String(item.id), status: 'failed', error: error?.message || String(error) });
    }
  }

  return {
    totalEquipments: equipments.length,
    alreadyVersioned: equipments.length - missing.length,
    bootstrapped: results.filter(row => row.status !== 'failed').length,
    failed: results.filter(row => row.status === 'failed').length,
    results
  };
}

export async function reconcileEquipmentBrainQueue({ limit = 100 } = {}) {
  const { data: dirtyRows, error } = await supabase
    .from('equipment_brain_change_queue')
    .select('equipment_id,source,reasons,status,first_seen_at,updated_at')
    .in('status', ['pending', 'processing'])
    .order('updated_at', { ascending: true })
    .limit(Math.max(1, Number(limit) || 100));
  if (error) throw error;

  const results = [];
  for (const dirty of dirtyRows || []) {
    const equipmentId = String(dirty.equipment_id);
    try {
      await supabase.from('equipment_brain_change_queue')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('equipment_id', equipmentId)
        .in('status', ['pending', 'processing']);

      const previous = await latestVersion(equipmentId);
      const exists = await equipmentExists(equipmentId);

      if (!exists) {
        const analysis = deletionAnalysis(equipmentId, previous?.after_snapshot || null);
        const memory = await record(equipmentId, 'queue-delete-reconcile', analysis);
        results.push({
          equipmentId,
          status: 'removed',
          changeClass: analysis.changeClass,
          requiresReevaluation: true,
          requiresRetraining: true,
          memory
        });
        continue;
      }

      const current = await getEquipmentBundle(equipmentId);
      if (!previous?.after_snapshot) {
        const memory = await record(equipmentId, 'queue-baseline', baselineAnalysis(current));
        results.push({ equipmentId, status: 'baseline', memory });
        continue;
      }

      const before = rehydrateSnapshot(previous.after_snapshot);
      const analysis = analyzeEquipmentEvolutionV2(before, current);
      const memory = await record(equipmentId, 'queue-reconcile', analysis);
      results.push({
        equipmentId,
        status: memory?.status || 'versioned',
        changeClass: analysis.changeClass,
        requiresReevaluation: analysis.requiresReevaluation,
        requiresRetraining: analysis.requiresRetraining,
        memory
      });
    } catch (error) {
      await supabase.from('equipment_brain_change_queue')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('equipment_id', equipmentId)
        .eq('status', 'processing');
      results.push({ equipmentId, status: 'failed', error: error?.message || String(error) });
    }
  }

  return {
    processed: results.length,
    reconciled: results.filter(row => row.status !== 'failed').length,
    failed: results.filter(row => row.status === 'failed').length,
    requiresRetraining: results.filter(row => row.requiresRetraining === true).length,
    results
  };
}

export async function ensureEquipmentBrainKnowledge({ bootstrapLimit = 500, reconcileLimit = 100 } = {}) {
  const baseline = await bootstrapEquipmentBrainKnowledge({ limit: bootstrapLimit });
  const reconciliation = await reconcileEquipmentBrainQueue({ limit: reconcileLimit });
  return { baseline, reconciliation };
}
