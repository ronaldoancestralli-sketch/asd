export const EQUIPMENT_SCOPE_TYPES = Object.freeze({
  GENERIC: 'generic',
  CLASS: 'class',
  HERO: 'hero'
});

function normalizedId(value) {
  const id = String(value || '').trim();
  return id || null;
}

export function inferEquipmentScope(equipment = {}) {
  const heroId = normalizedId(equipment.hero_id);
  const classId = normalizedId(equipment.class_id);
  const isPersonal = equipment.is_personal === true;

  if (heroId || isPersonal) {
    return {
      scopeType: EQUIPMENT_SCOPE_TYPES.HERO,
      heroId,
      classId: null,
      coherent: Boolean(heroId && !classId && isPersonal)
    };
  }

  if (classId) {
    return {
      scopeType: EQUIPMENT_SCOPE_TYPES.CLASS,
      heroId: null,
      classId,
      coherent: true
    };
  }

  return {
    scopeType: EQUIPMENT_SCOPE_TYPES.GENERIC,
    heroId: null,
    classId: null,
    coherent: !isPersonal
  };
}

export function verifyEquipmentScopeReadback(
  expectedEquipment = {},
  persistedEquipment = {}
) {
  const scopeWasRequested = [
    'scope_type',
    'hero_id',
    'class_id',
    'is_personal'
  ].some(key => Object.prototype.hasOwnProperty.call(expectedEquipment, key));

  const expected = inferEquipmentScope(expectedEquipment);
  const persisted = inferEquipmentScope(persistedEquipment);
  const declaredType = String(expectedEquipment.scope_type || '').trim().toLowerCase();
  const confirmed = scopeWasRequested
    && expected.coherent
    && persisted.coherent
    && (!declaredType || declaredType === expected.scopeType)
    && expected.scopeType === persisted.scopeType
    && expected.classId === persisted.classId
    && expected.heroId === persisted.heroId;

  return {
    status: !scopeWasRequested
      ? 'not_requested'
      : confirmed
        ? 'confirmed'
        : 'mismatch',
    expected,
    persisted
  };
}

export function buildEquipmentScopePayload({
  scopeType,
  heroId = null,
  classId = null
} = {}) {
  const normalizedType = String(scopeType || '').trim().toLowerCase();
  const normalizedHeroId = normalizedId(heroId);
  const normalizedClassId = normalizedId(classId);

  if (!Object.values(EQUIPMENT_SCOPE_TYPES).includes(normalizedType)) {
    throw new Error('Selecione quem pode usar este equipamento.');
  }

  if (normalizedType === EQUIPMENT_SCOPE_TYPES.GENERIC) {
    if (normalizedHeroId || normalizedClassId) {
      throw new Error('Equipamento genérico não pode manter vínculo de herói ou classe.');
    }
    return {
      scope_type: normalizedType,
      hero_id: null,
      class_id: null,
      is_personal: false
    };
  }

  if (normalizedType === EQUIPMENT_SCOPE_TYPES.CLASS) {
    if (!normalizedClassId) {
      throw new Error('Selecione a classe exclusiva deste equipamento.');
    }
    if (normalizedHeroId) {
      throw new Error('Equipamento de classe não pode manter vínculo de herói.');
    }
    return {
      scope_type: normalizedType,
      hero_id: null,
      class_id: normalizedClassId,
      is_personal: false
    };
  }

  if (!normalizedHeroId) {
    throw new Error('Selecione o herói exclusivo deste equipamento.');
  }
  if (normalizedClassId) {
    throw new Error('Equipamento pessoal não pode manter um segundo vínculo de classe.');
  }

  return {
    scope_type: normalizedType,
    hero_id: normalizedHeroId,
    class_id: null,
    is_personal: true
  };
}
