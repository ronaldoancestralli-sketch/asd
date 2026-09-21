export const COUNTER_SCHEMA_V5='echo-brain-counter-knowledge-v5-shadow';

export const COUNTER_MECHANICS_V5=[
  'reveal','invisibility','silence','stun','slow','root','disarm','shield','shield_break',
  'armor','armor_penetration','heal','anti_heal','damage_reduction','damage_amp',
  'movement_speed','dash','teleport','range','close_range','wall_shot','vision','cover',
  'revive','area_damage','burst','damage_over_time','active_ability','projectile'
];

const PATTERNS=[
  ['reveal',/revel|detect|localiza|mostra inimig|vis[ií]vel/i],
  ['invisibility',/invis[ií]vel|invisibilidade|furtiv|stealth/i],
  ['silence',/sil[eê]ncio|silencia|impede.*habilidade|bloqueia.*habilidade/i],
  ['stun',/atordoa|atordoamento|stun/i],
  ['slow',/lentid[aã]o|reduz.*velocidade|slow/i],
  ['root',/imobiliza|enra[ií]za|root/i],
  ['disarm',/desarma|impede.*atirar|n[aã]o pode atirar|disarm/i],
  ['shield_break',/quebra.*escudo|destr[oó]i.*escudo|shield break/i],
  ['shield',/escudo|shield/i],
  ['armor_penetration',/penetra[cç][aã]o.*armadura|ignora.*armadura|armor penetration/i],
  ['armor',/armadura|armor/i],
  ['anti_heal',/reduz.*cura|impede.*cura|anti.?heal/i],
  ['heal',/cura|restaura.*vida|healing/i],
  ['damage_reduction',/redu[cç][aã]o.*dano|reduz.*dano recebido|damage reduction/i],
  ['damage_amp',/aumenta.*dano|dano.*aument|damage bonus|damage increase/i],
  ['movement_speed',/velocidade.*movimento|movement speed|move speed/i],
  ['dash',/dash|avan[cç]a rapidamente|salto r[aá]pido/i],
  ['teleport',/teleport/i],
  ['wall_shot',/atrav[eé]s.*parede|atravessa.*parede|wall.?shot/i],
  ['vision',/vis[aã]o|alcance.*vis[aã]o|vision/i],
  ['revive',/revive|ressuscit|reanima/i],
  ['area_damage',/dano.*[aá]rea|[aá]rea.*dano|explos[aã]o|area damage/i],
  ['damage_over_time',/dano.*tempo|por segundo|queima|veneno|damage over time|dot/i],
  ['burst',/dano explosivo|burst|grande quantidade de dano/i],
  ['range',/alcance.*aument|longo alcance|long range/i],
  ['close_range',/curta dist[aâ]ncia|perto do inimigo|close range/i],
  ['active_ability',/habilidade ativa|ao ativar|ap[oó]s ativar|quando ativa/i],
  ['projectile',/proj[eé]til|projectile/i],
  ['cover',/cobertura|parede|cover/i]
];

const DEPENDENCY_PATTERNS=[
  ['invisibility',/enquanto.*invis[ií]vel|ap[oó]s sair.*invis|depois.*invis/i],
  ['active_ability',/ap[oó]s usar.*habilidade|ao ativar|depois de ativar/i],
  ['close_range',/quando.*pr[oó]ximo|a curta dist[aâ]ncia|perto do inimigo/i],
  ['shield',/enquanto.*escudo|com escudo ativo/i],
  ['heal',/ao ser curado|quando recebe cura/i],
  ['mobility',/ap[oó]s dash|depois.*salto|durante.*movimento/i]
];

const TRIGGERS=[
  ['on_kill',/ao eliminar|ap[oó]s eliminar|ao matar|on kill/i],
  ['on_hit',/ao acertar|quando acerta|ap[oó]s acertar|on hit/i],
  ['on_damage_taken',/ao receber dano|quando recebe dano|on damage taken/i],
  ['after_invisibility',/ap[oó]s sair.*invis|depois.*invis/i],
  ['while_invisible',/enquanto.*invis/i],
  ['low_health',/vida baixa|pouca vida|low health/i],
  ['target_revealed',/alvo revelado|inimigo revelado/i],
  ['near_enemy',/perto do inimigo|pr[oó]ximo.*inimigo/i],
  ['team_nearby',/aliad.*pr[oó]xim|equipe.*pr[oó]xim/i],
  ['on_activate',/ao ativar|ap[oó]s ativar|quando ativa/i]
];

