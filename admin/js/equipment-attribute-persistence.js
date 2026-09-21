function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

export function verifyEquipmentVariantReadback(expected = [], actual = [], replace = false) {
  const byRarity = new Map(actual.map(variant => [String(variant.rarity_id), variant.attributes]));
  const confirmed = (!replace || expected.length === actual.length) && expected.every(variant =>
    byRarity.has(String(variant.rarity_id)) &&
    JSON.stringify(stable(variant.attributes)) === JSON.stringify(stable(byRarity.get(String(variant.rarity_id))))
  );
  return { status: confirmed ? 'confirmed' : 'mismatch', variantCount: expected.length };
}
