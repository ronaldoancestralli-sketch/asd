import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildEquipmentScopePayload,
  verifyEquipmentScopeReadback
} from '../admin/js/equipment-scope.js';
import {
  matchPublishedCalculationAttribute,
  publishedCalculationCoverage
} from '../admin/js/equipment-calculation-v2-coverage.js';

const SNIPER_CLASS_ID = 'c353949f-cf4a-47c0-8f88-bc18fcca84fa';

test('releitura confirma equipamento restrito à mesma classe', () => {
  const expected = buildEquipmentScopePayload({
    scopeType: 'class',
    classId: SNIPER_CLASS_ID
  });
  const verification = verifyEquipmentScopeReadback(expected, {
    class_id: SNIPER_CLASS_ID,
    hero_id: null,
    is_personal: false
  });

  assert.equal(verification.status, 'confirmed');
  assert.equal(verification.persisted.scopeType, 'class');
});

test('releitura detecta quando o banco transforma escopo de classe em genérico', () => {
  const expected = buildEquipmentScopePayload({
    scopeType: 'class',
    classId: SNIPER_CLASS_ID
  });
  const verification = verifyEquipmentScopeReadback(expected, {
    class_id: null,
    hero_id: null,
    is_personal: false
  });

  assert.equal(verification.status, 'mismatch');
  assert.equal(verification.expected.scopeType, 'class');
  assert.equal(verification.persisted.scopeType, 'generic');
});

test('RPC persiste o escopo tanto em criação quanto em atualização', () => {
  const migration = fs.readFileSync(
    new URL(
      '../supabase/migrations/20260917180250_persist_equipment_scope_and_repair_body_armor.sql',
      import.meta.url
    ),
    'utf8'
  );

  assert.match(
    migration,
    /is_personal = case when v_scope_present then v_scope_is_personal else e\.is_personal end/
  );
  assert.match(
    migration,
    /hero_id = case when v_scope_present then v_scope_hero_id else e\.hero_id end/
  );
  assert.match(
    migration,
    /class_id = case when v_scope_present then v_scope_class_id else e\.class_id end/
  );
  assert.match(
    migration,
    /display_order, enabled, is_personal, hero_id, class_id/
  );
  assert.match(
    migration,
    /equipment\.slug = 'armadura-corporal'[\s\S]*hero_class\.slug = 'franco-atirador'/
  );
});

test('correção do artigo duplicado volta a coincidir com a publicação V2', () => {
  const coverage = publishedCalculationCoverage({
    revision: 3,
    published: {
      id: 2,
      workspaceRevision: 3,
      fingerprint: 'body-armor-v3'
    },
    effects: [{
      id: 'armor',
      kind: 'numeric',
      description: 'À ARMADURA MÁXIMA DO HERÓI',
      target: 'hero.armor',
      operation: 'percent',
      values: { epico: 6 }
    }]
  });

  assert.equal(
    matchPublishedCalculationAttribute(
      {
        label: 'À A ARMADURA MÁXIMA DO HERÓI',
        value: '6',
        operator: 'increase_percent'
      },
      { coverage, raritySlug: 'epico' }
    ),
    null
  );
  assert.equal(
    matchPublishedCalculationAttribute(
      {
        label: 'À ARMADURA MÁXIMA DO HERÓI',
        value: '6',
        operator: 'increase_percent'
      },
      { coverage, raritySlug: 'epico' }
    )?.effect.target,
    'hero.armor'
  );
});

test('salvamento mostra o motivo específico quando ainda houver pendência', () => {
  const source = fs.readFileSync(
    new URL('../admin/js/equipment-attribute-assistant.js', import.meta.url),
    'utf8'
  );
  assert.match(source, /Motivo:/);
  assert.match(source, /não coincide com uma publicação do Cálculo V2 nem com um vínculo publicado na Central/);
});

test('API devolve o escopo relido do banco e expõe a verificação ao editor', () => {
  const apiFile = ['equipment', 'api.js'].join('-');
  const apiSource = fs.readFileSync(
    new URL(`../admin/js/${apiFile}`, import.meta.url),
    'utf8'
  );
  const editorSource = fs.readFileSync(
    new URL('../admin/js/equipment-editor-core.js', import.meta.url),
    'utf8'
  );

  assert.match(apiSource, /verifyEquipmentScopeReadback\(equipment, afterBundle\.equipment\)/);
  assert.match(apiSource, /\.\.\.\(afterBundle\?\.equipment \|\| saved\)/);
  assert.match(apiSource, /scopeVerification,/);
  assert.match(editorSource, /scopeVerification\?\.status === 'confirmed'/);
});
