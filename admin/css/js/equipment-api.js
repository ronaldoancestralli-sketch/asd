import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import { verifyEquipmentVariantReadback } from './equipment-attribute-persistence.js?v=1';
import { analyzeEquipmentEvolutionV2 } from '../../js/echo-brain-equipment-evolution-v2.js?v=3';
import { syncEquipmentAuditQueueFromDatabase } from './equipment-audit-queue.js?v=8&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1';
import { verifyEquipmentScopeReadback } from './equipment-scope.js?v=1&persist=20260917-scope-1';

const EQUIPMENT_LIST_PAGE_SIZE = 500;
const EQUIPMENT_LIST_MAX_ROWS = 10000;

export async function loadEquipmentMeta() {
  const [rarities, slots, sets, classes, heroes] = await Promise.all([
    supabase.from('equipment_rarities').select('*').order('rank'),
    supabase.from('equipment_slots').select('*').order('display_order'),
    supabase.from('equipment_sets').select('*').order('name'),
    supabase.from('hero_classes').select('id,name,slug').order('name'),
    supabase.from('heroes').select('id,name,slug,class_id,enabled').order('name')
  ]);

  if (rarities.error) throw rarities.error;
  if (slots.error) throw slots.error;
  if (sets.error) throw sets.error;
  if (classes.error) throw classes.error;
  if (heroes.error) throw heroes.error;

  return {
    rarities: rarities.data || [],
    slots: slots.data || [],
    sets: sets.data || [],
    classes: classes.data || [],
    heroes: heroes.data || []
  };
}

export async function listEquipments() {
  const rows = [];
  for (let from = 0; from < EQUIPMENT_LIST_MAX_ROWS; from += EQUIPMENT_LIST_PAGE_SIZE) {
    const to = from + EQUIPMENT_LIST_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('equipments')
      .select('*,equipment_sets(name,slug),equipment_slots(name,slug)')
      .order('display_order')
      .order('name')
      .order('id')
      .range(from, to);

    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < EQUIPMENT_LIST_PAGE_SIZE) return rows;
  }

  throw new Error(`equipment_catalog_limit_exceeded:${EQUIPMENT_LIST_MAX_ROWS}`);
}

export async function getEquipmentBundle(id) {
  const [equipment, variants] = await Promise.all([
    supabase.from('equipments').select('*').eq('id', id).single(),
    supabase.from('equipment_variants').select('*,equipment_rarities(*)').eq('equipment_id', id)
  ]);

  if (equipment.error) throw equipment.error;
  if (variants.error) throw variants.error;

  let bonuses = { data: [] };

  if (equipment.data.set_id) {
    bonuses = await supabase
      .from('equipment_set_bonuses')
      .select('*')
      .eq('set_id', equipment.data.set_id)
      .order('display_order');

    if (bonuses.error) throw bonuses.error;
  }

  return {
    equipment: equipment.data,
    variants: variants.data || [],
    bonuses: bonuses.data || []
  };
}

export async function getEquipmentBySlug(slug) {
  if (!slug) return null;

  const { data, error } = await supabase
    .from('equipments')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function upsertSet({ id, name, slug, description }) {
  const payload = { name, slug, description };
  if (id) payload.id = id;

  const { data, error } = await supabase
    .from('equipment_sets')
    .upsert(payload, { onConflict: 'slug' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

function inferAuditSource(explicitSource) {
  if (explicitSource) return explicitSource;

  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem('equipment-import-draft');
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft?.importSource === 'equipment-json') return 'json-import';
      }
    }
  } catch {
    // A origem é apenas metadado de auditoria; falha ao lê-la não bloqueia o salvamento.
  }

  if (typeof document !== 'undefined' && document.getElementById('equipment-ai-json')) {
    return 'json-import';
  }

  return 'admin-editor';
}

function notifyAuditSync(saved, audit, source) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('equipment:audit-sync', {
    detail: {
      equipmentId: saved.id,
      equipmentName: saved.name || '',
      source,
      installed: Boolean(audit?.installed),
      issues: audit?.issues || [],
      error: audit?.error || null
    }
  }));
}

function notifyBrainSync(saved, brain, source) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('equipment:brain-sync', {
    detail: {
      equipmentId: saved.id,
      equipmentName: saved.name || '',
      source,
      status: brain?.status || 'pending',
      changeClass: brain?.analysis?.changeClass || null,
      affectsBrain: brain?.analysis?.affectsBrain === true,
      requiresReevaluation: brain?.analysis?.requiresReevaluation === true,
      requiresRetraining: brain?.analysis?.requiresRetraining === true,
      equipmentVersion: brain?.memory?.equipmentVersion || null,
      error: brain?.error || null
    }
  }));
}

