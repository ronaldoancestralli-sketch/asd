import { statusSource } from '../../js/status-registry-v1.js?sc=20260906-1&eq=20260907-effects-1';
import { equipmentEligibility } from '../../js/equipment-eligibility.js?v=1';
import { normalizeEquipmentAttributesForCalculation } from '../../js/equipment-attribute-calculation.js?v=2';
import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import { getEquipmentBundle, listEquipments } from './equipment-api.js?v=brain-evolution-4&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1';
import { carregarDadosAnalise, analisarBuildComAutoridadeV4 } from '../../js/build-analise.js?v=18&sb=20260823-security-supabase-pin-1&sc=20260906-1&eq=20260907-effects-1';
import { evaluateEquipmentSwapCounterfactualsV1 } from '../../js/echo-brain-build-counterfactual-v1.js?v=1';

const $ = id => document.getElementById(id);
const bundleCache = new Map();
let analysisDataPromise = null;
let busy = false;

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function ensureSurface() {
  const controls = document.querySelector('#brain-investigation-panel .brain-investigation-controls');
  const actions = document.querySelector('#brain-investigation-panel .brain-investigation-actions');
  if (!controls || !actions) return false;

  if (!$('brain-investigation-equipment-alt')) {
    controls.insertAdjacentHTML('beforeend', `
      <label>Item alternativo<select id="brain-investigation-equipment-alt"><option value="">Selecione</option></select></label>
      <label>Raridade atual<select id="brain-investigation-rarity-base"><option value="">—</option></select></label>
      <label>Raridade alternativa<select id="brain-investigation-rarity-alt"><option value="">—</option></select></label>`);
  }
  if (!$('brain-compare-item-swap')) {
    actions.insertAdjacentHTML('beforeend', '<button id="brain-compare-item-swap" class="admin-button" type="button">Comparar troca de item</button>');
  }
  return true;
}

async function bundle(id) {
  if (!id) return null;
  if (!bundleCache.has(id)) bundleCache.set(id, getEquipmentBundle(id));
  return bundleCache.get(id);
}

function normalizeAttributes(attributes) {
  return normalizeEquipmentAttributesForCalculation(attributes);
}

function rarityInfo(variant) {
  const rarity = variant?.equipment_rarities || {};
  return {
    slug: rarity.slug || variant?.rarity_slug || variant?.rarity_id || 'unknown',
    nome: rarity.name || rarity.slug || variant?.rarity_slug || 'Nível',
    ordem: Number(rarity.rank ?? rarity.display_order ?? 0),
    cor: rarity.color || null,
    calculationSource: statusSource('equipment_variant', variant.id, variant.attributes),
    stats: normalizeAttributes(variant?.attributes)
  };
}

function levelsFromBundle(value) {
  return (value?.variants || []).map(rarityInfo).sort((a, b) => a.ordem - b.ordem);
}

function populateRarity(select, value, preferred = '') {
  if (!select) return;
  const levels = levelsFromBundle(value);
  select.innerHTML = levels.length
    ? levels.map(level => `<option value="${esc(level.slug)}">${esc(level.nome)}</option>`).join('')
    : '<option value="">Sem variantes</option>';
  const preferredExists = levels.some(level => level.slug === preferred);
  if (preferredExists) select.value = preferred;
  else if (levels.length) select.value = levels.at(-1).slug;
}

function buildItem(value, raritySlug) {
  const equipment = value?.equipment || {};
  const levels = levelsFromBundle(value);
  const selected = levels.find(level => level.slug === raritySlug) || levels.at(-1) || null;
  return {
    databaseId: equipment.id,
    heroId: equipment.hero_id || null,
    classId: equipment.class_id || null,
    isPersonal: equipment.is_personal === true,
    enabled: equipment.enabled,
    nome: equipment.name || 'Equipamento',
    descricao: equipment.description || '',
    recommendation: equipment.recommendation_text || '',
    slot: equipment.slot_id || null,
    slotLabel: 'Auditoria',
    setId: equipment.set_id || null,
    set: equipment.set_id ? {
      id: equipment.set_id,
      nome: 'Conjunto',
      bonus: (value.bonuses || []).map(row => ({
        id: row.id,
        required_pieces: row.required_pieces,
        title: row.title,
        description: row.description
      }))
    } : null,
    raridade: selected?.slug || raritySlug || '',
    levels
  };
}

