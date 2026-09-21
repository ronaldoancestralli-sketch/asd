/**
 * Echo Arena — regras numéricas do Bullet Echo.
 *
 * Este módulo não cria "scores". Ele preserva os valores coletados do jogo,
 * aplica apenas os modificadores cadastrados no equipamento/raridade e mantém
 * os cálculos derivados separados dos atributos oficiais.
 */

const ALIASES = {
  damage_per_shot: ['damage_per_shot', 'weapon_damage', 'dano_por_tiro', 'dano_da_arma_por_tiro'],
  health: ['health', 'life', 'hp', 'vida'],
  armor: ['armor', 'armour', 'armor_value', 'armadura', 'valor_de_armadura'],
  max_movement_speed: ['max_movement_speed', 'movement_speed', 'velocidade_maxima'],
  aimed_movement_speed: ['aimed_movement_speed', 'movement_speed_aiming', 'velocidade_ao_mirar'],
  vision_range: ['vision_range', 'visionrange', 'alcance_de_visao'],
  armor_resistance: ['armor_resistance', 'resistencia_de_armadura'],
  penetration_resistance: ['penetration_resistance', 'resistencia_a_perfuracao'],
  armor_penetration: ['armor_penetration', 'weapon_armor_penetration', 'perfuracao_de_armadura'],
  penetration_power: ['penetration_power', 'armor_penetration_power', 'poder_de_perfuracao'],
  health_damage_multiplier: ['health_damage_multiplier', 'modificador_contra_vida'],
  armor_drone_multiplier: ['armor_drone_multiplier', 'modificador_contra_armadura_e_drones'],
  fire_interval: ['fire_interval', 'shots_per_second', 'intervalo_entre_tiros'],
  firepower_summary: ['firepower', 'weapon_firepower', 'poder_de_fogo'],
  armor_break_summary: ['armor_break', 'quebra_de_armadura'],
  fire_rate_summary: ['fire_rate', 'cadencia_de_tiro'],
  ammo_capacity_summary: ['magazine_capacity', 'ammo_capacity', 'capacidade_de_municao_resumo'],
  effective_range_summary: ['effective_range', 'alcance_efetivo'],
  aiming_stability_summary: ['aiming_stability', 'estabilidade_de_mira'],
  reload_time: ['reload_time', 'tempo_de_recarga'],
  magazine_size: ['magazine_size', 'tamanho_do_pente', 'capacidade_de_municao'],
  hip_fire_range: ['hip_fire_range', 'alcance_sem_mira'],
  aimed_range: ['aimed_range', 'weapon_range', 'alcance_com_mira'],
  aim_time: ['aim_time', 'tempo_de_mira'],
  dispersion: ['dispersion', 'weapon_spread', 'dispersao'],
  moving_dispersion: ['moving_dispersion', 'moving_spread_modifier', 'dispersao_em_movimento'],
  aimed_dispersion: ['aimed_dispersion', 'dispersao_com_mira']
};

const aliasToCanonical = new Map();

