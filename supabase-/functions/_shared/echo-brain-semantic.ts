export const FEATURE_SCHEMA_VERSION = 'composition-capabilities-v1';
export const SEMANTIC_FEATURE_SCHEMA_VERSION = 'composition-semantic-effects-v2';
export const SEMANTIC_CONTEXT_FEATURE_SCHEMA_VERSION = 'composition-semantic-context-v3';
export const LEGACY_FEATURE_SCHEMA_VERSION = FEATURE_SCHEMA_VERSION;

export const CAPABILITIES = [
  ['team_sustain', 'Sustentação', ({ text }: any) => /(?:equipe|aliad)/.test(text) && /(?:recuper|restaur|cura).{0,90}(?:vida|armadura)|(?:vida|armadura).{0,90}(?:recuper|restaur|cura)/.test(text)],
  ['protection', 'Proteção', ({ text }: any) => /escudo|parede de energia|bloqueia dano|reduz.{0,70}dano recebido|armadura.{0,80}(?:equipe|aliad)|(?:equipe|aliad).{0,80}armadura/.test(text)],
  ['damage_amp', 'Amplificação de dano', ({ text }: any) => /(?:equipe|aliad).{0,110}(?:\+\s*\d+%?\s*(?:de\s*)?dano|dano contra)|inimig.{0,100}(?:receb|sofr).{0,50}\+\s*\d+%?\s*(?:de\s*)?dano/.test(text)],
  ['tempo_buff', 'Ritmo de combate', ({ text }: any) => /(?:equipe|aliad).{0,120}(?:cadencia de tiro|tempo de recarga da arma|municao|municoes)|(?:cadencia de tiro|tempo de recarga da arma).{0,120}(?:equipe|aliad)/.test(text)],
  ['mobility_team', 'Mobilidade coletiva', ({ text }: any) => /(?:equipe|aliad).{0,120}(?:velocidade de movimento|ruido de corrida)|(?:velocidade de movimento|ruido de corrida).{0,120}(?:equipe|aliad)/.test(text)],
  ['control', 'Controle', ({ text }: any) => /atord|cegueir|nao pod(?:e|em) atirar|bloqueia as armas|reduz.{0,70}velocidade de movimento|reduz.{0,70}cadencia de tiro|dispersao|perdem.{0,55}visao/.test(text)],
  ['armor_pressure', 'Pressão de armadura', ({ text }: any) => /reduz.{0,90}armadura|penetracao de armadura|poder de perfuracao|dano a armadura/.test(text)],
  ['recon', 'Informação e visão', ({ text }: any) => /revela inimigos|visao termica|atirar atraves de paredes|alcance de mira|de visao/.test(text)],
  ['burst', 'Pressão explosiva', ({ text, type }: any) => /ativa/.test(type) && /granada|lanca-granadas|projetil explosivo|causa.{0,65}dano|torreta/.test(text)],
  ['engage', 'Entrada e reposicionamento', ({ text, type }: any) => /ativa/.test(type) && /salta|invisivel|velocidade de movimento.{0,45}(?:aumenta|\+)/.test(text)],
  ['ranged_pressure', 'Pressão de alcance', ({ text }: any) => /alcance de tiro|alcance de mira|atirar atraves de paredes|tempo de mira/.test(text)],
  ['team_utility', 'Talento coletivo', ({ type }: any) => /talento de equipe/.test(type)]
] as const;

export const CAP_IDS = CAPABILITIES.map(item => item[0]);
export const INTERACTIONS = [
  ['control', 'burst'], ['armor_pressure', 'burst'], ['damage_amp', 'burst'],
  ['tempo_buff', 'burst'], ['team_sustain', 'engage'], ['protection', 'engage'],
  ['mobility_team', 'engage'], ['recon', 'ranged_pressure'], ['control', 'damage_amp']
] as const;

const COVERAGE: Record<string, number> = {
  team_sustain: 16, protection: 14, control: 12, damage_amp: 10, tempo_buff: 8,
  armor_pressure: 8, recon: 7, burst: 8, engage: 6, mobility_team: 5,
  ranged_pressure: 4, team_utility: 3
};

/* v2 is frozen. Never change its feature order or parser semantics. */
export const EFFECT_IDS = [
  'damage', 'health_damage', 'armor_damage', 'fire_rate', 'reload', 'ammo',
  'health', 'armor', 'damage_reduction', 'movement', 'stealth_noise', 'vision_range',
  'weapon_range', 'aiming', 'armor_penetration', 'penetration_power', 'control_lock',
  'blind', 'reveal', 'wall_shot', 'shield', 'healing', 'charge_restore'
] as const;

