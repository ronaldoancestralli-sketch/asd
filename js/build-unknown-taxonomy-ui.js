import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import {
  EXTERNAL_DATA_EFFECTS,
  resolveExternalDataEffect
} from './equipment-data-limits.js?v=2';
import {
  refreshEquipmentAttributeClassifications,
  resolvePersistedAttributeClassification
} from './equipment-attribute-classifications.js?v=3&sb=20260823-security-supabase-pin-1';

let scheduled = false;
let attributeSources = new Map();
const TAXONOMY_UI_VERSION = '7';

const BASE_LABELS = new Map([
  ['armor_drone_multiplier', 'Dano contra armadura e drones'],
  ['health_damage_multiplier', 'Dano contra vida'],
  ['aimed_dispersion', 'Dispersão com mira'],
  ['dispersion', 'Dispersão de tiro'],
  ['moving_dispersion', 'Dispersão em movimento'],
  ['reload_time', 'Tempo de recarga'],
  ['aim_time', 'Tempo de mira'],
  ['max_movement_speed', 'Velocidade de movimento'],
  ['aimed_movement_speed', 'Velocidade ao mirar'],
  ['vision_range', 'Alcance de visão'],
  ['aimed_range', 'Alcance com mira'],
  ['hip_fire_range', 'Alcance sem mira'],
  ['magazine_size', 'Capacidade de munição'],
  ['armor_penetration', 'Penetração de armadura'],
  ['penetration_power', 'Poder de perfuração'],
  ['damage_per_shot', 'Dano por tiro']
]);

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeName(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value = '') {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeAttributes(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => ({
        key: String(item?.label ?? item?.name ?? item?.raw ?? '').trim(),
        value: item?.value ?? ''
      }))
      .filter(item => item.key);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, attributeValue]) => ({ key, value: attributeValue }));
  }
  return [];
}

function sourceKey(equipmentName = '', rarity = '') {
  return `${normalizeName(equipmentName)}::${normalizeName(rarity)}`;
}

async function loadAttributeSources() {
  const [equipmentsResult, variantsResult, raritiesResult, legacyResult] = await Promise.all([
    supabase.from('equipments').select('id,name'),
    supabase.from('equipment_variants').select('equipment_id,rarity_id,attributes'),
    supabase.from('equipment_rarities').select('id,slug,name,rank'),
    supabase.from('equipment_rarity_levels').select('equipment_id,rarity_slug,rarity_name,stats')
  ]);

  const failures = [equipmentsResult, variantsResult, raritiesResult, legacyResult].filter(result => result.error);
  if (failures.length) {
    failures.forEach(result => console.warn('[build-attribute-source] Falha ao ler uma fonte de atributos.', result.error));
  }

  const equipmentNames = new Map((equipmentsResult.data || []).map(item => [item.id, item.name]));
  const rarities = new Map((raritiesResult.data || []).map(item => [item.id, item]));
  const next = new Map();

  const setSource = (equipmentId, rarityName, raritySlug, attributes) => {
    const equipmentName = equipmentNames.get(equipmentId);
    const normalized = normalizeAttributes(attributes);
    if (!equipmentName || !normalized.length) return;
    if (rarityName) next.set(sourceKey(equipmentName, rarityName), normalized);
    if (raritySlug) next.set(sourceKey(equipmentName, raritySlug), normalized);
  };

  // Compatibilidade: dados legados entram primeiro.
  for (const level of (legacyResult.data || [])) {
    setSource(level.equipment_id, level.rarity_name, level.rarity_slug, level.stats);
  }

  // A estrutura atual do editor tem prioridade sobre a legada.
  for (const variant of (variantsResult.data || [])) {
    const rarity = rarities.get(variant.rarity_id);
    if (!rarity) continue;
    setSource(variant.equipment_id, rarity.name, rarity.slug, variant.attributes);
  }

  attributeSources = next;
}

