import {
  classifyDraftVariants
} from './equipment-audit-queue.js?v=8&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1';
import {
  humanizeAttributeKey,
  resolveEquipmentRule,
  targetLabel
} from '../../js/equipment-audit-rules.js?v=2';
import { resolveExternalDataEffect } from '../../js/equipment-data-limits.js?v=2';
import { resolvePersistedAttributeClassification } from '../../js/equipment-attribute-classifications.js?v=3&sb=20260823-security-supabase-pin-1';

const jsonArea = document.getElementById('equipment-ai-json');
const validateButton = document.getElementById('equipment-ai-validate');
const warningsHost = document.getElementById('review-warnings');

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function resolveSpecial(rawLabel = '') {
  const persisted = resolvePersistedAttributeClassification(rawLabel);
  if (persisted?.classification === 'informational') {
    return {
      kind: 'informational',
      label: persisted.label,
      publicNote: persisted.publicNote || persisted.reason || 'Efeito informativo registrado pela equipe.'
    };
  }
  if (persisted?.classification === 'external_data_required') {
    return {
      kind: 'external',
      label: persisted.label,
      publicNote: persisted.publicNote || persisted.reason || 'A base necessária ainda não está disponível.'
    };
  }
  const external = resolveExternalDataEffect(rawLabel);
  return external ? { kind: 'external', ...external } : null;
}

function extractJson(value = '') {
  const text = String(value || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first < 0 || last < first) throw new Error('JSON não encontrado.');
  return JSON.parse(candidate.slice(first, last + 1));
}

