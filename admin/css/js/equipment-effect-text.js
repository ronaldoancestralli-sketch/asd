// Equipment text is evidence, not a stat identifier. Only the Central binds it.
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const effectStart = /^(?:[•·*›»]\s*)?[+−–-]?\s*\d+(?:[.,]\d+)?\s*(?:%|°)?\s+\S/;
const incompleteEnd = /\b(?:quando(?: em)?|enquanto|ao|apos(?: usar)?|com|sem|de|do|da|dos|das|em|para|a|e|ou)\s*$/;
const continuationStart = /^(?:movimento|mirar|mirando|mira|parado|parada|ativad[ao]|agachad[ao]|durante|quando|enquanto|apos|ao|aos|a|as|de|do|da|dos|das|com|sem|em|para|e|ou)\b/;
const boundary = /^(?:efeitos|bonus|conjunto|equipar|melhorar|voltar|nivel|comum|raro|epico|lendario|mitico|supremo|grandioso|celestial|estelar|imortal|divino)\b/;

export function equipmentEffectTextReview(text) {
  return incompleteEnd.test(normalize(text))
    ? 'Texto incompleto: confira a continuação na imagem antes de vincular na Central.'
    : '';
}

export function joinEquipmentEffectLines(text, rarities = []) {
  const headers = new Set(rarities.flatMap(r => [normalize(r.name), normalize(r.slug)]).filter(Boolean));
  const output = [];
  for (const line of String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    const clean = normalize(line);
    const previous = output.at(-1);
    const continues = previous && effectStart.test(previous) && !effectStart.test(line)
      && !headers.has(clean) && !boundary.test(clean)
      && (incompleteEnd.test(normalize(previous)) || continuationStart.test(clean));
    if (continues) output[output.length - 1] += ' ' + line;
    else output.push(line);
  }
  return output.join('\n');
}

export function equipmentAttributeWithSource(source = {}, fields = {}) {
  // Keep the original OCR even after an administrator corrects the editable text.
  // Do not promote an imported key to a calculation target.
  const result = { ...source, ...fields };
  if (result.key) { result.importedKey = result.key; delete result.key; }
  // A legacy shortened label must not hide an incomplete original reading.
  // Remember an explicit text edit so the immutable OCR does not reopen the
  // same warning after saving. This is not a reviewed calculation binding.
  if (Object.hasOwn(fields, 'label') && normalize(fields.label) !== normalize(source.label || source.name || source.raw)) result.textEdited = true;
  const review = equipmentEffectTextReview(result.label || result.raw)
    || (!result.textEdited && equipmentEffectTextReview(result.raw));
  if (review) result.textReview = review;
  else delete result.textReview;
  return result;
}