function slug(value = '') {
  return String(value).replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

for (const [canonical, aliases] of Object.entries(ALIASES)) {
  for (const alias of aliases) aliasToCanonical.set(slug(alias), canonical);
}

export const STAT_DEFINITIONS = {
  damage_per_shot: { nome: 'Dano por tiro', icone: '🚀', cor: '#ff5470' },
  health: { nome: 'Vida', icone: '♥', cor: '#4ade80' },
  armor: { nome: 'Armadura', icone: '🛡', cor: '#5b8def' },
  max_movement_speed: { nome: 'Velocidade máxima', icone: '⚡', cor: '#fbbf24' },
  aimed_movement_speed: { nome: 'Velocidade ao mirar', icone: '♞', cor: '#fbbf24' },
  vision_range: { nome: 'Alcance de visão', icone: '◎', cor: '#a855f7' },
  armor_penetration: { nome: 'Penetração de armadura', icone: '⌖', cor: '#65e8ff', unit: '%' },
  penetration_power: { nome: 'Poder de perfuração', icone: '✦', cor: '#65e8ff' },
  armor_resistance: { nome: 'Resistência à armadura', icone: '♢', cor: '#4ade80', unit: '%' },
  health_damage_multiplier: { nome: 'Multiplicador contra vida', icone: '♥', cor: '#ff5470', prefix: '×', decimals: 2 },
  armor_drone_multiplier: { nome: 'Multiplicador contra armadura', icone: '🛡', cor: '#65e8ff', prefix: '×', decimals: 2 },
  aimed_range: { nome: 'Alcance com mira', icone: '◎', cor: '#a855f7' },
  hip_fire_range: { nome: 'Alcance sem mira', icone: '◎', cor: '#a855f7' },
  reload_time: { nome: 'Tempo de recarga', icone: '↻', cor: '#fbbf24', unit: 's', lowerBetter: true },
  magazine_size: { nome: 'Capacidade de munição', icone: '▣', cor: '#65e8ff' },
  firepower_summary: { nome: 'Poder de fogo (resumo do jogo)', icone: '🚀', cor: '#ff5470' },
  armor_break_summary: { nome: 'Quebra de armadura (resumo)', icone: '✦', cor: '#65e8ff' },
  fire_rate_summary: { nome: 'Cadência (resumo do jogo)', icone: '↯', cor: '#fbbf24' },
  ammo_capacity_summary: { nome: 'Munição (resumo do jogo)', icone: '▣', cor: '#65e8ff' },
  effective_range_summary: { nome: 'Alcance efetivo (resumo)', icone: '◎', cor: '#a855f7' },
  aiming_stability_summary: { nome: 'Estabilidade de mira (resumo)', icone: '⌖', cor: '#5b8def' }
};

export function canonicalKey(key) {
  const normalized = slug(key);
  return aliasToCanonical.get(normalized) || normalized;
}

export function normalizeGameStats(stats = {}) {
  const result = {};
  const priorities = {};
  for (const [key, raw] of Object.entries(stats || {})) {
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const normalizedKey = slug(key);
    const canonical = canonicalKey(key);
    /* Quando o banco contém uma chave canônica e um apelido legado,
       a canônica sempre vence. Isso impede movement_speed=51 de
       sobrescrever max_movement_speed=171 e armor legado de substituir
       armor_value=797. */
    let priority = normalizedKey === canonical ? 100 : 20;
    if (canonical === 'armor' && normalizedKey === 'armor_value') priority = 110;
    if (canonical === 'max_movement_speed' && normalizedKey === 'max_movement_speed') priority = 110;
    if (canonical === 'damage_per_shot' && normalizedKey === 'damage_per_shot') priority = 110;
    if ((priorities[canonical] ?? -1) > priority) continue;
    result[canonical] = value;
    priorities[canonical] = priority;
  }
  return result;
}

const PERCENT_TARGETS = {
  weapon_damage_to_armor_pct: 'armor_drone_multiplier',
  weapon_damage_to_health_pct: 'health_damage_multiplier',
  armor_max_pct: 'armor',
  armor_maximum_pct: 'armor',
  health_max_pct: 'health',
  max_health_pct: 'health',
  movement_speed_pct: 'max_movement_speed',
  aimed_movement_speed_pct: 'aimed_movement_speed',
  reload_time_pct: 'reload_time'
};

const FLAT_TARGETS = {
  weapon_range_franco: 'aimed_range',
  alcance_de_tiro_com_mira_do_heroi: 'aimed_range'
};

/* ---------- chaves em português livre ----------
   No admin o nome do atributo É a chave: o Mestre digita
   "Alcance de visao do heroi" e é isso que chega aqui. Frase
   livre nunca vai bater numa lista fixa de apelidos, então
   estas regras LEEM a frase e decidem dois pontos:
     alvo  -> qual atributo oficial ela altera
     modo  -> 'percent' (valor é %) ou 'flat' (valor é absoluto)

   A ORDEM IMPORTA: "dano ... armadura" precisa ser testado
   antes de "armadura", senão +11% de dano contra armadura
   viraria +11 pontos de armadura do próprio herói.

   Para fixar um caso específico, prefira ALIASES/PERCENT_TARGETS/
   FLAT_TARGETS acima — eles têm prioridade sobre estas regras. */
const REGRAS_PT = [
  { quando: /dano.*(armadura|drone)/,            alvo: 'armor_drone_multiplier',   modo: 'percent' },
  { quando: /dano.*vida/,                        alvo: 'health_damage_multiplier', modo: 'percent' },
  { quando: /(alcance|distancia).*visao/,        alvo: 'vision_range',             modo: 'flat' },
  { quando: /alcance.*sem\s*mira/,               alvo: 'hip_fire_range',           modo: 'flat' },
  { quando: /alcance.*mira/,                     alvo: 'aimed_range',              modo: 'flat' },
  { quando: /(recarregamento|recarga)/,          alvo: 'reload_time',              modo: 'percent' },
  { quando: /velocidade.*mira/,                  alvo: 'aimed_movement_speed',     modo: 'percent' },
  { quando: /velocidade.*(movimento|maxima|corrida)/, alvo: 'max_movement_speed',  modo: 'percent' },
  { quando: /(municao|pente|carregador)/,        alvo: 'magazine_size',            modo: 'flat' },
  { quando: /resistencia.*armadura/,             alvo: 'armor_resistance',         modo: 'flat' },
  { quando: /(penetracao|perfuracao)/,           alvo: 'armor_penetration',        modo: 'flat' },
  { quando: /armadura/,                          alvo: 'armor',                    modo: 'flat' },
  { quando: /(vida|saude)/,                      alvo: 'health',                   modo: 'flat' },
  { quando: /dano/,                              alvo: 'damage_per_shot',          modo: 'flat' }
];

/** Lê uma chave em português livre e devolve { alvo, modo } ou null. */
export function resolverChavePT(rawKey) {
  const frase = slug(rawKey).replace(/_/g, ' ');
  for (const regra of REGRAS_PT) {
    if (!regra.quando.test(frase)) continue;
    /* a palavra "percentual" na frase manda mais que o padrão da regra */
    const modo = /percentual|porcentagem/.test(frase) ? 'percent' : regra.modo;
    return { alvo: regra.alvo, modo };
  }
  return null;
}

/** Aplica os stats exatamente na ordem em que os itens foram equipados. */
export function applyEquipmentStats(baseInput = {}, equipmentStats = []) {
  const base = normalizeGameStats(baseInput);
  const final = { ...base };
  const applied = [];
  const unknown = [];

  for (const source of equipmentStats) {
    for (const [rawKey, rawValue] of Object.entries(source || {})) {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) continue;
      const key = canonicalKey(rawKey);
      /* Listas fixas primeiro; frase livre em português depois. */
      const pt = (PERCENT_TARGETS[key] || FLAT_TARGETS[key] || key in STAT_DEFINITIONS)
        ? null
        : resolverChavePT(rawKey);
      const percentTarget = PERCENT_TARGETS[key] || (pt?.modo === 'percent' ? pt.alvo : null);
      const flatTarget = FLAT_TARGETS[key] || (pt?.modo === 'flat' ? pt.alvo : null);

      if (percentTarget) {
        if (!(percentTarget in final)) {
          unknown.push(`${rawKey} (base ${percentTarget} ausente)`);
          continue;
        }
        const before = Number(final[percentTarget] ?? base[percentTarget] ?? 0);
        // Multiplicadores x1,00 recebem +6% como x1,06. Demais stats
        // recebem a mesma variação percentual sobre o valor já acumulado.
        const after = before * (1 + value / 100);
        final[percentTarget] = after;
        applied.push({ sourceKey: rawKey, target: percentTarget, value, operation: 'percent', before, after });
      } else {
        const target = flatTarget || key;
        if (!(target in final)) {
          unknown.push(`${rawKey} (base ${target} ausente)`);
          continue;
        }
        const before = Number(final[target] ?? 0);
        const after = before + value;
        final[target] = after;
        applied.push({ sourceKey: rawKey, target, value, operation: 'add', before, after });
      }
    }
  }

  return { base, final, applied, unknown: [...new Set(unknown)] };
}

