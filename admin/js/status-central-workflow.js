import { buildStatusProof, discoverStatusFields, inventoryStatusEffects, draftStatusRegistry, suggestedStatusId, statusActionRecord } from './status-central-model.js?sc=20260906-1&eq=20260907-effects-1';
import { equipmentEligibility } from '../../js/equipment-eligibility.js?v=1';
import { compileStatusRegistry, finiteStatusNumber, stableStatusJson, validateStatusPayload, STATUS_OPERATORS, compareStatusCalculations } from '../../js/status-registry-v1.js?sc=20260906-1&eq=20260907-effects-1';

// This workflow identifies a single source row. Labels never identify a rule.
const equal = (a, b) => stableStatusJson(a) === stableStatusJson(b);
const sameSource = (binding, input) => binding.source_kind === 'equipment_variant' && binding.source_id === input.variantId && binding.attribute_key === input.rowKey;
export const runtimePayload = payload => ({ ...payload,
  definitions: payload.definitions.map(({ evidence, ...definition }) => definition),
  bindings: payload.bindings.map(({ evidence, ...binding }) => binding)
});
export function equipmentEffectRows(data, equipmentId, variantId) {
  return inventoryStatusEffects(data, compileStatusRegistry(data.central.published))
    .filter(row => !row.missing && row.equipmentId === equipmentId && row.source_id === variantId);
}
export function compatibleTestHeroes(data, equipmentId) {
  const equipment = data.equipments.find(item => item.id === equipmentId);
  return data.heroes.filter(hero => equipmentEligibility(equipment, hero).eligible && data.bases.some(base => base.hero_id === hero.id));
}
export function effectTargets(data, scope, heroId) {
  const fields = discoverStatusFields(data).filter(field => field.scope === scope && ['hero', 'weapon'].includes(scope));
  for (const definition of data.central.draft.definitions.filter(d => d.scope === scope && d.kind === 'scalar')) {
    if (!fields.some(field => field.source_key === definition.source_key)) fields.push({ ...definition, locator: `${scope}:::${definition.source_key}`, samples: [] });
  }
  return fields.map(field => {
    const definition = data.central.draft.definitions.find(d => d.scope === scope && d.source_key === field.source_key);
    const base = data.bases.find(b => b.hero_id === heroId)?.[scope === 'hero' ? 'hero_stats' : 'weapon_stats'];
    return { ...field, name: definition?.name || field.name, definition, base: finiteStatusNumber(base?.[field.source_key]) };
  }).filter(field => field.definition?.kind !== 'summary');
}
export function proposeEquipmentEffect(data, input) {
  const row = equipmentEffectRows(data, input.equipmentId, input.variantId).find(r => r.key === input.rowKey);
  if (!row) throw new Error('Escolha uma raridade e um efeito disponível neste equipamento.');
  if (row.raw?.textReview) throw new Error('O texto deste efeito está incompleto. Corrija-o no equipamento antes de configurar.');
  const field = effectTargets(data, input.scope, input.heroId).find(f => f.source_key === input.sourceKey);
  if (!field) throw new Error('Escolha o status que este efeito deve alterar.');
  const payload = structuredClone(data.central.draft);
  let definition = field.definition;
  if (!definition || definition.unit === 'unknown') {
    if (!input.unit || input.unit === 'unknown') throw new Error('Confirme a unidade do status antes de testar.');
    definition = { ...(definition || {}), id: definition?.id || suggestedStatusId(field),
      name: input.name?.trim() || field.name, scope: field.scope, source_key: field.source_key,
      unit: input.unit, kind: 'scalar', direction: definition?.direction || 'neutral',
      evidence: statusActionRecord('unidade confirmada', `${field.scope}.${field.source_key}; ${input.unit}.`) };
    const index = payload.definitions.findIndex(d => d.id === definition.id);
    if (index < 0) payload.definitions.push(definition);
    else payload.definitions[index] = definition;
  }
  const op = STATUS_OPERATORS[input.operator];
  if (!op) throw new Error('Escolha se o efeito soma, subtrai, aumenta ou reduz em percentual.');
  const old = payload.bindings.find(binding => sameSource(binding, input));
  const binding = { id: old?.id || input.bindingId, source_kind: 'equipment_variant', source_id: row.source_id,
    attribute_key: row.key, source_snapshot: row.raw, target: definition.id, operator: input.operator,
    unit: op.operation === 'percent' ? 'percent' : definition.unit, condition: input.condition,
    evidence: statusActionRecord('efeito configurado', `${row.name}; ${row.rarity}; linha ${row.key} → ${definition.scope}.${definition.source_key}; ${input.operator}; ${input.condition}.`) };
  if (binding.condition === 'ability_active') binding.ability_id = input.abilityId;
  const index = payload.bindings.findIndex(b => sameSource(b, input));
  if (index < 0) payload.bindings.push(binding);
  else payload.bindings[index] = binding;
  const validation = validateStatusPayload(payload, { evidence: true });
  if (!validation.valid) throw new Error(validation.errors.map(error => error.message).join(' '));
  return { payload, row, definition, binding };
}
export function otherDraftChanges(published, proposed, input, targetId) {
  const before = runtimePayload(published), after = runtimePayload(proposed), changes = [];
  for (const collection of ['definitions', 'bindings']) {
    const ids = new Set([...before[collection], ...after[collection]].map(row => row.id));
    for (const id of ids) {
      const a = before[collection].find(row => row.id === id), b = after[collection].find(row => row.id === id);
      if (equal(a, b)) continue;
      if (collection === 'bindings' && sameSource(b || a, input)) continue;
      // A new definition belongs to this effect; changing an existing definition
      // can affect other items and remains an explicit advanced operation.
      if (collection === 'definitions' && !a && id === targetId) continue;
      changes.push({ collection, id, name: b?.name || a?.name || id });
    }
  }
  return changes;
}
export function previewEquipmentEffect(data, input) {
  const proposal = proposeEquipmentEffect(data, input);
  const selections = [{ equipmentId: input.equipmentId, variantId: input.variantId }];
  const conditions = input.conditions || {};
  const proof = buildStatusProof(data, input.heroId, selections, draftStatusRegistry(data.central, proposal.payload), conditions);
  const published = buildStatusProof(data, input.heroId, selections, compileStatusRegistry(data.central.published), conditions);
  const find = calculation => calculation.trace.find(t => t.source?.kind === 'equipment_variant' && t.source.id === input.variantId && t.attributeKey === input.rowKey);
  const step = find(proof.calculation);
  const others = proof.calculation.trace.filter(t => t !== step && !['applied', 'not_applicable'].includes(t.status));
  const unrelated = otherDraftChanges(data.central.published.payload, proposal.payload, input, proposal.definition.id);
  return { ...proposal, input: structuredClone(input), proof, published, step, publishedStep: find(published.calculation), others, unrelated,
    expectedRevision: data.central.draft_revision, expectedPublication: data.central.active_publication,
    canApply: step?.status === 'applied' && unrelated.length === 0,
    alreadyPublished: equal(runtimePayload(proposal.payload), data.central.published.payload) };
}
function calculationIdentity(proof) {
  const { base, final, origins, trace, complete, equipmentPolicy } = proof.calculation;
  return { base, final, origins, complete, equipmentPolicy, items: proof.items,
    trace: trace.map(({ registryRevision, fingerprint, reason, ...step }) => step) };
}

