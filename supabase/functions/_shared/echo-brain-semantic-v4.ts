import {
  SEMANTIC_CONTEXT_FEATURE_NAMES,
  SUPPORTED_FEATURE_SCHEMA_VERSIONS,
  clamp,
  featureNamesForSchema,
  featureVector,
  normalize,
  semanticContextFeatureVector,
  skillSemanticsV3
} from './echo-brain-semantic.ts';

/*
 * Semantic Context v4 is intentionally additive.
 * v1/v2/v3 remain immutable and reproducible. v4 appends role-aware correction
 * signals found while replaying the complete verified pt-BR skill corpus.
 */
export const SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION = 'composition-semantic-context-v4';

export const V4_CORRECTION_IDS = [
  'self_weapon_disable',
  'self_movement_penalty',
  'enemy_weapon_disable',
  'enemy_movement_slow',
  'self_recovery_channel',
  'post_stealth_damage_window',
  'direct_hit_shield_break',
  'active_penalty_burden',
  'delayed_recovery',
  'forced_stationary_window'
] as const;

export const V4_CORRECTION_FEATURE_NAMES = [
  ...V4_CORRECTION_IDS.map(id => `correction_${id}`),
  'correction_penalty_coverage',
  'correction_enemy_control_coverage',
  'correction_recovery_window_coverage',
  'correction_verified_skill_coverage'
];

export const SEMANTIC_CONTEXT_V4_FEATURE_NAMES = [
  ...SEMANTIC_CONTEXT_FEATURE_NAMES,
  ...V4_CORRECTION_FEATURE_NAMES
];

export const SUPPORTED_FEATURE_SCHEMA_VERSIONS_V4 = [
  ...SUPPORTED_FEATURE_SCHEMA_VERSIONS,
  SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION
] as const;

function confidence(skill: any) {
  const status = normalize(skill?.verification_status);
  if (status === 'verified' && skill?.needs_recheck === false) return 1;
  if (status === 'corroborated') return .82;
  return .62;
}

function active(type: string) {
  return /ativa/.test(type);
}

export function semanticCorrectionsV4(skill: any) {
  const text = normalize(`${skill?.name || ''} ${skill?.description || ''}`);
  const type = normalize(skill?.skill_type || '');
  const c = confidence(skill);
  const isActive = active(type);

  const explicitSelfWeaponDisable = /(?:o heroi|heroi).{0,70}(?:nao pode atirar|fica sem poder atirar)|(?:fica|fica\s+)?sem poder atirar|impede disparos|nao pode atirar.{0,40}(?:ao ativar|durante esse periodo)/.test(text);
  /* Delimit punctuation so an earlier "inimigo" cannot steal a later self penalty.
     Ex.: Slayer mentions a kill; only after the semicolon says the hero cannot shoot. */
  const explicitEnemyWeaponDisable = /bloqueia as armas dos inimig|inimig[^.;]{0,85}nao pod(?:e|em) atirar|atordoa inimigos/.test(text);

  const movementReduction = /reduz.{0,60}velocidade de movimento|velocidade de movimento.{0,35}(?:cai|reduzid)/.test(text);
  const explicitEnemyMovement = /(?:inimig|dele).{0,100}velocidade de movimento|velocidade de movimento dos inimig|inimig.{0,100}velocidade de movimento.{0,35}reduzid/.test(text);
  const explicitSelfMovement = /velocidade de movimento do heroi|velocidade de movimento cai|reduz a velocidade de movimento em \d+(?:[.,]\d+)?%/.test(text);

  const selfWeaponDisable = isActive && explicitSelfWeaponDisable && !explicitEnemyWeaponDisable;
  const selfMovementPenalty = isActive && movementReduction && explicitSelfMovement && !explicitEnemyMovement;
  const enemyWeaponDisable = explicitEnemyWeaponDisable;
  const enemyMovementSlow = movementReduction && (explicitEnemyMovement || /inimig.{0,90}reduz/.test(text));

  const recovery = /(?:restaura|recupera).{0,55}(?:vida|armadura)|(?:vida|armadura).{0,35}por segundo/.test(text);
  const delayedRecovery = /apos \d+(?:[.,]\d+)? s.{0,80}(?:restaura|recupera)|depois recebe/.test(text) && recovery;
  const recoveryChannel = isActive && recovery && (selfWeaponDisable || selfMovementPenalty);

  const invisibility = /invisivel|invisibilidade/.test(text);
  const postStealthDamage = invisibility && /ao sair da invisibilidade.{0,90}dano aumenta|ao sair.{0,90}\+?\d+%?\s*(?:de\s*)?dano/.test(text);
  const directHitShieldBreak = /acerto direto.{0,75}remove.{0,50}(?:escudos|paredes de energia)/.test(text);
  const forcedStationary = isActive && /o heroi para e dispara|heroi para e dispara/.test(text);

  const activePenaltyBurden = isActive && (selfWeaponDisable || selfMovementPenalty || forcedStationary);

  const flags: Record<string, boolean> = {
    self_weapon_disable: selfWeaponDisable,
    self_movement_penalty: selfMovementPenalty,
    enemy_weapon_disable: enemyWeaponDisable,
    enemy_movement_slow: enemyMovementSlow,
    self_recovery_channel: recoveryChannel,
    post_stealth_damage_window: postStealthDamage,
    direct_hit_shield_break: directHitShieldBreak,
    active_penalty_burden: activePenaltyBurden,
    delayed_recovery: delayedRecovery,
    forced_stationary_window: forcedStationary
  };

  const effects: Record<string, number> = {};
  for (const id of V4_CORRECTION_IDS) if (flags[id]) effects[id] = c;

  return {
    confidence: c,
    verified: c >= .99,
    effects,
    text,
    type
  };
}

