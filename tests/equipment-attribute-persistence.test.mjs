import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { analyzeEquipmentEvolutionV2 } from '../js/echo-brain-equipment-evolution-v2.js';
import { verifyEquipmentVariantReadback } from '../admin/js/equipment-attribute-persistence.js';

const expected = [{ rarity_id: 'comum', attributes: [{ label: 'Vida', value: '3', operator: 'decrease_percent' }] }];

test('releitura confirma todos os atributos apesar da ordenação de chaves JSONB', () => {
  const readback = [{ id: 'saved', rarity_id: 'comum', attributes: [{ operator: 'decrease_percent', value: '3', label: 'Vida' }] }];
  assert.equal(verifyEquipmentVariantReadback(expected, readback, true).status, 'confirmed');
});

test('releitura detecta sinal não salvo, valor divergente, linha perdida e raridade ausente', () => {
  for (const attributes of [
    [{ label: 'Vida', value: '3', operator: 'increase_percent' }],
    [{ label: 'Vida', value: '4', operator: 'decrease_percent' }],
    [{ label: 'Vida', value: '3' }],
    []
  ]) {
    assert.equal(verifyEquipmentVariantReadback(expected, [{ rarity_id: 'comum', attributes }], true).status, 'mismatch');
  }
  assert.equal(verifyEquipmentVariantReadback(expected, [], true).status, 'mismatch');
});

test('substituição integral confere também a quantidade de variantes', () => {
  const actual = [...expected, { rarity_id: 'raro', attributes: [] }];
  assert.equal(verifyEquipmentVariantReadback(expected, actual, true).status, 'mismatch');
  assert.equal(verifyEquipmentVariantReadback(expected, actual, false).status, 'confirmed');
});

function apiHarness({ changeStoredOperator = false, failReadback = false } = {}) {
  let saved = false;
  let stored = [{ rarity_id: 'comum', attributes: [{ label: 'Vida', value: '3', operator: 'increase_flat' }] }];
  const calls = [];
  const supabase = {
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; }, single() { return query; },
        then(resolve, reject) {
          const result = saved && failReadback
            ? { error: new Error('readback_unavailable') }
            : { data: table === 'equipments' ? { id: 'item', name: 'Vida' } : structuredClone(stored) };
          return Promise.resolve(result).then(resolve, reject);
        }
      };
      return query;
    },
    async rpc(name, payload) {
      calls.push({ name, payload: structuredClone(payload) });
      if (name === 'admin_save_equipment_bundle_v2') {
        stored = structuredClone(payload.p_variants);
        if (changeStoredOperator) delete stored[0].attributes[0].operator;
        saved = true;
        return { data: { equipment: { id: 'item', name: 'Vida' }, operation: 'updated' } };
      }
      return { data: { status: 'versioned' } };
    }
  };
  const context = vm.createContext({
    supabase, verifyEquipmentVariantReadback, analyzeEquipmentEvolutionV2,
    syncEquipmentAuditQueueFromDatabase: async () => ({ installed: true, issues: [] }),
    console: { warn() {} }, window: { location: { pathname: '/admin/equipment-editor.html' }, dispatchEvent() {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  });
  const source = fs.readFileSync(new URL('../admin/js/equipment-api.js?v=brain-evolution-4', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/\bexport /g, '');
  vm.runInContext(source, context);
  return {
    calls,
    save: () => context.saveEquipmentBundle({ equipmentId: 'item', equipment: { name: 'Vida' }, variants: expected, replaceVariants: true, auditSource: 'admin-editor' })
  };
}

test('API real envia o operador, relê a variante e registra mudança no Brain', async () => {
  const harness = apiHarness();
  const result = await harness.save();
  assert.equal(result.attributeVerification.status, 'confirmed');
  assert.equal(harness.calls[0].payload.p_variants[0].attributes[0].operator, 'decrease_percent');
  const brain = harness.calls.find(call => call.name === 'admin_echo_brain_record_equipment_change');
  assert.equal(brain.payload.p_analysis.affectsBrain, true);
  assert.equal(brain.payload.p_analysis.changes[0].type, 'attribute_operator_change');
});

test('API não confirma operador perdido no banco', async () => {
  const result = await apiHarness({ changeStoredOperator: true }).save();
  assert.equal(result.id, 'item');
  assert.equal(result.attributeVerification.status, 'mismatch');
});

test('falha de releitura preserva sucesso do RPC sem mentir sobre a confirmação', async () => {
  const harness = apiHarness({ failReadback: true });
  const result = await harness.save();
  assert.equal(result.id, 'item');
  assert.equal(result.attributeVerification.status, 'unavailable');
  assert.equal(harness.calls.filter(call => call.name === 'admin_save_equipment_bundle_v2').length, 1);
});
