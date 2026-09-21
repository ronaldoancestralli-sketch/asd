import { loadStatusRegistry, readStatusRows, statusOptionsForContext, itemCalculationSource } from './status-registry-client.js?sc=20260906-1&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1';
import { statusSource, statusSkillSources, compareStatusCalculations } from './status-registry-v1.js?sc=20260906-1&eq=20260907-effects-1';
import { validateEquipmentLoadout } from './equipment-eligibility.js?v=1';
import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { esc, mStyle, mInner, corDoItem, normalizar } from './ui-core.js';
import {
  applyEquipmentStats,
  buildRealStatLines,
  calculateShotDistribution
} from './game-stat-engine.js?v=15&sc=20260906-1&eq=20260907-effects-1';
import { evaluateAppliedModifiersForHeroV4 } from './echo-brain-item-fit-v4.js?v=4&sc=20260906-1';
import {
  getEquipmentFreshness,
  equipmentFreshnessState
} from './echo-brain-equipment-freshness.js?v=1&sb=20260823-security-supabase-pin-1';
import { scorePublicItemFitV4 } from './echo-brain-item-fit-client-v4.js?v=20260824-item-fit-authority-1&sb=20260823-security-supabase-pin-1&sc=20260906-1';

/* ============================================================
   ANÁLISE DA BUILD
   analisarBuild(contexto) -> só calcula, nunca toca no DOM.
   renderAnalise(resultado) -> só desenha, nunca calcula.
   ============================================================ */

export const MACROS = [
  { key: 'fogo',          nome: 'Poder de fogo',  curto: 'FOGO',     icone: '🚀', cor: '#FF5470', teto: 10000 },
  { key: 'sobrevivencia', nome: 'Sobrevivência',  curto: 'SOBREV.',  icone: '🛡', cor: '#4ADE80', teto: 10000 },
  { key: 'mobilidade',    nome: 'Mobilidade',     curto: 'MOBIL.',   icone: '⚡', cor: '#FBBF24', teto: 10000 },
  { key: 'precisao',      nome: 'Precisão',       curto: 'PRECIS.',  icone: '◎', cor: '#5B8DEF', teto: 10000 },
  { key: 'controle',      nome: 'Controle',       curto: 'CONTROLE', icone: '✧', cor: '#A855F7', teto: 10000 }
];

export const STAT_MAP = {
  weapon_damage:            [['fogo', 1]],
  fire_rate:                [['fogo', 1500]],
  fire_interval:            [['fogo', 300, 'inv']],
  magazine_size:            [['fogo', 120]],
  reload_time:              [['fogo', 400, 'inv']],
  weapon_armor_penetration: [['fogo', 12]],
  armor_penetration_power:  [['fogo', 25]],
  weapon_range:             [['controle', 1.5]],
  weapon_spread:            [['precisao', 400, 'inv']],
  spread_factor:            [['precisao', 400, 'inv']],
  moving_spread_modifier:   [['precisao', 300, 'inv']],
  aim_time:                 [['precisao', 300, 'inv']],
  health:                   [['sobrevivencia', 1]],
  armor:                    [['sobrevivencia', 90]],
  movement_speed:           [['mobilidade', 20]],
  vision_range:             [['controle', 1]],
  'dispersao de tiro da arma sem mirar': [['precisao', -30]],
  'dispersao de tiro da arma':           [['precisao', -30]],
  'velocidade para pegar melhorias':     [['mobilidade', -18]],
  weapon_damage_to_armor_pct:   [['fogo', 1, 'pct']],
  weapon_damage_to_health_pct:  [['fogo', 1, 'pct']],
  special_ability_cooldown_pct: [['precisao', -1, 'pct']],
  crate_opening_cooldown_pct:   [['mobilidade', -1, 'pct']],
  weapon_range_franco:          [['fogo', 60], ['controle', 90]]
};

export const STAT_IGNORADAS = new Set(['power']);

export const NIVEL_MULT = {
  comum: 1.00, raro: 1.10, epico: 1.22, lendario: 1.35, mitico: 1.48,
  supremo: 1.60, grandioso: 1.72, celestial: 1.84, estelar: 1.94,
  imortal: 2.05, divino: 2.20
};

export const LIMIAR_FORTE = 1.20;
export const LIMIAR_FRACO = 0.70;

export const BASE_FALLBACK = {
  fogo: 4200, sobrevivencia: 4500, mobilidade: 3900, suporte: 3400, controle: 4000
};

export const FOLGA_TETO = 1.6;

const criarResultadoVazio = (status = 'idle', mensagem = '') => ({
  status,
  mensagem,
  base: null,
  total: null,
  linhas: [],
  fortes: [],
  fracos: [],
  bonusAtivos: [],
  sinergia: [],
  estilo: null,
  dificuldade: null,
  estado: null,
  classe: null,
  equipadosN: 0,
  totalSlots: 0,
  estatisticasDesconhecidas: [],
  echoBrain: null
});

function calcularTetos(baseHerois) {
  const tetos = {};
  const ignorar = new Set();
  for (const stats of baseHerois.values()) {
    const pontos = Object.fromEntries(MACROS.map(m => [m.key, 0]));
    acumular(pontos, stats, ignorar);
    for (const m of MACROS) tetos[m.key] = Math.max(tetos[m.key] || 0, pontos[m.key] || 0);
  }
  for (const m of MACROS) tetos[m.key] = Math.round((tetos[m.key] || 0) * FOLGA_TETO) || m.teto;
  return tetos;
}