function resolveSpecial(raw = '') {
  const persisted = resolvePersistedAttributeClassification(raw);
  if (persisted?.classification === 'informational') {
    return {
      kind: 'informational',
      id: `persisted:${persisted.normalizedKey}`,
      label: persisted.label,
      reason: persisted.reason,
      publicNote: persisted.publicNote,
      confidence: 1,
      match: 'persisted'
    };
  }
  if (persisted?.classification === 'external_data_required') {
    return {
      kind: 'external',
      id: `persisted:${persisted.normalizedKey}`,
      label: persisted.label,
      reason: persisted.reason,
      missingData: persisted.missingData,
      publicNote: persisted.publicNote,
      confidence: 1,
      match: 'persisted'
    };
  }

  const direct = resolveExternalDataEffect(raw);
  if (direct) return { kind: 'external', ...direct };

  const wanted = compact(raw);
  if (!wanted) return null;
  for (const effect of EXTERNAL_DATA_EFFECTS) {
    if (effect.aliases.some(alias => compact(alias) === wanted)) {
      return { kind: 'external', ...effect, confidence: 1, match: 'compact' };
    }
  }
  return null;
}

function stripReason(value = '') {
  return String(value)
    .replace(/\s*\((?:base\s+[^)]+\s+ausente|sem\s+regra\s+oficial)\)\s*$/i, '')
    .trim();
}

function humanize(value = '') {
  const text = String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\bpct\b/gi, 'percentual')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 'Efeito';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function classify(entry = '') {
  const raw = stripReason(entry);
  const special = resolveSpecial(raw);
  if (special?.kind === 'informational') {
    return {
      kind: 'informational',
      label: special.label,
      detail: 'Este efeito descreve uma mecânica do equipamento e não altera os atributos numéricos desta build.'
    };
  }
  if (special?.kind === 'external') {
    return {
      kind: 'external',
      label: special.label,
      detail: `O efeito é válido, mas depende de ${special.missingData || 'dados-base'} ainda sem fonte oficial verificável.`
    };
  }

  const baseMatch = String(entry).match(/\(base\s+([^)]+?)\s+ausente\)\s*$/i);
  if (baseMatch) {
    const target = String(baseMatch[1] || '').trim().replace(/\s+/g, '_').toLowerCase();
    const label = BASE_LABELS.get(target) || humanize(raw);
    return {
      kind: 'missing-base',
      label,
      detail: `O efeito existe, porém falta o valor-base de ${BASE_LABELS.get(target) || humanize(target)} para este herói ou arma. Ele foi preservado sem estimativa.`
    };
  }

  return {
    kind: 'unknown',
    label: humanize(raw),
    detail: 'A regra ainda está em revisão e permanece fora do cálculo até existir uma correspondência segura.'
  };
}