export const TRIGGER_IDS = [
  'passive', 'activate', 'on_hit', 'on_kill', 'on_damage_taken', 'conditional_target'
] as const;

/* v3 appends contextual mechanics found in the complete verified pt-BR skill corpus.
   They intentionally distinguish ally buffs, enemy debuffs and self penalties. */
export const CONTEXT_EFFECT_IDS = [
  'ability_damage',
  'area_damage',
  'damage_over_time',
  'regeneration',
  'invisibility',
  'deployable',
  'shield_break',
  'enemy_weapon_lock',
  'self_weapon_lock_penalty',
  'enemy_armor_debuff',
  'max_health_reduction',
  'enemy_damage_amp',
  'enemy_fire_rate_slow',
  'enemy_movement_slow',
  'enemy_vision_suppression',
  'enemy_aim_disruption',
  'self_movement_buff',
  'self_movement_penalty',
  'team_movement_buff',
  'team_damage_buff',
  'team_fire_rate_buff',
  'team_reload_buff',
  'team_healing',
  'team_armor_support',
  'pickup_speed',
  'ally_armor_resistance',
  'armor_repair',
  'team_damage_reduction',
  'team_armor_damage_reduction',
  'team_range_buff',
  'charge_economy'
] as const;

export const CONTEXT_TRIGGER_IDS = [
  'timed_window', 'area', 'periodic', 'after_effect',
  'interrupted_on_damage', 'charge_based', 'direct_hit', 'landing'
] as const;

export const LEGACY_FEATURE_NAMES = [
  'functional_score', ...CAP_IDS, ...INTERACTIONS.map(([a, b]) => `${a}__${b}`),
  'capability_diversity', 'class_diversity'
];

export const SEMANTIC_FEATURE_NAMES = [
  ...LEGACY_FEATURE_NAMES,
  ...EFFECT_IDS.map(id => `effect_${id}`),
  ...TRIGGER_IDS.map(id => `trigger_${id}`),
  'skill_reliability', 'active_uptime', 'semantic_density',
  'team_effect_coverage', 'cross_hero_synergy'
];

export const SEMANTIC_CONTEXT_FEATURE_NAMES = [
  ...SEMANTIC_FEATURE_NAMES,
  ...CONTEXT_EFFECT_IDS.map(id => `context_${id}`),
  ...CONTEXT_TRIGGER_IDS.map(id => `context_trigger_${id}`),
  'context_offense_coverage',
  'context_defense_coverage',
  'context_control_coverage',
  'context_mobility_coverage',
  'context_team_buff_coverage',
  'context_enemy_debuff_coverage',
  'context_conditional_reliance',
  'context_cross_hero_synergy',
  'context_mechanic_diversity',
  'context_verified_skill_coverage'
];

export const FEATURE_NAMES = LEGACY_FEATURE_NAMES;
export const SUPPORTED_FEATURE_SCHEMA_VERSIONS = [
  FEATURE_SCHEMA_VERSION,
  SEMANTIC_FEATURE_SCHEMA_VERSION,
  SEMANTIC_CONTEXT_FEATURE_SCHEMA_VERSION
] as const;

export function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number(v) || 0));
}

export function sigmoid(v: number) {
  const x = clamp(v, -30, 30);
  return 1 / (1 + Math.exp(-x));
}

export function canonicalTeam(ids: string[]) {
  return [...ids].sort().join('|');
}

export function isSupportedFeatureSchema(schema: string) {
  return (SUPPORTED_FEATURE_SCHEMA_VERSIONS as readonly string[]).includes(String(schema || ''));
}

function skillConfidence(skill: any) {
  const status = normalize(skill?.verification_status);
  if (status === 'verified' && skill?.needs_recheck === false) return 1;
  if (status === 'corroborated') return .82;
  return .62;
}

/* ------------------------------ v2 frozen parser ------------------------------ */
function numberMatches(text: string) {
  return [...text.matchAll(/[+-]?\s*(\d+(?:[.,]\d+)?)\s*(%?)/g)]
    .map(m => ({ value: Number(m[1].replace(',', '.')) || 0, percent: m[2] === '%', index: m.index || 0 }));
}

