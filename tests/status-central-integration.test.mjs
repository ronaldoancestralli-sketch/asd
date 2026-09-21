import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { compileStatusRegistry, statusSource, compareStatusCalculations } from '../js/status-registry-v1.js';
import { auditEquipmentBundlesCoverageV1 } from '../js/echo-brain-equipment-coverage-v1.js';
import { buildStatusProof, inventoryStatusEffects } from '../admin/js/status-central-model.js';
import { evaluateAppliedModifiersForHeroV4 } from '../js/echo-brain-item-fit-v4.js';

// Explicitly isolated test catalog. No network or production writes.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = n => `${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const hero = { id:id(1), name:'Fixture hero', enabled:true };
const raw = [{ label:'à dispersao de tiro da arma sem mirar', value:23, operator:'decrease_percent' }];
const base = { hero_id:hero.id, hero_stats:{health:100}, weapon_stats:{weapon_spread:50} };
const equipment = { id:id(2), name:'Fixture equipment', enabled:true, slot_id:id(3), set_id:id(4) };
const variant = { id:id(5), equipment_id:equipment.id, rarity_id:id(6), attributes:raw };
const bonus = { id:id(7), set_id:id(4), required_pieces:1, title:'Fixture set', stats:{extra_angle:1} };
const rarity = { id:id(6), slug:'comum', name:'Comum', rank:0 };
const slot = { id:id(3), slug:'head', name:'Cabeça' };
const registry = compileStatusRegistry({ revision:1, fingerprint:'isolated-fixture', payload:{
  contract:'echo-status-registry/v1',
  definitions:[{id:'dispersion',name:'Dispersão',scope:'weapon',source_key:'weapon_spread',unit:'degree',direction:'lower',kind:'scalar',minimum:0}],
  bindings:[
    {id:id(8),source_kind:'equipment_variant',source_id:variant.id,attribute_key:'0',source_snapshot:raw[0],target:'dispersion',operator:'decrease_percent',unit:'percent',condition:'always'},
    {id:id(9),source_kind:'set_bonus',source_id:bonus.id,attribute_key:'extra_angle',source_snapshot:1,target:'dispersion',operator:'decrease_flat',unit:'degree',condition:'always'}
  ]
}});
const catalog = () => ({ heroes:[hero],bases:[base],skills:[],levels:[],equipments:[equipment],variants:[variant],bonuses:[bonus],rarities:[rarity],slots:[slot] });

