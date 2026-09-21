import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import { calculateBuild } from '../../js/calculation-v2-engine.js?v=20260915-calculation-v2-1&partial=20260917-partial-effects-1';
import { createCalculationEffectsFromImport } from './equipment-calculation-v2-import.js?v=20260920-resolution-authority-1';
import {
  adminObservationSource,
  normalizeCalculationEffectLabel,
  resolveCalculationAlias
} from './equipment-calculation-v2-recognition.js?v=20260920-resolution-authority-1';
import { equipmentEffectTextReview } from './equipment-effect-text.js?v=20260916-ocr-continuation-1&eq=20260907-effects-1';
import {
  eligiblePreviewHeroes,
  previewHeroEligibility
} from './equipment-calculation-v2-eligibility.js?v=20260917-equipment-scope-preview-1';

const CONTRACT_ID = 'echo-calculation-workspace/v2';

const RARITIES = Object.freeze([
  Object.freeze({ slug: 'comum', name: 'Comum', rank: 1 }),
  Object.freeze({ slug: 'raro', name: 'Raro', rank: 2 }),
  Object.freeze({ slug: 'epico', name: 'Épico', rank: 3 }),
  Object.freeze({ slug: 'lendario', name: 'Lendário', rank: 4 }),
  Object.freeze({ slug: 'mitico', name: 'Mítico', rank: 5 }),
  Object.freeze({ slug: 'supremo', name: 'Supremo', rank: 6 }),
  Object.freeze({ slug: 'grandioso', name: 'Grandioso', rank: 7 }),
  Object.freeze({ slug: 'celestial', name: 'Celestial', rank: 8 }),
  Object.freeze({ slug: 'estelar', name: 'Estelar', rank: 9 }),
  Object.freeze({ slug: 'imortal', name: 'Imortal', rank: 10 }),
  Object.freeze({ slug: 'divino', name: 'Divino', rank: 11 })
]);

const EFFECT_KINDS = Object.freeze([
  Object.freeze({ value: 'numeric', label: 'Numérico' }),
  Object.freeze({ value: 'informational', label: 'Somente informativo' }),
  Object.freeze({ value: 'unresolved', label: 'Regra ainda não conhecida' })
]);

const OPERATIONS = Object.freeze([
  Object.freeze({ value: 'flat', label: 'Somar ou reduzir este valor' }),
  Object.freeze({ value: 'percent', label: 'Aplicar como porcentagem do valor base' })
]);

const SCOPES = Object.freeze([
  Object.freeze({ value: 'self', label: 'Portador' }),
  Object.freeze({ value: 'team', label: 'Equipe' })
]);

const SOURCE_KINDS = Object.freeze([
  Object.freeze({ value: 'official', label: 'Informação oficial da ZeptoLab · selo Oficial' }),
  Object.freeze({ value: 'game_capture', label: 'Captura direta do jogo · selo Master' }),
  Object.freeze({ value: 'developer_statement', label: 'Declaração da ZeptoLab · revisão necessária' }),
  Object.freeze({ value: 'admin_observation', label: 'Registro manual no painel · sem selo' }),
  Object.freeze({ value: 'other', label: 'Outra origem · sem selo' })
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const state = {
  mount: null,
  equipmentId: new URLSearchParams(location.search).get('id'),
  equipmentName: '',
  equipment: null,
  revision: 0,
  effects: [],
  definitions: [],
  aliases: [],
  contexts: [],
  operations: [],
  definitionDrafts: [],
  reprocessPlans: [],
  conditions: [],
  rarities: RARITIES,
  heroes: [],
  heroBases: new Map(),
  permissions: { edit: false, publish: false },
  published: null,
  catalogCompatible: false,
  dirty: false,
  busy: false,
  loadToken: 0,
  previewConditions: Object.create(null),
  lastVerifiedRevision: null,
  starterEffectId: null,
  pendingImport: null,
  queuedImportDraft: null,
  ocrTextReviewIds: new Set(),
  autoConfirmAfterEquipmentSave: false,
  loaded: false
};

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return String(value ?? '').trim();
}

function finiteOrNull(value) {
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseNullableNumber(value) {
  const raw = String(value ?? '').trim();
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function displayNumber(value, unit = '') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const formatted = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 6
  }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function displayDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR');
}

function createOption(value, label, selected = false) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  option.selected = selected;
  return option;
}

function fillSelect(select, options, current, placeholder = null) {
  select.replaceChildren();
  if (placeholder) select.append(createOption('', placeholder, !current));
  for (const option of options) {
    select.append(createOption(option.value, option.label, option.value === current));
  }
}

function unwrapRpcData(data) {
  let value = data;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (Array.isArray(value) && value.length === 1 && isRecord(value[0])) return value[0];
  return value;
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || `Falha em ${name}.`);
  return unwrapRpcData(data);
}

function normalizedRarities(raw) {
  const source = Array.isArray(raw) && raw.length ? raw : RARITIES;
  const bySlug = new Map(source.map((rarity, index) => [
    text(rarity.slug).toLowerCase(),
    {
      id: rarity.id ?? null,
      slug: text(rarity.slug).toLowerCase(),
      name: text(rarity.name) || text(rarity.slug),
      rank: Number.isFinite(Number(rarity.rank)) ? Number(rarity.rank) : index + 1
    }
  ]));
  return RARITIES.map(fallback => bySlug.get(fallback.slug) || fallback);
}

function normalizedDefinition(definition) {
  const source = isRecord(definition.source) ? definition.source : {};
  return {
    ...definition,
    id: text(definition.id),
    label: text(definition.label) || text(definition.id),
    unit: text(definition.unit),
    context: text(definition.context || definition.context_key) || 'general',
    acceptedUnits: Array.isArray(definition.acceptedUnits || definition.accepted_units)
      ? [...(definition.acceptedUnits || definition.accepted_units)]
      : [],
    allowedOperations: Array.isArray(definition.allowedOperations || definition.allowed_operations)
      ? [...(definition.allowedOperations || definition.allowed_operations)]
      : [],
    valueType: text(definition.valueType || definition.value_type) || 'decimal',
    metricKind: text(definition.metricKind || definition.metric_kind) || 'direct',
    version: Number(definition.version || 1),
    state: text(definition.state) || 'published',
    formulaState: text(definition.formulaState || definition.formula_state) || 'published',
    defaultBase: finiteOrNull(definition.defaultBase),
    source: {
      scope: text(source.scope || definition.scope || definition.sourceScope || definition.source_scope),
      key: text(source.key || definition.sourceKey || definition.source_key)
    },
    policy: isRecord(definition.policy) ? definition.policy : null
  };
}

function normalizedAlias(alias) {
  return {
    ...alias,
    id: text(alias.id),
    rawAlias: text(alias.rawAlias || alias.raw_alias),
    normalizedAlias: text(alias.normalizedAlias || alias.normalized_alias),
    target: text(alias.target || alias.target_stat_id),
    context: text(alias.context || alias.context_key) || 'general',
    allowedUnits: Array.isArray(alias.allowedUnits || alias.allowed_units)
      ? [...(alias.allowedUnits || alias.allowed_units)]
      : [],
    allowedOperations: Array.isArray(alias.allowedOperations || alias.allowed_operations)
      ? [...(alias.allowedOperations || alias.allowed_operations)]
      : [],
    definitionVersion: Number(alias.definitionVersion || alias.definition_version || 1),
    version: Number(alias.version || 1),
    state: text(alias.state)
  };
}

function normalizedCondition(condition) {
  const id = text(condition.id || condition.key || condition.slug);
  return {
    ...condition,
    id,
    label: text(condition.label || condition.name) || id
  };
}

function emptyValues(rarities = state.rarities) {
  return Object.fromEntries(rarities.map(rarity => [rarity.slug, null]));
}

function normalizedValues(values, rarities = state.rarities) {
  const source = isRecord(values) ? values : {};
  return Object.fromEntries(rarities.map(rarity => [
    rarity.slug,
    Object.prototype.hasOwnProperty.call(source, rarity.slug)
      ? finiteOrNull(source[rarity.slug])
      : null
  ]));
}

function normalizedRarityEvidence(value, rarities = state.rarities) {
  const source = isRecord(value) ? value : {};
  const evidence = {};
  for (const rarity of rarities) {
    const item = isRecord(source[rarity.slug]) ? source[rarity.slug] : null;
    if (!item) continue;
    const originalText = text(item.originalText || item.original_text);
    const sourceImageReference = text(
      item.sourceImageReference || item.source_image_reference
    ) || null;
    const observedUnit = text(item.observedUnit || item.observed_unit) || null;
    if (!originalText && !sourceImageReference && !observedUnit) continue;
    evidence[rarity.slug] = { originalText, sourceImageReference, observedUnit };
  }
  return evidence;
}

function normalizedEffect(effect, index = 0, rarities = state.rarities) {
  const kind = ['numeric', 'informational', 'unresolved'].includes(effect?.kind)
    ? effect.kind
    : 'unresolved';
  const condition = text(effect?.condition) || 'always';
  const scope = effect?.scope === 'team' ? 'team' : 'self';
  return {
    id: text(effect?.id) || crypto.randomUUID(),
    kind,
    description: text(effect?.description),
    originalText: text(effect?.originalText || effect?.original_text || effect?.description),
    normalizedText: text(effect?.normalizedText || effect?.normalized_text)
      || normalizeCalculationEffectLabel(effect?.description),
    observedUnit: text(effect?.observedUnit || effect?.observed_unit) || null,
    semanticContext: text(effect?.semanticContext || effect?.semantic_context) || null,
    resolvedAliasId: text(effect?.resolvedAliasId || effect?.resolved_alias_id) || null,
    definitionVersion: Number(effect?.definitionVersion || effect?.definition_version || 0) || null,
    resolutionStatus: text(effect?.resolutionStatus || effect?.resolution_status) || 'pending_alias',
    sourceImageReference: text(effect?.sourceImageReference || effect?.source_image_reference) || null,
    rarityEvidence: normalizedRarityEvidence(
      effect?.rarityEvidence || effect?.rarity_evidence,
      rarities
    ),
    target: text(effect?.target) || null,
    operation: ['flat', 'percent'].includes(effect?.operation) ? effect.operation : null,
    scope,
    condition,
    conditionExpected: condition === 'always'
      ? null
      : typeof effect?.conditionExpected === 'boolean'
        ? effect.conditionExpected
        : true,
    evaluatedOn: scope === 'self'
      ? 'source'
      : ['source', 'recipient'].includes(effect?.evaluatedOn)
        ? effect.evaluatedOn
        : 'source',
    sourceKind: text(effect?.sourceKind) || null,
    sourceReference: text(effect?.sourceReference) || null,
    order: Number.isInteger(effect?.order) ? effect.order : index,
    values: kind === 'numeric' ? normalizedValues(effect?.values, rarities) : emptyValues(rarities)
  };
}

function blankEffect(order = 0) {
  const id = crypto.randomUUID();
  return normalizedEffect({
    id,
    kind: 'numeric',
    description: '',
    target: null,
    operation: null,
    scope: 'self',
    condition: 'always',
    conditionExpected: null,
    evaluatedOn: 'source',
    ...adminObservationSource(id),
    order,
    values: emptyValues()
  }, order);
}

function activeEffects() {
  return state.effects.filter(effect => effect.id !== state.starterEffectId);
}

function ensureStarterEffect() {
  if (state.effects.length) return;
  const starter = blankEffect();
  state.effects = [starter];
  state.starterEffectId = starter.id;
}

