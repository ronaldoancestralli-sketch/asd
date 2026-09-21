import { statusSource } from './status-registry-v1.js?sc=20260906-1&eq=20260907-effects-1';
import { equipmentEligibility } from './equipment-eligibility.js?v=1';
import { normalizeEquipmentAttributesForCalculation } from './equipment-attribute-calculation.js?v=2';
import { listEquipments, getEquipmentBundle } from './equipment-api.js?v=brain-evolution-4&sb=20260823-security-supabase-pin-1';
import {
  evaluateEquipmentSwapCounterfactualsV1,
  oneChangeAtATimeInvariantV1
} from './echo-brain-build-counterfactual-v1.js?v=1';

const PANEL_ID = 'build-counterfactual-panel';
const CHANGE_EVENT = 'echo:build-workbench-change';
const bundleCache = new Map();
let catalogPromise = null;
let initialized = false;
let bridgeRef = null;
let lastWorkbenchSignature = '';
let comparisonToken = 0;

const $ = id => document.getElementById(id);

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberText(value, digits = 1) {
  const number = finite(value);
  if (number === null) return '—';
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(number) ? 0 : Math.min(1, digits),
    maximumFractionDigits: digits
  });
}

function percentText(value) {
  const number = finite(value);
  return number === null ? '—' : `${Math.round(number * 100)}%`;
}

function ensureStyles() {
  if ($('build-counterfactual-styles')) return;
  const style = document.createElement('style');
  style.id = 'build-counterfactual-styles';
  style.textContent = `
    .build-cf{margin:16px 0 4px;border:1px solid rgba(139,92,246,.3);border-radius:16px;background:linear-gradient(145deg,rgba(11,21,38,.96),rgba(7,14,27,.96));overflow:hidden}
    .build-cf[hidden]{display:none!important}.build-cf-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:16px 18px;border-bottom:1px solid rgba(148,163,184,.13)}
    .build-cf-kicker{display:block;color:#a78bfa;font:800 9px/1 Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px}.build-cf-head h3{margin:0;color:#f8fafc;font:800 18px/1.05 'Barlow Condensed',sans-serif;letter-spacing:.025em}.build-cf-head p{margin:6px 0 0;max-width:650px;color:#8d9ab0;font:500 10px/1.5 Inter,sans-serif}.build-cf-badge{flex:0 0 auto;padding:6px 8px;border:1px solid rgba(74,222,128,.24);border-radius:999px;color:#86efac;font:800 8px/1 Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase}
    .build-cf-controls{display:grid;grid-template-columns:minmax(130px,.8fr) minmax(170px,1.25fr) minmax(120px,.7fr) auto;gap:9px;padding:14px 18px}.build-cf-field{display:grid;gap:5px;color:#7f8da4;font:800 8px/1 Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase}.build-cf-field select{min-width:0;height:38px;border:1px solid #27364e;border-radius:9px;background:#071221;color:#e7edf7;padding:0 10px;font:600 10px Inter,sans-serif;outline:none}.build-cf-field select:focus{border-color:#8b5cf6;box-shadow:0 0 0 2px rgba(139,92,246,.12)}
    .build-cf-run{align-self:end;height:38px;border:0;border-radius:9px;padding:0 14px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;font:900 9px/1 Inter,sans-serif;letter-spacing:.06em;cursor:pointer}.build-cf-run:disabled{opacity:.42;cursor:not-allowed}.build-cf-status{padding:0 18px 12px;color:#8290a6;font:600 9px/1.45 Inter,sans-serif}.build-cf-status[data-tone="danger"]{color:#fda4af}.build-cf-status[data-tone="success"]{color:#86efac}.build-cf-status[data-tone="warning"]{color:#fcd34d}
    .build-cf-result{display:grid;gap:10px;padding:0 18px 16px}.build-cf-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.build-cf-metric{padding:11px;border:1px solid #223149;border-radius:10px;background:#081525}.build-cf-metric span{display:block;color:#74839a;font:800 7px/1 Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase}.build-cf-metric b{display:block;margin-top:5px;color:#f8fafc;font:800 18px/1 'Barlow Condensed',sans-serif}.build-cf-metric small{display:block;margin-top:4px;color:#8c9ab0;font:500 8px/1.3 Inter,sans-serif}.build-cf-metric.good b{color:#86efac}.build-cf-metric.bad b{color:#fda4af}.build-cf-metric.neutral b{color:#d8b4fe}
    .build-cf-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.build-cf-card{padding:12px 13px;border:1px solid #223149;border-radius:10px;background:#07111f}.build-cf-card h4{margin:0 0 8px;color:#b8c2d4;font:800 9px/1 Inter,sans-serif;letter-spacing:.07em;text-transform:uppercase}.build-cf-row{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid rgba(148,163,184,.08);color:#9ba8bc;font:500 9px/1.35 Inter,sans-serif}.build-cf-row:first-of-type{border-top:0}.build-cf-row b{color:#e8edf5;text-align:right}.build-cf-list{margin:0;padding-left:15px;color:#aeb9ca;font:500 9px/1.45 Inter,sans-serif}.build-cf-list li+li{margin-top:5px}.build-cf-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:2px;color:#718098;font:500 8px/1.4 Inter,sans-serif}.build-cf-open{border:1px solid #31415c;border-radius:8px;background:#0c192b;color:#dce5f2;padding:8px 10px;font:800 8px/1 Inter,sans-serif;cursor:pointer}
    @media(max-width:800px){.build-cf-head{padding:14px}.build-cf-controls{grid-template-columns:1fr 1fr;padding:12px 14px}.build-cf-run{grid-column:1/-1}.build-cf-result{padding:0 14px 14px}.build-cf-summary{grid-template-columns:1fr 1fr}.build-cf-grid{grid-template-columns:1fr}.build-cf-badge{display:none}}
    @media(max-width:480px){.build-cf-controls{grid-template-columns:1fr}.build-cf-summary{grid-template-columns:1fr 1fr}.build-cf-head h3{font-size:16px}}
  `;
  document.head.appendChild(style);
}