async function syncEquipmentBrainEvolution({ saved, beforeBundle, afterBundle: confirmedBundle, hadExisting, source }) {
  if (hadExisting && !beforeBundle) {
    return {
      status: 'pending',
      analysis: null,
      memory: null,
      error: new Error('previous_equipment_snapshot_unavailable')
    };
  }

  try {
    const afterBundle = confirmedBundle || await getEquipmentBundle(saved.id);
    const analysis = analyzeEquipmentEvolutionV2(beforeBundle || null, afterBundle);
    const { data, error } = await supabase.rpc('admin_echo_brain_record_equipment_change', {
      p_equipment_id: String(saved.id),
      p_source: source,
      p_analysis: analysis
    });
    if (error) throw error;
    return {
      status: data?.status || 'versioned',
      analysis,
      memory: data || null,
      error: null
    };
  } catch (error) {
    console.warn('[echo-brain-equipment] Equipamento salvo; sincronização semântica ficou pendente para a fila fail-safe.', error);
    return { status: 'pending', analysis: null, memory: null, error };
  }
}

export async function saveEquipmentBundle({
  equipmentId,
  equipment,
  variants = [],
  bonuses = [],
  auditSource = null,
  replaceVariants = false,
  replaceBonuses = false
}) {
  const resolvedEquipmentId = equipmentId || null;
  const hadExisting = Boolean(resolvedEquipmentId);
  const resolvedAuditSource = inferAuditSource(auditSource);
  let beforeBundle = null;

  if (hadExisting) {
    try {
      beforeBundle = await getEquipmentBundle(resolvedEquipmentId);
    } catch (error) {
      console.warn('[echo-brain-equipment] Snapshot anterior indisponível; mudança será deixada pendente.', error);
    }
  }

  const { data, error } = await supabase.rpc('admin_save_equipment_bundle_v2', {
    p_equipment_id: resolvedEquipmentId,
    p_equipment: equipment || {},
    p_variants: Array.isArray(variants) ? variants : [],
    p_bonuses: Array.isArray(bonuses) ? bonuses : [],
    p_replace_variants: Boolean(replaceVariants),
    p_replace_bonuses: Boolean(replaceBonuses),
    p_source: resolvedAuditSource
  });
  if (error) throw error;

  const saved = data?.equipment;
  if (!saved?.id) {
    throw new Error('O banco não confirmou o equipamento salvo.');
  }

  let afterBundle = null;
  let attributeVerification;
  let scopeVerification = { status: 'unavailable', expected: null, persisted: null };
  try {
    afterBundle = await getEquipmentBundle(saved.id);
    attributeVerification = verifyEquipmentVariantReadback(variants, afterBundle.variants, replaceVariants);
  } catch {
    // O RPC já confirmou a gravação. Uma falha de leitura não deve provocar
    // uma segunda criação nem ser apresentada como confirmação dos atributos.
    attributeVerification = { status: 'unavailable', variantCount: variants.length };
  }

  if (afterBundle?.equipment) {
    try {
      scopeVerification = verifyEquipmentScopeReadback(equipment, afterBundle.equipment);
    } catch {
      // A confirmação de escopo é independente da confirmação dos atributos.
      // Assim, uma falha isolada nunca apaga o resultado válido da outra.
    }
  }

  let audit = null;
  try {
    audit = await syncEquipmentAuditQueueFromDatabase(
      saved.id,
      saved.name || equipment?.name || '',
      resolvedAuditSource
    );
  } catch (auditError) {
    console.warn('[equipment-audit-queue] O equipamento foi salvo, mas a fila persistente não pôde ser atualizada.', auditError);
    audit = { installed: false, issues: [], error: auditError };
  }

  const brain = await syncEquipmentBrainEvolution({
    saved,
    beforeBundle,
    afterBundle,
    hadExisting,
    source: resolvedAuditSource
  });

  notifyAuditSync(saved, audit, resolvedAuditSource);
  notifyBrainSync(saved, brain, resolvedAuditSource);

  return {
    ...(afterBundle?.equipment || saved),
    attributeVerification,
    scopeVerification,
    audit,
    brain,
    operation: data?.operation || (resolvedEquipmentId ? 'updated' : 'created'),
    versionBackupCreated: Boolean(data?.version_backup_created)
  };
}

export async function deleteEquipment(id) {
  const errorBag = [];
  const beforeBundle = await getEquipmentBundle(id).catch(error => {
    errorBag.push(error);
    return null;
  });

  const { error } = await supabase
    .from('equipments')
    .delete()
    .eq('id', id);

  if (error) throw error;

  await supabase
    .from('equipment_audit_queue')
    .delete()
    .eq('equipment_id', String(id));

  // O trigger de DELETE mantém equipment_brain_change_queue pendente. Não
  // fabricamos snapshot pós-delete: remoção exige reconciliação explícita.
  if (beforeBundle && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('equipment:brain-sync', {
      detail: {
        equipmentId: String(id),
        status: 'pending',
        changeClass: 'equipment_removed',
        affectsBrain: true,
        requiresReevaluation: true,
        requiresRetraining: true,
        error: errorBag[0] || null
      }
    }));
  }
}
