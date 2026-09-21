import * as core from './game-stat-engine-v12-core.js?v=3';
import { parseEquipmentAttributeMagnitude, normalizeEquipmentAttributesForCalculation } from './equipment-attribute-calculation.js?v=2';
import { applyStatusRegistry } from './status-registry-v1.js?sc=20260906-1&eq=20260907-effects-1';
export * from './game-stat-engine-v12-core.js?v=3';

/*
 * Echo Arena — catálogo tolerante de atributos de equipamento.
 *
 * Esta camada NÃO altera a fórmula sequencial do motor original.
 * Ela só resolve escritas diferentes/pequenos erros para um alvo oficial
 * antes de aplicar a mesma soma ou o mesmo percentual sequencial.
 */

export const STAT_DEFINITIONS = {
  ...core.STAT_DEFINITIONS,
  penetration_resistance: { nome: 'Resistência à perfuração', icone: '♢', cor: '#4ade80', unit: '%' },
  aim_time: { nome: 'Tempo de mira', icone: '⌖', cor: '#5b8def', unit: 's', lowerBetter: true },
  dispersion: { nome: 'Dispersão sem mira', icone: '∠', cor: '#5b8def', unit: '°', decimals: 2, lowerBetter: true },
  moving_dispersion: { nome: 'Acréscimo de dispersão ao mover', icone: '∠', cor: '#5b8def', unit: '°', decimals: 2, lowerBetter: true },
  aimed_dispersion: { nome: 'Dispersão com mira', icone: '∠', cor: '#5b8def', unit: '°', decimals: 2, lowerBetter: true }
};

