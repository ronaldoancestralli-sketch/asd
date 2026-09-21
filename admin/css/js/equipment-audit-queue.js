import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import {
  humanizeAttributeKey,
  normalizeAuditText,
  resolveEquipmentRule,
  targetLabel
} from '../../js/equipment-audit-rules.js?v=2';
import { resolveExternalDataEffect } from '../../js/equipment-data-limits.js?v=2';
import {
  refreshEquipmentAttributeClassifications,
  resolvePersistedAttributeClassification
} from '../../js/equipment-attribute-classifications.js?v=3&sb=20260823-security-supabase-pin-1';

const TABLE = 'equipment_audit_queue';
await refreshEquipmentAttributeClassifications();

function numberFrom(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function normalizeAttributes(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => ({
        key: String(item?.label ?? item?.name ?? item?.raw ?? '').trim(),
        value: item?.value ?? ''
      }))
      .filter(item => item.key);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, attributeValue]) => ({
      key,
      value: attributeValue
    }));
  }

  return [];
}

function issueKey(parts) {
  return parts
    .map(value => normalizeAuditText(String(value ?? '')).replace(/\s+/g, '_'))
    .filter(Boolean)
    .join('|');
}

function persistedClassificationFor(key) {
  return resolvePersistedAttributeClassification(key);
}

function externalEffectFor(key) {
  const persisted = persistedClassificationFor(key);
  if (persisted?.classification === 'external_data_required') {
    return {
      id: `persisted:${persisted.normalizedKey}`,
      label: persisted.label,
      reason: persisted.reason,
      missingData: persisted.missingData,
      publicNote: persisted.publicNote,
      confidence: 1,
      persisted: true
    };
  }
  return resolveExternalDataEffect(key);
}

function classifyOccurrence({
  equipmentId,
  equipmentName,
  raritySlug,
  rarityName,
  key,
  value,
  source
}) {
  const persisted = persistedClassificationFor(key);
  if (persisted?.classification === 'informational') return null;

  const rule = resolveEquipmentRule(key);
  const externalEffect = externalEffectFor(key);
  const numericValue = numberFrom(value);
  const normalizedKey = externalEffect
    ? `external:${externalEffect.id}`
    : normalizeAuditText(key);

  const base = {
    equipment_id: String(equipmentId),
    equipment_name: String(equipmentName || ''),
    source: source || 'equipment-save',
    rarity_slug: raritySlug || null,
    rarity_name: rarityName || null,
    attribute_key: key,
    attribute_value: String(value ?? ''),
    normalized_key: normalizedKey,
    suggested_target: rule?.recognized && rule.target
      ? targetLabel(rule.target)
      : externalEffect?.label || null,
    suggested_operation: rule?.recognized
      ? rule.operation || null
      : externalEffect ? 'not_calculated' : null,
    confidence: externalEffect
      ? Number(externalEffect.confidence ?? 1)
      : Number.isFinite(Number(rule?.confidence)) ? Number(rule.confidence) : null,
    details: {
      recognized: Boolean(rule?.recognized),
      rule_source: rule?.source || null,
      human_label: externalEffect?.label || humanizeAttributeKey(key),
      external_data: Boolean(externalEffect),
      external_effect_id: externalEffect?.id || null,
      external_reason: externalEffect?.reason || null,
      missing_data: externalEffect?.missingData || null,
      public_note: externalEffect?.publicNote || null,
      persisted_classification: Boolean(externalEffect?.persisted)
    }
  };

  if (numericValue === null) {
    return {
      ...base,
      issue_key: issueKey(['invalid_value', raritySlug, key]),
      severity: 'blocking',
      issue_type: 'invalid_value',
      status: 'pending'
    };
  }

  if (externalEffect) {
    return {
      ...base,
      issue_key: issueKey(['external_data_required', raritySlug, externalEffect.id]),
      severity: 'info',
      issue_type: 'external_data_required',
      status: 'pending'
    };
  }

  if (!rule?.recognized) {
    return {
      ...base,
      issue_key: issueKey(['unknown_attribute', raritySlug, key]),
      severity: 'blocking',
      issue_type: 'unknown_attribute',
      status: 'pending'
    };
  }

  return null;
}

