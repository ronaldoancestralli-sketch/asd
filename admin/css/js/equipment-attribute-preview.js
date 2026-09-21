import { equipmentAttributeOperation, parseEquipmentAttributeMagnitude } from '../../js/equipment-attribute-calculation.js?v=2';
import { STATUS_UNITS, STATUS_CONDITIONS, stableStatusJson } from '../../js/status-registry-v1.js?sc=20260906-1&eq=20260907-effects-1';

// Exact source + rarity + row + snapshot. A similar name is never authority.
export function previewEquipmentAttribute(attribute = {}, { registry, variantId, rowKey } = {}) {
  if (attribute.textReview) return { status: 'source_incomplete' };
  if (!equipmentAttributeOperation(attribute.operator)) return { status: 'operator_required' };
  const magnitude = parseEquipmentAttributeMagnitude(attribute.value);
  if (magnitude === null) return { status: 'invalid' };
  if (!String(attribute.label || '').trim()) return { status: 'empty' };
  if (!registry) return { status: 'registry_unavailable' };
  const matches = registry.payload.bindings.filter(b => b.source_kind === 'equipment_variant' && b.source_id === variantId && b.attribute_key === String(rowKey));
  if (matches.length !== 1) return { status: 'binding_required' };
  const binding = matches[0];
  if (stableStatusJson(binding.source_snapshot) !== stableStatusJson(attribute)) return { status: 'source_changed' };
  const definition = registry.payload.definitions.find(d => d.id === binding.target);
  const operation = equipmentAttributeOperation(binding.operator);
  if (!definition || !operation || definition.unit === 'unknown') return { status: 'binding_required' };
  const amount = magnitude.toLocaleString('pt-BR', { maximumFractionDigits: 20 });
  return {
    status: 'recognized', value: operation.sign * magnitude,
    rule: { recognized: true, target: binding.target, operation: operation.percent ? 'percent' : 'add', source: 'Central de Status' },
    binding, definition,
    description: `${operation.sign < 0 ? 'reduzir' : 'aumentar'} ${definition.name} em ${amount}${operation.percent ? '%' : STATUS_UNITS[definition.unit].symbol} · ${definition.scope === 'weapon' ? 'Arma' : 'Herói'} · ${STATUS_CONDITIONS[binding.condition]}`,
    operationLabel: operation.percent ? 'percentual sequencial' : operation.sign < 0 ? 'subtração direta' : 'soma direta'
  };
}
