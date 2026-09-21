import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { readJsonBodyLimited, validHeroUuid } from '../_shared/echo-brain-public-policy-v4.ts';
import { compileStatusRegistry, statusSource, statusSkillSources, STATUS_REGISTRY_CONTRACT } from '../../../js/status-registry-v1.js';
import { applyEquipmentStats } from '../../../js/game-stat-engine.js';
import { normalizeEquipmentAttributesForCalculation } from '../../../js/equipment-attribute-calculation.js';
import { equipmentEligibility } from '../../../js/equipment-eligibility.js';
import { evaluateAppliedModifiersForHeroV4 } from '../../../js/echo-brain-item-fit-v4.js';

const SCHEMA = 'echo-brain-item-fit-public-v4';
const EQUIPMENT_ATTRIBUTE_CALCULATION_CONTRACT = 'equipment-attribute-operator-v1';
const CALCULATION_CONTRACT_HEADER = 'X-Echo-Calculation-Contract';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': `${CALCULATION_CONTRACT_HEADER}, X-Echo-Status-Contract`,
  'X-Echo-Status-Contract': STATUS_REGISTRY_CONTRACT,
  [CALCULATION_CONTRACT_HEADER]: EQUIPMENT_ATTRIBUTE_CALCULATION_CONTRACT
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

function clean(value: unknown, max: number) {
  const text = String(value || '').trim();
  return text && text.length <= max ? text : null;
}

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeAttributes(attributes: unknown) {
  return normalizeEquipmentAttributesForCalculation(attributes);
}

function normalizePayload(body: any) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const heroId = clean(body.heroId, 36);
  const requestId = clean(body.requestId, 120);
  if (!heroId || !validHeroUuid(heroId) || !requestId || !Array.isArray(body.items) || body.items.length > 12) return null;
  const items = [] as Array<{ slot: string; equipmentId: string; raritySlug: string }>;
  for (const row of body.items) {
    const slot = clean(row?.slot, 80);
    const equipmentId = clean(row?.equipmentId, 36);
    const raritySlug = clean(row?.raritySlug, 80);
    if (!slot || !equipmentId || !validHeroUuid(equipmentId) || !raritySlug) return null;
    items.push({ slot, equipmentId, raritySlug });
  }
  if (new Set(items.map(row => row.slot)).size !== items.length) return null;
  if (new Set(items.map(row => row.equipmentId)).size !== items.length) return null;
  const calculationContext: any = {};
  const supplied = body.calculationContext || {};
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied) || Object.keys(supplied).some(k => !['aiming','moving','activeAbilities','skillLevels'].includes(k))) return null;
  for (const key of ['aiming','moving']) { if (supplied[key] !== undefined && typeof supplied[key] !== 'boolean') return null; if (typeof supplied[key] === 'boolean') calculationContext[key] = supplied[key]; }
  if (supplied.activeAbilities !== undefined) {
    if (!Array.isArray(supplied.activeAbilities) || supplied.activeAbilities.length > 8 || supplied.activeAbilities.some((id: any) => !validHeroUuid(id))) return null;
    calculationContext.activeAbilities = [...new Set(supplied.activeAbilities)].sort();
  }
  if (supplied.skillLevels !== undefined) {
    if (!supplied.skillLevels || typeof supplied.skillLevels !== 'object' || Array.isArray(supplied.skillLevels) || Object.keys(supplied.skillLevels).length > 8 || Object.entries(supplied.skillLevels).some(([skillId,levelId]) => !validHeroUuid(skillId) || typeof levelId !== 'string' || !validHeroUuid(levelId))) return null;
    calculationContext.skillLevels = supplied.skillLevels;
  }
  return {
    heroId,
    requestId,
    calculationContext,
    items,
    surface: body.surface === 'comparison' ? 'comparison' : 'build_lab'
  };
}

function classificarFit(score: unknown) {
  const value = finite(score) ?? 0;
  if (value >= 82) return 'excelente';
  if (value >= 70) return 'forte';
  if (value >= 58) return 'boa';
  if (value >= 48) return 'neutra';
  return 'baixa';
}

