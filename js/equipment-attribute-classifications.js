import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';

const TABLE = 'equipment_attribute_classifications';
let loaded = false;
let cache = new Map();

export function normalizeClassificationKey(value = '') {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/%/g, ' percentual ')
    .replace(/\bporcentagem\b|\bpct\b/g, ' percentual ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function mapRow(row) {
  return {
    id: row.id,
    normalizedKey: row.normalized_key,
    rawLabel: row.raw_label,
    classification: row.classification,
    label: row.display_label || row.raw_label,
    reason: row.reason || '',
    missingData: row.missing_data || '',
    publicNote: row.public_note || '',
    active: row.active !== false
  };
}

export async function refreshEquipmentAttributeClassifications() {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id,normalized_key,raw_label,classification,display_label,reason,missing_data,public_note,active')
      .eq('active', true);
    if (error) throw error;
    cache = new Map((data || []).map(row => [row.normalized_key, mapRow(row)]));
    loaded = true;
    return { installed: true, rows: [...cache.values()] };
  } catch (error) {
    const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
    if (text.includes('42p01') || text.includes('pgrst205') || text.includes('does not exist')) {
      loaded = true;
      cache = new Map();
      return { installed: false, rows: [], error };
    }
    console.warn('[equipment-attribute-classifications] Não foi possível carregar classificações.', error);
    return { installed: false, rows: [...cache.values()], error };
  }
}

export function resolvePersistedAttributeClassification(rawKey = '') {
  const key = normalizeClassificationKey(rawKey);
  return cache.get(key) || null;
}

export function classificationsLoaded() {
  return loaded;
}

async function saveClassification({
  rawLabel,
  classification,
  displayLabel,
  reason,
  missingData,
  publicNote
}) {
  const normalizedKey = normalizeClassificationKey(rawLabel);
  if (!normalizedKey) throw new Error('Informe o nome do efeito.');
  if (!['external_data_required', 'informational'].includes(classification)) {
    throw new Error('Classificação não suportada.');
  }

  const payload = {
    normalized_key: normalizedKey,
    raw_label: String(rawLabel || '').trim(),
    classification,
    display_label: String(displayLabel || rawLabel || '').trim(),
    reason: String(reason || '').trim(),
    missing_data: classification === 'external_data_required'
      ? String(missingData || '').trim()
      : '',
    public_note: String(publicNote || '').trim(),
    active: true,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'normalized_key' });
  if (error) throw error;

  await refreshEquipmentAttributeClassifications();
  return resolvePersistedAttributeClassification(rawLabel);
}

export async function saveExternalDataClassification({
  rawLabel,
  displayLabel,
  reason,
  missingData,
  publicNote
}) {
  return saveClassification({
    rawLabel,
    classification: 'external_data_required',
    displayLabel,
    reason,
    missingData,
    publicNote
  });
}

export async function saveInformationalClassification({
  rawLabel,
  displayLabel,
  reason,
  publicNote
}) {
  return saveClassification({
    rawLabel,
    classification: 'informational',
    displayLabel,
    reason,
    missingData: '',
    publicNote
  });
}

export async function reopenAttributeClassification(rawLabel = '') {
  const normalizedKey = normalizeClassificationKey(rawLabel);
  if (!normalizedKey) throw new Error('Classificação inválida.');

  const { error } = await supabase
    .from(TABLE)
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('normalized_key', normalizedKey);
  if (error) throw error;

  await refreshEquipmentAttributeClassifications();
  return true;
}