const RULES=[
  {cap:'reveal',target:'invisibility',roles:['dependency','vulnerability'],weight:.98,reason:'Revelação reduz ou neutraliza a dependência de invisibilidade.'},
  {cap:'anti_heal',target:'heal',roles:['dependency','vulnerability'],weight:.9,reason:'Anti-cura ataca diretamente a dependência de cura/sustain.'},
  {cap:'shield_break',target:'shield',roles:['dependency','vulnerability'],weight:.94,reason:'Quebra de escudo ataca diretamente a dependência de escudo.'},
  {cap:'armor_penetration',target:'armor',roles:['dependency','vulnerability'],weight:.82,reason:'Penetração de armadura reduz a proteção baseada em armadura.'},
  {cap:'silence',target:'active_ability',roles:['dependency','vulnerability'],weight:.9,reason:'Silêncio reduz a capacidade de um herói dependente de habilidade ativa.'},
  {cap:'stun',target:'close_range',roles:['dependency','vulnerability'],weight:.72,reason:'Atordoamento dificulta a execução de heróis dependentes de aproximação.'},
  {cap:'root',target:'close_range',roles:['dependency','vulnerability'],weight:.74,reason:'Imobilização dificulta a aproximação necessária para combate curto.'},
  {cap:'slow',target:'close_range',roles:['dependency','vulnerability'],weight:.58,reason:'Lentidão dificulta a aproximação e manutenção de curta distância.'},
  {cap:'stun',target:'dash',roles:['dependency','vulnerability'],weight:.62,reason:'Controle rígido reduz o valor de mobilidade baseada em dash.'},
  {cap:'root',target:'dash',roles:['dependency','vulnerability'],weight:.76,reason:'Imobilização limita diretamente mobilidade baseada em dash.'},
  {cap:'slow',target:'movement_speed',roles:['dependency','vulnerability'],weight:.58,reason:'Lentidão reduz uma vantagem baseada em velocidade de movimento.'},
  {cap:'wall_shot',target:'cover',roles:['dependency','vulnerability'],weight:.8,reason:'Ataques através de parede reduzem a segurança baseada em cobertura.'},
  {cap:'range',target:'close_range',roles:['dependency','vulnerability'],weight:.55,reason:'Alcance superior pode pressionar antes da distância ideal do alvo.'},
  {cap:'disarm',target:'projectile',roles:['dependency','vulnerability'],weight:.72,reason:'Desarme reduz a capacidade de um alvo dependente de disparos.'}
];