export async function carregarDadosAnalise() {
  const dados = {
    baseHerois: new Map(),
    statusBaseByHero: new Map(),
    statusRegistry: null,
    statusRegistryError: null,
    textos: new Map(),
    statsBonus: new Map(),
    skillsHerois: new Map(),
    tetos: {}
  };

  try { dados.statusRegistry = await loadStatusRegistry(); }
  catch (error) { dados.statusRegistryError = error.message; }

  try {
    const { data, error } = await supabase.from('hero_complete_base_stats')
      .select('hero_id,hero_stats,weapon_stats');
    if (error) throw error;
    for (const linha of (data || [])) {
      if (!linha.hero_id) continue;
      dados.statusBaseByHero.set(linha.hero_id, { ...linha, skills: [], skill_levels: [] });
      dados.baseHerois.set(linha.hero_id, {
        ...(linha.hero_stats || {}),
        ...(linha.weapon_stats || {})
      });
    }
  } catch (err) {
    console.warn('[build-analise] view hero_complete_base_stats indisponível, lendo tabelas:', err?.message || err);
    for (const tabela of ['hero_base_stats', 'hero_weapon_stats']) {
      try {
        const { data, error } = await supabase.from(tabela).select('hero_id,stat_key,value');
        if (error) throw error;
        for (const linha of (data || [])) {
          if (!linha.hero_id || !linha.stat_key) continue;
          if (!dados.baseHerois.has(linha.hero_id)) dados.baseHerois.set(linha.hero_id, {});
          if (!dados.statusBaseByHero.has(linha.hero_id)) dados.statusBaseByHero.set(linha.hero_id, { hero_stats: {}, weapon_stats: {}, skills: [], skill_levels: [] });
          dados.statusBaseByHero.get(linha.hero_id)[tabela === 'hero_base_stats' ? 'hero_stats' : 'weapon_stats'][linha.stat_key] = linha.value;
          dados.baseHerois.get(linha.hero_id)[linha.stat_key] = linha.value;
        }
      } catch (e) {
        console.warn(`[build-analise] ${tabela} indisponível:`, e?.message || e);
      }
    }
  }

  try {
    const { data, error } = await supabase.from('hero_skills').select(
      'id,hero_id,name,description,skill_type,cooldown,duration,energy_cost,enabled,verification_status,needs_recheck'
    );
    if (error) throw error;
    for (const skill of (data || [])) {
      if (!skill.hero_id) continue;
      if (!dados.skillsHerois.has(skill.hero_id)) dados.skillsHerois.set(skill.hero_id, []);
      dados.skillsHerois.get(skill.hero_id).push(skill);
      if (skill.enabled && ['verified','corroborated'].includes(skill.verification_status)) dados.statusBaseByHero.get(skill.hero_id)?.skills.push(skill);
    }
  } catch (err) {
    console.warn('[build-analise] habilidades indisponíveis para o Echo Brain:', err?.message || err);
  }

  try {
    const levels = await readStatusRows('hero_skill_levels', 'id,skill_id,level,damage,healing,shield,cooldown,duration,radius,range,speed,energy_cost');
    for (const base of dados.statusBaseByHero.values()) base.skill_levels = (levels || []).filter(l => base.skills.some(s => s.id === l.skill_id));
  } catch (error) {
    if (dados.statusRegistry?.payload?.definitions?.some(d => d.scope === 'skill_level') || dados.statusRegistry?.payload?.bindings?.some(b => b.source_kind === 'hero_skill_level')) dados.statusRegistryError = 'Não foi possível ler os níveis de habilidade para este registro.';
  }

  dados.tetos = {};

  try {
    const { data, error } = await supabase.from('heroes')
      .select('id,playstyle,difficulty,strength_note,weakness_note');
    if (error) throw error;
    for (const h of (data || [])) dados.textos.set(h.id, h);
  } catch (err) {
    console.warn('[build-analise] textos de análise do herói ausentes:', err?.message || err);
  }

  try {
    const { data, error } = await supabase.from('equipment_set_bonuses').select('id,title,stats');
    if (error) throw error;
    for (const b of (data || [])) if (b.stats) dados.statsBonus.set(b.id, statusSource('set_bonus', b.id, b.stats));
  } catch (err) {
    console.warn('[build-analise] equipment_set_bonuses.stats ausente:', err?.message || err);
  }

  return dados;
}

function acumular(alvo, stats, desconhecidas, mult = 1, base = null) {
  for (const [chave, valor] of Object.entries(stats || {})) {
    if (STAT_IGNORADAS.has(chave)) continue;
    const regras = STAT_MAP[chave] || STAT_MAP[normalizar(chave)];
    if (!regras) { desconhecidas.add(chave); continue; }
    const n = Number(valor);
    if (!Number.isFinite(n)) continue;
    for (const [macro, peso, modo] of regras) {
      let contribuicao;
      if (modo === 'inv') contribuicao = n > 0 ? peso / n : 0;
      else if (modo === 'pct') contribuicao = base ? (base[macro] || 0) * (n / 100) * peso : 0;
      else contribuicao = n * peso;
      alvo[macro] = (alvo[macro] || 0) + contribuicao * mult;
    }
  }
}