function compatible(equipment, hero) {
  return equipmentEligibility(equipment, hero).eligible;
}

async function loadAnalysisData() {
  if (!analysisDataPromise) analysisDataPromise = carregarDadosAnalise();
  return analysisDataPromise;
}

function message(text, tone = '') {
  const host = $('brain-investigation-message');
  if (!host) return;
  host.textContent = text;
  host.dataset.tone = tone;
}

async function syncRarity(which) {
  const equipmentId = $(which === 'base' ? 'brain-investigation-equipment' : 'brain-investigation-equipment-alt')?.value || '';
  const select = $(which === 'base' ? 'brain-investigation-rarity-base' : 'brain-investigation-rarity-alt');
  if (!equipmentId) {
    if (select) select.innerHTML = '<option value="">—</option>';
    return;
  }
  try {
    const value = await bundle(equipmentId);
    populateRarity(select, value);
  } catch (error) {
    console.warn('[echo-brain-build-counterfactual-ui] raridades indisponíveis:', error);
    if (select) select.innerHTML = '<option value="">Erro</option>';
  }
}

function componentLabel(key) {
  return ({
    finalScore: 'aderência final',
    functionalSynergy: 'cobertura calculável',
    semanticSynergy: 'aderência semântica',
    mechanicalDemand: 'conflitos/exigência',
    confidence: 'confiança'
  })[key] || key;
}

