import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { equipmentAttributeWithSource } from '../admin/js/equipment-effect-text.js';

import {
  EQUIPMENT_SCOPE_TYPES,
  buildEquipmentScopePayload,
  inferEquipmentScope
} from '../admin/js/equipment-scope.js';

test('serializa escopo genérico sem vínculos residuais', () => {
  assert.deepEqual(buildEquipmentScopePayload({ scopeType: 'generic' }), {
    scope_type: 'generic',
    hero_id: null,
    class_id: null,
    is_personal: false
  });
});

test('serializa exclusividade de classe sem torná-la pessoal', () => {
  assert.deepEqual(buildEquipmentScopePayload({
    scopeType: 'class',
    classId: 'class-sniper'
  }), {
    scope_type: 'class',
    hero_id: null,
    class_id: 'class-sniper',
    is_personal: false
  });
});

test('serializa exclusividade pessoal com herói como autoridade única', () => {
  assert.deepEqual(buildEquipmentScopePayload({
    scopeType: 'hero',
    heroId: 'hero-slayer'
  }), {
    scope_type: 'hero',
    hero_id: 'hero-slayer',
    class_id: null,
    is_personal: true
  });
});

test('rejeita escopos incompletos ou contraditórios', () => {
  assert.throws(
    () => buildEquipmentScopePayload({ scopeType: 'class' }),
    /classe exclusiva/
  );
  assert.throws(
    () => buildEquipmentScopePayload({ scopeType: 'hero' }),
    /herói exclusivo/
  );
  assert.throws(
    () => buildEquipmentScopePayload({ scopeType: 'generic', heroId: 'hero-slayer' }),
    /não pode manter vínculo/
  );
  assert.throws(
    () => buildEquipmentScopePayload({
      scopeType: 'hero',
      heroId: 'hero-slayer',
      classId: 'class-sniper'
    }),
    /segundo vínculo de classe/
  );
});

test('recupera escopo salvo sem inferir pelo nome do equipamento', () => {
  assert.equal(inferEquipmentScope({ name: 'Bornal Slayer' }).scopeType, EQUIPMENT_SCOPE_TYPES.GENERIC);
  assert.deepEqual(inferEquipmentScope({ class_id: 'class-sniper', is_personal: false }), {
    scopeType: EQUIPMENT_SCOPE_TYPES.CLASS,
    heroId: null,
    classId: 'class-sniper',
    coherent: true
  });
  assert.deepEqual(inferEquipmentScope({ hero_id: 'hero-slayer', is_personal: true }), {
    scopeType: EQUIPMENT_SCOPE_TYPES.HERO,
    heroId: 'hero-slayer',
    classId: null,
    coherent: true
  });
});

test('mantém escopo legado incoerente visível para correção', () => {
  assert.deepEqual(inferEquipmentScope({ is_personal: true }), {
    scopeType: EQUIPMENT_SCOPE_TYPES.HERO,
    heroId: null,
    classId: null,
    coherent: false
  });
  assert.deepEqual(inferEquipmentScope({ hero_id: 'hero-slayer', is_personal: false }), {
    scopeType: EQUIPMENT_SCOPE_TYPES.HERO,
    heroId: 'hero-slayer',
    classId: null,
    coherent: false
  });
});

const editorSource = fs.readFileSync(new URL('../admin/js/equipment-editor-core.js', import.meta.url), 'utf8');
const editorHtml = fs.readFileSync(new URL('../admin/equipment-editor.html', import.meta.url), 'utf8');