function localMagnitude(text: string, pattern: RegExp) {
  const match = pattern.exec(text);
  if (!match) return 0;
  const nums = numberMatches(text).filter(n => Math.abs(n.index - (match.index || 0)) < 95);
  if (!nums.length) return .35;
  const best = nums.sort((a, b) => Math.abs(a.index - (match.index || 0)) - Math.abs(b.index - (match.index || 0)))[0];
  return best.percent ? clamp(best.value / 100, 0, .9) : clamp(Math.log10(1 + best.value) / 4, 0, .9);
}

function detectEffect(text: string, id: string) {
  const patterns: Record<string, RegExp> = {
    damage: /\bdano\b(?!\s*(?:a|contra)\s*armadura)/,
    health_damage: /dano (?:contra a )?vida|dano a vida/,
    armor_damage: /dano (?:a|contra a?) armadura|quebra de armadura/,
    fire_rate: /cadencia de tiro/,
    reload: /tempo de recarga(?: da arma)?|recarreg/,
    ammo: /munic(?:ao|oes)|carregador|pente/,
    health: /vida maxima|\+\s*\d+%?\s*de vida/,
    armor: /armadura maxima|\+\s*\d+%?\s*de armadura/,
    damage_reduction: /reduz.{0,45}dano recebido|menos dano recebido/,
    movement: /velocidade de movimento/,
    stealth_noise: /ruido de (?:movimento|corrida)|barulho/,
    vision_range: /alcance de visao|\bvisao\b/,
    weapon_range: /alcance de tiro|alcance de mira/,
    aiming: /tempo de mira|dispersao|estabilidade de mira/,
    armor_penetration: /penetracao de armadura/,
    penetration_power: /poder de perfuracao/,
    control_lock: /nao pod(?:e|em) atirar|bloqueia as armas|atord/,
    blind: /cegueir/,
    reveal: /revela inimig|visao termica/,
    wall_shot: /atirar atraves de paredes/,
    shield: /escudo|parede de energia|campo de forca/,
    healing: /restaura.{0,40}(?:vida|armadura)|recupera.{0,40}(?:vida|armadura)|cura/,
    charge_restore: /restaura.{0,35}carga|recupera.{0,35}carga/
  };
  const pattern = patterns[id];
  if (!pattern) return 0;
  const matched = pattern.test(text);
  if (!matched) return 0;
  return Math.max(.25, localMagnitude(text, pattern));
}

function triggerFlags(text: string, type: string) {
  return {
    passive: /passiva/.test(type) || /passivamente/.test(text),
    activate: /ativa/.test(type) || /apos ativar|ao ativar/.test(text),
    on_hit: /ao acertar|quando acerta|apos acertar/.test(text),
    on_kill: /ao eliminar|eliminar um inimigo|apos eliminar/.test(text),
    on_damage_taken: /ao receber dano|quando recebe dano/.test(text),
    conditional_target: /inimig.{0,25}(?:ferid|com pouca vida)|alvo.{0,25}(?:ferid|marcad)/.test(text)
  };
}

function scopeFlags(text: string, type: string) {
  return {
    team: /(?:equipe|aliad)/.test(text) || /talento de equipe/.test(type),
    enemy: /inimig|alvo/.test(text),
    self: !/(?:equipe|aliad)/.test(text) || /passiva|ativa/.test(type)
  };
}

function activeUptime(skill: any, type: string) {
  if (!/ativa/.test(type)) return 0;
  const duration = Number(skill?.duration), cooldown = Number(skill?.cooldown);
  if (Number.isFinite(duration) && duration > 0 && Number.isFinite(cooldown) && cooldown > 0) {
    return clamp(duration / (duration + cooldown), 0, 1);
  }
  if (Number.isFinite(duration) && duration > 0) return clamp(duration / 12, 0, .75);
  return .2;
}

export function skillSemantics(skill: any) {
  const text = normalize(`${skill?.name || ''} ${skill?.description || ''}`);
  const type = normalize(skill?.skill_type || '');
  const confidence = skillConfidence(skill);
  const triggers = triggerFlags(text, type);
  const scope = scopeFlags(text, type);
  const effects: Record<string, number> = {};
  for (const id of EFFECT_IDS) {
    const value = detectEffect(text, id);
    if (value > 0) effects[id] = value * confidence;
  }
  return { confidence, triggers, scope, effects, uptime: activeUptime(skill, type), text, type };
}

