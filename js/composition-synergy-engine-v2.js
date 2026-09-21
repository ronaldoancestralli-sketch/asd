/*
 * Echo Arena — motor de compatibilidade de composições v2.
 *
 * Este módulo NÃO representa win rate, meta ou sinergia medida.
 * Ele classifica capacidades a partir das habilidades cadastradas e calcula
 * compatibilidade funcional entre três heróis. Nenhuma regra é específica
 * para um herói; toda evidência vem de nome/tipo/descrição de habilidades.
 */

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const CAPABILITY_DEFINITIONS = [
  { id:'team_sustain', label:'Sustentação', test:({text})=>/(?:equipe|aliad)/.test(text)&&/(?:recuper|restaur|cura).{0,90}(?:vida|armadura)|(?:vida|armadura).{0,90}(?:recuper|restaur|cura)/.test(text) },
  { id:'protection', label:'Proteção', test:({text})=>/escudo|parede de energia|bloqueia dano|reduz.{0,70}dano recebido|armadura.{0,80}(?:equipe|aliad)|(?:equipe|aliad).{0,80}armadura/.test(text) },
  { id:'damage_amp', label:'Amplificação de dano', test:({text})=>/(?:equipe|aliad).{0,110}(?:\+\s*\d+%?\s*(?:de\s*)?dano|dano contra)|inimig.{0,100}(?:receb|sofr).{0,50}\+\s*\d+%?\s*(?:de\s*)?dano/.test(text) },
  { id:'tempo_buff', label:'Ritmo de combate', test:({text})=>/(?:equipe|aliad).{0,120}(?:cadencia de tiro|tempo de recarga da arma|municao|municoes)|(?:cadencia de tiro|tempo de recarga da arma).{0,120}(?:equipe|aliad)/.test(text) },
  { id:'mobility_team', label:'Mobilidade coletiva', test:({text})=>/(?:equipe|aliad).{0,120}(?:velocidade de movimento|ruido de corrida)|(?:velocidade de movimento|ruido de corrida).{0,120}(?:equipe|aliad)/.test(text) },
  { id:'control', label:'Controle', test:({text})=>/atord|cegueir|nao pod(?:e|em) atirar|bloqueia as armas|reduz.{0,70}velocidade de movimento|reduz.{0,70}cadencia de tiro|\+\s*\d+%?\s*de dispersao|visao.{0,35}caem|perdem.{0,55}visao/.test(text) },
  { id:'armor_pressure', label:'Pressão de armadura', test:({text})=>/reduz.{0,90}armadura|penetracao de armadura|poder de perfuracao|dano a armadura/.test(text) },
  { id:'recon', label:'Informação e visão', test:({text})=>/revela inimigos|visao termica|atirar atraves de paredes|alcance de mira|\+\s*\d+%?\s*de visao|\+\s*\d+\s*de visao/.test(text) },
  { id:'burst', label:'Pressão explosiva', test:({text,type})=>/ativa/.test(type)&&/granada|lanca-granadas|projetil explosivo|causa.{0,65}dano|torreta/.test(text) },
  { id:'engage', label:'Entrada e reposicionamento', test:({text,type})=>/ativa/.test(type)&&/salta|invisivel|velocidade de movimento.{0,45}(?:aumenta|\+)/.test(text) },
  { id:'ranged_pressure', label:'Pressão de alcance', test:({text})=>/alcance de tiro|alcance de mira|atirar atraves de paredes|tempo de mira/.test(text) },
  { id:'team_utility', label:'Talento coletivo', test:({type})=>/talento de equipe/.test(type) }
];

const COVERAGE_WEIGHTS = {
  team_sustain:16, protection:14, control:12, damage_amp:10, tempo_buff:8,
  armor_pressure:8, recon:7, burst:8, engage:6, mobility_team:5
};

const INTERACTION_RULES = [
  { ids:['control','burst'], points:7, title:'Controle + explosão', detail:'O trio cria janela de contenção e consegue convertê-la em dano imediato.' },
  { ids:['armor_pressure','burst'], points:6, title:'Armadura sob pressão', detail:'Perfuração ou redução de armadura encontra uma fonte clara de dano ativo.' },
  { ids:['damage_amp','burst'], points:6, title:'Dano potencializado', detail:'Amplificadores de dano complementam uma fonte direta de pressão.' },
  { ids:['tempo_buff','burst'], points:5, title:'Ritmo ofensivo', detail:'Cadência, recarga ou munição ajudam a sustentar a pressão do trio.' },
  { ids:['team_sustain','engage'], points:5, title:'Entrada com sustentação', detail:'Recuperação coletiva reduz o risco de heróis que avançam ou reposicionam.' },
  { ids:['protection','engage'], points:5, title:'Avanço protegido', detail:'Escudos, armadura ou mitigação dão cobertura para aproximação.' },
  { ids:['mobility_team','engage'], points:4, title:'Mobilidade coordenada', detail:'Bônus coletivos de movimento acompanham ferramentas de entrada ou flanco.' },
  { ids:['recon','ranged_pressure'], points:5, title:'Visão + alcance', detail:'Informação sobre inimigos combina com ferramentas que operam a distância.' },
  { ids:['control','damage_amp'], points:4, title:'Janela de dano', detail:'Controle ajuda o trio a aproveitar melhor amplificadores ofensivos.' }
];

