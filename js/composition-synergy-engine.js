/*
 * Echo Arena — motor de compatibilidade de composições.
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

function contains(text, pattern) {
  return pattern.test(text);
}

const CAPABILITY_DEFINITIONS = [
  {
    id: 'team_sustain',
    label: 'Sustentação de equipe',
    test: ({ text }) => /(?:equipe|aliad)/.test(text) && /(?:recuper|restaur|cura).{0,90}(?:vida|armadura)|(?:vida|armadura).{0,90}(?:recuper|restaur|cura)/.test(text)
  },
  {
    id: 'protection',
    label: 'Proteção',
    test: ({ text }) => /escudo|parede de energia|bloqueia dano|reduz.{0,70}dano recebido|armadura.{0,80}(?:equipe|aliad)|(?:equipe|aliad).{0,80}armadura/.test(text)
  },
  {
    id: 'damage_amp',
    label: 'Amplificação de dano',
    test: ({ text }) => /(?:equipe|aliad).{0,110}(?:\+\s*\d+%?\s*(?:de\s*)?dano|dano contra)|inimig.{0,100}(?:receb|sofr).{0,50}\+\s*\d+%?\s*(?:de\s*)?dano/.test(text)
  },
  {
    id: 'tempo_buff',
    label: 'Ritmo de combate',
    test: ({ text }) => /(?:equipe|aliad).{0,120}(?:cadencia de tiro|tempo de recarga da arma|municao|municoes)|(?:cadencia de tiro|tempo de recarga da arma).{0,120}(?:equipe|aliad)/.test(text)
  },
  {
    id: 'mobility_team',
    label: 'Mobilidade coletiva',
    test: ({ text }) => /(?:equipe|aliad).{0,120}(?:velocidade de movimento|ruido de corrida)|(?:velocidade de movimento|ruido de corrida).{0,120}(?:equipe|aliad)/.test(text)
  },
  {
    id: 'control',
    label: 'Controle',
    test: ({ text }) => /atord|cegueir|nao pod(?:e|em) atirar|bloqueia as armas|reduz.{0,70}velocidade de movimento|reduz.{0,70}cadencia de tiro|\+\s*\d+%?\s*de dispersao|visao.{0,35}caem|perdem.{0,55}visao/.test(text)
  },
  {
    id: 'armor_pressure',
    label: 'Pressão de armadura',
    test: ({ text }) => /reduz.{0,90}armadura|penetracao de armadura|poder de perfuracao|dano a armadura/.test(text)
  },
  {
    id: 'recon',
    label: 'Informação e visão',
    test: ({ text }) => /revela inimigos|visao termica|atirar atraves de paredes|alcance de mira|\+\s*\d+%?\s*de visao|\+\s*\d+\s*de visao/.test(text)
  },
  {
    id: 'burst',
    label: 'Pressão explosiva',
    test: ({ text, type }) => /ativa/.test(type) && /granada|lanca-granadas|projetil explosivo|causa.{0,65}dano|torreta/.test(text)
  },
  {
    id: 'engage',
    label: 'Entrada e reposicionamento',
    test: ({ text, type }) => /ativa/.test(type) && /salta|invisivel|velocidade de movimento.{0,45}(?:aumenta|\+)/.test(text)
  },
  {
    id: 'ranged_pressure',
    label: 'Pressão de alcance',
    test: ({ text }) => /alcance de tiro|alcance de mira|atirar atraves de paredes|tempo de mira/.test(text)
  },
  {
    id: 'team_utility',
    label: 'Talento coletivo',
    test: ({ type }) => /talento de equipe/.test(type)
  }
];

const COVERAGE_WEIGHTS = {
  team_sustain: 16,
  protection: 14,
  control: 12,
  damage_amp: 10,
  tempo_buff: 8,
  armor_pressure: 8,
  recon: 7,
  burst: 8,
  engage: 6,
  mobility_team: 5
};

const INTERACTION_RULES = [
  {
    ids: ['control', 'burst'],
    points: 7,
    title: 'Controle abre janela para dano explosivo',
    detail: 'O trio combina contenção do inimigo com habilidades de pressão imediata.'
  },
  {
    ids: ['armor_pressure', 'burst'],
    points: 6,
    title: 'Quebra de armadura amplifica pressão',
    detail: 'Há redução/perfuração de armadura junto de habilidades de dano ativo.'
  },
  {
    ids: ['damage_amp', 'burst'],
    points: 6,
    title: 'Amplificador coletivo encontra fonte de dano',
    detail: 'Buffs/debuffs de dano podem potencializar uma janela ofensiva do trio.'
  },
  {
    ids: ['tempo_buff', 'burst'],
    points: 5,
    title: 'Ritmo de combate sustenta a ofensiva',
    detail: 'Cadência, recarga ou munição complementam habilidades de pressão.'
  },
  {
    ids: ['team_sustain', 'engage'],
    points: 5,
    title: 'Sustentação apoia entradas agressivas',
    detail: 'Recuperação coletiva ajuda a absorver o risco de heróis com entrada/reposicionamento.'
  },
  {
    ids: ['protection', 'engage'],
    points: 5,
    title: 'Proteção dá cobertura para avançar',
    detail: 'Escudos, armadura ou mitigação complementam ferramentas de aproximação.'
  },
  {
    ids: ['mobility_team', 'engage'],
    points: 4,
    title: 'Mobilidade coletiva reforça reposicionamento',
    detail: 'Bônus de movimento podem acompanhar heróis que dependem de entrada ou flanco.'
  },
  {
    ids: ['recon', 'ranged_pressure'],
    points: 5,
    title: 'Informação favorece pressão de alcance',
    detail: 'Visão/revelação se conecta a ferramentas que operam a distância.'
  },
  {
    ids: ['control', 'damage_amp'],
    points: 4,
    title: 'Controle prolonga a janela de dano',
    detail: 'Debuffs de movimento/armas ajudam a aproveitar amplificadores ofensivos.'
  }
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
        skillId: skill.id || '',
        skillName: skill.name || 'Habilidade',
        skillType: skill.skill_type || '',
        confidence: skillConfidence(skill),
        verificationStatus: skill.verification_status || '',
        needsRecheck: skill.needs_recheck !== false
      });
    }
  }

  return {
    hero,
    capabilities: new Set(evidence.keys()),
    evidence
  };
}

function teamHas(profiles, capabilityId) {
  return profiles.some(profile => profile.capabilities.has(capabilityId));
}

function capabilityEvidence(profiles, capabilityId) {
  const rows = [];
  for (const profile of profiles) {
    const entries = profile.evidence.get(capabilityId) || [];
    for (const entry of entries) {
      rows.push({
        heroId: profile.hero?.id || '',
        heroName: profile.hero?.name || 'Herói',
        capabilityId,
        capabilityLabel: CAPABILITY_DEFINITIONS.find(item => item.id === capabilityId)?.label || capabilityId,
        ...entry
      });
    }
  }
  return rows;
}

function firstEvidence(profiles, capabilityId) {
  return capabilityEvidence(profiles, capabilityId)[0] || null;
}

function evidenceLabel(evidence) {
  if (!evidence) return '';
  return `${evidence.heroName} · ${evidence.skillName}`;
}

function evaluateInteraction(profiles, rule) {
  if (!rule.ids.every(id => teamHas(profiles, id))) return null;
  const evidence = rule.ids.map(id => firstEvidence(profiles, id)).filter(Boolean);
  return {
    type: 'interaction',
    points: rule.points,
    title: rule.title,
    detail: rule.detail,
    evidence
  };
}

function buildWarnings(profiles) {
  const warnings = [];
  if (!teamHas(profiles, 'team_sustain') && !teamHas(profiles, 'protection')) {
    warnings.push('Nenhuma sustentação ou proteção coletiva foi identificada nas habilidades cadastradas.');
  }
  if (!teamHas(profiles, 'control') && !teamHas(profiles, 'recon')) {
    warnings.push('O trio tem pouca evidência de controle ou informação sobre o inimigo.');
  }
  if (!teamHas(profiles, 'damage_amp') && !teamHas(profiles, 'armor_pressure') && !teamHas(profiles, 'tempo_buff')) {
    warnings.push('Não foi identificado um amplificador coletivo claro para a pressão ofensiva.');
  }
  if (!teamHas(profiles, 'team_utility')) {
    warnings.push('Nenhum talento de equipe foi reconhecido para o trio.');
  }
  return warnings;
}

export function evaluateComposition(heroes) {
  const team = Array.isArray(heroes) ? heroes.filter(Boolean).slice(0, 3) : [];
  const profiles = team.map(buildHeroProfile);
  if (profiles.length !== 3) {
    return {
      score: null,
      profiles,
      coverage: [],
      factors: [],
      warnings: ['Selecione três heróis diferentes para calcular a compatibilidade completa.'],
      evidence: []
    };
  }

  const coverage = [];
  let coverageScore = 0;
  for (const [capabilityId, points] of Object.entries(COVERAGE_WEIGHTS)) {
    if (!teamHas(profiles, capabilityId)) continue;
    coverageScore += points;
    const evidence = firstEvidence(profiles, capabilityId);
    coverage.push({
      capabilityId,
      label: CAPABILITY_DEFINITIONS.find(item => item.id === capabilityId)?.label || capabilityId,
      points,
      evidence: evidence ? [evidence] : []
    });
  }

  const interactions = INTERACTION_RULES
    .map(rule => evaluateInteraction(profiles, rule))
    .filter(Boolean)
    .sort((a, b) => b.points - a.points || a.title.localeCompare(b.title, 'pt-BR'));

  const interactionScore = Math.min(20, interactions.reduce((sum, item) => sum + item.points, 0));
  const uniqueCapabilities = new Set(profiles.flatMap(profile => [...profile.capabilities]));
  const diversityBonus = Math.min(6, Math.max(0, uniqueCapabilities.size - 5));
  const redundancyPenalty = uniqueCapabilities.size < 5 ? (5 - uniqueCapabilities.size) * 4 : 0;
  const rawScore = coverageScore + interactionScore + diversityBonus - redundancyPenalty;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  const coverageFactors = coverage
    .sort((a, b) => b.points - a.points || a.label.localeCompare(b.label, 'pt-BR'))
    .slice(0, 4)
    .map(item => ({
      type: 'coverage',
      points: item.points,
      title: item.label,
      detail: item.evidence[0] ? `Evidência: ${evidenceLabel(item.evidence[0])}.` : '',
      evidence: item.evidence
    }));

  const factors = [...interactions.slice(0, 4), ...coverageFactors]
    .sort((a, b) => b.points - a.points || a.title.localeCompare(b.title, 'pt-BR'))
    .slice(0, 6);

  const evidence = [];
  for (const capabilityId of uniqueCapabilities) {
    evidence.push(...capabilityEvidence(profiles, capabilityId));
  }

  return {
    score,
    profiles,
    coverage,
    factors,
    warnings: buildWarnings(profiles),
    evidence,
    interactionScore,
    coverageScore,
    diversityBonus,
    model: 'skill-compatibility-v1'
  };
}

function choose(items, size, start = 0, prefix = [], output = []) {
  if (prefix.length === size) {
    output.push(prefix.slice());
    return output;
  }
  for (let index = start; index < items.length; index += 1) {
    prefix.push(items[index]);
    choose(items, size, index + 1, prefix, output);
    prefix.pop();
  }
  return output;
}

export function recommendCompositions(allHeroes, selectedIds = [], limit = 6) {
  const heroes = Array.isArray(allHeroes) ? allHeroes.filter(Boolean) : [];
  const selectedSet = new Set((selectedIds || []).filter(Boolean));
  const selected = heroes.filter(hero => selectedSet.has(hero.id));
  if (selected.length > 3) return [];

  const missing = 3 - selected.length;
  const pool = heroes.filter(hero => !selectedSet.has(hero.id));
  const candidateGroups = missing === 0 ? [[]] : choose(pool, missing);
  const results = candidateGroups.map(group => {
    const trio = [...selected, ...group];
    const evaluation = evaluateComposition(trio);
    return {
      heroes: trio,
      ...evaluation
    };
  });

  results.sort((first, second) => {
    const scoreDiff = Number(second.score || 0) - Number(first.score || 0);
    if (scoreDiff) return scoreDiff;
    const interactionDiff = Number(second.interactionScore || 0) - Number(first.interactionScore || 0);
    if (interactionDiff) return interactionDiff;
    const firstNames = first.heroes.map(hero => hero.name || '').join(' + ');
    const secondNames = second.heroes.map(hero => hero.name || '').join(' + ');
    return firstNames.localeCompare(secondNames, 'pt-BR');
  });

  return results.slice(0, Math.max(1, Number(limit) || 1));
}

export const COMPOSITION_CAPABILITIES = CAPABILITY_DEFINITIONS.map(({ id, label }) => ({ id, label }));