export const EQUIPMENT_ATTRIBUTE_CATALOG = [
  { id:'damage_to_armor', label:'Dano contra armadura e drones', target:'armor_drone_multiplier', op:'percent', percentKey:'weapon_damage_to_armor_pct', aliases:['dano a armadura','dano contra armadura','dano da arma a armadura','dano da arma a armadura do inimigo','dano a drone','dano contra drones'] },
  { id:'damage_to_health', label:'Dano contra vida', target:'health_damage_multiplier', op:'percent', percentKey:'weapon_damage_to_health_pct', aliases:['dano a vida','dano contra vida','dano da arma a vida','dano da arma a vida do inimigo'] },
  { id:'health', label:'Vida', target:'health', op:'add', flatKey:'health', percentKey:'health_max_pct', aliases:['vida','vida maxima','vida do heroi','saude','saude maxima'] },
  { id:'armor', label:'Armadura', target:'armor', op:'add', flatKey:'armor', percentKey:'armor_max_pct', aliases:['armadura','armadura maxima','armadura do heroi'] },
  { id:'movement_speed', label:'Velocidade de movimento', target:'max_movement_speed', op:'percent', flatKey:'max_movement_speed', percentKey:'movement_speed_pct', aliases:['velocidade de movimento','velocidade maxima','velocidade de corrida','movimentacao','velocidade do heroi'] },
  { id:'aimed_movement_speed', label:'Velocidade ao mirar', target:'aimed_movement_speed', op:'percent', flatKey:'aimed_movement_speed', percentKey:'aimed_movement_speed_pct', aliases:['velocidade ao mirar','velocidade com mira','velocidade em mira','movimento com mira'] },
  { id:'vision_range', label:'Alcance de visão', target:'vision_range', op:'add', flatKey:'vision_range', percentKey:'vision_range_pct', aliases:['alcance de visao','alcance visual','distancia de visao','visao do heroi'] },
  { id:'aimed_range', label:'Alcance com mira', target:'aimed_range', op:'add', flatKey:'aimed_range', percentKey:'aimed_range_pct', aliases:['alcance com mira','alcance de tiro com mira','alcance da arma com mira','alcance de tiro da arma com mira','alcance tiro mira arma','weapon range franco'] },
  { id:'hip_fire_range', label:'Alcance sem mira', target:'hip_fire_range', op:'add', flatKey:'hip_fire_range', percentKey:'hip_fire_range_pct', aliases:['alcance sem mira','alcance de tiro sem mira','alcance da arma sem mira'] },
  { id:'reload_time', label:'Tempo de recarga', target:'reload_time', op:'add', flatKey:'reload_time', percentKey:'reload_time_pct', aliases:['tempo de recarga','tempo recarga','tempo de recarga da arma','tempo recarga arma','recarga','recarga da arma','recarregamento',{text:'velocidade de recarga',operation:'percent'},{text:'velocidade recarga',operation:'percent'},{text:'velocidade de recarregamento',operation:'percent'}] },
  { id:'magazine_size', label:'Capacidade de munição', target:'magazine_size', op:'add', flatKey:'magazine_size', percentKey:'magazine_size_pct', aliases:['capacidade de municao','municao','municao da arma','tamanho do pente','capacidade do pente','tamanho do carregador','capacidade do carregador'] },
  { id:'armor_penetration', label:'Penetração de armadura', target:'armor_penetration', op:'add', flatKey:'armor_penetration', percentKey:'armor_penetration_pct', aliases:['penetracao de armadura','perfuracao de armadura','penetracao da arma','perfuracao da arma'] },
  { id:'penetration_power', label:'Poder de perfuração', target:'penetration_power', op:'add', flatKey:'penetration_power', percentKey:'penetration_power_pct', aliases:['poder de perfuracao','poder de penetracao','forca de perfuracao','forca de penetracao'] },
  { id:'armor_resistance', label:'Resistência à armadura', target:'armor_resistance', op:'add', flatKey:'armor_resistance', percentKey:'armor_resistance_pct', aliases:['resistencia de armadura','resistencia a armadura'] },
  { id:'penetration_resistance', label:'Resistência à perfuração', target:'penetration_resistance', op:'add', flatKey:'penetration_resistance', percentKey:'penetration_resistance_pct', aliases:['resistencia a perfuracao','resistencia de perfuracao','resistencia a penetracao','resistencia de penetracao'] },
  { id:'damage_per_shot', label:'Dano por tiro', target:'damage_per_shot', op:'add', flatKey:'damage_per_shot', percentKey:'damage_per_shot_pct', aliases:['dano por tiro','dano da arma','dano da arma por tiro','dano do tiro'] },
  { id:'aim_time', label:'Tempo de mira', target:'aim_time', op:'add', flatKey:'aim_time', percentKey:'aim_time_pct', aliases:['tempo de mira','tempo para mirar','tempo ao mirar'] },
  { id:'aimed_dispersion', label:'Dispersão com mira', target:'aimed_dispersion', op:'add', flatKey:'aimed_dispersion', percentKey:'aimed_dispersion_pct', aliases:['dispersao com mira','dispersao ao mirar','dispersao de tiro com mira','dispersao de tiro com mira da arma','dispersao tiro com mira arma'] },
  { id:'moving_dispersion', label:'Dispersão em movimento', target:'moving_dispersion', op:'add', flatKey:'moving_dispersion', percentKey:'moving_dispersion_pct', aliases:['dispersao em movimento','dispersao ao mover','dispersao de tiro em movimento','dispersao da arma em movimento'] },
  { id:'dispersion', label:'Dispersão de tiro', target:'dispersion', op:'add', flatKey:'dispersion', percentKey:'dispersion_pct', aliases:['dispersao','dispersao de tiro','dispersao da arma','dispersao de tiro da arma','dispersao sem mira','dispersao de tiro sem mira'] }
];

const PERCENT_KEY_TARGETS = new Map();
const FLAT_KEY_TARGETS = new Map();
for (const c of EQUIPMENT_ATTRIBUTE_CATALOG) {
  if (c.percentKey) PERCENT_KEY_TARGETS.set(normKey(c.percentKey), c);
  if (c.flatKey) FLAT_KEY_TARGETS.set(normKey(c.flatKey), c);
}

const STOP = new Set(['a','ao','aos','da','das','de','do','dos','e','em','na','nas','no','nos','o','os','para','por','arma','heroi','inimigo','total']);
const SYN = new Map([['saude','vida'],['recarregamento','recarga'],['recarregar','recarga'],['movimentacao','movimento'],['distancia','alcance'],['visual','visao'],['pente','municao'],['carregador','municao']]);

function normKey(value='') {
  return String(value).replace(/([a-z0-9])([A-Z])/g,'$1_$2')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}

function normText(value='') {
  return String(value).replace(/([a-z0-9])([A-Z])/g,'$1 $2')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/%/g,' percentual ').replace(/[_-]+/g,' ')
    .replace(/[^a-z0-9\s]/g,' ').replace(/\bporcentagem\b|\bpct\b/g,' percentual ')
    .replace(/\s+/g,' ').trim();
}