function profile(hero: any) {
  const caps = new Map<string, number>(), effects = new Map<string, number>(), triggerTotals = new Map<string, number>();
  let reliability = 0, uptime = 0, skills = 0, teamEffects = 0;
  for (const skill of hero.skills || []) {
    if (skill?.enabled === false) continue;
    skills++;
    const semantic = skillSemantics(skill);
    reliability += semantic.confidence;
    uptime += semantic.uptime * semantic.confidence;
    for (const [id, _label, test] of CAPABILITIES) {
      if ((test as any)({ text: semantic.text, type: semantic.type, skill })) caps.set(id, Math.max(caps.get(id) || 0, semantic.confidence));
    }
    for (const [id, value] of Object.entries(semantic.effects)) effects.set(id, clamp((effects.get(id) || 0) + Number(value), 0, 1));
    for (const id of TRIGGER_IDS) if ((semantic.triggers as any)[id]) triggerTotals.set(id, clamp((triggerTotals.get(id) || 0) + semantic.confidence / 2, 0, 1));
    if (semantic.scope.team) teamEffects += Object.keys(semantic.effects).length * semantic.confidence;
  }
  return { hero, caps, effects, triggers: triggerTotals, reliability: skills ? reliability / skills : 0, uptime: skills ? uptime / skills : 0, skills, teamEffects };
}

function legacyVector(heroes: any[]) {
  const profiles = heroes.map(profile), teamCaps = new Set<string>();
  for (const p of profiles) for (const id of p.caps.keys()) teamCaps.add(id);
  let score = 0;
  for (const id of teamCaps) score += COVERAGE[id] || 0;
  let interactionScore = 0;
  for (const [a, b] of INTERACTIONS) if (teamCaps.has(a) && teamCaps.has(b)) interactionScore += 5;
  interactionScore = Math.min(20, interactionScore);
  const diversityBonus = Math.min(6, Math.max(0, teamCaps.size - 5));
  const redundancy = teamCaps.size < 5 ? (5 - teamCaps.size) * 4 : 0;
  score = clamp(Math.round(score + interactionScore + diversityBonus - redundancy), 0, 100);
  const values = [score / 100];
  for (const id of CAP_IDS) values.push(Math.max(...profiles.map(p => p.caps.get(id) || 0), 0));
  for (const [a, b] of INTERACTIONS) {
    const av = Math.max(...profiles.map(p => p.caps.get(a) || 0), 0);
    const bv = Math.max(...profiles.map(p => p.caps.get(b) || 0), 0);
    values.push(Math.min(av, bv));
  }
  values.push(clamp(teamCaps.size / CAP_IDS.length, 0, 1));
  values.push(clamp(new Set(heroes.map(h => h.class_id).filter(Boolean)).size / 3, 0, 1));
  return { values, profiles };
}

function semanticV2Vector(heroes: any[]) {
  const legacy = legacyVector(heroes);
  const values = [...legacy.values], profiles = legacy.profiles;
  for (const id of EFFECT_IDS) values.push(clamp(profiles.reduce((sum, p) => sum + (p.effects.get(id) || 0), 0) / Math.max(1, profiles.length), 0, 1));
  for (const id of TRIGGER_IDS) values.push(clamp(profiles.reduce((sum, p) => sum + (p.triggers.get(id) || 0), 0) / Math.max(1, profiles.length), 0, 1));
  values.push(clamp(profiles.reduce((sum, p) => sum + p.reliability, 0) / Math.max(1, profiles.length), 0, 1));
  values.push(clamp(profiles.reduce((sum, p) => sum + p.uptime, 0) / Math.max(1, profiles.length), 0, 1));
  const uniqueEffects = new Set<string>();
  for (const p of profiles) for (const [id, value] of p.effects) if (value > 0) uniqueEffects.add(id);
  values.push(clamp(uniqueEffects.size / EFFECT_IDS.length, 0, 1));
  values.push(clamp(profiles.reduce((sum, p) => sum + p.teamEffects, 0) / (Math.max(1, profiles.length) * 8), 0, 1));
  const crossPairs = [
    ['damage', 'control_lock'], ['damage', 'blind'], ['fire_rate', 'damage'],
    ['armor_penetration', 'damage'], ['penetration_power', 'wall_shot'],
    ['shield', 'healing'], ['reveal', 'weapon_range'], ['movement', 'control_lock']
  ];
  let cross = 0;
  for (const [a, b] of crossPairs) {
    const providers = profiles.filter(p => (p.effects.get(a) || 0) > 0);
    const receivers = profiles.filter(p => (p.effects.get(b) || 0) > 0);
    if (providers.length && receivers.length && providers.some(x => receivers.some(y => x !== y))) cross += 1;
  }
  values.push(clamp(cross / crossPairs.length, 0, 1));
  return values;
}