function ensurePanel() {
  let panel = $(PANEL_ID);
  if (panel) return panel;
  const impact = document.querySelector('.impact-panel');
  const actions = impact?.querySelector('.impact-actions');
  if (!impact || !actions) return null;

  panel = document.createElement('section');
  panel.id = PANEL_ID;
  panel.className = 'build-cf';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'build-cf-title');
  panel.innerHTML = `
    <div class="build-cf-head">
      <div><span class="build-cf-kicker">ECHO BRAIN · CONTRAFACTUAL</span><h3 id="build-cf-title">E se eu trocar só uma peça?</h3><p>Compare a build atual com uma única substituição do mesmo slot. O preview usa o mesmo motor oficial da Mesa e nunca altera sua build.</p></div>
      <span class="build-cf-badge">1 mudança isolada</span>
    </div>
    <div class="build-cf-controls">
      <label class="build-cf-field">Peça atual<select id="build-cf-slot"></select></label>
      <label class="build-cf-field">Alternativa<select id="build-cf-item"><option value="">Selecione</option></select></label>
      <label class="build-cf-field">Raridade<select id="build-cf-rarity"><option value="">—</option></select></label>
      <button class="build-cf-run" id="build-cf-run" type="button">SIMULAR TROCA</button>
    </div>
    <div class="build-cf-status" id="build-cf-status" role="status" aria-live="polite"></div>
    <div class="build-cf-result" id="build-cf-result"></div>`;
  impact.insertBefore(panel, actions);
  return panel;
}

function setStatus(text = '', tone = '') {
  const host = $('build-cf-status');
  if (!host) return;
  host.textContent = text;
  host.dataset.tone = tone;
}

function snapshot() {
  return bridgeRef?.getSnapshot?.() || null;
}

function workbenchSignature(value) {
  const context = value?.context || {};
  const items = (context.slots || []).map(slot => {
    const item = context.equipados?.[slot.key];
    return `${slot.key}:${item?.databaseId || ''}:${item?.raridade || ''}`;
  });
  return `${context.heroi?.databaseId || ''}|${items.join('|')}`;
}

function compatible(row, hero) {
  return equipmentEligibility(row, hero).eligible;
}

