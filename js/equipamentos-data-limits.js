import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { resolveExternalDataEffect } from './equipment-data-limits.js?v=2';
import {
  refreshEquipmentAttributeClassifications,
  resolvePersistedAttributeClassification
} from './equipment-attribute-classifications.js?v=3&sb=20260823-security-supabase-pin-1';

const detailBody = document.getElementById('ed-body');
const grid = document.getElementById('grid');
let currentEquipmentId = null;
let specialByEquipment = new Map();
let scheduled = false;

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

function resolveSpecial(rawLabel = '') {
  const persisted = resolvePersistedAttributeClassification(rawLabel);
  if (persisted?.classification === 'informational') {
    return {
      kind: 'informational',
      id: `persisted:${persisted.normalizedKey}`,
      label: persisted.label,
      unit: '',
      reason: persisted.reason,
      publicNote: persisted.publicNote
    };
  }
  if (persisted?.classification === 'external_data_required') {
    return {
      kind: 'external',
      id: `persisted:${persisted.normalizedKey}`,
      label: persisted.label,
      unit: /percentual|%|pct/i.test(rawLabel) ? '%' : '',
      reason: persisted.reason,
      missingData: persisted.missingData,
      publicNote: persisted.publicNote
    };
  }
  const external = resolveExternalDataEffect(rawLabel);
  return external ? { kind: 'external', ...external } : null;
}

function ensureStyles() {
  if (document.getElementById('equipment-data-limits-style')) return;
  const style = document.createElement('style');
  style.id = 'equipment-data-limits-style';
  style.textContent = `
    .st-row.external-data,.st-row.informational-data{align-items:flex-start}.st-row.external-data{border-color:rgba(251,191,36,.35);background:rgba(120,83,8,.08)}.st-row.informational-data{border-color:rgba(96,165,250,.35);background:rgba(30,64,175,.08)}.st-row.external-data>span,.st-row.informational-data>span{display:grid;gap:4px}.external-data-tag,.informational-data-tag{display:inline-flex;width:max-content;padding:3px 6px;border:1px solid;border-radius:999px;font-size:7px!important;font-weight:900;letter-spacing:.05em;text-transform:uppercase}.external-data-tag{border-color:#76591c;color:#fde68a}.informational-data-tag{border-color:#315a8b;color:#bfdbfe}.external-data-note,.informational-data-note{margin-top:10px;padding:11px 12px;border:1px solid;border-radius:10px;font-size:10px;line-height:1.55}.external-data-note{border-color:#76591c;background:rgba(120,83,8,.1);color:#c8bc8e}.informational-data-note{border-color:#315a8b;background:rgba(30,64,175,.09);color:#9fb8d8}.external-data-note strong,.informational-data-note strong{display:block;margin-bottom:4px;font-size:10px}.external-data-note strong{color:#fde68a}.informational-data-note strong{color:#bfdbfe}.external-data-note b{color:#f5d86e}.informational-data-note b{color:#dbeafe}.external-data-source{margin-top:3px!important;color:#8f876a!important;font-size:8px!important;line-height:1.4}.informational-data-source{margin-top:3px!important;color:#7895ba!important;font-size:8px!important;line-height:1.4}
  `;
  document.head.appendChild(style);
}

async function loadSpecialVariants() {
  await refreshEquipmentAttributeClassifications();

  const { data, error } = await supabase
    .from('equipment_variants')
    .select('equipment_id,attributes,equipment_rarities(slug,name,rank)');

  if (error) {
    console.warn('[equipamentos-data-limits] Não foi possível ler variantes atuais.', error);
    return;
  }

  const map = new Map();
  for (const variant of data || []) {
    const effects = normalizeAttributes(variant.attributes)
      .map(attribute => ({ ...attribute, effect: resolveSpecial(attribute.label) }))
      .filter(attribute => attribute.effect);
    if (!effects.length) continue;

    const equipmentId = String(variant.equipment_id);
    if (!map.has(equipmentId)) map.set(equipmentId, []);
    map.get(equipmentId).push({
      raritySlug: variant.equipment_rarities?.slug || '',
      rarityName: variant.equipment_rarities?.name || variant.equipment_rarities?.slug || '',
      rarityRank: Number(variant.equipment_rarities?.rank ?? 999),
      effects
    });
  }

  for (const variants of map.values()) {
    variants.sort((a, b) => a.rarityRank - b.rarityRank);
  }
  specialByEquipment = map;
  scheduleApply();
}

function selectedRaritySlug() {
  return detailBody?.querySelector('.rar-btn.on')?.dataset.rarity || '';
}

