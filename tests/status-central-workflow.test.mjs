import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, selection, id } from './fixtures/status-central-catalog.mjs';
import { equipmentEffectRows, compatibleTestHeroes, effectTargets, previewEquipmentEffect, applyReviewedEquipmentEffect, verifyEquipmentEffect, runtimePayload } from '../admin/js/status-central-workflow.js';

function simulatedDatabase(data, override = () => null) {
  const writes = [], reads = [];
  return { writes, reads,
    loadData: async () => structuredClone(data),
    rpc: async (name, args) => {
      const replacement = override(name, args, data);
      if (replacement) return replacement;
      if (name === 'admin_save_status_central_v1') {
        assert.equal(args.p_expected_revision, data.central.draft_revision);
        data.central.draft = structuredClone(args.p_payload);
        data.central.draft_revision++;
        writes.push(name);
      } else if (name === 'admin_publish_status_central_v1') {
        assert.equal(args.p_expected_revision, data.central.draft_revision);
        assert.equal(args.p_expected_publication, data.central.active_publication);
        data.central.active_publication++;
        data.central.published = { revision: data.central.draft_revision, fingerprint: `fixture-publication-${data.central.active_publication}`, payload: runtimePayload(data.central.draft) };
        writes.push(name);
      } else assert.equal(name, 'admin_get_status_central_v1');
      reads.push(name);
      return structuredClone(data.central);
    }
  };
}

