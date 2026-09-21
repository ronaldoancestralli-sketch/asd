/**
 * Echo Arena — contrato canônico de efeitos de equipamentos (Fase 2B).
 *
 * Unidade pura e dormente: descreve, normaliza, valida e diagnostica efeitos.
 * Não interpreta descrições, não converte stats legados e não aplica fórmulas.
 */

export const EQUIPMENT_EFFECT_CONTRACT_VERSION = 'echo-equipment-effects/v1';

export const EQUIPMENT_EFFECT_NUMERIC_AUTHORITY = Object.freeze({
  enabled: false,
  phase: '2B',
  reason: 'numeric_authority_requires_phase_2c_and_phase_3_gates'
});

export const EQUIPMENT_EFFECT_SUPPORT_STATUSES = Object.freeze(['supported', 'pending']);
export const EQUIPMENT_EFFECT_OPERATIONS = Object.freeze([
  'add', 'relative_percent', 'percentage_points', 'multiply'
]);
export const EQUIPMENT_EFFECT_UNITS = Object.freeze([
  'health_point',
  'armor_point',
  'health_point_per_second',
  'armor_point_per_second',
  'second',
  'percent',
  'percentage_point',
  'multiplier',
  'penetration_point',
  'distance_unit',
  'distance_unit_per_second',
  'ammo_round',
  'shot_per_second',
  'noise_unit'
]);
export const EQUIPMENT_EFFECT_CONDITION_KINDS = Object.freeze([
  'always',
  'ability_active',
  'after_event',
  'mode_active',
  'state_active',
  'unknown',
  'unsupported'
]);
export const EQUIPMENT_EFFECT_DURATION_KINDS = Object.freeze([
  'not_applicable', 'while_condition', 'known', 'unknown'
]);
export const EQUIPMENT_EFFECT_STACKING_RULES = Object.freeze([
  'independent', 'additive', 'multiplicative', 'highest', 'lowest', 'replace', 'unknown'
]);
export const EQUIPMENT_EFFECT_TIER_SEMANTICS = Object.freeze([
  'not_applicable', 'incremental', 'cumulative_total', 'unknown'
]);