function correctionVector(heroes: any[]) {
  const profiles = (heroes || []).map(hero => {
    const effects = new Map<string, number>();
    let skills = 0, verified = 0;
    for (const skill of hero?.skills || []) {
      if (skill?.enabled === false) continue;
      skills++;
      const semantic = semanticCorrectionsV4(skill);
      if (semantic.verified) verified++;
      for (const [id, value] of Object.entries(semantic.effects)) {
        effects.set(id, clamp((effects.get(id) || 0) + Number(value), 0, 1));
      }
    }
    return { effects, skills, verifiedCoverage: skills ? verified / skills : 0 };
  });

  const divisor = Math.max(1, profiles.length);
  const values: number[] = [];
  for (const id of V4_CORRECTION_IDS) {
    values.push(clamp(profiles.reduce((sum, p) => sum + (p.effects.get(id) || 0), 0) / divisor, 0, 1));
  }

  const coverage = (ids: readonly string[]) => {
    const found = new Set<string>();
    for (const profile of profiles) {
      for (const id of ids) if ((profile.effects.get(id) || 0) > 0) found.add(id);
    }
    return ids.length ? clamp(found.size / ids.length, 0, 1) : 0;
  };

  values.push(coverage(['self_weapon_disable', 'self_movement_penalty', 'active_penalty_burden', 'forced_stationary_window']));
  values.push(coverage(['enemy_weapon_disable', 'enemy_movement_slow', 'direct_hit_shield_break']));
  values.push(coverage(['self_recovery_channel', 'delayed_recovery', 'post_stealth_damage_window']));
  values.push(clamp(profiles.reduce((sum, p) => sum + p.verifiedCoverage, 0) / divisor, 0, 1));
  return values;
}

export function semanticContextV4FeatureVector(heroes: any[]) {
  return [...semanticContextFeatureVector(heroes), ...correctionVector(heroes)];
}

function namedVector(values: number[]) {
  return Object.fromEntries(SEMANTIC_CONTEXT_V4_FEATURE_NAMES.map((name, index) => [name, Number(values[index]) || 0]));
}

function pushUnique(target: string[], message: string) {
  if (message && !target.includes(message)) target.push(message);
}

/*
 * v2/v3 frozen vectors intentionally keep their historical broad parsers. A
 * self-disable can therefore look like generic control_lock in v2, and v3 also
 * counted team_healing + self_movement_penalty as a positive interaction. In
 * v4 those are scope-aware risk/mitigation signals, so they must not inflate
 * the positive cross-hero component. We subtract only the exact frozen-pair
 * contribution that is proven to come from different heroes.
 */
