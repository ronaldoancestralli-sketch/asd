import {
  loadPendingEquipmentAuditQueue,
  syncEquipmentAuditQueueFromDatabase
} from './equipment-audit-queue.js?v=7&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1';
import {
  normalizeClassificationKey,
  saveExternalDataClassification,
  reopenAttributeClassification
} from '../../js/equipment-attribute-classifications.js?v=2&sb=20260823-security-supabase-pin-1';
import { showAdminDecisionModal } from './admin-decision-modal.js?v=1';

let latestRows = [];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function ensureStyles() {
  if (document.getElementById('audit-queue-ui-style')) return;
  const style = document.createElement('style');
  style.id = 'audit-queue-ui-style';
  style.textContent = `
    .audit-queue-highlight{margin:0 0 14px;border:1px solid rgba(251,113,133,.42);border-radius:14px;background:linear-gradient(180deg,rgba(127,29,29,.14),rgba(7,16,29,.92));overflow:hidden}.audit-queue-highlight.external{border-color:rgba(251,191,36,.38);background:linear-gradient(180deg,rgba(120,83,8,.12),rgba(7,16,29,.92))}.audit-queue-highlight-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:14px;border-bottom:1px solid rgba(251,113,133,.18)}.audit-queue-highlight.external .audit-queue-highlight-head{border-bottom-color:rgba(251,191,36,.18)}.audit-queue-highlight-head h3{margin:0;color:#fecdd3;font-size:14px}.audit-queue-highlight.external .audit-queue-highlight-head h3{color:#fde68a}.audit-queue-highlight-head p{margin:5px 0 0;color:#aeb9c9;font-size:9.5px;line-height:1.5}.audit-queue-count{flex:0 0 auto;padding:5px 8px;border:1px solid #7f1d1d;border-radius:999px;color:#fecdd3;font-size:8px;font-weight:900}.audit-queue-highlight.external .audit-queue-count{border-color:#76591c;color:#fde68a}.audit-queue-list{display:grid;gap:8px;padding:10px}.audit-queue-equipment{padding:11px;border:1px solid #3b2634;border-radius:10px;background:#08111f}.audit-queue-highlight.external .audit-queue-equipment{border-color:#4f421d}.audit-queue-equipment-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.audit-queue-equipment strong{color:#f8fafc;font-size:11px}.audit-queue-equipment small{display:block;margin-top:3px;color:#8795aa;font-size:8px}.audit-queue-issues{display:grid;gap:5px;margin-top:8px}.audit-queue-issue{padding:8px 9px;border:1px solid #26344d;border-radius:8px;background:#07101d;color:#aeb9c9;font-size:8.5px;line-height:1.45}.audit-queue-issue b{color:#fecdd3}.audit-queue-highlight.external .audit-queue-issue b{color:#fde68a}.audit-queue-issue small{display:block;margin-top:3px;color:#718096}.audit-queue-equipment .admin-button{margin-top:9px;width:100%;justify-content:center}.audit-queue-setup{margin:0 0 14px;padding:11px 12px;border:1px solid #76591c;border-radius:10px;background:rgba(120,83,8,.1);color:#fde68a;font-size:9px;line-height:1.5}.audit-status.external{color:#fde68a!important;border-color:#76591c!important;background:rgba(120,83,8,.12)!important}.audit-rule-action{margin-top:7px!important;width:auto!important;padding:7px 9px!important;font-size:8px!important;border-color:#76591c!important;color:#fde68a!important;background:rgba(120,83,8,.08)!important}.audit-rule-action.reopen{border-color:#3b82f6!important;color:#bfdbfe!important;background:rgba(30,64,175,.08)!important}.audit-classify-modal{position:fixed;inset:0;z-index:9999;display:none;place-items:center;padding:18px;background:rgba(2,6,15,.78);backdrop-filter:blur(6px)}.audit-classify-modal.open{display:grid}.audit-classify-card{width:min(620px,100%);max-height:90vh;overflow:auto;border:1px solid #76591c;border-radius:16px;background:#0a1322;box-shadow:0 24px 70px rgba(0,0,0,.55);padding:16px}.audit-classify-card h3{margin:0;color:#fde68a;font-size:15px}.audit-classify-card>p{margin:6px 0 14px;color:#aeb9c9;font-size:9px;line-height:1.5}.audit-classify-fields{display:grid;gap:10px}.audit-classify-field{display:grid;gap:5px}.audit-classify-field span{color:#d8dfeb;font-size:8px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}.audit-classify-field input,.audit-classify-field textarea{width:100%;box-sizing:border-box;border:1px solid #2b3951;border-radius:9px;background:#07101d;color:#f8fafc;padding:10px;font:inherit;font-size:10px}.audit-classify-field textarea{min-height:70px;resize:vertical}.audit-classify-help{padding:9px;border:1px solid rgba(118,89,28,.45);border-radius:9px;background:rgba(120,83,8,.08);color:#c8bc8e;font-size:8.5px;line-height:1.5}.audit-classify-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.audit-classify-error{margin-top:9px;color:#fda4af;font-size:9px;line-height:1.4}
    @media(max-width:700px){.audit-queue-highlight-head,.audit-queue-equipment-head{display:grid;grid-template-columns:1fr}.audit-queue-count{justify-self:start}.audit-classify-actions{display:grid;grid-template-columns:1fr}.audit-classify-actions .admin-button{width:100%;justify-content:center}}
  `;
  document.head.appendChild(style);
}