function activateStarter(effectId) {
  if (effectId === state.starterEffectId) state.starterEffectId = null;
}

function normalizeWorkspace(payload) {
  const workspace = isRecord(payload) ? payload : {};
  const rarities = normalizedRarities(workspace.rarities);
  const catalogCompatible = Array.isArray(workspace.definitions)
    && workspace.definitions.length > 0
    && Array.isArray(workspace.aliases)
    && Array.isArray(workspace.contexts)
    && Array.isArray(workspace.operations)
    && workspace.operations.length > 0;
  return {
    contract: text(workspace.contract),
    equipment: isRecord(workspace.equipment) ? workspace.equipment : null,
    revision: Number.isSafeInteger(Number(workspace.revision)) ? Number(workspace.revision) : 0,
    effects: Array.isArray(workspace.effects)
      ? workspace.effects.map((effect, index) => normalizedEffect(effect, index, rarities))
      : [],
    definitions: Array.isArray(workspace.definitions)
      ? workspace.definitions.map(normalizedDefinition).filter(definition => definition.id)
      : [],
    aliases: Array.isArray(workspace.aliases)
      ? workspace.aliases.map(normalizedAlias).filter(alias => alias.id && alias.normalizedAlias)
      : [],
    contexts: Array.isArray(workspace.contexts) ? workspace.contexts : [],
    operations: Array.isArray(workspace.operations) ? workspace.operations : [],
    definitionDrafts: Array.isArray(workspace.definitionDrafts) ? workspace.definitionDrafts : [],
    reprocessPlans: Array.isArray(workspace.reprocessPlans) ? workspace.reprocessPlans : [],
    conditions: Array.isArray(workspace.conditions)
      ? workspace.conditions.map(normalizedCondition).filter(condition => condition.id && condition.id !== 'always')
      : [],
    rarities,
    permissions: isRecord(workspace.permissions)
      ? { edit: workspace.permissions.edit === true, publish: workspace.permissions.publish === true }
      : { edit: false, publish: false },
    published: isRecord(workspace.published) ? workspace.published : null,
    catalogCompatible
  };
}

function canonicalEffect(effect, rarities = state.rarities) {
  const kind = effect.kind;
  const target = kind === 'numeric' || kind === 'unresolved' ? text(effect.target) || null : null;
  const resolutionStatus = text(effect.resolutionStatus) || 'pending_alias';
  const hasPublishedBinding = Boolean(target && resolutionStatus === 'resolved');
  const values = kind === 'numeric'
    ? Object.fromEntries(rarities.map(rarity => [rarity.slug, effect.values?.[rarity.slug] ?? null]))
    : emptyValues(rarities);
  return {
    id: text(effect.id).toLowerCase(),
    kind,
    description: text(effect.description),
    originalText: text(effect.originalText || effect.description),
    normalizedText: text(effect.normalizedText) || normalizeCalculationEffectLabel(effect.description),
    observedUnit: text(effect.observedUnit)
      || (kind === 'numeric' && effect.operation === 'percent'
        ? 'percent'
        : kind === 'numeric' && effect.operation
          ? 'implicit'
          : null),
    semanticContext: text(effect.semanticContext) || null,
    resolvedAliasId: hasPublishedBinding ? text(effect.resolvedAliasId) || null : null,
    definitionVersion: hasPublishedBinding ? Number(effect.definitionVersion || 0) || null : null,
    resolutionStatus,
    sourceImageReference: text(effect.sourceImageReference) || null,
    rarityEvidence: normalizedRarityEvidence(effect.rarityEvidence, rarities),
    target,
    operation: kind === 'numeric' ? effect.operation : null,
    scope: effect.scope,
    condition: effect.condition || 'always',
    conditionExpected: effect.condition === 'always' ? null : effect.conditionExpected,
    evaluatedOn: effect.scope === 'self' ? 'source' : effect.evaluatedOn,
    sourceKind: text(effect.sourceKind) || null,
    sourceReference: text(effect.sourceReference) || null,
    order: effect.order,
    values
  };
}