function clamp(value,min=0,max=1){return Math.min(max,Math.max(min,Number(value)||0));}
function norm(value=''){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function triggerFor(text){for(const [id,re] of TRIGGERS)if(re.test(text))return id;return 'always';}

export function suggestSemanticFactsV5({heroId,sourceKind='manual',sourceId=null,text='',verificationStatus='unverified',needsRecheck=true}={}){
  const raw=String(text||'').trim();
  if(!raw)return[];
  const suggestions=[];
  const trigger=triggerFor(raw);
  for(const [mechanic,re] of PATTERNS){
    if(!re.test(raw))continue;
    suggestions.push({heroId,sourceKind,sourceId,factRole:'capability',mechanic,triggerType:trigger,targetScope:/aliad|equipe/i.test(raw)?'team':'self',strength:.7,semanticConfidence:.55,evidenceText:raw,verificationStatus,needsRecheck});
  }
  for(const [mechanic,re] of DEPENDENCY_PATTERNS){
    if(!re.test(raw))continue;
    suggestions.push({heroId,sourceKind,sourceId,factRole:'dependency',mechanic:mechanic==='mobility'?'movement_speed':mechanic,triggerType:trigger,targetScope:'self',strength:.75,semanticConfidence:.6,evidenceText:raw,verificationStatus,needsRecheck});
  }
  const dedup=new Map();
  for(const item of suggestions)dedup.set(`${item.factRole}:${item.mechanic}:${item.triggerType}`,item);
  return [...dedup.values()];
}

function usableFacts(profile,{includeProposed=false}={}){
  return (profile?.facts||[]).filter(f=>{
    if(!includeProposed&&f.review_status!=='confirmed'&&f.reviewStatus!=='confirmed')return false;
    const status=f.verification_status||f.verificationStatus||'unverified';
    if(status==='unverified')return false;
    if((f.needs_recheck??f.needsRecheck)===true)return false;
    return true;
  }).map(f=>({
    ...f,
    factRole:f.fact_role||f.factRole,
    verificationStatus:f.verification_status||f.verificationStatus,
    semanticConfidence:clamp(f.semantic_confidence??f.semanticConfidence??.5),
    strength:clamp(f.strength??1),
    mechanic:norm(f.mechanic).replaceAll(' ','_')
  }));
}

function factConfidence(f){
  const verification=f.verificationStatus==='verified'?1:.72;
  return clamp(verification*f.semanticConfidence*f.strength);
}

function immunityPenalty(defenderFacts,mechanic){
  const hits=defenderFacts.filter(f=>f.factRole==='immunity'&&f.mechanic===mechanic);
  if(!hits.length)return 0;
  return Math.max(...hits.map(f=>factConfidence(f)));
}

export function directionalCounterPressureV5(attacker,defender,options={}){
  const aFacts=usableFacts(attacker,options),dFacts=usableFacts(defender,options);
  const evidence=[];
  let raw=0;
  for(const rule of RULES){
    const capabilities=aFacts.filter(f=>f.factRole==='capability'&&f.mechanic===rule.cap);
    const targets=dFacts.filter(f=>rule.roles.includes(f.factRole)&&f.mechanic===rule.target);
    if(!capabilities.length||!targets.length)continue;
    const cap=Math.max(...capabilities.map(f=>factConfidence(f)));
    const target=Math.max(...targets.map(f=>factConfidence(f)));
    const immunity=Math.max(immunityPenalty(dFacts,rule.cap),immunityPenalty(dFacts,rule.target));
    const contribution=rule.weight*cap*target*(1-.8*immunity);
    if(contribution<=.03)continue;
    raw+=contribution;
    evidence.push({rule:`${rule.cap}->${rule.target}`,contribution:Number(contribution.toFixed(4)),reason:rule.reason,immunityPenalty:Number(immunity.toFixed(4))});
  }
  const pressure=Number((100*(1-Math.exp(-raw))).toFixed(1));
  const confirmed=aFacts.length+dFacts.length;
  const verified=[...aFacts,...dFacts].filter(f=>f.verificationStatus==='verified').length;
  const coverage=confirmed?verified/confirmed:0;
  const evidenceConfidence=evidence.length?Math.min(1,evidence.reduce((sum,e)=>sum+e.contribution,0)/1.4):0;
  const confidence=Number(clamp(.15+.45*coverage+.4*evidenceConfidence).toFixed(3));
  return {pressure,confidence,evidence,attackerFacts:aFacts.length,defenderFacts:dFacts.length};
}

export function compareHeroCountersV5(heroA,heroB,options={}){
  const a=directionalCounterPressureV5(heroA,heroB,options);
  const b=directionalCounterPressureV5(heroB,heroA,options);
  const net=Number((a.pressure-b.pressure).toFixed(1));
  const confidence=Number(((a.confidence+b.confidence)/2).toFixed(3));
  const evidenceCount=a.evidence.length+b.evidence.length;
  let verdict='uncertain',label='Dados insuficientes';
  if(confidence>=.45&&evidenceCount){
    if(net>=45){verdict='a_strong_counter';label=`${heroA.name} counter forte`;}
    else if(net>=20){verdict='a_counter';label=`${heroA.name} counter`;}
    else if(net>=8){verdict='a_slight';label=`Leve vantagem de ${heroA.name}`;}
    else if(net<=-45){verdict='b_strong_counter';label=`${heroB.name} counter forte`;}
    else if(net<=-20){verdict='b_counter';label=`${heroB.name} counter`;}
    else if(net<=-8){verdict='b_slight';label=`Leve vantagem de ${heroB.name}`;}
    else{verdict='no_direct_counter';label='Sem counter direto confirmado';}
  }
  return {schema:COUNTER_SCHEMA_V5,heroA:{id:heroA.id,name:heroA.name},heroB:{id:heroB.id,name:heroB.name},aToB:a,bToA:b,net,confidence,evidenceCount,verdict,label,shadow:true};
}

export function counterCoverageV5(profile){
  const all=profile?.facts||[];
  const confirmed=all.filter(f=>(f.review_status||f.reviewStatus)==='confirmed');
  const usable=usableFacts(profile);
  return {all:all.length,confirmed:confirmed.length,usable:usable.length,verified:usable.filter(f=>f.verificationStatus==='verified').length};
}