function crossHeroScopeCorrectionV4(heroes: any[]) {
  const profiles = (heroes || []).map(hero => {
    let selfWeaponDisable = false;
    let selfMovementPenalty = false;
    let teamHealing = false;
    let damage = false;
    let movement = false;

    for (const skill of hero?.skills || []) {
      if (skill?.enabled === false) continue;
      const correction = semanticCorrectionsV4(skill);
      const semantic = skillSemanticsV3(skill);
      selfWeaponDisable ||= Number(correction.effects.self_weapon_disable || 0) > 0;
      selfMovementPenalty ||= Number(correction.effects.self_movement_penalty || 0) > 0;
      teamHealing ||= Number(semantic.contextEffects?.team_healing || 0) > 0;
      damage ||= Number(semantic.effects?.damage || 0) > 0;
      movement ||= Number(semantic.effects?.movement || 0) > 0;
    }

    return { selfWeaponDisable, selfMovementPenalty, teamHealing, damage, movement };
  });

  const hasDifferentProviders = (a: keyof typeof profiles[number], b: keyof typeof profiles[number]) =>
    profiles.some((first, firstIndex) => Boolean(first[a]) && profiles.some((second, secondIndex) => firstIndex !== secondIndex && Boolean(second[b])));

  let legacyFalsePairs = 0;
  // Frozen v2 crossPairs: damage + control_lock, movement + control_lock.
  if (hasDifferentProviders('selfWeaponDisable', 'damage')) legacyFalsePairs++;
  if (hasDifferentProviders('selfWeaponDisable', 'movement')) legacyFalsePairs++;

  let contextMitigationOnlyPairs = 0;
  // Frozen v3 synergyPairs includes team_healing + self_movement_penalty. In v4
  // this is compensation for vulnerability, not a positive offensive synergy.
  if (hasDifferentProviders('teamHealing', 'selfMovementPenalty')) contextMitigationOnlyPairs++;

  return {
    legacy: legacyFalsePairs / 8,
    context: contextMitigationOnlyPairs / 12
  };
}

/*
 * Deterministic cold-start assessment. This is NOT a learned win probability.
 * It keeps the established functional score as the anchor and applies only a
 * bounded, explainable semantic correction from v4 mechanics. Historical model
 * influence is blended separately by the public scoring function.
 */
