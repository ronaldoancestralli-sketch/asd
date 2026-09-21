/*
 * Traduz o contrato explícito da aba Raridades para o formato legado
 * consumido pelo motor oficial. O operador selecionado é a autoridade;
 * o número coletado é sempre tratado como magnitude.
 */

export const EQUIPMENT_ATTRIBUTE_OPERATORS = Object.freeze([
  'increase_flat',
  'decrease_flat',
  'increase_percent',
  'decrease_percent'
]);

const OPERATOR_RULES = Object.freeze({
  increase_flat: { sign: 1, percent: false },
  decrease_flat: { sign: -1, percent: false },
  increase_percent: { sign: 1, percent: true },
  decrease_percent: { sign: -1, percent: true }
});

function labelForOperation(label, percent) {
  // O adaptador legado precisa transportar ambas as operações. Remover '%'
  // não força soma: alguns aliases do motor são percentuais por padrão.
  // Preservar a chave original também mantém health_max_pct reconhecível.
  return `${label} ${percent ? 'percentual' : 'absoluto'}`;
}

export function equipmentAttributeOperation(operator) {
  const rule = OPERATOR_RULES[String(operator || '').trim()];
  return rule ? { ...rule, operation: rule.percent ? 'percent' : 'add' } : null;
}

export function parseEquipmentAttributeMagnitude(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.abs(value) : null;
  }

  const text = String(value ?? '')
    .trim()
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, '')
    .replace(/%$/, '');

  if (!text) return null;

  const unsigned = text.replace(/^[+-]/, '');
  if (!/^\d+(?:[.,]\d+)?$/.test(unsigned)) return null;

  const numeric = Number(unsigned.replace(',', '.'));
  return Number.isFinite(numeric) ? Math.abs(numeric) : null;
}

export function normalizeEquipmentAttributesForCalculation(attributes) {
  if (!Array.isArray(attributes)) {
    return attributes && typeof attributes === 'object' ? { ...attributes } : {};
  }

  return Object.fromEntries(
    attributes
      .filter(attribute => String(attribute?.label || '').trim())
      .map(attribute => {
        const label = String(attribute.label).trim();
        const rule = OPERATOR_RULES[String(attribute?.operator || '').trim()];

        // Registros antigos continuam como estavam. Sem operador explícito,
        // não inferimos direção nem percentual a partir do texto coletado.
        if (!rule) return [label, attribute.value ?? ''];

        const magnitude = parseEquipmentAttributeMagnitude(attribute.value);
        const value = magnitude === null ? (attribute.value ?? '') : rule.sign * magnitude;
        return [labelForOperation(label, rule.percent), value];
      })
  );
}