function percentMarked(value='') {
  return /\b(percentual|porcentagem|pct)\b|%/i.test(String(value).replace(/([a-z0-9])([A-Z])/g,'$1 $2')) || /_pct$/i.test(String(value));
}

function tokens(value='') {
  return normText(value).split(' ').map(t=>SYN.get(t)||t)
    .filter(t=>t && t!=='percentual' && !STOP.has(t));
}

function damerau(a='',b='') {
  const A=String(a),B=String(b), d=Array.from({length:A.length+1},()=>Array(B.length+1).fill(0));
  for(let i=0;i<=A.length;i++) d[i][0]=i;
  for(let j=0;j<=B.length;j++) d[0][j]=j;
  for(let i=1;i<=A.length;i++) for(let j=1;j<=B.length;j++){
    const cost=A[i-1]===B[j-1]?0:1;
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+cost);
    if(i>1&&j>1&&A[i-1]===B[j-2]&&A[i-2]===B[j-1]) d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
  }
  return d[A.length][B.length];
}

function tokenEq(a,b) {
  if(a===b) return true;
  const n=Math.min(a.length,b.length);
  if(n<5) return false;
  return damerau(a,b) <= (n>=9?2:1);
}

function aliasScore(input, alias) {
  if(!input.length||!alias.length) return 0;
  if(alias.length===1) return input.length===1 && tokenEq(input[0],alias[0]) ? 1 : 0;
  const used=new Set(); let matched=0;
  for(const a of alias){
    const i=input.findIndex((x,idx)=>!used.has(idx)&&tokenEq(x,a));
    if(i>=0){matched++;used.add(i);}
  }
  const ca=matched/alias.length, ci=used.size/input.length;
  if(ca<.75) return 0;
  return ca*.72+ci*.28;
}

function aliasesOf(c) {
  return c.aliases.map(a=>typeof a==='string'?{text:a}:a);
}