/* ------------------------------ v3 contextual parser ------------------------------ */
function parsePtNumber(raw: string) {
  const value = String(raw || '').trim().replace(/\s+/g, '');
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(value)) return Number(value.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(value.replace(',', '.')) || 0;
}

function numberMatchesV3(text: string) {
  return [...text.matchAll(/[+-]?\s*(\d+(?:[.,]\d+)*)\s*(%?)/g)]
    .map(m => ({ value: parsePtNumber(m[1]), percent: m[2] === '%', index: m.index || 0 }));
}

function localMagnitudeV3(text: string, pattern: RegExp) {
  const match = pattern.exec(text);
  if (!match) return 0;
  const nums = numberMatchesV3(text).filter(n => Math.abs(n.index - (match.index || 0)) < 110);
  if (!nums.length) return .4;
  const best = nums.sort((a, b) => Math.abs(a.index - (match.index || 0)) - Math.abs(b.index - (match.index || 0)))[0];
  return best.percent ? clamp(.3 + best.value / 120, .3, 1) : clamp(.3 + Math.log10(1 + best.value) / 4, .3, 1);
}

const CONTEXT_EFFECT_PATTERNS: Record<string, RegExp> = {
  ability_damage: /(?:granada|lanca-granadas|projetil explosivo|salta.{0,80}causa|ao aterrissar.{0,55}causa|torreta.{0,90}dano)/,
  area_damage: /(?:dano|vida por segundo).{0,95}raio de|raio de.{0,95}(?:dano|vida por segundo)/,
  damage_over_time: /(?:reduz|perdem?|causa).{0,55}vida.{0,35}por segundo|vida.{0,35}por segundo.{0,45}inimig/,
  regeneration: /(?:recupera|restaura).{0,45}(?:vida|armadura).{0,30}por segundo|(?:vida|armadura).{0,30}por segundo/,
  invisibility: /invisivel|invisibilidade/,
  deployable: /torreta|instala uma torreta/,
  shield_break: /remove.{0,55}(?:escudos|paredes de energia)/,
  enemy_weapon_lock: /(?:inimig.{0,80}(?:nao podem atirar|bloqueia as armas)|bloqueia as armas dos inimigos|inimigos que atravessam.{0,70}nao podem atirar|atordoa inimigos)/,
  self_weapon_lock_penalty: /(?:heroi|o heroi).{0,55}(?:nao pode atirar|sem poder atirar)|nao pode atirar.{0,35}(?:ao ativar|enquanto ativa)/,
  enemy_armor_debuff: /reduz.{0,60}armadura.{0,60}(?:inimig|dele)|armadura dos inimigos.{0,55}(?:reduz|-)/,
  max_health_reduction: /reduz.{0,55}vida maxima dos inimigos/,
  enemy_damage_amp: /inimig.{0,100}(?:receb|sofr).{0,45}(?:\+\s*\d+%?\s*(?:de\s*)?dano|dano)/,
  enemy_fire_rate_slow: /reduz.{0,50}cadencia de tiro.{0,80}inimig|cadencia de tiro.{0,55}dos inimigos.{0,35}(?:cai|reduz)/,
  enemy_movement_slow: /reduz.{0,55}velocidade de movimento.{0,80}(?:inimig|dele)|velocidade de movimento dos inimigos.{0,40}(?:cai|reduz)/,
  enemy_vision_suppression: /visao.{0,45}(?:dos )?inimig.{0,45}(?:cai|reduz|99)|inimig.{0,70}visao.{0,35}(?:cai|reduz)/,
  enemy_aim_disruption: /inimig.{0,90}(?:dispersao|tempo de mira)|(?:dispersao|tempo de mira).{0,90}inimig/,
  self_movement_buff: /(?:heroi|durante o efeito|depois recebe|ganha|recebe).{0,80}\+?\s*\d+%?\s*(?:de\s*)?velocidade de movimento|velocidade de movimento aumenta.{0,25}\d/,
  self_movement_penalty: /reduz.{0,65}velocidade de movimento do heroi|velocidade de movimento (?:cai|reduz).{0,35}\d+%/,
  team_movement_buff: /(?:equipe|aliad).{0,100}(?:\+\s*\d+%?\s*(?:de\s*)?velocidade de movimento|velocidade de movimento)|velocidade de movimento dos aliados.{0,60}\+/,
  team_damage_buff: /(?:equipe|aliad).{0,105}\+\s*\d+%?\s*(?:de\s*)?dano|concede \+\s*\d+%?\s*(?:de\s*)?dano.{0,105}(?:equipe|aliad)/,
  team_fire_rate_buff: /(?:equipe|aliad).{0,110}\+\s*\d+%?\s*(?:de\s*)?cadencia de tiro|cadencia de tiro.{0,110}(?:equipe|aliad)/,
  team_reload_buff: /(?:equipe|aliad).{0,110}(?:reduz|-).{0,45}tempo de recarga da arma|tempo de recarga da arma.{0,110}(?:equipe|aliad)/,
  team_healing: /(?:equipe|aliad).{0,110}(?:recupera|restaura).{0,45}vida|(?:recupera|restaura).{0,45}vida.{0,110}(?:equipe|aliad)/,
  team_armor_support: /(?:equipe|aliad).{0,110}(?:recupera|restaura|concede|recebe).{0,45}armadura|armadura.{0,110}(?:equipe|aliad)/,
  pickup_speed: /tempo de coleta (?:de )?(?:itens|municao)|tempo de abertura da caixa/,
  ally_armor_resistance: /resistencia de armadura.{0,75}(?:aliad|equipe)|(?:aliad|equipe).{0,75}resistencia de armadura/,
  armor_repair: /(?:recupera|restaura).{0,40}armadura|armadura por segundo/,
  team_damage_reduction: /reduz.{0,55}dano recebido.{0,85}(?:equipe|aliad)|(?:equipe|aliad).{0,85}reduz.{0,55}dano recebido/,
  team_armor_damage_reduction: /reduz.{0,65}dano a armadura causado pelos inimigos|dano a armadura.{0,70}inimig.{0,40}reduz/,
  team_range_buff: /(?:equipe|aliad).{0,100}(?:alcance de tiro|alcance de mira)|(?:alcance de tiro|alcance de mira).{0,100}(?:equipe|aliad)/,
  charge_economy: /(?:restaura|recupera).{0,45}carga|reposicao.{0,30}\d+ s|ate \d+ cargas|com \d+ carga/
};