export function classifyDraftVariants(variants = {}, { equipmentId = 'draft', equipmentName = '', source = 'json-import' } = {}) {
  const issues = [];
  let recognized = 0;
  let approximate = 0;
  let awaitingOfficial = 0;
  let informationalEffects = 0;
  let total = 0;

  for (const [raritySlug, attributes] of Object.entries(variants || {})) {
    for (const attribute of normalizeAttributes(attributes)) {
      total += 1;
      const persisted = persistedClassificationFor(attribute.key);
      if (persisted?.classification === 'informational') {
        informationalEffects += 1;
        continue;
      }

      const rule = resolveEquipmentRule(attribute.key);
      const externalEffect = externalEffectFor(attribute.key);
      const numericValue = numberFrom(attribute.value);
      const occurrence = classifyOccurrence({
        equipmentId,
        equipmentName,
        raritySlug,
        rarityName: raritySlug,
        key: attribute.key,
        value: attribute.value,
        source
      });

      if (occurrence) {
        issues.push(occurrence);
        if (occurrence.issue_type === 'external_data_required') awaitingOfficial += 1;
        continue;
      }

      if (numericValue !== null && rule?.recognized) {
        recognized += 1;
        if (/aproximada/i.test(rule.source || '')) approximate += 1;
      } else if (numericValue !== null && externalEffect) {
        awaitingOfficial += 1;
      }
    }
  }

  return {
    total,
    recognized,
    approximate,
    awaitingOfficial,
    informationalEffects,
    issues,
    blocking: issues.filter(issue => issue.severity === 'blocking').length,
    informational: issues.filter(issue => issue.issue_type === 'external_data_required').length
  };
}

function isMissingTableError(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return text.includes('42p01') || text.includes('pgrst205') || text.includes('does not exist') || text.includes('not found');
}

async function persistCurrentIssues(equipmentId, issues) {
  const current = await supabase
    .from(TABLE)
    .select('id,issue_key,status')
    .eq('equipment_id', String(equipmentId))
    .eq('status', 'pending');

  if (current.error) {
    if (isMissingTableError(current.error)) return { installed: false, issues, error: current.error };
    throw current.error;
  }

  const now = new Date().toISOString();
  const currentKeys = new Set(issues.map(issue => issue.issue_key));

  for (const row of current.data || []) {
    if (currentKeys.has(row.issue_key)) continue;
    const resolved = await supabase
      .from(TABLE)
      .update({ status: 'resolved', resolved_at: now, updated_at: now })
      .eq('id', row.id);
    if (resolved.error) throw resolved.error;
  }

  if (issues.length) {
    const payload = issues.map(issue => ({
      ...issue,
      status: 'pending',
      resolved_at: null,
      updated_at: now
    }));

    const upserted = await supabase
      .from(TABLE)
      .upsert(payload, { onConflict: 'equipment_id,issue_key' });

    if (upserted.error) throw upserted.error;
  }

  return {
    installed: true,
    issues,
    blocking: issues.filter(issue => issue.severity === 'blocking'),
    awaitingOfficial: issues.filter(issue => issue.issue_type === 'external_data_required')
  };
}

export async function syncEquipmentAuditQueueFromDatabase(equipmentId, equipmentName = '', source = 'equipment-save') {
  await refreshEquipmentAttributeClassifications();

  const result = await supabase
    .from('equipment_variants')
    .select('rarity_id,attributes,equipment_rarities(name,slug)')
    .eq('equipment_id', equipmentId);

  if (result.error) throw result.error;

  const issues = [];
  for (const variant of result.data || []) {
    const rarity = variant.equipment_rarities || {};
    for (const attribute of normalizeAttributes(variant.attributes)) {
      const issue = classifyOccurrence({
        equipmentId,
        equipmentName,
        raritySlug: rarity.slug || String(variant.rarity_id || ''),
        rarityName: rarity.name || rarity.slug || 'Raridade',
        key: attribute.key,
        value: attribute.value,
        source
      });
      if (issue) issues.push(issue);
    }
  }

  return persistCurrentIssues(equipmentId, issues);
}

export async function loadPendingEquipmentAuditQueue() {
  const result = await supabase
    .from(TABLE)
    .select('*')
    .eq('status', 'pending')
    .order('severity')
    .order('updated_at', { ascending: false });

  if (result.error) {
    if (isMissingTableError(result.error)) return { installed: false, rows: [], error: result.error };
    throw result.error;
  }

  const rows = result.data || [];
  return {
    installed: true,
    rows,
    actionable: rows.filter(row => row.issue_type !== 'external_data_required'),
    awaitingOfficial: rows.filter(row => row.issue_type === 'external_data_required')
  };
}

if (document.getElementById('equipment-ai-validate')) {
  import('./equipment-json-classifier.js?v=7&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1').catch(error => {
    console.warn('[equipment-json-classifier] Não foi possível iniciar o classificador visual.', error);
  });
}
