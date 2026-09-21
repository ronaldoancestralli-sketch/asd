import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { equipmentAttributeOperation } from '../js/equipment-attribute-calculation.js';
import {
  matchCalculationAttribute,
  publishedCalculationCoverage
} from '../admin/js/equipment-calculation-v2-coverage.js';

import { equipmentAttributeWithSource } from '../admin/js/equipment-effect-text.js';

const editor = fs.readFileSync(new URL('../admin/js/equipment-editor-core.js', import.meta.url), 'utf8');
const assistant = fs.readFileSync(new URL('../admin/js/equipment-attribute-assistant.js', import.meta.url), 'utf8');
const semanticCatalog = JSON.parse(fs.readFileSync(
  new URL('./fixtures/calculation-semantic-catalog.json', import.meta.url),
  'utf8'
));
const semanticCoverage = publishedCalculationCoverage({
  contract: 'echo-calculation-workspace/v2',
  revision: 1,
  state: 'draft',
  effects: [],
  definitions: semanticCatalog.definitions,
  aliases: semanticCatalog.aliases,
  contexts: [],
  operations: [
    { id: 'flat', state: 'published' },
    { id: 'percent', state: 'published' }
  ],
  published: null
}, { source: 'fixture' });

function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}

function harness() {
  const options = [
    { id: 'increase_flat', symbol: '+', label: 'Somar' },
    { id: 'decrease_flat', symbol: '−', label: 'Reduzir' },
    { id: 'increase_percent', symbol: '+%', label: 'Aumentar em %' },
    { id: 'decrease_percent', symbol: '−%', label: 'Reduzir em %' }
  ];
  const rows = Array.from({ length: 11 }, (_, index) => {
    const inputs = [{ value: 'Vida máxima do herói' }, { value: String(index + 3) }];
    const note = { className: '', innerHTML: '' };
    const indicator = { textContent: '', title: '', classList: { toggle() {} } };
    return {
      closest: () => ({dataset:{variantId:'fixture',raritySlug:`slug-${index}`}}), dataset: { rowIndex: '0' }, classList: { remove() {}, add() {} }, note, indicator, inputs,
      querySelectorAll: () => inputs,
      querySelector: selector => selector === '.rarity-value-operator' ? indicator : note
    };
  });
  const context = vm.createContext({
    rows, RARITY_ROW_OPERATORS_BY_ID: new Map(options.map(option => [option.id, option])),
    rarityRowOperators: ['increase_flat'], rarityRowOperatorConflicts: new Set(),
    rarityHost: { querySelectorAll: () => rows, dispatchEvent: event => {
      assert.equal(event.type, 'equipment:operators-changed');
      vm.runInContext('rows.forEach(analyzeRow)', context);
    } },
    renderRarityOperatorRows() {}, refreshSummary() {},
    equipmentAttributeWithSource, equipmentAttributeOperation,
    matchCalculationAttribute, calculationV2Coverage: () => semanticCoverage,
    URLSearchParams, location:{search:'?id=fixture'},
    resolvePersistedAttributeClassification: () => null,
    resolveExternalDataEffect: () => null,
    CustomEvent: class { constructor(type) { this.type = type; } }
  });
  for (const name of ['rarityOperatorOption', 'refreshRarityRowAnnotations', 'setRarityRowOperator']) {
    vm.runInContext(extract(editor, name), context);
  }
  for (const name of ['escapeHtml', 'persistedFor', 'resolveAnyExternal', 'rowInputs', 'ensureAssistant', 'resolutionReason', 'analyzeRow']) {
    vm.runInContext(extract(assistant, name), context);
  }
  return { context, rows };
}

test('clique de operador atualiza indicador e interpretação nas 11 raridades', () => {
  const { context, rows } = harness();
  for (const [operator, symbol] of [
    ['increase_flat', '+'],
    ['decrease_flat', '−'],
    ['increase_percent', '+%'],
    ['decrease_percent', '−%']
  ]) {
    context.setRarityRowOperator(0, operator);
    for (const row of rows) {
      assert.equal(row.indicator.textContent, symbol);
      assert.equal(row.dataset.attributeOperator, operator);
      assert.equal(row.dataset.attributeState, 'unknown');
      assert.equal(row.dataset.resolutionStatus, 'pending_alias');
      assert.ok(row.note.innerHTML.includes('Nova frase sem alias publicado.'));
      assert.ok(row.note.innerHTML.includes('Central antiga não substituirá esta decisão.'));
      assert.ok(!row.note.innerHTML.includes('Regra reconhecida'));
    }
  }
});

test('reabrir sem operador remove confirmação anterior e pede seleção', () => {
  const { context, rows } = harness();
  context.setRarityRowOperator(0, 'increase_percent');
  context.rarityRowOperators = [''];
  context.refreshRarityRowAnnotations();
  for (const row of rows) {
    assert.equal(row.dataset.attributeState, 'operator_required');
    assert.ok(row.note.innerHTML.includes('Selecione o operador'));
    assert.ok(!row.note.innerHTML.includes('Ao salvar:'));
  }
});