function contextTriggerFlags(text: string, skill: any) {
  const duration = Number(skill?.duration), cooldown = Number(skill?.cooldown);
  return {
    timed_window: (Number.isFinite(duration) && duration > 0) || /por (?:ate )?\d+(?:[.,]\d+)? s/.test(text),
    area: /raio de \d+/.test(text),
    periodic: /por segundo/.test(text),
    after_effect: /ao sair|apos \d+(?:[.,]\d+)? s|ao concluir|ao interromper|apos ativar/.test(text),
    interrupted_on_damage: /receber dano encerra/.test(text),
    charge_based: /carga|reposicao/.test(text),
    direct_hit: /acerto direto/.test(text),
    landing: /ao aterrissar/.test(text),
    has_cooldown: Number.isFinite(cooldown) && cooldown > 0
  };
}

function detectContextEffect(text: string, id: string) {
  const pattern = CONTEXT_EFFECT_PATTERNS[id];
  if (!pattern || !pattern.test(text)) return 0;
  return Math.max(.3, localMagnitudeV3(text, pattern));
}

export function skillSemanticsV3(skill: any) {
  const base = skillSemantics(skill);
  const contextEffects: Record<string, number> = {};
  for (const id of CONTEXT_EFFECT_IDS) {
    const value = detectContextEffect(base.text, id);
    if (value > 0) contextEffects[id] = value * base.confidence;
  }
  const contextTriggers = contextTriggerFlags(base.text, skill);
  return { ...base, contextEffects, contextTriggers };
}

function contextProfile(hero: any) {
  const effects = new Map<string, number>();
  const triggers = new Map<string, number>();
  let skills = 0, verifiedSkills = 0, conditionalSignals = 0;
  for (const skill of hero.skills || []) {
    if (skill?.enabled === false) continue;
    skills++;
    const semantic = skillSemanticsV3(skill);
    if (semantic.confidence >= .99) verifiedSkills++;
    for (const [id, value] of Object.entries(semantic.contextEffects)) {
      effects.set(id, clamp((effects.get(id) || 0) + Number(value), 0, 1));
    }
    for (const id of CONTEXT_TRIGGER_IDS) {
      if ((semantic.contextTriggers as any)[id]) triggers.set(id, clamp((triggers.get(id) || 0) + semantic.confidence / 2, 0, 1));
    }
    if (semantic.triggers.on_hit || semantic.triggers.on_kill || semantic.triggers.on_damage_taken || semantic.triggers.conditional_target || semantic.contextTriggers.interrupted_on_damage) {
      conditionalSignals += semantic.confidence;
    }
  }
  return {
    hero, effects, triggers, skills,
    verifiedCoverage: skills ? verifiedSkills / skills : 0,
    conditionalReliance: skills ? clamp(conditionalSignals / skills, 0, 1) : 0
  };
}