function ensureStyles() {
  if (document.getElementById('build-unknown-taxonomy-style')) return;
  const style = document.createElement('style');
  style.id = 'build-unknown-taxonomy-style';
  style.textContent = `
    .impact-unknown.impact-taxonomy{
      display:grid!important;gap:11px;padding:13px 14px!important;
      border:1px solid rgba(148,163,184,.18)!important;border-radius:13px!important;
      background:linear-gradient(145deg,rgba(12,22,38,.96),rgba(8,15,28,.98))!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.025)!important;color:#dbe5f2!important
    }
    .impact-taxonomy-head{display:grid;grid-template-columns:32px minmax(0,1fr);gap:10px;align-items:center;min-width:0}
    .impact-taxonomy-icon{display:grid;width:32px;height:32px;place-items:center;border:1px solid rgba(125,211,252,.22);border-radius:10px;background:rgba(56,189,248,.065);color:#8edfff}
    .impact-taxonomy-icon svg{width:17px;height:17px}
    .impact-taxonomy-copy{min-width:0}
    .impact-taxonomy-copy>span{display:block;color:#73859d;font-size:9px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
    .impact-taxonomy-copy>b{display:block;margin-top:2px;color:#edf4fb;font-size:13px;line-height:1.25}
    .impact-taxonomy-chips{display:flex;flex-wrap:wrap;gap:5px;padding-left:42px}
    .impact-taxonomy-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border:1px solid rgba(148,163,184,.14);border-radius:999px;color:#8899ae;background:rgba(148,163,184,.035);font-size:9px;font-weight:800;letter-spacing:.025em}
    .impact-taxonomy-chip:before{content:'';width:5px;height:5px;border-radius:50%;background:currentColor;box-shadow:0 0 7px currentColor}
    .impact-taxonomy-chip.external{color:#d9b45f}.impact-taxonomy-chip.informational{color:#83bdf3}.impact-taxonomy-chip.missing-base{color:#8bbaf0}.impact-taxonomy-chip.unknown{color:#e58a99}
    .impact-taxonomy-disclosure{border-top:1px solid rgba(148,163,184,.12);padding-top:2px}
    .impact-taxonomy-disclosure>summary{display:flex;min-height:36px;align-items:center;gap:8px;padding:5px 1px;cursor:pointer;list-style:none;color:#9fb0c4;font-size:10px;font-weight:850;letter-spacing:.035em}
    .impact-taxonomy-disclosure>summary::-webkit-details-marker,.impact-taxonomy-item>summary::-webkit-details-marker{display:none}
    .impact-unknown .impact-taxonomy-label-open{display:none}
    .impact-taxonomy-disclosure[open] .impact-taxonomy-label-closed{display:none}
    .impact-taxonomy-disclosure[open] .impact-taxonomy-label-open{display:inline}
    .impact-taxonomy-chevron{width:14px;height:14px;color:#667890;transition:transform .18s ease}
    .impact-taxonomy-disclosure[open]>summary .impact-taxonomy-chevron,.impact-taxonomy-item[open]>summary .impact-taxonomy-chevron{transform:rotate(180deg)}
    .impact-taxonomy-list{display:grid;border-top:1px solid rgba(148,163,184,.10)}
    .impact-taxonomy-item{border-bottom:1px solid rgba(148,163,184,.10)}
    .impact-taxonomy-item:last-child{border-bottom:0}
    .impact-taxonomy-item>summary{display:grid;grid-template-columns:6px minmax(0,1fr) auto 14px;gap:8px;align-items:center;min-height:40px;padding:5px 1px;cursor:pointer;list-style:none}
    .impact-taxonomy-dot{width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor}
    .impact-taxonomy-item strong{min-width:0;color:#d8e2ee;font-size:11px;font-weight:750;line-height:1.25}
    .impact-taxonomy-item small{color:#718198;font-size:8.5px;font-weight:850;letter-spacing:.035em;text-transform:uppercase;white-space:nowrap}
    .impact-taxonomy-item p{max-width:690px;margin:0 22px 10px 14px;color:#8292a7;font-size:10px;line-height:1.5}
    .impact-taxonomy-item.external{color:#d9b45f}.impact-taxonomy-item.informational{color:#83bdf3}.impact-taxonomy-item.missing-base{color:#8bbaf0}.impact-taxonomy-item.unknown{color:#e58a99}
    .impact-taxonomy-item>summary:focus-visible,.impact-taxonomy-disclosure>summary:focus-visible{outline:2px solid #65e8ff;outline-offset:2px;border-radius:7px}
    #equipment-detail .stat.attribute-source-special{border-color:rgba(148,163,184,.28)}
    #equipment-detail .stat.attribute-source-external{border-color:rgba(251,191,36,.4);background:rgba(120,83,8,.08)}
    #equipment-detail .stat.attribute-source-informational{border-color:rgba(96,165,250,.38);background:rgba(30,64,175,.08)}
    .attribute-source-note{display:grid;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(148,163,184,.14);color:#94a3b8;font-size:8px;line-height:1.5}
    .attribute-source-badge{display:inline-flex;width:max-content;padding:3px 6px;border:1px solid currentColor;border-radius:999px;font-size:7px;font-weight:900;letter-spacing:.04em;text-transform:uppercase}
    .attribute-source-badge.external{color:#fde68a}.attribute-source-badge.informational{color:#bfdbfe}
    .attribute-source-note b{color:inherit}
    @media(max-width:560px){
      .impact-unknown.impact-taxonomy{gap:8px;padding:10px 11px!important;border-radius:12px!important}
      .impact-taxonomy-head{grid-template-columns:28px minmax(0,1fr);gap:8px}
      .impact-taxonomy-icon{width:28px;height:28px;border-radius:9px}
      .impact-taxonomy-copy>span{font-size:8px;letter-spacing:.08em}
      .impact-taxonomy-copy>b{margin-top:1px;font-size:12.5px}
      .impact-taxonomy-chips{padding-left:36px;flex-wrap:nowrap;overflow-x:auto;padding-bottom:1px;scrollbar-width:none;overscroll-behavior-inline:contain}
      .impact-taxonomy-chips::-webkit-scrollbar{display:none}
      .impact-taxonomy-chip{flex:0 0 auto;padding:3px 6px;font-size:8.5px}
      .impact-taxonomy-disclosure>summary{min-height:32px;padding:3px 1px}
      .impact-taxonomy-item>summary{grid-template-columns:5px minmax(0,1fr) auto 13px;gap:7px;min-height:39px}
      .impact-taxonomy-item strong{font-size:11px}.impact-taxonomy-item small{font-size:8px}
      .impact-taxonomy-item p{margin:0 18px 9px 12px;font-size:9.5px}
    }
  `;
  document.head.appendChild(style);
}