function findConcept(rawKey) {
  const raw=String(rawKey||''), key=normKey(raw);
  const p=PERCENT_KEY_TARGETS.get(key);
  if(p) return {concept:p,operation:'percent',confidence:1,match:'structured'};
  const f=FLAT_KEY_TARGETS.get(key);
  if(f) return {concept:f,operation:f.op,confidence:1,match:'structured'};

  const normalized=normText(raw);
  const exact=[];
  for(const c of EQUIPMENT_ATTRIBUTE_CATALOG) for(const a of aliasesOf(c)) {
    if(normText(a.text)===normalized) exact.push({concept:c,alias:a});
  }
  if(exact.length===1){
    const {concept,alias}=exact[0];
    return {concept,operation:alias.operation||(percentMarked(raw)?'percent':concept.op),confidence:1,match:'alias'};
  }

  const input=tokens(raw), candidates=[];
  for(const c of EQUIPMENT_ATTRIBUTE_CATALOG) for(const a of aliasesOf(c)){
    const score=aliasScore(input,tokens(a.text));
    if(score>0) candidates.push({concept:c,alias:a,score});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const best=candidates[0], second=candidates[1];
  if(!best||best.score<.86) return null;
  if(second&&second.concept.id!==best.concept.id&&best.score-second.score<.08) return null;
  return {concept:best.concept,operation:best.alias.operation||(percentMarked(raw)?'percent':best.concept.op),confidence:best.score,match:'tolerant'};
}

export function resolveEquipmentModifierRule(rawKey) {
  // Marcador emitido pelo adaptador do operador explícito. O alvo continua
  // vindo do catálogo; a operação escolhida não pode cair no default do alias.
  const marker=String(rawKey||'').match(/\s+(absoluto|percentual)$/i);
  const lookupKey=marker ? String(rawKey).slice(0,-marker[0].length) : rawKey;
  const explicitOperation=marker ? (marker[1].toLowerCase()==='absoluto'?'add':'percent') : null;
  const found=findConcept(lookupKey);
  if(found){
    const operation=explicitOperation||(percentMarked(rawKey)?'percent':found.operation);
    return {
      recognized:true,
      canonical:operation==='percent'?(found.concept.percentKey||normKey(rawKey)):(found.concept.flatKey||normKey(rawKey)),
      target:found.concept.target,
      operation,
      source:found.match==='tolerant'?'catálogo oficial · escrita aproximada':'catálogo oficial',
      catalogId:found.concept.id,
      confidence:found.confidence
    };
  }

  const key=core.canonicalKey(lookupKey);
  if(STAT_DEFINITIONS[key]){
    return {recognized:true,canonical:key,target:key,operation:explicitOperation||'add',source:'atributo oficial',catalogId:null,confidence:1};
  }

  const pt=core.resolverChavePT(lookupKey);
  if(pt){
    return {recognized:true,canonical:key,target:pt.alvo,operation:explicitOperation||(pt.modo==='percent'?'percent':'add'),source:'regra textual legada',catalogId:null,confidence:.8};
  }

  return {recognized:false,canonical:key,target:null,operation:null,source:'sem regra oficial no motor',catalogId:null,confidence:0};
}

export function resolverChavePT(rawKey) {
  const rule=resolveEquipmentModifierRule(rawKey);
  return rule.recognized ? {alvo:rule.target,modo:rule.operation==='percent'?'percent':'flat',catalogId:rule.catalogId,confidence:rule.confidence} : null;
}

export function applyEquipmentStats(baseInput={}, equipmentStats=[], options={}) {
  if(options.registry) return applyStatusRegistry(options.sourceBase||baseInput, equipmentStats, options.registry, {
    legacyApply: applyEquipmentStats, legacyNormalize: core.normalizeGameStats,
    normalizeAttributes: normalizeEquipmentAttributesForCalculation, context: options.context||{}
  });
  const base=options.normalizedBase?{...baseInput}:core.normalizeGameStats(baseInput);
  const final={...base}, applied=[], unknown=[];

  for(const sourceInput of equipmentStats) {
  const source=sourceInput?.statusSource?normalizeEquipmentAttributesForCalculation(sourceInput.attributes):sourceInput;
  for(const [rawKey,rawValue] of Object.entries(source||{})){
    if (/\s+(absoluto|percentual)$/i.test(rawKey) && parseEquipmentAttributeMagnitude(rawValue) === null) continue;
    const value=Number(rawValue);
    if(!Number.isFinite(value)) continue;
    const rule=resolveEquipmentModifierRule(rawKey);

    if(!rule.recognized){
      const key=core.canonicalKey(rawKey);
      if(!(key in final)){unknown.push(`${rawKey} (sem regra oficial)`);continue;}
      const before=Number(final[key]??0), after=before+value;
      final[key]=after;
      applied.push({sourceKey:rawKey,target:key,value,operation:'add',before,after,resolverSource:'compatibilidade por chave-base'});
      continue;
    }

    if(!(rule.target in final)){unknown.push(`${rawKey} (base ${rule.target} ausente)`);continue;}
    const before=Number(final[rule.target]??base[rule.target]??0);
    const after=rule.operation==='percent' ? before*(1+value/100) : before+value;
    final[rule.target]=after;
    applied.push({sourceKey:rawKey,target:rule.target,value,operation:rule.operation,before,after,resolverSource:rule.source,catalogId:rule.catalogId,confidence:rule.confidence});
  }
  }

  return {base,final,applied,unknown:[...new Set(unknown)]};
}

export function buildRealStatLines(calculation,limit=5) {
  const definitions={...STAT_DEFINITIONS,...calculation.definitions};
  const priority=['damage_per_shot','health','armor','max_movement_speed','armor_penetration','vision_range','aimed_range','penetration_power','health_damage_multiplier','armor_drone_multiplier','reload_time','aimed_dispersion','dispersion','moving_dispersion'];
  const changed=Object.keys(calculation.final).filter(k=>k in calculation.base&&definitions[k]&&Math.abs(Number(calculation.final[k])-Number(calculation.base[k]))>1e-9);
  const available=[...new Set([...changed,...priority,...Object.keys(calculation.final)])].filter(k=>k in calculation.base&&definitions[k]);

  return available.slice(0,limit).map(key=>{
    const d=definitions[key], base=Number(calculation.base[key]||0), value=Number(calculation.final[key]||0);
    const difference=value-base, rawDelta=base?difference/Math.abs(base)*100:(value?100:0);
    const scale=Math.max(Math.abs(base),Math.abs(value),1)*1.15;
    return {
      key,nome:d.nome,curto:d.nome.toUpperCase(),icone:d.icone,cor:d.cor,unit:d.unit||'',prefix:d.prefix||'',decimals:d.decimals??0,
      base,valor:value,difference,delta:rawDelta,beneficialDelta:d.direction==='neutral'?0:d.lowerBetter?-rawDelta:rawDelta,pctBase:Math.abs(base)/scale*100,pct:Math.abs(value)/scale*100
    };
  });
}