const OFFENSE_CONTEXT = new Set([
  'ability_damage', 'area_damage', 'damage_over_time', 'enemy_armor_debuff',
  'max_health_reduction', 'enemy_damage_amp', 'team_damage_buff', 'team_fire_rate_buff'
]);
const DEFENSE_CONTEXT = new Set([
  'regeneration', 'team_healing', 'team_armor_support', 'armor_repair',
  'team_damage_reduction', 'team_armor_damage_reduction', 'ally_armor_resistance'
]);
const CONTROL_CONTEXT = new Set([
  'shield_break', 'enemy_weapon_lock', 'enemy_fire_rate_slow', 'enemy_movement_slow',
  'enemy_vision_suppression', 'enemy_aim_disruption', 'max_health_reduction'
]);
const MOBILITY_CONTEXT = new Set([
  'invisibility', 'self_movement_buff', 'self_movement_penalty', 'team_movement_buff'
]);
const TEAM_BUFF_CONTEXT = new Set([
  'team_movement_buff', 'team_damage_buff', 'team_fire_rate_buff', 'team_reload_buff',
  'team_healing', 'team_armor_support', 'ally_armor_resistance', 'team_damage_reduction',
  'team_armor_damage_reduction', 'team_range_buff'
]);
const ENEMY_DEBUFF_CONTEXT = new Set([
  'enemy_weapon_lock', 'enemy_armor_debuff', 'max_health_reduction', 'enemy_damage_amp',
  'enemy_fire_rate_slow', 'enemy_movement_slow', 'enemy_vision_suppression', 'enemy_aim_disruption'
]);

function setCoverage(profiles: any[], ids: Set<string>) {
  const found = new Set<string>();
  for (const p of profiles) for (const id of ids) if ((p.effects.get(id) || 0) > 0) found.add(id);
  return ids.size ? clamp(found.size / ids.size, 0, 1) : 0;
}

function hasDifferentProviders(profiles: any[], a: string, b: string) {
  const A = profiles.filter(p => (p.effects.get(a) || 0) > 0);
  const B = profiles.filter(p => (p.effects.get(b) || 0) > 0);
  return A.length > 0 && B.length > 0 && A.some(x => B.some(y => x !== y));
}

function contextualVector(heroes: any[]) {
  const values = [...semanticV2Vector(heroes)];
  const profiles = heroes.map(contextProfile);
  for (const id of CONTEXT_EFFECT_IDS) {
    values.push(clamp(profiles.reduce((sum, p) => sum + (p.effects.get(id) || 0), 0) / Math.max(1, profiles.length), 0, 1));
  }
  for (const id of CONTEXT_TRIGGER_IDS) {
    values.push(clamp(profiles.reduce((sum, p) => sum + (p.triggers.get(id) || 0), 0) / Math.max(1, profiles.length), 0, 1));
  }
  values.push(setCoverage(profiles, OFFENSE_CONTEXT));
  values.push(setCoverage(profiles, DEFENSE_CONTEXT));
  values.push(setCoverage(profiles, CONTROL_CONTEXT));
  values.push(setCoverage(profiles, MOBILITY_CONTEXT));
  values.push(setCoverage(profiles, TEAM_BUFF_CONTEXT));
  values.push(setCoverage(profiles, ENEMY_DEBUFF_CONTEXT));
  values.push(clamp(profiles.reduce((sum, p) => sum + p.conditionalReliance, 0) / Math.max(1, profiles.length), 0, 1));

  const synergyPairs = [
    ['enemy_armor_debuff', 'team_damage_buff'],
    ['enemy_damage_amp', 'ability_damage'],
    ['enemy_weapon_lock', 'ability_damage'],
    ['enemy_movement_slow', 'area_damage'],
    ['team_range_buff', 'enemy_vision_suppression'],
    ['team_fire_rate_buff', 'enemy_armor_debuff'],
    ['team_damage_reduction', 'self_movement_buff'],
    ['team_healing', 'self_movement_penalty'],
    ['ally_armor_resistance', 'team_armor_support'],
    ['invisibility', 'team_damage_buff'],
    ['deployable', 'enemy_movement_slow'],
    ['shield_break', 'area_damage']
  ];
  let synergy = 0;
  for (const [a, b] of synergyPairs) if (hasDifferentProviders(profiles, a, b)) synergy++;
  values.push(clamp(synergy / synergyPairs.length, 0, 1));

  const unique = new Set<string>();
  for (const p of profiles) for (const [id, value] of p.effects) if (value > 0) unique.add(id);
  values.push(clamp(unique.size / CONTEXT_EFFECT_IDS.length, 0, 1));
  values.push(clamp(profiles.reduce((sum, p) => sum + p.verifiedCoverage, 0) / Math.max(1, profiles.length), 0, 1));
  return values;
}