function badge(kind) {
  if (kind === 'external') return 'Aguardando fonte';
  if (kind === 'informational') return 'Informativo';
  if (kind === 'missing-base') return 'Sem dado-base';
  return 'Em revisão';
}

function statusChips(rows = []) {
  const order = ['missing-base', 'external', 'informational', 'unknown'];
  const counts = rows.reduce((result, row) => {
    result[row.kind] = (result[row.kind] || 0) + 1;
    return result;
  }, {});
  return order.filter(kind => counts[kind]).map(kind =>
    `<span class="impact-taxonomy-chip ${kind}">${counts[kind]} ${escapeHtml(badge(kind).toLowerCase())}</span>`
  ).join('');
}

function chevron() {
  return '<svg class="impact-taxonomy-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
}

function processBanner(banner) {
  if (!(banner instanceof HTMLElement)) return;
  if (banner.dataset.taxonomyProcessed === TAXONOMY_UI_VERSION) return;

  const source = banner.dataset.rawEffects || banner.querySelector('span')?.textContent?.trim() || '';
  if (!source) return;
  banner.dataset.rawEffects = source;

  const entries = source.split(/,\s+(?=[^,])/).map(item => item.trim()).filter(Boolean);
  if (!entries.length) return;

  const rows = entries.map(classify);
  banner.dataset.taxonomyProcessed = TAXONOMY_UI_VERSION;
  banner.classList.add('impact-taxonomy');
  banner.innerHTML = `
    <div class="impact-taxonomy-head">
      <span class="impact-taxonomy-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 8.5v4M12 16h.01"/><circle cx="12" cy="12" r="8.5"/></svg></span>
      <div class="impact-taxonomy-copy"><span>Cobertura da análise</span><b>${rows.length} ${rows.length === 1 ? 'efeito' : 'efeitos'}</b></div>
    </div>
    <div class="impact-taxonomy-chips" aria-label="Resumo dos motivos">${statusChips(rows)}</div>
    <details class="impact-taxonomy-disclosure">
      <summary aria-label="Exibir ou ocultar efeitos não calculados"><span class="impact-taxonomy-label-closed">Ver detalhes</span><span class="impact-taxonomy-label-open">Ocultar detalhes</span>${chevron()}</summary>
      <div class="impact-taxonomy-list">${rows.map(row => `
        <details class="impact-taxonomy-item ${row.kind}">
          <summary><i class="impact-taxonomy-dot" aria-hidden="true"></i><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(badge(row.kind))}</small>${chevron()}</summary>
          <p>${escapeHtml(row.detail)}</p>
        </details>`).join('')}</div>
    </details>`;
}

