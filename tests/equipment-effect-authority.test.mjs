import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEquipmentOcr } from '../admin/js/admin-local-ocr-parser.js';
import { equipmentAttributeWithSource } from '../admin/js/equipment-effect-text.js';
import { previewEquipmentAttribute } from '../admin/js/equipment-attribute-preview.js';
import { applyEquipmentStats } from '../js/game-stat-engine.js';
import { compileStatusRegistry, emptyStatusPayload, statusSource, validateStatusPayload } from '../js/status-registry-v1.js';
import { discoverStatusFields, statusTargetChoices, suggestedStatusId, statusActionRecord, draftStatusRegistry } from '../admin/js/status-central-model.js';

const variant = '11111111-1111-4111-8111-111111111111';
const binding = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const context = { rarities: [{ name:'Estelar', slug:'estelar', rank:9 }, { name:'Imortal', slug:'imortal', rank:10 }], slots:[], sets:[] };
const read = text => parseEquipmentOcr([{text,region:'equipment-effects',confidence:96}],context,{name:'BOTAS DA SPECNAZ DO SLAYER'});
const compile = payload => compileStatusRegistry({revision:1,fingerprint:'isolated-fixture',payload});

test('Specnaz screenshot: continuation MOVIMENTO survives and does not consume the next effect or rarity',()=>{
  const result=read('ESTELAR\n-26% À DISPERSÃO DE TIRO DA ARMA QUANDO EM\nMOVIMENTO\n+10 AO PODER DE PERFURAÇÃO DA ARMA\nIMORTAL');
  assert.equal(result.variants.estelar.length,2);
  const [spread,penetration]=result.variants.estelar;
  assert.equal(spread.label,'À DISPERSÃO DE TIRO DA ARMA QUANDO EM MOVIMENTO');
  assert.equal(spread.raw,'-26% À DISPERSÃO DE TIRO DA ARMA QUANDO EM MOVIMENTO');
  assert.equal(spread.value,'-26');assert.equal(spread.key,undefined);
  assert.equal(penetration.value,'10');assert.equal(penetration.label,'AO PODER DE PERFURAÇÃO DA ARMA');
  assert.equal(result.variants.imortal,undefined);
});

test('texto longo une a continuação de dano à armadura e à vida sem consumir o efeito seguinte',()=>{
  const result=read('ESTELAR\n+10% DE DANO À ARMADURA E\nÀ VIDA DO INIMIGO\n+5% À VELOCIDADE DE MOVIMENTO\nIMORTAL');
  assert.equal(result.variants.estelar.length,2);
  assert.equal(result.variants.estelar[0].label,'DE DANO À ARMADURA E À VIDA DO INIMIGO');
  assert.equal(result.variants.estelar[0].raw,'+10% DE DANO À ARMADURA E À VIDA DO INIMIGO');
  assert.equal(result.variants.estelar[1].label,'À VELOCIDADE DE MOVIMENTO');
  assert.equal(result.variants.imortal,undefined);
});

test('movement, aiming and unaimed effects never collapse even when numbers match',()=>{
  const result=read('ESTELAR\n-16% À DISPERSÃO DE TIRO DA ARMA QUANDO EM\nMOVIMENTO\n-16% DE DISPERSÃO DO TIRO AO MIRAR\n-16% DE DISPERSÃO DO TIRO SEM MIRAR');
  assert.equal(result.variants.estelar.length,3);
  assert.ok(result.variants.estelar[0].label.endsWith('EM MOVIMENTO'));
  assert.ok(result.variants.estelar[1].label.endsWith('AO MIRAR'));
  assert.ok(result.variants.estelar[2].label.endsWith('SEM MIRAR'));
});

test('a missing continuation is flagged, never invented or borrowed from another reading',()=>{
  const result=parseEquipmentOcr([
    {text:'ESTELAR\n-26% À DISPERSÃO DE TIRO DA ARMA QUANDO EM',region:'equipment-effects',name:'a.png'},
    {text:'MOVIMENTO',region:'equipment-effects',name:'b.png'}
  ],context,{name:'Botas'});
  assert.ok(result.variants.estelar[0].textReview);
  assert.ok(!result.variants.estelar[0].raw.includes('MOVIMENTO'));
  assert.ok(result.ocr.warnings.some(w=>w.includes('Texto incompleto')));
});

test('edit/save/export retains original OCR, confidence and unit without treating an imported key as a target',()=>{
  const raw={label:'Dispersão da arma',value:'-14',unit:'%',raw:'-14% À DISPERSÃO DE TIRO DA ARMA QUANDO EM',confidence:.7,key:'weapon_dispersion_pct'};
  const imported=equipmentAttributeWithSource(raw);
  assert.ok(imported.textReview,'a shortened legacy label must not hide an incomplete raw reading');
  assert.equal(previewEquipmentAttribute(imported).status,'source_incomplete');
  const edited=equipmentAttributeWithSource(raw,{label:'À DISPERSÃO DE TIRO DA ARMA QUANDO EM MOVIMENTO',operator:'decrease_percent'});
  const persisted=JSON.parse(JSON.stringify(edited));
  assert.equal(persisted.raw,raw.raw);assert.equal(persisted.confidence,.7);assert.equal(persisted.unit,'%');
  assert.equal(persisted.importedKey,'weapon_dispersion_pct');assert.equal(persisted.key,undefined);
  assert.equal(persisted.textEdited,true);assert.equal(persisted.textReview,undefined);
  assert.deepEqual(equipmentAttributeWithSource(persisted),persisted);
  assert.equal(raw.key,'weapon_dispersion_pct');
});