test('o teste configura somente a linha e raridade escolhidas, mesmo com nomes idênticos', () => {
  const data = fixture(), before = structuredClone(data);
  const review = previewEquipmentEffect(data, selection());
  assert.equal(review.step.before, 50);
  assert.equal(review.step.after, 36);
  assert.equal(review.payload.bindings.length, 1);
  assert.equal(review.binding.attribute_key, '0');
  assert.equal(review.binding.source_id, id(7));
  assert.equal(review.others.length, 1);
  assert.equal(review.others[0].attributeKey, '1');
  assert.equal(review.canApply, true);
  assert.deepEqual(data, before, 'testar não altera sequer o rascunho em memória');
  assert.equal(equipmentEffectRows(data, id(3), id(7)).length, 2);
  assert.equal(compatibleTestHeroes(data, id(3)).length, 1);
});
test('mira, ângulo total e acréscimo de movimento continuam destinos diferentes', () => {
  const data = fixture();
  const aiming = previewEquipmentEffect(data, selection({ rowKey: '1', sourceKey: 'aimed_dispersion', condition: 'aiming', conditions: { aiming: true } }));
  assert.equal(aiming.step.before, 20);
  assert.equal(aiming.step.after, 16.8);
  assert.equal(aiming.definition.source_key, 'aimed_dispersion');
  const increment = previewEquipmentEffect(data, selection({ sourceKey: 'moving_dispersion' }));
  assert.equal(increment.step.before, 5);
  assert.equal(increment.step.after, 3.5999999999999996);
  assert.equal(increment.definition.source_key, 'moving_dispersion');
  assert.equal(effectTargets(data, 'weapon', id(1)).length, 3);
});
test('condição inativa ou desconhecida nunca libera aplicação como teste bem sucedido', () => {
  for (const [conditions, status] of [[{ moving: false }, 'not_applicable'], [{}, 'condition_required']]) {
    const review = previewEquipmentEffect(fixture(), selection({ conditions }));
    assert.equal(review.step.status, status);
    assert.equal(review.canApply, false);
  }
});
test('base ausente não vira zero e unidade não é inferida pelo texto', () => {
  const data = fixture();
  data.bases[0].weapon_stats.weapon_spread = null;
  const review = previewEquipmentEffect(data, selection());
  assert.equal(review.step.status, 'missing_base');
  assert.equal(review.canApply, false);
  assert.throws(() => previewEquipmentEffect(data, selection({ unit: '' })), /unidade/);
  assert.throws(() => previewEquipmentEffect(data, selection({ operator: '' })), /soma/);
  assert.throws(() => previewEquipmentEffect(data, selection({ condition: '' })), /Condição/);
});
test('texto incompleto e herói incompatível impedem teste válido', () => {
  const data = fixture();
  data.variants[0].attributes[0].textReview = 'truncated';
  assert.throws(() => previewEquipmentEffect(data, selection()), /incompleto/);
  assert.throws(() => previewEquipmentEffect(fixture(), selection({ heroId: id(2) })), /dados-base/);
});
test('outros ajustes no rascunho ficam visíveis e não são publicados junto silenciosamente', async () => {
  const data = fixture();
  data.central.draft.definitions.push({ id: 'unrelated_health', name: 'Vida', scope: 'hero', source_key: 'health', unit: 'health_point', kind: 'scalar', direction: 'higher', evidence: 'fixture' });
  const review = previewEquipmentEffect(data, selection());
  assert.equal(review.step.status, 'applied');
  assert.equal(review.unrelated.length, 1);
  assert.equal(review.canApply, false);
  const db = simulatedDatabase(data);
  await assert.rejects(applyReviewedEquipmentEffect(review, db), /outros ajustes/);
  assert.equal(db.writes.length, 0);
});
test('aplicar revalida, salva, relê, publica e relê exatamente o efeito testado', async () => {
  const data = fixture(), review = previewEquipmentEffect(data, selection()), db = simulatedDatabase(data);
  const result = await applyReviewedEquipmentEffect(review, db);
  assert.deepEqual(db.reads, ['admin_save_status_central_v1', 'admin_get_status_central_v1', 'admin_publish_status_central_v1', 'admin_get_status_central_v1']);
  assert.deepEqual(result.central.published.payload, runtimePayload(review.payload));
  assert.equal(result.central.published.payload.bindings[0].evidence, undefined);
  const repeat = previewEquipmentEffect(result, selection());
  assert.equal(repeat.alreadyPublished, true);
  assert.equal(repeat.unrelated.length, 0);
});
test('regra já publicada é reconhecida mesmo quando não é a última na lista', async () => {
  const data = fixture(), first = previewEquipmentEffect(data, selection());
  data.central.draft = first.payload;
  const second = previewEquipmentEffect(data, selection({ rowKey: '1', bindingId: id(10), sourceKey: 'aimed_dispersion', condition: 'aiming' }));
  data.central.draft = second.payload;
  data.central.published.payload = runtimePayload(second.payload);
  assert.equal(previewEquipmentEffect(data, selection()).alreadyPublished, true);
});
test('alterar valor-base, fonte ou revisão depois do teste impede qualquer gravação', async () => {
  for (const mutate of [
    data => data.bases[0].weapon_stats.weapon_spread = 51,
    data => data.variants[0].attributes[0].value = '-29',
    data => data.central.draft_revision++,
    data => data.central.active_publication++
  ]) {
    const data = fixture(), review = previewEquipmentEffect(data, selection());
    mutate(data);
    const db = simulatedDatabase(data);
    await assert.rejects(applyReviewedEquipmentEffect(review, db), /mudou|revisão/);
    assert.equal(db.writes.length, 0);
  }
});
test('rascunho divergente na releitura bloqueia publicação', async () => {
  const data = fixture(), review = previewEquipmentEffect(data, selection());
  const db = simulatedDatabase(data, name => name === 'admin_get_status_central_v1' ? { ...data.central, draft_revision: 999 } : null);
  await assert.rejects(applyReviewedEquipmentEffect(review, db), /rascunho relido é diferente/);
  assert.deepEqual(db.writes, ['admin_save_status_central_v1']);
});
test('mudança de publicação durante o salvamento preserva rascunho sem publicar', async () => {
  const data = fixture(), review = previewEquipmentEffect(data, selection());
  const db = simulatedDatabase(data, name => {
    if (name === 'admin_get_status_central_v1') data.central.active_publication++;
  });
  await assert.rejects(applyReviewedEquipmentEffect(review, db), /publicação mudou/);
  assert.deepEqual(db.writes, ['admin_save_status_central_v1']);
});
test('falta de permissão não salva e falha ao publicar não é reportada como sucesso', async () => {
  const data = fixture(), review = previewEquipmentEffect(data, selection());
  data.central.permissions.publish = false;
  const db = simulatedDatabase(data);
  await assert.rejects(applyReviewedEquipmentEffect(review, db), /permissão/);
  assert.equal(db.writes.length, 0);
  data.central.permissions.publish = true;
  const failure = simulatedDatabase(data, name => { if (name === 'admin_publish_status_central_v1') throw new Error('Publicação indisponível'); });
  await assert.rejects(applyReviewedEquipmentEffect(review, failure), /indisponível/);
  assert.deepEqual(failure.writes, ['admin_save_status_central_v1']);
});
test('verificação não confirma efeito inativo, mas confere a linha ativa com a prova do Brain', async () => {
  const data = fixture(), review = previewEquipmentEffect(data, selection());
  const published = await applyReviewedEquipmentEffect(review, simulatedDatabase(data));
  let requests = 0;
  const inactive = await verifyEquipmentEffect(published, selection({ conditions: { moving: false } }), async () => { requests++; });
  assert.equal(inactive.confirmed, false);
  assert.equal(requests, 0);
  const local = previewEquipmentEffect(published, selection()).published.calculation;
  const success = await verifyEquipmentEffect(published, selection(), async () => ({ calculationTrace: local }));
  assert.equal(success.confirmed, true);
  assert.equal(success.proof.calculation.complete, false, 'a confirmação da linha não esconde outra pendência do item');
  const wrong = structuredClone(local); wrong.final.weapon_weapon_spread = 999;
  const mismatch = await verifyEquipmentEffect(published, selection(), async () => ({ calculationTrace: wrong }));
  assert.equal(mismatch.confirmed, false);
  const differentRevision = structuredClone(local); differentRevision.registry.revision++;
  assert.equal((await verifyEquipmentEffect(published, selection(), async () => ({ calculationTrace: differentRevision }))).confirmed, false);
});