export function semanticCompositionAssessmentV4(heroes: any[]) {
  const team = (heroes || []).filter(Boolean).slice(0, 3);
  if (team.length !== 3 || new Set(team.map(hero => hero?.id).filter(Boolean)).size !== 3) {
    return {
      schemaVersion: SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION,
      complete: false,
      score: null,
      confidence: 0,
      strengths: [],
      risks: [],
      components: {}
    };
  }

  const values = semanticContextV4FeatureVector(team);
  const f = namedVector(values);
  const functionalScore = clamp(f.functional_score, 0, 1) * 100;
  const scopeCorrection = crossHeroScopeCorrectionV4(team);
  const contextCrossHero = clamp(f.context_cross_hero_synergy - scopeCorrection.context, 0, 1);
  const legacyCrossHero = clamp(f.cross_hero_synergy - scopeCorrection.legacy, 0, 1);
  const crossHero = Math.max(contextCrossHero, legacyCrossHero);
  const teamBuff = f.context_team_buff_coverage;
  const enemyDebuff = f.context_enemy_debuff_coverage;
  const offense = f.context_offense_coverage;
  const defense = f.context_defense_coverage;
  const control = f.context_control_coverage;
  const mobility = f.context_mobility_coverage;
  const diversity = f.context_mechanic_diversity;
  const classDiversity = f.class_diversity;
  const penaltyBurden = f.correction_active_penalty_burden;
  const defensiveCompensation = Math.max(
    defense,
    f.effect_shield,
    f.effect_healing,
    f.context_team_damage_reduction,
    f.context_team_healing,
    f.context_team_armor_support
  );
  const uncompensatedPenalty = penaltyBurden * (1 - defensiveCompensation);

  /* Every term is capped. The semantic layer can refine the functional score,
     but never create a great composition from a structurally poor trio alone. */
  const positiveAdjustment =
    5.0 * crossHero +
    2.5 * teamBuff +
    2.5 * enemyDebuff +
    1.8 * control +
    1.5 * defense +
    1.0 * mobility +
    1.5 * diversity +
    0.7 * classDiversity;
  const redundancyPenalty = Math.max(0, .18 - diversity) * 10;
  const vulnerabilityPenalty = uncompensatedPenalty * 5;
  const semanticAdjustment = clamp(positiveAdjustment - redundancyPenalty - vulnerabilityPenalty, -8, 14);
  const score = Math.round(clamp(functionalScore + semanticAdjustment, 0, 100));

  const verifiedCoverage = Math.max(f.context_verified_skill_coverage, f.correction_verified_skill_coverage);
  const reliability = f.skill_reliability;
  const semanticDensity = f.semantic_density;
  const confidenceScore = clamp(reliability * .50 + verifiedCoverage * .35 + semanticDensity * .15, 0, 1);

  const strengths: string[] = [];
  const risks: string[] = [];
  if (crossHero >= .20) pushUnique(strengths, 'As habilidades criam interações complementares entre heróis diferentes.');
  if (teamBuff >= .18) pushUnique(strengths, 'A composição distribui buffs relevantes para aliados.');
  if (enemyDebuff >= .18) pushUnique(strengths, 'A composição cria debuffs relevantes sobre inimigos.');
  if (control >= .18) pushUnique(strengths, 'Há controle suficiente para criar janelas de dano ou reposicionamento.');
  if (defense >= .16) pushUnique(strengths, 'Há cobertura defensiva ou sustentação para prolongar as trocas.');
  if (offense >= .20) pushUnique(strengths, 'Há pressão ofensiva distribuída entre múltiplas mecânicas.');
  if (uncompensatedPenalty >= .16) pushUnique(risks, 'Existem janelas de vulnerabilidade próprias sem compensação defensiva forte no trio.');
  if (diversity < .12) pushUnique(risks, 'O trio depende de poucas mecânicas diferentes e pode sofrer com redundância.');
  if (offense >= .22 && defense < .08) pushUnique(risks, 'A composição concentra pressão ofensiva com pouca cobertura defensiva.');
  if (verifiedCoverage < .75) pushUnique(risks, 'Parte das habilidades ainda não possui cobertura verificada suficiente para confiança máxima.');

  return {
    schemaVersion: SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION,
    complete: true,
    score,
    confidence: Number(confidenceScore.toFixed(3)),
    strengths: strengths.slice(0, 4),
    risks: risks.slice(0, 4),
    components: {
      functionalScore: Number(functionalScore.toFixed(2)),
      semanticAdjustment: Number(semanticAdjustment.toFixed(2)),
      crossHeroSynergy: Number(crossHero.toFixed(3)),
      teamBuffCoverage: Number(teamBuff.toFixed(3)),
      enemyDebuffCoverage: Number(enemyDebuff.toFixed(3)),
      offenseCoverage: Number(offense.toFixed(3)),
      defenseCoverage: Number(defense.toFixed(3)),
      controlCoverage: Number(control.toFixed(3)),
      mobilityCoverage: Number(mobility.toFixed(3)),
      mechanicDiversity: Number(diversity.toFixed(3)),
      uncompensatedPenalty: Number(uncompensatedPenalty.toFixed(3)),
      verifiedSkillCoverage: Number(verifiedCoverage.toFixed(3))
    }
  };
}

export function isSupportedFeatureSchemaV4(schema: string) {
  return (SUPPORTED_FEATURE_SCHEMA_VERSIONS_V4 as readonly string[]).includes(String(schema || ''));
}

export function featureNamesForSchemaV4(schema: string) {
  if (schema === SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION) return SEMANTIC_CONTEXT_V4_FEATURE_NAMES;
  return featureNamesForSchema(schema);
}

export function featureVectorV4(heroes: any[], schema: string) {
  if (schema === SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION) return semanticContextV4FeatureVector(heroes);
  return featureVector(heroes, schema);
}