async function compareSwap() {
  if (busy) return;
  const heroId = $('brain-investigation-hero-a')?.value || '';
  const baseId = $('brain-investigation-equipment')?.value || '';
  const candidateId = $('brain-investigation-equipment-alt')?.value || '';
  const baseRarity = $('brain-investigation-rarity-base')?.value || '';
  const candidateRarity = $('brain-investigation-rarity-alt')?.value || '';
  if (!heroId || !baseId || !candidateId || !baseRarity || !candidateRarity) {
    message('Para o contrafactual, selecione Herói A, item atual, item alternativo e as duas raridades.', 'warning');
    return;
  }
  if (baseId === candidateId && baseRarity === candidateRarity) {
    message('A alternativa precisa mudar o item ou a raridade para existir um contrafactual.', 'warning');
    return;
  }

  busy = true;
  const button = $('brain-compare-item-swap');
  if (button) button.disabled = true;
  message('Recalculando a troca com o motor oficial da Mesa de Builds…');
  try {
    const [{ data: hero, error: heroError }, baseBundle, candidateBundle, dados] = await Promise.all([
      supabase.from('heroes').select('id,name,class_id').eq('id', heroId).single(),
      bundle(baseId),
      bundle(candidateId),
      loadAnalysisData()
    ]);
    if (heroError) throw heroError;
    if (!compatible(baseBundle?.equipment, hero) || !compatible(candidateBundle?.equipment, hero)) {
      throw new Error('Um dos equipamentos não é compatível com o herói selecionado.');
    }
    if (String(baseBundle?.equipment?.slot_id || '') !== String(candidateBundle?.equipment?.slot_id || '')) {
      throw new Error('Contrafactual inválido: os dois equipamentos precisam ocupar o mesmo slot.');
    }

    const currentItem = buildItem(baseBundle, baseRarity);
    const candidateItem = buildItem(candidateBundle, candidateRarity);
    const context = {
      heroi: {
        id: hero.id,
        databaseId: hero.id,
        classId: hero.class_id || null,
        nome: hero.name,
        classe: ''
      },
      slots: [{ key: 'audit-slot', label: 'Auditoria' }],
      equipados: { 'audit-slot': currentItem },
      dados
    };

    const result = await evaluateEquipmentSwapCounterfactualsV1({
      context,
      slotKey: 'audit-slot',
      candidates: [candidateItem],
      evaluateBuild: async ctx => analisarBuildComAutoridadeV4(ctx, 'comparison')
    });
    const alternative = result.alternatives?.[0];
    if (!alternative) throw new Error('O motor não retornou a alternativa contrafactual.');
    const comparison = alternative.comparison;
    const baselineBrain = result.baselineResult?.echoBrain || {};
    const candidateBrain = alternative.result?.echoBrain || {};

    const { error: auditError } = await supabase.rpc('admin_echo_brain_record_counterfactual', {
      p_domain: 'equipment',
      p_baseline_key: `${hero.id}:${baseId}:${baseRarity}`,
      p_candidate_key: `${hero.id}:${candidateId}:${candidateRarity}`,
      p_baseline_score: comparison.baselineScore,
      p_candidate_score: comparison.candidateScore,
      p_changed_components: comparison.changedComponents || [],
      p_confidence: comparison.confidence || {},
      p_semantic_schema: candidateBrain.schemaVersion || baselineBrain.schemaVersion || 'echo-brain-item-fit-v4',
      p_model_id: null
    });
    if (auditError) throw auditError;

    const changed = (comparison.changedComponents || []).filter(row => !row.unchanged);
    const delta = comparison.delta;
    const verdict = comparison.verdict === 'improves' ? 'MELHORA'
      : comparison.verdict === 'worsens' ? 'PIORA'
        : comparison.verdict === 'neutral' ? 'NEUTRO' : 'INDETERMINADO';
    const resultHost = $('brain-investigation-result');
    if (resultHost) resultHost.innerHTML = `
      <div class="invest-card"><h4>Contrafactual isolado · ${esc(hero.name)}</h4><p>Uma única posição foi alterada. O cálculo usa a mesma autoridade Item Fit v4 do servidor usada pela Mesa de Builds; nenhuma fórmula pública paralela foi criada.</p><div class="invest-grid"><div><span>Atual</span><b>${esc(comparison.baselineScore ?? '—')}</b><small>${esc(currentItem.nome)} · ${esc(baseRarity)}</small></div><div><span>Alternativa</span><b>${esc(comparison.candidateScore ?? '—')}</b><small>${esc(candidateItem.nome)} · ${esc(candidateRarity)}</small></div><div><span>Delta</span><b>${delta == null ? '—' : `${delta > 0 ? '+' : ''}${esc(delta)}`}</b><small>${esc(verdict)}</small></div><div><span>Cobertura atual</span><b>${Math.round(Number(baselineBrain.calculationCoverage || 0) * 100)}%</b><small>numérica</small></div><div><span>Cobertura alternativa</span><b>${Math.round(Number(candidateBrain.calculationCoverage || 0) * 100)}%</b><small>numérica</small></div></div></div>
      <div class="invest-card"><h4>O que mudou</h4>${changed.length ? changed.map(row => `<p>${row.utilityDelta > 0 ? '+' : row.utilityDelta < 0 ? '–' : '•'} ${esc(componentLabel(row.key))}: ${esc(row.before)} → ${esc(row.after)} (${row.utilityDelta > 0 ? '+' : ''}${esc(row.utilityDelta)})</p>`).join('') : '<p>Nenhum componente comparável mudou.</p>'}</div>
      <div class="invest-card"><h4>Limite da prova</h4><p>Este teste isola uma única peça para medir causalidade local. Bônus de conjunto que exigem múltiplas peças não são assumidos aqui; para uma build completa, a mesma função deve receber o restante real do loadout.</p></div>`;
    message('Contrafactual calculado e auditado sem alterar a build ou os equipamentos.', 'success');
  } catch (error) {
    message(`Falha no contrafactual: ${error?.message || error}`, 'danger');
  } finally {
    busy = false;
    if (button) button.disabled = false;
  }
}

if (ensureSurface()) {
  try {
    const rows = await listEquipments();
    const alt = $('brain-investigation-equipment-alt');
    if (alt) alt.innerHTML = `<option value="">Selecione</option>${rows.map(item => `<option value="${esc(item.id)}">${esc(item.name || item.slug || item.id)}</option>`).join('')}`;
    await syncRarity('base');
  } catch (error) {
    console.warn('[echo-brain-build-counterfactual-ui] catálogo indisponível:', error);
  }

  $('brain-investigation-equipment')?.addEventListener('change', () => syncRarity('base'));
  $('brain-investigation-equipment-alt')?.addEventListener('change', () => syncRarity('alt'));
  $('brain-compare-item-swap')?.addEventListener('click', compareSwap);
}