const SUBJECT_KINDS = Object.freeze(['equipment', 'equipment_variant', 'set_bonus', 'fixture']);
const SCOPE_KINDS = Object.freeze(['global', 'restricted']);
const VERIFICATION_STATUSES = Object.freeze([
  'confirmed', 'partially_confirmed', 'unverified', 'disputed'
]);
const PROVENANCE_SOURCE_KINDS = Object.freeze([
  'official', 'game_screenshot', 'catalog', 'historical_audit',
  'admin_entry', 'migration', 'unknown'
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function capability(dimension, operations, conditionKinds = EQUIPMENT_EFFECT_CONDITION_KINDS) {
  return {
    dimension,
    operations,
    condition_kinds: conditionKinds,
    requires_base_for_absolute_total: true,
    numeric_runtime: 'phase_3_required'
  };
}

/**
 * Registro explícito de grandezas. shots_per_second e fire_interval são
 * propositalmente diferentes e não possuem alias/conversão recíproca.
 */
export const EQUIPMENT_EFFECT_CAPABILITIES_V1 = deepFreeze({
  health_capacity: capability('capacity.health', {
    add: ['health_point'], relative_percent: ['percent']
  }),
  armor_capacity: capability('capacity.armor', {
    add: ['armor_point'], relative_percent: ['percent']
  }),
  health_regeneration_rate: capability('rate.health_regeneration', {
    add: ['health_point_per_second'], relative_percent: ['percent']
  }),
  armor_regeneration_rate: capability('rate.armor_regeneration', {
    add: ['armor_point_per_second'], relative_percent: ['percent']
  }),
  ability_heal_amount: capability('ability.heal_amount', {
    add: ['health_point'], relative_percent: ['percent']
  }, ['ability_active', 'after_event', 'unknown', 'unsupported']),
  penetration_power: capability('weapon.penetration_power', {
    add: ['penetration_point'], relative_percent: ['percent']
  }),
  armor_penetration: capability('weapon.armor_penetration', {
    percentage_points: ['percentage_point'], relative_percent: ['percent']
  }),
  reload_duration: capability('duration.weapon_reload', {
    add: ['second'], relative_percent: ['percent']
  }),
  aim_duration: capability('duration.weapon_aim', {
    add: ['second'], relative_percent: ['percent']
  }),
  crate_open_duration: capability('duration.crate_open', {
    add: ['second'], relative_percent: ['percent']
  }),
  ability_duration: capability('duration.ability', {
    add: ['second'], relative_percent: ['percent']
  }, ['ability_active', 'after_event', 'unknown', 'unsupported']),
  ability_cooldown_duration: capability('duration.ability_cooldown', {
    add: ['second'], relative_percent: ['percent']
  }),
  weapon_mode_switch_duration: capability('duration.weapon_mode_switch', {
    add: ['second'], relative_percent: ['percent']
  }),
  movement_noise: capability('noise.movement', {
    add: ['noise_unit'], relative_percent: ['percent']
  }),
  vision_range: capability('distance.vision', {
    add: ['distance_unit'], relative_percent: ['percent']
  }),
  aimed_range: capability('distance.aimed_weapon', {
    add: ['distance_unit'], relative_percent: ['percent']
  }),
  magazine_capacity: capability('capacity.ammunition', {
    add: ['ammo_round'], relative_percent: ['percent']
  }),
  movement_speed: capability('rate.movement', {
    add: ['distance_unit_per_second'], relative_percent: ['percent']
  }),
  aimed_movement_speed: capability('rate.aimed_movement', {
    add: ['distance_unit_per_second'], relative_percent: ['percent']
  }),
  weapon_damage_to_health: capability('multiplier.weapon_damage_to_health', {
    relative_percent: ['percent'], multiply: ['multiplier']
  }),
  weapon_damage_to_armor: capability('multiplier.weapon_damage_to_armor', {
    relative_percent: ['percent'], multiply: ['multiplier']
  }),
  shots_per_second: capability('rate.weapon_fire', {
    add: ['shot_per_second'], relative_percent: ['percent']
  }),
  fire_interval: capability('duration.between_shots', {
    add: ['second'], relative_percent: ['percent']
  })
});

export const EQUIPMENT_EFFECT_REGISTRY_VERSION = 'echo-equipment-effect-registry/v1';
const compiledRegistries = new WeakSet();
export const DEFAULT_EQUIPMENT_EFFECT_REGISTRY_V1 = deepFreeze({
  registry_version: EQUIPMENT_EFFECT_REGISTRY_VERSION,
  revision: 'echo-equipment-effects/v1:builtins-1',
  units: EQUIPMENT_EFFECT_UNITS,
  capabilities: EQUIPMENT_EFFECT_CAPABILITIES_V1
});
compiledRegistries.add(DEFAULT_EQUIPMENT_EFFECT_REGISTRY_V1);

/**
 * Compila definições declarativas, não fórmulas nem aprovações administrativas.
 * Cada consumidor recompila o mesmo snapshot validado. A 2C deverá carregar
 * somente a revisão aprovada no servidor; o WeakSet NÃO é autorização.
 */
export function createEquipmentEffectRegistryV1(input) {
  const errors = [];
  const preserved = cloneJsonLike(input);
  const fail = (path, code, message) => errors.push(issue(path, code, message));
  const identifier = value => typeof value === 'string' &&
    /^[a-z][a-z0-9_]*$/.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);
  const exactKeys = (object, allowed, path) => {
    for (const key of Object.keys(object)) {
      if (!allowed.includes(key)) fail(at(path, key), 'registry_field_not_allowed',
        'Campo não permitido; o registro não aceita fórmulas ou código executável.');
    }
  };
  if (!isPlainObject(input)) {
    fail('$', 'registry_object_required', 'O registro deve ser um objeto JSON.');
    return { valid: false, registry: null, errors, preserved };
  }
  exactKeys(input, ['registry_version', 'revision', 'additional_units', 'definitions'], '$');
  if (input.registry_version !== EQUIPMENT_EFFECT_REGISTRY_VERSION) {
    fail('registry_version', 'unknown_registry_version', 'Versão de registro desconhecida.');
  }
  if (!requiredString(errors, input.revision, 'revision') ||
      input.revision === DEFAULT_EQUIPMENT_EFFECT_REGISTRY_V1.revision ||
      input.revision !== input.revision.trim()) {
    fail('revision', 'invalid_registry_revision', 'A extensão exige revisão própria e explícita.');
  }
  const units = new Set(EQUIPMENT_EFFECT_UNITS);
  if (!Array.isArray(input.additional_units)) {
    fail('additional_units', 'registry_units_array_required', 'Declare a lista de unidades adicionais.');
  } else {
    input.additional_units.forEach((unit, index) => {
      if (!identifier(unit) || units.has(unit)) {
        fail('additional_units[' + index + ']', 'invalid_or_duplicate_registry_unit',
          'Unidade deve ter ID novo e canônico.');
      } else units.add(unit);
    });
  }
  const capabilities = { ...EQUIPMENT_EFFECT_CAPABILITIES_V1 };
  const seen = new Set(Object.keys(capabilities));
  if (!Array.isArray(input.definitions)) {
    fail('definitions', 'registry_definitions_array_required', 'Declare a lista de grandezas.');
  } else {
    input.definitions.forEach((definition, index) => {
      const path = 'definitions[' + index + ']';
      const previousErrorCount = errors.length;
      if (!isPlainObject(definition)) {
        fail(path, 'registry_definition_object_required', 'Grandeza deve ser um objeto.');
        return;
      }
      exactKeys(definition, ['target', 'dimension', 'operations', 'condition_kinds',
        'requires_base_for_absolute_total', 'source_references'], path);
      if (!identifier(definition.target) || seen.has(definition.target)) {
        fail(at(path, 'target'), 'invalid_or_duplicate_registry_target',
          'Não é permitido redefinir alvo existente ou usar ID reservado.');
      } else seen.add(definition.target);
      requiredString(errors, definition.dimension, at(path, 'dimension'));
      if (typeof definition.requires_base_for_absolute_total !== 'boolean') {
        fail(at(path, 'requires_base_for_absolute_total'), 'registry_base_policy_required',
          'Declare explicitamente se o total absoluto exige base.');
      }
      for (const key of ['condition_kinds', 'source_references']) {
        const list = definition[key];
        if (!Array.isArray(list) || !list.length || new Set(list).size !== list.length ||
            list.some(value => typeof value !== 'string' || !value.trim())) {
          fail(at(path, key), 'invalid_registry_list', 'Lista não vazia, sem duplicatas, é obrigatória.');
        }
      }
      if (Array.isArray(definition.condition_kinds) && definition.condition_kinds.some(kind =>
        !EQUIPMENT_EFFECT_CONDITION_KINDS.includes(kind))) {
        fail(at(path, 'condition_kinds'), 'registry_condition_not_supported',
          'Condição inédita exige extensão revisada do contrato, não código cadastrado.');
      }
      if (!isPlainObject(definition.operations) || !Object.keys(definition.operations).length) {
        fail(at(path, 'operations'), 'registry_operations_required', 'Declare operações permitidas.');
      } else {
        for (const [operation, allowedUnits] of Object.entries(definition.operations)) {
          const opPath = at(at(path, 'operations'), operation);
          if (!EQUIPMENT_EFFECT_OPERATIONS.includes(operation)) {
            fail(opPath, 'registry_operation_not_supported', 'Operação inédita exige implementação revisada.');
            continue;
          }
          if (!Array.isArray(allowedUnits) || !allowedUnits.length ||
              new Set(allowedUnits).size !== allowedUnits.length ||
              allowedUnits.some(unit => !units.has(unit))) {
            fail(opPath, 'invalid_registry_operation_units', 'Use unidades registradas, sem duplicatas.');
            continue;
          }
          const relativeUnit = {
            relative_percent: 'percent', percentage_points: 'percentage_point', multiply: 'multiplier'
          }[operation];
          if (allowedUnits.some(unit => relativeUnit ? unit !== relativeUnit :
            ['percent', 'percentage_point', 'multiplier'].includes(unit))) {
            fail(opPath, 'registry_operation_unit_mismatch', 'Operação e unidade têm significados distintos.');
          }
        }
      }
      if (errors.length === previousErrorCount) {
        capabilities[definition.target] = {
          dimension: definition.dimension,
          operations: cloneJsonLike(definition.operations),
          condition_kinds: [...definition.condition_kinds],
          requires_base_for_absolute_total: definition.requires_base_for_absolute_total,
          source_references: [...definition.source_references],
          numeric_runtime: 'not_implemented'
        };
      }
    });
  }
  if (errors.length) return { valid: false, registry: null, errors, preserved };
  const registry = deepFreeze({
    registry_version: input.registry_version,
    revision: input.revision,
    units: [...units].sort(),
    capabilities
  });
  compiledRegistries.add(registry);
  return { valid: true, registry, errors, preserved };
}

function resolveRegistry(options, errors) {
  if (!isPlainObject(options)) {
    errors.push(issue('registry', 'invalid_registry_options', 'Opções de registro devem ser explícitas.'));
    return null;
  }
  const registry = hasOwn(options, 'registry') ? options.registry : DEFAULT_EQUIPMENT_EFFECT_REGISTRY_V1;
  if (!compiledRegistries.has(registry)) {
    errors.push(issue('registry', 'unvalidated_registry', 'Compile e valide o snapshot antes de usá-lo.'));
    return null;
  }
  return registry;
}

function registryCapability(registry, target) {
  return registry && typeof target === 'string' && hasOwn(registry.capabilities, target)
    ? registry.capabilities[target] : null;
}

export const LEGACY_BONUS_MODE_TRANSITION_V1 = deepFreeze({
  legacy: {
    status: 'pending_manual_mapping',
    rule: 'Preservar descrição e stats sem convertê-los pelo texto.'
  },
  calculated: {
    status: 'pending_dual_run_validation',
    rule: 'Preservar stats atuais até a comparação controlada da Fase 2C.'
  },
  informational: {
    status: 'pending_contract_review',
    rule: 'Preservar __echo_mode e descrição; informação não vira efeito numérico.'
  }
});

function legacyStatCandidate(target, operation, unit) {
  return {
    target,
    operation,
    unit,
    transition_status: 'candidate_requires_phase_2c_validation'
  };
}

/**
 * Inventário explícito das chaves emitidas hoje por
 * admin/js/equipment-bonus-structure.js. São candidatos de forma contratual,
 * não efeitos convertidos: valor, fonte, condição, duração, escopo e
 * acumulação ainda precisam ser confirmados na Fase 2C.
 */
export const LEGACY_BONUS_STAT_TRANSITION_V1 = deepFreeze({
  health_max_pct: legacyStatCandidate('health_capacity', 'relative_percent', 'percent'),
  health: legacyStatCandidate('health_capacity', 'add', 'health_point'),
  armor_max_pct: legacyStatCandidate('armor_capacity', 'relative_percent', 'percent'),
  armor: legacyStatCandidate('armor_capacity', 'add', 'armor_point'),
  vision_range: legacyStatCandidate('vision_range', 'add', 'distance_unit'),
  weapon_range_franco: legacyStatCandidate('aimed_range', 'add', 'distance_unit'),
  magazine_size: legacyStatCandidate('magazine_capacity', 'add', 'ammo_round'),
  armor_penetration: legacyStatCandidate(
    'armor_penetration', 'percentage_points', 'percentage_point'
  ),
  penetration_power: legacyStatCandidate('penetration_power', 'add', 'penetration_point'),
  weapon_damage_to_health_pct: legacyStatCandidate(
    'weapon_damage_to_health', 'relative_percent', 'percent'
  ),
  weapon_damage_to_armor_pct: legacyStatCandidate(
    'weapon_damage_to_armor', 'relative_percent', 'percent'
  ),
  movement_speed_pct: legacyStatCandidate('movement_speed', 'relative_percent', 'percent'),
  aimed_movement_speed_pct: legacyStatCandidate(
    'aimed_movement_speed', 'relative_percent', 'percent'
  ),
  reload_time_pct: legacyStatCandidate('reload_duration', 'relative_percent', 'percent'),
  special_ability_cooldown_pct: legacyStatCandidate(
    'ability_cooldown_duration', 'relative_percent', 'percent'
  ),
  crate_opening_cooldown_pct: legacyStatCandidate(
    'crate_open_duration', 'relative_percent', 'percent'
  )
});

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isPlainObject = value => Boolean(
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);
const at = (path, key) => path + '.' + key;

function cloneJsonLike(value) {
  if (Array.isArray(value)) return value.map(cloneJsonLike);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneJsonLike(child)]));
}