function canonicalEffects(effects, rarities = state.rarities) {
  return [...effects]
    .map(effect => canonicalEffect(effect, rarities))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

function calculationCoverageWorkspace() {
  return {
    contract: CONTRACT_ID,
    equipment: state.equipment,
    revision: state.revision,
    state: publishedMatchesWorkspace() ? 'published' : activeEffects().length ? 'draft' : 'empty',
    effects: canonicalEffects(activeEffects(), state.rarities),
    definitions: state.definitions,
    aliases: state.aliases,
    contexts: state.contexts,
    operations: state.operations,
    published: state.published
  };
}

function broadcastCalculationCoverage() {
  if (!state.mount) return;
  window.dispatchEvent(new CustomEvent('equipment:calculation-v2-coverage-changed', {
    detail: {
      equipmentId: state.equipmentId,
      workspace: calculationCoverageWorkspace()
    }
  }));
}

function sameSemantics(left, right, rarities = state.rarities) {
  return JSON.stringify(canonicalEffects(left, rarities)) === JSON.stringify(canonicalEffects(right, rarities));
}

function publishedMatchesWorkspace() {
  return Boolean(
    state.published
    && Number(state.published.workspaceRevision) === state.revision
    && !state.dirty
  );
}

function setMessage(message, tone = 'info') {
  const output = state.mount?.querySelector('[data-calculation-v2-message]');
  if (!output) return;
  output.dataset.tone = tone;
  output.textContent = message;
}

function setBusy(busy) {
  state.busy = busy;
  for (const control of state.mount?.querySelectorAll('button, input, select, textarea') || []) {
    if (control.matches('[data-preview-control]')) {
      const noEligibleHero = control.matches('[data-preview-hero]')
        && eligiblePreviewHeroes(state.equipment, state.heroes).length === 0;
      control.disabled = busy || noEligibleHero;
      continue;
    }
    if (control.matches('[data-action="save"]')) {
      control.disabled = busy || !state.equipmentId || !state.permissions.edit;
      continue;
    }
    if (control.matches('[data-action="publish"]')) {
      control.disabled = busy || !state.catalogCompatible || !state.equipmentId || !state.permissions.publish || state.dirty;
      continue;
    }
    if (control.matches('[data-action="confirm"]')) {
      control.disabled = busy || !state.catalogCompatible || !state.equipmentId || !state.permissions.publish;
      continue;
    }
    if (control.matches('[data-action="add"], [data-action="apply-import"]')) {
      control.disabled = busy || !state.permissions.edit;
      continue;
    }
    if (control.closest('[data-effect-card]')) control.disabled = busy || !state.permissions.edit;
  }
}

function renderWorkspaceState() {
  const badge = state.mount?.querySelector('[data-workspace-state]');
  const revision = state.mount?.querySelector('[data-workspace-revision]');
  const publication = state.mount?.querySelector('[data-publication-state]');
  if (revision) revision.textContent = `Revisão do rascunho: ${state.revision}`;
  if (badge) {
    badge.className = 'calculation-v2-state';
    if (!state.catalogCompatible) {
      badge.classList.add('is-dirty');
      badge.textContent = 'Catálogo incompatível';
    } else if (publishedMatchesWorkspace()) {
      badge.classList.add('is-published');
      badge.textContent = 'Publicado';
    } else if (state.dirty) {
      badge.classList.add('is-dirty');
      badge.textContent = 'Alterações não salvas';
    } else {
      badge.classList.add('is-draft');
      badge.textContent = 'Rascunho · fora do cálculo público';
    }
  }
  if (publication) {
    if (!state.catalogCompatible) {
      publication.textContent = 'Catálogo semântico indisponível ou incompatível neste ambiente.';
    } else if (!state.published) {
      publication.textContent = 'Este equipamento ainda não possui uma publicação de cálculo.';
    } else if (publishedMatchesWorkspace()) {
      publication.textContent = `Publicação atual confirmada${displayDate(state.published.publishedAt) ? ` em ${displayDate(state.published.publishedAt)}` : ''}.`;
    } else {
      publication.textContent = `Publicação desatualizada: o rascunho está na revisão ${state.revision} e a publicação ativa na revisão ${Number(state.published.workspaceRevision)}.`;
    }
  }
  setBusy(state.busy);
}

function definitionOptions() {
  return state.definitions
    .map(definition => {
      const label = definition.label;
      const context = definition.source?.scope === 'hero' ? 'herói' : 'arma';
      const alreadyContextual = new RegExp(`\\b${context}\\b`, 'i').test(label);
      return { value: definition.id, label: alreadyContextual ? label : `${label} · ${context}` };
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'));
}

function operationOptions() {
  const catalog = (Array.isArray(state.operations) ? state.operations : [])
    .filter(operation => operation.state === 'published' || operation.enabled !== false)
    .map(operation => ({
      value: text(operation.id || operation.key),
      label: text(operation.label || operation.name || operation.id || operation.key)
    }))
    .filter(operation => operation.value);
  return catalog.length ? catalog : [...OPERATIONS];
}

function conditionOptions() {
  return [
    { value: 'always', label: 'Sempre ativo' },
    ...state.conditions.map(condition => ({ value: condition.id, label: condition.label }))
  ];
}

function labelledField(labelText, name, control, wide = false) {
  const label = document.createElement('label');
  label.className = `calculation-v2-field${wide ? ' is-wide' : ''}`;
  const title = document.createElement('span');
  title.textContent = labelText;
  control.dataset.effectField = name;
  label.append(title, control);
  return label;
}

function selectControl(options, current, placeholder = null) {
  const select = document.createElement('select');
  fillSelect(select, options, current, placeholder);
  return select;
}

function sourceStatus(effect) {
  if (effect.sourceKind === 'official' && effect.sourceReference) return 'Origem oficial confirmada';
  if (effect.sourceKind === 'game_capture' && effect.sourceReference) return 'Coleta do jogo registrada';
  if (effect.sourceKind && effect.sourceReference) return 'Origem registrada';
  return 'Origem pendente';
}

function effectStateText() {
  if (publishedMatchesWorkspace()) return 'Publicado · entra no cálculo público';
  return 'Rascunho · fora do cálculo público';
}

function optionLabel(options, value, fallback = 'Ainda não reconhecido') {
  return options.find(option => option.value === value)?.label || fallback;
}

function effectNeedsCorrection(effect) {
  return !text(effect.description)
    || effect.kind !== 'numeric'
    || !effect.target
    || !effect.operation
    || !effect.sourceKind
    || !effect.sourceReference
    || (effect.kind === 'numeric' && !Object.values(effect.values || {}).some(Number.isFinite))
    || state.ocrTextReviewIds.has(effect.id);
}

function refreshAutoConfirmEligibility() {
  state.autoConfirmAfterEquipmentSave = activeEffects().length > 0
    && activeEffects().every(effect => !effectNeedsCorrection(effect) && effect.sourceKind === 'game_capture');
}

function effectSummary(effect) {
  if (effectNeedsCorrection(effect)) {
    const status = effect.resolutionStatus;
    if (!effect.target && ['pending_alias', 'formula_unpublished'].includes(status)) {
      return {
        status: status === 'formula_unpublished' ? 'Fórmula ainda não publicada' : 'Status ainda não cadastrado',
        text: 'O texto e os valores foram preservados. Os demais efeitos continuam calculáveis.'
      };
    }
    if (effect.target && !effect.resolvedAliasId) {
      return {
        status: 'Nova frase para status conhecido',
        text: 'Confira contexto, unidade e operação; depois publique o alias central.'
      };
    }
    return {
      status: 'Revisão necessária',
      text: effect.target
        ? `${optionLabel(definitionOptions(), effect.target)} · complete o que está pendente`
        : 'O texto não corresponde a um status conhecido. Abra Corrigir.'
    };
  }
  const origin = effect.sourceKind === 'game_capture'
    ? 'captura do jogo'
    : effect.sourceKind === 'official'
      ? 'fonte oficial ZeptoLab'
      : 'registro administrativo';
  return {
    status: 'Reconhecido automaticamente',
    text: `${optionLabel(definitionOptions(), effect.target)} · ${optionLabel(operationOptions(), effect.operation)} · ${origin}`
  };
}

function syncEffectSummary(card, effect) {
  const summary = effectSummary(effect);
  const status = card.querySelector('[data-recognition-status]');
  const copy = card.querySelector('[data-effect-summary]');
  if (status) {
    status.textContent = summary.status;
    status.classList.toggle('is-ready', !effectNeedsCorrection(effect));
    status.classList.toggle('is-pending', effectNeedsCorrection(effect));
  }
  if (copy) copy.textContent = summary.text;
  const box = card.querySelector('.calculation-v2-recognition-summary');
  if (box) {
    const pending = effectNeedsCorrection(effect);
    box.classList.toggle('is-pending', pending);
    const icon = box.querySelector('[data-recognition-icon]');
    if (icon) icon.textContent = pending ? '!' : '✓';
  }
}

function syncEffectCardVisibility(card, effect) {
  const numeric = effect.kind === 'numeric';
  const unresolved = effect.kind === 'unresolved';
  for (const node of card.querySelectorAll('[data-only-numeric]')) node.hidden = !numeric;
  for (const node of card.querySelectorAll('[data-target-field]')) node.hidden = !(numeric || unresolved);
  const expected = card.querySelector('[data-expected-field]');
  if (expected) expected.hidden = effect.condition === 'always';
  const evaluated = card.querySelector('[data-evaluated-field]');
  if (evaluated) {
    evaluated.hidden = effect.scope !== 'team';
    const select = evaluated.querySelector('select');
    if (select && effect.scope === 'self') select.value = 'source';
  }
  const sourceHint = card.querySelector('[data-source-state]');
  if (sourceHint) sourceHint.textContent = sourceStatus(effect);
  syncEffectSummary(card, effect);
}

function effectFromCard(card, fallback) {
  const read = name => card.querySelector(`[data-effect-field="${name}"]`);
  const kind = read('kind')?.value || 'unresolved';
  const condition = read('condition')?.value || 'always';
  const scope = read('scope')?.value === 'team' ? 'team' : 'self';
  const values = Object.fromEntries(state.rarities.map(rarity => [
    rarity.slug,
    parseNullableNumber(card.querySelector(`[data-rarity-value="${rarity.slug}"]`)?.value)
  ]));
  const description = text(read('description')?.value);
  return {
    id: fallback.id,
    kind,
    description,
    originalText: text(fallback.originalText || description),
    normalizedText: normalizeCalculationEffectLabel(description),
    observedUnit: text(fallback.observedUnit) || null,
    semanticContext: text(fallback.semanticContext) || null,
    resolvedAliasId: text(fallback.resolvedAliasId) || null,
    definitionVersion: Number(fallback.definitionVersion || 0) || null,
    resolutionStatus: text(fallback.resolutionStatus) || 'pending_alias',
    sourceImageReference: text(fallback.sourceImageReference) || null,
    rarityEvidence: normalizedRarityEvidence(fallback.rarityEvidence),
    target: kind === 'numeric' || kind === 'unresolved' ? text(read('target')?.value) || null : null,
    operation: kind === 'numeric' ? read('operation')?.value || null : null,
    scope,
    condition,
    conditionExpected: condition === 'always' ? null : read('conditionExpected')?.value === 'true',
    evaluatedOn: scope === 'self' ? 'source' : read('evaluatedOn')?.value || 'source',
    sourceKind: text(read('sourceKind')?.value) || null,
    sourceReference: text(read('sourceReference')?.value) || null,
    order: fallback.order,
    values: kind === 'numeric' ? values : emptyValues()
  };
}

function refreshEffectsFromDom() {
  const cards = [...(state.mount?.querySelectorAll('[data-effect-card]') || [])];
  if (!cards.length && state.effects.length) return;
  state.effects = cards.map((card, index) => {
    const previous = state.effects.find(effect => effect.id === card.dataset.effectId) || { id: card.dataset.effectId, order: index };
    return { ...effectFromCard(card, previous), order: index };
  });
}

function markDirty(message = 'Alteração local ainda não salva.') {
  if (!state.dirty) state.dirty = true;
  state.lastVerifiedRevision = null;
  renderWorkspaceState();
  setMessage(message, 'warning');
}

function updatePendingImportButton() {
  const button = state.mount?.querySelector('[data-action="apply-import"]');
  if (!button) return;
  const count = state.pendingImport?.effects?.length || 0;
  button.hidden = count === 0;
  button.textContent = count ? `Adicionar leitura (${count})` : 'Adicionar leitura';
}

function importMessage(result, prefix) {
  const review = result.warnings.find(warning => /incompleto|incompatíveis/i.test(warning));
  return `${prefix} ${result.effects.length} efeito(s), ${result.importedValueCount} valor(es) e ${result.rarityCount}/11 raridades. ` +
    (result.pendingEffectCount
      ? `${result.recognizedEffectCount} reconhecido(s); ${result.pendingEffectCount} precisa(m) de correção antes da publicação.`
      : 'Todos os vínculos foram reconhecidos e estão prontos para confirmação.') +
    (review ? ` Atenção: ${review}` : '');
}

function applyImportedDraft(draft, { append = false } = {}) {
  const result = createCalculationEffectsFromImport(draft, {
    rarities: state.rarities,
    definitions: state.definitions,
    aliases: state.aliases
  });
  if (!result.effects.length) {
    state.pendingImport = null;
    updatePendingImportButton();
    ensureStarterEffect();
    renderEffects();
    setMessage('A leitura não trouxe linhas numéricas completas para o cálculo. Os campos permaneceram vazios.', 'warning');
    return false;
  }

  const current = activeEffects();
  if (current.length && !append) {
    state.pendingImport = result;
    updatePendingImportButton();
    setMessage(importMessage(result, 'Leitura pronta para revisão.'), 'warning');
    return false;
  }

  const combined = append ? [...current, ...result.effects] : result.effects;
  if (!append) state.ocrTextReviewIds.clear();
  for (const effect of result.effects) {
    if (effect.needsTextReview) state.ocrTextReviewIds.add(effect.id);
  }
  state.effects = combined.map((effect, index) => normalizedEffect({ ...effect, order: index }, index));
  state.starterEffectId = null;
  state.pendingImport = null;
  state.dirty = true;
  state.autoConfirmAfterEquipmentSave = result.pendingEffectCount === 0
    && result.effects.every(effect => effect.sourceKind === 'game_capture');
  state.lastVerifiedRevision = null;
  renderEffects();
  updatePendingImportButton();
  refreshPreviewConditionControls();
  renderPreview();
  setMessage(importMessage(result, append ? 'Leitura adicionada ao rascunho.' : 'Leitura aplicada ao rascunho.'), 'warning');
  return true;
}

function applyPendingImport() {
  if (!state.pendingImport?.effects?.length) return;
  const pending = state.pendingImport;
  const current = activeEffects();
  for (const effect of pending.effects) {
    if (effect.needsTextReview) state.ocrTextReviewIds.add(effect.id);
  }
  state.effects = [...current, ...pending.effects]
    .map((effect, index) => normalizedEffect({ ...effect, order: index }, index));
  state.starterEffectId = null;
  state.pendingImport = null;
  state.autoConfirmAfterEquipmentSave = activeEffects().every(effect => (
    !effectNeedsCorrection(effect) && effect.sourceKind === 'game_capture'
  ));
  markDirty(importMessage(pending, 'Leitura adicionada ao rascunho.'));
  renderEffects();
  updatePendingImportButton();
  refreshPreviewConditionControls();
  renderPreview();
}

function schedulePreview() {
  cancelAnimationFrame(schedulePreview.frame);
  schedulePreview.frame = requestAnimationFrame(() => {
    refreshPreviewConditionControls();
    renderPreview();
    broadcastCalculationCoverage();
  });
}

schedulePreview.frame = 0;

function createRarityTable(effect) {
  const wrapper = document.createElement('div');
  wrapper.className = 'calculation-v2-values';
  wrapper.dataset.onlyNumeric = '';
  const title = document.createElement('strong');
  title.textContent = 'Valores por raridade';
  const help = document.createElement('p');
  help.textContent = 'Vazio significa desconhecido. Zero só é salvo quando você digita 0.';
  const scroller = document.createElement('div');
  scroller.className = 'calculation-v2-table-scroll';
  const table = document.createElement('table');
  table.className = 'calculation-v2-rarity-table';
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const rarity of state.rarities) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = rarity.name;
    headRow.append(th);
  }
  head.append(headRow);
  const body = document.createElement('tbody');
  const valueRow = document.createElement('tr');
  for (const rarity of state.rarities) {
    const td = document.createElement('td');
    td.dataset.rarity = rarity.name;
    const label = document.createElement('label');
    label.className = 'calculation-v2-rarity-input';
    const visuallyHidden = document.createElement('span');
    visuallyHidden.className = 'calculation-v2-sr-only';
    visuallyHidden.textContent = `Valor ${rarity.name}`;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.inputMode = 'decimal';
    input.dataset.rarityValue = rarity.slug;
    const current = effect.values?.[rarity.slug];
    input.value = typeof current === 'number' && Number.isFinite(current) ? String(current) : '';
    label.append(visuallyHidden, input);
    td.append(label);
    valueRow.append(td);
  }
  body.append(valueRow);
  table.append(head, body);
  scroller.append(table);
  wrapper.append(title, help, scroller);
  return wrapper;
}

function sourceOptionsForEffect(effect) {
  return SOURCE_KINDS.filter(option => (
    !['game_capture', 'official', 'developer_statement'].includes(option.value)
    || effect.sourceKind === option.value
  ));
}

function internalSourceReference(kind, effect, currentReference = '') {
  if (kind === effect.sourceKind && text(currentReference)) return text(currentReference);
  if (kind === 'official' || kind === 'developer_statement' || kind === 'game_capture') return '';
  if (kind === 'admin_observation') return `admin-entry:${effect.id}`;
  if (kind === 'other') return `admin-other:${effect.id}`;
  return '';
}

function catalogContextOptions(current = '') {
  const options = (Array.isArray(state.contexts) ? state.contexts : [])
    .map(context => ({
      value: text(context.id || context.key),
      label: text(context.label || context.name || context.id || context.key)
    }))
    .filter(option => option.value);
  if (current && !options.some(option => option.value === current)) {
    options.push({ value: current, label: current });
  }
  return options;
}

function semanticReview(effect) {
  const panel = document.createElement('details');
  panel.className = 'calculation-v2-semantic-review';
  panel.dataset.semanticReview = '';
  panel.open = effect.resolutionStatus !== 'resolved';
  const title = document.createElement('summary');
  title.textContent = 'Catálogo central e reprocessamento';
  const body = document.createElement('div');
  body.className = 'calculation-v2-semantic-body';

  const evidence = document.createElement('div');
  evidence.className = 'calculation-v2-semantic-evidence';
  const original = document.createElement('p');
  original.textContent = `Original: ${effect.originalText || effect.description || '—'}`;
  const normalized = document.createElement('p');
  normalized.textContent = `Normalizado: ${effect.normalizedText || normalizeCalculationEffectLabel(effect.description) || '—'}`;
  const image = document.createElement('p');
  image.textContent = `Imagem: ${effect.sourceImageReference || 'não informada'}`;
  evidence.append(original, normalized, image);
  const rarityEvidence = Object.entries(effect.rarityEvidence || {});
  if (rarityEvidence.length) {
    const rarityList = document.createElement('ul');
    rarityList.className = 'calculation-v2-semantic-rarity-evidence';
    for (const [slug, item] of rarityEvidence) {
      const rarity = state.rarities.find(candidate => candidate.slug === slug);
      const row = document.createElement('li');
      row.textContent = `${rarity?.name || slug}: ${item.originalText || 'texto não informado'} · `
        + `${item.sourceImageReference || 'imagem não informada'}`;
      rarityList.append(row);
    }
    evidence.append(rarityList);
  }

  const fields = document.createElement('div');
  fields.className = 'calculation-v2-semantic-grid';
  const context = selectControl(
    catalogContextOptions(effect.semanticContext),
    effect.semanticContext,
    'Escolha o contexto'
  );
  context.dataset.semanticField = 'context';
  fields.append(labelledField('Contexto semântico', '', context));

  const unit = document.createElement('input');
  unit.value = effect.observedUnit || '';
  unit.placeholder = 'percent, degree, second, point, factor…';
  unit.dataset.semanticField = 'unit';
  fields.append(labelledField('Unidade observada', '', unit));

  const definitionKey = document.createElement('input');
  definitionKey.placeholder = 'weapon.nova_mecanica';
  definitionKey.dataset.semanticField = 'definitionKey';
  fields.append(labelledField('Nova chave canônica', '', definitionKey));

  const sourceKey = document.createElement('input');
  sourceKey.placeholder = 'nova_mecanica';
  sourceKey.dataset.semanticField = 'sourceKey';
  fields.append(labelledField('Chave da base mecânica', '', sourceKey));

  const definitionName = document.createElement('input');
  definitionName.placeholder = effect.description || 'Nome apresentado';
  definitionName.dataset.semanticField = 'definitionName';
  fields.append(labelledField('Nome apresentado', '', definitionName));

  const direction = selectControl([
    { value: 'higher', label: 'Maior é favorável' },
    { value: 'lower', label: 'Menor é favorável' },
    { value: 'neutral', label: 'Neutro/depende do caso' }
  ], 'neutral');
  direction.dataset.semanticField = 'direction';
  fields.append(labelledField('Direção favorável', '', direction));

  const metricKind = selectControl([
    { value: 'direct', label: 'Atributo direto' },
    { value: 'derived', label: 'Métrica derivada' }
  ], 'direct');
  metricKind.dataset.semanticField = 'metricKind';
  fields.append(labelledField('Tipo mecânico', '', metricKind));

  const defaultBase = document.createElement('input');
  defaultBase.type = 'number';
  defaultBase.step = 'any';
  defaultBase.placeholder = 'Opcional';
  defaultBase.dataset.semanticField = 'defaultBase';
  fields.append(labelledField('Base neutra comprovada', '', defaultBase));

  const policyReference = document.createElement('textarea');
  policyReference.rows = 2;
  policyReference.placeholder = 'Evidência e descrição da fórmula comprovada';
  policyReference.dataset.semanticField = 'policyReference';
  fields.append(labelledField('Fórmula comprovada', '', policyReference, true));

  const actions = document.createElement('div');
  actions.className = 'calculation-v2-semantic-actions';
  const publishAlias = document.createElement('button');
  publishAlias.type = 'button';
  publishAlias.className = 'admin-button';
  publishAlias.dataset.action = 'publish-alias';
  publishAlias.textContent = 'Publicar frase como alias';
  publishAlias.disabled = !effect.target;
  const saveAliasDraft = document.createElement('button');
  saveAliasDraft.type = 'button';
  saveAliasDraft.className = 'admin-button';
  saveAliasDraft.dataset.action = 'save-alias-draft';
  saveAliasDraft.textContent = 'Salvar vínculo pendente';
  saveAliasDraft.disabled = !effect.target;
  const createDefinition = document.createElement('button');
  createDefinition.type = 'button';
  createDefinition.className = 'admin-button';
  createDefinition.dataset.action = 'create-definition-draft';
  createDefinition.textContent = 'Cadastrar mecânica nova';
  const publishDefinition = document.createElement('button');
  publishDefinition.type = 'button';
  publishDefinition.className = 'admin-button';
  publishDefinition.dataset.action = 'publish-definition';
  publishDefinition.textContent = 'Publicar mecânica comprovada';
  actions.append(saveAliasDraft, publishAlias, createDefinition, publishDefinition);

  body.append(evidence, fields, actions);
  panel.append(title, body);
  return panel;
}

function semanticField(card, name) {
  return text(card.querySelector(`[data-semantic-field="${name}"]`)?.value);
}

async function publishAliasForCard(card, effectId) {
  refreshEffectsFromDom();
  const effect = state.effects.find(item => item.id === effectId);
  if (!effect?.target || !effect.operation) {
    setMessage('Escolha o atributo e a operação antes de publicar o alias.', 'error');
    return;
  }
  const context = semanticField(card, 'context') || effect.semanticContext;
  const unit = semanticField(card, 'unit') || effect.observedUnit;
  if (!context || !unit) {
    setMessage('Confira o contexto e a unidade antes de publicar o alias.', 'error');
    return;
  }
  setBusy(true);
  try {
    await rpc('admin_publish_calculation_alias_v2', {
      p_raw_alias: effect.description,
      p_target_stat_id: effect.target,
      p_context_key: context,
      p_allowed_units: [unit],
      p_allowed_operations: [effect.operation],
      p_evidence_reference: effect.sourceReference,
      p_reason: 'editor-calculation-alias-v2'
    });
    const workspace = await readWorkspace();
    applyWorkspace(workspace, { preserveEffects: true });
    const local = state.effects.find(item => item.id === effectId);
    if (local) {
      const resolution = resolveCalculationAlias({
        description: local.description,
        operation: local.operation,
        unit,
        context
      }, { definitions: state.definitions, aliases: state.aliases });
      Object.assign(local, {
        target: resolution.target,
        normalizedText: resolution.normalized,
        observedUnit: resolution.observedUnit,
        semanticContext: resolution.context,
        resolvedAliasId: resolution.aliasId,
        definitionVersion: resolution.definitionVersion,
        resolutionStatus: resolution.status
      });
    }
    state.dirty = true;
    renderEffects();
    renderReprocessPlans();
    renderPreview();
    setMessage('Alias publicado no catálogo. A atualização retroativa permanece apenas em prévia até confirmação.', 'success');
  } catch (error) {
    setMessage(error.message || 'Não foi possível publicar o alias.', 'error');
  } finally {
    setBusy(false);
  }
}

async function saveAliasDraftForCard(card, effectId) {
  refreshEffectsFromDom();
  const effect = state.effects.find(item => item.id === effectId);
  const context = semanticField(card, 'context') || effect?.semanticContext;
  const unit = semanticField(card, 'unit') || effect?.observedUnit;
  if (!effect?.target || !effect.operation || !context || !unit) {
    setMessage('Escolha atributo, contexto, unidade e operação para salvar o vínculo pendente.', 'error');
    return;
  }
  setBusy(true);
  try {
    await rpc('admin_save_calculation_alias_draft_v2', {
      p_raw_alias: effect.description,
      p_target_stat_id: effect.target,
      p_context_key: context,
      p_allowed_units: [unit],
      p_allowed_operations: [effect.operation],
      p_evidence_reference: effect.sourceReference,
      p_reason: 'editor-pending-calculation-alias-v2'
    });
    const workspace = await readWorkspace();
    applyWorkspace(workspace, { preserveEffects: true });
    renderEffects();
    renderPreview();
    setMessage('Vínculo salvo como pendente. Ele não será usado por importações nem cálculos.', 'success');
  } catch (error) {
    setMessage(error.message || 'Não foi possível salvar o vínculo pendente.', 'error');
  } finally {
    setBusy(false);
  }
}

async function createDefinitionDraftForCard(card, effectId) {
  refreshEffectsFromDom();
  const effect = state.effects.find(item => item.id === effectId);
  const key = semanticField(card, 'definitionKey');
  const label = semanticField(card, 'definitionName') || effect?.description;
  const sourceKey = semanticField(card, 'sourceKey');
  const context = semanticField(card, 'context');
  const unit = semanticField(card, 'unit') || effect?.observedUnit;
  const defaultBaseRaw = semanticField(card, 'defaultBase');
  const defaultBase = defaultBaseRaw ? Number(defaultBaseRaw) : null;
  if (!key || !label || !sourceKey || !context || !unit || !effect?.operation
    || (defaultBaseRaw && !Number.isFinite(defaultBase))) {
    setMessage('Preencha chave, base mecânica, nome, contexto, unidade e operação para salvar a nova mecânica.', 'error');
    return;
  }
  setBusy(true);
  try {
    const created = await rpc('admin_create_calculation_definition_draft_v2', {
      p_canonical_key: key,
      p_display_name: label,
      p_scope: key.split('.')[0],
      p_source_key: sourceKey,
      p_context_key: context,
      p_unit: unit,
      p_value_type: 'decimal',
      p_direction: semanticField(card, 'direction') || 'neutral',
      p_allowed_operations: [effect.operation],
      p_internal_precision: 8,
      p_display_precision: 2,
      p_metric_kind: semanticField(card, 'metricKind') || 'direct',
      p_default_base: defaultBase,
      p_evidence_reference: effect.sourceReference,
      p_reason: 'editor-new-calculation-mechanic-v2'
    });
    card.dataset.definitionDraftId = text(created?.id);
    const workspace = await readWorkspace();
    applyWorkspace(workspace, { preserveEffects: true });
    renderEffects();
    renderPreview();
    setMessage('Mecânica salva como rascunho. Nenhuma fórmula foi inventada e o efeito continua pendente.', 'success');
  } catch (error) {
    setMessage(error.message || 'Não foi possível salvar a mecânica nova.', 'error');
  } finally {
    setBusy(false);
  }
}

async function publishDefinitionForCard(card, effectId) {
  const key = semanticField(card, 'definitionKey');
  const policyReference = semanticField(card, 'policyReference');
  const draft = [...state.definitionDrafts]
    .filter(item => item.canonicalKey === key && ['draft', 'reviewed'].includes(item.state))
    .sort((left, right) => Number(right.version) - Number(left.version))[0];
  if (!draft || !policyReference) {
    setMessage('Salve a mecânica como rascunho e informe a fórmula comprovada antes de publicar.', 'error');
    return;
  }
  setBusy(true);
  try {
    await rpc('admin_publish_calculation_definition_v2', {
      p_draft_id: draft.id,
      p_expected_version: draft.version,
      p_policy_reference: policyReference,
      p_reason: 'editor-publish-calculation-mechanic-v2'
    });
    const workspace = await readWorkspace();
    applyWorkspace(workspace, { preserveEffects: true });
    const effect = state.effects.find(item => item.id === effectId);
    if (effect) {
      effect.target = key;
      effect.semanticContext = semanticField(card, 'context') || draft.context;
      effect.observedUnit = semanticField(card, 'unit') || draft.unit;
      effect.resolvedAliasId = null;
      effect.definitionVersion = Number(draft.version);
      effect.resolutionStatus = 'pending_alias';
    }
    state.dirty = true;
    renderEffects();
    renderPreview();
    setMessage('Mecânica e fórmula publicadas. Agora publique a frase como alias para autorizar o cálculo.', 'success');
  } catch (error) {
    setMessage(error.message || 'Não foi possível publicar a nova mecânica.', 'error');
  } finally {
    setBusy(false);
  }
}

function createEffectCard(effect, index) {
  const card = document.createElement('article');
  card.className = 'calculation-v2-effect';
  card.dataset.effectCard = '';
  card.dataset.effectId = effect.id;

  const header = document.createElement('header');
  const heading = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.className = 'calculation-v2-effect-number';
  eyebrow.textContent = `Efeito ${index + 1}`;
  const headingText = document.createElement('strong');
  headingText.textContent = effect.description || 'Novo efeito';
  heading.append(eyebrow, headingText);
  const actions = document.createElement('div');
  actions.className = 'calculation-v2-effect-actions';
  const status = document.createElement('span');
  status.className = 'calculation-v2-effect-state';
  status.dataset.recognitionStatus = '';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'admin-button calculation-v2-remove';
  remove.dataset.action = 'remove';
  remove.textContent = 'Remover';
  actions.append(status, remove);
  header.append(heading, actions);

  const description = document.createElement('textarea');
  description.rows = 2;
  description.value = effect.description;
  description.placeholder = 'Ex.: Armadura máxima do herói';
  const descriptionField = labelledField('Texto reconhecido na imagem', 'description', description, true);
  descriptionField.classList.add('calculation-v2-description');

  const summary = document.createElement('div');
  summary.className = 'calculation-v2-recognition-summary';
  const summaryIcon = document.createElement('span');
  summaryIcon.dataset.recognitionIcon = '';
  summaryIcon.setAttribute('aria-hidden', 'true');
  summaryIcon.textContent = '✓';
  const summaryCopy = document.createElement('p');
  summaryCopy.dataset.effectSummary = '';
  summary.append(summaryIcon, summaryCopy);

  const correction = document.createElement('details');
  correction.className = 'calculation-v2-correction';
  correction.dataset.correctionPanel = '';
  correction.open = effectNeedsCorrection(effect);
  const correctionTitle = document.createElement('summary');
  correctionTitle.textContent = 'Corrigir reconhecimento';
  const grid = document.createElement('div');
  grid.className = 'calculation-v2-effect-grid';

  const kind = selectControl(EFFECT_KINDS, effect.kind);
  const kindField = labelledField('Tipo interno', 'kind', kind);
  kindField.hidden = true;
  grid.append(kindField);

  const target = selectControl(definitionOptions(), effect.target, 'Escolha o status alterado');
  const targetField = labelledField('O que este efeito altera?', 'target', target);
  targetField.dataset.targetField = '';
  grid.append(targetField);

  const operation = selectControl(operationOptions(), effect.operation, 'Escolha como aplicar o valor');
  const operationField = labelledField('Como aplicar?', 'operation', operation);
  operationField.dataset.onlyNumeric = '';
  grid.append(operationField);

  const scope = selectControl(SCOPES, effect.scope);
  const scopeField = labelledField('Quem recebe o efeito?', 'scope', scope);

  const condition = selectControl(conditionOptions(), effect.condition);
  const conditionField = labelledField('Quando acontece?', 'condition', condition);

  const expected = selectControl([
    { value: 'true', label: 'Verdadeiro' },
    { value: 'false', label: 'Falso' }
  ], String(effect.conditionExpected));
  const expectedField = labelledField('A condição precisa estar', 'conditionExpected', expected);
  expectedField.dataset.expectedField = '';
  grid.append(expectedField);

  const evaluatedOn = selectControl([
    { value: 'source', label: 'Condição do portador' },
    { value: 'recipient', label: 'Condição de quem recebe' }
  ], effect.evaluatedOn);
  const evaluatedField = labelledField('Conferir a condição em', 'evaluatedOn', evaluatedOn);
  evaluatedField.dataset.evaluatedField = '';
  grid.append(evaluatedField);

  const sourceKind = selectControl(sourceOptionsForEffect(effect), effect.sourceKind, 'Escolha a origem');
  grid.append(labelledField('Origem dos dados', 'sourceKind', sourceKind, true));

  const sourceReference = document.createElement('input');
  sourceReference.type = 'hidden';
  sourceReference.value = effect.sourceReference || '';
  const sourceReferenceField = labelledField('Registro interno da coleta', 'sourceReference', sourceReference, true);
  sourceReferenceField.hidden = true;
  const sourceState = document.createElement('small');
  sourceState.dataset.sourceState = '';
  sourceReferenceField.append(sourceState);
  grid.append(sourceReferenceField);

  const special = document.createElement('details');
  special.className = 'calculation-v2-special-rule';
  const specialTitle = document.createElement('summary');
  specialTitle.textContent = 'Regra especial (opcional)';
  const specialGrid = document.createElement('div');
  specialGrid.className = 'calculation-v2-special-grid';
  specialGrid.append(scopeField, conditionField, expectedField, evaluatedField);
  special.append(specialTitle, specialGrid);
  grid.append(special);
  correction.append(correctionTitle, grid);

  card.append(header, descriptionField, summary);
  if (state.ocrTextReviewIds.has(effect.id)) {
    const review = document.createElement('label');
    review.className = 'calculation-v2-ocr-review';
    const confirmation = document.createElement('input');
    confirmation.type = 'checkbox';
    confirmation.dataset.reviewOcrText = '';
    const copy = document.createElement('span');
    copy.textContent = 'Texto da leitura incompleto. Corrigi a descrição acima e conferi a frase completa na imagem.';
    review.append(confirmation, copy);
    card.append(review);
  }
  card.append(createRarityTable(effect), correction, semanticReview(effect));

  card.addEventListener('click', event => {
    const action = event.target?.closest('[data-action]')?.dataset.action;
    if (action === 'publish-alias') {
      event.preventDefault();
      publishAliasForCard(card, effect.id);
    }
    if (action === 'save-alias-draft') {
      event.preventDefault();
      saveAliasDraftForCard(card, effect.id);
    }
    if (action === 'create-definition-draft') {
      event.preventDefault();
      createDefinitionDraftForCard(card, effect.id);
    }
    if (action === 'publish-definition') {
      event.preventDefault();
      publishDefinitionForCard(card, effect.id);
    }
  });

  card.addEventListener('input', event => {
    if (event.target?.matches('[data-review-ocr-text]')) return;
    const previous = state.effects.find(item => item.id === effect.id) || effect;
    if (event.target?.dataset.effectField === 'target') card.dataset.targetManuallyChanged = 'true';
    if (event.target?.dataset.effectField === 'description') {
      headingText.textContent = text(event.target.value) || 'Novo efeito';
      if (card.dataset.targetManuallyChanged !== 'true') {
        const operationValue = card.querySelector('[data-effect-field="operation"]')?.value || previous.operation;
        const resolution = resolveCalculationAlias({
          description: event.target.value,
          operation: operationValue,
          unit: previous.observedUnit,
          context: previous.semanticContext
        }, { definitions: state.definitions, aliases: state.aliases });
        const targetControl = card.querySelector('[data-effect-field="target"]');
        if (targetControl) targetControl.value = resolution.target || '';
        Object.assign(previous, {
          normalizedText: resolution.normalized,
          target: resolution.target,
          semanticContext: resolution.context,
          resolvedAliasId: resolution.aliasId,
          definitionVersion: resolution.definitionVersion,
          resolutionStatus: resolution.status
        });
        if (resolution.target) {
          const kindControl = card.querySelector('[data-effect-field="kind"]');
          if (kindControl?.value === 'unresolved') kindControl.value = 'numeric';
        }
      }
    }
    if (['target', 'operation'].includes(event.target?.dataset.effectField)) {
      const kindControl = card.querySelector('[data-effect-field="kind"]');
      if (kindControl?.value === 'unresolved') kindControl.value = 'numeric';
      if (event.target?.dataset.effectField === 'target') {
        previous.resolvedAliasId = null;
        previous.definitionVersion = null;
        previous.resolutionStatus = 'pending_alias';
        previous.semanticContext = state.definitions.find(item => item.id === event.target.value)?.context || null;
      }
    }
    if (event.target?.dataset.effectField === 'sourceKind') {
      const reference = card.querySelector('[data-effect-field="sourceReference"]');
      if (reference) reference.value = internalSourceReference(event.target.value, previous, reference.value);
    }
    const next = effectFromCard(card, previous);
    activateStarter(effect.id);
    Object.assign(previous, next);
    if (event.target?.dataset.effectField === 'scope' && next.scope === 'self') {
      const control = card.querySelector('[data-effect-field="evaluatedOn"]');
      if (control) control.value = 'source';
    }
    syncEffectCardVisibility(card, next);
    refreshAutoConfirmEligibility();
    markDirty();
    schedulePreview();
  });

  card.addEventListener('change', event => {
    const previous = state.effects.find(item => item.id === effect.id) || effect;
    if (['target', 'operation'].includes(event.target?.dataset.effectField)) {
      const kindControl = card.querySelector('[data-effect-field="kind"]');
      if (kindControl?.value === 'unresolved') kindControl.value = 'numeric';
      if (event.target?.dataset.effectField === 'target') {
        previous.resolvedAliasId = null;
        previous.definitionVersion = null;
        previous.resolutionStatus = 'pending_alias';
        previous.semanticContext = state.definitions.find(item => item.id === event.target.value)?.context || null;
      }
    }
    if (event.target?.dataset.effectField === 'sourceKind') {
      const reference = card.querySelector('[data-effect-field="sourceReference"]');
      if (reference) reference.value = internalSourceReference(event.target.value, previous, reference.value);
    }
    const next = effectFromCard(card, previous);
    const confirmation = card.querySelector('[data-review-ocr-text]');
    if (confirmation?.checked) {
      if (equipmentEffectTextReview(next.description)) {
        confirmation.checked = false;
        setMessage('Complete a frase antes de confirmar o texto do OCR.', 'error');
        return;
      }
      state.ocrTextReviewIds.delete(effect.id);
      card.querySelector('.calculation-v2-ocr-review')?.remove();
    }
    activateStarter(effect.id);
    Object.assign(previous, next);
    syncEffectCardVisibility(card, next);
    refreshAutoConfirmEligibility();
    markDirty();
    schedulePreview();
  });

  remove.addEventListener('click', () => {
    const starterOnly = effect.id === state.starterEffectId;
    state.ocrTextReviewIds.delete(effect.id);
    state.effects = state.effects.filter(item => item.id !== effect.id)
      .map((item, order) => ({ ...item, order }));
    if (starterOnly) {
      state.starterEffectId = null;
      ensureStarterEffect();
      setMessage('A tabela vazia foi restaurada. Nada foi alterado ou salvo.', 'info');
    } else {
      ensureStarterEffect();
      markDirty('Efeito removido localmente. Salve o rascunho para confirmar.');
    }
    refreshAutoConfirmEligibility();
    renderEffects();
    schedulePreview();
  });

  syncEffectCardVisibility(card, effect);
  return card;
}

function renderEffects() {
  const host = state.mount?.querySelector('[data-effects]');
  if (!host) return;
  ensureStarterEffect();
  host.replaceChildren();
  state.effects.forEach((effect, index) => host.append(createEffectCard(effect, index)));
  renderWorkspaceState();
  renderReprocessPlans();
  broadcastCalculationCoverage();
}

async function runReprocessAction(plan, action) {
  if (state.dirty) {
    setMessage('Salve ou descarte o rascunho atual antes de alterar efeitos antigos.', 'error');
    return;
  }
  const confirmAction = action === 'confirm';
  setBusy(true);
  try {
    await rpc(confirmAction
      ? 'admin_confirm_calculation_reprocess_v2'
      : 'admin_revert_calculation_reprocess_v2', confirmAction ? {
      p_plan_id: plan.id,
      p_expected_fingerprint: plan.fingerprint,
      p_reason: 'editor-confirm-calculation-reprocess-v2'
    } : {
      p_plan_id: plan.id,
      p_reason: 'editor-revert-calculation-reprocess-v2'
    });
    const workspace = await readWorkspace();
    applyWorkspace(workspace);
    renderEffects();
    renderPreview();
    setMessage(confirmAction
      ? 'Reprocessamento confirmado e auditado. A publicação pública não foi alterada automaticamente.'
      : 'Reprocessamento revertido e auditado.', 'success');
  } catch (error) {
    setMessage(error.message || 'Não foi possível atualizar o reprocessamento.', 'error');
  } finally {
    setBusy(false);
  }
}

function renderReprocessPlans() {
  const host = state.mount?.querySelector('[data-reprocess-plans]');
  if (!host) return;
  host.replaceChildren();
  const plans = Array.isArray(state.reprocessPlans) ? state.reprocessPlans : [];
  if (!plans.length) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  for (const plan of plans) {
    const article = document.createElement('article');
    article.className = 'calculation-v2-reprocess-plan';
    const heading = document.createElement('strong');
    heading.textContent = plan.status === 'preview'
      ? 'Prévia de atualização retroativa'
      : plan.status === 'applied'
        ? 'Atualização retroativa aplicada'
        : 'Atualização retroativa revertida';
    const summary = document.createElement('p');
    const equipmentNames = Array.isArray(plan.equipmentNames) ? plan.equipmentNames : [];
    summary.textContent = `${Number(plan.affectedEffectCount || 0)} efeito(s) em `
      + `${Number(plan.affectedEquipmentCount || equipmentNames.length || 0)} equipamento(s): `
      + (equipmentNames.join(', ') || 'nenhum');
    const mapping = document.createElement('p');
    mapping.textContent = `${plan.previousTarget || 'sem vínculo'} → ${plan.proposedTarget || 'pendente'} · `
      + `${plan.operation || 'operação pendente'} · ${plan.observedUnit || 'unidade pendente'}`;
    const actions = document.createElement('div');
    actions.className = 'calculation-v2-semantic-actions';
    if (plan.status === 'preview') {
      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.className = 'admin-button primary';
      confirm.textContent = 'Confirmar atualização retroativa';
      confirm.addEventListener('click', () => runReprocessAction(plan, 'confirm'));
      actions.append(confirm);
    }
    if (plan.status === 'applied') {
      const revert = document.createElement('button');
      revert.type = 'button';
      revert.className = 'admin-button';
      revert.textContent = 'Reverter atualização';
      revert.addEventListener('click', () => runReprocessAction(plan, 'revert'));
      actions.append(revert);
    }
    article.append(heading, summary, mapping, actions);
    host.append(article);
  }
}

function addEffect() {
  refreshEffectsFromDom();
  if (state.starterEffectId) {
    state.mount?.querySelector(`[data-effect-id="${state.starterEffectId}"] textarea`)?.focus();
    setMessage('A primeira regra já está pronta para preenchimento, com as 11 raridades visíveis.', 'info');
    return;
  }
  state.effects.push(blankEffect(state.effects.length));
  markDirty('Novo efeito criado como rascunho.');
  renderEffects();
  schedulePreview();
  state.mount?.querySelector('[data-effect-card]:last-child textarea')?.focus();
}

function validateEffects(effects) {
  const errors = [];
  const ids = new Set();
  const definitionIds = new Set(state.definitions.map(definition => definition.id));
  const conditionIds = new Set(['always', ...state.conditions.map(condition => condition.id)]);
  for (const [index, effect] of effects.entries()) {
    const label = `Efeito ${index + 1}`;
    if (state.ocrTextReviewIds.has(effect.id)) errors.push(`${label}: confira e confirme o texto completo na imagem antes de salvar.`);
    if (!UUID_PATTERN.test(effect.id)) errors.push(`${label}: o identificador estável não é um UUID válido.`);
    if (ids.has(effect.id)) errors.push(`${label}: identificador repetido.`);
    ids.add(effect.id);
    if (!text(effect.description)) errors.push(`${label}: informe a descrição uma única vez.`);
    if (!['numeric', 'informational', 'unresolved'].includes(effect.kind)) errors.push(`${label}: tipo inválido.`);
    if (!['self', 'team'].includes(effect.scope)) errors.push(`${label}: alcance inválido.`);
    if (!conditionIds.has(effect.condition)) errors.push(`${label}: selecione uma condição registrada.`);
    if (effect.condition === 'always' && effect.conditionExpected !== null) errors.push(`${label}: “Sempre ativo” não recebe valor esperado.`);
    if (effect.condition !== 'always' && typeof effect.conditionExpected !== 'boolean') errors.push(`${label}: informe o valor esperado da condição.`);
    if (effect.scope === 'self' && effect.evaluatedOn !== 'source') errors.push(`${label}: a condição do portador deve ser avaliada na origem.`);
    if (effect.scope === 'team' && !['source', 'recipient'].includes(effect.evaluatedOn)) errors.push(`${label}: informe onde a condição de equipe é avaliada.`);
    if (Boolean(effect.sourceKind) !== Boolean(effect.sourceReference)) errors.push(`${label}: tipo e referência da fonte devem ser preenchidos juntos.`);
    if (effect.sourceKind && !SOURCE_KINDS.some(option => option.value === effect.sourceKind)) errors.push(`${label}: tipo de fonte inválido.`);
    if (effect.kind === 'numeric') {
      if (effect.target && !definitionIds.has(effect.target)) errors.push(`${label}: o destino selecionado não existe no catálogo.`);
      if (effect.target && (!effect.resolvedAliasId || effect.resolutionStatus !== 'resolved')) {
        errors.push(`${label}: publique o alias central antes de calcular este vínculo.`);
      }
      const definition = state.definitions.find(item => item.id === effect.target);
      if (effect.target && (definition?.state !== 'published' || definition?.formulaState !== 'published')) {
        errors.push(`${label}: a fórmula do atributo ainda não está publicada.`);
      }
      if (!['flat', 'percent'].includes(effect.operation)) errors.push(`${label}: selecione uma operação.`);
      if (!Object.values(effect.values || {}).some(Number.isFinite)) errors.push(`${label}: informe ao menos um valor de raridade.`);
      for (const rarity of state.rarities) {
        const value = effect.values?.[rarity.slug];
        if (value !== null && !Number.isFinite(value)) errors.push(`${label}: o valor de ${rarity.name} precisa ser numérico ou vazio.`);
      }
    } else {
      if (effect.operation !== null) errors.push(`${label}: efeito não numérico não pode ter operação.`);
      if (Object.values(effect.values || {}).some(value => value !== null)) errors.push(`${label}: efeito não numérico não pode carregar valores ocultos.`);
    }
  }
  return errors;
}

function semanticPayload() {
  refreshEffectsFromDom();
  const effects = activeEffects().map((effect, order) => canonicalEffect({ ...effect, order }));
  return { effects, errors: validateEffects(effects) };
}

async function readWorkspace(equipmentId = state.equipmentId) {
  return normalizeWorkspace(await rpc('admin_get_equipment_calculation_v2', {
    p_equipment_id: equipmentId || null
  }));
}

function applyWorkspace(workspace, { preserveEffects = false } = {}) {
  if (workspace.contract && workspace.contract !== CONTRACT_ID) {
    throw new Error(`Contrato de cálculo inesperado: ${workspace.contract}.`);
  }
  const localEffects = preserveEffects ? activeEffects() : null;
  if (!preserveEffects) state.ocrTextReviewIds.clear();
  state.revision = workspace.revision;
  state.rarities = workspace.rarities;
  state.definitions = workspace.definitions;
  state.aliases = workspace.aliases;
  state.contexts = workspace.contexts;
  state.operations = workspace.operations;
  state.definitionDrafts = workspace.definitionDrafts;
  state.reprocessPlans = workspace.reprocessPlans;
  state.conditions = workspace.conditions;
  state.permissions = workspace.permissions;
  state.published = workspace.published;
  state.catalogCompatible = workspace.catalogCompatible;
  state.equipmentName = text(workspace.equipment?.name) || state.equipmentName;
  state.equipment = {
    ...(state.equipment || {}),
    ...(workspace.equipment || {})
  };
  state.starterEffectId = null;
  state.effects = localEffects?.length
    ? localEffects.map((effect, index) => normalizedEffect(effect, index, state.rarities))
    : workspace.effects;
  state.dirty = Boolean(preserveEffects && localEffects?.length);
  ensureStarterEffect();
}

async function saveDraft({ quiet = false } = {}) {
  if (!state.equipmentId) {
    setMessage('Salve primeiro as informações básicas do equipamento para obter o ID.', 'error');
    return false;
  }
  if (!state.catalogCompatible) {
    setMessage('Catálogo semântico indisponível ou incompatível neste ambiente. O rascunho de cálculo não será salvo como se fosse uma pendência de conteúdo.', 'error');
    return false;
  }
  const { effects, errors } = semanticPayload();
  if (errors.length) {
    setMessage(errors[0], 'error');
    return false;
  }
  setBusy(true);
  setMessage('Salvando rascunho com verificação de revisão…', 'info');
  try {
    const expectedRevision = state.revision;
    const response = normalizeWorkspace(await rpc('admin_save_equipment_calculation_v2', {
      p_equipment_id: state.equipmentId,
      p_expected_revision: expectedRevision,
      p_effects: effects,
      p_reason: 'editor-calculation-v2'
    }));
    const readback = await readWorkspace();
    const responseMatches = response.revision === readback.revision;
    const semanticsMatch = sameSemantics(effects, readback.effects, readback.rarities);
    if (!responseMatches || !semanticsMatch || readback.revision <= expectedRevision) {
      throw new Error('O banco respondeu, mas a releitura não confirmou exatamente os efeitos salvos. Nada foi marcado como confirmado.');
    }
    applyWorkspace(readback);
    state.lastVerifiedRevision = readback.revision;
    renderEffects();
    renderHeroOptions();
    refreshPreviewConditionControls();
    renderPreview();
    if (!quiet) setMessage(`Cálculo salvo e confirmado por releitura na revisão ${readback.revision}.`, 'success');
    return true;
  } catch (error) {
    const stale = /revision|revis[aã]o|conflict|stale/i.test(error.message || '');
    setMessage(stale
      ? 'Outra edição alterou este equipamento. Recarregue o rascunho antes de salvar novamente.'
      : error.message || 'Não foi possível salvar o rascunho.', 'error');
    return false;
  } finally {
    setBusy(false);
  }
}

async function publishDraft() {
  if (!state.equipmentId) {
    setMessage('Salve primeiro as informações básicas do equipamento.', 'error');
    return false;
  }
  if (!state.catalogCompatible) {
    setMessage('Catálogo semântico indisponível ou incompatível neste ambiente. A publicação foi bloqueada sem criar pendências falsas.', 'error');
    return false;
  }
  const effects = activeEffects();
  if (!effects.length) {
    setMessage('Cadastre ao menos um efeito antes de publicar.', 'error');
    return false;
  }
  const missingSource = effects.find(effect => effect.kind === 'numeric' && (!effect.sourceKind || !effect.sourceReference));
  if (missingSource) {
    setMessage('Identifique a fonte verificável de cada efeito numérico antes de publicar.', 'error');
    return false;
  }
  if (state.dirty) {
    setMessage('Salve o cálculo antes de confirmar no site.', 'error');
    return false;
  }
  if (state.lastVerifiedRevision !== state.revision) {
    const reread = await readWorkspace();
    if (reread.revision !== state.revision || !sameSemantics(activeEffects(), reread.effects, reread.rarities)) {
      setMessage('A releitura encontrou outra revisão. Recarregue antes de publicar.', 'error');
      return false;
    }
    state.lastVerifiedRevision = reread.revision;
  }
  setBusy(true);
  setMessage('Validando e publicando um snapshot imutável…', 'info');
  try {
    const expectedRevision = state.revision;
    const expectedPublication = Number(state.published?.id || 0);
    await rpc('admin_publish_equipment_calculation_v2', {
      p_equipment_id: state.equipmentId,
      p_expected_revision: expectedRevision,
      p_expected_publication: expectedPublication,
      p_reason: 'editor-calculation-v2'
    });
    const readback = await readWorkspace();
    const publicationConfirmed = readback.revision === expectedRevision
      && Number(readback.published?.workspaceRevision) === expectedRevision
      && Boolean(text(readback.published?.fingerprint));
    if (!publicationConfirmed || !sameSemantics(activeEffects(), readback.effects, readback.rarities)) {
      throw new Error('A releitura não confirmou o snapshot publicado. O editor não exibirá um falso sucesso.');
    }
    applyWorkspace(readback);
    state.lastVerifiedRevision = readback.revision;
    renderEffects();
    renderPreview();
    setMessage(`Publicação confirmada por releitura na revisão ${readback.revision}.`, 'success');
    window.dispatchEvent(new CustomEvent('equipment:calculation-v2-published', {
      detail: {
        equipmentId: state.equipmentId,
        revision: readback.revision,
        publicationId: readback.published?.id || null
      }
    }));
    return true;
  } catch (error) {
    setMessage(error.message || 'Não foi possível publicar o cálculo.', 'error');
    return false;
  } finally {
    setBusy(false);
  }
}

async function confirmCalculation() {
  if (!state.catalogCompatible) {
    setMessage('Catálogo semântico indisponível ou incompatível neste ambiente. O cálculo não será confirmado como se houvesse uma pendência de conteúdo.', 'error');
    return false;
  }
  const { effects, errors } = semanticPayload();
  if (!effects.length) {
    setMessage('A leitura ainda não trouxe nenhum efeito para confirmar.', 'error');
    return false;
  }
  if (errors.length) {
    setMessage(`${errors[0]} Abra “Corrigir reconhecimento” neste efeito.`, 'error');
    const target = [...state.mount.querySelectorAll('[data-effect-card]')]
      .find((card, index) => errors[0].startsWith(`Efeito ${index + 1}:`));
    const panel = target?.querySelector('[data-correction-panel]');
    if (panel) panel.open = true;
    return false;
  }
  if (state.dirty && !(await saveDraft({ quiet: true }))) return false;
  return publishDraft();
}

async function loadPreviewData() {
  const equipmentRequest = state.equipmentId
    ? supabase
      .from('equipments')
      .select('id,name,hero_id,class_id,is_personal,enabled')
      .eq('id', state.equipmentId)
      .single()
    : Promise.resolve({ data: null, error: null });
  const [heroesResult, basesResult, equipmentResult] = await Promise.all([
    supabase.from('heroes').select('id,name,slug,class_id,enabled').eq('enabled', true).order('name'),
    supabase.from('hero_complete_base_stats').select('hero_id,hero_name,hero_stats,weapon_stats'),
    equipmentRequest
  ]);
  if (heroesResult.error) throw new Error(heroesResult.error.message || 'Falha ao carregar heróis.');
  if (basesResult.error) throw new Error(basesResult.error.message || 'Falha ao carregar os valores base dos heróis.');
  if (equipmentResult.error) throw new Error(equipmentResult.error.message || 'Falha ao carregar o escopo do equipamento.');
  state.heroes = Array.isArray(heroesResult.data) ? heroesResult.data : [];
  state.heroBases = new Map((Array.isArray(basesResult.data) ? basesResult.data : [])
    .map(row => [String(row.hero_id), row]));
  state.equipment = equipmentResult.data || null;
  state.equipmentName = text(equipmentResult.data?.name) || state.equipmentName;
}

function renderHeroOptions() {
  const select = state.mount?.querySelector('[data-preview-hero]');
  if (!select) return;
  const current = select.value;
  const eligibleHeroes = eligiblePreviewHeroes(state.equipment, state.heroes);
  select.replaceChildren(createOption('', 'Selecione um herói'));
  for (const hero of eligibleHeroes) {
    const hasBase = state.heroBases.has(String(hero.id));
    select.append(createOption(String(hero.id), `${hero.name || hero.slug || hero.id}${hasBase ? '' : ' — base indisponível'}`, String(hero.id) === current));
  }
  if (!select.value && eligibleHeroes.length) select.value = String(eligibleHeroes[0].id);
  select.disabled = state.busy || eligibleHeroes.length === 0;

  const rarity = state.mount?.querySelector('[data-preview-rarity]');
  if (rarity) {
    const selected = rarity.value;
    rarity.replaceChildren(...state.rarities.map(item => createOption(item.slug, item.name, item.slug === selected)));
    if (!rarity.value) rarity.value = state.rarities[0]?.slug || '';
  }
}

function sourceValue(container, path) {
  if (!isRecord(container)) return null;
  const direct = container[path];
  if (direct !== undefined) return finiteOrNull(direct);
  return null;
}

function heroBaseFor(heroId) {
  const row = state.heroBases.get(String(heroId));
  const base = Object.create(null);
  for (const definition of state.definitions) {
    const scope = definition.source?.scope;
    const key = definition.source?.key;
    const bucket = scope === 'weapon' ? row?.weapon_stats : scope === 'hero' ? row?.hero_stats : null;
    const sourceBase = key ? sourceValue(bucket, key) : null;
    base[definition.id] = sourceBase ?? finiteOrNull(definition.defaultBase);
  }
  return base;
}

function activeConditionIds() {
  return [...new Set(activeEffects()
    .map(effect => effect.condition)
    .filter(condition => condition && condition !== 'always'))];
}

function refreshPreviewConditionControls() {
  const host = state.mount?.querySelector('[data-preview-conditions]');
  if (!host) return;
  const active = activeConditionIds();
  for (const key of Object.keys(state.previewConditions)) {
    if (!active.includes(key)) delete state.previewConditions[key];
  }
  host.replaceChildren();
  if (!active.length) {
    const copy = document.createElement('span');
    copy.className = 'calculation-v2-preview-help';
    copy.textContent = 'Os efeitos atuais não dependem de condição.';
    host.append(copy);
    return;
  }
  for (const conditionId of active) {
    if (!Object.prototype.hasOwnProperty.call(state.previewConditions, conditionId)) {
      const expectations = activeEffects()
        .filter(effect => effect.condition === conditionId)
        .map(effect => effect.conditionExpected);
      state.previewConditions[conditionId] = expectations.every(value => value === expectations[0])
        ? expectations[0]
        : null;
    }
    const label = document.createElement('label');
    label.className = 'calculation-v2-condition-control';
    const title = document.createElement('span');
    const registered = state.conditions.find(condition => condition.id === conditionId);
    title.textContent = registered?.label || conditionId;
    const select = selectControl([
      { value: 'true', label: 'Verdadeiro' },
      { value: 'false', label: 'Falso' },
      { value: 'unknown', label: 'Desconhecido' }
    ], state.previewConditions[conditionId] === null ? 'unknown' : String(state.previewConditions[conditionId]));
    select.dataset.previewControl = '';
    select.addEventListener('change', () => {
      state.previewConditions[conditionId] = select.value === 'unknown' ? null : select.value === 'true';
      renderPreview();
    });
    label.append(title, select);
    host.append(label);
  }
}

function runtimeEffect(effect, ruleStatus) {
  const semanticallyResolved = state.catalogCompatible
    && effect.resolutionStatus === 'resolved'
    && Boolean(effect.target && effect.operation && effect.resolvedAliasId && effect.definitionVersion);
  const runtime = {
    id: effect.id,
    kind: effect.kind === 'numeric' && !semanticallyResolved ? 'unresolved' : effect.kind,
    description: effect.description,
    rawLabel: effect.description,
    normalizedLabel: normalizeCalculationEffectLabel(effect.description),
    scope: effect.scope,
    evaluatedOn: effect.evaluatedOn,
    ruleStatus,
    source: effect.sourceKind && effect.sourceReference
      ? { kind: effect.sourceKind, reference: effect.sourceReference }
      : null,
    resolutionStatus: effect.resolutionStatus
  };
  if (effect.condition !== 'always') {
    runtime.condition = effect.condition;
    runtime.conditionExpected = effect.conditionExpected;
  }
  if (effect.kind === 'numeric' && semanticallyResolved) {
    runtime.target = effect.target;
    runtime.operation = effect.operation;
    runtime.values = normalizedValues(effect.values);
  } else if (effect.kind === 'numeric') {
    runtime.values = normalizedValues(effect.values);
    runtime.reason = 'O efeito ainda não possui alias, contexto, unidade, operação e fórmula publicados de forma compatível.';
  }
  return runtime;
}

function calculationInput({ localSimulation = false } = {}) {
  const heroSelect = state.mount?.querySelector('[data-preview-hero]');
  const raritySelect = state.mount?.querySelector('[data-preview-rarity]');
  const heroId = heroSelect?.value;
  const rarity = raritySelect?.value;
  if (!heroId || !rarity || !state.equipmentId) return null;
  const hero = state.heroes.find(item => String(item.id) === String(heroId));
  if (!previewHeroEligibility(state.equipment, hero).eligible) return null;
  const publicReviewed = publishedMatchesWorkspace();
  const ruleStatus = localSimulation || publicReviewed ? 'reviewed' : 'draft';
  const effects = activeEffects().map(effect => runtimeEffect(effect, ruleStatus)).filter(Boolean);
  const conditions = Object.fromEntries(Object.entries(state.previewConditions));
  return {
    definitions: state.definitions,
    equipment: [{
      id: state.equipmentId,
      name: state.equipmentName || document.getElementById('name')?.value?.trim() || 'Equipamento em edição',
      heroId: state.equipment?.hero_id || null,
      classId: state.equipment?.class_id || null,
      isPersonal: state.equipment?.is_personal === true,
      effects
    }],
    build: {
      id: 'equipment-editor-local-preview',
      hero: {
        id: heroId,
        name: hero?.name || heroId,
        base: heroBaseFor(heroId)
      },
      slots: [{ equipmentId: state.equipmentId, rarity }, null, null, null, null, null],
      conditions
    }
  };
}

function resultReason(stat) {
  const reason = stat?.reasons?.[0]?.message;
  return reason || 'Não existe base ou regra suficiente para liberar este resultado.';
}

function previewStatusLabel(status) {
  return ({
    calculated: 'calculado',
    partial: 'parcial',
    pending: 'pendente',
    invalid: 'inválido'
  })[status] || status;
}

function pendingTraceAmount(trace) {
  if (!Number.isFinite(trace?.amount)) return '';
  const value = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(trace.amount);
  return trace.operation === 'percent' ? `${value}%` : value;
}

function renderPreview() {
  const output = state.mount?.querySelector('[data-preview-output]');
  if (!output) return;
  refreshEffectsFromDom();
  broadcastCalculationCoverage();
  const effects = activeEffects();
  const numericTargets = [...new Set(effects.filter(effect => effect.kind === 'numeric').map(effect => effect.target).filter(Boolean))];
  const publicInput = calculationInput({ localSimulation: false });
  const localInput = calculationInput({ localSimulation: true });
  output.replaceChildren();
  if (!state.catalogCompatible) {
    const incompatible = document.createElement('p');
    incompatible.className = 'calculation-v2-preview-empty';
    incompatible.textContent = 'Catálogo semântico indisponível ou incompatível neste ambiente. Nenhum resultado foi calculado e nenhuma pendência de conteúdo foi criada.';
    output.append(incompatible);
    return;
  }
  if (!publicInput || !localInput) {
    const empty = document.createElement('p');
    empty.className = 'calculation-v2-preview-empty';
    const hasEligibleHero = eligiblePreviewHeroes(state.equipment, state.heroes).length > 0;
    empty.textContent = state.equipmentId
      ? hasEligibleHero
        ? 'Selecione um herói e uma raridade para calcular.'
        : 'Nenhum herói ativo é compatível com o escopo salvo deste equipamento.'
      : 'Salve as informações básicas do equipamento para habilitar a prévia.';
    output.append(empty);
    return;
  }

  const publicResult = calculateBuild(publicInput);
  const localResult = calculateBuild(localInput);
  const pendingTraces = (localResult.effects || [])
    .filter(trace => ['pending', 'invalid'].includes(trace.status));

  const statusLine = document.createElement('div');
  statusLine.className = 'calculation-v2-preview-statuses';
  const publicBadge = document.createElement('span');
  publicBadge.className = `calculation-v2-preview-badge is-${publicResult.status}`;
  publicBadge.textContent = publishedMatchesWorkspace()
    ? `Público: ${previewStatusLabel(publicResult.status)}`
    : state.published
      ? 'Público: publicação desatualizada'
      : 'Público: pendente enquanto rascunho';
  const localBadge = document.createElement('span');
  localBadge.className = `calculation-v2-preview-badge is-${localResult.status}`;
  localBadge.textContent = `Simulação local: ${previewStatusLabel(localResult.status)}`;
  statusLine.append(publicBadge, localBadge);
  output.append(statusLine);

  if (!numericTargets.length) {
    const copy = document.createElement('p');
    copy.className = 'calculation-v2-preview-empty';
    copy.textContent = pendingTraces.length
      ? 'A regra ainda não foi coletada. O efeito permanece pendente e nenhum número foi inventado.'
      : 'Este equipamento não possui efeitos numéricos.';
    output.append(copy);
  } else {
    const grid = document.createElement('div');
    grid.className = 'calculation-v2-preview-grid';
    for (const target of numericTargets) {
      const definition = state.definitions.find(item => item.id === target);
      const stat = localResult.stats?.[target];
      const publicStat = publicResult.stats?.[target];
      const card = document.createElement('article');
      card.className = `calculation-v2-preview-stat is-${stat?.status || 'pending'}`;
      const heading = document.createElement('strong');
      heading.textContent = definition?.label || target;
      const key = document.createElement('code');
      key.textContent = target;
      const values = document.createElement('dl');
      const pairs = [
        ['Base', displayNumber(stat?.base, definition?.unit)],
        ['Simulação local', displayNumber(stat?.final, definition?.unit)],
        ['Resultado público', displayNumber(publicStat?.final, definition?.unit)]
      ];
      for (const [term, value] of pairs) {
        const dt = document.createElement('dt');
        dt.textContent = term;
        const dd = document.createElement('dd');
        dd.textContent = value;
        values.append(dt, dd);
      }
      card.append(heading, key, values);
      if (stat?.final === null || stat?.final === undefined) {
        const reason = document.createElement('p');
        reason.textContent = resultReason(stat);
        card.append(reason);
      }
      grid.append(card);
    }
    output.append(grid);
  }

  if (pendingTraces.length) {
    const section = document.createElement('section');
    section.className = 'calculation-v2-preview-pending';
    const title = document.createElement('strong');
    title.textContent = 'Não calculado';
    const list = document.createElement('ul');
    for (const trace of pendingTraces) {
      const item = document.createElement('li');
      const amount = pendingTraceAmount(trace);
      const label = trace.rawLabel || trace.description || trace.effectId || 'Efeito';
      item.textContent = `${amount ? `${amount} ` : ''}${label} — ${trace.reason || 'efeito pendente'}`;
      list.append(item);
    }
    section.append(title, list);
    output.append(section);
  }
  const disclaimer = document.createElement('p');
  disclaimer.className = 'calculation-v2-preview-disclaimer';
  disclaimer.textContent = 'A simulação local usa o mesmo kernel matemático, mas não publica nem aprova a regra.';
  output.append(disclaimer);
}

function shell() {
  state.mount.classList.add('calculation-v2');
  state.mount.innerHTML = `
    <div class="calculation-v2-header">
      <div>
        <span class="calculation-v2-kicker">Motor de cálculo v2</span>
        <h2>Efeitos e cálculo</h2>
        <p>O sistema reconhece o status, a fórmula e a origem. Você só corrige quando houver divergência.</p>
      </div>
      <div class="calculation-v2-header-state">
        <span data-workspace-state class="calculation-v2-state is-draft">Rascunho · fora do cálculo público</span>
        <small data-workspace-revision>Revisão do rascunho: 0</small>
      </div>
    </div>
    <div class="calculation-v2-publication" data-publication-state></div>
    <div class="calculation-v2-toolbar">
      <div>
        <button type="button" class="admin-button" data-action="add">Adicionar efeito</button>
        <button type="button" class="admin-button" data-action="apply-import" hidden>Adicionar leitura</button>
      </div>
      <div>
        <button type="button" class="admin-button" data-action="save">Salvar para depois</button>
        <button type="button" class="admin-button primary" data-action="confirm">Confirmar cálculo no site</button>
      </div>
    </div>
    <div class="calculation-v2-message" data-calculation-v2-message role="status" aria-live="polite"></div>
    <div class="calculation-v2-effects" data-effects></div>
    <section class="calculation-v2-reprocess" data-reprocess-plans hidden aria-label="Reprocessamento seguro"></section>
    <section class="calculation-v2-preview" aria-labelledby="calculation-v2-preview-title">
      <div class="calculation-v2-preview-heading">
        <div>
          <span class="calculation-v2-kicker">Simulação local</span>
          <h3 id="calculation-v2-preview-title">Prévia em tempo real</h3>
          <p>O rascunho pode ser simulado aqui, mas só entra no site depois da publicação.</p>
        </div>
        <div class="calculation-v2-preview-selectors">
          <label><span>Herói</span><select data-preview-hero data-preview-control></select></label>
          <label><span>Raridade</span><select data-preview-rarity data-preview-control></select></label>
        </div>
      </div>
      <div class="calculation-v2-preview-conditions" data-preview-conditions></div>
      <div class="calculation-v2-preview-output" data-preview-output aria-live="polite"></div>
    </section>
  `;
  state.mount.querySelector('[data-action="add"]').addEventListener('click', addEffect);
  state.mount.querySelector('[data-action="apply-import"]').addEventListener('click', applyPendingImport);
  state.mount.querySelector('[data-action="save"]').addEventListener('click', saveDraft);
  state.mount.querySelector('[data-action="confirm"]').addEventListener('click', confirmCalculation);
  state.mount.querySelector('[data-preview-hero]').addEventListener('change', renderPreview);
  state.mount.querySelector('[data-preview-rarity]').addEventListener('change', renderPreview);
}

async function load({ preserveEffects = false } = {}) {
  const token = ++state.loadToken;
  setBusy(true);
  setMessage('Carregando o catálogo v2 e as bases reais dos heróis…', 'info');
  try {
    const [workspace] = await Promise.all([
      readWorkspace(),
      loadPreviewData()
    ]);
    if (token !== state.loadToken) return;
    applyWorkspace(workspace, { preserveEffects });
    state.loaded = true;
    state.lastVerifiedRevision = preserveEffects ? null : workspace.revision;
    renderEffects();
    renderHeroOptions();
    refreshPreviewConditionControls();
    renderPreview();
    const queuedImport = state.queuedImportDraft;
    state.queuedImportDraft = null;
    if (queuedImport) {
      applyImportedDraft(queuedImport);
    } else {
      setMessage(!state.catalogCompatible
        ? 'Catálogo semântico indisponível ou incompatível neste ambiente. O cadastro foi preservado sem gerar pendências falsas.'
        : state.equipmentId
          ? `Catálogo v2 carregado na revisão ${state.revision}. As 11 raridades estão prontas para edição.`
          : 'As 11 raridades estão prontas. Leia as imagens ou preencha o primeiro efeito e depois salve as informações básicas.',
      state.catalogCompatible ? 'info' : 'error');
    }
  } catch (error) {
    setMessage(error.message || 'Não foi possível carregar o editor de cálculo v2.', 'error');
  } finally {
    setBusy(false);
  }
}

async function handleEquipmentSaveSuccess(event) {
  const savedId = text(event.detail?.savedId || event.detail?.equipmentId);
  if (!savedId) return;
  const wasNew = !state.equipmentId;
  const changedEquipment = state.equipmentId && state.equipmentId !== savedId;
  state.equipmentId = savedId;
  state.equipmentName = text(event.detail?.name) || state.equipmentName;
  const shouldAutoConfirm = state.autoConfirmAfterEquipmentSave;
  if (wasNew || changedEquipment) {
    await load({ preserveEffects: wasNew && activeEffects().length > 0 });
  } else {
    await loadPreviewData();
    renderHeroOptions();
    renderWorkspaceState();
    renderPreview();
  }
  if (shouldAutoConfirm && event.detail?.attributesConfirmed !== true) {
    state.autoConfirmAfterEquipmentSave = false;
    setMessage('Os atributos do equipamento não foram confirmados por releitura. O cálculo continua como rascunho; confira o cadastro antes de confirmar no site.', 'error');
    return;
  }
  if (shouldAutoConfirm && !state.catalogCompatible) {
    state.autoConfirmAfterEquipmentSave = false;
    setMessage('Catálogo semântico indisponível ou incompatível neste ambiente. O cadastro foi preservado, mas o cálculo não será confirmado automaticamente.', 'error');
    return;
  }
  if (shouldAutoConfirm) {
    state.autoConfirmAfterEquipmentSave = false;
    setMessage('Leitura reconhecida. Confirmando o cálculo e a coleta no site…', 'info');
    await confirmCalculation();
  }
}

function handleImageImport(event) {
  if (event.detail?.entityType !== 'equipment' || !event.detail?.data) return;
  if (!state.loaded) {
    state.queuedImportDraft = event.detail.data;
    return;
  }
  applyImportedDraft(event.detail.data);
}

export async function initEquipmentCalculationV2Editor({ importedDraft = null } = {}) {
  const mount = document.querySelector('[data-calculation-v2-mount]');
  if (!mount || mount.dataset.calculationV2Ready === 'true') return null;
  mount.dataset.calculationV2Ready = 'true';
  state.mount = mount;
  state.queuedImportDraft = importedDraft;
  shell();
  window.addEventListener('equipment:save-success', handleEquipmentSaveSuccess);
  window.addEventListener('echoarena:image-import-result', handleImageImport);
  await load();
  return {
    reload: () => load(),
    saveDraft,
    publishDraft,
    confirmCalculation,
    get equipmentId() { return state.equipmentId; },
    get revision() { return state.revision; }
  };
}
