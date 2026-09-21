export const COMPOSITION_SELECTION_EVENT = 'echo:composition-selection-change';
export const COMPOSITION_OPTIONS_EVENT = 'echo:composition-options-ready';

export function normalizeCompositionSelection(ids = [], validIds = null) {
  const valid = validIds === null ? null : new Set(validIds);
  const seen = new Set();

  return [0, 1, 2].map(index => {
    const id = String(ids[index] || '').trim();
    if (!id || seen.has(id) || (valid && !valid.has(id))) return '';
    seen.add(id);
    return id;
  });
}

export function resolveCompositionTarget(ids = [], activeSlot = null) {
  const slots = normalizeCompositionSelection(ids);
  const active = Number.isInteger(activeSlot) && activeSlot >= 0 && activeSlot <= 2
    ? activeSlot
    : null;

  // Enquanto houver uma posição vazia, uma nova escolha sempre completa o
  // trio. Um slot ocupado só vira alvo de substituição quando o trio já está
  // completo, evitando o caso visual de três cards marcados com contador 2/3.
  if (active !== null && !slots[active]) return active;
  const empty = slots.findIndex(id => !id);
  if (empty >= 0) return empty;
  return active;
}