function clearSpecialDecoration(card) {
  card.classList.remove('attribute-source-special', 'attribute-source-external', 'attribute-source-informational');
  card.querySelector('.attribute-source-note')?.remove();
  delete card.dataset.attributePresentationSource;
}

function decorateSpecialStat(card, attribute, special) {
  const rawKey = attribute?.key || '';
  const signature = `${rawKey}|${special.kind}|${special.id || special.label}`;
  if (card.dataset.attributeSourceSignature === signature) return;

  card.dataset.attributeSourceSignature = signature;
  card.dataset.attributeSourceKey = rawKey;
  card.dataset.attributePresentationSource = special.kind === 'external' ? 'external_data_required' : 'informational';
  card.classList.add('attribute-source-special');
  card.classList.toggle('attribute-source-external', special.kind === 'external');
  card.classList.toggle('attribute-source-informational', special.kind === 'informational');

  const label = card.querySelector('.stat-label');
  const description = card.querySelector('.stat-desc');
  if (label) label.textContent = special.label || humanize(rawKey);
  if (description) {
    description.textContent = special.kind === 'external'
      ? 'Efeito real do equipamento. Aguardando dado oficial para cálculo.'
      : 'Efeito informativo do equipamento. Não participa do cálculo.';
  }

  let note = card.querySelector('.attribute-source-note');
  if (!note) {
    note = document.createElement('div');
    note.className = 'attribute-source-note';
    card.appendChild(note);
  }

  if (special.kind === 'external') {
    note.innerHTML = `
      <span class="attribute-source-badge external">Aguardando dado oficial · não é erro</span>
      <span>${escapeHtml(special.reason || special.publicNote || 'O efeito é real, mas a base necessária ainda não está disponível.')}</span>
      <span><b>O que falta:</b> ${escapeHtml(special.missingData || 'dados-base oficiais suficientes para calcular o resultado final.')}</span>`;
  } else {
    note.innerHTML = `
      <span class="attribute-source-badge informational">Efeito informativo · não é erro</span>
      <span>${escapeHtml(special.publicNote || special.reason || 'Este efeito é exibido como informação e não altera diretamente os atributos numéricos calculados.')}</span>`;
  }
}

function decorateEquipmentDetail() {
  const detail = document.getElementById('equipment-detail');
  if (!detail || !attributeSources.size) return;

  const equipmentName = detail.querySelector('.d-name')?.textContent?.trim() || '';
  const rarityName = detail.querySelector('.sec-title .sub')?.textContent?.trim() || '';
  if (!equipmentName || !rarityName) return;

  const attributes = attributeSources.get(sourceKey(equipmentName, rarityName));
  if (!attributes) return; // Sem correspondência exata: não adivinha outra variante.

  const cards = [...detail.querySelectorAll('.stats .stat')];
  cards.forEach((card, index) => {
    const attribute = attributes[index];
    if (!attribute?.key) return;
    card.dataset.attributeSourceKey = attribute.key;
    const special = resolveSpecial(attribute.key);
    if (special) decorateSpecialStat(card, attribute, special);
    else if (card.dataset.attributePresentationSource) clearSpecialDecoration(card);
  });
}

function refresh() {
  scheduled = false;
  document.querySelectorAll('.impact-unknown').forEach(processBanner);
  decorateEquipmentDetail();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(refresh);
}

ensureStyles();
await Promise.all([
  refreshEquipmentAttributeClassifications(),
  loadAttributeSources()
]);
schedule();
new MutationObserver(schedule).observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true
});
