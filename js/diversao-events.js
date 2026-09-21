const normalizeToken = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function classNameOf(row) {
  return String(row?.className || row?.class_name || 'Sem classe').trim() || 'Sem classe';
}

function classesOf(rows = []) {
  return rows.map(classNameOf);
}

function normalizedClassesOf(rows = []) {
  return classesOf(rows).map(normalizeToken);
}

function signature(values = []) {
  return values.slice().sort((a, b) => a.localeCompare(b)).join('|');
}

function countValues(values = []) {
  const counts = new Map();
  values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return counts;
}

function uniqueCount(values = []) {
  return new Set(values).size;
}

function hasClass(values, token) {
  const normalized = normalizeToken(token);
  return values.some(value => value === normalized || value.includes(normalized));
}

function dominantClass(values = []) {
  const counts = countValues(values);
  let winner = '';
  let amount = 0;
  counts.forEach((count, value) => {
    if (count > amount) {
      winner = value;
      amount = count;
    }
  });
  return { value: winner, count: amount };
}

const EVENT_DEFINITIONS = {
  mirror: {
    id: 'mirror',
    label: 'CONFRONTO ESPELHO',
    kicker: 'Evento raro · composição refletida',
    description: 'Os dois lados saíram com a mesma distribuição de classes.',
    tone: 'violet',
    priority: 100
  },
  triple: {
    id: 'triple',
    label: 'TRINCA SELADA',
    kicker: 'Evento raro · uma classe dominou o trio',
    description: 'Um dos lados foi formado por três heróis da mesma classe.',
    tone: 'gold',
    priority: 90
  },
  perfectChaos: {
    id: 'perfect-chaos',
    label: 'CAOS PERFEITO',
    kicker: 'Evento raro · diversidade máxima',
    description: 'Os seis heróis vieram de seis classes diferentes.',
    tone: 'prism',
    priority: 80
  },
  complete: {
    id: 'complete',
    label: 'FORMAÇÃO COMPLETA',
    kicker: 'Evento especial · trio sem repetir classe',
    description: 'Pelo menos um dos lados recebeu três classes diferentes.',
    tone: 'cyan',
    priority: 60
  }
};

function detectEvents(allyClasses, enemyClasses) {
  const allyUnique = uniqueCount(allyClasses);
  const enemyUnique = uniqueCount(enemyClasses);
  const allClasses = [...allyClasses, ...enemyClasses];
  const events = [];

  if (allyClasses.length === 3 && enemyClasses.length === 3 && signature(allyClasses) === signature(enemyClasses)) {
    events.push(EVENT_DEFINITIONS.mirror);
  }

  if (allyUnique === 1 || enemyUnique === 1) {
    events.push(EVENT_DEFINITIONS.triple);
  }

  if (uniqueCount(allClasses) === 6) {
    events.push(EVENT_DEFINITIONS.perfectChaos);
  }

  if (allyUnique === 3 || enemyUnique === 3) {
    events.push(EVENT_DEFINITIONS.complete);
  }

  return events.slice().sort((a, b) => b.priority - a.priority);
}

function detectPersonality(allyClasses, enemyClasses, events) {
  const allClasses = [...allyClasses, ...enemyClasses];
  const uniqueTotal = uniqueCount(allClasses);
  const dominant = dominantClass(allClasses);
  const primary = events[0];

  if (primary?.id === 'mirror') {
    return {
      id: 'look-in-the-mirror',
      label: 'OLHE NO ESPELHO',
      description: 'A distribuição de classes dos dois lados se repetiu.'
    };
  }

  if (primary?.id === 'triple') {
    return {
      id: 'triple-echo',
      label: 'ECO TRIPLO',
      description: 'Uma única classe tomou conta de um dos trios.'
    };
  }

  if (primary?.id === 'perfect-chaos') {
    return {
      id: 'controlled-chaos',
      label: 'CAOS CONTROLADO',
      description: 'Nenhuma classe se repetiu entre os seis heróis.'
    };
  }

  if (hasClass(allClasses, 'tanque') && allClasses.filter(value => value.includes('tanque')).length >= 3) {
    return {
      id: 'wall-to-wall',
      label: 'PAREDE CONTRA PAREDE',
      description: 'Tanques apareceram com força nesta composição.'
    };
  }

  if ((hasClass(allClasses, 'franco atirador') || hasClass(allClasses, 'franco-atirador')) && allClasses.filter(value => value.includes('franco') && value.includes('atirador')).length >= 3) {
    return {
      id: 'nobody-blinks',
      label: 'NINGUÉM PISCA',
      description: 'Franco-atiradores dominaram a assinatura da rodada.'
    };
  }

  if (uniqueTotal >= 4) {
    return {
      id: 'open-formation',
      label: 'FORMAÇÃO ABERTA',
      description: `${uniqueTotal} classes diferentes dividiram o confronto.`
    };
  }

  if (dominant.count >= 3) {
    return {
      id: 'dominant-class',
      label: 'CLASSE DOMINANTE',
      description: 'Uma mesma classe apareceu pelo menos três vezes na rodada.'
    };
  }

  return {
    id: 'crossed-signals',
    label: 'SINAIS CRUZADOS',
    description: 'A arena montou dois trios com assinaturas diferentes.'
  };
}

export function analyzeRound(allies = [], enemies = []) {
  const allyClassesRaw = classesOf(allies);
  const enemyClassesRaw = classesOf(enemies);
  const allyClasses = normalizedClassesOf(allies);
  const enemyClasses = normalizedClassesOf(enemies);
  const events = detectEvents(allyClasses, enemyClasses);
  const personality = detectPersonality(allyClasses, enemyClasses, events);

  return {
    primaryEvent: events[0] || null,
    events,
    personality,
    stats: {
      allyUniqueClasses: uniqueCount(allyClasses),
      enemyUniqueClasses: uniqueCount(enemyClasses),
      totalUniqueClasses: uniqueCount([...allyClasses, ...enemyClasses]),
      allyClasses: allyClassesRaw,
      enemyClasses: enemyClassesRaw
    }
  };
}

export function pickCaptainIndex(team = [], random = Math.random) {
  if (!Array.isArray(team) || team.length === 0) return -1;
  const value = Number(random?.());
  const safe = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999999999) : Math.random();
  return Math.floor(safe * team.length);
}
