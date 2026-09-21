import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { resolveExternalDataEffect } from './equipment-data-limits.js?v=2';
import {
  refreshEquipmentAttributeClassifications,
  resolvePersistedAttributeClassification
} from './equipment-attribute-classifications.js?v=1&sb=20260823-security-supabase-pin-1';

let scheduled = false;
let lastSignature = '';
let externalByEquipmentName = new Map();

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAttributes(value) {
  if (Array.isArray(value)) {
    return value.map(item => ({
      label: String(item?.label ?? item?.name ?? item?.raw ?? '').trim(),
      value: item?.value ?? ''
    })).filter(item => item.label);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([label, attributeValue]) => ({ label, value: attributeValue }));
  }
  return [];
}

function resolveAnyExternal(rawLabel = '') {
  const persisted = resolvePersistedAttributeClassification(rawLabel);
  if (persisted?.classification === 'external_data_required') {
    return {
      id: `persisted:${persisted.normalizedKey}`,
      label: persisted.label,
      unit: /percentual|%|pct/i.test(rawLabel) ? '%' : '',
      missingData: persisted.missingData,
      publicNote: persisted.publicNote
    };
  }
  return resolveExternalDataEffect(rawLabel);
}

function ensureStyles() {
  if (document.getElementById('build-external-data-style')) return;
  const style = document.createElement('style');
  style.id = 'build-external-data-style';
  style.textContent = `
    #equipment-detail .stat.external-data{border-color:rgba(251,191,36,.42)!important;background:rgba(120,83,8,.09)!important}#equipment-detail .stat.external-data .stat-label{color:#fde68a!important}.build-external-tag{display:inline-flex;margin-top:5px;padding:3px 6px;border:1px solid #76591c;border-radius:999px;color:#fde68a;font-size:7px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}
    .build-external-summary{margin-top:12px;padding:14px;border:1px solid #76591c;border-radius:12px;background:linear-gradient(145deg,rgba(120,83,8,.12),rgba(7,16,29,.94));color:#c6b77b}.build-external-summary h3{margin:0;color:#fde68a;font-size:12px;letter-spacing:.05em;text-transform:uppercase}.build-external-summary>p{margin:5px 0 0;font-size:9px;line-height:1.55}.build-external-list{display:grid;gap:7px;margin-top:10px}.build-external-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:9px;border:1px solid rgba(118,89,28,.5);border-radius:8px;background:#08111f}.build-external-row strong{display:block;color:#f3e7b3;font-size:9px}.build-external-row small{display:block;margin-top:3px;color:#8f876a;font-size:8px;line-height:1.4}.build-external-row b{color:#fde68a;font-size:10px;white-space:nowrap}.build-external-foot{margin-top:9px;padding-top:9px;border-top:1px solid rgba(118,89,28,.35);font-size:8px;line-height:1.5;color:#9d9476}
  `;
  document.head.appendChild(style);
}

async function loadExternalIndex() {
  await refreshEquipmentAttributeClassifications();

  const [equipmentsResult, variantsResult, raritiesResult] = await Promise.all([
    supabase.from('equipments').select('id,name'),
    supabase.from('equipment_variants').select('equipment_id,rarity_id,attributes'),
    supabase.from('equipment_rarities').select('id,slug,name')
  ]);

  const error = equipmentsResult.error || variantsResult.error || raritiesResult.error;
  if (error) {
    console.warn('[build-external-data-ui] Não foi possível carregar a referência dos efeitos externos.', error);
    return;
  }

  const namesById = new Map((equipmentsResult.data || []).map(item => [String(item.id), item.name || 'Equipamento']));
  const raritiesById = new Map((raritiesResult.data || []).map(item => [String(item.id), item]));
  const index = new Map();

  for (const variant of variantsResult.data || []) {
    const name = namesById.get(String(variant.equipment_id));
    if (!name) continue;
    const rarity = raritiesById.get(String(variant.rarity_id)) || {};
    const effects = normalizeAttributes(variant.attributes)
      .map(attribute => ({ ...attribute, effect: resolveAnyExternal(attribute.label) }))
      .filter(attribute => attribute.effect)
      .map(attribute => ({
        id: attribute.effect.id,
        label: attribute.effect.label,
        value: attribute.value,
        unit: attribute.effect.unit || '',
        missingData: attribute.effect.missingData,
        publicNote: attribute.effect.publicNote
      }));

    if (!effects.length) continue;
    const equipmentKey = normalize(name);
    if (!index.has(equipmentKey)) index.set(equipmentKey, new Map());
    const variants = index.get(equipmentKey);
    variants.set(normalize(rarity.slug), effects);
    variants.set(normalize(rarity.name), effects);
  }

  externalByEquipmentName = index;
  schedule();
}