function trimIfString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function nullable(value) {
  return value === undefined ? null : value;
}

function normalizeIdentifierList(value) {
  if (!Array.isArray(value)) return value === undefined ? [] : value;
  const normalized = value.map(trimIfString);
  if (!normalized.every(item => typeof item === 'string')) return normalized;
  return [...normalized].sort(compareText);
}

function normalizeCondition(value) {
  if (!isPlainObject(value)) return value;
  return {
    ...cloneJsonLike(value),
    kind: trimIfString(value.kind),
    ability_id: nullable(trimIfString(value.ability_id)),
    event_id: nullable(trimIfString(value.event_id)),
    mode_id: nullable(trimIfString(value.mode_id)),
    state_id: nullable(trimIfString(value.state_id)),
    raw_text: nullable(trimIfString(value.raw_text))
  };
}

function normalizeDuration(value) {
  if (!isPlainObject(value)) return value;
  return {
    ...cloneJsonLike(value),
    kind: trimIfString(value.kind),
    value: nullable(value.value),
    unit: nullable(trimIfString(value.unit)),
    raw_text: nullable(trimIfString(value.raw_text))
  };
}

function normalizeScope(value) {
  if (!isPlainObject(value)) return value;
  return {
    ...cloneJsonLike(value),
    kind: trimIfString(value.kind),
    hero_ids: normalizeIdentifierList(value.hero_ids),
    class_ids: normalizeIdentifierList(value.class_ids),
    ability_ids: normalizeIdentifierList(value.ability_ids),
    mode_ids: normalizeIdentifierList(value.mode_ids)
  };
}

function normalizeStacking(value) {
  if (!isPlainObject(value)) return value;
  return {
    ...cloneJsonLike(value),
    group: trimIfString(value.group),
    rule: trimIfString(value.rule),
    tier_semantics: trimIfString(value.tier_semantics),
    max_stacks: nullable(value.max_stacks)
  };
}

function normalizeOrigin(value) {
  if (!isPlainObject(value)) return value;
  return {
    ...cloneJsonLike(value),
    kind: trimIfString(value.kind),
    id: trimIfString(value.id),
    equipment_id: nullable(trimIfString(value.equipment_id)),
    variant_id: nullable(trimIfString(value.variant_id)),
    set_id: nullable(trimIfString(value.set_id)),
    required_pieces: nullable(value.required_pieces)
  };
}

function normalizeProvenance(value) {
  if (!isPlainObject(value)) return value;
  let sources = value.sources;
  if (sources === undefined) sources = [];
  if (Array.isArray(sources)) {
    sources = sources.map(source => isPlainObject(source) ? {
      ...cloneJsonLike(source),
      kind: trimIfString(source.kind),
      reference: trimIfString(source.reference),
      observed_at: nullable(trimIfString(source.observed_at)),
      game_revision: nullable(trimIfString(source.game_revision))
    } : source);
  }
  return {
    ...cloneJsonLike(value),
    verification_status: trimIfString(value.verification_status),
    verified_at: nullable(trimIfString(value.verified_at)),
    sources
  };
}