function ensureClassificationModal() {
  let modal = document.getElementById('audit-classify-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'audit-classify-modal';
  modal.className = 'audit-classify-modal';
  modal.innerHTML = `
    <section class="audit-classify-card" role="dialog" aria-modal="true" aria-labelledby="audit-classify-title">
      <h3 id="audit-classify-title">Marcar como aguardando dado oficial</h3>
      <p>Use somente quando o efeito for real e o cadastro estiver correto, mas o jogo não disponibilizar a base necessária para um cálculo confiável.</p>
      <div class="audit-classify-help"><b>Importante:</b> isso não cria fórmula, não estima valor-base e não apaga o atributo. A classificação ficará salva no banco e será respeitada pela Auditoria, importação JSON e site.</div>
      <div class="audit-classify-fields">
        <label class="audit-classify-field"><span>Nome exibido</span><input id="audit-classify-label"></label>
        <label class="audit-classify-field"><span>Por que não pode ser calculado?</span><textarea id="audit-classify-reason"></textarea></label>
        <label class="audit-classify-field"><span>Qual dado oficial está faltando?</span><textarea id="audit-classify-missing"></textarea></label>
        <label class="audit-classify-field"><span>Explicação pública</span><textarea id="audit-classify-public"></textarea></label>
      </div>
      <div id="audit-classify-error" class="audit-classify-error"></div>
      <div class="audit-classify-actions"><button class="admin-button" type="button" id="audit-classify-cancel">Cancelar</button><button class="admin-button audit-primary" type="button" id="audit-classify-save">Salvar classificação</button></div>
    </section>`;
  document.body.appendChild(modal);
  modal.querySelector('#audit-classify-cancel').onclick = () => modal.classList.remove('open');
  modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('open'); });
  return modal;
}

function groupIssueRules(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.issue_type}|${row.normalized_key || row.attribute_key || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  return [...groups.values()].map(occurrences => ({
    issueType: occurrences[0]?.issue_type,
    attributeKey: occurrences[0]?.details?.human_label || occurrences[0]?.attribute_key || 'Atributo',
    rawAttributeKey: occurrences[0]?.attribute_key || '',
    normalizedKey: occurrences[0]?.normalized_key || '',
    persistedClassification: Boolean(occurrences[0]?.details?.persisted_classification),
    occurrences,
    rarityNames: [...new Set(occurrences.map(row => row.rarity_name || row.rarity_slug).filter(Boolean))]
  }));
}

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const id = String(row.equipment_id);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return [...groups.entries()].map(([equipmentId, issues]) => ({
    equipmentId,
    equipmentName: issues[0]?.equipment_name || 'Equipamento',
    issues,
    rules: groupIssueRules(issues)
  }));
}