async function loadAnalysis({ failedRegistry = false, levels = [], failLevels = false } = {}) {
  const calls = [];
  const tables = { hero_complete_base_stats:[base],hero_skills:[],hero_skill_levels:levels,heroes:[hero],equipment_set_bonuses:[bonus] };
  const database = {
    async rpc(name) { assert.equal(name,'get_status_registry_v1'); return {data:failedRegistry?null:registry,error:failedRegistry?{message:'offline'}:null}; },
    from(table) {
      const result = {data:tables[table]||[],error:table==='hero_skill_levels'&&failLevels?{message:'offline'}:null};
      return {
        select(){return this;}, order(){return this;},
        range(from,to){calls.push({table,from,to});return Promise.resolve({...result,data:result.data.slice(from,to+1)});},
        then(resolve,reject){return Promise.resolve(result).then(resolve,reject);}
      };
    }
  };
  const context = vm.createContext({console,Map,Set,URL,Number,String,Math,Date,JSON,Array,Object,Promise, __fixtureDatabase:database});
  const cache = new Map();
  async function load(file) {
    file = file.split('?')[0];
    if (cache.has(file)) return cache.get(file);
    const source = file.endsWith('/supabase.js') ? 'export const supabase = globalThis.__fixtureDatabase;' : fs.readFileSync(file,'utf8');
    const mod = new vm.SourceTextModule(source,{context,identifier:file});
    cache.set(file,mod);
    await mod.link((specifier,parent)=>load(path.resolve(path.dirname(parent.identifier),specifier.split('?')[0])));
    return mod;
  }
  const mod = await load(path.join(root,'js/build-analise.js'));
  await mod.evaluate();
  return { analysis:mod.namespace,calls };
}
function publicContext(dados) {
  return { heroi:{databaseId:hero.id,nome:hero.name},slots:[{key:'head'}],dados,equipados:{head:{
    databaseId:equipment.id,nome:equipment.name,enabled:true,slot:'head',raridade:'comum',setId:id(4),set:{nome:'Fixture set',bonus:[bonus]},
    levels:[{slug:'comum',stats:{legacy_copy_that_must_not_be_used:999},calculationSource:statusSource('equipment_variant',variant.id,variant.attributes)}]
  }}};
}
test('actual public loader and analysis agree with the admin proof for gear plus an active set bonus', async () => {
  const {analysis} = await loadAnalysis();
  const dados = await analysis.carregarDadosAnalise();
  const result = analysis.calcularMacros(publicContext(dados));
  assert.equal(result.status,'ok');
  assert.equal(result.total.dispersion,37.5);
  const admin = buildStatusProof(catalog(),hero.id,[{equipmentId:equipment.id,variantId:variant.id}],registry);
  assert.equal(compareStatusCalculations(result.statusCalculation,admin.calculation).equal,true);
  assert.equal(result.statusCalculation.trace[1].source.id,bonus.id);
});
test('registry RPC failure blocks analysis instead of quietly calculating with old aliases', async () => {
  const {analysis} = await loadAnalysis({failedRegistry:true});
  const result = analysis.calcularMacros(publicContext(await analysis.carregarDadosAnalise()));
  assert.equal(result.status,'registry-unavailable');
  assert.equal(result.total,null);
});
test('skill-level loading reads beyond the first API page', async () => {
  const {analysis,calls} = await loadAnalysis({levels:Array.from({length:1001},(_,i)=>({id:id(i+100),skill_id:id(90)}))});
  await analysis.carregarDadosAnalise();
  assert.deepEqual(calls.filter(c=>c.table==='hero_skill_levels').map(c=>c.from),[0,1000]);
});
test('a removed source line remains visible as a review issue', () => {
  const data = catalog(); data.variants=[{...variant,attributes:[]}];
  const issues=inventoryStatusEffects(data,registry);
  const missing=issues.find(row=>row.source_id===variant.id);
  assert.equal(missing.status,'changed');
  assert.equal(missing.missing,true);
  assert.equal(missing.binding.id,id(8));
});
test('Brain uses the reviewed benefit direction for a new scalar without inventing kit affinity', () => {
  const p=structuredClone(registry); p.payload.bindings=[];
  const fit=evaluateAppliedModifiersForHeroV4({hero,skills:[],baseStats:{custom_frequency:10},applied:[{target:'custom_frequency',sourceKey:'new effect',before:10,after:12,value:20,operation:'percent',benefitDirection:'higher'}]});
  assert.equal(fit.impacts[0].direction,'benefit');
  assert.equal(fit.impacts[0].kitAffinity,0);
});

test('Brain catalogue audit recognizes the exact published binding and detects source drift', () => {
  const bundle={equipment,variants:[variant],bonuses:[]};
  let audit=auditEquipmentBundlesCoverageV1([bundle],registry);
  assert.equal(audit.attributes[0].bindingId,id(8));
  assert.equal(audit.attributes[0].reason,'published_status_binding_requires_base_proof');
  assert.equal(audit.unmappedMappings,0);
  audit=auditEquipmentBundlesCoverageV1([{...bundle,variants:[{...variant,attributes:[{...raw[0],value:24}]}]}],registry);
  assert.equal(audit.attributes[0].reason,'status_source_changed');
  assert.equal(audit.unmappedMappings,1);
});

test('Brain catalogue audit retains deleted lines and does not infer deletion from a partial read', () => {
  const bundle={equipment,variants:[{...variant,attributes:[]}],bonuses:[]};
  const partial=auditEquipmentBundlesCoverageV1([bundle],registry);
  assert.equal(partial.unmappedMappings,1);
  assert.equal(partial.blockers[0].reason,'status_source_missing');
  assert.equal(partial.blockers[0].bindingId,id(8));
  assert.equal(partial.complete,false);
  assert.equal(auditEquipmentBundlesCoverageV1([],registry).blockers.length,0);
  const complete=auditEquipmentBundlesCoverageV1([],registry,{completeCatalogue:true});
  assert.equal(complete.blockers.length,2);
  assert.equal(complete.complete,false);
});