function skillConfidence(skill) {
  const status = normalize(skill?.verification_status);
  if (status === 'verified' && skill?.needs_recheck === false) return 1;
  if (status === 'corroborated') return 0.82;
  return 0.62;
}

export function buildHeroProfile(hero) {
  const skills = Array.isArray(hero?.skills) ? hero.skills.filter(skill => skill?.enabled !== false) : [];
  const evidence = new Map();
  for (const skill of skills) {
    const text = normalize(`${skill?.name || ''} ${skill?.description || ''}`);
    const type = normalize(skill?.skill_type || '');
    for (const capability of CAPABILITY_DEFINITIONS) {
      if (!capability.test({ text, type, skill })) continue;
      if (!evidence.has(capability.id)) evidence.set(capability.id, []);
      evidence.get(capability.id).push({
        skillId:skill.id || '', skillName:skill.name || 'Habilidade', skillType:skill.skill_type || '',
        confidence:skillConfidence(skill), verificationStatus:skill.verification_status || '',
        needsRecheck:skill.needs_recheck !== false
      });
    }
  }
  return { hero, capabilities:new Set(evidence.keys()), evidence };
}

function teamHas(profiles, capabilityId) { return profiles.some(profile => profile.capabilities.has(capabilityId)); }

function capabilityEvidence(profiles, capabilityId) {
  const rows = [];
  for (const profile of profiles) {
    for (const entry of profile.evidence.get(capabilityId) || []) {
      rows.push({
        heroId:profile.hero?.id || '', heroName:profile.hero?.name || 'Herói', capabilityId,
        capabilityLabel:CAPABILITY_DEFINITIONS.find(item=>item.id===capabilityId)?.label || capabilityId,
        ...entry
      });
    }
  }
  return rows;
}

function firstEvidence(profiles, capabilityId) { return capabilityEvidence(profiles, capabilityId)[0] || null; }
function evidenceLabel(evidence) { return evidence ? `${evidence.heroName} · ${evidence.skillName}` : ''; }

function evaluateInteraction(profiles, rule) {
  if (!rule.ids.every(id => teamHas(profiles,id))) return null;
  return {
    type:'interaction', points:rule.points, title:rule.title, detail:rule.detail,
    evidence:rule.ids.map(id=>firstEvidence(profiles,id)).filter(Boolean)
  };
}

function buildWeaknesses(profiles) {
  const weaknesses = [];
  if (!teamHas(profiles,'team_sustain') && !teamHas(profiles,'protection')) {
    weaknesses.push({ title:'Pouca segurança coletiva', detail:'Não há evidência clara de cura, escudo ou mitigação para sustentar o trio.' });
  }
  if (!teamHas(profiles,'control') && !teamHas(profiles,'recon')) {
    weaknesses.push({ title:'Pouca interferência', detail:'O trio oferece pouca evidência de controle, revelação ou informação sobre o inimigo.' });
  }
  if (!teamHas(profiles,'damage_amp') && !teamHas(profiles,'armor_pressure') && !teamHas(profiles,'tempo_buff')) {
    weaknesses.push({ title:'Pressão pouco amplificada', detail:'Faltam buffs, quebra de armadura ou aceleração de combate para elevar a ofensiva.' });
  }
  if (!teamHas(profiles,'engage') && !teamHas(profiles,'mobility_team')) {
    weaknesses.push({ title:'Mobilidade limitada', detail:'Poucas ferramentas ajudam o trio a entrar, sair ou reposicionar em conjunto.' });
  }
  return weaknesses.slice(0,2);
}

function strengthFromFactor(factor) {
  return {
    title:factor.title,
    detail:factor.detail || '',
    evidence:Array.isArray(factor.evidence) ? factor.evidence.slice(0,2) : [],
    points:Number(factor.points || 0)
  };
}

function buildSummary(strengths, weaknesses) {
  if (!strengths.length) return 'O trio ainda não apresenta um eixo funcional forte nas habilidades cadastradas.';
  if (!weaknesses.length) return `O trio se destaca por ${strengths.slice(0,2).map(item=>item.title.toLowerCase()).join(' e ')}, sem uma lacuna principal identificada pelo modelo.`;
  return `O trio se destaca por ${strengths[0].title.toLowerCase()}, mas pede atenção em ${weaknesses[0].title.toLowerCase()}.`;
}