function humanizeKey(value = '') {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAttribute(attribute, fallbackKey = '') {
  if (attribute && typeof attribute === 'object' && !Array.isArray(attribute)) {
    const label = String(attribute.label ?? attribute.name ?? attribute.raw ?? fallbackKey ?? '').trim();
    if (!label) return null;
    return { ...attribute, label, value: attribute.value ?? '' };
  }
  if (!fallbackKey) return null;
  return { label: humanizeKey(fallbackKey), value: attribute };
}

function normalizeRarityAttributes(source) {
  if (Array.isArray(source)) return source.map(item => normalizeAttribute(item)).filter(Boolean);
  if (!source || typeof source !== 'object') return [];
  return Object.entries(source).map(([key, value]) => normalizeAttribute(value, key)).filter(Boolean);
}

function draftFromSource(source = {}) {
  const equipment = source.equipment && typeof source.equipment === 'object'
    ? source.equipment
    : source.equipamento && typeof source.equipamento === 'object'
      ? source.equipamento
      : source;

  const variantsSource = source.variants && typeof source.variants === 'object'
    ? source.variants
    : equipment.efeitosPorCategoria && typeof equipment.efeitosPorCategoria === 'object'
      ? equipment.efeitosPorCategoria
      : equipment.raridades && typeof equipment.raridades === 'object'
        ? equipment.raridades
        : source.efeitosPorCategoria && typeof source.efeitosPorCategoria === 'object'
          ? source.efeitosPorCategoria
          : source.raridades && typeof source.raridades === 'object'
            ? source.raridades
            : {};

  const variants = {};
  for (const [slug, attributes] of Object.entries(variantsSource || {})) {
    variants[slug] = normalizeRarityAttributes(attributes);
  }

  return {
    name: String(equipment.name ?? equipment.nome ?? source.name ?? source.nome ?? '').trim(),
    variants
  };
}

function ensureStyle() {
  if (document.getElementById('equipment-json-classifier-style')) return;
  const style = document.createElement('style');
  style.id = 'equipment-json-classifier-style';
  style.textContent = `
    .json-classification{margin-top:10px;padding:12px;border:1px solid #30415e;border-radius:10px;background:#081321}.json-classification h3{margin:0;color:#f8fafc;font-size:12px}.json-classification p{margin:5px 0 0;color:#94a3b8;font-size:10px;line-height:1.5}.json-classification-summary{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.json-classification-pill{padding:5px 7px;border-radius:999px;border:1px solid #31425d;font-size:8px;font-weight:900}.json-classification-pill.ok{color:#86efac;border-color:#225d49}.json-classification-pill.info{color:#bae6fd;border-color:#164e63}.json-classification-pill.informational{color:#bfdbfe;border-color:#315a8b;background:rgba(30,64,175,.08)}.json-classification-pill.warn{color:#fde68a;border-color:#76591c;background:rgba(120,83,8,.08)}.json-classification-pill.bad{color:#fecdd3;border-color:#7f1d1d}.json-classification-list{display:grid;gap:6px;margin-top:9px}.json-classification-item{padding:8px 9px;border:1px solid #26344d;border-radius:8px;background:#07101d;font-size:9px}.json-classification-item strong{display:block;color:#f8fafc}.json-classification-item span{display:block;margin-top:3px;color:#94a3b8;line-height:1.45}.json-classification-item.bad{border-color:#7f1d1d}.json-classification-item.warn{border-color:#76591c;background:rgba(120,83,8,.08)}.json-classification-item.warn strong{color:#fde68a}.json-classification-item.informational{border-color:#315a8b;background:rgba(30,64,175,.08)}.json-classification-item.informational strong{color:#bfdbfe}.json-classification-note{margin-top:9px;padding:8px 9px;border:1px solid #76591c;border-radius:8px;background:rgba(120,83,8,.12);color:#fde68a;font-size:9px;line-height:1.5}.json-classification-note.info{border-color:#315a8b;background:rgba(30,64,175,.1);color:#bfdbfe}.json-audit-after-save,.json-audit-success{margin-top:10px;padding:11px 12px;border:1px solid #7f1d1d;border-radius:10px;background:rgba(127,29,29,.13);color:#fecdd3;font-size:10px;line-height:1.5;text-align:left}.json-audit-after-save strong,.json-audit-success strong{display:block;color:#fff}.json-audit-after-save a,.json-audit-success a{display:inline-flex;margin-top:8px;color:#fff}.json-audit-after-save.setup,.json-audit-success.setup{border-color:#76591c;background:rgba(120,83,8,.12);color:#fde68a}
  `;
  document.head.appendChild(style);
}

function renderClassification(draft) {
  if (!warningsHost) return;
  const result = classifyDraftVariants(draft.variants, {
    equipmentName: draft.name,
    source: 'json-import'
  });

  const detailRows = [];
  for (const [raritySlug, attributes] of Object.entries(draft.variants || {})) {
    for (const attribute of attributes || []) {
      const special = resolveSpecial(attribute.label);
      if (special?.kind === 'informational') {
        detailRows.push({
          type: 'informational',
          title: `${special.label} · ${raritySlug}`,
          text: `Efeito informativo — sem cálculo. ${special.publicNote} O dado será preservado para exibição e não será tratado como erro mesmo que o valor seja textual.`
        });
        continue;
      }

      const rule = resolveEquipmentRule(attribute.label);
      const rawValue = String(attribute.value ?? '').trim();
      const invalid = !rawValue || !Number.isFinite(Number(rawValue.replace(',', '.')));
      if (invalid) {
        detailRows.push({
          type: 'bad',
          title: `${special?.label || humanizeAttributeKey(attribute.label)} · ${raritySlug}`,
          text: `Valor “${attribute.value}” não é numérico. O equipamento poderá ser salvo, mas ficará destacado na Auditoria até a correção ou classificação adequada.`
        });
      } else if (special?.kind === 'external') {
        detailRows.push({
          type: 'warn',
          title: `${special.label} · ${raritySlug}`,
          text: `Aguardando dado oficial — não é erro de cadastro. ${special.publicNote} O valor será preservado e exibido, mas não será usado para inventar um resultado final.`
        });
      } else {
        detailRows.push({
          type: 'warn',
          title: `${attribute.label} · ${raritySlug}`,
          text: 'Vínculo pendente. Após salvar, escolha na Central o status de destino, a operação e a condição. O nome do efeito não autoriza o cálculo.'
        });
      }
    }
  }

  document.getElementById('json-classification-result')?.remove();

  const box = document.createElement('section');
  box.id = 'json-classification-result';
  box.className = 'json-classification';
  box.innerHTML = `
    <h3>Conferência dos efeitos importados</h3>
    <p>O texto original será preservado. Importar um efeito não cria um vínculo de cálculo.</p>
    <div class="json-classification-summary">

      <span class="json-classification-pill warn">${detailRows.filter(r => r.type === 'warn').length} para conferir na Central</span>
      <span class="json-classification-pill warn">${result.awaitingOfficial || 0} aguardando dados oficiais</span>
      <span class="json-classification-pill informational">${result.informationalEffects || 0} informativo(s)</span>
      <span class="json-classification-pill bad">${result.blocking} correção(ões) necessária(s)</span>
    </div>
    ${detailRows.length ? `<div class="json-classification-list">${detailRows.map(row => `
      <div class="json-classification-item ${row.type}"><strong>${escapeHtml(row.title)}</strong><span>${escapeHtml(row.text)}</span></div>`).join('')}</div>` : ''}
    ${result.blocking ? '<div class="json-classification-note"><b>Padrão do sistema:</b> erros de cadastro não impedem o salvamento. Depois do salvamento, o equipamento entra automaticamente na fila da Auditoria e permanece destacado até ser corrigido ou classificado.</div>' : ''}
    ${result.awaitingOfficial ? '<div class="json-classification-note"><b>Dados oficiais pendentes:</b> estes efeitos são conhecidos e não contam como erro. Eles permanecem documentados, visíveis no site e fora do cálculo até existir uma base oficial confiável.</div>' : ''}
    ${result.informationalEffects ? '<div class="json-classification-note info"><b>Efeitos informativos:</b> são mecânicas reais usadas apenas para exibição. Não entram no motor e não geram pendência de correção.</div>' : ''}
  `;
  warningsHost.prepend(box);
}

function auditNoticeHtml(detail = {}) {
  const issues = Array.isArray(detail.issues) ? detail.issues : [];
  const corrections = issues.filter(issue => issue.issue_type !== 'external_data_required');
  const external = issues.filter(issue => issue.issue_type === 'external_data_required');

  if (detail.installed) {
    const parts = [];
    if (corrections.length) parts.push(`${corrections.length} correção(ões) necessária(s)`);
    if (external.length) parts.push(`${external.length} efeito(s) aguardando dados oficiais`);
    return `<strong>Cadastro concluído${parts.length ? ` com ${parts.join(' e ')}` : ''}.</strong><span>O equipamento foi salvo normalmente. Correções ficam em “Aguardando correção”; efeitos dependentes de dados do jogo ficam separados como “Aguardando dados oficiais” e não são tratados como falha do cadastro.</span><a class="eq-btn" href="./equipment-audit.html">Abrir Auditoria</a>`;
  }
  return '<strong>Cadastro salvo, mas a fila persistente da Auditoria ainda não está ativa no banco.</strong><span>A migração da tabela <code>equipment_audit_queue</code> precisa ser aplicada para manter o destaque entre sessões.</span>';
}

function showAuditAfterSave(detail = {}) {
  if (detail.source !== 'json-import' || !warningsHost) return;
  const issues = Array.isArray(detail.issues) ? detail.issues : [];
  if (detail.installed && !issues.length) return;

  document.getElementById('json-audit-after-save')?.remove();
  const node = document.createElement('div');
  node.id = 'json-audit-after-save';
  node.className = `json-audit-after-save${detail.installed ? '' : ' setup'}`;
  node.innerHTML = auditNoticeHtml(detail);
  warningsHost.prepend(node);

  window.setTimeout(() => {
    const successBody = document.querySelector('.equipment-flow-card.success .equipment-flow-body');
    if (!successBody || successBody.querySelector('.json-audit-success')) return;
    const successNotice = document.createElement('div');
    successNotice.className = `json-audit-success${detail.installed ? '' : ' setup'}`;
    successNotice.innerHTML = auditNoticeHtml(detail);
    const foot = successBody.querySelector('.equipment-flow-foot');
    if (foot) successBody.insertBefore(successNotice, foot);
    else successBody.appendChild(successNotice);
  }, 0);
}

ensureStyle();

validateButton?.addEventListener('click', () => {
  window.setTimeout(() => {
    try {
      const source = extractJson(jsonArea?.value || '');
      renderClassification(draftFromSource(source));
    } catch {
      document.getElementById('json-classification-result')?.remove();
    }
  }, 0);
});

jsonArea?.addEventListener('input', () => {
  document.getElementById('json-classification-result')?.remove();
});

window.addEventListener('equipment:audit-sync', event => showAuditAfterSave(event.detail));