function sameSlot(row, slot) {
  if (!row || !slot) return false;
  if (slot.slotId && row.slot_id) return String(slot.slotId) === String(row.slot_id);
  return String(row.equipment_slots?.slug || '') === String(slot.key || '');
}

async function catalog() {
  if (!catalogPromise) catalogPromise = listEquipments();
  return catalogPromise;
}

async function bundle(id) {
  if (!id) return null;
  if (!bundleCache.has(String(id))) bundleCache.set(String(id), getEquipmentBundle(id));
  return bundleCache.get(String(id));
}

function normalizeAttributes(attributes) {
  return normalizeEquipmentAttributesForCalculation(attributes);
}

function levelsFromBundle(value) {
  return (value?.variants || []).map(variant => {
    const rarity = variant?.equipment_rarities || {};
    return {
      slug: rarity.slug || variant?.rarity_slug || variant?.rarity_id || 'unknown',
      nome: rarity.name || rarity.slug || variant?.rarity_slug || 'Nível',
      ordem: Number(rarity.rank ?? rarity.display_order ?? 0),
      cor: rarity.color || null,
      calculationSource: statusSource('equipment_variant', variant.id, variant.attributes),
    stats: normalizeAttributes(variant?.attributes)
    };
  }).sort((a, b) => a.ordem - b.ordem);
}

function buildCandidate(value, listing, slot, raritySlug) {
  const equipment = value?.equipment || {};
  const levels = levelsFromBundle(value);
  const selected = levels.find(level => level.slug === raritySlug) || levels[0] || null;
  return {
    databaseId: equipment.id,
    heroId: equipment.hero_id || null,
    classId: equipment.class_id || null,
    isPersonal: equipment.is_personal === true,
    enabled: equipment.enabled,
    nome: equipment.name || listing?.name || 'Equipamento',
    raridade: selected?.slug || raritySlug || '',
    media: null,
    setId: equipment.set_id || null,
    set: equipment.set_id ? {
      id: equipment.set_id,
      nome: listing?.equipment_sets?.name || 'Conjunto',
      slug: listing?.equipment_sets?.slug || '',
      bonus: (value?.bonuses || []).map(row => ({
        id: row.id,
        required_pieces: row.required_pieces,
        title: row.title,
        description: row.description,
        display_order: row.display_order || 0
      }))
    } : null,
    levels,
    descricao: equipment.description || '',
    recommendation: equipment.recommendation_text || '',
    slot: slot.key,
    slotLabel: slot.label || listing?.equipment_slots?.name || slot.key
  };
}

function selectedSlot(value = snapshot()) {
  const key = $('build-cf-slot')?.value || '';
  return value?.context?.slots?.find(slot => slot.key === key) || null;
}

async function syncAlternatives() {
  const value = snapshot();
  const slot = selectedSlot(value);
  const itemSelect = $('build-cf-item');
  const raritySelect = $('build-cf-rarity');
  if (!slot || !itemSelect || !raritySelect) return;

  const current = value.context.equipados?.[slot.key];
  itemSelect.disabled = true;
  raritySelect.disabled = true;
  itemSelect.innerHTML = '<option value="">Carregando…</option>';
  raritySelect.innerHTML = '<option value="">—</option>';
  setStatus('Carregando alternativas compatíveis do mesmo slot…');

  try {
    const rows = (await catalog()).filter(row =>
      row.enabled !== false &&
      sameSlot(row, slot) &&
      compatible(row, value.context.heroi) &&
      String(row.id) !== String(current?.databaseId || '')
    );

    itemSelect.innerHTML = rows.length
      ? `<option value="">Selecione</option>${rows.map(row => `<option value="${esc(row.id)}">${esc(row.name || row.slug || row.id)}</option>`).join('')}`
      : '<option value="">Nenhuma alternativa compatível</option>';
    itemSelect.disabled = !rows.length;
    raritySelect.disabled = true;
    setStatus(rows.length
      ? `${rows.length} alternativa(s) compatível(is) disponível(is). O preview não modifica a build.`
      : 'Não há outro equipamento compatível cadastrado para este slot.', rows.length ? '' : 'warning');
  } catch (error) {
    console.warn('[build-counterfactual] catálogo indisponível:', error);
    itemSelect.innerHTML = '<option value="">Catálogo indisponível</option>';
    setStatus('Não foi possível carregar as alternativas agora.', 'danger');
  }
}