export function featureVector(heroes: any[], schemaVersion = FEATURE_SCHEMA_VERSION) {
  if (schemaVersion === LEGACY_FEATURE_SCHEMA_VERSION) return legacyVector(heroes).values;
  if (schemaVersion === SEMANTIC_FEATURE_SCHEMA_VERSION) return semanticV2Vector(heroes);
  if (schemaVersion === SEMANTIC_CONTEXT_FEATURE_SCHEMA_VERSION) return contextualVector(heroes);
  return legacyVector(heroes).values;
}

export function semanticFeatureVector(heroes: any[]) {
  return featureVector(heroes, SEMANTIC_FEATURE_SCHEMA_VERSION);
}

export function semanticContextFeatureVector(heroes: any[]) {
  return featureVector(heroes, SEMANTIC_CONTEXT_FEATURE_SCHEMA_VERSION);
}

export function featureNamesForSchema(schemaVersion: string) {
  if (schemaVersion === SEMANTIC_CONTEXT_FEATURE_SCHEMA_VERSION) return SEMANTIC_CONTEXT_FEATURE_NAMES;
  if (schemaVersion === SEMANTIC_FEATURE_SCHEMA_VERSION) return SEMANTIC_FEATURE_NAMES;
  return LEGACY_FEATURE_NAMES;
}

export function weightedRate(rows: any[]) {
  let wins = 0, matches = 0;
  for (const row of rows) { wins += row.target * row.matches; matches += row.matches; }
  return matches ? clamp(wins / matches, .05, .95) : .5;
}

export function brier(rows: any[], predictor: (x: number[]) => number) {
  let total = 0, weight = 0;
  for (const row of rows) {
    const w = Math.max(1, Math.sqrt(row.matches));
    total += w * Math.pow(clamp(predictor(row.features), .001, .999) - row.target, 2);
    weight += w;
  }
  return weight ? total / weight : null;
}

export function trainLogistic(rows: any[], featureCount: number, epochs = 180) {
  const weights = Array(featureCount + 1).fill(0), lr = .045, l2 = .03;
  for (let epoch = 0; epoch < epochs; epoch++) {
    const grad = Array(weights.length).fill(0);
    let totalWeight = 0;
    for (const row of rows) {
      const x = row.features;
      let z = weights[0];
      for (let i = 0; i < featureCount; i++) z += weights[i + 1] * x[i];
      const pred = sigmoid(z), sampleWeight = Math.max(1, Math.sqrt(row.matches)), err = (pred - row.target) * sampleWeight;
      grad[0] += err;
      for (let i = 0; i < featureCount; i++) grad[i + 1] += err * x[i];
      totalWeight += sampleWeight;
    }
    if (!totalWeight) break;
    weights[0] -= lr * (grad[0] / totalWeight);
    for (let i = 1; i < weights.length; i++) {
      weights[i] = clamp(weights[i] - lr * ((grad[i] / totalWeight) + l2 * weights[i]), -4, 4);
    }
  }
  return weights;
}

export function predict(weights: number[], features: number[]) {
  let z = weights[0] || 0;
  for (let i = 0; i < features.length; i++) z += (weights[i + 1] || 0) * features[i];
  return sigmoid(z);
}

export function featureMeans(rows: any[]) {
  const count = rows[0]?.features?.length || 0, sums = Array(count).fill(0);
  let weight = 0;
  for (const row of rows) {
    const w = Math.max(1, Number(row.matches) || 0);
    for (let i = 0; i < sums.length; i++) sums[i] += Number(row.features?.[i] || 0) * w;
    weight += w;
  }
  return weight ? sums.map(value => value / weight) : sums;
}

export function meanAbsoluteDrift(current: number[], baseline: number[]) {
  if (!Array.isArray(current) || !Array.isArray(baseline) || current.length !== baseline.length || !current.length) return null;
  return current.reduce((sum, value, index) => sum + Math.abs((Number(value) || 0) - (Number(baseline[index]) || 0)), 0) / current.length;
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