export function evaluateComposition(heroes) {
  const team = Array.isArray(heroes) ? heroes.filter(Boolean).slice(0,3) : [];
  const profiles = team.map(buildHeroProfile);
  if (profiles.length !== 3) {
    return {
      score:null, profiles, coverage:[], factors:[], strengths:[], weaknesses:[],
      summary:'Selecione três heróis diferentes para calcular a compatibilidade completa.',
      warnings:['Selecione três heróis diferentes para calcular a compatibilidade completa.'], evidence:[]
    };
  }

  const coverage = [];
  let coverageScore = 0;
  for (const [capabilityId,points] of Object.entries(COVERAGE_WEIGHTS)) {
    if (!teamHas(profiles,capabilityId)) continue;
    coverageScore += points;
    const evidence = firstEvidence(profiles,capabilityId);
    coverage.push({
      capabilityId,
      label:CAPABILITY_DEFINITIONS.find(item=>item.id===capabilityId)?.label || capabilityId,
      points,
      evidence:evidence ? [evidence] : []
    });
  }

  const interactions = INTERACTION_RULES.map(rule=>evaluateInteraction(profiles,rule)).filter(Boolean)
    .sort((a,b)=>b.points-a.points || a.title.localeCompare(b.title,'pt-BR'));
  const interactionScore = Math.min(20, interactions.reduce((sum,item)=>sum+item.points,0));
  const uniqueCapabilities = new Set(profiles.flatMap(profile=>[...profile.capabilities]));
  const diversityBonus = Math.min(6,Math.max(0,uniqueCapabilities.size-5));
  const redundancyPenalty = uniqueCapabilities.size < 5 ? (5-uniqueCapabilities.size)*4 : 0;
  const rawScore = coverageScore + interactionScore + diversityBonus - redundancyPenalty;
  const score = Math.max(0,Math.min(100,Math.round(rawScore)));

  const coverageFactors = coverage.sort((a,b)=>b.points-a.points || a.label.localeCompare(b.label,'pt-BR')).slice(0,4).map(item=>({
    type:'coverage', points:item.points, title:item.label,
    detail:item.evidence[0] ? `Evidência: ${evidenceLabel(item.evidence[0])}.` : '', evidence:item.evidence
  }));
  const factors = [...interactions.slice(0,4), ...coverageFactors]
    .sort((a,b)=>b.points-a.points || a.title.localeCompare(b.title,'pt-BR')).slice(0,6);
  const strengths = factors.slice(0,3).map(strengthFromFactor);
  const weaknesses = buildWeaknesses(profiles);
  const evidence = [];
  for (const capabilityId of uniqueCapabilities) evidence.push(...capabilityEvidence(profiles,capabilityId));

  return {
    score, profiles, coverage, factors, strengths, weaknesses,
    summary:buildSummary(strengths,weaknesses),
    warnings:weaknesses.map(item=>item.detail), evidence, interactionScore, coverageScore, diversityBonus,
    model:'skill-compatibility-v2'
  };
}

function choose(items,size,start=0,prefix=[],output=[]) {
  if (prefix.length===size) { output.push(prefix.slice()); return output; }
  for (let index=start; index<items.length; index+=1) {
    prefix.push(items[index]); choose(items,size,index+1,prefix,output); prefix.pop();
  }
  return output;
}

export function recommendCompositions(allHeroes, selectedIds=[], limit=6) {
  const heroes = Array.isArray(allHeroes) ? allHeroes.filter(Boolean) : [];
  const selectedSet = new Set((selectedIds || []).filter(Boolean));
  const selected = heroes.filter(hero=>selectedSet.has(hero.id));
  if (selected.length>3) return [];
  const missing = 3-selected.length;
  const pool = heroes.filter(hero=>!selectedSet.has(hero.id));
  const candidateGroups = missing===0 ? [[]] : choose(pool,missing);
  const results = candidateGroups.map(group=>{
    const trio=[...selected,...group];
    return { heroes:trio, ...evaluateComposition(trio) };
  });
  results.sort((first,second)=>{
    const scoreDiff=Number(second.score||0)-Number(first.score||0); if(scoreDiff) return scoreDiff;
    const interactionDiff=Number(second.interactionScore||0)-Number(first.interactionScore||0); if(interactionDiff) return interactionDiff;
    return first.heroes.map(hero=>hero.name||'').join(' + ').localeCompare(second.heroes.map(hero=>hero.name||'').join(' + '),'pt-BR');
  });
  return results.slice(0,Math.max(1,Number(limit)||1));
}

export const COMPOSITION_CAPABILITIES = CAPABILITY_DEFINITIONS.map(({id,label})=>({id,label}));