function editorHarness(equipmentId = null) {
  const elements = new Map([...editorHtml.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], {
    value: '', checked: false, innerHTML: '', textContent: '', files: [], dataset: {}, hidden: false,
    classList: { add() {}, remove() {} },
    setAttribute() {}, removeAttribute() {}, focus() {}, scrollIntoView() {},
    querySelectorAll: () => [], closest() { return this; },
    appendChild() {}
  }]));
  const storage = new Map();
  const saves = [];
  const sandbox = {
    console, URL, Object, Number, String, Map, Set, JSON,
    EQUIPMENT_SCOPE_TYPES, buildEquipmentScopePayload, inferEquipmentScope, equipmentAttributeWithSource,
    rarityRowOperators: [],
    meta: { rarities: [], slots: [], sets: [], classes: [], heroes: [] },
    equipmentId, currentBundle: null, importWasApplied: false, importBackup: null, isSaving: false,
    IMPORT_KEY: 'equipment-import-draft', IMPORT_BACKUP_KEY: 'equipment-import-form-backup',
    document: {
      getElementById: id => elements.get(id),
      querySelectorAll: () => [], querySelector: () => null
    },
    window: { setTimeout: callback => callback(), dispatchEvent() {} },
    location: { href: 'https://example.test/admin/equipment-editor.html' },
    history: { replaceState() {} },
    sessionStorage: {
      setItem: (key, value) => storage.set(key, value),
      getItem: key => storage.get(key) || null,
      removeItem: key => storage.delete(key)
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    form: elements.get('form'), rarityHost: elements.get('rarities'), bonusHost: elements.get('bonuses'),
    renderRarities() {}, addBonusRow() {}, showImportSummary() {}, setMessage() {},
    validateRarityRowOperators() {},
    saveEquipmentBundle: async data => {
      saves.push(data);
      return { ...data.equipment, id: data.equipmentId || 'new-saved-id', operation: data.equipmentId ? 'updated' : 'created' };
    }
  };
  vm.createContext(sandbox);
  for (const name of [
    'scopeElements', 'syncEquipmentScopeFields', 'applyEquipmentScope', 'collectEquipmentScopePayload',
    'readRarityAttributeRow', 'collectRarityVariants',
    'validateRequiredEquipmentFields', 'collectCurrentFormState', 'restoreFormState', 'saveImportBackup',
    'clearImportBackup', 'fillFromDraft', 'fillExisting', 'slugify'
  ]) {
    const start = editorSource.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `editor function missing: ${name}`);
    vm.runInContext(editorSource.slice(start, editorSource.indexOf('\n}', start) + 2), sandbox);
  }
  const submitStart = editorSource.indexOf('form.onsubmit =');
  vm.runInContext(editorSource.slice(submitStart, editorSource.indexOf('\nmeta =', submitStart)), sandbox);
  return { sandbox, elements, storage, saves };
}