async function syncRarities() {
  const equipmentId = $('build-cf-item')?.value || '';
  const select = $('build-cf-rarity');
  if (!select) return;
  comparisonToken += 1;
  $('build-cf-result').innerHTML = '';
  if (!equipmentId) {
    select.innerHTML = '<option value="">—</option>';
    select.disabled = true;
    return;
  }

  select.disabled = true;
  select.innerHTML = '<option value="">Carregando…</option>';
  try {
    const value = await bundle(equipmentId);
    const levels = levelsFromBundle(value);
    select.innerHTML = levels.length
      ? levels.map(level => `<option value="${esc(level.slug)}">${esc(level.nome)}</option>`).join('')
      : '<option value="">Sem variantes</option>';
    select.disabled = !levels.length;
    setStatus(levels.length
      ? 'Escolha a raridade e simule. Somente essa posição será substituída no cálculo.'
      : 'Este equipamento não possui variantes calculáveis cadastradas.', levels.length ? '' : 'warning');
  } catch (error) {
    select.innerHTML = '<option value="">Erro</option>';
    setStatus('Não foi possível carregar as raridades da alternativa.', 'danger');
  }
}

function bonusDiff(baseline = {}, candidate = {}) {
  const key = bonus => String(bonus?.id || `${bonus?.set || ''}:${bonus?.titulo || bonus?.title || ''}:${bonus?.pecas || bonus?.required_pieces || ''}`);
  const name = bonus => bonus?.titulo || bonus?.title || `${bonus?.set || 'Conjunto'} · ${bonus?.pecas || bonus?.required_pieces || '?'} peças`;
  const before = new Map((baseline.bonusAtivos || []).map(bonus => [key(bonus), name(bonus)]));
  const after = new Map((candidate.bonusAtivos || []).map(bonus => [key(bonus), name(bonus)]));
  return {
    gained: [...after].filter(([id]) => !before.has(id)).map(([, label]) => label),
    lost: [...before].filter(([id]) => !after.has(id)).map(([, label]) => label)
  };
}

function statChanges(baseline = {}, candidate = {}) {
  const before = new Map((baseline.estatisticas || []).map(line => [line.key, line]));
  return (candidate.estatisticas || []).map(after => {
    const prior = before.get(after.key);
    if (!prior) return null;
    const beforeValue = finite(prior.valor);
    const afterValue = finite(after.valor);
    if (beforeValue === null || afterValue === null) return null;
    const rawDelta = afterValue - beforeValue;
    const beforeBenefit = finite(prior.beneficialDelta) ?? 0;
    const afterBenefit = finite(after.beneficialDelta) ?? 0;
    const utilityDelta = afterBenefit - beforeBenefit;
    if (Math.abs(rawDelta) <= 1e-9 && Math.abs(utilityDelta) <= 1e-9) return null;
    return {
      key: after.key,
      name: after.nome || after.key,
      before: beforeValue,
      after: afterValue,
      rawDelta,
      utilityDelta,
      unit: after.unit || ''
    };
  }).filter(Boolean).sort((a, b) => Math.abs(b.utilityDelta) - Math.abs(a.utilityDelta)).slice(0, 5);
}

function semanticNotes(result = {}) {
  const brain = result.echoBrain || {};
  const notes = [];
  for (const synergy of (brain.strongestSynergies || []).slice(0, 2)) {
    const reason = synergy?.reasons?.[0];
    if (reason && !notes.includes(reason)) notes.push(reason);
  }
  for (const reason of (brain.behaviorReasons || []).slice(0, 2)) {
    if (reason && !notes.includes(reason)) notes.push(reason);
  }
  for (const conflict of (brain.conflicts || []).slice(0, 2)) {
    const reason = conflict?.reasons?.[0];
    if (reason && !notes.includes(reason)) notes.push(`Risco: ${reason}`);
  }
  return notes.slice(0, 4);
}