function currentEquipped() {
  return [...document.querySelectorAll('#ring .slot:not(.empty)')].map(slot => ({
    name: slot.querySelector('.in b')?.textContent?.trim() || '',
    rarity: slot.querySelector('.in i')?.textContent?.trim() || ''
  })).filter(item => item.name && item.name.toLowerCase() !== 'vazio');
}

function displayValue(value, unit = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const numeric = Number(raw.replace(',', '.'));
  const sign = Number.isFinite(numeric) && numeric > 0 ? '+' : '';
  return `${sign}${raw}${unit && !raw.includes(unit) ? unit : ''}`;
}

function effectsFor(item) {
  const variants = externalByEquipmentName.get(normalize(item.name));
  if (!variants) return [];
  return variants.get(normalize(item.rarity)) || [...new Set(variants.values())][0] || [];
}

function decorateCurrentDetail() {
  const detail = document.getElementById('equipment-detail');
  if (!detail?.classList.contains('has-item')) return;

  detail.querySelectorAll('.stat').forEach(card => {
    const desc = card.querySelector('.stat-desc')?.textContent?.trim() || '';
    const label = card.querySelector('.stat-label')?.textContent?.trim() || '';
    const effect = resolveAnyExternal(desc) || resolveAnyExternal(label);
    card.querySelector('.build-external-tag')?.remove();
    card.classList.remove('external-data');
    if (!effect) return;

    card.classList.add('external-data');
    const tag = document.createElement('small');
    tag.className = 'build-external-tag';
    tag.textContent = 'Resultado não calculado';
    card.appendChild(tag);

    const valueNode = card.querySelector('.stat-val');
    if (valueNode && effect.unit && !valueNode.textContent.includes(effect.unit)) {
      valueNode.append(document.createTextNode(effect.unit));
    }
  });
}

function renderSummary() {
  const analysis = document.getElementById('analise');
  if (!analysis) return;

  const rows = [];
  for (const item of currentEquipped()) {
    for (const effect of effectsFor(item)) {
      rows.push({ itemName: item.name, rarity: item.rarity, ...effect });
    }
  }

  const signature = JSON.stringify(rows.map(row => [row.itemName, row.rarity, row.id, row.value]));
  const existing = document.getElementById('build-external-data-summary');
  if (!rows.length) {
    existing?.remove();
    lastSignature = '';
    return;
  }
  if (existing && signature === lastSignature) return;
  existing?.remove();

  const section = document.createElement('section');
  section.id = 'build-external-data-summary';
  section.className = 'build-external-summary';
  section.innerHTML = `
    <h3>🟡 Efeitos não incluídos no cálculo</h3>
    <p>Os benefícios abaixo existem nos equipamentos da build, mas o jogo não fornece publicamente a base necessária para um resultado final confiável. Eles continuam válidos como efeito do item; apenas não entram nos números calculados.</p>
    <div class="build-external-list">${rows.map(row => `
      <div class="build-external-row">
        <div><strong>${escapeHtml(row.itemName)} · ${escapeHtml(row.label)}</strong><small>${escapeHtml(row.rarity)} · aguardando dado oficial. ${escapeHtml(row.missingData || 'Base oficial ainda não disponível.')}</small></div>
        <b>${escapeHtml(displayValue(row.value, row.unit))}</b>
      </div>`).join('')}</div>
    <div class="build-external-foot">O Echo Arena não estima valores-base ocultos. Quando existir uma fonte oficial confiável, estes efeitos poderão ser incorporados ao motor sem alterar o cadastro dos equipamentos.</div>`;
  analysis.appendChild(section);
  lastSignature = signature;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function refresh() {
  scheduled = false;
  decorateCurrentDetail();
  renderSummary();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(refresh);
}

ensureStyles();
await loadExternalIndex();
schedule();
new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