test('formulário novo exige decisão explícita e alterna campos visíveis', () => {
  const { sandbox, elements } = editorHarness();
  sandbox.applyEquipmentScope();
  assert.equal(elements.get('scope-type').value, '');
  assert.throws(() => sandbox.collectEquipmentScopePayload(), /Selecione quem/);
  sandbox.applyEquipmentScope({ scopeType: 'hero', heroId: 'slayer' });
  assert.equal(elements.get('scope-hero-field').hidden, false);
  assert.equal(elements.get('scope-class-field').hidden, true);
  assert.equal(elements.get('scope-hero-id').required, true);
  sandbox.applyEquipmentScope({ scopeType: 'generic' });
  assert.equal(elements.get('scope-hero-id').disabled, true);
  assert.equal(elements.get('scope-class-id').disabled, true);
  assert.match(editorHtml, /\.equipment-form-field\[hidden\]\s*\{\s*display: none;/);
});

test('leitura, importação e desfazer preservam dono e classe no editor real', () => {
  const { sandbox, storage } = editorHarness('saved-item');
  sandbox.fillExisting({
    equipment: { id: 'saved-item', name: 'Item pessoal', hero_id: 'slayer', is_personal: true },
    variants: [], bonuses: []
  });
  assert.equal(sandbox.collectEquipmentScopePayload().hero_id, 'slayer');
  sandbox.fillFromDraft({ name: 'Nome importado', variants: {}, bonuses: [] });
  assert.equal(sandbox.collectEquipmentScopePayload().hero_id, 'slayer');
  const backup = JSON.parse(storage.get('equipment-import-form-backup'));
  assert.equal(backup.scopeHeroId, 'slayer');
  sandbox.applyEquipmentScope({ scopeType: 'class', classId: 'sniper' });
  sandbox.restoreFormState(backup);
  assert.equal(sandbox.collectEquipmentScopePayload().hero_id, 'slayer');
  sandbox.restoreFormState({ name: 'Backup antigo sem escopo' });
  assert.equal(sandbox.collectEquipmentScopePayload().hero_id, 'slayer');
  sandbox.fillExisting({ equipment: { class_id: 'sniper' }, variants: [], bonuses: [] });
  assert.equal(sandbox.collectEquipmentScopePayload().class_id, 'sniper');
});

test('salvamento real envia escopo e reutiliza o ID após criar', async () => {
  const { sandbox, elements, saves } = editorHarness();
  elements.get('name').value = 'Item do Slayer';
  elements.get('slug').value = 'item-do-slayer';
  elements.get('slot-id').value = 'head';
  sandbox.applyEquipmentScope({ scopeType: 'hero', heroId: 'slayer' });
  await sandbox.form.onsubmit({ preventDefault() {} });
  assert.equal(saves.length, 1);
  assert.equal(saves[0].equipment.hero_id, 'slayer');
  assert.equal(saves[0].equipment.is_personal, true);
  assert.equal(saves[0].equipment.class_id, null);
  assert.equal(sandbox.equipmentId, 'new-saved-id');
  sandbox.applyEquipmentScope({ scopeType: 'generic' });
  await sandbox.form.onsubmit({ preventDefault() {} });
  assert.equal(saves.length, 2);
  assert.equal(saves[1].equipmentId, 'new-saved-id');
  assert.equal(saves[1].equipment.hero_id, null);
  assert.equal(saves[1].equipment.is_personal, false);
});

test('salvamento incompleto não chama API nem produz efeitos externos', async () => {
  const { sandbox, elements, saves } = editorHarness();
  elements.get('name').value = 'Item';
  elements.get('slug').value = 'item';
  elements.get('slot-id').value = 'head';
  sandbox.applyEquipmentScope({ scopeType: 'hero' });
  await sandbox.form.onsubmit({ preventDefault() {} });
  assert.equal(saves.length, 0);
});

test('submit real envia a descrição corrigida e conserva OCR, unidade e confiança no payload', async () => {
  const {sandbox,elements,saves}=editorHarness('saved-boots');
  elements.get('name').value='Botas da Specnaz do Slayer';
  elements.get('slug').value='botas-da-specnaz-do-slayer';
  elements.get('slot-id').value='leg';
  sandbox.applyEquipmentScope({scopeType:'hero',heroId:'slayer'});
  sandbox.rarityRowOperators=['decrease_percent'];
  const original={label:'Dispersão da arma',value:'-14',unit:'%',raw:'-14% À DISPERSÃO DE TIRO DA ARMA QUANDO EM',confidence:.7,key:'weapon_dispersion_pct'};
  const label={value:'À DISPERSÃO DE TIRO DA ARMA QUANDO EM\nMOVIMENTO'},value={value:'14'};
  const row={dataset:{rowIndex:'0'},_equipmentAttributeSource:equipmentAttributeWithSource(original),querySelector:selector=>selector==='.attribute-label'?label:selector==='.attribute-value'?value:null};
  const card={dataset:{rarityId:'rarity-common'},querySelectorAll:selector=>{assert.equal(selector,'.attr-row');return [row];}};
  sandbox.rarityHost.querySelectorAll=selector=>{assert.equal(selector,'.rarity-card');return [card];};
  await sandbox.form.onsubmit({preventDefault(){}});
  assert.equal(saves.length,1);
  assert.equal(saves[0].equipment.hero_id,'slayer');
  assert.equal(saves[0].variants[0].rarity_id,'rarity-common');
  const actual=saves[0].variants[0].attributes[0];
  assert.equal(actual.label,label.value);assert.equal(actual.value,'14');assert.equal(actual.operator,'decrease_percent');
  assert.equal(actual.raw,original.raw);assert.equal(actual.unit,'%');assert.equal(actual.confidence,.7);
  assert.equal(actual.importedKey,'weapon_dispersion_pct');assert.equal(actual.key,undefined);
  assert.equal(actual.textReview,undefined);assert.equal(actual.textEdited,true);
});