function normalizeSupport(value) {
  if (!isPlainObject(value)) return value;
  return {
    ...cloneJsonLike(value),
    status: trimIfString(value.status),
    reason_code: nullable(trimIfString(value.reason_code)),
    details: nullable(trimIfString(value.details))
  };
}

function normalizeEffect(value) {
  if (!isPlainObject(value)) return value;
  return {
    ...cloneJsonLike(value),
    effect_id: trimIfString(value.effect_id),
    effect_revision: value.effect_revision,
    origin: normalizeOrigin(value.origin),
    target: nullable(trimIfString(value.target)),
    operation: nullable(trimIfString(value.operation)),
    value: nullable(value.value),
    unit: nullable(trimIfString(value.unit)),
    condition: normalizeCondition(value.condition),
    duration: normalizeDuration(value.duration),
    scope: normalizeScope(value.scope),
    stacking: normalizeStacking(value.stacking),
    provenance: normalizeProvenance(value.provenance),
    original_text: trimIfString(value.original_text),
    support: normalizeSupport(value.support)
  };
}

/**
 * Normaliza somente forma: espaços, nulos explícitos e ordem de seletores.
 * Valores numéricos em string nunca são convertidos.
 */
export function normalizeEquipmentEffectDocumentV1(input) {
  if (!isPlainObject(input)) return cloneJsonLike(input);
  const subject = isPlainObject(input.subject) ? {
    ...cloneJsonLike(input.subject),
    kind: trimIfString(input.subject.kind),
    id: trimIfString(input.subject.id)
  } : input.subject;
  return {
    ...cloneJsonLike(input),
    contract_version: trimIfString(input.contract_version),
    document_id: trimIfString(input.document_id),
    data_revision: trimIfString(input.data_revision),
    ruleset_revision: trimIfString(input.ruleset_revision),
    subject,
    expected_effect_count: nullable(input.expected_effect_count),
    effects: Array.isArray(input.effects) ? input.effects.map(normalizeEffect) : input.effects
  };
}

function issue(path, code, message, severity = 'error') {
  return { path, code, message, severity };
}

function requiredString(issues, value, path) {
  if (typeof value !== 'string' || !value.trim()) {
    issues.push(issue(path, 'required_non_empty_string', 'Informe um texto não vazio.'));
    return false;
  }
  return true;
}