export const SHOT_DISTRIBUTION_SOURCE = Object.freeze({
  publisher: 'ZeptoLab',
  title: 'Armor Penetration rework: How damage now bypasses Armor',
  titlePt: 'Rework da penetração de armadura: como o dano atravessa a armadura',
  url: 'https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1543-armor-penetration-rework-how-damage-now-bypasses-armor/',
  urlRu: 'https://zepto.helpshift.com/hc/ru/10-bullet-echo/faq/1543-armor-penetration-rework-how-damage-now-bypasses-armor/?l=ru',
  model: 'zeptolab-armor-penetration-rework'
});

export const SHOT_DISTRIBUTION_LIMITS = Object.freeze([
  'Estimativa estática por unidade de dano cadastrada.',
  'Não infere quantidade de projéteis, pellets ou acertos.',
  'Não presume multiplicadores contra vida ou armadura quando eles não estão cadastrados.',
  'Não aplica talentos, habilidades ou estados temporários ausentes nos atributos recebidos.',
  'Não simula dispersão, obstáculos, escudos, dano residual nem excesso de dano após a armadura quebrar.'
]);

function normalizeShotTarget(targetInput = 0) {
  if (targetInput && typeof targetInput === 'object') {
    const rawResistance = targetInput.armorResistance
      ?? targetInput.targetArmorResistance
      ?? targetInput.resistance
      ?? 0;
    return {
      armorActive: targetInput.armorActive !== false && targetInput.hasArmor !== false,
      armorResistance: Math.max(0, Math.min(100, Number(rawResistance) || 0))
    };
  }

  return {
    armorActive: true,
    armorResistance: Math.max(0, Math.min(100, Number(targetInput) || 0))
  };
}