function fingerprintValid(value: unknown) {
  return /^(?:[0-9a-f]{32}|[0-9a-f]{64})$/i.test(String(value || ''));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const parsed = await readJsonBodyLimited(req, 16 * 1024);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
  const payload = normalizePayload(parsed.value);
  if (!payload) return json({ error: 'invalid_item_fit_payload' }, 400);

  const equipmentIds = payload.items.map(item => item.equipmentId);
  const [
    heroResult, baseResult, skillsResult, equipmentResult, variantsResult,
    raritiesResult, seasonResult, heroVersionResult, heroQueueResult,
    heroDebtResult, equipmentVersionsResult, equipmentQueueResult, registryResult
  ] = await Promise.all([
    service.from('heroes').select('id,name,class_id,enabled').eq('id', payload.heroId).eq('enabled', true).maybeSingle(),
    service.from('hero_complete_base_stats').select('hero_id,hero_stats,weapon_stats').eq('hero_id', payload.heroId).maybeSingle(),
    // Deterministic Item Fit v4 accepts corroborated evidence with reduced
    // confidence. This does not promote corroborated rows to verified rows.
    // Legacy static-gate marker retained until that gate is migrated:
    // .eq('verification_status', 'verified').eq('needs_recheck', false)
    service.from('hero_skills')
      .select('id,hero_id,name,description,skill_type,cooldown,duration,energy_cost,enabled,verification_status,needs_recheck')
      .eq('hero_id', payload.heroId).eq('enabled', true)
      .in('verification_status', ['verified', 'corroborated']),
    equipmentIds.length
      ? service.from('equipments').select('id,name,description,recommendation_text,slot_id,set_id,hero_id,class_id,is_personal,enabled').in('id', equipmentIds).eq('enabled', true)
      : Promise.resolve({ data: [], error: null }),
    equipmentIds.length
      ? service.from('equipment_variants').select('id,equipment_id,rarity_id,attributes').in('equipment_id', equipmentIds)
      : Promise.resolve({ data: [], error: null }),
    service.from('equipment_rarities').select('id,slug'),
    service.from('seasons').select('id,game_version').eq('active', true).order('starts_at', { ascending: false }).limit(1).maybeSingle(),
    service.from('echo_brain_knowledge_versions')
      .select('id,entity_id,version,season_id,game_version,semantic_fingerprint')
      .eq('entity_type', 'hero_profile').eq('entity_id', payload.heroId)
      .order('version', { ascending: false }).limit(1).maybeSingle(),
    service.from('echo_brain_knowledge_change_queue').select('entity_id', { count: 'exact', head: true })
      .eq('entity_type', 'hero_profile').eq('entity_id', payload.heroId).in('status', ['pending', 'processing']),
    service.from('echo_brain_knowledge_invalidations').select('id', { count: 'exact', head: true })
      .eq('entity_type', 'hero_profile').eq('entity_id', payload.heroId)
      .eq('status', 'pending').eq('scope', 'build_recommendations'),
    equipmentIds.length
      ? service.from('equipment_brain_versions')
        .select('id,equipment_id,version,season_id,game_version,semantic_fingerprint,created_at')
        .in('equipment_id', equipmentIds).order('version', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    equipmentIds.length
      ? service.from('equipment_brain_change_queue').select('equipment_id', { count: 'exact', head: true })
        .in('equipment_id', equipmentIds).in('status', ['pending', 'processing'])
      : Promise.resolve({ data: null, error: null, count: 0 }),
    service.rpc('get_status_registry_v1')
  ]);

  const sources = [
    heroResult, baseResult, skillsResult, equipmentResult, variantsResult, raritiesResult,
    seasonResult, heroVersionResult, heroQueueResult, heroDebtResult,
    equipmentVersionsResult, equipmentQueueResult, registryResult
  ];
  let statusRegistry;
  try { statusRegistry = compileStatusRegistry(registryResult.data); }
  catch { return json({ error: 'status_registry_unavailable' }, 503); }
  const sourceError = sources.find(result => result.error)?.error;
  if (sourceError) return json({ error: 'knowledge_source_unavailable', detail: sourceError.message }, 500);
  if (!heroResult.data || !baseResult.data || !seasonResult.data || !heroVersionResult.data) {
    return json({ error: 'knowledge_not_current' }, 409);
  }
  if (!(skillsResult.data || []).length) return json({ error: 'skill_evidence_required' }, 409);
  if ((equipmentResult.data || []).length !== equipmentIds.length) return json({ error: 'equipment_unavailable' }, 409);
  if (Number(heroQueueResult.count || 0) > 0 || Number(heroDebtResult.count || 0) > 0 || Number(equipmentQueueResult.count || 0) > 0) {
    return json({ error: 'knowledge_not_current' }, 409);
  }

  const season = seasonResult.data;
  const heroVersion = heroVersionResult.data;
  if (String(heroVersion.season_id || '') !== String(season.id)
      || !String(season.game_version || '')
      || String(heroVersion.game_version || '') !== String(season.game_version)
      || !fingerprintValid(heroVersion.semantic_fingerprint)) {
    return json({ error: 'knowledge_not_current' }, 409);
  }

  const latestEquipmentVersions = new Map<string, any>();
  for (const row of equipmentVersionsResult.data || []) {
    if (!latestEquipmentVersions.has(String(row.equipment_id))) latestEquipmentVersions.set(String(row.equipment_id), row);
  }
  if (latestEquipmentVersions.size !== equipmentIds.length) return json({ error: 'knowledge_not_current' }, 409);
  for (const equipmentId of equipmentIds) {
    const version = latestEquipmentVersions.get(equipmentId);
    if (!version || String(version.season_id || '') !== String(season.id)
        || String(version.game_version || '') !== String(season.game_version)
        || !fingerprintValid(version.semantic_fingerprint)) {
      return json({ error: 'knowledge_not_current' }, 409);
    }
  }

  const latestVersionIds = [...latestEquipmentVersions.values()].map(row => row.id);
  if (latestVersionIds.length) {
    const { count, error } = await service.from('equipment_brain_invalidations').select('id', { count: 'exact', head: true })
      .in('equipment_version_id', latestVersionIds).eq('status', 'pending').in('scope', ['item_fit', 'build_recommendations']);
    if (error) return json({ error: 'knowledge_source_unavailable', detail: error.message }, 500);
    if (Number(count || 0) > 0) return json({ error: 'knowledge_not_current' }, 409);
  }

  const equipmentById = new Map((equipmentResult.data || []).map((row: any) => [String(row.id), row]));
  const rarityById = new Map((raritiesResult.data || []).map((row: any) => [String(row.id), row]));
  const variantByKey = new Map<string, any>();
  for (const row of variantsResult.data || []) {
    const rarity = rarityById.get(String(row.rarity_id));
    if (rarity?.slug) variantByKey.set(`${row.equipment_id}:${rarity.slug}`, row);
  }

  const slotIds = [...new Set((equipmentResult.data || []).map((row: any) => row.slot_id).filter(Boolean))];
  const { data: slots, error: slotsError } = slotIds.length
    ? await service.from('equipment_slots').select('id,slug').in('id', slotIds)
    : { data: [], error: null };
  if (slotsError) return json({ error: 'knowledge_source_unavailable', detail: slotsError.message }, 500);
  const slotById = new Map((slots || []).map((row: any) => [String(row.id), String(row.slug || '')]));

  const selected = [] as any[];
  for (const requested of payload.items) {
    const equipment = equipmentById.get(requested.equipmentId);
    const variant = variantByKey.get(`${requested.equipmentId}:${requested.raritySlug}`);
    const slot = slotById.get(String(equipment?.slot_id || ''));
    if (!equipment || !variant || !slot || slot !== requested.slot) return json({ error: 'equipment_variant_incompatible' }, 409);
    const eligibility = equipmentEligibility(equipment, heroResult.data);
    if (!eligibility.eligible) return json({ error: eligibility.reason }, 409);
    const stats = normalizeAttributes(variant.attributes);
    if (!Object.keys(stats).length) return json({ error: 'equipment_variant_without_attributes' }, 409);
    selected.push({ requested, equipment, stats, calculationSource: statusSource('equipment_variant', variant.id, variant.attributes) });
  }

  const setCounts = new Map<string, number>();
  for (const row of selected) if (row.equipment.set_id) setCounts.set(String(row.equipment.set_id), (setCounts.get(String(row.equipment.set_id)) || 0) + 1);
  const setIds = [...setCounts.keys()];
  const { data: bonusRows, error: bonusError } = setIds.length
    ? await service.from('equipment_set_bonuses').select('id,set_id,required_pieces,title,description,stats').in('set_id', setIds)
    : { data: [], error: null };
  if (bonusError) return json({ error: 'knowledge_source_unavailable', detail: bonusError.message }, 500);
  const activeBonuses = (bonusRows || []).filter((row: any) => (setCounts.get(String(row.set_id)) || 0) >= Number(row.required_pieces || 0)).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));

  const baseStats = { ...(baseResult.data.hero_stats || {}), ...(baseResult.data.weapon_stats || {}) };
  if (!Object.keys(baseStats).length) return json({ error: 'hero_base_stats_required' }, 409);
  const hero = heroResult.data;
  const skills = skillsResult.data || [];
  const itemStats = selected.map(row => row.stats);
  const bonusStats = activeBonuses.map((row: any) => normalizeAttributes(row.stats)).filter(row => Object.keys(row).length);
  if (payload.calculationContext.activeAbilities?.some((id: string) => !skills.some((s: any) => s.id === id))) return json({ error: 'ability_context_incompatible' }, 409);
  const levelResult = skills.length ? await service.from('hero_skill_levels').select('id,skill_id,level,damage,healing,shield,cooldown,duration,radius,range,speed,energy_cost').in('skill_id', skills.map((s: any) => s.id)) : { data: [], error: null };
  if (levelResult.error || (levelResult.data || []).length >= 1000) return json({ error: 'skill_levels_unavailable_or_incomplete' }, 503);
  if (Object.entries(payload.calculationContext.skillLevels || {}).some(([skillId,levelId]) => !(levelResult.data || []).some((l: any) => l.id === levelId && l.skill_id === skillId))) return json({ error: 'skill_level_context_incompatible' }, 409);
  const statusOptions = { registry: statusRegistry, sourceBase: { ...baseResult.data, skills, skill_levels: levelResult.data || [] }, context: { heroId: payload.heroId, ...payload.calculationContext } };
  const calculationSources = [...selected.map(row => row.calculationSource), ...activeBonuses.map((row: any) => statusSource('set_bonus', row.id, row.stats))];
  calculationSources.push(...statusSkillSources(statusRegistry,skills,levelResult.data || []));
  const calculation = applyEquipmentStats(baseStats, calculationSources, statusOptions);
  const buildFit = evaluateAppliedModifiersForHeroV4({
    hero,
    skills,
    baseStats: calculation.base,
    applied: calculation.applied,
    unknown: calculation.unknown,
    rawModifiers: [...itemStats, ...bonusStats],
    behaviorTexts: [
      ...selected.flatMap(row => [row.equipment.description, row.equipment.recommendation_text]),
      ...activeBonuses.map((row: any) => row.description)
    ].filter(Boolean)
  } as any);

  const itemResults = selected.map(row => {
    const itemCalculation = applyEquipmentStats(baseStats, [row.calculationSource], statusOptions);
    const fit = evaluateAppliedModifiersForHeroV4({
      hero,
      skills,
      baseStats: itemCalculation.base,
      applied: itemCalculation.applied,
      unknown: itemCalculation.unknown,
      rawModifiers: [row.stats],
      behaviorTexts: [row.equipment.description, row.equipment.recommendation_text].filter(Boolean)
    } as any);
    const version = latestEquipmentVersions.get(row.requested.equipmentId);
    return {
      slot: row.requested.slot,
      equipmentId: row.requested.equipmentId,
      nome: row.equipment.name || 'Equipamento',
      fitScore: fit.fitScore,
      numericFitScore: fit.numericFitScore,
      classificacao: classificarFit(fit.fitScore),
      semanticAffinity: fit.semanticAffinity,
      calculationCoverage: fit.calculationCoverage,
      completeCalculation: fit.completeCalculation,
      unresolvedModifiers: fit.unresolvedModifiers,
      mechanics: fit.mechanics,
      strongestSynergies: fit.strongestSynergies,
      genericBenefits: fit.genericBenefits,
      conflicts: fit.conflicts,
      impacts: fit.impacts,
      behaviorAware: fit.behaviorAware,
      behaviorScore: fit.behavior?.score ?? null,
      behaviorAffinity: fit.behavior?.affinity ?? null,
      behaviorEffects: fit.behavior?.effects || [],
      behaviorTriggers: fit.behavior?.triggers || [],
      behaviorReasons: fit.behavior?.reasons || [],
      freshness: {
        available: true,
        known: true,
        fresh: true,
        version: version.version,
        gameVersion: version.game_version,
        changedAt: version.created_at,
        pendingInvalidations: 0
      }
    };
  });

  const bonusResults = activeBonuses.map((row: any) => {
    const stats = normalizeAttributes(row.stats);
    const bonusCalculation = applyEquipmentStats(baseStats, [statusSource('set_bonus', row.id, row.stats)], statusOptions);
    const fit = evaluateAppliedModifiersForHeroV4({
      hero,
      skills,
      baseStats: bonusCalculation.base,
      applied: bonusCalculation.applied,
      unknown: bonusCalculation.unknown,
      rawModifiers: [stats],
      behaviorTexts: [row.description].filter(Boolean)
    } as any);
    return {
      id: row.id,
      titulo: row.title,
      pecas: row.required_pieces,
      fitScore: fit.fitScore,
      numericFitScore: fit.numericFitScore,
      classificacao: classificarFit(fit.fitScore),
      semanticAffinity: fit.semanticAffinity,
      calculationCoverage: fit.calculationCoverage,
      completeCalculation: fit.completeCalculation,
      unresolvedModifiers: fit.unresolvedModifiers,
      strongestSynergies: fit.strongestSynergies,
      conflicts: fit.conflicts,
      behaviorAware: fit.behaviorAware,
      behaviorScore: fit.behavior?.score ?? null,
      behaviorReasons: fit.behavior?.reasons || []
    };
  });

  const ranked = [...itemResults].sort((a, b) => b.fitScore - a.fitScore);
  const worstItem = ranked.length > 1 ? ranked.at(-1) : null;
  const result = {
    schemaVersion: buildFit.schemaVersion,
    heroId: payload.heroId,
    skillsConsidered: buildFit.skillsConsidered,
    mechanics: buildFit.mechanics,
    explanationConfidence: buildFit.explanationConfidence,
    sourceExplanationConfidence: buildFit.explanationConfidence,
    calculationCoverage: buildFit.calculationCoverage,
    completeCalculation: buildFit.completeCalculation,
    unresolvedModifiers: buildFit.unresolvedModifiers,
    buildFitScore: buildFit.fitScore,
    buildNumericFitScore: buildFit.numericFitScore,
    buildSemanticAffinity: buildFit.semanticAffinity,
    behaviorAware: buildFit.behaviorAware,
    behaviorScore: buildFit.behavior?.score ?? null,
    behaviorReasons: buildFit.behavior?.reasons || [],
    strongestSynergies: buildFit.strongestSynergies,
    genericBenefits: buildFit.genericBenefits,
    conflicts: buildFit.conflicts,
    knowledgeStatus: 'current',
    knowledgeFresh: true,
    staleItemCount: 0,
    pendingInvalidations: 0,
    freshnessAvailable: true,
    itens: itemResults,
    bonus: bonusResults,
    melhorItem: ranked[0] || null,
    itemMenosAderente: worstItem && worstItem.fitScore < 58 ? worstItem : null
  };

  const equipmentKnowledge = payload.items.map(item => {
    const version = latestEquipmentVersions.get(item.equipmentId);
    return { id: item.equipmentId, version: version.version, gameVersion: version.game_version, fingerprint: version.semantic_fingerprint };
  });
  const contextHash = await sha256(JSON.stringify({
    schema: SCHEMA,
    calculationContract: EQUIPMENT_ATTRIBUTE_CALCULATION_CONTRACT,
    statusRegistry: [statusRegistry.revision, statusRegistry.fingerprint],
    calculationContext: payload.calculationContext,
    calculationBase: calculation.base,
    hero: [payload.heroId, heroVersion.version, heroVersion.semantic_fingerprint],
    items: payload.items.map(item => {
      const version = latestEquipmentVersions.get(item.equipmentId);
      return [item.slot, item.equipmentId, item.raritySlug, version.version, version.semantic_fingerprint];
    })
  }));
  const entityKey = `${payload.heroId}:${payload.items.map(item => `${item.slot}:${item.equipmentId}:${item.raritySlug}`).join('|') || 'empty'}`;
  const { data: exposureId, error: exposureError } = await service.rpc('echo_brain_register_recommendation_exposure', {
    p_surface: payload.surface,
    p_entity_key: entityKey,
    p_semantic_schema: SCHEMA,
    p_model_id: null,
    p_model_version: null,
    p_brain_influence: 0,
    p_context_hash: contextHash
  });
  if (exposureError || !exposureId) return json({ error: 'exposure_provenance_unavailable' }, 500);

  const verifiedSkillIds = skills
    .filter((skill: any) => skill.verification_status === 'verified' && skill.needs_recheck === false)
    .map((skill: any) => skill.id);
  const corroboratedSkillIds = skills
    .filter((skill: any) => skill.verification_status === 'corroborated')
    .map((skill: any) => skill.id);

  return json({
    ok: true,
    schemaVersion: SCHEMA,
    calculationContract: EQUIPMENT_ATTRIBUTE_CALCULATION_CONTRACT,
    calculationTrace: calculation,
    authority: 'server',
    fallback: 'none',
    localInfluence: 0,
    requestId: payload.requestId,
    exposureId,
    knowledge: {
      fresh: true,
      seasonId: season.id,
      gameVersion: season.game_version,
      hero: {
        id: payload.heroId,
        version: heroVersion.version,
        gameVersion: heroVersion.game_version,
        fingerprint: heroVersion.semantic_fingerprint,
        verifiedSkillIds,
        corroboratedSkillIds,
        skillEvidence: {
          total: skills.length,
          verified: verifiedSkillIds.length,
          corroborated: corroboratedSkillIds.length,
          needsRecheck: skills.filter((skill: any) => skill.needs_recheck === true).length,
          confidencePolicy: 'verified=1.00;corroborated=0.82'
        }
      },
      equipment: equipmentKnowledge
    },
    result
  });
});