function enumValue(issues, value, allowed, path) {
  if (!allowed.includes(value)) {
    issues.push(issue(path, 'unsupported_enum_value', 'Valor não suportado: ' + String(value) + '.'));
    return false;
  }
  return true;
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function validateSupport(support, path, errors) {
  if (!isPlainObject(support)) {
    errors.push(issue(path, 'support_object_required', 'O estado de suporte deve ser explícito.'));
    return null;
  }
  if (!enumValue(errors, support.status, EQUIPMENT_EFFECT_SUPPORT_STATUSES, at(path, 'status'))) return null;
  if (support.status === 'pending') requiredString(errors, support.reason_code, at(path, 'reason_code'));
  if (support.status === 'supported' && support.reason_code !== null &&
      support.reason_code !== undefined && support.reason_code !== '') {
    errors.push(issue(at(path, 'reason_code'), 'supported_effect_cannot_have_pending_reason',
      'Efeito suportado não pode manter motivo de pendência.'));
  }
  return support.status;
}

function validateOrigin(origin, path, errors) {
  if (!isPlainObject(origin)) {
    errors.push(issue(path, 'origin_object_required', 'A origem deve ser explícita.'));
    return null;
  }
  const kindValid = enumValue(errors, origin.kind, SUBJECT_KINDS, at(path, 'kind'));
  requiredString(errors, origin.id, at(path, 'id'));
  if (!kindValid) return null;
  if (origin.kind === 'equipment') requiredString(errors, origin.equipment_id, at(path, 'equipment_id'));
  if (origin.kind === 'equipment_variant') {
    requiredString(errors, origin.equipment_id, at(path, 'equipment_id'));
    requiredString(errors, origin.variant_id, at(path, 'variant_id'));
  }
  if (origin.kind === 'set_bonus') {
    requiredString(errors, origin.set_id, at(path, 'set_id'));
    if (!Number.isInteger(origin.required_pieces) || origin.required_pieces < 1) {
      errors.push(issue(at(path, 'required_pieces'), 'invalid_required_pieces',
        'required_pieces deve ser inteiro positivo.'));
    }
  }
  return origin.kind;
}

function validateDuration(duration, supportStatus, path, errors) {
  if (!isPlainObject(duration)) {
    errors.push(issue(path, 'duration_object_required', 'A duração deve ser explícita.'));
    return;
  }
  if (!enumValue(errors, duration.kind, EQUIPMENT_EFFECT_DURATION_KINDS, at(path, 'kind'))) return;
  if (duration.kind === 'known') {
    if (typeof duration.value !== 'number' || !Number.isFinite(duration.value) || duration.value <= 0) {
      errors.push(issue(at(path, 'value'), 'known_duration_requires_positive_number',
        'Duração conhecida exige número finito maior que zero.'));
    }
    if (duration.unit !== 'second') {
      errors.push(issue(at(path, 'unit'), 'known_duration_unit_unsupported',
        'A versão v1 aceita duração conhecida em segundos.'));
    }
  } else if (duration.value !== null && duration.value !== undefined) {
    errors.push(issue(at(path, 'value'), 'duration_value_not_allowed',
      'Somente duração conhecida pode carregar valor.'));
  }
  if (duration.kind === 'unknown') {
    requiredString(errors, duration.raw_text, at(path, 'raw_text'));
    if (supportStatus !== 'pending') {
      errors.push(issue(path, 'unknown_duration_requires_pending',
        'Duração desconhecida exige estado pendente.'));
    }
  }
}

function validateCondition(condition, duration, supportStatus, path, errors, warnings) {
  if (!isPlainObject(condition)) {
    errors.push(issue(path, 'condition_object_required', 'A condição deve ser explícita.'));
    return;
  }
  if (!enumValue(errors, condition.kind, EQUIPMENT_EFFECT_CONDITION_KINDS, at(path, 'kind'))) return;
  const requiredByKind = {
    ability_active: 'ability_id',
    after_event: 'event_id',
    mode_active: 'mode_id',
    state_active: 'state_id'
  };
  const requiredKey = requiredByKind[condition.kind];
  if (requiredKey) requiredString(errors, condition[requiredKey], at(path, requiredKey));
  if (['unknown', 'unsupported'].includes(condition.kind)) {
    requiredString(errors, condition.raw_text, at(path, 'raw_text'));
    if (supportStatus !== 'pending') {
      errors.push(issue(path, 'unresolved_condition_requires_pending',
        'Condição desconhecida ou não suportada exige estado pendente.'));
    }
  }
  if (!isPlainObject(duration)) return;
  const durationPath = path.replace(/condition$/, 'duration');
  if (condition.kind === 'always' && duration.kind !== 'not_applicable') {
    errors.push(issue(at(durationPath, 'kind'), 'always_duration_must_be_not_applicable',
      'Efeito sempre ativo não pode receber duração implícita.'));
  }
  if (['ability_active', 'mode_active', 'state_active'].includes(condition.kind) &&
      duration.kind !== 'while_condition') {
    errors.push(issue(at(durationPath, 'kind'), 'state_condition_requires_bound_duration',
      'A duração deve acompanhar explicitamente o estado ativo.'));
  }
  if (condition.kind === 'after_event' && duration.kind === 'unknown' && supportStatus !== 'pending') {
    errors.push(issue(at(durationPath, 'kind'), 'unknown_duration_requires_pending',
      'Duração desconhecida após evento exige estado pendente.'));
  }
  if (condition.kind === 'after_event' && duration.kind === 'not_applicable') {
    warnings.push(issue(at(durationPath, 'kind'), 'event_without_duration_review',
      'Confirme se o evento é instantâneo ou se falta duração.', 'warning'));
  }
}

function validateScope(scope, path, errors) {
  if (!isPlainObject(scope)) {
    errors.push(issue(path, 'scope_object_required', 'O escopo do efeito deve ser explícito.'));
    return;
  }
  if (!enumValue(errors, scope.kind, SCOPE_KINDS, at(path, 'kind'))) return;
  let selectorCount = 0;
  for (const key of ['hero_ids', 'class_ids', 'ability_ids', 'mode_ids']) {
    const list = scope[key];
    if (!Array.isArray(list)) {
      errors.push(issue(at(path, key), 'scope_selector_array_required',
        'Seletores de escopo devem ser listas.'));
      continue;
    }
    const seen = new Set();
    list.forEach((value, index) => {
      const itemPath = at(path, key) + '[' + index + ']';
      if (!requiredString(errors, value, itemPath)) return;
      if (seen.has(value)) errors.push(issue(itemPath, 'duplicate_scope_selector', 'Seletor repetido.'));
      seen.add(value);
      selectorCount += 1;
    });
  }
  if (scope.kind === 'global' && selectorCount > 0) {
    errors.push(issue(path, 'global_scope_cannot_have_selectors',
      'Escopo global não pode carregar restrições residuais.'));
  }
  if (scope.kind === 'restricted' && selectorCount === 0) {
    errors.push(issue(path, 'restricted_scope_requires_selector',
      'Escopo restrito exige ao menos um seletor.'));
  }
}

function validateStacking(stacking, originKind, supportStatus, path, errors) {
  if (!isPlainObject(stacking)) {
    errors.push(issue(path, 'stacking_object_required', 'A acumulação deve ser explícita.'));
    return;
  }
  requiredString(errors, stacking.group, at(path, 'group'));
  const ruleValid = enumValue(errors, stacking.rule, EQUIPMENT_EFFECT_STACKING_RULES, at(path, 'rule'));
  const tierValid = enumValue(errors, stacking.tier_semantics,
    EQUIPMENT_EFFECT_TIER_SEMANTICS, at(path, 'tier_semantics'));
  if (stacking.max_stacks !== null && stacking.max_stacks !== undefined &&
      (!Number.isInteger(stacking.max_stacks) || stacking.max_stacks < 1)) {
    errors.push(issue(at(path, 'max_stacks'), 'invalid_max_stacks',
      'max_stacks deve ser inteiro maior ou igual a 1, ou null.'));
  }
  if (supportStatus === 'supported' && ruleValid && stacking.rule === 'unknown') {
    errors.push(issue(at(path, 'rule'), 'unknown_stacking_requires_pending',
      'Regra de acumulação desconhecida exige estado pendente.'));
  }
  if (supportStatus === 'supported' && tierValid && stacking.tier_semantics === 'unknown') {
    errors.push(issue(at(path, 'tier_semantics'), 'unknown_tier_semantics_requires_pending',
      'Semântica de patamar desconhecida exige estado pendente.'));
  }
  if (originKind === 'set_bonus' && tierValid && stacking.tier_semantics === 'not_applicable') {
    errors.push(issue(at(path, 'tier_semantics'), 'set_bonus_requires_tier_semantics',
      'Bônus de conjunto deve declarar patamar incremental ou total cumulativo.'));
  }
}

function validateProvenance(provenance, supportStatus, path, errors) {
  if (!isPlainObject(provenance)) {
    errors.push(issue(path, 'provenance_object_required', 'A proveniência deve ser explícita.'));
    return;
  }
  const statusValid = enumValue(errors, provenance.verification_status,
    VERIFICATION_STATUSES, at(path, 'verification_status'));
  if (supportStatus === 'supported' && statusValid &&
      provenance.verification_status !== 'confirmed') {
    errors.push(issue(at(path, 'verification_status'), 'supported_effect_requires_confirmed_source',
      'Efeito suportado exige fonte confirmada.'));
  }
  if (supportStatus === 'supported' &&
      (provenance.verified_at === null || provenance.verified_at === undefined ||
        provenance.verified_at === '')) {
    errors.push(issue(at(path, 'verified_at'), 'supported_effect_requires_verification_date',
      'Efeito suportado exige data de verificação.'));
  }
  if (provenance.verified_at !== null && provenance.verified_at !== undefined &&
      !validTimestamp(provenance.verified_at)) {
    errors.push(issue(at(path, 'verified_at'), 'invalid_verified_at',
      'Use data YYYY-MM-DD ou timestamp ISO válido.'));
  }
  if (!Array.isArray(provenance.sources) || provenance.sources.length === 0) {
    errors.push(issue(at(path, 'sources'), 'provenance_source_required',
      'Preserve ao menos uma fonte.'));
    return;
  }
  provenance.sources.forEach((source, index) => {
    const sourcePath = at(path, 'sources') + '[' + index + ']';
    if (!isPlainObject(source)) {
      errors.push(issue(sourcePath, 'provenance_source_object_required', 'A fonte deve ser um objeto.'));
      return;
    }
    enumValue(errors, source.kind, PROVENANCE_SOURCE_KINDS, at(sourcePath, 'kind'));
    requiredString(errors, source.reference, at(sourcePath, 'reference'));
    if (source.observed_at !== null && source.observed_at !== undefined &&
        !validTimestamp(source.observed_at)) {
      errors.push(issue(at(sourcePath, 'observed_at'), 'invalid_observed_at',
        'Use data YYYY-MM-DD ou timestamp ISO válido.'));
    }
  });
}

function validateEffect(effect, index, errors, warnings, registry) {
  const path = 'effects[' + index + ']';
  if (!isPlainObject(effect)) {
    errors.push(issue(path, 'effect_object_required', 'Cada efeito deve ser um objeto.'));
    return;
  }
  requiredString(errors, effect.effect_id, at(path, 'effect_id'));
  if (!Number.isInteger(effect.effect_revision) || effect.effect_revision < 1) {
    errors.push(issue(at(path, 'effect_revision'), 'invalid_effect_revision',
      'effect_revision deve ser inteiro positivo.'));
  }
  for (const forbidden of ['applied', 'is_applied', 'executed', 'execution_result']) {
    if (hasOwn(effect, forbidden)) {
      errors.push(issue(at(path, forbidden), 'execution_result_forbidden_in_catalog',
        'Resultado de execução não pertence ao cadastro do efeito.'));
    }
  }

  const supportStatus = validateSupport(effect.support, at(path, 'support'), errors);
  const originKind = validateOrigin(effect.origin, at(path, 'origin'), errors);
  requiredString(errors, effect.original_text, at(path, 'original_text'));
  const pending = supportStatus === 'pending';

  if (!pending) {
    for (const field of ['target', 'operation', 'value', 'unit']) {
      if (effect[field] === null || effect[field] === undefined || effect[field] === '') {
        errors.push(issue(at(path, field), 'supported_effect_requires_semantics',
          'Efeito suportado exige alvo, operação, valor e unidade explícitos.'));
      }
    }
  }

  let capability = null;
  if (effect.target !== null && effect.target !== undefined && effect.target !== '') {
    if (typeof effect.target !== 'string') {
      errors.push(issue(at(path, 'target'), 'target_string_required',
        'O alvo deve ser texto canônico ou null em uma pendência.'));
    } else {
      capability = registryCapability(registry, effect.target);
      if (!capability) {
        const targetIssue = issue(at(path, 'target'), 'unknown_target',
          'Alvo não registrado na versão v1.', pending ? 'warning' : 'error');
        (pending ? warnings : errors).push(targetIssue);
      }
    }
  }

  if (effect.operation !== null && effect.operation !== undefined && effect.operation !== '' &&
      !EQUIPMENT_EFFECT_OPERATIONS.includes(effect.operation)) {
    const operationIssue = issue(at(path, 'operation'), 'unknown_operation',
      'Operação não registrada na versão v1.', pending ? 'warning' : 'error');
    (pending ? warnings : errors).push(operationIssue);
  }
  if (effect.value !== null && effect.value !== undefined &&
      (typeof effect.value !== 'number' || !Number.isFinite(effect.value))) {
    errors.push(issue(at(path, 'value'), 'value_must_be_finite_number',
      'Valor deve ser número JSON finito; strings e coerção decimal não são aceitas.'));
  }
  if (effect.unit !== null && effect.unit !== undefined && effect.unit !== '' &&
      !registry.units.includes(effect.unit)) {
    const unitIssue = issue(at(path, 'unit'), 'unknown_unit',
      'Unidade não registrada na versão v1.', pending ? 'warning' : 'error');
    (pending ? warnings : errors).push(unitIssue);
  }

  if (capability && EQUIPMENT_EFFECT_OPERATIONS.includes(effect.operation)) {
    const allowedUnits = capability.operations[effect.operation];
    if (!allowedUnits) {
      errors.push(issue(at(path, 'operation'), 'operation_incompatible_with_target',
        'A operação não é compatível com o alvo.'));
    } else if (effect.unit !== null && effect.unit !== undefined && effect.unit !== '' &&
        !allowedUnits.includes(effect.unit)) {
      errors.push(issue(at(path, 'unit'), 'unit_incompatible_with_target_operation',
        'A unidade não corresponde ao alvo e à operação.'));
    }
  }

  validateCondition(effect.condition, effect.duration, supportStatus,
    at(path, 'condition'), errors, warnings);
  validateDuration(effect.duration, supportStatus, at(path, 'duration'), errors);
  validateScope(effect.scope, at(path, 'scope'), errors);
  validateStacking(effect.stacking, originKind, supportStatus, at(path, 'stacking'), errors);
  validateProvenance(effect.provenance, supportStatus, at(path, 'provenance'), errors);

  if (capability && isPlainObject(effect.condition) &&
      !capability.condition_kinds.includes(effect.condition.kind)) {
    errors.push(issue(at(at(path, 'condition'), 'kind'), 'condition_incompatible_with_target',
      'A condição não é compatível com o alvo.'));
  }
  if (effect.target === 'ability_heal_amount' && supportStatus === 'supported') {
    const conditionAbility = isPlainObject(effect.condition) &&
      typeof effect.condition.ability_id === 'string' && effect.condition.ability_id;
    const scopedAbility = isPlainObject(effect.scope) &&
      Array.isArray(effect.scope.ability_ids) && effect.scope.ability_ids.length;
    if (!conditionAbility && !scopedAbility) {
      errors.push(issue(at(at(path, 'scope'), 'ability_ids'),
        'ability_effect_requires_ability_identity',
        'Cura de habilidade deve identificar a habilidade na condição ou no escopo.'));
    }
  }
}

export function validateEquipmentEffectDocumentV1(input, options = {}) {
  const document = normalizeEquipmentEffectDocumentV1(input);
  const errors = [];
  const warnings = [];
  const registry = resolveRegistry(options, errors);
  if (!registry) return { valid: false, document, errors, warnings };
  if (!isPlainObject(document)) {
    errors.push(issue('$', 'document_object_required', 'O contrato deve ser um objeto JSON.'));
    return { valid: false, document, errors, warnings };
  }
  if (document.contract_version !== EQUIPMENT_EFFECT_CONTRACT_VERSION) {
    errors.push(issue('contract_version', 'unsupported_contract_version',
      'A versão não pode ser reinterpretada como v1.'));
  }
  if ((registry !== DEFAULT_EQUIPMENT_EFFECT_REGISTRY_V1 || hasOwn(document, 'registry_revision')) &&
      document.registry_revision !== registry.revision) {
    errors.push(issue('registry_revision', 'registry_revision_mismatch',
      'O documento deve apontar exatamente para a revisão do registro carregado.'));
  }
  requiredString(errors, document.document_id, 'document_id');
  requiredString(errors, document.data_revision, 'data_revision');
  requiredString(errors, document.ruleset_revision, 'ruleset_revision');
  if (!isPlainObject(document.subject)) {
    errors.push(issue('subject', 'subject_object_required', 'O sujeito deve ser um objeto.'));
  } else {
    enumValue(errors, document.subject.kind, SUBJECT_KINDS, 'subject.kind');
    requiredString(errors, document.subject.id, 'subject.id');
  }
  if (document.expected_effect_count !== null &&
      (!Number.isInteger(document.expected_effect_count) || document.expected_effect_count < 0)) {
    errors.push(issue('expected_effect_count', 'invalid_expected_effect_count',
      'A contagem esperada deve ser inteiro não negativo ou null.'));
  }
  if (!Array.isArray(document.effects)) {
    errors.push(issue('effects', 'effects_array_required', 'effects deve ser uma lista.'));
  } else {
    const ids = new Set();
    document.effects.forEach((effect, index) => {
      validateEffect(effect, index, errors, warnings, registry);
      if (isPlainObject(effect) && typeof effect.effect_id === 'string' && effect.effect_id) {
        if (ids.has(effect.effect_id)) {
          errors.push(issue('effects[' + index + '].effect_id', 'duplicate_effect_id',
            'effect_id deve ser único no documento.'));
        }
        ids.add(effect.effect_id);
      }
    });
    if (Number.isInteger(document.expected_effect_count) &&
        document.effects.length > document.expected_effect_count) {
      errors.push(issue('expected_effect_count', 'represented_effects_exceed_expected',
        'Há mais efeitos representados que a contagem esperada.'));
    }
  }
  return { valid: errors.length === 0, document, errors, warnings };
}

/**
 * Versões futuras são preservadas sem downgrade. O payload original permanece
 * disponível em preserved para diagnóstico e migração consciente.
 */
export function readEquipmentEffectDocument(input, options = {}) {
  const preserved = cloneJsonLike(input);
  if (!isPlainObject(input)) {
    return {
      status: 'invalid',
      contract_version: null,
      document: null,
      preserved,
      errors: [issue('$', 'document_object_required', 'O contrato deve ser um objeto JSON.')],
      warnings: [],
      numeric_authority: EQUIPMENT_EFFECT_NUMERIC_AUTHORITY
    };
  }
  if (input.contract_version !== EQUIPMENT_EFFECT_CONTRACT_VERSION) {
    return {
      status: 'unknown_version',
      contract_version: trimIfString(input.contract_version) || null,
      document: null,
      preserved,
      errors: [issue('contract_version', 'unsupported_contract_version',
        'Versão desconhecida preservada sem execução ou downgrade.')],
      warnings: [],
      numeric_authority: EQUIPMENT_EFFECT_NUMERIC_AUTHORITY
    };
  }
  const validation = validateEquipmentEffectDocumentV1(input, options);
  if (typeof input.registry_revision === 'string' && input.registry_revision.trim() &&
      validation.errors.some(error => error.code === 'registry_revision_mismatch')) {
    return {
      status: 'unknown_registry',
      contract_version: EQUIPMENT_EFFECT_CONTRACT_VERSION,
      document: null,
      preserved,
      errors: validation.errors,
      warnings: validation.warnings,
      numeric_authority: EQUIPMENT_EFFECT_NUMERIC_AUTHORITY
    };
  }
  const pending = validation.valid &&
    validation.document.effects.some(effect => effect && effect.support &&
      effect.support.status === 'pending');
  return {
    status: validation.valid ? (pending ? 'pending' : 'valid') : 'invalid',
    contract_version: EQUIPMENT_EFFECT_CONTRACT_VERSION,
    document: validation.document,
    preserved,
    errors: validation.errors,
    warnings: validation.warnings,
    numeric_authority: EQUIPMENT_EFFECT_NUMERIC_AUTHORITY
  };
}

function contextList(context, key) {
  return Array.isArray(context && context[key]) ? context[key] : null;
}

function conditionReadiness(effect, context, reasons) {
  const condition = effect.condition;
  if (!isPlainObject(condition) || condition.kind === 'always') return;
  if (['unknown', 'unsupported'].includes(condition.kind)) {
    reasons.push('condition_not_supported');
    return;
  }
  const mapping = {
    ability_active: ['active_ability_ids', condition.ability_id],
    after_event: ['occurred_event_ids', condition.event_id],
    mode_active: ['active_mode_ids', condition.mode_id],
    state_active: ['active_state_ids', condition.state_id]
  };
  const pair = mapping[condition.kind] || [];
  const list = contextList(context, pair[0]);
  if (!list) reasons.push('scenario_context_missing');
  else if (!list.includes(pair[1])) reasons.push('condition_inactive');
}

function describeBaseAvailability(effect, capability, context) {
  if (!capability) return { status: 'unclassified', reason: 'target_unregistered' };
  if (!capability.requires_base_for_absolute_total) return { status: 'not_required' };
  const target = effect.target;
  const values = isPlainObject(context && context.base_values) ? context.base_values : {};
  const hasValue = hasOwn(values, target);
  const finite = hasValue && typeof values[target] === 'number' && Number.isFinite(values[target]);
  const availability = isPlainObject(context && context.base_availability)
    ? context.base_availability : {};
  const metadata = hasOwn(availability, target) ? availability[target] : undefined;
  if (metadata === undefined) {
    return { status: hasValue ? (finite ? 'available' : 'invalid') : 'unconfirmed',
      source_reference: null };
  }
  if (!isPlainObject(metadata) ||
      !['available', 'not_public', 'unconfirmed', 'load_error'].includes(metadata.status)) {
    return { status: 'invalid', reason: 'invalid_base_availability_metadata' };
  }
  const nonEmpty = value => typeof value === 'string' && Boolean(value.trim());
  if ((metadata.status === 'available' && !finite) ||
      (metadata.status !== 'available' && hasValue)) {
    return { status: 'invalid', reason: 'base_value_availability_conflict' };
  }
  if (metadata.status !== 'available' && !nonEmpty(metadata.missing_data)) {
    return { status: 'invalid', reason: 'missing_data_explanation_required' };
  }
  if (metadata.status === 'not_public' && !nonEmpty(metadata.source_reference)) {
    return { status: 'invalid', reason: 'external_classification_source_required' };
  }
  if (metadata.source_reference !== undefined && metadata.source_reference !== null &&
      !nonEmpty(metadata.source_reference)) {
    return { status: 'invalid', reason: 'invalid_base_source_reference' };
  }
  return {
    status: metadata.status,
    source_reference: metadata.source_reference || null,
    missing_data: metadata.status === 'available' ? null : metadata.missing_data
  };
}

/**
 * Diagnostica prontidão sem calcular. Nunca retorna "applied": isso pertence
 * a um resultado de execução sobre base/cenário específicos.
 */
export function assessEquipmentEffectExecutionV1(effect, context = {}, options = {}) {
  const errors = [];
  const warnings = [];
  const normalizedEffect = normalizeEffect(effect);
  const registry = resolveRegistry(options, errors);
  if (registry) validateEffect(normalizedEffect, 0, errors, warnings, registry);
  const reasons = [];
  if (errors.length) reasons.push('invalid_contract');
  if (normalizedEffect && normalizedEffect.support &&
      normalizedEffect.support.status === 'pending') reasons.push('support_pending');
  if (normalizedEffect && normalizedEffect.duration &&
      normalizedEffect.duration.kind === 'unknown') reasons.push('duration_unknown');
  conditionReadiness(normalizedEffect || {}, context, reasons);
  const capability = registryCapability(registry, normalizedEffect && normalizedEffect.target);
  const baseValues = isPlainObject(context && context.base_values) ? context.base_values : {};
  if (capability && capability.requires_base_for_absolute_total &&
      (!hasOwn(baseValues, normalizedEffect.target) ||
       typeof baseValues[normalizedEffect.target] !== 'number' ||
       !Number.isFinite(baseValues[normalizedEffect.target]))) {
    reasons.push('base_missing');
  }
  const baseAvailability = describeBaseAvailability(normalizedEffect, capability, context);
  if (baseAvailability.status !== 'available' && baseAvailability.status !== 'not_required') {
    reasons.push('base_' + baseAvailability.status);
  }
  const declaredValueVisible = errors.length === 0 &&
    Boolean(normalizedEffect) && typeof normalizedEffect.value === 'number';
  reasons.push(EQUIPMENT_EFFECT_NUMERIC_AUTHORITY.reason);
  return {
    execution_eligible: false,
    contract_valid: errors.length === 0,
    target_registered: Boolean(capability),
    declared_value_visible: declaredValueVisible,
    relative_effect_visible: declaredValueVisible &&
      ['relative_percent', 'percentage_points', 'multiply'].includes(normalizedEffect.operation),
    diagnostics_version: 'echo-equipment-effect-diagnostics/v1',
    registry_revision: registry ? registry.revision : null,
    data_quality: {
      status: errors.length ? 'invalid' : normalizedEffect.provenance.verification_status,
      authority: 'declared_evidence_not_server_approval'
    },
    mechanic_support: capability ? capability.numeric_runtime : 'unregistered',
    base_availability: baseAvailability,
    external_data_status: declaredValueVisible &&
      normalizedEffect.provenance.verification_status === 'confirmed' &&
      baseAvailability.status === 'not_public' ? 'awaiting_official_data' : null,
    execution_status: 'not_executed',
    reasons: [...new Set(reasons)],
    errors,
    warnings,
    numeric_authority: EQUIPMENT_EFFECT_NUMERIC_AUTHORITY
  };
}

export function summarizeEquipmentEffectDocument(input, options = {}) {
  const read = readEquipmentEffectDocument(input, options);
  if (!read.document || !Array.isArray(read.document.effects)) {
    return {
      status: read.status,
      contract_complete: false,
      numeric_complete: false,
      expected: null,
      represented: 0,
      supported: 0,
      pending: 0,
      invalid: read.errors.length ? 1 : 0,
      numeric_authority: EQUIPMENT_EFFECT_NUMERIC_AUTHORITY
    };
  }
  const expected = read.document.expected_effect_count;
  const represented = read.document.effects.length;
  const pending = read.document.effects.filter(effect =>
    effect && effect.support && effect.support.status === 'pending').length;
  const supported = read.document.effects.filter(effect =>
    effect && effect.support && effect.support.status === 'supported').length;
  const invalid = read.errors.length;
  const contractComplete = read.status !== 'invalid' &&
    Number.isInteger(expected) &&
    represented === expected &&
    supported === expected &&
    pending === 0;
  return {
    status: contractComplete ? 'contract_complete_runtime_inactive' : read.status,
    contract_complete: contractComplete,
    numeric_complete: false,
    expected,
    represented,
    supported,
    pending,
    invalid,
    numeric_authority: EQUIPMENT_EFFECT_NUMERIC_AUTHORITY
  };
}

function sortedJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortedJsonValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedJsonValue(value[key])]));
}