// Dependencies are injected so persistence/re-read failures can be exercised
// without an authenticated browser or any writes to a real catalogue.
export async function applyReviewedEquipmentEffect(review, { loadData, rpc, onCentral = () => {}, onProgress = () => {} }) {
  if (!review.canApply) throw new Error('Teste o efeito em uma condição ativa e confira os outros ajustes pendentes antes de aplicar.');
  onProgress('Conferindo os dados do teste…');
  const fresh = await loadData();
  if (!fresh.central.permissions.edit || !fresh.central.permissions.publish) throw new Error('Sua conta precisa de permissão para editar e publicar equipamentos.');
  if (fresh.central.draft_revision !== review.expectedRevision || fresh.central.active_publication !== review.expectedPublication) throw new Error('Outra revisão foi salva. Atualize a Central e teste novamente.');
  const current = previewEquipmentEffect(fresh, review.input);
  if (!equal(current.payload, review.payload) || !equal(calculationIdentity(current.proof), calculationIdentity(review.proof)) || !current.canApply) throw new Error('O equipamento ou o resultado mudou desde o teste. Atualize a Central e teste novamente.');
  let central = fresh.central;
  if (!equal(central.draft, review.payload)) {
    onProgress('Salvando o efeito testado…');
    const saved = await rpc('admin_save_status_central_v1', { p_expected_revision: central.draft_revision, p_payload: review.payload,
      p_reason: statusActionRecord('efeito testado', `${review.row.name}; ${review.row.rarity}; ${review.definition.name}.`) });
    central = await rpc('admin_get_status_central_v1');
    if (central.draft_revision !== saved.draft_revision || !equal(central.draft, review.payload)) throw new Error('A gravação respondeu, mas o rascunho relido é diferente. Atualize a Central antes de continuar.');
    await onCentral(central);
  }
  if (central.active_publication !== review.expectedPublication) throw new Error('A publicação mudou durante a gravação. O rascunho foi salvo; atualize e teste novamente.');
  onProgress('Aplicando o efeito no site…');
  const result = await rpc('admin_publish_status_central_v1', { p_expected_revision: central.draft_revision,
    p_expected_publication: central.active_publication,
    p_reason: statusActionRecord('aplicação de efeito testado', `${review.row.name}; ${review.row.rarity}; ${review.definition.name}.`) });
  central = await rpc('admin_get_status_central_v1');
  if (central.active_publication !== result.active_publication || central.published.fingerprint !== result.published.fingerprint || !equal(central.published.payload, runtimePayload(review.payload))) throw new Error('A publicação respondeu, mas a releitura não confirmou este efeito. Atualize e use “Verificar no site”.');
  await onCentral(central);
  return { ...fresh, central };
}
export async function verifyEquipmentEffect(data, input, requestBrain) {
  const proof = buildStatusProof(data, input.heroId, [{ equipmentId: input.equipmentId, variantId: input.variantId }], compileStatusRegistry(data.central.published), input.conditions || {});
  const step = proof.calculation.trace.find(t => t.source?.kind === 'equipment_variant' && t.source.id === input.variantId && t.attributeKey === input.rowKey);
  if (step?.status !== 'applied') return { confirmed: false, step, proof, reason: step?.reason || 'Este efeito ainda não está aplicado neste cenário.' };
  const response = await requestBrain(input.heroId, proof.items, input.conditions || {});
  const parity = compareStatusCalculations(proof.calculation, response.calculationTrace);
  return { confirmed: parity.equal, reason: parity.reason, step, proof };
}