function injectVariantEffects() {
  if (!detailBody || !currentEquipmentId) return;
  const variants = specialByEquipment.get(String(currentEquipmentId)) || [];
  if (!variants.length) return;

  const selected = selectedRaritySlug();
  const variant = variants.find(item => item.raritySlug === selected) || variants[0];
  if (!variant?.effects?.length) return;

  const attributesSection = [...detailBody.querySelectorAll('.ed-section')].find(section =>
    section.querySelector('h3')?.textContent?.toLowerCase().includes('atributos')
  );
  const list = attributesSection?.querySelector('.st-list');
  if (!list) return;

  const existingLabels = new Set(
    [...list.querySelectorAll('.st-row > span')].map(node => node.childNodes[0]?.textContent?.trim().toLowerCase() || node.textContent.trim().toLowerCase())
  );

  for (const attribute of variant.effects) {
    const label = attribute.effect.label;
    if (existingLabels.has(label.toLowerCase())) continue;
    const valueNumber = Number(String(attribute.value).replace(',', '.'));
    const sign = Number.isFinite(valueNumber) && valueNumber > 0 ? '+' : '';
    const unit = attribute.effect.unit || '';
    const informational = attribute.effect.kind === 'informational';
    const row = document.createElement('div');
    row.className = `st-row ${informational ? 'informational-data' : 'external-data'}`;
    row.dataset.specialInjected = attribute.effect.id;
    row.innerHTML = `
      <span>${escapeHtml(label)}<small class="${informational ? 'informational-data-tag' : 'external-data-tag'}">${informational ? 'Efeito informativo' : 'Resultado não calculado'}</small><small class="${informational ? 'informational-data-source' : 'external-data-source'}">Efeito registrado na raridade ${escapeHtml(variant.rarityName)}.</small></span>
      <strong>${escapeHtml(`${sign}${attribute.value}${unit}`)}</strong>`;
    list.appendChild(row);
  }
}

function decorateRows() {
  if (!detailBody) return [];
  const effects = [];

  detailBody.querySelectorAll('.st-row').forEach(row => {
    const labelNode = row.querySelector('span');
    if (!labelNode) return;
    const rawLabel = labelNode.childNodes[0]?.textContent?.trim() || labelNode.textContent.trim();
    const effect = resolveSpecial(rawLabel);

    if (!effect) return;
    effects.push(effect);
    const informational = effect.kind === 'informational';
    row.classList.add(informational ? 'informational-data' : 'external-data');

    const valueNode = row.querySelector('strong');
    if (!informational && valueNode && effect.unit && !valueNode.textContent.includes(effect.unit)) {
      valueNode.textContent = `${valueNode.textContent.trim()}${effect.unit}`;
    }

    const tagClass = informational ? '.informational-data-tag' : '.external-data-tag';
    if (!row.querySelector(tagClass)) {
      const tag = document.createElement('small');
      tag.className = informational ? 'informational-data-tag' : 'external-data-tag';
      tag.textContent = informational ? 'Efeito informativo' : 'Resultado não calculado';
      labelNode.appendChild(tag);
    }
  });

  return effects;
}

function renderNotes(effects) {
  if (!detailBody) return;
  detailBody.querySelector('.external-data-note')?.remove();
  detailBody.querySelector('.informational-data-note')?.remove();
  if (!effects.length) return;

  const unique = [...new Map(effects.map(effect => [effect.id, effect])).values()];
  const external = unique.filter(effect => effect.kind !== 'informational');
  const informational = unique.filter(effect => effect.kind === 'informational');
  const attributesSection = [...detailBody.querySelectorAll('.ed-section')].find(section =>
    section.querySelector('h3')?.textContent?.toLowerCase().includes('atributos')
  );
  if (!attributesSection) return;

  if (external.length) {
    const note = document.createElement('div');
    note.className = 'external-data-note';
    note.innerHTML = `<strong>Sobre os efeitos não calculados</strong>Este equipamento possui ${external.length === 1 ? 'um efeito real' : 'efeitos reais'} que dependem de dados-base que o jogo ainda não disponibiliza publicamente. <b>Nenhum valor é estimado ou inventado.</b>`;
    attributesSection.appendChild(note);
  }

  if (informational.length) {
    const note = document.createElement('div');
    note.className = 'informational-data-note';
    note.innerHTML = `<strong>Sobre os efeitos informativos</strong>${informational.length === 1 ? 'Este efeito é uma mecânica real' : 'Estes efeitos são mecânicas reais'} preservada${informational.length === 1 ? '' : 's'} para informação. <b>Não representa${informational.length === 1 ? '' : 'm'} um atributo matemático da build e não gera${informational.length === 1 ? '' : 'm'} erro de cálculo.</b>`;
    attributesSection.appendChild(note);
  }
}

function apply() {
  scheduled = false;
  injectVariantEffects();
  renderNotes(decorateRows());
}

function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(apply);
}

ensureStyles();
grid?.addEventListener('click', event => {
  const card = event.target.closest('[data-id]');
  if (!card) return;
  currentEquipmentId = card.dataset.id;
  scheduleApply();
}, true);

if (detailBody) {
  new MutationObserver(scheduleApply).observe(detailBody, { childList: true, subtree: true });
}

await loadSpecialVariants();
scheduleApply();