function toneForVerdict(verdict) {
  return verdict === 'improves' ? 'good' : verdict === 'worsens' ? 'bad' : 'neutral';
}

function verdictLabel(verdict) {
  return ({ improves: 'Melhora', worsens: 'Piora', neutral: 'Neutro', unknown: 'Indeterminado' })[verdict] || 'Indeterminado';
}

function renderComparison(result, alternative, currentItem, candidateItem) {
  const comparison = alternative.comparison || {};
  const baseline = result.baselineResult || {};
  const candidate = alternative.result || {};
  const baselineBrain = baseline.echoBrain || {};
  const candidateBrain = candidate.echoBrain || {};
  const stats = statChanges(baseline, candidate);
  const bonuses = bonusDiff(baseline, candidate);
  const notes = semanticNotes(candidate);
  const tone = toneForVerdict(comparison.verdict);
  const delta = finite(comparison.delta);
  const deltaLabel = delta === null ? '—' : `${delta > 0 ? '+' : ''}${numberText(delta, 1)}`;
  const freshness = candidateBrain.knowledgeStatus === 'current' ? 'Memória atual'
    : candidateBrain.knowledgeStatus === 'stale' ? 'Patch em reconciliação'
      : 'Frescor não confirmado';

  $('build-cf-result').innerHTML = `
    <div class="build-cf-summary">
      <div class="build-cf-metric"><span>Build atual</span><b>${esc(comparison.baselineScore ?? '—')}</b><small>${esc(currentItem?.nome || 'Item atual')}</small></div>
      <div class="build-cf-metric"><span>Com alternativa</span><b>${esc(comparison.candidateScore ?? '—')}</b><small>${esc(candidateItem.nome)}</small></div>
      <div class="build-cf-metric ${tone}"><span>Delta local</span><b>${esc(deltaLabel)}</b><small>${esc(verdictLabel(comparison.verdict))}</small></div>
      <div class="build-cf-metric"><span>Confiança</span><b>${esc(percentText(candidateBrain.explanationConfidence))}</b><small>${esc(freshness)}</small></div>
    </div>
    <div class="build-cf-grid">
      <div class="build-cf-card"><h4>Atributos que mudam</h4>${stats.length
        ? stats.map(row => `<div class="build-cf-row"><span>${esc(row.name)}</span><b>${esc(numberText(row.before, 2))}${esc(row.unit)} → ${esc(numberText(row.after, 2))}${esc(row.unit)}</b></div>`).join('')
        : '<div class="build-cf-row"><span>Nenhum atributo oficial comparável mudou.</span></div>'}</div>
      <div class="build-cf-card"><h4>Bônus e semântica</h4>
        ${bonuses.gained.map(label => `<div class="build-cf-row"><span>Ganha bônus</span><b>+ ${esc(label)}</b></div>`).join('')}
        ${bonuses.lost.map(label => `<div class="build-cf-row"><span>Perde bônus</span><b>− ${esc(label)}</b></div>`).join('')}
        ${!bonuses.gained.length && !bonuses.lost.length ? '<div class="build-cf-row"><span>Bônus de conjunto ativos permanecem iguais.</span></div>' : ''}
        <div class="build-cf-row"><span>Cobertura numérica</span><b>${esc(percentText(candidateBrain.calculationCoverage))}</b></div>
      </div>
    </div>
    ${notes.length ? `<div class="build-cf-card"><h4>Por que o Brain lê assim</h4><ul class="build-cf-list">${notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul></div>` : ''}
    <div class="build-cf-foot"><span>Contrafactual isolado: exatamente uma posição foi alterada; performance observada continua separada da aderência da build.</span><button class="build-cf-open" type="button" data-open-slot="${esc(result.slotKey)}">ABRIR ESTE SLOT</button></div>`;

  $('build-cf-result').querySelector('[data-open-slot]')?.addEventListener('click', event => {
    const slotKey = event.currentTarget.dataset.openSlot;
    document.querySelector(`.slot[data-slot="${CSS.escape(slotKey)}"]`)?.click();
  });
}

async function compare() {
  const token = ++comparisonToken;
  const value = snapshot();
  const slot = selectedSlot(value);
  const candidateId = $('build-cf-item')?.value || '';
  const rarity = $('build-cf-rarity')?.value || '';
  if (!value?.context || !slot || !candidateId || !rarity) {
    setStatus('Selecione a peça atual, a alternativa e a raridade.', 'warning');
    return;
  }

  const currentItem = value.context.equipados?.[slot.key];
  if (!currentItem) {
    setStatus('Este slot não possui uma peça atual para substituir.', 'warning');
    return;
  }

  const button = $('build-cf-run');
  button.disabled = true;
  setStatus('Recalculando a build inteira com somente uma posição alterada…');
  $('build-cf-result').innerHTML = '';

  try {
    const [rows, candidateBundle] = await Promise.all([catalog(), bundle(candidateId)]);
    if (token !== comparisonToken) return;
    const listing = rows.find(row => String(row.id) === String(candidateId));
    if (!listing || !sameSlot(listing, slot) || !compatible(listing, value.context.heroi)) {
      throw new Error('Alternativa incompatível com o herói ou com o slot atual.');
    }

    const candidateItem = buildCandidate(candidateBundle, listing, slot, rarity);
    const afterContext = {
      ...value.context,
      equipados: { ...value.context.equipados, [slot.key]: candidateItem }
    };
    const invariant = oneChangeAtATimeInvariantV1(value.context, afterContext);
    if (!invariant.valid || invariant.changedSlots.length !== 1 || invariant.changedSlots[0] !== slot.key) {
      throw new Error('A comparação deixou de representar exatamente uma troca de peça.');
    }

    const result = await evaluateEquipmentSwapCounterfactualsV1({
      context: value.context,
      slotKey: slot.key,
      candidates: [candidateItem],
      evaluateBuild: async context => bridgeRef.evaluateOneChange(context)
    });
    if (token !== comparisonToken) return;
    const alternative = result.alternatives?.[0];
    if (!alternative) throw new Error('O motor não retornou o contrafactual solicitado.');

    renderComparison(result, alternative, currentItem, candidateItem);
    setStatus('Preview concluído. A build atual não foi alterada.', 'success');
  } catch (error) {
    console.error('[build-counterfactual] falha:', error);
    setStatus(error?.message || 'Não foi possível calcular a troca.', 'danger');
  } finally {
    if (token === comparisonToken) button.disabled = false;
  }
}

async function syncFromWorkbench() {
  const panel = $(PANEL_ID);
  const value = snapshot();
  if (!panel || !value?.context) return;
  const signature = workbenchSignature(value);
  if (signature !== lastWorkbenchSignature) {
    lastWorkbenchSignature = signature;
    comparisonToken += 1;
    $('build-cf-result').innerHTML = '';
  }

  const occupied = (value.context.slots || []).filter(slot => value.context.equipados?.[slot.key]);
  panel.hidden = occupied.length === 0;
  if (!occupied.length) return;

  const select = $('build-cf-slot');
  const previous = select.value;
  select.innerHTML = occupied.map(slot => {
    const item = value.context.equipados[slot.key];
    return `<option value="${esc(slot.key)}">${esc(slot.label || slot.key)} · ${esc(item.nome || 'Equipamento')}</option>`;
  }).join('');
  if (occupied.some(slot => slot.key === previous)) select.value = previous;
  await syncAlternatives();
}

export function initBuildCounterfactual(bridge = globalThis.__echoBuildWorkbenchBridge) {
  if (initialized || !bridge?.getSnapshot || !bridge?.evaluateOneChange) return;
  bridgeRef = bridge;
  ensureStyles();
  const panel = ensurePanel();
  if (!panel) return;
  initialized = true;

  $('build-cf-slot').addEventListener('change', () => {
    comparisonToken += 1;
    $('build-cf-result').innerHTML = '';
    syncAlternatives();
  });
  $('build-cf-item').addEventListener('change', syncRarities);
  $('build-cf-rarity').addEventListener('change', () => {
    comparisonToken += 1;
    $('build-cf-result').innerHTML = '';
  });
  $('build-cf-run').addEventListener('click', compare);
  window.addEventListener(CHANGE_EVENT, syncFromWorkbench);
  syncFromWorkbench();
}