test('changing only the number or operator never clears an incomplete original reading',()=>{
  const imported=equipmentAttributeWithSource({label:'Dispersão da arma',raw:'-14% À DISPERSÃO DE TIRO DA ARMA QUANDO EM',value:'-14',key:'weapon_dispersion_pct'});
  const untouchedText=equipmentAttributeWithSource(imported,{label:'Dispersão da arma',value:'17',operator:'decrease_percent'});
  assert.ok(untouchedText.textReview);assert.equal(untouchedText.textEdited,undefined);
  const stillIncomplete=equipmentAttributeWithSource(imported,{label:'À DISPERSÃO DE TIRO QUANDO EM'});
  assert.ok(stillIncomplete.textReview);
});

function fixture() {
  // Synthetic independent bases; these are not asserted to be Slayer's actual bases.
  const moving={label:'Dispersão de tiro da arma quando em movimento',value:'-28',operator:'decrease_percent'};
  const aiming={label:'Dispersão do tiro ao mirar',value:'-16',operator:'decrease_percent'};
  const definitions=[
    {id:'movement_angle',name:'Dispersão total em movimento',scope:'weapon',source_key:'movement_angle',unit:'degree',direction:'lower',kind:'scalar'},
    {id:'aimed_angle',name:'Dispersão ao mirar',scope:'weapon',source_key:'aimed_angle',unit:'degree',direction:'lower',kind:'scalar'}
  ];
  const bindings=[moving,aiming].map((source_snapshot,i)=>({id:i?other:binding,source_kind:'equipment_variant',source_id:variant,attribute_key:String(i),source_snapshot,target:definitions[i].id,operator:'decrease_percent',unit:'percent',condition:i?'aiming':'moving'}));
  return {payload:{...emptyStatusPayload(),definitions,bindings},rows:[moving,aiming],base:{hero_stats:{health:100},weapon_stats:{movement_angle:20,aimed_angle:5,moving_dispersion:3}}};
}

test('explicit moving and aiming links act on independent targets and preserve movement increment',()=>{
  const f=fixture(),registry=compile(f.payload),sources=[statusSource('equipment_variant',variant,f.rows,{name:'Fixture boots',rarity:'Estelar'})];
  const result=applyEquipmentStats(f.base,sources,{registry,context:{moving:true,aiming:true}});
  assert.ok(Math.abs(result.final.movement_angle-14.4)<1e-9);
  assert.ok(Math.abs(result.final.aimed_angle-4.2)<1e-9);
  assert.equal(result.final.moving_dispersion,3);assert.equal(result.final.health,100);
  assert.equal(result.complete,true);
  assert.deepEqual(result.trace.map(t=>[t.targetScope,t.targetSourceKey,t.condition]),[['weapon','movement_angle','moving'],['weapon','aimed_angle','aiming']]);
  const stopped=applyEquipmentStats(f.base,sources,{registry,context:{moving:false,aiming:true}});
  assert.equal(stopped.final.movement_angle,20);assert.equal(stopped.trace[0].status,'not_applicable');
});

test('no publication, unbound known label and different rarity cannot use fuzzy fallback',()=>{
  const sources=[statusSource('equipment_variant',variant,[{label:'Dispersão da arma',value:-28,operator:'decrease_percent'}])];
  const result=applyEquipmentStats({dispersion:50},sources,{registry:compile(emptyStatusPayload())});
  assert.equal(result.final.dispersion,50);assert.equal(result.applied.length,0);assert.equal(result.trace[0].status,'unmapped');assert.equal(result.complete,false);
  const f=fixture(),result2=applyEquipmentStats(f.base,[statusSource('equipment_variant',other,f.rows)],{registry:compile(f.payload),context:{moving:true,aiming:true}});
  assert.equal(result2.applied.length,0);assert.equal(result2.final.movement_angle,20);
});

test('preview requires the published exact source snapshot and rejects an edited line',()=>{
  const f=fixture(),registry=compile(f.payload),opts={registry,variantId:variant,rowKey:'0'};
  assert.equal(previewEquipmentAttribute(f.rows[0]).status,'registry_unavailable');
  assert.equal(previewEquipmentAttribute(f.rows[0],{...opts,variantId:other}).status,'binding_required');
  assert.equal(previewEquipmentAttribute({...f.rows[0],label:'Dispersão da arma'},opts).status,'source_changed');
  const valid=previewEquipmentAttribute(f.rows[0],opts);
  assert.equal(valid.rule.target,'movement_angle');assert.match(valid.description,/Arma · Em movimento/);
});

test('incomplete source cannot be published as a reviewed binding',()=>{
  const f=fixture();f.payload.bindings[0].source_snapshot={...f.rows[0],textReview:'Texto incompleto'};
  assert.equal(validateStatusPayload(f.payload).valid,false);
});

test('an empty registry offers actual source fields to configure without guessing units or merging scope',()=>{
  const fields=discoverStatusFields({bases:[{hero_id:'hero',hero_stats:{power:10},weapon_stats:{power:20,aimed_dispersion:5,moving_dispersion:3}}],skills:[],levels:[]});
  const choices=statusTargetChoices(fields,emptyStatusPayload());
  assert.equal(choices.registered.length,0);assert.equal(choices.pending.length,4);
  assert.equal(new Set(fields.map(suggestedStatusId)).size,4);
  assert.ok(choices.pending.every(f=>f.unit===undefined));
  assert.equal(draftStatusRegistry({draft_revision:null,draft:emptyStatusPayload()}).revision,'draft:0');
});

test('automatic history describes the explicit action without requiring free text',()=>{
  const note=statusActionRecord('vínculo manual','Equipamento / Estelar → Arma.aimed_dispersion; decrease_percent; aiming.');
  assert.match(note,/vínculo manual/);assert.match(note,/aimed_dispersion/);assert.ok(note.length>5);
});