function issueText(rule) {
  const rarityText = rule.rarityNames.length
    ? `${rule.rarityNames.length} raridade(s): ${rule.rarityNames.join(', ')}`
    : `${rule.occurrences.length} ocorrência(s)`;

  if (rule.issueType === 'invalid_value') {
    const values = [...new Set(rule.occurrences.map(row => row.attribute_value).filter(value => value !== null && value !== undefined))];
    return `<b>Valor inválido:</b> ${escapeHtml(rule.attributeKey)}<small>${escapeHtml(rarityText)}${values.length ? ` · valores encontrados: ${escapeHtml(values.join(', '))}` : ''}</small>`;
  }

  if (rule.issueType === 'external_data_required') {
    const sample = rule.occurrences[0] || {};
    const missing = sample.details?.missing_data || 'Valor-base oficial necessário para o cálculo.';
    return `<b>Efeito conhecido:</b> ${escapeHtml(rule.attributeKey)}<small>${escapeHtml(rarityText)} · não é erro de cadastro e não exige correção agora.</small><small><b>O que falta:</b> ${escapeHtml(missing)}</small>${rule.persistedClassification ? `<button type="button" class="admin-button audit-rule-action reopen" data-reopen-external="${escapeHtml(rule.rawAttributeKey)}">Dado oficial encontrado / reabrir revisão</button>` : ''}`;
  }

  return `<b>Sem regra de cálculo:</b> ${escapeHtml(rule.attributeKey)}<small>${escapeHtml(rarityText)} · o equipamento permanece salvo, mas este efeito não entra no cálculo até uma decisão.</small><button type="button" class="admin-button audit-rule-action" data-mark-external="${escapeHtml(rule.rawAttributeKey)}">É efeito real, mas falta dado oficial</button>`;
}

function renderGroupBlock({ id, title, description, groups, external = false }) {
  if (!groups.length) return null;
  const block = document.createElement('section');
  block.id = id;
  block.className = `audit-queue-highlight${external ? ' external' : ''}`;
  block.innerHTML = `
    <div class="audit-queue-highlight-head">
      <div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>
      <span class="audit-queue-count">${groups.length} equipamento(s)</span>
    </div>
    <div class="audit-queue-list">${groups.map(group => `
      <article class="audit-queue-equipment">
        <div class="audit-queue-equipment-head"><div><strong>${escapeHtml(group.equipmentName)}</strong><small>${group.rules.length} regra(s) · ${group.issues.length} ocorrência(s)</small></div><span class="audit-status ${external ? 'external' : 'bad'}">${external ? 'Aguardando dado oficial' : 'Aguardando correção'}</span></div>
        <div class="audit-queue-issues">${group.rules.map(rule => `<div class="audit-queue-issue">${issueText(rule)}</div>`).join('')}</div>
        <a class="admin-button" href="./equipment-editor.html?id=${encodeURIComponent(group.equipmentId)}&tab=rarities">${external ? 'Ver equipamento' : 'Abrir e corrigir equipamento'}</a>
      </article>`).join('')}</div>`;
  return block;
}

async function resyncAffected(rawAttributeKey, issueTypes = []) {
  const wanted = normalizeClassificationKey(rawAttributeKey);
  const affected = new Map();
  for (const row of latestRows) {
    if (issueTypes.length && !issueTypes.includes(row.issue_type)) continue;
    if (normalizeClassificationKey(row.attribute_key) !== wanted) continue;
    affected.set(String(row.equipment_id), row.equipment_name || 'Equipamento');
  }
  for (const [equipmentId, equipmentName] of affected) {
    await syncEquipmentAuditQueueFromDatabase(equipmentId, equipmentName, 'audit-classification');
  }
}

async function openExternalClassification(rawAttributeKey) {
  const modal = ensureClassificationModal();
  const label = String(rawAttributeKey || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\bpercentual\b/i, '').replace(/\s+/g, ' ').trim();
  modal.dataset.rawAttributeKey = rawAttributeKey;
  modal.querySelector('#audit-classify-label').value = label || rawAttributeKey;
  modal.querySelector('#audit-classify-reason').value = 'O efeito é real, mas o jogo não disponibiliza publicamente a base necessária para calcular o resultado final com segurança.';
  modal.querySelector('#audit-classify-missing').value = 'Valor-base oficial e regra exata de aplicação deste efeito.';
  modal.querySelector('#audit-classify-public').value = 'Este efeito existe no equipamento, porém o jogo não disponibiliza os dados-base necessários para calcular seu impacto final com segurança.';
  modal.querySelector('#audit-classify-error').textContent = '';
  modal.classList.add('open');

  modal.querySelector('#audit-classify-save').onclick = async () => {
    const saveButton = modal.querySelector('#audit-classify-save');
    const errorNode = modal.querySelector('#audit-classify-error');
    saveButton.disabled = true;
    errorNode.textContent = '';
    try {
      await saveExternalDataClassification({
        rawLabel: rawAttributeKey,
        displayLabel: modal.querySelector('#audit-classify-label').value,
        reason: modal.querySelector('#audit-classify-reason').value,
        missingData: modal.querySelector('#audit-classify-missing').value,
        publicNote: modal.querySelector('#audit-classify-public').value
      });
      await resyncAffected(rawAttributeKey, ['unknown_attribute']);
      modal.classList.remove('open');
      await renderQueue();
    } catch (error) {
      errorNode.textContent = `Não foi possível salvar a classificação: ${error?.message || error}`;
    } finally {
      saveButton.disabled = false;
    }
  };
}