/**
 * Distribui uma unidade de dano cadastrada entre vida e armadura.
 *
 * Com armadura ativa, usa a fórmula oficial publicada pela ZeptoLab:
 * AP efetiva = AP × (100 − AR) / 100.
 * Sem armadura ativa, todo o dano-base segue para a vida e AP/AR não se aplicam.
 * O segundo argumento numérico continua aceito por compatibilidade e representa AR.
 */
export function calculateShotDistribution(statsInput = {}, targetInput = 0) {
  const stats = normalizeGameStats(statsInput);
  const rawDamage = Number(stats.damage_per_shot);
  const hasDamage = Number.isFinite(rawDamage) && rawDamage > 0;
  const damage = hasDamage ? rawDamage : 0;
  const rawArmorPenetration = Number(stats.armor_penetration);
  const hasArmorPenetration = Number.isFinite(rawArmorPenetration);
  const ap = Math.max(0, Math.min(100, hasArmorPenetration ? rawArmorPenetration : 0));
  const target = normalizeShotTarget(targetInput);
  const effectivePenetration = target.armorActive
    ? ap * (100 - target.armorResistance) / 100
    : null;
  const healthShare = target.armorActive ? effectivePenetration / 100 : 1;
  const armorShare = target.armorActive ? 1 - healthShare : 0;
  const healthMultiplier = Number(stats.health_damage_multiplier);
  const armorMultiplier = Number(stats.armor_drone_multiplier);
  const hasHealthMultiplier = Number.isFinite(healthMultiplier);
  const hasArmorMultiplier = Number.isFinite(armorMultiplier);
  const healthDamageBeforeMultiplier = damage * healthShare;
  const armorDamageBeforeMultiplier = damage * armorShare;
  const healthDamage = hasHealthMultiplier
    ? healthDamageBeforeMultiplier * healthMultiplier
    : null;
  const armorDamage = !target.armorActive
    ? 0
    : hasArmorMultiplier
      ? armorDamageBeforeMultiplier * armorMultiplier
      : null;
  const formulaComplete = hasDamage && (!target.armorActive || hasArmorPenetration);
  const multipliersComplete = hasHealthMultiplier && (!target.armorActive || hasArmorMultiplier);

  return {
    formulaModel: SHOT_DISTRIBUTION_SOURCE.model,
    source: SHOT_DISTRIBUTION_SOURCE,
    limitations: SHOT_DISTRIBUTION_LIMITS,
    damageBasis: 'registered-damage-unit',
    armorActive: target.armorActive,
    targetArmorResistance: target.armorResistance,
    armorPenetration: ap,
    armorPenetrationRegistered: hasArmorPenetration,
    effectivePenetration,
    healthShare,
    armorShare,
    baseDamage: damage,
    healthMultiplier: hasHealthMultiplier ? healthMultiplier : null,
    armorMultiplier: hasArmorMultiplier ? armorMultiplier : null,
    healthMultiplierRegistered: hasHealthMultiplier,
    armorMultiplierRegistered: hasArmorMultiplier,
    multipliersComplete,
    healthDamageBeforeMultiplier,
    armorDamageBeforeMultiplier,
    healthDamage,
    armorDamage,
    formulaComplete,
    complete: formulaComplete && multipliersComplete
  };
}

export function buildRealStatLines(calculation, limit = 5) {
  const priority = ['damage_per_shot', 'health', 'armor', 'max_movement_speed',
    'armor_penetration', 'vision_range', 'aimed_range', 'penetration_power',
    'health_damage_multiplier', 'armor_drone_multiplier'];
  const changed = Object.keys(calculation.final).filter(key =>
    key in calculation.base && STAT_DEFINITIONS[key] &&
    Math.abs(Number(calculation.final[key]) - Number(calculation.base[key])) > 1e-9
  );
  const available = [...new Set([...changed, ...priority, ...Object.keys(calculation.final)])]
    .filter(key => key in calculation.base && STAT_DEFINITIONS[key]);

  return available.slice(0, limit).map(key => {
    const definition = STAT_DEFINITIONS[key];
    const base = Number(calculation.base[key] || 0);
    const value = Number(calculation.final[key] || 0);
    const difference = value - base;
    const rawDelta = base ? difference / Math.abs(base) * 100 : (value ? 100 : 0);
    const beneficialDelta = definition.lowerBetter ? -rawDelta : rawDelta;
    const scale = Math.max(Math.abs(base), Math.abs(value), 1) * 1.15;
    return {
      key, nome: definition.nome, curto: definition.nome.toUpperCase(),
      icone: definition.icone, cor: definition.cor, unit: definition.unit || '',
      prefix: definition.prefix || '', decimals: definition.decimals ?? 0,
      base, valor: value, difference, delta: rawDelta,
      beneficialDelta, pctBase: Math.abs(base) / scale * 100,
      pct: Math.abs(value) / scale * 100
    };
  });
}