export function calcularBonusAtivos(contexto = {}) {
  const validation = validateEquipmentLoadout(contexto);
  if (!validation.valid) return [];
  const itens = validation.items;
  const contagem = new Map();
  for (const item of itens) if (item.setId) contagem.set(item.setId, (contagem.get(item.setId) || 0) + 1);

  const ativos = [];
  const vistos = new Set();
  for (const item of itens) {
    if (!item.set || vistos.has(item.setId)) continue;
    vistos.add(item.setId);
    const pecas = contagem.get(item.setId) || 0;
    for (const b of (item.set.bonus || [])) {
      if (pecas < (b.required_pieces || 0)) continue;
      ativos.push({ id: b.id, set: item.set.nome, pecas: b.required_pieces, titulo: b.title, desc: b.description });
    }
  }
  return ativos.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function statsDoItem(item) { return itemCalculationSource(item); }

function comportamentoDoItem(item) {
  return [item?.descricao || item?.description || ''].filter(Boolean);
}

function comportamentosDaBuild(contexto) {
  const textos = [];
  for (const item of Object.values(contexto.equipados || {}).filter(Boolean)) textos.push(...comportamentoDoItem(item));
  for (const ativo of calcularBonusAtivos(contexto)) if (ativo.desc) textos.push(ativo.desc);
  return textos;
}

function classificarFit(score) {
  const n = Number(score || 0);
  if (n >= 82) return 'excelente';
  if (n >= 70) return 'forte';
  if (n >= 58) return 'boa';
  if (n >= 48) return 'neutra';
  return 'baixa';
}

function rawBuildModifiers(contexto) {
  const { equipados = {}, dados = {} } = contexto;
  const sources = [];
  for (const item of Object.values(equipados).filter(Boolean)) {
    const stats = statsDoItem(item);
    if (stats) sources.push(stats);
  }
  for (const ativo of calcularBonusAtivos(contexto)) {
    const stats = dados.statsBonus?.get(ativo.id);
    if (stats) sources.push(stats);
  }
  return sources;
}

function conhecimentoDoItem(item) {
  const freshness = getEquipmentFreshness(item?.databaseId);
  return {
    available: freshness.available === true,
    known: freshness.known === true,
    fresh: freshness.fresh === true,
    version: Number(freshness.version || 0),
    gameVersion: freshness.gameVersion || null,
    changedAt: freshness.changedAt || null,
    pendingInvalidations: Number(freshness.pendingInvalidations || 0)
  };
}

function avaliarEchoBrain(contexto, base, calculo) {
  const { heroi = {}, equipados = {}, dados = {} } = contexto;
  const skills = dados.skillsHerois?.get(heroi.databaseId) || [];

  const buildFit = evaluateAppliedModifiersForHeroV4({
    hero: heroi,
    skills,
    baseStats: calculo.base,
    applied: calculo.applied,
    unknown: calculo.unknown,
    rawModifiers: rawBuildModifiers(contexto),
    behaviorTexts: comportamentosDaBuild(contexto)
  });

  const itens = [];
  for (const [slot, item] of Object.entries(equipados || {})) {
    if (!item) continue;
    const freshness = conhecimentoDoItem(item);
    const stats = statsDoItem(item) || {};
    const hasStats = Object.keys(stats).length > 0;
    const itemCalc = hasStats
      ? applyEquipmentStats(base, [stats], statusOptionsForContext(contexto))
      : { base, applied: [], unknown: [] };
    const fit = evaluateAppliedModifiersForHeroV4({
      hero: heroi,
      skills,
      baseStats: itemCalc.base,
      applied: itemCalc.applied,
      unknown: itemCalc.unknown,
      rawModifiers: hasStats ? [stats] : [],
      behaviorTexts: comportamentoDoItem(item)
    });

    itens.push({
      slot,
      equipmentId: item.databaseId || null,
      nome: item.nome || 'Equipamento',
      fitScore: fit.fitScore,
      numericFitScore: fit.numericFitScore,
      classificacao: hasStats || fit.behaviorAware ? classificarFit(fit.fitScore) : 'sem-dados',
      semanticAffinity: fit.semanticAffinity,
      calculationCoverage: hasStats ? fit.calculationCoverage : 0,
      completeCalculation: hasStats ? fit.completeCalculation : false,
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
      freshness
    });
  }

  const bonus = [];
  for (const ativo of calcularBonusAtivos(contexto)) {
    const stats = dados.statsBonus?.get(ativo.id) || {};
    const hasStats = Object.keys(stats).length > 0;
    const bonusCalc = hasStats
      ? applyEquipmentStats(base, [stats], statusOptionsForContext(contexto))
      : { base, applied: [], unknown: [] };
    const fit = evaluateAppliedModifiersForHeroV4({
      hero: heroi,
      skills,
      baseStats: bonusCalc.base,
      applied: bonusCalc.applied,
      unknown: bonusCalc.unknown,
      rawModifiers: hasStats ? [stats] : [],
      behaviorTexts: [ativo.desc || ''].filter(Boolean)
    });
    bonus.push({
      id: ativo.id,
      set: ativo.set,
      titulo: ativo.titulo,
      pecas: ativo.pecas,
      fitScore: fit.fitScore,
      numericFitScore: fit.numericFitScore,
      classificacao: hasStats || fit.behaviorAware ? classificarFit(fit.fitScore) : 'sem-dados',
      semanticAffinity: fit.semanticAffinity,
      calculationCoverage: hasStats ? fit.calculationCoverage : 0,
      completeCalculation: hasStats ? fit.completeCalculation : false,
      unresolvedModifiers: fit.unresolvedModifiers,
      strongestSynergies: fit.strongestSynergies,
      conflicts: fit.conflicts,
      behaviorAware: fit.behaviorAware,
      behaviorScore: fit.behavior?.score ?? null,
      behaviorReasons: fit.behavior?.reasons || []
    });
  }

  const ordenados = [...itens].sort((a, b) => b.fitScore - a.fitScore);
  const melhor = ordenados[0] || null;
  const pior = ordenados.length > 1 ? ordenados[ordenados.length - 1] : null;
  const freshnessState = equipmentFreshnessState();
  const itensSemBaseline = itens.filter(item => freshnessState.available && !item.freshness.known);
  const itensPendentes = itens.filter(item => item.freshness.available && item.freshness.known && !item.freshness.fresh);
  const staleItems = [...itensSemBaseline, ...itensPendentes];
  const knowledgeStatus = !freshnessState.available
    ? 'unverified'
    : staleItems.length ? 'stale' : 'current';
  const confidenceFactor = knowledgeStatus === 'current' ? 1 : knowledgeStatus === 'stale' ? .65 : .75;
  const adjustedConfidence = Math.max(0, Math.min(1, Number(buildFit.explanationConfidence || 0) * confidenceFactor));

  return {
    schemaVersion: buildFit.schemaVersion,
    heroId: heroi.databaseId || null,
    skillsConsidered: buildFit.skillsConsidered,
    mechanics: buildFit.mechanics,
    explanationConfidence: Number(adjustedConfidence.toFixed(3)),
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
    knowledgeStatus,
    knowledgeFresh: knowledgeStatus === 'current',
    staleItemCount: staleItems.length,
    pendingInvalidations: staleItems.reduce((sum, item) => sum + Number(item.freshness.pendingInvalidations || 0), 0),
    freshnessAvailable: freshnessState.available === true,
    itens,
    bonus,
    melhorItem: melhor,
    itemMenosAderente: pior && pior.fitScore < 58 ? pior : null
  };
}

export function calcularMacros(contexto = {}) {
  if (contexto.dados?.statusRegistryError) return criarResultadoVazio('registry-unavailable', contexto.dados.statusRegistryError);
  const validation = validateEquipmentLoadout(contexto);
  if (!validation.valid) {
    return { ...criarResultadoVazio('invalid-loadout', 'Há equipamentos incompatíveis, repetidos ou sem posição/raridade válida. Revise a build antes de calcular.'), equipmentIssues: validation.issues };
  }
  const desconhecidas = new Set();
  const { heroi = {}, equipados = {}, dados = {} } = contexto;
  const dadosHeroi = dados.baseHerois?.get(heroi.databaseId);
  const possuiBaseReal = Boolean(dadosHeroi && typeof dadosHeroi === 'object' && Object.keys(dadosHeroi).length);
  const base = possuiBaseReal ? dadosHeroi : null;

  if (!base) {
    return criarResultadoVazio('missing-base', 'As estatísticas-base deste herói ainda não foram cadastradas.');
  }

  const fontesEquipamentos = [];
  for (const item of Object.values(equipados).filter(Boolean)) {
    const stats = statsDoItem(item);
    if (stats) fontesEquipamentos.push(stats);
  }

  for (const b of calcularBonusAtivos(contexto)) {
    const stats = dados.statsBonus?.get(b.id);
    if (stats) fontesEquipamentos.push(stats);
  }

  const statusOptions = statusOptionsForContext(contexto);
  if (statusOptions.registry) fontesEquipamentos.push(...statusSkillSources(statusOptions.registry, statusOptions.sourceBase?.skills || [], statusOptions.sourceBase?.skill_levels || []));
  const calculo = applyEquipmentStats(base, fontesEquipamentos, statusOptions);
  calculo.unknown.forEach(key => desconhecidas.add(key));
  const estatisticas = buildRealStatLines(calculo, 99);
  const linhas = estatisticas.slice(0, 5);
  const echoBrain = avaliarEchoBrain(contexto, base, calculo);

  return {
    status: 'ok',
    base: calculo.base,
    total: calculo.final,
    linhas,
    estatisticas,
    modificadoresAplicados: calculo.applied,
    statusCalculation: calculo,
    distribuicaoDisparoRa0: calculateShotDistribution(calculo.final, 0),
    estimado: false,
    estatisticasDesconhecidas: [...desconhecidas],
    echoBrain
  };
}

export function calcularDificuldade({ linhas = [], equipados = [] }) {
  if (!equipados.length) return null;
  const penalidades = linhas.filter(linha => Number(linha.delta) < 0).length;
  const ganhosConcentrados = linhas.filter(linha => Number(linha.pct) >= LIMIAR_FORTE).length;
  let nivel = 1;
  if (penalidades >= 2) nivel += 1;
  if (ganhosConcentrados >= 2 && penalidades >= 1) nivel += 1;
  return Math.min(3, nivel);
}

const ESTILO_DERIVADO = {
  fogo: 'Ofensivo — troca dano por exposição.',
  sobrevivencia: 'Resistente — segura linha de frente.',
  mobilidade: 'Móvel — reposiciona e flanqueia.',
  suporte: 'Utilitário — sustenta o time.',
  controle: 'Tático — domina alcance e visão.'
};

function resumoBrain(echoBrain) {
  if (!echoBrain || !echoBrain.itens?.length) return '';
  const confianca = Math.round(Number(echoBrain.explanationConfidence || 0) * 100);
  const cobertura = Math.round(Number(echoBrain.calculationCoverage ?? 1) * 100);
  const score = Number(echoBrain.buildFitScore || 0);
  const partes = [`Echo Brain: aderência semântica da build ${score}/100`];
  if (echoBrain.skillsConsidered) partes.push(`${echoBrain.skillsConsidered} habilidade(s) considerada(s)`);
  if (echoBrain.behaviorAware) partes.push('comportamento textual dos itens e bônus ativos incluído na leitura');
  if (confianca) partes.push(`confiança da leitura ${confianca}%`);
  if (echoBrain.knowledgeStatus === 'stale') partes.push(`${echoBrain.staleItemCount} item(ns) aguardam reconciliação de patch; a nota numérica usa os valores atuais, mas a confiança semântica foi reduzida`);
  if (echoBrain.knowledgeStatus === 'unverified') partes.push('frescor da memória de equipamentos não pôde ser confirmado; a confiança semântica foi reduzida');
  if (!echoBrain.completeCalculation) partes.push(`cobertura numérica ${cobertura}% — efeitos não calculáveis foram preservados como incerteza`);
  if (echoBrain.itemMenosAderente) partes.push(`${echoBrain.itemMenosAderente.nome} é a peça menos aderente ao kit entre os efeitos calculáveis/semânticos`);
  return partes.join(' · ') + '.';
}

export function analisarBuild(contexto = {}) {
  try {
    if (!contexto.heroi?.databaseId) {
      return criarResultadoVazio('waiting-hero', 'Selecione um herói para iniciar a análise.');
    }

    const resultadoMacros = calcularMacros(contexto);
    if (resultadoMacros.status !== 'ok') return resultadoMacros;

    const { heroi = {}, slots = [], equipados = {}, dados = {} } = contexto;
    const { linhas, echoBrain } = resultadoMacros;
    const itensEquipados = Object.values(equipados).filter(Boolean);
    const equipadosN = slots.filter(s => equipados[s.key]).length;
    const estado = equipadosN === 0 ? 'Aguardando build' : equipadosN < slots.length ? 'Parcial' : 'Completa';
    const texto = dados.textos?.get(heroi.databaseId) || {};

    const rotulo = l => `${l.nome}: ${l.delta >= 0 ? '+' : ''}${(Math.round(l.delta * 10) / 10).toLocaleString('pt-BR')}%`;
    const fortes = linhas.filter(l => Number(l.beneficialDelta) > 0).map(rotulo);
    const fracos = linhas.filter(l => Number(l.beneficialDelta) < 0).map(rotulo);

    for (const synergy of (echoBrain?.strongestSynergies || []).slice(0, 2)) {
      const motivo = synergy.reasons?.[0];
      if (motivo && !fortes.includes(motivo)) fortes.push(motivo);
    }
    for (const motivo of (echoBrain?.behaviorReasons || []).slice(0, 2)) {
      if (motivo && !fortes.includes(motivo)) fortes.push(motivo);
    }
    for (const conflict of (echoBrain?.conflicts || []).slice(0, 2)) {
      const motivo = conflict.reasons?.[0]
        || `O atributo ${conflict.stat} está se movendo contra a direção benéfica para este herói.`;
      if (!fracos.includes(motivo)) fracos.push(motivo);
    }

    if (echoBrain?.knowledgeStatus === 'stale') {
      fracos.unshift(`Echo Brain: ${echoBrain.staleItemCount} item(ns) da build estão em reconciliação após mudança de patch; a confiança semântica foi reduzida até atualização da memória.`);
    } else if (echoBrain?.knowledgeStatus === 'unverified') {
      fracos.unshift('Echo Brain: não foi possível confirmar a versão semântica dos equipamentos; a confiança da recomendação foi reduzida sem alterar o cálculo numérico atual.');
    }

    if (texto.strength_note) fortes.push(texto.strength_note);
    if (texto.weakness_note) fracos.push(texto.weakness_note);

    const alteradas = linhas.filter(l => Math.abs(Number(l.delta)) > 0.001);
    const derivado = alteradas.length
      ? `${alteradas.length} atributo(s) real(is) alterado(s) pelos itens selecionados.`
      : 'Nenhum atributo cadastrado foi alterado pelos itens selecionados.';
    const brainResumo = resumoBrain(echoBrain);
    const estilo = equipadosN === 0
      ? 'A análise será atualizada automaticamente conforme a montagem da build.'
      : [texto.playstyle || '', derivado, brainResumo].filter(Boolean).join(' ');

    const sinergia = slots.map(s => {
      const it = equipados[s.key];
      const fit = echoBrain?.itens?.find(x => x.slot === s.key) || null;
      return {
        label: s.label,
        cor: corDoItem(it),
        media: it?.media || null,
        vazio: !it?.media?.src,
        echoBrainFit: fit?.fitScore ?? null,
        echoBrainClassificacao: fit?.classificacao || null
      };
    });

    const resultado = {
      ...resultadoMacros,
      status: 'ready',
      mensagem: '',
      bonusAtivos: calcularBonusAtivos(contexto),
      fortes,
      fracos,
      sinergia,
      estilo,
      dificuldade: Number(texto.difficulty) || calcularDificuldade({ linhas, equipados: itensEquipados }),
      estado,
      classe: heroi.classe || null,
      equipadosN,
      totalSlots: slots.length
    };

    if (resultado.estatisticasDesconhecidas.length) {
      console.warn('[build-analise] Stats de equipamento sem atributo-base compatível:', resultado.estatisticasDesconhecidas.join(', '));
    }

    return resultado;
  } catch (error) {
    console.error('[build-analise] Falha ao analisar build:', error);
    return criarResultadoVazio('error', 'Não foi possível calcular a análise desta build.');
  }
}

function numericPublicProjection(contexto, diagnostic) {
  if (diagnostic?.status !== 'ready') return diagnostic;
  const { heroi = {}, slots = [], equipados = {} } = contexto;
  const itensEquipados = Object.values(equipados).filter(Boolean);
  const rotulo = linha => `${linha.nome}: ${linha.delta >= 0 ? '+' : ''}${(Math.round(linha.delta * 10) / 10).toLocaleString('pt-BR')}%`;
  const fortes = (diagnostic.linhas || []).filter(linha => Number(linha.beneficialDelta) > 0).map(rotulo);
  const fracos = (diagnostic.linhas || []).filter(linha => Number(linha.beneficialDelta) < 0).map(rotulo);
  const alteradas = (diagnostic.linhas || []).filter(linha => Math.abs(Number(linha.delta)) > .001);
  const derivado = alteradas.length
    ? `${alteradas.length} atributo(s) real(is) alterado(s) pelos itens selecionados.`
    : 'Nenhum atributo cadastrado foi alterado pelos itens selecionados.';

  return {
    ...diagnostic,
    fortes,
    fracos,
    estilo: itensEquipados.length ? derivado : 'A análise será atualizada automaticamente conforme a montagem da build.',
    dificuldade: calcularDificuldade({ linhas: diagnostic.linhas || [], equipados: itensEquipados }),
    sinergia: slots.map(slot => {
      const item = equipados[slot.key];
      return {
        label: slot.label,
        cor: corDoItem(item),
        media: item?.media || null,
        vazio: !item?.media?.src,
        echoBrainFit: null,
        echoBrainClassificacao: null
      };
    }),
    echoBrain: null,
    brainAuthority: {
      status: 'pending',
      authority: 'server',
      fallback: 'none',
      localInfluence: 0
    }
  };
}

function mergeAuthoritativeBrain(contexto, numericResult, response) {
  const statusParity = numericResult.statusCalculation?.registry
    ? compareStatusCalculations(numericResult.statusCalculation, response.calculationTrace) : null;
  if (statusParity && !statusParity.equal) return { ...numericResult, statusParity, echoBrain: null, brainAuthority: { status: 'registry-divergent', authority: 'server', fallback: 'none', localInfluence: 0 }, fracos: [...numericResult.fracos, statusParity.reason] };
  const brain = response.result;
  const fortes = [...(numericResult.fortes || [])];
  const fracos = [...(numericResult.fracos || [])];
  for (const synergy of (brain.strongestSynergies || []).slice(0, 2)) {
    const reason = synergy.reasons?.[0];
    if (reason && !fortes.includes(reason)) fortes.push(reason);
  }
  for (const reason of (brain.behaviorReasons || []).slice(0, 2)) {
    if (reason && !fortes.includes(reason)) fortes.push(reason);
  }
  for (const conflict of (brain.conflicts || []).slice(0, 2)) {
    const reason = conflict.reasons?.[0]
      || `O atributo ${conflict.stat} está se movendo contra a direção benéfica para este herói.`;
    if (!fracos.includes(reason)) fracos.push(reason);
  }
  const summary = resumoBrain(brain);
  const bySlot = new Map((brain.itens || []).map(item => [String(item.slot), item]));

  return {
    ...numericResult,
    fortes,
    fracos,
    estilo: [numericResult.estilo, summary].filter(Boolean).join(' '),
    sinergia: (contexto.slots || []).map(slot => {
      const item = contexto.equipados?.[slot.key];
      const fit = bySlot.get(String(slot.key));
      return {
        label: slot.label,
        cor: corDoItem(item),
        media: item?.media || null,
        vazio: !item?.media?.src,
        echoBrainFit: fit?.fitScore ?? null,
        echoBrainClassificacao: fit?.classificacao || null
      };
    }),
    statusParity,
    echoBrain: brain,
    brainAuthority: {
      status: 'current',
      authority: 'server',
      schemaVersion: response.schemaVersion,
      fallback: 'none',
      localInfluence: 0,
      exposureId: response.exposureId,
      knowledge: response.knowledge
    }
  };
}

export function prepararAnalisePublicaV4(contexto = {}) {
  return numericPublicProjection(contexto, analisarBuild(contexto));
}

export async function analisarBuildComAutoridadeV4(contexto = {}, surface = 'build_lab') {
  const numericResult = prepararAnalisePublicaV4(contexto);
  if (numericResult?.status !== 'ready') return numericResult;
  const response = await scorePublicItemFitV4(contexto, surface);
  if (!response.ok) {
    return {
      ...numericResult,
      brainAuthority: {
        status: 'unavailable',
        authority: 'server',
        error: response.error || 'item_fit_unavailable',
        detail: response.detail || null,
        fallback: 'none',
        localInfluence: 0
      }
    };
  }
  return mergeAuthoritativeBrain(contexto, numericResult, response);
}

/* ============================================================
   RADAR (SVG, sem biblioteca)
   ============================================================ */
const CX = 132, CY = 122, R = 78;

function ponto(i, r, total = 5) {
  const a = (-90 + i * (360 / total)) * Math.PI / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function poligono(pcts) {
  return pcts.map((p, i) => {
    const [x, y] = ponto(i, R * Math.max(0.02, Math.min(1, p / 100)), pcts.length);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function radarSvg(linhas) {
  const aneis = [25, 50, 75, 100].map(p =>
    `<polygon class="an-grid" points="${poligono(linhas.map(() => p))}"></polygon>`).join('');
  const eixos = linhas.map((m, i) => {
    const [x, y] = ponto(i, R, linhas.length);
    return `<line class="an-axis" x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line>`;
  }).join('');
  const rotulos = linhas.map((m, i) => {
    const [x, y] = ponto(i, R + 20, linhas.length);
    const anchor = Math.abs(x - CX) < 6 ? 'middle' : (x > CX ? 'start' : 'end');
    return `<text class="an-label" x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}" fill="${m.cor}">${esc(m.curto)}</text>`;
  }).join('');
  const vertices = linhas.map((l, i) => {
    const [x, y] = ponto(i, R * Math.max(0.02, Math.min(1, l.pct / 100)), linhas.length);
    return `<circle class="an-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${l.cor}"></circle>`;
  }).join('');

  return `<svg class="an-radar" viewBox="0 0 264 244" role="img" aria-label="Radar dos atributos da build">
    ${aneis}${eixos}
    <polygon class="an-poly-base" points="${poligono(linhas.map(l => l.pctBase))}"></polygon>
    <polygon class="an-poly-total" points="${poligono(linhas.map(l => l.pct))}"></polygon>
    ${vertices}${rotulos}
  </svg>`;
}

const cabecalho = (rotulo, classe = '') =>
  `<div class="an-head"><h2>Análise da Build</h2><span class="an-state ${classe}">${esc(rotulo)}</span></div>`;

const aviso = (classe, titulo, texto) =>
  `<div class="an-message ${classe}"><strong>${esc(titulo)}</strong><p>${esc(texto)}</p></div>`;

const ZEPTO_DAMAGE_FALLBACK_URL = 'https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1543-armor-penetration-rework-how-damage-now-bypasses-armor/';

function formatDamageNumber(value, maximumFractionDigits = 2) {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return numeric.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits
  });
}

function renderDamageModel(distribution) {
  if (!distribution?.formulaComplete && !distribution?.complete) return '';

  const source = distribution.source || {};
  const sourceUrl = source.url || ZEPTO_DAMAGE_FALLBACK_URL;
  const healthPercent = Number(distribution.healthShare || 0) * 100;
  const armorPercent = Number(distribution.armorShare || 0) * 100;
  const effective = distribution.effectivePenetration === null
    ? 'Não se aplica'
    : `${formatDamageNumber(distribution.effectivePenetration)}%`;
  const healthMultiplierRegistered = distribution.healthMultiplierRegistered
    ?? Number.isFinite(distribution.healthMultiplier);
  const armorMultiplierRegistered = distribution.armorMultiplierRegistered
    ?? Number.isFinite(distribution.armorMultiplier);
  const armorFinalKnown = !distribution.armorActive || armorMultiplierRegistered;
  const healthValue = healthMultiplierRegistered
    ? distribution.healthDamage
    : distribution.healthDamageBeforeMultiplier;
  const armorValue = armorFinalKnown
    ? distribution.armorDamage
    : distribution.armorDamageBeforeMultiplier;

  return `<section class="an-damage-model" data-damage-model aria-labelledby="an-damage-title">
    <header class="an-damage-header">
      <div class="an-damage-provenance">
        <span class="an-source-eyebrow"><i aria-hidden="true">✓</i> Metodologia verificada</span>
        <span class="an-source-publisher">${esc(source.publisher || 'ZeptoLab')}</span>
      </div>
      <h3 id="an-damage-title">Dano à vida e à armadura</h3>
      <p>A penetração efetiva divide o dano-base entre vida e armadura. Quando cadastrados, os multiplicadores específicos da arma são aplicados a cada parcela.</p>
    </header>

    <div class="an-damage-controls">
      <label class="an-resistance-control">
        <span><b>Resistência de armadura do alvo (AR)</b><small>Ajuste o cenário sem alterar a build.</small></span>
        <output data-armor-resistance-output>0%</output>
        <input data-armor-resistance type="range" min="0" max="100" step="1" value="0" aria-label="Resistência de armadura do alvo, de 0 a 100 por cento">
      </label>
      <label class="an-armor-toggle">
        <input data-armor-active type="checkbox" checked>
        <span class="an-toggle-track" aria-hidden="true"></span>
        <span><b>Alvo com armadura ativa</b><small>Desative para calcular dano direto à vida.</small></span>
      </label>
    </div>

    <div class="an-damage-split" data-damage-split role="img" aria-label="Divisão do dano-base">
      <span class="health" data-health-bar style="width:${healthPercent}%"><em data-health-share>Vida ${formatDamageNumber(healthPercent)}%</em></span>
      <span class="armor" data-armor-bar style="width:${armorPercent}%"><em data-armor-share>Armadura ${formatDamageNumber(armorPercent)}%</em></span>
    </div>

    <div class="an-damage-metrics" aria-live="polite">
      <article>
        <small>Penetração efetiva</small>
        <strong data-effective-penetration>${effective}</strong>
        <span>AP × efeito da AR</span>
      </article>
      <article class="health ${healthMultiplierRegistered ? '' : 'is-base-portion'}">
        <small data-health-label>${healthMultiplierRegistered ? 'Dano estimado à vida' : 'Parcela base à vida'}</small>
        <strong data-health-damage>${formatDamageNumber(healthValue)}</strong>
        <span data-health-detail>${healthMultiplierRegistered
          ? `${formatDamageNumber(healthPercent)}% do dano-base × ${formatDamageNumber(distribution.healthMultiplier)}`
          : `${formatDamageNumber(healthPercent)}% do dano-base · multiplicador não cadastrado`}</span>
      </article>
      <article class="armor ${armorFinalKnown ? '' : 'is-base-portion'}">
        <small data-armor-label>${armorFinalKnown ? 'Dano estimado à armadura' : 'Parcela base à armadura'}</small>
        <strong data-armor-damage>${formatDamageNumber(armorValue)}</strong>
        <span data-armor-detail>${!distribution.armorActive
          ? 'Sem armadura ativa no cenário'
          : armorMultiplierRegistered
            ? `${formatDamageNumber(armorPercent)}% do dano-base × ${formatDamageNumber(distribution.armorMultiplier)}`
            : `${formatDamageNumber(armorPercent)}% do dano-base · multiplicador não cadastrado`}</span>
      </article>
    </div>

    <p class="an-damage-equation" data-damage-equation>AP efetiva = ${formatDamageNumber(distribution.armorPenetration)} × (100 − 0) ÷ 100 = ${effective}</p>
    <p class="an-damage-data-status" data-damage-data-status ${healthMultiplierRegistered && armorFinalKnown ? 'hidden' : ''}><span aria-hidden="true">!</span> Multiplicadores específicos ainda não constam no cadastro. As parcelas base são exibidas sem presumir ×1.</p>

    <div class="an-damage-source">
      <span class="an-source-mark" aria-hidden="true">Z</span>
      <div>
        <strong>Cálculo baseado na fórmula oficial da ZeptoLab</strong>
        <small>${esc(source.titlePt || 'Rework oficial da penetração de armadura')}</small>
      </div>
      <a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">Ver fórmula oficial <span aria-hidden="true">↗</span></a>
    </div>

    <details class="an-damage-limits">
      <summary>Escopo e limites do cálculo</summary>
      <p>A atribuição à ZeptoLab se refere à fórmula de distribuição entre vida e armadura. Os atributos e bônus aplicados à build usam os valores cadastrados no Echo Arena.</p>
      <p>Multiplicadores ausentes não são tratados como ×1. Nessa situação, o painel identifica e mostra somente a parcela base; bônus dependentes desse multiplicador permanecem pendentes.</p>
      <p>Estimativa estática por unidade de dano cadastrada. Não soma pellets ou projéteis sem contagem confirmada, nem simula dispersão, obstáculos, barreiras, dano residual, excesso após quebrar a armadura ou efeitos temporários ausentes nos atributos.</p>
      <p><b>Poder de perfuração não participa desta divisão:</b> no Bullet Echo ele trata a passagem por paredes, escudos e corpos.</p>
    </details>
  </section>`;
}

function bindDamageModel(container, stats) {
  const panel = container.querySelector('[data-damage-model]');
  if (!panel) return;

  const resistance = panel.querySelector('[data-armor-resistance]');
  const resistanceOutput = panel.querySelector('[data-armor-resistance-output]');
  const armorActive = panel.querySelector('[data-armor-active]');
  const effective = panel.querySelector('[data-effective-penetration]');
  const healthDamage = panel.querySelector('[data-health-damage]');
  const armorDamage = panel.querySelector('[data-armor-damage]');
  const healthLabel = panel.querySelector('[data-health-label]');
  const armorLabel = panel.querySelector('[data-armor-label]');
  const healthDetail = panel.querySelector('[data-health-detail]');
  const armorDetail = panel.querySelector('[data-armor-detail]');
  const healthMetric = healthDamage?.closest('article');
  const armorMetric = armorDamage?.closest('article');
  const healthBar = panel.querySelector('[data-health-bar]');
  const armorBar = panel.querySelector('[data-armor-bar]');
  const healthShare = panel.querySelector('[data-health-share]');
  const armorShare = panel.querySelector('[data-armor-share]');
  const split = panel.querySelector('[data-damage-split]');
  const equation = panel.querySelector('[data-damage-equation]');
  const dataStatus = panel.querySelector('[data-damage-data-status]');

  const update = () => {
    const armorIsActive = Boolean(armorActive?.checked);
    const armorResistance = Number(resistance?.value || 0);
    const distribution = calculateShotDistribution(stats, {
      armorActive: armorIsActive,
      armorResistance
    });
    if (!distribution.formulaComplete && !distribution.complete) return;

    const healthPercent = distribution.healthShare * 100;
    const armorPercent = distribution.armorShare * 100;
    const healthMultiplierRegistered = distribution.healthMultiplierRegistered
      ?? Number.isFinite(distribution.healthMultiplier);
    const armorMultiplierRegistered = distribution.armorMultiplierRegistered
      ?? Number.isFinite(distribution.armorMultiplier);
    const armorFinalKnown = !armorIsActive || armorMultiplierRegistered;
    const healthValue = healthMultiplierRegistered
      ? distribution.healthDamage
      : distribution.healthDamageBeforeMultiplier;
    const armorValue = armorFinalKnown
      ? distribution.armorDamage
      : distribution.armorDamageBeforeMultiplier;
    const effectiveText = distribution.effectivePenetration === null
      ? 'Não se aplica'
      : `${formatDamageNumber(distribution.effectivePenetration)}%`;

    if (resistance) resistance.disabled = !armorIsActive;
    if (resistanceOutput) resistanceOutput.textContent = armorIsActive ? `${armorResistance}%` : '—';
    if (effective) effective.textContent = effectiveText;
    if (healthDamage) healthDamage.textContent = formatDamageNumber(healthValue);
    if (armorDamage) armorDamage.textContent = formatDamageNumber(armorValue);
    if (healthLabel) healthLabel.textContent = healthMultiplierRegistered ? 'Dano estimado à vida' : 'Parcela base à vida';
    if (armorLabel) armorLabel.textContent = armorFinalKnown ? 'Dano estimado à armadura' : 'Parcela base à armadura';
    if (healthDetail) healthDetail.textContent = healthMultiplierRegistered
      ? `${formatDamageNumber(healthPercent)}% do dano-base × ${formatDamageNumber(distribution.healthMultiplier)}`
      : `${formatDamageNumber(healthPercent)}% do dano-base · multiplicador não cadastrado`;
    if (armorDetail) armorDetail.textContent = armorIsActive
      ? armorMultiplierRegistered
        ? `${formatDamageNumber(armorPercent)}% do dano-base × ${formatDamageNumber(distribution.armorMultiplier)}`
        : `${formatDamageNumber(armorPercent)}% do dano-base · multiplicador não cadastrado`
      : 'Sem armadura ativa no cenário';
    healthMetric?.classList.toggle('is-base-portion', !healthMultiplierRegistered);
    armorMetric?.classList.toggle('is-base-portion', !armorFinalKnown);
    if (healthBar) healthBar.style.width = `${healthPercent}%`;
    if (armorBar) armorBar.style.width = `${armorPercent}%`;
    if (healthShare) healthShare.textContent = `Vida ${formatDamageNumber(healthPercent)}%`;
    if (armorShare) armorShare.textContent = `Armadura ${formatDamageNumber(armorPercent)}%`;
    if (split) split.setAttribute('aria-label', `Divisão do dano-base: ${formatDamageNumber(healthPercent)}% para vida e ${formatDamageNumber(armorPercent)}% para armadura.`);
    if (equation) equation.textContent = armorIsActive
      ? `AP efetiva = ${formatDamageNumber(distribution.armorPenetration)} × (100 − ${armorResistance}) ÷ 100 = ${effectiveText}`
      : 'Sem armadura ativa: 100% do dano-base segue para a vida.';
    if (dataStatus) dataStatus.hidden = healthMultiplierRegistered && armorFinalKnown;

    panel.classList.toggle('is-unarmored', !armorIsActive);
  };

  resistance?.addEventListener('input', update);
  armorActive?.addEventListener('change', update);
  update();
}

export function renderAnalise(resultado) {
  const container = document.getElementById('analise');
  if (!container) return;

  if (resultado && !resultado.status) {
    console.error('[build-analise] renderAnalise recebeu um objeto sem status.', resultado);
    container.innerHTML = cabecalho('Erro', 'error') + aviso(
      'error', 'Análise recebeu dados inválidos',
      'O painel foi chamado com o contexto em vez do resultado do cálculo. Veja o console.'
    );
    return;
  }

  if (!resultado || resultado.status === 'waiting-hero' || resultado.status === 'idle') {
    container.innerHTML = cabecalho('Aguardando') + aviso('', 'Selecione um herói',
      'Escolha um herói para visualizar estatísticas, sinergias e recomendações.');
    return;
  }

  if (resultado.status === 'missing-base') {
    container.innerHTML = cabecalho('Dados pendentes', 'warning') + aviso(
      'warning', 'Estatísticas-base não cadastradas',
      'Este herói ainda não possui dados suficientes para gerar uma análise confiável.'
    );
    return;
  }

  if (resultado.status === 'error') {
    container.innerHTML = cabecalho('Erro', 'error') + aviso(
      'error', 'Não foi possível atualizar a análise',
      'A montagem foi preservada. Altere um item ou tente novamente para recalcular.'
    );
    return;
  }

  const {
    linhas = [], fortes = [], fracos = [], bonusAtivos = [], sinergia = [],
    estilo, dificuldade, estado, classe, equipadosN = 0, totalSlots = 0,
    distribuicaoDisparoRa0, estatisticas = linhas, echoBrain
  } = resultado;

  const chips = (lista, tipo, vazio) => lista.length
    ? lista.map(t => `<li class="an-chip ${tipo}">${esc(t)}</li>`).join('')
    : `<li class="an-chip vazio">${esc(vazio)}</li>`;

  const brainItens = (echoBrain?.itens || []).map(item => {
    const cobertura = Math.round(Number(item.calculationCoverage ?? 1) * 100);
    const estadoVersao = !item.freshness?.available
      ? 'versão semântica não confirmada'
      : !item.freshness?.known
        ? 'sem baseline versionada'
        : item.freshness.pendingInvalidations > 0
          ? `${item.freshness.pendingInvalidations} invalidação(ões) pendente(s)`
          : `versão ${item.freshness.version} atual`;
    const behavior = item.behaviorAware && item.behaviorScore !== null
      ? ` · comportamento ${item.behaviorScore}/100`
      : '';
    const detalhe = item.completeCalculation
      ? `${item.classificacao} · afinidade ${Math.round(Number(item.semanticAffinity || 0) * 100)}%${behavior} · ${estadoVersao}`
      : `${item.classificacao} · cálculo ${cobertura}%${behavior} · ${item.unresolvedModifiers?.length || 0} efeito(s) aguardando base · ${estadoVersao}`;
    return `<div class="an-b"><span class="pc">${esc(item.fitScore)}</span><div><b>${esc(item.nome)}</b><small>${esc(detalhe)}</small></div></div>`;
  }).join('');

  const brainCoverage = Math.round(Number(echoBrain?.calculationCoverage ?? 1) * 100);
  const knowledgeNotice = echoBrain?.knowledgeStatus === 'stale'
    ? `<p class="an-empty">Conhecimento de equipamento em reconciliação: ${esc(echoBrain.staleItemCount)} item(ns), ${esc(echoBrain.pendingInvalidations)} invalidação(ões). A matemática usa os valores atuais; a confiança semântica está reduzida.</p>`
    : echoBrain?.knowledgeStatus === 'unverified'
      ? '<p class="an-empty">Não foi possível confirmar a memória versionada dos equipamentos. A matemática atual foi preservada e a confiança semântica foi reduzida.</p>'
      : '';
  const authorityNotice = resultado.brainAuthority?.status === 'unavailable'
    ? '<p class="an-empty">Echo Brain Item Fit indisponível ou com conhecimento incompatível. A análise numérica determinística permanece visível, mas nenhuma nota, recomendação ou ordenação local foi usada como fallback.</p>'
    : resultado.brainAuthority?.status === 'pending'
      ? '<p class="an-empty">Validando Item Fit com a autoridade Semantic v4 do servidor…</p>'
      : '';

  container.innerHTML = `
    ${cabecalho(estado || 'Pronta', estado === 'Completa' ? 'ok' : '')}

    <div class="an-real-head">
      <span>ATRIBUTO OFICIAL</span><span>BASE</span><span>VALOR ATUAL + EQUIPAMENTOS</span>
    </div>
    <ul class="an-real-values">
      ${estatisticas.map(l => {
        const decimals = Number(l.decimals || 0);
        const fmt = value => `${l.prefix || ''}${Number(value).toLocaleString('pt-BR', {
          minimumFractionDigits: decimals, maximumFractionDigits: decimals
        })}${l.unit || ''}`;
        const fmtDelta = value => `${Number(value).toLocaleString('pt-BR', {
          minimumFractionDigits: decimals, maximumFractionDigits: decimals
        })}${l.unit || ''}`;
        const changed = Math.abs(Number(l.difference)) > 1e-9;
        return `<li class="${changed ? 'changed' : ''}" style="--rc:${esc(l.cor)}">
          <span class="an-stat-name"><i>${esc(l.icone)}</i><b>${esc(l.nome)}</b></span>
          <span class="an-base-value">${esc(fmt(l.base))}</span>
          <span class="an-current-value"><strong>${esc(fmt(l.valor))}</strong><em class="${Number(l.beneficialDelta) < 0 ? 'down' : 'up'}">${changed
            ? `${l.difference > 0 ? '+' : ''}${esc(fmtDelta(l.difference))}` : ''}</em></span>
        </li>`;
      }).join('')}
    </ul>

    <div class="an-syn" title="Sinergia dos itens">
      ${sinergia.map(s => `<div class="s media ${s.vazio ? 'ph' : ''}" style="--rc:${esc(s.cor)};${mStyle(s.media)}" title="${esc(s.label)}${s.echoBrainFit != null ? ` · Echo Brain ${s.echoBrainFit}/100` : ''}">${mInner(s.media)}</div>`).join('')}
    </div>

    <div class="an-grid2">
      <section><h3>Pontos fortes</h3><ul>${chips(fortes, 'up', 'Equipe itens para gerar a análise.')}</ul></section>
      <section><h3>Pontos fracos</h3><ul>${chips(fracos, 'down', 'Aguardando dados suficientes da build.')}</ul></section>
    </div>

    <section class="an-style"><h3>Estilo de jogo</h3><p>${esc(estilo || '')}</p></section>

    ${authorityNotice}
    ${echoBrain?.itens?.length ? `<details class="an-bonus">
      <summary>Echo Brain · aderência ao kit <b>${esc(echoBrain.buildFitScore)}/100</b></summary>
      <p class="an-empty">${esc(echoBrain.skillsConsidered)} habilidade(s) analisada(s) · confiança ${Math.round(Number(echoBrain.explanationConfidence || 0) * 100)}%${echoBrain.behaviorAware ? ' · comportamento de item interpretado' : ''}${echoBrain.completeCalculation ? '' : ` · cobertura numérica ${brainCoverage}%`}</p>
      ${knowledgeNotice}
      ${brainItens}
      ${echoBrain.completeCalculation ? '' : '<p class="an-empty">Efeitos sem base oficial suficiente permanecem explicitamente incertos e não são tratados como impacto zero.</p>'}
    </details>` : ''}

    ${renderDamageModel(distribuicaoDisparoRa0)}

    <div class="an-foot">
      <div><h3>Dificuldade</h3><div class="an-dif">${dificuldade
        ? Array.from({ length: 5 }, (_, i) => `<i class="${i < dificuldade ? 'on' : ''}"></i>`).join('')
        : '<span class="an-dif-empty">—</span>'}</div></div>
      <div><h3>Classe</h3><span class="an-tag">${esc(classe || '—')}</span></div>
      <div><h3>Slots</h3><span class="an-tag">${equipadosN}/${totalSlots}</span></div>
    </div>

    <details class="an-bonus" ${bonusAtivos.length ? 'open' : ''}>
      <summary>Bônus ativos <b>${bonusAtivos.length}</b></summary>
      ${bonusAtivos.length
        ? bonusAtivos.map(b => `<div class="an-b"><span class="pc">${esc(b.pecas)}</span><div><b>${esc(b.titulo)}</b><small>${esc(b.desc)}</small></div></div>`).join('')
        : '<p class="an-empty">Complete peças de um mesmo conjunto para ativar bônus.</p>'}
    </details>
  `;

  bindDamageModel(container, resultado.total || resultado.base || {});
}