async function reopenExternalClassification(rawAttributeKey) {
  const confirmed = await showAdminDecisionModal({
    kicker: 'REABRIR PARA REVISÃO',
    title: 'O dado oficial já está disponível?',
    message: 'Esta ação remove o estado “Aguardando dado oficial” e devolve a mecânica para revisão de cálculo.',
    detail: 'Ela não cria uma fórmula automaticamente. Depois de reabrir, a equipe deve cadastrar a base real e a regra correta antes de considerar o efeito calculável.',
    confirmLabel: 'Reabrir para revisão',
    cancelLabel: 'Manter aguardando'
  });
  if (!confirmed) return;

  await reopenAttributeClassification(rawAttributeKey);
  await resyncAffected(rawAttributeKey, ['external_data_required']);
  await renderQueue();
}

async function renderQueue() {
  ensureStyles();
  const pendingPanel = document.getElementById('pending-panel');
  const pendingResults = document.getElementById('pending-results');
  if (!pendingPanel || !pendingResults) return;

  document.getElementById('audit-queue-highlight')?.remove();
  document.getElementById('audit-queue-external')?.remove();
  document.getElementById('audit-queue-setup')?.remove();

  let result;
  try {
    result = await loadPendingEquipmentAuditQueue();
  } catch (error) {
    console.warn('[audit-queue-ui]', error);
    return;
  }

  latestRows = result.rows || [];

  if (!result.installed) {
    const setup = document.createElement('div');
    setup.id = 'audit-queue-setup';
    setup.className = 'audit-queue-setup';
    setup.innerHTML = '<b>Fila persistente ainda não ativada no banco.</b> A auditoria dinâmica continua funcionando, mas os equipamentos não poderão permanecer destacados entre sessões até a migração do banco ser aplicada.';
    pendingResults.parentElement?.insertBefore(setup, pendingResults);
    return;
  }

  const actionableGroups = groupRows(result.actionable || []);
  const externalGroups = groupRows(result.awaitingOfficial || []);
  const parent = pendingResults.parentElement;
  if (!parent) return;

  const correctionBlock = renderGroupBlock({
    id: 'audit-queue-highlight',
    title: 'Aguardando correção',
    description: 'Estes equipamentos possuem valor inválido ou regra ainda sem classificação. Para uma mecânica real cuja base não é pública, use a ação “É efeito real, mas falta dado oficial” em vez de tratá-la como erro.',
    groups: actionableGroups
  });

  const externalBlock = renderGroupBlock({
    id: 'audit-queue-external',
    title: 'Aguardando dados oficiais',
    description: 'Estes efeitos são reais e estão cadastrados corretamente, mas o jogo não disponibiliza a base necessária para um cálculo confiável. Quando uma fonte oficial aparecer, reabra a classificação para a equipe definir a base e a regra real.',
    groups: externalGroups,
    external: true
  });

  if (correctionBlock) parent.insertBefore(correctionBlock, pendingResults);
  if (externalBlock) parent.insertBefore(externalBlock, pendingResults);

  parent.querySelectorAll('[data-mark-external]').forEach(button => {
    button.addEventListener('click', () => openExternalClassification(button.dataset.markExternal));
  });
  parent.querySelectorAll('[data-reopen-external]').forEach(button => {
    button.addEventListener('click', () => reopenExternalClassification(button.dataset.reopenExternal));
  });
}

await renderQueue();
window.addEventListener('focus', () => renderQueue());