test('valor com vírgula e sinal Unicode recebe a mesma magnitude da prévia e do motor', () => {
  const { context, rows } = harness();
  rows[0].inputs[1].value = '−3,5%';
  context.setRarityRowOperator(0, 'increase_percent');
  assert.equal(rows[0].dataset.resolutionStatus, 'pending_alias');
  assert.ok(rows[0].note.innerHTML.includes('Nova frase sem alias publicado.'));
  assert.notEqual(rows[0].dataset.attributeState, 'invalid');
});

function persistenceHarness() {
  const rows=Array.from({length:11},(_,i)=>{
    const source={label:'À DISPERSÃO DE TIRO DA ARMA QUANDO EM MOVIMENTO',value:String(i+14),unit:'%',raw:`-${i+14}% À DISPERSÃO DE TIRO DA ARMA QUANDO EM MOVIMENTO`,confidence:.7,key:'weapon_dispersion_pct'};
    const label={value:' '+source.label.replace('EM MOVIMENTO','EM\nMOVIMENTO')+' '},value={value:` ${i+14} `};
    return {dataset:{rowIndex:'0'},_equipmentAttributeSource:equipmentAttributeWithSource(source),label,value,
      querySelector(selector){if(selector==='.attribute-label')return label;if(selector==='.attribute-value')return value;throw new Error('Unexpected selector: '+selector);},
      querySelectorAll(selector){if(selector==='input')return [value];if(selector==='textarea, input')return [label,value];throw new Error('Unexpected selector: '+selector);}
    };
  });
  const cards=rows.map((row,i)=>({dataset:{rarityId:'rarity-'+i,raritySlug:'slug-'+i},querySelectorAll:selector=>{assert.equal(selector,'.attr-row');return [row];}}));
  const context=vm.createContext({rows,cards,equipmentAttributeWithSource,rarityRowOperators:['decrease_percent'],
    RARITY_ROW_OPERATORS_BY_ID:new Map([['decrease_percent',{id:'decrease_percent'}]]),
    rarityHost:{querySelectorAll(selector){if(selector==='.rarity-card')return cards;if(selector==='.attr-row')return rows;throw new Error('Unexpected selector: '+selector);}},
    bonusHost:{querySelectorAll:()=>[]},document:{getElementById:()=>({value:'',checked:false,innerHTML:''})}
  });
  for(const name of ['rarityOperatorOption','readRarityAttributeRow','collectRarityVariants','collectCurrentFormState','validateRarityRowOperators'])vm.runInContext(extract(editor,name),context);
  return {context,rows};
}

test('coleta usada ao salvar lê textarea e valor separadamente, preservando origem nas 11 raridades',()=>{
  const {context,rows}=persistenceHarness();
  const variants=context.collectRarityVariants();
  assert.equal(variants.length,11);
  variants.forEach((variant,i)=>{
    assert.equal(variant.rarity_id,'rarity-'+i);
    assert.equal(variant.attributes.length,1);
    const attribute=variant.attributes[0];
    assert.equal(attribute.label,rows[i].label.value.trim());assert.ok(attribute.label.endsWith('EM\nMOVIMENTO'));
    assert.equal(attribute.value,String(i+14));assert.equal(attribute.operator,'decrease_percent');
    assert.equal(attribute.raw,rows[i]._equipmentAttributeSource.raw);assert.equal(attribute.confidence,.7);assert.equal(attribute.unit,'%');
    assert.equal(attribute.key,undefined);assert.equal(attribute.importedKey,'weapon_dispersion_pct');
  });
  assert.match(editor,/const variants = collectRarityVariants\(\);/,'the real save handler must use this exact collector');
  assert.match(editor,/class="attribute-value"/);
});

test('backup anterior à importação mantém texto multilinha e metadados para desfazer',()=>{
  const {context,rows}=persistenceHarness();
  const backup=context.collectCurrentFormState();
  rows.forEach((row,i)=>{
    const attribute=backup.variants['slug-'+i][0];
    assert.equal(attribute.label,row.label.value);assert.equal(attribute.value,row.value.value);
    assert.equal(attribute.raw,row._equipmentAttributeSource.raw);assert.equal(attribute.confidence,.7);
    assert.equal(attribute.operator,'decrease_percent');
  });
});

test('descrição preenchida sem valor ainda exige operador; linha vazia não mantém um efeito antigo',()=>{
  const {context,rows}=persistenceHarness();
  context.rarityRowOperators=[''];rows.forEach(row=>{row.value.value='';});
  assert.throws(()=>context.validateRarityRowOperators(),/Selecione/);
  rows.forEach(row=>{row.label.value='';});
  assert.doesNotThrow(()=>context.validateRarityRowOperators());
  assert.ok(context.collectRarityVariants().every(variant=>variant.attributes.length===0));
});