export function serializeEquipmentEffectDocumentV1(input, options = {}) {
  const validation = validateEquipmentEffectDocumentV1(input, options);
  if (!validation.valid) {
    const error = new Error('Contrato de efeitos inválido.');
    error.code = 'invalid_equipment_effect_contract';
    error.issues = validation.errors;
    throw error;
  }
  return JSON.stringify(sortedJsonValue(validation.document));
}

/**
 * Ponte diagnóstica dos três modos atuais. Nenhum texto/stat é transformado
 * em efeito v1 na Fase 2B.
 */
export function inspectLegacyBonusTransitionV1(input = {}) {
  const mode = trimIfString(input.mode);
  const transition = typeof mode === 'string' && hasOwn(LEGACY_BONUS_MODE_TRANSITION_V1, mode)
    ? LEGACY_BONUS_MODE_TRANSITION_V1[mode] : null;
  const stats = isPlainObject(input.stats) ? input.stats : {};
  const statDiagnostics = Object.entries(stats)
    .filter(([key]) => !key.startsWith('__echo_'))
    .sort(([left], [right]) => compareText(left, right))
    .map(([legacyKey, rawValue]) => {
      const candidate = hasOwn(LEGACY_BONUS_STAT_TRANSITION_V1, legacyKey)
        ? LEGACY_BONUS_STAT_TRANSITION_V1[legacyKey] : null;
      return {
        legacy_key: legacyKey,
        raw_value: cloneJsonLike(rawValue),
        transition_status: candidate
          ? candidate.transition_status
          : 'unregistered_legacy_key',
        contract_candidate: candidate ? cloneJsonLike({
          target: candidate.target,
          operation: candidate.operation,
          unit: candidate.unit
        }) : null,
        value_status: typeof rawValue === 'number' && Number.isFinite(rawValue)
          ? 'finite_number'
          : 'requires_review',
        executable: false
      };
    });
  return {
    recognized_mode: Boolean(transition),
    mode: mode || null,
    transition_status: transition ? transition.status : 'invalid_legacy_mode',
    requires_phase_2c: true,
    generated_effects: [],
    stat_diagnostics: statDiagnostics,
    all_stats_registered: statDiagnostics.every(entry => entry.contract_candidate !== null),
    preserved: cloneJsonLike({
      description: input.description === undefined ? null : input.description,
      stats: input.stats === undefined ? null : input.stats
    })
  };
}
